import { NextRequest } from "next/server";
import { receberWebhookStripe } from "@/lib/server/stripe-webhook";

/**
 * Webhook do Stripe da conta da BION (STRIPE_WEBHOOK_SECRET). A lógica está em
 * src/lib/server/stripe-webhook.ts, compartilhada com o endpoint Connect
 * (/api/stripe/webhook-connect).
 */
export async function POST(req: NextRequest) {
  return receberWebhookStripe(req, [process.env.STRIPE_WEBHOOK_SECRET]);
}
