-- BION — Médicos (fase 2, parte 2): bloqueio de dia inteiro na agenda do médico
-- (folga/férias). Pacientes não agendam nem remarcam para um dia bloqueado.
--
-- ⚠️ APLICAR ANTES DO DEPLOY DO CÓDIGO. O código deste PR consulta a tabela
-- "BloqueioAgenda" em todo agendamento (POST /api/consultas), remarcação
-- (validarNovoHorario), aprovação de multa de remarcação (webhook) e edição de
-- consulta pelo admin: sem a tabela, essas rotas falham com erro 500.
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object): pode rodar de novo
-- e antes ou depois de `prisma db push` (que cria a MESMA tabela).
-- "dia" = dia civil em America/Sao_Paulo (DATE). "motivo" é privado do médico.
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e nenhum
-- privilégio para os papéis da API do Supabase (anon/authenticated).

CREATE TABLE IF NOT EXISTS public."BloqueioAgenda" (
  "id"       TEXT NOT NULL,
  "medicoId" TEXT NOT NULL,
  "dia"      DATE NOT NULL,                 -- dia civil em America/Sao_Paulo
  "motivo"   TEXT NOT NULL DEFAULT '',      -- privado (folga/férias); nunca vai ao paciente
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BloqueioAgenda_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BloqueioAgenda_medicoId_dia_key" ON public."BloqueioAgenda"("medicoId","dia");
CREATE INDEX IF NOT EXISTS "BloqueioAgenda_dia_idx" ON public."BloqueioAgenda"("dia");
DO $$ BEGIN
  ALTER TABLE public."BloqueioAgenda" ADD CONSTRAINT "BloqueioAgenda_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."BloqueioAgenda" ADD CONSTRAINT "BloqueioAgenda_motivo_check" CHECK (length("motivo") <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."BloqueioAgenda" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."BloqueioAgenda" FROM anon, authenticated;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'BloqueioAgenda';                     -- true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'BloqueioAgenda' AND grantee IN ('anon','authenticated');            -- vazio
