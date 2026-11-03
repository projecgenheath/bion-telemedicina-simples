import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { receberWebhookStripe } from "@/lib/server/stripe-webhook";
import { sincronizarContaDoEvento } from "@/lib/server/stripe-connect-medico";

/**
 * Webhook Connect do Stripe (endpoint "Connected accounts" no Dashboard,
 * segredo STRIPE_WEBHOOK_SECRET_CONNECT). Na cobrança direta, todos os eventos
 * da cobrança acontecem na conta do médico e chegam SÓ aqui, com
 * `event.account` = conta do médico:
 *   checkout.session.completed / async_payment_succeeded / async_payment_failed / expired,
 *   charge.updated, charge.refunded, refund.created / updated / failed,
 *   charge.dispute.created / updated / closed / funds_withdrawn / funds_reinstated,
 *   account.updated.
 * Mesmo processamento e idempotência (StripeEvento) do endpoint da BION.
 */
export async function POST(req: NextRequest) {
  return receberWebhookStripe(req, [process.env.STRIPE_WEBHOOK_SECRET_CONNECT], async (evento: Stripe.Event) => {
    if (evento.type !== "account.updated") return null;
    // Status do onboarding no PerfilMedico, lido por medicoPodeSerCobrado.
    // Ordem dos eventos não é garantida: relê a conta no Stripe (estado
    // atual) em vez de gravar o payload. Conta desconhecida: nada é gravado.
    const conta = evento.account ?? (evento.data.object as Stripe.Account).id;
    return { acao: "conta", atualizada: await sincronizarContaDoEvento(conta) };
  });
}
