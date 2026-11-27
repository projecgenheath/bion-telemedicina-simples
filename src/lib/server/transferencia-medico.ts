import "server-only";
import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";
import { ajustarDescontoChargeback } from "@/lib/server/chargeback";
import { modoCobrancaStripe, paymentIntentDoGatewayRef, stripe, stripeConnectAtivo } from "@/lib/server/stripe";
import { moedaCheckout, bloqueioChaveLive, stripeAtivo } from "@/lib/stripe-checkout-logica";

/**
 * Envio da TransferenciaMedico ao Stripe (modelo de 21/11/2026). Dono: Admin.
 *
 * A cobrança nasce na conta da PLATAFORMA no ato da marcação; nada é creditado
 * ao médico no pagamento. A linha TransferenciaMedico é criada no desfecho
 * (financeiro.ts: consulta realizada e metades das multas) com status
 * "pendente". Este arquivo envia a transferência de verdade:
 *
 * - só com BION_PAGAMENTO_STRIPE=true, STRIPE_CONNECT ligado e
 *   STRIPE_MODO_COBRANCA='plataforma' (nos modos 'direta'/'destino' o dinheiro
 *   já caiu na conta do médico: transferir de novo pagaria em dobro);
 * - source_transaction = charge da cobrança original. No Brasil o saldo fica
 *   pendente ~30 dias e a transferência com source_transaction é o caminho
 *   obrigatório; sem a charge, o Stripe recusa;
 * - idempotência em duas camadas: Idempotency-Key derivada da linha e busca
 *   prévia no transfer_group (a chave do Stripe expira em 24 h; se a
 *   transferência saiu e a linha não chegou a "enviada", reaproveita);
 * - erro do Stripe: grava "falhou" com a mensagem, conta a tentativa e segue;
 *   o cron tenta de novo (até 10 tentativas).
 * - taxas de chargeback (alternativa B de 27/11, 20261127c): dívidas do médico
 *   em disputas perdidas são abatidas aqui antes do envio
 *   (ajustarDescontoChargeback); líquido todo consumido = status "descontada",
 *   sem transferência no Stripe.
 *
 * Chave live: a fábrica `stripe()` lança ChaveLiveBloqueadaError; aqui o erro é
 * convertido em "não enviado" para o cron não quebrar. Nada é enviado com
 * chave live enquanto a trava existir.
 */

type Env = Record<string, string | undefined>;

export function transferenciaAtiva(env: Env = process.env): boolean {
  return (
    stripeAtivo(env) &&
    stripeConnectAtivo(env.STRIPE_CONNECT) &&
    modoCobrancaStripe(env.STRIPE_MODO_COBRANCA) === "plataforma" &&
    env.BION_PAGAMENTO_RETIDO === "1" &&
    !bloqueioChaveLive("plataforma", env.STRIPE_SECRET_KEY)
  );
}

type LinhaTransferencia = {
  id: string;
  tipo: string;
  status: string;
  liquidoCentavos: number;
  descontoChargebackCentavos: number;
  medicoId: string;
  consultaId: string | null;
  remarcacaoId: string | null;
  pagamento: { stripeChargeId: string | null; stripePaymentIntentId: string | null } | null;
  remarcacao: { gatewayRef: string | null } | null;
  medico: { perfilMedico: { stripeAccountId: string | null } | null } | null;
};

export type StripeTransferencia = {
  transfers: {
    create(p: {
      amount: number;
      currency: string;
      destination: string;
      transfer_group?: string;
      source_transaction?: string;
      description?: string;
      metadata?: Record<string, string>;
    }, o?: { idempotencyKey?: string }): Promise<{ id: string }>;
    list(p: { transfer_group: string; limit: number }): Promise<{
      data: { id: string; metadata?: Record<string, string> | null }[];
    }>;
  };
  paymentIntents: {
    retrieve(id: string, p?: { expand?: string[] }): Promise<{
      latest_charge?: string | { id: string } | null;
    }>;
  };
};

