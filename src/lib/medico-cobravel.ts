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
 *   a conta com onboarding completo no Stripe (charges_enabled; e
 *   payouts_enabled, para o médico conseguir sacar). Sem isso: não cobrável.
 *
 * Leitura no Stripe (accounts.retrieve) com cache curto em memória (60 s).
 * TODO(Médicos, PR C): trocar a leitura na API pelo status gravado no
 * PerfilMedico (atualizado pelo webhook account.updated).
 */
export type ModoCobrancaMedico = "plataforma" | "direta" | "destino";

export type StatusConta = { chargesEnabled: boolean; payoutsEnabled: boolean };
export type LerConta = (conta: string) => Promise<StatusConta | null>;

export const CACHE_CONTA_MS = 60_000;
const cache = new Map<string, { em: number; status: StatusConta | null }>();
export function limparCacheContas() {
  cache.clear();
}

export function contaStripeDoMedico(stripeAccountId: string | null | undefined): string | null {
  const v = (stripeAccountId ?? "").trim();
  return v ? v : null;
}

/** Lê a conta conectada no Stripe. Erro/conta inexistente = null (não cobrável). */
const lerContaStripe: LerConta = async (conta) => {
  try {
    const { stripe } = await import("@/lib/server/stripe");
    const a = await stripe().accounts.retrieve(conta);
    return { chargesEnabled: !!a.charges_enabled, payoutsEnabled: !!a.payouts_enabled };
  } catch (e) {
    console.error("[medico-cobravel] conta", conta, "ilegível:", e instanceof Error ? e.message : e);
    return null;
  }
};

/** Onboarding completo? (charges_enabled E payouts_enabled), com cache curto. */
export async function contaConectadaPronta(conta: string, deps: { ler?: LerConta; agora?: number } = {}): Promise<boolean> {
  const agora = deps.agora ?? Date.now();
  const c = cache.get(conta);
  let status: StatusConta | null;
  if (c && agora - c.em < CACHE_CONTA_MS) status = c.status;
  else {
    status = await (deps.ler ?? lerContaStripe)(conta);
    cache.set(conta, { em: agora, status });
  }
  return !!status?.chargesEnabled && !!status.payoutsEnabled;
}

export async function medicoPodeSerCobrado(
  modo: ModoCobrancaMedico,
  stripeAccountId: string | null | undefined,
  deps: { ler?: LerConta; agora?: number } = {},
): Promise<boolean> {
  if (modo === "plataforma") return true;
  const conta = contaStripeDoMedico(stripeAccountId);
  if (!conta) return false;
  return contaConectadaPronta(conta, deps);
}
