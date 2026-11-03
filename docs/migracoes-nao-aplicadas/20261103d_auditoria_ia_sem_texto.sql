-- 20261103d — LGPD: remove o trecho da pergunta guardado em AuditLog.detalhes
-- nos eventos IA_CONSULTA_REALIZADA (pedido do Jurídico, 2026-11-03).
-- NÃO APLICADA. Rodar só com o ok do Alisson, depois do merge do #143.
-- Não apaga linhas: mantém quem (usuarioId/usuarioNome/role), quando (createdAt) e a ação.
-- Sem backup no banco de propósito: copiar o trecho guardaria de novo o dado de saúde.
-- Frases fixas novas ("... (texto não registrado)") não são sobrescritas.
-- Idempotente: rodar de novo não muda nada.

UPDATE public."AuditLog"
   SET detalhes = '(texto não registrado)'
 WHERE acao = 'IA_CONSULTA_REALIZADA'
   AND detalhes IS DISTINCT FROM '(texto não registrado)'
   AND detalhes NOT LIKE '%(texto não registrado)';

-- Conferência (deve dar 0)
SELECT count(*) AS restantes FROM public."AuditLog"
 WHERE acao = 'IA_CONSULTA_REALIZADA' AND detalhes IS DISTINCT FROM '(texto não registrado)'
   AND detalhes NOT LIKE '%(texto não registrado)';
