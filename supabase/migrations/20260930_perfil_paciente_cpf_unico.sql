-- BION — M4 (auditoria do perfil do paciente): CPF único entre pacientes
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
--
-- O código (PATCH /api/perfil e POST /api/auth/registro) já recusa CPF
-- repetido na aplicação (src/lib/server/cpf-paciente.ts). Este índice fecha
-- a janela de corrida (dois cadastros simultâneos) no banco.
--
-- Índice PARCIAL por EXPRESSÃO: compara só os dígitos (cadastros antigos
-- podem ter CPF sem máscara) e ignora CPF vazio (perfis sem CPF e perfis
-- anonimizados pela LGPD gravam '').
--
-- ATENÇÃO:
-- 1) A criação FALHA se já houver CPF duplicado. Rode antes a consulta de
--    verificação abaixo e resolva os duplicados (suporte/admin).
-- 2) O Prisma não representa este índice no schema.prisma. `prisma db push`
--    / `prisma migrate dev` podem tentar REMOVÊ-LO por não estar no schema
--    (o script `db:push` usa --accept-data-loss). Depois de qualquer
--    db push, confira se o índice continua existindo e rode este arquivo de
--    novo (é idempotente).
-- 3) Desde o PR #10, as rotas do admin (/api/pacientes, /api/pacientes/[id])
--    também validam CPF, telefone e data de nascimento
--    (src/lib/server/validar-paciente-admin.ts) e respondem 409 para CPF
--    repetido — tanto na checagem da aplicação quanto se este índice
--    disparar (P2002) numa corrida.

-- Verificação (rodar ANTES; precisa voltar zero linhas):
-- SELECT regexp_replace("cpf", '\D', '', 'g') AS cpf_digitos, count(*) AS qtd,
--        array_agg("userId") AS usuarios
-- FROM "PerfilPaciente"
-- WHERE "cpf" <> ''
-- GROUP BY 1
-- HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "PerfilPaciente_cpf_digitos_key"
  ON "PerfilPaciente" ((regexp_replace("cpf", '\D', '', 'g')))
  WHERE "cpf" <> '';
