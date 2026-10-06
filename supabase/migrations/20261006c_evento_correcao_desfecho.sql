-- =====================================================================
-- BION — Correção de desfecho pelo admin: colunas de correção em
-- "EventoConsulta" (corrigidoEm, corrigidoPorId, motivoCorrecao)
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE, depois do backup,
-- DEPOIS de 20261006_trava_motivo_falta_medico.sql e
-- 20261006b_presenca_entrou_em.sql, e ANTES do merge do PR
-- "Admin: financeiro da falta/falha pela sala" (feat/admin-desfecho-financeiro):
-- o código novo lê e grava estas colunas (sem elas, o fechamento do repasse,
-- a falha técnica e o pedido de reembolso dão erro).
--
-- Regra do Alisson (06/10/2026): só o admin corrige o desfecho que o
-- sistema (ou o médico) marcou. O evento antigo NÃO é apagado nem
-- reescrito: fica no histórico marcado como corrigido (quando, por qual
-- admin e por quê) e um evento novo, por = 'admin', registra o desfecho
-- certo. Toda consulta a eventos de falta/falha ignora os corrigidos
-- ("corrigidoEm" IS NULL).
--
-- Aditiva: três colunas NULAS, sem DEFAULT e sem reescrever a tabela.
-- Linhas antigas ficam com NULL (= evento vigente). As travas novas só
-- olham linhas corrigidas, então nenhuma linha existente as viola.
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS + ADD), numa transação só.
-- RLS e grants não mudam (a tabela continua só do servidor).
-- =====================================================================

BEGIN;

ALTER TABLE public."EventoConsulta" ADD COLUMN IF NOT EXISTS "corrigidoEm" TIMESTAMP(3);
ALTER TABLE public."EventoConsulta" ADD COLUMN IF NOT EXISTS "corrigidoPorId" TEXT;
ALTER TABLE public."EventoConsulta" ADD COLUMN IF NOT EXISTS "motivoCorrecao" TEXT;

-- Corrigido = as três juntas (quando, quem e por quê); motivo com 10 a 1000 caracteres.
ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_correcao_check";
ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_correcao_check"
  CHECK (
    ("corrigidoEm" IS NULL AND "corrigidoPorId" IS NULL AND "motivoCorrecao" IS NULL)
    OR ("corrigidoEm" IS NOT NULL AND "corrigidoPorId" IS NOT NULL
        AND char_length("motivoCorrecao") BETWEEN 10 AND 1000)
  );

COMMIT;

-- Verificação:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'EventoConsulta'
--      AND column_name IN ('corrigidoEm', 'corrigidoPorId', 'motivoCorrecao')
--    ORDER BY column_name;
--   -- corrigidoEm    | timestamp without time zone | YES
--   -- corrigidoPorId | text                        | YES
--   -- motivoCorrecao | text                        | YES
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'EventoConsulta_correcao_check';
--
-- Reverter (só se o PR não entrar; perde o histórico de correções):
--   ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_correcao_check";
--   ALTER TABLE public."EventoConsulta" DROP COLUMN IF EXISTS "motivoCorrecao";
--   ALTER TABLE public."EventoConsulta" DROP COLUMN IF EXISTS "corrigidoPorId";
--   ALTER TABLE public."EventoConsulta" DROP COLUMN IF EXISTS "corrigidoEm";
