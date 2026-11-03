import Stripe from "stripe";
import { db } from "@/lib/db";

/**
 * Base do Stripe (modo teste). Dono: Admin. Migração 20261028a.
 *
 * - Cliente lazy via STRIPE_SECRET_KEY (nada é criado no import).
 * - Modo único "plataforma" (decisão do Alisson, 03/11 10:49): o Stripe é só
 *   o gateway paciente → BION. Médico não tem conta Stripe; o repasse é por
 *   PIX no fim do dia (financeiro.ts / repasse.ts). Sem Stripe Connect, sem
 *   cobrança direta nem de destino.
 * - Idempotência do webhook: StripeEvento (id = event.id).
 * - Reembolso: o CHECK "Reembolso_status_check" não tem 'enviado'. Por isso
 *   "enviado" = status 'aprovado' com stripeRefundId preenchido; o evento do
 *   Stripe fecha em 'processado' ou 'falhou'.
 */

let cliente: Stripe | null = null;

export function stripe(): Stripe {
  if (cliente) return cliente;
  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) throw new Error("STRIPE_SECRET_KEY não configurada.");
  cliente = new Stripe(chave);
  return cliente;
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

type ReembolsoLinha = {
  id: string;
  status: string;
  valorCentavos: number;
  stripeRefundId: string | null;
  pagamento: {
    stripePaymentIntentId: string | null;
  } | null;
  /** Multa de remarcação: sem Pagamento; o PaymentIntent fica em gatewayRef 'stripe_pi:<id>'. */
  remarcacao?: { gatewayRef: string | null } | null;
};

/** Extrai o PaymentIntent de um gatewayRef 'stripe_pi:<id>' (null se não for desse formato). */
export function paymentIntentDoGatewayRef(ref: string | null | undefined): string | null {
  const m = /^stripe_pi:(pi_[A-Za-z0-9_]+)$/.exec((ref ?? "").trim());
  return m ? m[1] : null;
}

type DbReembolso = {
  reembolso: {
    findUnique(a: unknown): Promise<ReembolsoLinha | null>;
    findFirst(a: unknown): Promise<{ id: string; status: string } | null>;
    update(a: unknown): Promise<unknown>;
    updateMany(a: unknown): Promise<{ count: number }>;
  };
};

type StripeRefunds = {
  refunds: {
    create(p: Stripe.RefundCreateParams, o?: Stripe.RequestOptions): Promise<{ id: string; status: string | null }>;
  };
};

export type ResultadoEnvio =
  | { enviado: true; refundId: string; status: string }
  | { enviado: false; motivo: "nao_encontrado" | "status" | "ja_enviado" | "sem_stripe" | "valor_zero"; erro?: string };

/** Status do refund no Stripe → status do Reembolso (null = ainda pendente). */
export function statusReembolsoDoStripe(status: string | null | undefined): "processado" | "falhou" | null {
  if (status === "succeeded") return "processado";
  if (status === "failed" || status === "canceled") return "falhou";
  return null;
}

/**
 * Envia ao Stripe um Reembolso 'aprovado' de pagamento Stripe.
 * Idempotency-Key = reembolso.id: repetir nunca cria dois refunds.
 */
export async function enviarReembolsoStripe(
  reembolsoId: string,
  deps: { d?: DbReembolso; s?: StripeRefunds; agora?: Date } = {},
): Promise<ResultadoEnvio> {
  const d = deps.d ?? (db as unknown as DbReembolso);
  const r = await d.reembolso.findUnique({
    where: { id: reembolsoId },
    select: {
      id: true, status: true, valorCentavos: true, stripeRefundId: true,
      pagamento: { select: { stripePaymentIntentId: true } },
      remarcacao: { select: { gatewayRef: true } },
    },
  });
  if (!r) return { enviado: false, motivo: "nao_encontrado" };
  if (r.stripeRefundId) return { enviado: false, motivo: "ja_enviado" };
  if (r.status !== "aprovado") return { enviado: false, motivo: "status" };
  // Consulta/renovação: PI no Pagamento. Multa de remarcação: PI no gatewayRef da RemarcacaoPendente.
  const pi = r.pagamento?.stripePaymentIntentId ?? (r.pagamento ? null : paymentIntentDoGatewayRef(r.remarcacao?.gatewayRef));
  if (!pi) return { enviado: false, motivo: "sem_stripe" };
  if (r.valorCentavos <= 0) return { enviado: false, motivo: "valor_zero" };

  const params: Stripe.RefundCreateParams = { payment_intent: pi, amount: r.valorCentavos, metadata: { reembolsoId: r.id } };
  const opcoes: Stripe.RequestOptions = { idempotencyKey: r.id };

  const s = deps.s ?? stripe();
  const refund = await s.refunds.create(params, opcoes);
  const final = statusReembolsoDoStripe(refund.status);
  await d.reembolso.update({
    where: { id: r.id },
    data: { stripeRefundId: refund.id, gatewayRef: refund.id, ...(final ? { status: final, processadoEm: deps.agora ?? new Date() } : {}) },
  });
  return { enviado: true, refundId: refund.id, status: refund.status ?? "pending" };
}

type EventoReembolso = { id: string; type: string; data: { object: unknown } };
type RefundEv = { id: string; status: string | null; charge?: unknown };
type StripeRefundsList = {
  refunds: { list(p: Stripe.RefundListParams, o?: Stripe.RequestOptions): Promise<{ data: RefundEv[] }> };
};

/**
 * Fonte principal: refund.created / refund.updated / refund.failed (objeto refund).
 * charge.refunded é complementar; se refunds.data vier vazio/ausente, busca
 * refunds.list({ charge }).
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
      const lista = await s.refunds.list({ charge: ch.id, limit: 100 }, undefined);
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
