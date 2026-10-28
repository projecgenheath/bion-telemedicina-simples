import Stripe from "stripe";
import { db } from "@/lib/db";

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
 */

let cliente: Stripe | null = null;

export function stripe(): Stripe {
  if (cliente) return cliente;
  const chave = process.env.STRIPE_SECRET_KEY?.trim();
  if (!chave) throw new Error("STRIPE_SECRET_KEY não configurada.");
  cliente = new Stripe(chave);
  return cliente;
}

export function stripeConnectAtivo(valor = process.env.STRIPE_CONNECT): boolean {
  const v = (valor ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
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

/** true se o evento já foi processado (o webhook deve responder 200 e sair). */
export async function jaProcessado(eventoId: string, d: DbEventos = db as unknown as DbEventos): Promise<boolean> {
  const e = await d.stripeEvento.findUnique({ where: { id: eventoId } });
  return !!e?.processadoEm;
}

/** Marca o evento como processado (chamar só depois de tratar com sucesso). */
export async function marcarEvento(eventoId: string, tipo: string, d: DbEventos = db as unknown as DbEventos, agora = new Date()) {
  await d.stripeEvento.upsert({ where: { id: eventoId }, create: { id: eventoId, tipo, processadoEm: agora }, update: { processadoEm: agora } });
}

// ---------------------------------------------------------------- reembolso

type ReembolsoLinha = {
  id: string;
  status: string;
  valorCentavos: number;
  stripeRefundId: string | null;
  pagamento: { stripePaymentIntentId: string | null } | null;
};

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
  | { enviado: false; motivo: "nao_encontrado" | "status" | "ja_enviado" | "sem_stripe" | "valor_zero" };

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
    select: { id: true, status: true, valorCentavos: true, stripeRefundId: true, pagamento: { select: { stripePaymentIntentId: true } } },
  });
  if (!r) return { enviado: false, motivo: "nao_encontrado" };
  if (r.stripeRefundId) return { enviado: false, motivo: "ja_enviado" };
  if (r.status !== "aprovado") return { enviado: false, motivo: "status" };
  const pi = r.pagamento?.stripePaymentIntentId;
  if (!pi) return { enviado: false, motivo: "sem_stripe" };
  if (r.valorCentavos <= 0) return { enviado: false, motivo: "valor_zero" };

  const s = deps.s ?? stripe();
  const refund = await s.refunds.create(
    { payment_intent: pi, amount: r.valorCentavos, metadata: { reembolsoId: r.id } },
    { idempotencyKey: r.id },
  );
  const final = statusReembolsoDoStripe(refund.status);
  await d.reembolso.update({
    where: { id: r.id },
    data: { stripeRefundId: refund.id, gatewayRef: refund.id, ...(final ? { status: final, processadoEm: deps.agora ?? new Date() } : {}) },
  });
  return { enviado: true, refundId: refund.id, status: refund.status ?? "pending" };
}

type EventoReembolso = { id: string; type: string; data: { object: unknown } };

/**
 * Trata charge.refunded / refund.updated / refund.failed. Fecha o Reembolso
 * em 'processado' ou 'falhou'. Retorna quantos foram atualizados.
 */
export async function registrarEventoReembolsoStripe(
  evento: EventoReembolso,
  deps: { d?: DbReembolso; agora?: Date } = {},
): Promise<number> {
  const d = deps.d ?? (db as unknown as DbReembolso);
  const agora = deps.agora ?? new Date();
  let refunds: { id: string; status: string | null }[] = [];
  if (evento.type === "charge.refunded") {
    const ch = evento.data.object as { refunds?: { data?: { id: string; status: string | null }[] } };
    refunds = ch.refunds?.data ?? [];
  } else if (evento.type === "refund.updated" || evento.type === "refund.failed") {
    const rf = evento.data.object as { id: string; status: string | null };
    refunds = [{ id: rf.id, status: evento.type === "refund.failed" ? "failed" : rf.status }];
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

/** Lista Reembolsos 'aprovado' de pagamento Stripe ainda não enviados. */
export async function reembolsosStripePendentes(limite = 50): Promise<string[]> {
  const linhas = await db.reembolso.findMany({
    where: { status: "aprovado", stripeRefundId: null, pagamento: { stripePaymentIntentId: { not: null } } },
    select: { id: true },
    orderBy: { criadoEm: "asc" },
    take: limite,
  });
  return linhas.map((l) => l.id);
}
