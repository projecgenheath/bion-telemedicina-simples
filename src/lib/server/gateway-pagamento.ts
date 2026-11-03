import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/server/stripe";
import { parametrosSessao, type EntradaSessao } from "@/lib/stripe-checkout-logica";

/* ------------------------------------------------------------------ */
/* Ponto único de troca de gateway do checkout do paciente.            */
/*                                                                     */
/* As rotas falam só com `GatewayCheckout`. Hoje existe a implementação */
/* Stripe; se o Stripe BR não atender (ex.: CNPJ), uma implementação     */
/* de gateway brasileiro entra aqui sem mexer nas rotas nem nas telas.  */
/* ------------------------------------------------------------------ */

export type SessaoCheckout = {
  id: string;
  url: string | null;
  status: string | null; // open | complete | expired
  valorCentavos: number | null;
  expiraEmSeg: number;
};

export interface GatewayCheckout {
  nome: "stripe";
  criarSessao(e: EntradaSessao, chaveIdempotencia: string): Promise<SessaoCheckout>;
  lerSessao(id: string): Promise<SessaoCheckout | null>;
  /** Expira uma sessão ainda aberta (defesa extra). Nunca lança: false em erro. */
  expirarSessao(id: string): Promise<boolean>;
  /** Taxa real do gateway (centavos) e id da cobrança, lidos do PaymentIntent. */
  lerCobranca(paymentIntentId: string): Promise<{ chargeId: string | null; taxaCentavos: number | null }>;
  /** Taxa (centavos) de uma balance_transaction; null se não houver. */
  lerTaxa(balanceTransactionId: string): Promise<number | null>;
}

function paraSessao(s: Stripe.Checkout.Session): SessaoCheckout {
  return { id: s.id, url: s.url, status: s.status, valorCentavos: s.amount_total, expiraEmSeg: s.expires_at };
}

export const gatewayStripe: GatewayCheckout = {
  nome: "stripe",
  async criarSessao(e, chave) {
    const params = parametrosSessao(e) as unknown as Stripe.Checkout.SessionCreateParams;
    return paraSessao(
      await stripe().checkout.sessions.create(params, { idempotencyKey: chave }),
    );
  },
  async lerSessao(id) {
    try {
      return paraSessao(await stripe().checkout.sessions.retrieve(id, {}, {}));
    } catch {
      return null;
    }
  },
  async expirarSessao(id) {
    try {
      await stripe().checkout.sessions.expire(id, {}, {});
      return true;
    } catch {
      return false; // já paga/expirada ou erro de rede: o webhook reembolsa
    }
  },
  async lerCobranca(paymentIntentId) {
    const pi = await stripe().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge.balance_transaction"] },
      {},
    );
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    return {
      chargeId: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null),
      // Pix pode confirmar antes da balance_transaction existir: aí fica null.
      taxaCentavos: bt ? bt.fee : null,
    };
  },
  async lerTaxa(balanceTransactionId) {
    const bt = await stripe().balanceTransactions.retrieve(balanceTransactionId, {}, {});
    return typeof bt.fee === "number" ? bt.fee : null;
  },
};

export function gatewayCheckout(): GatewayCheckout {
  return gatewayStripe;
}
