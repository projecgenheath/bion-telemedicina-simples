import "server-only";
import crypto from "crypto";
import { db } from "@/lib/db";

/* ------------------------------------------------------------------ */
/* Pagamentos — confirmação EXCLUSIVAMENTE server-side                 */
/*                                                                     */
/* O cliente NUNCA define `pago`. A cobrança nasce "pendente" e é      */
/* confirmada por:                                                     */
/*  1) webhook do gateway real — POST /api/pagamentos/webhook com      */
/*     assinatura HMAC-SHA256 (BION_PAGAMENTO_WEBHOOK_SECRET); ou      */
/*  2) gateway simulado (demonstração) — o próprio servidor confirma   */
/*     pela mesma função abaixo quando NÃO há segredo configurado.     */
/* ------------------------------------------------------------------ */

export type MetodoPagamento = "pix" | "cartao";

export type PagamentoWire = {
  id: string;
  consultaId: string;
  valor: number;
  metodo: string;
  status: string;
  via: string;
  criadoEm: string;
  confirmadoEm: string | null;
};

/** Cria a cobrança pendente de uma consulta (idempotente por consulta). */
export async function criarCobranca(
  consultaId: string,
  valor: number,
  metodo: MetodoPagamento,
  gatewayRef?: string,
) {
  const existente = await db.pagamento.findUnique({ where: { consultaId } });
  if (existente) return existente;
  return db.pagamento.create({
    data: {
      consultaId,
      valor: Math.max(0, Math.round(valor * 100) / 100),
      metodo,
      status: "pendente",
      via: "webhook",
      ...(gatewayRef ? { gatewayRef } : {}),
    },
  });
}

/** Confirma um pagamento (idempotente): marca confirmado e paga a consulta. */
export async function confirmarPagamento(pagamentoId: string, via: "webhook" | "simulado") {
  const p = await db.pagamento.findUnique({
    where: { id: pagamentoId },
    include: { consulta: true },
  });
  if (!p) return null;
  if (p.status === "confirmado") return p; // reentrega do webhook: no-op
  await db.$transaction([
    db.pagamento.update({
      where: { id: p.id },
      data: { status: "confirmado", via, confirmadoEm: new Date() },
    }),
    db.consulta.update({ where: { id: p.consultaId }, data: { pago: true } }),
  ]);
  return db.pagamento.findUnique({ where: { id: p.id } });
}

/** Registra falha de pagamento (idempotente). */
export async function falharPagamento(pagamentoId: string, via: "webhook" | "simulado") {
  const p = await db.pagamento.findUnique({ where: { id: pagamentoId } });
  if (!p || p.status !== "pendente") return p;
  return db.pagamento.update({ where: { id: p.id }, data: { status: "falhou", via } });
}

export function paraWire(p: {
  id: string;
  consultaId: string;
  valor: number;
  metodo: string;
  status: string;
  via: string;
  criadoEm: Date;
  confirmadoEm: Date | null;
}): PagamentoWire {
  return {
    id: p.id,
    consultaId: p.consultaId,
    valor: p.valor,
    metodo: p.metodo,
    status: p.status,
    via: p.via,
    criadoEm: p.criadoEm.toISOString(),
    confirmadoEm: p.confirmadoEm ? p.confirmadoEm.toISOString() : null,
  };
}

/* ------------------------- webhook HMAC --------------------------- */

/** Verifica a assinatura HMAC-SHA256 do corpo bruto (hex). Constante-time. */
export function verificarAssinaturaWebhook(corpo: string, assinatura: string | null): boolean {
  const segredo = process.env.BION_PAGAMENTO_WEBHOOK_SECRET;
  if (!segredo || !assinatura) return false;
  const esperada = crypto.createHmac("sha256", segredo).update(corpo).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(assinatura.trim().toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Modo atual do gateway: "webhook" quando um segredo está configurado
 *  (produção real — aguarda confirmação externa), senão "simulado" (demo). */
export function modoGateway(): "webhook" | "simulado" {
  return process.env.BION_PAGAMENTO_WEBHOOK_SECRET ? "webhook" : "simulado";
}
