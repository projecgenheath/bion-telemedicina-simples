import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { receberWebhookStripe } from "@/lib/server/stripe-webhook";
import { gravarStatusConta } from "@/lib/server/stripe-connect-medico";

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
    // Status do onboarding no PerfilMedico (charges/payouts/details), lido
    // por medicoPodeSerCobrado. Conta desconhecida: nada é gravado.
    return { acao: "conta", atualizada: await gravarStatusConta(evento.data.object as Stripe.Account) };
  });
}
