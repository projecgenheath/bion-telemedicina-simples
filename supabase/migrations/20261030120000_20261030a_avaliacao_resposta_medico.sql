-- BION — Melhoria 20 (auditoria de melhorias da área médica): resposta do
-- médico às avaliações dos pacientes.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende destas colunas hoje: a lista completa de
-- avaliações e as sub-notas já foram entregues sem elas. NÃO adicione os
-- campos ao model Avaliacao em prisma/schema.prisma antes de aplicar esta
-- migração — o client gerado passaria a selecioná-los e TODA leitura de
-- Avaliacao quebraria contra o banco sem as colunas.
--
-- Desenho da funcionalidade (implementar junto com a aplicação):
-- 1) `resposta` (texto) e `respostaEm` (quando) na própria Avaliacao —
--    uma avaliação tem no máximo UMA resposta do médico, editável.
-- 2) Rota nova POST /api/avaliacoes/[id]/resposta (papel MEDICO, só as
--    avaliações do próprio médico; limite de tamanho como o do comentário;
--    apagar = resposta vazia). Auditoria no padrão das demais rotas.
-- 3) avaliacaoWire (src/lib/server/dados.ts) expõe resposta/respostaEm; a
--    prévia do perfil (TelaPerfilPublico) e a página pública exibem a
--    resposta sob o comentário, identificada como "Resposta do médico".
-- 4) Moderação: admin pode ocultar uma resposta (mesmo fluxo de moderação
--    de comentários, se/quando existir) — fora do escopo inicial.
--
-- Sem backfill: avaliações antigas ficam com resposta NULL (sem resposta).

ALTER TABLE "Avaliacao" ADD COLUMN "resposta" TEXT;
ALTER TABLE "Avaliacao" ADD COLUMN "respostaEm" TIMESTAMP(3);
