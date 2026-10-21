-- =====================================================================
-- BION — Correção: a trava "EventoConsulta_motivo_check" passa a aceitar
-- o motivo 'falta_medico'
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE, depois do backup e
-- ANTES do merge do PR que a acompanha.
--
-- Defeito (produção, 06/10/2026): a verificação de presença
-- (src/lib/server/presenca-consulta.ts) trata "o paciente entrou e o médico
-- nunca entrou" (consulta paga) com aplicarFalhaTecnica(..., { motivo:
-- "falta_medico" }), que grava EventoConsulta tipo 'falha_tecnica' com
-- motivo 'falta_medico'. A trava recriada em 20261001b_reembolso_manual.sql
-- não lista 'falta_medico': o INSERT falha, a transação inteira é desfeita
-- (a consulta não muda de status) e o paciente não recebe a opção de
-- remarcar ou pedir reembolso. Nenhuma consulta caiu nesse caso até hoje
-- (EventoConsulta vazia em produção em 06/10).
--
-- A trava é recriada com TODOS os valores atuais (conferidos em produção com
-- pg_get_constraintdef em 06/10/2026) mais 'falta_medico'. O "tipo" continua
-- 'falha_tecnica' (EventoConsulta_tipo_check não muda).
-- Só AMPLIA o domínio: nenhuma linha existente pode violar a nova trava.
-- Idempotente (DROP IF EXISTS + ADD) e numa transação só.
-- =====================================================================

BEGIN;

ALTER TABLE public."EventoConsulta" DROP CONSTRAINT IF EXISTS "EventoConsulta_motivo_check";
ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_motivo_check"
  CHECK ("motivo" IN (
    'pedido_paciente',
    'agenda_cancelada',
    'falha_tecnica',
    'admin',
    'reagendamento',
    'falta_paciente',
    'falta_medico'
  ));

COMMIT;

-- Verificação:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'EventoConsulta_motivo_check';
--   -- deve listar os 7 valores, com 'falta_medico' no fim.
