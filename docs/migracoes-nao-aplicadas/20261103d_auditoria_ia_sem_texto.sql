-- 20261103d — LGPD: remove o trecho da pergunta guardado em AuditLog.detalhes
-- nos eventos IA_CONSULTA_REALIZADA (pedido do Jurídico, 2026-11-03).
-- NÃO APLICADA. Rodar só com o ok do Alisson, depois do merge do #143.
-- Não apaga linhas: mantém quem (usuarioId/usuarioNome/role), quando (createdAt) e a ação.
-- Idempotente: rodar de novo não muda nada (nem duplica o backup).

BEGIN;

-- 1) Backup das linhas afetadas
CREATE SCHEMA IF NOT EXISTS backup_20261103d;
CREATE TABLE IF NOT EXISTS backup_20261103d."AuditLog_ia_consulta" AS
  SELECT * FROM public."AuditLog" WHERE false;
INSERT INTO backup_20261103d."AuditLog_ia_consulta"
  SELECT a.* FROM public."AuditLog" a
  WHERE a.acao = 'IA_CONSULTA_REALIZADA'
    AND a.detalhes IS DISTINCT FROM '(texto não registrado)'
    AND NOT EXISTS (SELECT 1 FROM backup_20261103d."AuditLog_ia_consulta" b WHERE b.id = a.id);

-- 2) Sobrescreve o detalhe
UPDATE public."AuditLog"
   SET detalhes = '(texto não registrado)'
 WHERE acao = 'IA_CONSULTA_REALIZADA'
   AND detalhes IS DISTINCT FROM '(texto não registrado)';

-- 3) Conferência (deve dar 0)
SELECT count(*) AS restantes FROM public."AuditLog"
 WHERE acao = 'IA_CONSULTA_REALIZADA' AND detalhes IS DISTINCT FROM '(texto não registrado)';

COMMIT;
