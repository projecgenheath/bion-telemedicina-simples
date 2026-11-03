import type Stripe from "stripe";
import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";
import { modoCobrancaStripe, stripe, stripeConnectAtivo } from "@/lib/server/stripe";
import { moedaCheckout, stripeAtivo } from "@/lib/stripe-checkout-logica";

/**
 * Devolução da taxa do cartão ao médico no reembolso INTEGRAL por falta do
 * paciente (decisão do Alisson, 03/11/2026). Dono: Admin. Migração 20261103b.
 *
 * Na cobrança direta (Connect, modo 'direta') a taxa do Stripe sai da conta do
 * médico e o refund não a devolve. A BION assume a taxa: depois que o refund
 * fecha em 'processado', transfere da plataforma para a conta conectada o
 * valor real da taxa (balance_transaction.fee da charge).
 *
 * - Só roda com BION_PAGAMENTO_STRIPE=true, STRIPE_CONNECT ligado e
 *   STRIPE_MODO_COBRANCA='direta'. Fora disso não faz nada.
 * - Idempotência em duas camadas: linha ReembolsoTaxaMedico com reembolsoId
 *   ÚNICO (webhooks concorrentes: só um cria a linha; P2002 = já existe) e
 *   Idempotency-Key do Stripe derivada do refund id + transfer_group.
 * - Erro do Stripe: grava 'falhou', registra auditoria e relança, para o
 *   webhook liberar o evento e o Stripe reentregar (mesma chave, nunca paga 2x).
 */

export const MOTIVO_FALTA = "falta_paciente";

type Env = Record<string, string | undefined>;

export function devolucaoTaxaAtiva(env: Env = process.env): boolean {
  return stripeAtivo(env) && stripeConnectAtivo(env.STRIPE_CONNECT) && modoCobrancaStripe(env.STRIPE_MODO_COBRANCA) === "direta";
}

export const chaveIdempotenciaTaxa = (refundId: string) => `taxa-reembolso-${refundId}`;

type LinhaReembolso = {
  id: string;
  status: string;
  motivo: string;
  valorCentavos: number;
  multaCentavos: number;
  stripeRefundId: string | null;
  pagamento: {
    valor: number;
    stripePaymentIntentId: string | null;
    stripeTaxaCentavos: number | null;
    consulta: { medico: { perfilMedico: { stripeAccountId: string | null } | null } | null } | null;
  } | null;
};

type LinhaTaxa = { id: string; status: string; stripeTransferId: string | null; valorCentavos: number; contaStripe: string };

