-- BION — Taxas do chargeback a cargo do médico no modo plataforma.
-- Decisão do Alisson de 27/11 (alternativa B da cláusula 10.13): o médico
-- arca com a taxa do cartão e a taxa de contestação; o valor contestado
-- devolvido ao paciente fica com a plataforma (NÃO será recuperado do
-- médico). A taxa do cartão JÁ sai no líquido da TransferenciaMedico
-- (financeiro.ts, TAXA_GATEWAY_NO_LIQUIDO); cobrá-la de novo seria em dobro.
-- O que falta cobrar é a taxa de contestação, e no modo plataforma o
-- RepasseAjuste não alcança o modelo novo (repasse.ts): mecanismo próprio.
--
-- 1) "Chargeback" ganha o registro da cobrança das taxas no modo plataforma:
--    - "remarcacaoId": elo com a multa de remarcação (sem Pagamento).
--    - "taxasPlataformaStatus": pendente | falhou | aguardando_desconto |
--      quitado | sem_taxa | cancelado (nulo = nunca tentado).
--    - "taxasPlataformaCentavos": dívida total congelada na 1ª tentativa.
--    - "taxasPlataformaReversalId"/"...ReversalCentavos": parte recuperada
--      por reversão da TransferenciaMedico já enviada (transfers.createReversal,
--      Idempotency-Key derivada do chargeback.id + valor).
--    - "taxasPlataformaDescontadoCentavos": parte abatida em recebimentos
--      futuros do médico (na hora de enviar a TransferenciaMedico).
--    Cobrança só com disputa PERDIDA ('lost'), sem falha da BION e com médico.
--    Ganha depois de cobrado: creditoPendente (devolução manual, fluxo já
--    existente); dívida ainda não cobrada é cancelada.
-- 2) "TransferenciaMedico" ganha "descontoChargebackCentavos" (abatido do
--    líquido no envio) e o status 'descontada' (líquido todo consumido pela
--    dívida; nada a transferir). A fórmula do líquido NÃO muda.
--
-- ⚠️ NÃO aplicada em produção. Aplicar só com ok do Alisson, ANTES do deploy
-- do código que usa estes campos (a 20261127b também segue não aplicada).
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object / DROP IF EXISTS).

BEGIN;

ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "remarcacaoId" TEXT;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaStatus" TEXT;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaCentavos" INTEGER;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaReversalId" TEXT;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaReversalCentavos" INTEGER;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaDescontadoCentavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaErro" TEXT;
ALTER TABLE public."Chargeback" ADD COLUMN IF NOT EXISTS "taxasPlataformaEm" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Chargeback_taxasPlataformaReversalId_key"
  ON public."Chargeback" ("taxasPlataformaReversalId");
CREATE INDEX IF NOT EXISTS "Chargeback_taxas_plataforma_debito_idx"
  ON public."Chargeback" ("medicoId", "criadaEm")
  WHERE "taxasPlataformaStatus" IN ('aguardando_desconto', 'falhou');

DO $$ BEGIN
  ALTER TABLE public."Chargeback" ADD CONSTRAINT "Chargeback_remarcacaoId_fkey"
    FOREIGN KEY ("remarcacaoId") REFERENCES public."RemarcacaoPendente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."Chargeback" ADD CONSTRAINT "Chargeback_taxas_plataforma_check" CHECK (
    ("taxasPlataformaStatus" IS NULL OR "taxasPlataformaStatus" IN
      ('pendente', 'falhou', 'aguardando_desconto', 'quitado', 'sem_taxa', 'cancelado'))
    AND ("taxasPlataformaCentavos" IS NULL OR "taxasPlataformaCentavos" >= 0)
    AND (("taxasPlataformaReversalId" IS NULL AND "taxasPlataformaReversalCentavos" IS NULL)
      OR ("taxasPlataformaReversalId" IS NOT NULL AND "taxasPlataformaReversalCentavos" IS NOT NULL
          AND "taxasPlataformaReversalCentavos" > 0))
    AND "taxasPlataformaDescontadoCentavos" >= 0
    AND COALESCE("taxasPlataformaReversalCentavos", 0) + "taxasPlataformaDescontadoCentavos"
        <= COALESCE("taxasPlataformaCentavos", 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public."TransferenciaMedico"
  ADD COLUMN IF NOT EXISTS "descontoChargebackCentavos" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_desconto_check"
    CHECK ("descontoChargebackCentavos" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Status ganha 'descontada' (líquido todo consumido por taxas de chargeback;
-- sem transferência no Stripe). enviada continua exigindo id + data.
ALTER TABLE public."TransferenciaMedico" DROP CONSTRAINT IF EXISTS "TransferenciaMedico_status_check";
ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_status_check"
  CHECK ("status" IN ('pendente', 'enviada', 'falhou', 'descontada'));

COMMIT;

-- Verificação:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'Chargeback' AND column_name LIKE 'taxasPlataforma%';
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('Chargeback_taxas_plataforma_check', 'TransferenciaMedico_status_check');
