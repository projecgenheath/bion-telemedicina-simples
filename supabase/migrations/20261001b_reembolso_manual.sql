-- =====================================================================
-- BION — Reembolso manual (falta do paciente) e evento falta_paciente
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE, depois do backup e
-- DEPOIS de 20261001_financeiro.sql (PR #13).
--
-- Regras (Alisson, 01/10/2026):
--   * Falta do paciente (médico na sala até o fim, paciente não entrou):
--     sem reembolso automático; o médico recebe normalmente.
--   * O paciente pode pedir reembolso pelo app em até 7 dias depois da
--     consulta, com justificativa; o admin aprova ou nega.
--   * Aprovado: a consulta sai do repasse (médico devolve a parte dele e o
--     app devolve os 10% de comissão).
-- Regras de negócio no servidor: src/lib/server/financeiro.ts.
-- =====================================================================

BEGIN;

ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "origem"        TEXT NOT NULL DEFAULT 'automatico';
ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "justificativa" TEXT;
ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "respostaAdmin" TEXT;
ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "decididoPor"   TEXT;
ALTER TABLE public."Reembolso" ADD COLUMN IF NOT EXISTS "decididoEm"    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Reembolso_origem_status_criadoEm_idx"
  ON public."Reembolso" ("origem", "status", "criadoEm");

-- Domínios ampliados: recria os CHECKs da migração financeira.
ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_tipo_check";
ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_tipo_check"
  CHECK ("tipo" IN ('cancelada', 'remarcada', 'falha_tecnica', 'falta_paciente'));
ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_motivo_check";
ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_motivo_check"
  CHECK ("motivo" IN ('pedido_paciente', 'agenda_cancelada', 'falha_tecnica', 'admin', 'reagendamento', 'falta_paciente'));
ALTER TABLE public."Reembolso" DROP CONSTRAINT IF EXISTS "Reembolso_status_check";
ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_status_check"
  CHECK ("status" IN ('em_analise', 'solicitado', 'aprovado', 'processado', 'negado', 'falhou'));
ALTER TABLE public."Reembolso" DROP CONSTRAINT IF EXISTS "Reembolso_origem_valor_check";
ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_origem_valor_check"
  CHECK ("origem" IN ('automatico', 'manual'));
-- Pedido manual sempre tem justificativa e é sobre o pagamento da consulta.
ALTER TABLE public."Reembolso" DROP CONSTRAINT IF EXISTS "Reembolso_manual_check";
ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_manual_check"
  CHECK ("origem" <> 'manual' OR ("justificativa" IS NOT NULL AND "pagamentoId" IS NOT NULL));

-- Um reembolso ATIVO por pagamento, agora contando o pedido em análise.
DROP INDEX IF EXISTS public."Reembolso_pagamentoId_ativo_key";
CREATE UNIQUE INDEX "Reembolso_pagamentoId_ativo_key"
  ON public."Reembolso" ("pagamentoId")
  WHERE "status" IN ('em_analise', 'solicitado', 'aprovado', 'processado');

-- Um único pedido MANUAL por pagamento (negado é definitivo).
CREATE UNIQUE INDEX IF NOT EXISTS "Reembolso_pagamentoId_manual_key"
  ON public."Reembolso" ("pagamentoId")
  WHERE "origem" = 'manual';

COMMIT;

-- Verificação:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public."Reembolso"'::regclass;
--   SELECT indexname FROM pg_indexes WHERE tablename = 'Reembolso';
