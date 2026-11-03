-- 20261103e — Chargeback (disputa do Stripe) no modo plataforma + marcação
-- "falha da BION" (cláusula 10.13 dos termos do médico). Dono: Admin.
--
-- NÃO APLICADA. Aplicar só com ok do Alisson (merge pelo Presidente).
--
-- Regra (decisão 03/11): no modo plataforma o médico arca com a dispute fee
-- do Stripe (a taxa do cartão já sai no repasse normal), descontada por um
-- RepasseAjuste (motivo 'chargeback'), SALVO se o admin marcar "falha da
-- BION": aí nada é descontado do médico.
--
-- 1) Tabela "Chargeback": uma linha por disputa do Stripe (charge.dispute.*),
--    com a marcação (quem, quando, por quê). Sem acesso por anon/authenticated.
-- 2) RepasseAjuste ganha "chargebackId" (único) e o motivo 'chargeback' na
--    CHECK de regras. O desconto em si é criado pelo repasse (repasse.ts,
--    Médicos) usando descontoChargebackCentavos() de src/lib/server/chargeback.ts.
--
-- Rollback:
--   ALTER TABLE public."RepasseAjuste" DROP CONSTRAINT "RepasseAjuste_regras_check";
--   (recriar a CHECK original de 20261004105352_repasse_diario.sql; só funciona
--    se não houver linha com motivo 'chargeback')
--   ALTER TABLE public."RepasseAjuste" DROP COLUMN "chargebackId";
--   DROP TABLE public."Chargeback";

BEGIN;

CREATE TABLE IF NOT EXISTS public."Chargeback" (
  "id"                  TEXT NOT NULL,
  "stripeDisputeId"     TEXT NOT NULL,
  "stripeChargeId"      TEXT,
  "pagamentoId"         TEXT,
  "consultaId"          TEXT,
  "medicoId"            TEXT,
  "valorCentavos"       INTEGER NOT NULL,          -- valor disputado
  "taxaDisputaCentavos" INTEGER,                   -- dispute fee LÍQUIDA do Stripe (soma das balance_transactions, ≥ 0)
  "statusStripe"        TEXT NOT NULL,             -- warning_needs_response | needs_response | under_review | won | lost | ...
  "motivoStripe"        TEXT,                      -- dispute.reason
  "ultimoEventoId"      TEXT,                      -- último evento charge.dispute.* aplicado (idempotência)
  "ultimoEventoEm"      TIMESTAMP(3),              -- event.created do último evento aplicado (ordem)
  "creditoPendente"     BOOLEAN NOT NULL DEFAULT false, -- ganha depois de o desconto entrar num repasse
  "falhaBion"           BOOLEAN NOT NULL DEFAULT false,
  "falhaBionMotivo"     TEXT,
  "falhaBionPorId"      TEXT,
  "falhaBionEm"         TIMESTAMP(3),
  "criadoEm"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Chargeback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Chargeback_valores_check" CHECK (
    "valorCentavos" >= 0 AND COALESCE("taxaDisputaCentavos", 0) >= 0),
  CONSTRAINT "Chargeback_falha_bion_check" CHECK (
    ("falhaBion" = false AND "falhaBionMotivo" IS NULL AND "falhaBionPorId" IS NULL AND "falhaBionEm" IS NULL) OR
    ("falhaBion" = true AND char_length(btrim("falhaBionMotivo")) >= 10 AND "falhaBionPorId" IS NOT NULL AND "falhaBionEm" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "Chargeback_stripeDisputeId_key" ON public."Chargeback"("stripeDisputeId");
CREATE INDEX IF NOT EXISTS "Chargeback_medicoId_idx" ON public."Chargeback"("medicoId");
CREATE INDEX IF NOT EXISTS "Chargeback_pagamentoId_idx" ON public."Chargeback"("pagamentoId");
DO $$ BEGIN
  ALTER TABLE public."Chargeback" ADD CONSTRAINT "Chargeback_pagamentoId_fkey"
    FOREIGN KEY ("pagamentoId") REFERENCES public."Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Chargeback" ADD CONSTRAINT "Chargeback_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Chargeback" ADD CONSTRAINT "Chargeback_falhaBionPorId_fkey"
    FOREIGN KEY ("falhaBionPorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."Chargeback" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Chargeback" FROM anon, authenticated;

-- RepasseAjuste: desconto do chargeback.
ALTER TABLE public."RepasseAjuste" ADD COLUMN IF NOT EXISTS "chargebackId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseAjuste_chargebackId_key" ON public."RepasseAjuste"("chargebackId");
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_chargebackId_fkey"
    FOREIGN KEY ("chargebackId") REFERENCES public."Chargeback"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."RepasseAjuste" DROP CONSTRAINT IF EXISTS "RepasseAjuste_regras_check";
ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_regras_check" CHECK (
  "valorCentavos" > 0 AND
  (("motivo" = 'reembolso'      AND "reembolsoId" IS NOT NULL AND "consultaId" IS NOT NULL AND "origemAjusteId" IS NULL AND "chargebackId" IS NULL) OR
   ("motivo" = 'saldo_anterior' AND "origemAjusteId" IS NOT NULL AND "reembolsoId" IS NULL AND "chargebackId" IS NULL) OR
   ("motivo" = 'chargeback'     AND "chargebackId" IS NOT NULL AND "reembolsoId" IS NULL AND "origemAjusteId" IS NULL)) AND
  (("repasseId" IS NULL AND "aplicadoEm" IS NULL AND "valorAplicadoCentavos" = 0) OR
   ("repasseId" IS NOT NULL AND "aplicadoEm" IS NOT NULL
      AND "valorAplicadoCentavos" > 0 AND "valorAplicadoCentavos" <= "valorCentavos")));

COMMIT;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'Chargeback'; -- true
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public."RepasseAjuste"'::regclass AND conname = 'RepasseAjuste_regras_check';
--   SELECT grantee FROM information_schema.role_table_grants WHERE table_name = 'Chargeback' AND grantee IN ('anon','authenticated'); -- vazio
