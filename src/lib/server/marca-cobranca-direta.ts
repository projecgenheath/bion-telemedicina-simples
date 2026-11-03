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
 * Grava a conta no registro cobrado. Chamado no checkout (sessão aberta) e no
 * webhook (confirmação, com `event.account`). conta null = não grava nada
 * (evento sem account nunca apaga a marca do checkout).
 */
export async function gravarContaMedicoDaCobranca(
  alvo: { pagamentoId?: string | null; remarcacaoId?: string | null },
  conta: string | null,
): Promise<void> {
  if (!conta) return;
  void alvo;
  // TODO(Médicos, PR A): depois da coluna stripeContaMedico (20261103c):
  //   if (alvo.pagamentoId) await db.pagamento.update({ where: { id: alvo.pagamentoId }, data: { stripeContaMedico: conta } });
  //   if (alvo.remarcacaoId) await db.remarcacaoPendente.update({ where: { id: alvo.remarcacaoId }, data: { stripeContaMedico: conta } });
}
