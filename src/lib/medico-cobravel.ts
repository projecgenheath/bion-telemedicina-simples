/**
 * Regra ÚNICA de "o médico pode ser cobrado" (desde 28/10 o pagamento é só
 * cartão Stripe, cobrança direta na conta conectada do médico; o repasse por
 * PIX é legado e a chave PIX virou só histórico).
 *
 * Usada pelo checkout Stripe (api/pagamentos/stripe/checkout) e pela
 * disponibilidade do médico (medico-livre.ts "livres agora" e
 * espera-medico.ts remarcação por espera) — as duas regras são idênticas.
 *
 * - modo "plataforma" (Connect desligado): cobra na conta da BION, não exige
 *   conta do médico;
 * - modos "direta"/"destino": exige PerfilMedico.stripeAccountId preenchido.
 */
export type ModoCobrancaMedico = "plataforma" | "direta" | "destino";

export function contaStripeDoMedico(stripeAccountId: string | null | undefined): string | null {
  const v = (stripeAccountId ?? "").trim();
  return v ? v : null;
}

export function medicoPodeSerCobrado(modo: ModoCobrancaMedico, stripeAccountId: string | null | undefined): boolean {
  return modo === "plataforma" || contaStripeDoMedico(stripeAccountId) !== null;
}
