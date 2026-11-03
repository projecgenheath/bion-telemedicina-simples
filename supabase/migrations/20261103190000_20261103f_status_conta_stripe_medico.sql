-- 20261103f: status do onboarding Stripe Connect do médico (Médicos, PR C).
-- Gravado pelo retorno do onboarding e pelo webhook account.updated; lido por
-- medicoPodeSerCobrado (charges_enabled E payouts_enabled).
-- Idempotente; só adiciona colunas com default; não muda dados existentes.
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeContaAtualizadaEm" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "PerfilMedico_stripeAccountId_idx" ON "PerfilMedico"("stripeAccountId");
