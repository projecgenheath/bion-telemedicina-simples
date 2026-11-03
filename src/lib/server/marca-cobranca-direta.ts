import { db } from "@/lib/db";
import type { ModoCobranca } from "@/lib/server/stripe";

/**
 * Marca "esta cobrança foi feita na conta conectada do médico" (cobrança
 * direta/destino). Dono do ponto de chamada: Admin (checkout e webhook).
 * Dono da coluna e do uso no repasse: Médicos (PR A, migração 20261103c,
 * colunas Pagamento.stripeContaMedico e RemarcacaoPendente.stripeContaMedico).
 *
 * Regra para o repasse PIX (repasse.ts, Médicos): Pagamento/RemarcacaoPendente
 * com `stripeContaMedico` preenchido = o médico JÁ recebeu no Stripe e o
 * registro NUNCA entra no repasse PIX.
 *
 * Antes da #145 a conta NÃO era gravada no pagamento: só existia em
 * PerfilMedico.stripeAccountId (lida no checkout e no reembolso) e chegava no
 * webhook como `event.account` (cobrança direta).
 */

/** Conta que recebe a cobrança: só nos modos direta/destino. */
export function contaMedicoDaCobranca(modo: ModoCobranca, connect: { contaMedico: string } | null): string | null {
  return modo === "direta" || modo === "destino" ? connect?.contaMedico ?? null : null;
}

/**
 * Grava a conta no registro cobrado. Chamado no checkout (sessão aberta) e na
 * confirmação do pagamento no webhook. conta null = LIMPA a marca (cobrança
 * na plataforma: o registro volta a entrar no repasse PIX); string = grava
 * (sobrescreve). "" é tratado como null.
 */
export async function gravarContaMedicoDaCobranca(
  alvo: { pagamentoId?: string | null; remarcacaoId?: string | null },
  conta: string | null,
): Promise<void> {
  const valor = conta?.trim() || null;
  if (alvo.pagamentoId) {
    await db.pagamento.update({ where: { id: alvo.pagamentoId }, data: { stripeContaMedico: valor } });
  }
  if (alvo.remarcacaoId) {
    await db.remarcacaoPendente.update({ where: { id: alvo.remarcacaoId }, data: { stripeContaMedico: valor } });
  }
}
