import Stripe from "stripe";
import { db } from "@/lib/db";
import { registrarAudit } from "@/lib/server/auth";
import { bloqueioChaveLive, parteReembolsoSobreMulta, valorReversaoProporcional } from "@/lib/stripe-checkout-logica";

/**
 * Base do Stripe (modo teste). Dono: Admin. Migração 20261028a.
 *
 * - Cliente lazy via STRIPE_SECRET_KEY (nada é criado no import).
 * - STRIPE_CONNECT (padrão off): só com "1"/"true" a cobrança usa conta
 *   conectada do médico (PerfilMedico.stripeAccountId). O cálculo dos 10%
 *   (application_fee_amount) fica no financeiro.ts (Médicos).
 * - Idempotência do webhook: StripeEvento (id = event.id).
 * - Reembolso: o CHECK "Reembolso_status_check" não tem 'enviado'. Por isso
 *   "enviado" = status 'aprovado' com stripeRefundId preenchido; o evento do
 *   Stripe fecha em 'processado' ou 'falhou'.
 * - Modelo 21/11 (20261127b): no modo plataforma, reembolsar a cobrança NÃO
 *   desfaz a TransferenciaMedico já enviada; o envio do refund reverte a
 *   parte do médico com transfers.createReversal proporcional (idempotente,
 *   chave derivada do reembolso.id). A reversão nunca bloqueia o reembolso
 *   do paciente: falhou = auditoria critical para conciliação manual.
 */

let cliente: Stripe | null = null;
let chaveDoCliente: string | null = null;

/**
 * Chave live (sk_live_ / rk_live_) bloqueada em QUALQUER movimento de dinheiro
 * (checkout, reembolso, transferência, refund da application fee, leitura)
 * até o Alisson liberar (Jurídico: faltam CNPJ, RT e conta Stripe live BR).
 * Lançado por stripe() ANTES de qualquer requisição.
 */
export class ChaveLiveBloqueadaError extends Error {
  readonly codigo = "chave_live_bloqueada" as const;
  constructor() {
    super("Chave Stripe live bloqueada: o app só funciona em modo teste até o Alisson liberar.");
    this.name = "ChaveLiveBloqueadaError";
  }
}

/** Lança ChaveLiveBloqueadaError se a chave for live. Use em todo cliente Stripe. */
export function exigirChaveNaoLive(chave: string | undefined = process.env.STRIPE_SECRET_KEY): void {
  if (bloqueioChaveLive("plataforma", chave)) throw new ChaveLiveBloqueadaError();
}

/** Única fábrica do cliente Stripe do app. Confere a chave a cada chamada. */
export function stripe(): Stripe {
  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) throw new Error("STRIPE_SECRET_KEY não configurada.");
  exigirChaveNaoLive(chave);
  if (cliente && chaveDoCliente === chave) return cliente;
  cliente = new Stripe(chave);
  chaveDoCliente = chave;
  return cliente;
}

