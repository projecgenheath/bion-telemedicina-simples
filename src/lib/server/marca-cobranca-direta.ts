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
 * Valor da marca a gravar. FONTE DA VERDADE = o evento de pagamento: o
 * webhook chama com `event.account` (null = cobrança na conta da BION, modo
 * plataforma) e isso SOBRESCREVE o que o checkout gravou. Assim, sessão
 * direta abandonada + pagamento depois no modo plataforma deixa a marca null
 * e o pagamento volta ao repasse PIX. O checkout no modo plataforma também
 * grava null.
 */
export function marcaCobrancaDireta(conta: string | null | undefined): { stripeContaMedico: string | null } {
  const c = typeof conta === "string" ? conta.trim() : "";
  return { stripeContaMedico: c || null };
}

/**
 * Grava (ou LIMPA, com conta null) a conta no registro cobrado. Chamado no
 * checkout (sessão aberta) e no webhook (pagamento concluído, com
 * `event.account` ou null). A última chamada vale.
 */
export async function gravarContaMedicoDaCobranca(
  alvo: { pagamentoId?: string | null; remarcacaoId?: string | null },
  conta: string | null,
): Promise<void> {
  const data = marcaCobrancaDireta(conta);
  if (alvo.pagamentoId) await db.pagamento.update({ where: { id: alvo.pagamentoId }, data });
  if (alvo.remarcacaoId) await db.remarcacaoPendente.update({ where: { id: alvo.remarcacaoId }, data });
}
