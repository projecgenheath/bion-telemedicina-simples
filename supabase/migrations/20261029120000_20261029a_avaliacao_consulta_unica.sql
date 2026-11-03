-- BION — M3 (auditoria da área do paciente): uma avaliação por consulta
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
--
-- A rota POST /api/avaliacoes já recusa avaliação duplicada na aplicação
-- (findFirst por consultaId) e trata o P2002 deste índice como 409. Este
-- índice fecha a janela de corrida (dois POSTs concorrentes para a mesma
-- consulta gravavam duas avaliações, e a média do médico contava a
-- consulta duas vezes). Espelha o @@unique([consultaId]) do model
-- Avaliacao em prisma/schema.prisma.
--
-- consultaId é OPCIONAL no model: no Postgres, valores NULL não colidem
-- entre si num índice único, então avaliações legadas sem consulta
-- vinculada continuam possíveis — só os vínculos reais ficam únicos.
--
-- ATENÇÃO:
-- 1) A criação FALHA se já houver avaliação duplicada para alguma
--    consulta. Rode antes a consulta de verificação abaixo e resolva os
--    duplicados (manter a mais antiga, apagar as demais).
-- 2) Depois de qualquer `prisma db push`, confira se o índice continua
--    existindo e rode este arquivo de novo (é idempotente).

-- Verificação (rodar ANTES; precisa voltar zero linhas):
-- SELECT "consultaId", count(*) AS qtd, array_agg("id") AS avaliacoes
-- FROM "Avaliacao"
-- WHERE "consultaId" IS NOT NULL
-- GROUP BY 1
-- HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Avaliacao_consultaId_key"
  ON "Avaliacao" ("consultaId");
