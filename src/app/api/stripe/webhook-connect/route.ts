import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { receberWebhookStripe } from "@/lib/server/stripe-webhook";

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
    // TODO(Médicos, PR C): gravar o status do onboarding no PerfilMedico:
    //   return { acao: "conta", atualizada: await atualizarStatusContaMedico(evento.data.object as Stripe.Account) };
    return { acao: "conta", ignorado: true };
  });
}