export type DbTaxa = {
  reembolso: { findUnique(a: unknown): Promise<LinhaReembolso | null> };
  reembolsoTaxaMedico: {
    create(a: unknown): Promise<LinhaTaxa>;
    findUnique(a: unknown): Promise<LinhaTaxa | null>;
    update(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
};

export type StripeTaxa = {
  transfers: { create(p: Stripe.TransferCreateParams, o?: Stripe.RequestOptions): Promise<{ id: string }> };
  paymentIntents: {
    retrieve(id: string, p?: Stripe.PaymentIntentRetrieveParams, o?: Stripe.RequestOptions): Promise<{
      latest_charge?: string | { balance_transaction?: string | { fee: number } | null } | null;
    }>;
  };
};

type Audit = typeof registrarAudit;

export type ResultadoTaxa =
  | { enviado: true; transferId: string; valorCentavos: number }
  | { enviado: false; motivo: string };

const SELECT = {
  id: true, status: true, motivo: true, valorCentavos: true, multaCentavos: true, stripeRefundId: true,
  pagamento: {
    select: {
      valor: true, stripePaymentIntentId: true, stripeTaxaCentavos: true,
      consulta: { select: { medico: { select: { perfilMedico: { select: { stripeAccountId: true } } } } } },
    },
  },
} as const;

const codigo = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : "erro").slice(0, 300);

/** Taxa real: a gravada (veio da balance_transaction) ou lida agora no Stripe, na conta do médico. */
async function lerTaxa(r: LinhaReembolso, conta: string, s: StripeTaxa): Promise<number | null> {
  const gravada = r.pagamento?.stripeTaxaCentavos;
  if (typeof gravada === "number") return gravada;
  const pi = r.pagamento?.stripePaymentIntentId;
  if (!pi) return null;
  const p = await s.paymentIntents.retrieve(pi, { expand: ["latest_charge.balance_transaction"] }, { stripeAccount: conta });
  const ch = typeof p.latest_charge === "object" ? p.latest_charge : null;
  const bt = ch && typeof ch.balance_transaction === "object" ? ch.balance_transaction : null;
  return bt && typeof bt.fee === "number" ? bt.fee : null;
}

/**
 * Chamar DEPOIS que o refund fechou (webhook). Devolve a taxa ao médico se o
 * reembolso for integral, por falta do paciente, de consulta paga no Stripe.
 */
export async function devolverTaxaAoMedico(
  stripeRefundId: string,
  deps: { d?: DbTaxa; s?: StripeTaxa; env?: Env; agora?: Date; audit?: Audit } = {},
): Promise<ResultadoTaxa> {
  const env = deps.env ?? process.env;
  if (!devolucaoTaxaAtiva(env)) return { enviado: false, motivo: "desligado" };
  const d = deps.d ?? (db as unknown as DbTaxa);
  const audit = deps.audit ?? registrarAudit;

  const r = await d.reembolso.findUnique({ where: { stripeRefundId }, select: SELECT });
  if (!r || !r.pagamento) return { enviado: false, motivo: "nao_encontrado" };
  if (r.status !== "processado") return { enviado: false, motivo: "status" };
  if (r.motivo !== MOTIVO_FALTA) return { enviado: false, motivo: "motivo" };
  if (r.multaCentavos !== 0 || r.valorCentavos !== Math.round(r.pagamento.valor * 100)) return { enviado: false, motivo: "parcial" };
  if (!r.pagamento.consulta) return { enviado: false, motivo: "sem_consulta" };

  const conta = r.pagamento.consulta.medico?.perfilMedico?.stripeAccountId?.trim();
  if (!conta) {
    console.error("[taxa reembolso]", `Reembolso ${r.id}: médico sem stripeAccountId; taxa não devolvida.`);
    await audit(null, { acao: "REEMBOLSO_TAXA_MEDICO_SEM_CONTA", categoria: "pagamento", severidade: "warning", entidade: "reembolso", entidadeId: r.id, detalhes: "Médico sem conta Stripe; taxa do cartão não devolvida" });
    return { enviado: false, motivo: "sem_conta_medico" };
  }

  // Já existe linha? Enviada = nada a fazer. Evita até a leitura da taxa no Stripe.
  let linha = await d.reembolsoTaxaMedico.findUnique({ where: { reembolsoId: r.id } });
  if (linha?.status === "enviado") return { enviado: false, motivo: "ja_enviado" };

  const s = deps.s ?? (stripe() as unknown as StripeTaxa);
  if (!linha) {
    const taxa = await lerTaxa(r, conta, s);
    if (taxa === null || taxa <= 0) {
      console.error("[taxa reembolso]", `Reembolso ${r.id}: taxa do Stripe indisponível; taxa não devolvida.`);
      await audit(null, { acao: "REEMBOLSO_TAXA_MEDICO_SEM_TAXA", categoria: "pagamento", severidade: "warning", entidade: "reembolso", entidadeId: r.id, detalhes: "Taxa do cartão indisponível no Stripe; devolução não feita" });
      return { enviado: false, motivo: "sem_taxa" };
    }
    try {
      linha = await d.reembolsoTaxaMedico.create({ data: { reembolsoId: r.id, contaStripe: conta, valorCentavos: taxa, status: "pendente" } });
    } catch (e) {
      if (codigo(e) !== "P2002") throw e;
      // Outro webhook criou ao mesmo tempo: segue com a linha dele (mesma chave no Stripe).
      linha = await d.reembolsoTaxaMedico.findUnique({ where: { reembolsoId: r.id } });
      if (!linha) throw e;
      if (linha.status === "enviado") return { enviado: false, motivo: "ja_enviado" };
    }
  }

  await d.reembolsoTaxaMedico.update({ where: { id: linha.id }, data: { tentativas: { increment: 1 } } });
  let transfer: { id: string };
  try {
    transfer = await s.transfers.create(
      {
        amount: linha.valorCentavos,
        currency: moedaCheckout(env),
        destination: linha.contaStripe,
        transfer_group: `reembolso_${r.id}`,
        description: "BION: devolução da taxa do cartão (reembolso por falta do paciente)",
        metadata: { reembolsoId: r.id, refundId: stripeRefundId, tipo: "taxa_reembolso_falta" },
      },
      { idempotencyKey: chaveIdempotenciaTaxa(stripeRefundId) },
    );
  } catch (e) {
    const msg = mensagem(e);
    console.error("[taxa reembolso]", `Reembolso ${r.id}: transferência falhou:`, msg);
    await d.reembolsoTaxaMedico.updateMany({ where: { id: linha.id, status: { not: "enviado" } }, data: { status: "falhou", erro: msg } });
    await audit(null, { acao: "REEMBOLSO_TAXA_MEDICO_FALHOU", categoria: "pagamento", severidade: "warning", entidade: "reembolso", entidadeId: r.id, detalhes: "Transferência da taxa ao médico falhou; será tentada de novo na reentrega do webhook" });
    throw e;
  }

  const res = await d.reembolsoTaxaMedico.updateMany({
    where: { id: linha.id, status: { not: "enviado" } },
    data: { status: "enviado", stripeTransferId: transfer.id, erro: null, enviadoEm: deps.agora ?? new Date() },
  });
  if (res.count === 1) {
    await audit(null, {
      acao: "REEMBOLSO_TAXA_MEDICO_DEVOLVIDA",
      categoria: "pagamento",
      entidade: "reembolso",
      entidadeId: r.id,
      detalhes: `Taxa do cartão devolvida ao médico: ${linha.valorCentavos} centavos (transferência ${transfer.id})`,
    });
  }
  return { enviado: true, transferId: transfer.id, valorCentavos: linha.valorCentavos };
}

/** Refund ids de um evento de reembolso do Stripe (refund.* ou charge.refunded). */
export function refundsDoEvento(evento: { type: string; data: { object: unknown } }): string[] {
  if (evento.type === "refund.created" || evento.type === "refund.updated") {
    const id = (evento.data.object as { id?: string })?.id;
    return id ? [id] : [];
  }
  if (evento.type === "charge.refunded") {
    const ch = evento.data.object as { refunds?: { data?: { id: string }[] } | null };
    return (ch.refunds?.data ?? []).map((x) => x.id).filter(Boolean);
  }
  return [];
}
