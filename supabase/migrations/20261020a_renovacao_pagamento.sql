-- =====================================================================
-- BION — Pacientes (#66): cobrança do pedido de renovação de receita
-- =====================================================================
-- NÃO aplicada automaticamente. Aplicar depois do backup e do ok do Alisson.
-- Depende da 20261019b (#64). Idempotente e SEM BEGIN/COMMIT (o
-- apply_migration roda sem transação explícita).
--
--   1) "PedidoRenovacao"."valorCentavos" (valor normal da consulta do médico
--      copiado no pedido) e "pagamentoId" (único, FK → "Pagamento", set null).
--   2) Status novo 'aguardando_pagamento' (o PIX ainda não confirmou).
--   3) Sem resposta <=> status aberto (aguardando_pagamento ou pendente).
--   4) Um só pedido ABERTO por paciente e receita (os dois status).
-- =====================================================================

ALTER TABLE public."PedidoRenovacao" ADD COLUMN IF NOT EXISTS "valorCentavos" INTEGER;
ALTER TABLE public."PedidoRenovacao" ADD COLUMN IF NOT EXISTS "pagamentoId"   TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoRenovacao_pagamentoId_key" ON public."PedidoRenovacao"("pagamentoId");
DO $$ BEGIN
  ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_pagamentoId_fkey"
    FOREIGN KEY ("pagamentoId") REFERENCES public."Pagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_status_check";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_status_check"
  CHECK ("status" IN ('aguardando_pagamento', 'pendente', 'renovada', 'chamada_marcada', 'recusada', 'cancelado'));

ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_respondido_check";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_respondido_check"
  CHECK (("status" IN ('aguardando_pagamento', 'pendente')) = ("respondidoEm" IS NULL));

DROP INDEX IF EXISTS public."PedidoRenovacao_pendente_unico";
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoRenovacao_aberto_unico"
  ON public."PedidoRenovacao"("pacienteId", "documentoId")
  WHERE "status" IN ('aguardando_pagamento', 'pendente');

-- Verificação:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public."PedidoRenovacao"'::regclass;
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'PedidoRenovacao';
