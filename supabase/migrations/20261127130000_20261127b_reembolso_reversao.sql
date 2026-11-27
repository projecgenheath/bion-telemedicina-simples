-- BION — Reversão da transferência ao médico no reembolso (modelo 21/11).
-- Conserto do buraco: no modo plataforma, reembolsar a cobrança NÃO desfaz
-- a TransferenciaMedico já enviada; sem reversão o médico fica com o
-- dinheiro e a plataforma absorve o reembolso inteiro (termos 9.3/10.3/
-- 10.12 prometem a reversão). enviarReembolsoStripe passa a chamar
-- transfers.createReversal proporcional ao valor reembolsado, com
-- Idempotency-Key derivada do reembolso.id, e grava o id e o valor da
-- reversão no próprio Reembolso.
--
-- Campos novos (aditivos, nulos = legado intacto):
--   "stripeReversalId"            TEXT  — id da reversão no Stripe (trr_...)
--   "stripeReversalValorCentavos" INTEGER — quanto foi revertido, em centavos
-- CHECK: os dois andam juntos (id preenchido = valor preenchido e > 0).
--
-- ⚠️ NÃO aplicada em produção. Aplicar só com ok do Alisson (a 20261127a
-- já foi aplicada em 27/11; esta é a continuação). Aditiva e idempotente
-- (IF NOT EXISTS / duplicate_object).

BEGIN;

ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "stripeReversalId" TEXT;
ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "stripeReversalValorCentavos" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "Reembolso_stripeReversalId_key"
  ON public."Reembolso" ("stripeReversalId");

DO $$ BEGIN
  ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_reversao_check"
    CHECK (("stripeReversalId" IS NULL AND "stripeReversalValorCentavos" IS NULL)
        OR ("stripeReversalId" IS NOT NULL AND "stripeReversalValorCentavos" IS NOT NULL
            AND "stripeReversalValorCentavos" > 0));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;

-- Verificação:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'Reembolso' AND column_name LIKE 'stripeReversal%';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'Reembolso_reversao_check';
