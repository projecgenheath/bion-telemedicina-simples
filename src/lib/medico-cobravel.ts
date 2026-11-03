/**
 * Regra ÚNICA de "o médico pode ser cobrado" (decisão do Alisson 03/11 12:13:
 * cobrança direta na conta conectada do médico, 10% de application fee).
 *
 * Usada pelo checkout Stripe (api/pagamentos/stripe/checkout) e pela
 * disponibilidade do médico (medico-livre.ts "livres agora" e
 * espera-medico.ts remarcação por espera).
 *
 * - modo "plataforma": cobra na conta da BION, não exige conta do médico;
 * - modos "direta"/"destino": exige PerfilMedico.stripeAccountId preenchido E
 *   a conta com onboarding completo no Stripe (charges_enabled E
 *   payouts_enabled, para o médico conseguir sacar). Sem isso: não cobrável.
 *
 * Fonte do status (Médicos, PR C): o que está GRAVADO no PerfilMedico
 * (stripeChargesEnabled/stripePayoutsEnabled, migração 20261103f), atualizado
 * pelo webhook account.updated (/api/stripe/webhook-connect) e pelo retorno
 * do onboarding (/api/medico/stripe/conta/retorno). Não chama a API do
 * Stripe a cada checkout/lista de disponíveis.
 */
export type ModoCobrancaMedico = "plataforma" | "direta" | "destino";

export type StatusConta = { chargesEnabled: boolean; payoutsEnabled: boolean };
export type LerConta = (conta: string) => Promise<StatusConta | null>;

export function contaStripeDoMedico(stripeAccountId: string | null | undefined): string | null {
  const v = (stripeAccountId ?? "").trim();
  return v ? v : null;
}

/** Status gravado no PerfilMedico dono da conta. Erro/conta desconhecida = null (não cobrável). */
const lerStatusGravado: LerConta = async (conta) => {
  try {
    const { db } = await import("@/lib/db");
    const p = await db.perfilMedico.findFirst({
      where: { stripeAccountId: conta },
      select: { stripeChargesEnabled: true, stripePayoutsEnabled: true },
    });
    return p ? { chargesEnabled: p.stripeChargesEnabled, payoutsEnabled: p.stripePayoutsEnabled } : null;
  } catch (e) {
    console.error("[medico-cobravel] status da conta", conta, "ilegível:", e instanceof Error ? e.message : e);
    return null;
  }
};

/** Onboarding completo? (charges_enabled E payouts_enabled, status gravado). */
export async function contaConectadaPronta(conta: string, deps: { ler?: LerConta } = {}): Promise<boolean> {
  const status = await (deps.ler ?? lerStatusGravado)(conta);
  return !!status?.chargesEnabled && !!status.payoutsEnabled;
}

export async function medicoPodeSerCobrado(
  modo: ModoCobrancaMedico,
  stripeAccountId: string | null | undefined,
  deps: { ler?: LerConta } = {},
): Promise<boolean> {
  if (modo === "plataforma") return true;
  const conta = contaStripeDoMedico(stripeAccountId);
  if (!conta) return false;
  return contaConectadaPronta(conta, deps);
}
