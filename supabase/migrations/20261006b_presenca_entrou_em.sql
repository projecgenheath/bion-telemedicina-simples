-- =====================================================================
-- BION — Presença na sala: entrada da sessão atual ("PresencaSala"."entrouEm")
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE, depois do backup,
-- DEPOIS de 20261006_trava_motivo_falta_medico.sql e ANTES do merge do PR
-- "falta do paciente e falha técnica pela sala": o código novo lê e grava a
-- coluna (sem ela, o heartbeat da sala de vídeo dá erro e a verificação de
-- presença falha).
--
-- Regras do Alisson (06/10/2026): o médico só marca "paciente não
-- compareceu" depois de esperar na sala até 15 min depois do horário. Hoje a
-- "PresencaSala" guarda só o ÚLTIMO sinal; "entrouEm" guarda quando a sessão
-- atual começou (a sala zera para o instante da volta quando o sinal fica mais
-- de 30 s parado), como prova de quanto tempo a pessoa esperou.
--
-- Aditiva: coluna NULA, sem DEFAULT e sem reescrever a tabela. Linhas antigas
-- ficam com NULL (o código trata NULL como "entrada desconhecida" e usa só o
-- último sinal). Idempotente (IF NOT EXISTS). RLS/grants não mudam.
-- =====================================================================

BEGIN;

ALTER TABLE public."PresencaSala" ADD COLUMN IF NOT EXISTS "entrouEm" TIMESTAMP(3);

COMMIT;

-- Verificação:
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'PresencaSala' AND column_name = 'entrouEm';
--   -- timestamp without time zone | YES