export function stripeConnectAtivo(valor = process.env.STRIPE_CONNECT): boolean {
  const v = (valor ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export type ModoCobranca = "plataforma" | "direta" | "destino";

/**
 * STRIPE_MODO_COBRANCA (só vale com STRIPE_CONNECT ligado): 'plataforma'
 * (PADRÃO do modelo de 21/11/2026: cobrança na conta da BION e transferência
 * ao médico só depois da consulta realizada) | 'direta' (LEGADO: cobrança na
 * conta do médico com 10% de application fee) | 'destino' (LEGADO).
 */
export function modoCobrancaStripe(valor = process.env.STRIPE_MODO_COBRANCA): ModoCobranca {
  const v = (valor ?? "").trim().toLowerCase();
  return v === "direta" || v === "destino" ? v : "plataforma";
}

export type TipoContaConnect = "standard" | "express";

/**
 * STRIPE_CONNECT_TIPO_CONTA: tipo da conta conectada criada no onboarding do
 * médico (usado pelo onboarding, Médicos PR C). Padrão 'standard'.
 * - standard: conta Stripe completa do médico (Dashboard próprio); o Stripe
 *   fala direto com ele (KYC, disputas). É o tipo recomendado pelo Stripe
 *   para cobrança direta. Onboarding por Account Link (type account_onboarding)
 *   ou OAuth. Recebe transfers da BION (mesma região, BR→BR).
 * - express: Dashboard Express; a BION responde por perdas/saldo negativo e
 *   tem de pedir as capabilities card_payments + transfers. O Stripe não
 *   recomenda cobrança direta com Express v1 (prefere destination charges).
 */
export function tipoContaConnect(valor = process.env.STRIPE_CONNECT_TIPO_CONTA): TipoContaConnect {
  return (valor ?? "").trim().toLowerCase() === "express" ? "express" : "standard";
}

// ---------------------------------------------------------------- eventos

type DbEventos = {
  stripeEvento: {
    findUnique(a: { where: { id: string } }): Promise<{ processadoEm: Date | null } | null>;
    upsert(a: {
      where: { id: string };
      create: { id: string; tipo: string; processadoEm: Date };
      update: { processadoEm: Date };
    }): Promise<unknown>;
  };
};

type DbClaim = {
  stripeEvento: {
    create(a: { data: { id: string; tipo: string; processadoEm: Date } }): Promise<unknown>;
    delete(a: { where: { id: string } }): Promise<unknown>;
  };
};

function codigoPrisma(e: unknown): string | undefined {
  return typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

/**
 * Reivindica o evento ANTES de processar (id único em StripeEvento).
 * true = este worker processa; false = já reivindicado (P2002), responder 200 e sair.
 * Se o processamento falhar, chame liberarEvento(id) para o Stripe poder reentregar.
 */
export async function reivindicarEvento(eventoId: string, tipo: string, d: DbClaim = db as unknown as DbClaim, agora = new Date()): Promise<boolean> {
  try {
    await d.stripeEvento.create({ data: { id: eventoId, tipo, processadoEm: agora } });
    return true;
  } catch (e) {
    if (codigoPrisma(e) === "P2002") return false;
    throw e;
  }
}

/** Desfaz a reivindicação quando o processamento falhou (ignora P2025 = não encontrado). */
export async function liberarEvento(eventoId: string, d: DbClaim = db as unknown as DbClaim): Promise<void> {
  try {
    await d.stripeEvento.delete({ where: { id: eventoId } });
  } catch (e) {
    if (codigoPrisma(e) !== "P2025") throw e;
  }
}

/** @deprecated Use reivindicarEvento (check-then-act tem corrida). */
export async function jaProcessado(eventoId: string, d: DbEventos = db as unknown as DbEventos): Promise<boolean> {
  const e = await d.stripeEvento.findUnique({ where: { id: eventoId } });
  return !!e?.processadoEm;
}

/** @deprecated Use reivindicarEvento/liberarEvento. */
export async function marcarEvento(eventoId: string, tipo: string, d: DbEventos = db as unknown as DbEventos, agora = new Date()) {
  await d.stripeEvento.upsert({ where: { id: eventoId }, create: { id: eventoId, tipo, processadoEm: agora }, update: { processadoEm: agora } });
}

// ---------------------------------------------------------------- reembolso

type ContaMedico = { medico?: { perfilMedico?: { stripeAccountId: string | null } | null } | null } | null;

type ReembolsoLinha = {
  id: string;
  status: string;
  valorCentavos: number;
  multaCentavos: number;
  stripeRefundId: string | null;
  pagamento: {
    id: string;
    /** Valor total da cobrança em reais (base da reversão proporcional). */
    valor: number;
    stripePaymentIntentId: string | null;
    consulta?: ContaMedico;
    /** Renovação de receita: Pagamento sem consulta, médico vem do PedidoRenovacao.medicoId. */
    pedidoRenovacao?: ContaMedico;
  } | null;
  /** Multa de remarcação: sem Pagamento; o PaymentIntent fica em gatewayRef 'stripe_pi:<id>'. */
  remarcacao?: { id: string; multaCentavos: number; gatewayRef: string | null; consulta?: ContaMedico } | null;
};

const SELECT_CONTA = { select: { medico: { select: { perfilMedico: { select: { stripeAccountId: true } } } } } } as const;

/** Extrai o PaymentIntent de um gatewayRef 'stripe_pi:<id>' (null se não for desse formato). */
export function paymentIntentDoGatewayRef(ref: string | null | undefined): string | null {
  const m = /^stripe_pi:(pi_[A-Za-z0-9_]+)$/.exec((ref ?? "").trim());
  return m ? m[1] : null;
}

type DbReembolso = {
  reembolso: {
    findUnique(a: unknown): Promise<ReembolsoLinha | null>;
    findFirst(a: unknown): Promise<{ id: string; status: string } | null>;
    findMany(a: unknown): Promise<{ stripeReversalValorCentavos: number | null }[]>;
    update(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
  transferenciaMedico: {
    findFirst(a: unknown): Promise<{
      id: string;
      tipo: string;
      liquidoCentavos: number;
      multasCentavos: number;
      stripeTransferId: string | null;
    } | null>;
  };
};

type StripeRefunds = {
  refunds: {
    create(p: Stripe.RefundCreateParams, o?: Stripe.RequestOptions): Promise<{ id: string; status: string | null }>;
  };
  transfers: {
    createReversal(
      transferId: string,
      p: { amount: number; metadata?: Record<string, string> },
      o?: { idempotencyKey?: string },
    ): Promise<{ id: string }>;
  };
};

export type ResultadoEnvio =
  | {
      enviado: true;
      refundId: string;
      status: string;
      /** Só no modo plataforma com TransferenciaMedico enviada (modelo 21/11). */
      reversao?: { ok: true; reversalId: string; valorCentavos: number } | { ok: false; erro: string };
    }
  | { enviado: false; motivo: "nao_encontrado" | "status" | "ja_enviado" | "sem_stripe" | "valor_zero" | "sem_conta_medico"; erro?: string };

/** Status do refund no Stripe → status do Reembolso (null = ainda pendente). */
export function statusReembolsoDoStripe(status: string | null | undefined): "processado" | "falhou" | null {
  if (status === "succeeded") return "processado";
  if (status === "failed" || status === "canceled") return "falhou";
  return null;
}

/**
 * Envia ao Stripe um Reembolso 'aprovado' de pagamento Stripe.
 * Idempotency-Key = reembolso.id: repetir nunca cria dois refunds.
 *
 * Modelo 21/11 (modo plataforma): depois do refund, se existe
 * TransferenciaMedico ENVIADA da mesma cobrança/multa, reverte a parte do
 * médico com transfers.createReversal proporcional ao valor reembolsado
 * (Idempotency-Key derivada do reembolso.id; o id e o valor da reversão
 * ficam no Reembolso, migração 20261127b). O reembolso ao paciente nunca
 * espera a reversão: se ela falhar (ex.: médico já sacou e o Stripe não
 * consegue debitar), o refund segue enviado e a falha vira auditoria
 * critical para conciliação manual.
 */
export async function enviarReembolsoStripe(
  reembolsoId: string,
  deps: { d?: DbReembolso; s?: StripeRefunds; agora?: Date; connect?: boolean; modo?: ModoCobranca; audit?: typeof registrarAudit } = {},
): Promise<ResultadoEnvio> {
  const d = deps.d ?? (db as unknown as DbReembolso);
  const r = await d.reembolso.findUnique({
    where: { id: reembolsoId },
    select: {
      id: true, status: true, valorCentavos: true, multaCentavos: true, stripeRefundId: true,
      pagamento: { select: { id: true, valor: true, stripePaymentIntentId: true, consulta: SELECT_CONTA, pedidoRenovacao: SELECT_CONTA } },
      remarcacao: { select: { id: true, multaCentavos: true, gatewayRef: true, consulta: SELECT_CONTA } },
    },
  });
  if (!r) return { enviado: false, motivo: "nao_encontrado" };
  if (r.stripeRefundId) return { enviado: false, motivo: "ja_enviado" };
  if (r.status !== "aprovado") return { enviado: false, motivo: "status" };
  // Consulta/renovação: PI no Pagamento. Multa de remarcação: PI no gatewayRef da RemarcacaoPendente.
  const pi = r.pagamento?.stripePaymentIntentId ?? (r.pagamento ? null : paymentIntentDoGatewayRef(r.remarcacao?.gatewayRef));
  if (!pi) return { enviado: false, motivo: "sem_stripe" };
  if (r.valorCentavos <= 0) return { enviado: false, motivo: "valor_zero" };

  const connect = deps.connect ?? stripeConnectAtivo();
  const modo: ModoCobranca = connect ? (deps.modo ?? modoCobrancaStripe()) : "plataforma";
  const params: Stripe.RefundCreateParams = { payment_intent: pi, amount: r.valorCentavos, metadata: { reembolsoId: r.id } };
  const opcoes: Stripe.RequestOptions = { idempotencyKey: r.id };
  if (modo === "direta") {
    const conta = (r.pagamento
      ? r.pagamento.consulta?.medico?.perfilMedico?.stripeAccountId ?? r.pagamento.pedidoRenovacao?.medico?.perfilMedico?.stripeAccountId
      : r.remarcacao?.consulta?.medico?.perfilMedico?.stripeAccountId)?.trim();
    if (!conta) {
      const erro = `Reembolso ${r.id}: Connect ativo (modo 'direta') mas o médico não tem stripeAccountId; refund não enviado.`;
      console.error("[stripe reembolso]", erro);
      return { enviado: false, motivo: "sem_conta_medico", erro };
    }
    params.refund_application_fee = true;
    opcoes.stripeAccount = conta;
  } else if (modo === "destino") {
    params.reverse_transfer = true;
    params.refund_application_fee = true;
  }

  const s = deps.s ?? stripe();
  const refund = await s.refunds.create(params, opcoes);
  const final = statusReembolsoDoStripe(refund.status);
  await d.reembolso.update({
    where: { id: r.id },
    data: { stripeRefundId: refund.id, gatewayRef: refund.id, ...(final ? { status: final, processadoEm: deps.agora ?? new Date() } : {}) },
  });
  const resultado = { enviado: true as const, refundId: refund.id, status: refund.status ?? "pending" };
  if (modo !== "plataforma") return resultado;

  // Reversão da parte do médico (modelo 21/11): a cobrança nasceu na conta
  // da plataforma e reembolsar a cobrança NÃO desfaz a TransferenciaMedico
  // já enviada. Sem a reversão o médico fica com o dinheiro e a plataforma
  // absorve o reembolso inteiro (os termos 9.3/10.3/10.12 prometem a
  // reversão). Proporcional ao valor reembolsado, idempotente pela chave
  // derivada do reembolso.id. O refund do paciente já foi gravado acima:
  // a reversão nunca o bloqueia nem o desfaz.
  const t = await d.transferenciaMedico.findFirst({
    where: {
      status: "enviada",
      OR: [
        ...(r.pagamento ? [{ pagamentoId: r.pagamento.id }] : []),
        ...(r.remarcacao ? [{ remarcacaoId: r.remarcacao.id }] : []),
      ],
    },
    select: { id: true, tipo: true, liquidoCentavos: true, multasCentavos: true, stripeTransferId: true },
  });
  if (!t?.stripeTransferId) return resultado;

  // Base da proporção: o pagamento inteiro (consulta/multa de cancelamento)
  // ou a multa cobrada (multa de remarcação, sem Pagamento).
  const base = r.pagamento ? Math.round((r.pagamento.valor ?? 0) * 100) : (r.remarcacao?.multaCentavos ?? 0);
  let valorSobre = r.valorCentavos;
  let baseProporcional = base;
  if (t.tipo === "multa_cancelamento") {
    // A transferência nasceu da multa RETIDA, não da parte devolvida ao
    // paciente no cancelamento (regra 7): o reembolso automático do
    // cancelamento não reverte nada; só o que consome a multa reverte.
    // multaCentavos do próprio reembolso é exato; sem ele (reembolso
    // posterior), reconstrói pela metade do médico (±1 centavo em multa
    // ímpar, arredondamento do divisaoDaMulta).
    const multaTotal = r.multaCentavos > 0 ? r.multaCentavos : 2 * t.multasCentavos;
    valorSobre = parteReembolsoSobreMulta({ valorReembolsoCentavos: r.valorCentavos, valorBaseCentavos: base, multaCentavos: multaTotal });
    baseProporcional = multaTotal;
  }
  // Reembolsos anteriores da mesma cobrança/multa já revertidos: a soma
  // limita a reversão ao líquido que ainda está com o médico.
  const irmaos = await d.reembolso.findMany({
    where: {
      id: { not: r.id },
      stripeReversalValorCentavos: { not: null },
      ...(r.pagamento ? { pagamentoId: r.pagamento.id } : { remarcacaoId: r.remarcacao?.id }),
    },
    select: { stripeReversalValorCentavos: true },
  });
  const jaRevertido = irmaos.reduce((soma, x) => soma + (x.stripeReversalValorCentavos ?? 0), 0);
  const valor = valorReversaoProporcional({
    liquidoCentavos: t.liquidoCentavos,
    valorReembolsoCentavos: valorSobre,
    valorBaseCentavos: baseProporcional,
    jaRevertidoCentavos: jaRevertido,
  });
  if (valor <= 0) return resultado;

  const audit = deps.audit ?? registrarAudit;
  try {
    const reversao = await s.transfers.createReversal(
      t.stripeTransferId,
      { amount: valor, metadata: { reembolsoId: r.id, transferenciaMedicoId: t.id } },
      { idempotencyKey: `reversao-reembolso-${r.id}` },
    );
    await d.reembolso.update({
      where: { id: r.id },
      data: { stripeReversalId: reversao.id, stripeReversalValorCentavos: valor },
    });
    await audit(null, {
      acao: "REEMBOLSO_REVERSAO_ENVIADA",
      categoria: "pagamento",
      entidade: "reembolso",
      entidadeId: r.id,
      detalhes: `Reversão de ${valor} centavos da transferência ${t.stripeTransferId} (${reversao.id}) no reembolso ${refund.id}`,
    });
    return { ...resultado, reversao: { ok: true, reversalId: reversao.id, valorCentavos: valor } };
  } catch (e) {
    // Ex.: médico já sacou; saldo negativo na conta conectada ou reversão
    // recusada. O paciente já foi reembolsado: a perda fica na plataforma
    // até conciliação manual (auditoria critical).
    const msg = (e instanceof Error ? e.message : "erro").slice(0, 300);
    console.error("[stripe reembolso] reversão da transferência falhou:", msg);
    await audit(null, {
      acao: "REEMBOLSO_REVERSAO_FALHOU",
      categoria: "pagamento",
      severidade: "critical",
      entidade: "reembolso",
      entidadeId: r.id,
      detalhes: `Reembolso ${refund.id} enviado ao paciente, mas a reversão da transferência ${t.stripeTransferId} falhou: ${msg}. Conciliação manual necessária.`,
    });
    return { ...resultado, reversao: { ok: false, erro: msg } };
  }
}

type EventoReembolso = { id: string; type: string; account?: string | null; data: { object: unknown } };
type RefundEv = { id: string; status: string | null; charge?: unknown };
type StripeRefundsList = {
  refunds: { list(p: Stripe.RefundListParams, o?: Stripe.RequestOptions): Promise<{ data: RefundEv[] }> };
};

/**
 * Fonte principal: refund.created / refund.updated / refund.failed (objeto refund).
 * charge.refunded é complementar; se refunds.data vier vazio/ausente, busca
 * refunds.list({ charge }) (com stripeAccount se o evento tiver account).
 * Fecha o Reembolso em 'processado' ou 'falhou'. Retorna quantos foram atualizados.
 */
export async function registrarEventoReembolsoStripe(
  evento: EventoReembolso,
  deps: { d?: DbReembolso; s?: StripeRefundsList; agora?: Date } = {},
): Promise<number> {
  const d = deps.d ?? (db as unknown as DbReembolso);
  const agora = deps.agora ?? new Date();
  let refunds: { id: string; status: string | null }[] = [];
  if (evento.type === "refund.created" || evento.type === "refund.updated" || evento.type === "refund.failed") {
    const rf = evento.data.object as RefundEv;
    if (!rf?.id) return 0;
    refunds = [{ id: rf.id, status: evento.type === "refund.failed" ? "failed" : rf.status }];
  } else if (evento.type === "charge.refunded") {
    const ch = evento.data.object as { id?: string; refunds?: { data?: RefundEv[] } | null };
    refunds = ch.refunds?.data ?? [];
    if (refunds.length === 0 && ch.id) {
      const s = deps.s ?? (stripe() as unknown as StripeRefundsList);
      const lista = await s.refunds.list({ charge: ch.id, limit: 100 }, evento.account ? { stripeAccount: evento.account } : undefined);
      refunds = lista.data;
    }
  } else return 0;

  let n = 0;
  for (const rf of refunds) {
    const final = statusReembolsoDoStripe(rf.status);
    if (!final) continue;
    // Só fecha o que ainda está aberto; 'processado' não volta para 'falhou' por evento atrasado.
    const res = await d.reembolso.updateMany({
      where: { stripeRefundId: rf.id, status: { in: ["aprovado", ...(final === "processado" ? ["falhou"] : [])] } },
      data: { status: final, processadoEm: agora },
    });
    n += res.count;
  }
  return n;
}

/** Lista Reembolsos 'aprovado' de pagamento Stripe (ou multa paga no Stripe) ainda não enviados. */
export async function reembolsosStripePendentes(limite = 50): Promise<string[]> {
  const linhas = await db.reembolso.findMany({
    where: {
      status: "aprovado",
      stripeRefundId: null,
      OR: [
        { pagamento: { stripePaymentIntentId: { not: null } } },
        { pagamentoId: null, remarcacao: { gatewayRef: { startsWith: "stripe_pi:" } } },
      ],
    },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
    take: limite,
  });
  return linhas.map((l) => l.id);
}
