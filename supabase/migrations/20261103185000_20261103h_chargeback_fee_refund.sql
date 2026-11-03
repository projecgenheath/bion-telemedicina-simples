-- 20261103h: devolução dos 10% (application fee) ao médico no chargeback
-- perdido da cobrança direta (decisão do Alisson 03/11 12:33). NÃO APLICADA.
-- Só adiciona colunas anuláveis; não muda dados existentes. Reexecutável.
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "feeRefundStatus" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "feeRefundId" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "feeRefundCentavos" INTEGER;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "feeRefundErro" TEXT;
ALTER TABLE "Chargeback" ADD COLUMN IF NOT EXISTS "feeRefundEm" TIMESTAMP(3);
