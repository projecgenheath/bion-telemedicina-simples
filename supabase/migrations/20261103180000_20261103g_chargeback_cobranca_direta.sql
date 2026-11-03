-- 20261103g: chargeback na cobrança direta (Connect). NÃO APLICADA.
-- stripeConta: conta conectada do médico (event.account) onde a disputa aconteceu.
-- transferFalhaBion*: transferência da BION ao médico quando a falha é da BION
-- (taxa do cartão + dispute fee), idempotente por chargeback.
-- Só adiciona colunas anuláveis; não muda nenhum dado existente. Reexecutável.
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "stripeConta" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "transferFalhaBionStatus" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "transferFalhaBionCentavos" INTEGER;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "transferFalhaBionId" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "transferFalhaBionErro" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "transferFalhaBionEm" TIMESTAMP(3);
