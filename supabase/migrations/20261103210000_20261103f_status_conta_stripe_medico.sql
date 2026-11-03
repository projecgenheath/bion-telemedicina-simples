-- 20261103f: status do onboarding Stripe Connect do médico (Médicos, PR C).
-- Gravado pelo retorno do onboarding e pelo webhook account.updated (que relê
-- a conta no Stripe); lido por medicoPodeSerCobrado (charges_enabled E
-- payouts_enabled). Idempotente; só adiciona colunas com default.
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeMotivoBloqueio" TEXT;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripePendencias" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "stripeContaAtualizadaEm" TIMESTAMP(3);

-- Uma conta Stripe por médico: índice ÚNICO parcial. Se já houver contas
-- repetidas, PARA com erro claro (nada é alterado) para revisão manual.
DO $$
DECLARE dup TEXT;
BEGIN
  SELECT string_agg(conta, ', ') INTO dup FROM (
    SELECT "stripeAccountId" AS conta FROM "PerfilMedico"
    WHERE "stripeAccountId" IS NOT NULL AND "stripeAccountId" <> ''
    GROUP BY "stripeAccountId" HAVING count(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION '20261103f: stripeAccountId repetido em mais de um PerfilMedico (%). Corrigir antes de criar o índice único.', dup;
  END IF;
END $$;
DROP INDEX IF EXISTS "PerfilMedico_stripeAccountId_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "PerfilMedico_stripeAccountId_unico"
  ON "PerfilMedico"("stripeAccountId")
  WHERE "stripeAccountId" IS NOT NULL AND "stripeAccountId" <> '';
