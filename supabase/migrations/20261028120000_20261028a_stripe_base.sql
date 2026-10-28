-- 20261028a — Base do Stripe (modo teste). Dono: Admin.
-- Idempotente, sem BEGIN/COMMIT (o runner já envolve em transação).
-- Só aplicar com o ok do Alisson.
--
-- Pagamento: ids do Checkout/PaymentIntent/Charge e a taxa real do Stripe.
-- Reembolso: id do refund no Stripe (preenchido = enviado ao Stripe; o status
--   continua 'aprovado' até o Stripe confirmar → 'processado' ou 'falhou').
-- PerfilMedico: conta conectada do Stripe Connect (flag STRIPE_CONNECT, off).
-- StripeEvento: idempotência do webhook (id = event.id).
--
-- Reversão:
--   DROP TABLE public."StripeEvento";
--   ALTER TABLE public."PerfilMedico" DROP COLUMN "stripeAccountId";
--   ALTER TABLE public."Reembolso" DROP COLUMN "stripeRefundId";
--   ALTER TABLE public."Pagamento" DROP COLUMN "stripeCheckoutSessionId",
--     DROP COLUMN "stripePaymentIntentId", DROP COLUMN "stripeChargeId",
--     DROP COLUMN "stripeTaxaCentavos";

ALTER TABLE public."Pagamento" ADD COLUMN IF NOT EXISTS "stripeCheckoutSessionId" TEXT NULL;
ALTER TABLE public."Pagamento" ADD COLUMN IF NOT EXISTS "stripePaymentIntentId" TEXT NULL;
ALTER TABLE public."Pagamento" ADD COLUMN IF NOT EXISTS "stripeChargeId" TEXT NULL;
ALTER TABLE public."Pagamento" ADD COLUMN IF NOT EXISTS "stripeTaxaCentavos" INTEGER NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Pagamento_stripeCheckoutSessionId_key" ON public."Pagamento"("stripeCheckoutSessionId");
CREATE UNIQUE INDEX IF NOT EXISTS "Pagamento_stripePaymentIntentId_key" ON public."Pagamento"("stripePaymentIntentId");

ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "stripeRefundId" TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Reembolso_stripeRefundId_key" ON public."Reembolso"("stripeRefundId");

ALTER TABLE public."PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeAccountId" TEXT NULL;

CREATE TABLE IF NOT EXISTS public."StripeEvento" (
  "id"           TEXT PRIMARY KEY,
  "tipo"         TEXT NOT NULL,
  "recebidoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processadoEm" TIMESTAMP(3) NULL
);
CREATE INDEX IF NOT EXISTS "StripeEvento_tipo_recebidoEm_idx" ON public."StripeEvento"("tipo", "recebidoEm");
ALTER TABLE public."StripeEvento" ENABLE ROW LEVEL SECURITY;
