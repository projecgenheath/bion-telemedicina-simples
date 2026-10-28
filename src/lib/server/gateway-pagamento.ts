import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/server/stripe";
import { opcoesRequisicao, parametrosSessao, type EntradaSessao, type TipoCobranca } from "@/lib/stripe-checkout-logica";
import { taxaPlataformaConnectCentavos } from "@/lib/server/financeiro";

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
  /** `conta` = acct_ do médico na cobrança direta (Connect); senão omitir. */
  lerSessao(id: string, conta?: string | null): Promise<SessaoCheckout | null>;
  /** Taxa real do gateway (centavos) e id da cobrança, lidos do PaymentIntent. */
  lerCobranca(paymentIntentId: string, conta?: string | null): Promise<{ chargeId: string | null; taxaCentavos: number | null }>;
  /** Taxa (centavos) de uma balance_transaction; null se não houver. */
  lerTaxa(balanceTransactionId: string, conta?: string | null): Promise<number | null>;
}

function paraSessao(s: Stripe.Checkout.Session): SessaoCheckout {
  return { id: s.id, url: s.url, status: s.status, valorCentavos: s.amount_total, expiraEmSeg: s.expires_at };
}

export const gatewayStripe: GatewayCheckout = {
  nome: "stripe",
  async criarSessao(e, chave) {
    const params = parametrosSessao(e) as unknown as Stripe.Checkout.SessionCreateParams;
    return paraSessao(
      await stripe().checkout.sessions.create(params, { idempotencyKey: chave, ...opcoesRequisicao(e) }),
    );
  },
  async lerSessao(id, conta) {
    try {
      return paraSessao(await stripe().checkout.sessions.retrieve(id, {}, conta ? { stripeAccount: conta } : {}));
    } catch {
      return null;
    }
  },
  async lerCobranca(paymentIntentId, conta) {
    const pi = await stripe().paymentIntents.retrieve(
      paymentIntentId,
      { expand: ["latest_charge.balance_transaction"] },
      conta ? { stripeAccount: conta } : {},
    );
    const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
    const bt = charge && typeof charge.balance_transaction === "object" ? charge.balance_transaction : null;
    return {
      chargeId: charge?.id ?? (typeof pi.latest_charge === "string" ? pi.latest_charge : null),
      // Pix pode confirmar antes da balance_transaction existir: aí fica null.
      taxaCentavos: bt ? bt.fee : null,
    };
  },
  async lerTaxa(balanceTransactionId, conta) {
    const bt = await stripe().balanceTransactions.retrieve(balanceTransactionId, {}, conta ? { stripeAccount: conta } : {});
    return typeof bt.fee === "number" ? bt.fee : null;
  },
};

export function gatewayCheckout(): GatewayCheckout {
  return gatewayStripe;
}

/**
 * Comissão da plataforma no Connect (modos destino/direta) = `application_fee_amount`.
 * Consulta, renovação e diferença da sala de espera: 10% do valor.
 * Multa de remarcação: `divisaoDaMulta().appCentavos` (50%).
 * A taxa do cartão NÃO entra aqui: na cobrança direta o Stripe a debita da
 * conta do médico, ou seja, ela sai da parte do médico.
 */
export function comissaoPlataformaConnect(tipo: TipoCobranca, valorCentavos: number): number {
  if (tipo === "multa") return taxaPlataformaConnectCentavos({ tipo: "multa", multaCentavos: valorCentavos });
  return taxaPlataformaConnectCentavos({ tipo: "consulta", valorCentavos });
}