type DbTransferencia = {
  transferenciaMedico: {
    findUnique(a: unknown): Promise<LinhaTransferencia | null>;
    findMany(a: unknown): Promise<{ id: string }[]>;
    update(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
};

type Audit = typeof registrarAudit;

export type ResultadoTransferencia =
  | { enviado: true; transferId: string; valorCentavos: number }
  | { enviado: false; motivo: string };

const codigo = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "");
const mensagem = (e: unknown) => (e instanceof Error ? e.message : "erro").slice(0, 300);

const SELECT = {
  id: true,
  tipo: true,
  status: true,
  liquidoCentavos: true,
  descontoChargebackCentavos: true,
  medicoId: true,
  consultaId: true,
  remarcacaoId: true,
  pagamento: { select: { stripeChargeId: true, stripePaymentIntentId: true } },
  remarcacao: { select: { gatewayRef: true } },
  medico: { select: { perfilMedico: { select: { stripeAccountId: true } } } },
} as const;

/** Charge de origem (source_transaction). Sem ela, o Stripe recusa saldo pendente no BR. */
async function chargeDaOrigem(l: LinhaTransferencia, s: StripeTransferencia): Promise<string | null> {
  const gravada = l.pagamento?.stripeChargeId?.trim();
  if (gravada) return gravada;
  const pi =
    l.pagamento?.stripePaymentIntentId?.trim() ??
    (l.remarcacao?.gatewayRef ? paymentIntentDoGatewayRef(l.remarcacao.gatewayRef) : null);
  if (!pi) return null;
  const p = await s.paymentIntents.retrieve(pi, { expand: ["latest_charge"] });
  const ch = p.latest_charge;
  return typeof ch === "string" ? ch : ch?.id ?? null;
}

/**
 * Envia UMA linha. Idempotente. Nunca lança: devolve o motivo da falha.
 */
export async function enviarTransferencia(
  linhaId: string,
  deps: { d?: DbTransferencia; s?: StripeTransferencia; env?: Env; agora?: Date; audit?: Audit; ajustarDesconto?: typeof ajustarDescontoChargeback } = {},
): Promise<ResultadoTransferencia> {
  const env = deps.env ?? process.env;
  if (!transferenciaAtiva(env)) return { enviado: false, motivo: "desligado" };
  const d = deps.d ?? (db as unknown as DbTransferencia);
  const audit = deps.audit ?? registrarAudit;

  const l = await d.transferenciaMedico.findUnique({ where: { id: linhaId }, select: SELECT });
  if (!l) return { enviado: false, motivo: "nao_encontrada" };
  if (l.status === "enviada") return { enviado: false, motivo: "ja_enviada" };
  if (l.liquidoCentavos <= 0) return { enviado: false, motivo: "zero" };

  const conta = l.medico?.perfilMedico?.stripeAccountId?.trim();
  if (!conta) {
    await d.transferenciaMedico.updateMany({
      where: { id: l.id, status: { not: "enviada" } },
      data: { status: "falhou", erro: "medico_sem_conta_stripe", tentativas: { increment: 1 } },
    });
    await audit(null, {
      acao: "TRANSFERENCIA_MEDICO_SEM_CONTA",
      categoria: "pagamento",
      severidade: "warning",
      entidade: "transferencia_medico",
      entidadeId: l.id,
      detalhes: "Médico sem conta Stripe; transferência não enviada",
    });
    return { enviado: false, motivo: "sem_conta_medico" };
  }

  let s: StripeTransferencia;
  try {
    s = deps.s ?? (stripe() as unknown as StripeTransferencia);
  } catch (e) {
    // Chave live bloqueada ou Stripe não configurado: não envia e não quebra o cron.
    return { enviado: false, motivo: mensagem(e) };
  }

  // Taxas de chargeback (alternativa B de 27/11): abate as dívidas do médico
  // ANTES do envio; o desconto fica gravado na linha (retentativa não desconta
  // duas vezes). Líquido todo consumido = nada a transferir ("descontada").
  const desconto = await (deps.ajustarDesconto ?? ajustarDescontoChargeback)(l.id, l.medicoId, l.liquidoCentavos);
  const valorEnviar = l.liquidoCentavos - desconto;
  const agora = deps.agora ?? new Date();
  if (valorEnviar <= 0) {
    await d.transferenciaMedico.updateMany({
      where: { id: l.id, status: { not: "enviada" } },
      data: { status: "descontada", enviadaEm: agora, erro: null },
    });
    await audit(null, {
      acao: "TRANSFERENCIA_MEDICO_DESCONTADA",
      categoria: "pagamento",
      entidade: "transferencia_medico",
      entidadeId: l.id,
      detalhes: `Líquido de ${l.liquidoCentavos} centavos todo consumido por taxas de chargeback; nada a transferir`,
    });
    return { enviado: false, motivo: "zero" };
  }

  const grupo = `transferencia_${l.id}`;
  await d.transferenciaMedico.update({ where: { id: l.id }, data: { tentativas: { increment: 1 } } });

  let transfer: { id: string };
  try {
    const existentes = await s.transfers.list({ transfer_group: grupo, limit: 10 });
    const anterior = existentes.data.find((t) => t.metadata?.transferenciaMedicoId === l.id);
    if (anterior) {
      transfer = anterior;
    } else {
      const source = await chargeDaOrigem(l, s);
      if (!source) {
        await d.transferenciaMedico.updateMany({
          where: { id: l.id, status: { not: "enviada" } },
          data: { status: "falhou", erro: "charge_de_origem_ausente" },
        });
        await audit(null, {
          acao: "TRANSFERENCIA_MEDICO_SEM_CHARGE",
          categoria: "pagamento",
          severidade: "warning",
          entidade: "transferencia_medico",
          entidadeId: l.id,
          detalhes: "Cobrança sem charge de origem; transferência não enviada",
        });
        return { enviado: false, motivo: "sem_charge" };
      }
      transfer = await s.transfers.create(
        {
          amount: valorEnviar,
          currency: moedaCheckout(env),
          destination: conta,
          transfer_group: grupo,
          source_transaction: source,
          description: "BION: repasse da consulta (90% menos a taxa do cartão)",
          metadata: {
            transferenciaMedicoId: l.id,
            tipo: l.tipo,
            ...(l.consultaId ? { consultaId: l.consultaId } : {}),
            ...(l.remarcacaoId ? { remarcacaoId: l.remarcacaoId } : {}),
          },
        },
        { idempotencyKey: `transferencia-medico-${l.id}` },
      );
    }
  } catch (e) {
    const msg = mensagem(e);
    const semSaldo = codigo(e) === "balance_insufficient";
    await d.transferenciaMedico.updateMany({
      where: { id: l.id, status: { not: "enviada" } },
      data: { status: "falhou", erro: msg },
    });
    await audit(null, {
      acao: semSaldo ? "TRANSFERENCIA_MEDICO_SALDO_INSUFICIENTE" : "TRANSFERENCIA_MEDICO_FALHOU",
      categoria: "pagamento",
      severidade: semSaldo ? "critical" : "warning",
      entidade: "transferencia_medico",
      entidadeId: l.id,
      detalhes: semSaldo
        ? "Saldo da plataforma insuficiente para transferir ao médico; recarregar e tentar de novo"
        : `Transferência ao médico falhou: ${msg}`,
    });
    return { enviado: false, motivo: msg };
  }

  const res = await d.transferenciaMedico.updateMany({
    where: { id: l.id, status: { not: "enviada" } },
    data: { status: "enviada", stripeTransferId: transfer.id, enviadaEm: agora, erro: null },
  });
  if (res.count === 1) {
    await audit(null, {
      acao: "TRANSFERENCIA_MEDICO_ENVIADA",
      categoria: "pagamento",
      entidade: "transferencia_medico",
      entidadeId: l.id,
      detalhes: `Transferência de ${valorEnviar} centavos enviada ao médico (${transfer.id})${desconto > 0 ? `; desconto de taxas de chargeback: ${desconto}` : ""}`,
    });
  }
  return { enviado: true, transferId: transfer.id, valorCentavos: valorEnviar };
}

/**
 * Job: envia as transferências pendentes/falhadas (até 10 tentativas).
 * Roda no cron espera-medico (a cada minuto), na mesma chamada dos
 * reembolsos automáticos.
 */
export async function enviarTransferenciasPendentes(limite = 10): Promise<{ enviadas: number; falhas: number }> {
  if (!transferenciaAtiva()) return { enviadas: 0, falhas: 0 };
  const linhas = await db.transferenciaMedico.findMany({
    where: {
      status: { in: ["pendente", "falhou"] },
      liquidoCentavos: { gt: 0 },
      tentativas: { lt: 10 },
    },
    select: { id: true },
    orderBy: { criadaEm: "asc" },
    take: limite,
  });
  let enviadas = 0;
  let falhas = 0;
  for (const l of linhas) {
    const r = await enviarTransferencia(l.id);
    if (r.enviado) enviadas++;
    else if (r.motivo !== "ja_enviada" && r.motivo !== "zero") falhas++;
  }
  return { enviadas, falhas };
}
