-- BION — Devolução da taxa do cartão ao médico no reembolso integral por
-- falta do paciente (cobrança direta no Stripe Connect).
--
-- Na cobrança direta a taxa do Stripe sai da conta conectada do médico e o
-- refund NÃO devolve essa taxa. A BION assume a taxa: transfere o valor da
-- taxa (balance_transaction.fee da charge) da plataforma para a conta do
-- médico. Uma linha por Reembolso (UNIQUE em "reembolsoId"): webhooks
-- repetidos ou concorrentes nunca criam duas transferências.
--
-- status: pendente | enviado | falhou
--
-- ⚠️ Aplicar em produção ANTES do merge, só com ok do Alisson.
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object).

CREATE TABLE IF NOT EXISTS public."ReembolsoTaxaMedico" (
  "id"               TEXT PRIMARY KEY,
  "reembolsoId"      TEXT NOT NULL,
  "contaStripe"      TEXT NOT NULL,
  "valorCentavos"    INTEGER NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pendente',
  "stripeTransferId" TEXT,
  "tentativas"       INTEGER NOT NULL DEFAULT 0,
  "erro"             TEXT,
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadoEm"        TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReembolsoTaxaMedico_reembolsoId_key" ON public."ReembolsoTaxaMedico" ("reembolsoId");
CREATE UNIQUE INDEX IF NOT EXISTS "ReembolsoTaxaMedico_stripeTransferId_key" ON public."ReembolsoTaxaMedico" ("stripeTransferId");
CREATE INDEX IF NOT EXISTS "ReembolsoTaxaMedico_status_criadoEm_idx" ON public."ReembolsoTaxaMedico" ("status", "criadoEm");

DO $$ BEGIN
  ALTER TABLE public."ReembolsoTaxaMedico"
    ADD CONSTRAINT "ReembolsoTaxaMedico_reembolsoId_fkey"
    FOREIGN KEY ("reembolsoId") REFERENCES public."Reembolso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."ReembolsoTaxaMedico"
    ADD CONSTRAINT "ReembolsoTaxaMedico_status_check" CHECK ("status" IN ('pendente', 'enviado', 'falhou'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."ReembolsoTaxaMedico"
    ADD CONSTRAINT "ReembolsoTaxaMedico_valor_check" CHECK ("valorCentavos" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Padrão da casa: RLS ligado, sem policies (Prisma usa o papel postgres).
ALTER TABLE public."ReembolsoTaxaMedico" ENABLE ROW LEVEL SECURITY;
