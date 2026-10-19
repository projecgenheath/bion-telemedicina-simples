-- =====================================================================
-- BION — Admin: toque da consulta (PR 1 do plano teleconsulta-v2, só schema)
-- Tabelas "ChamadaConsulta" (cada toque: consulta, usuário, tentativa) e
-- "PushInscricao" (inscrições de Web Push por aparelho).
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE no SQL Editor do
-- Supabase, só com o ok do Alisson e DEPOIS do backup. Nenhum código usa
-- estas tabelas ainda (o job do toque e as rotas de inscrição vêm no PR 7).
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object): pode rodar de
-- novo e antes ou depois de `prisma db push` (que cria as MESMAS tabelas).
-- O Prisma não declara relações nestes models (evita conflito com os PRs de
-- Médicos e Pacientes); as FKs ficam só aqui, com ON DELETE CASCADE.
-- Trava contra toque duplo: UNIQUE ("consultaId","paraUsuarioId","tentativa")
-- + INSERT … ON CONFLICT DO NOTHING no job (só quem inseriu envia).
-- NÃO ativa pg_cron/pg_net (fica no PR 7).
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e nenhum
-- privilégio para os papéis da API do Supabase (anon/authenticated). Só o
-- servidor (Prisma/service role) acessa.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public."ChamadaConsulta" (
  "id"            TEXT NOT NULL,
  "consultaId"    TEXT NOT NULL,
  "tentativa"     INTEGER NOT NULL,                              -- 1..3
  "paraUsuarioId" TEXT NOT NULL,                                 -- quem recebeu o toque
  "papel"         TEXT NOT NULL,                                 -- paciente | medico
  "status"        TEXT NOT NULL DEFAULT 'tocando',               -- tocando | atendida | recusada | expirada
  "tocouEm"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiraEm"      TIMESTAMP(3) NOT NULL,                         -- tocouEm + 2 min
  "respondidaEm"  TIMESTAMP(3),
  "canal"         TEXT NOT NULL DEFAULT 'realtime',              -- realtime | push | ambos
  "pushEnviado"   BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "ChamadaConsulta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChamadaConsulta_consultaId_paraUsuarioId_tentativa_key"
  ON public."ChamadaConsulta"("consultaId","paraUsuarioId","tentativa");
CREATE INDEX IF NOT EXISTS "ChamadaConsulta_status_expiraEm_idx"
  ON public."ChamadaConsulta"("status","expiraEm");
DO $$ BEGIN
  ALTER TABLE public."ChamadaConsulta" ADD CONSTRAINT "ChamadaConsulta_consultaId_fkey"
    FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."ChamadaConsulta" ADD CONSTRAINT "ChamadaConsulta_paraUsuarioId_fkey"
    FOREIGN KEY ("paraUsuarioId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."ChamadaConsulta" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ChamadaConsulta" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public."PushInscricao" (
  "id"          TEXT NOT NULL,
  "usuarioId"   TEXT NOT NULL,
  "endpoint"    TEXT NOT NULL,
  "p256dh"      TEXT NOT NULL,
  "auth"        TEXT NOT NULL,
  "plataforma"  TEXT,                                            -- ios_pwa | android | desktop
  "userAgent"   TEXT,
  "criadaEm"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimoUsoEm" TIMESTAMP(3),
  "falhas"      INTEGER NOT NULL DEFAULT 0,                      -- 404/410 do serviço de push → apagar
  CONSTRAINT "PushInscricao_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushInscricao_endpoint_key" ON public."PushInscricao"("endpoint");
CREATE INDEX IF NOT EXISTS "PushInscricao_usuarioId_idx" ON public."PushInscricao"("usuarioId");
DO $$ BEGIN
  ALTER TABLE public."PushInscricao" ADD CONSTRAINT "PushInscricao_usuarioId_fkey"
    FOREIGN KEY ("usuarioId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."PushInscricao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PushInscricao" FROM anon, authenticated;

COMMIT;

-- Verificação:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('ChamadaConsulta','PushInscricao');                      -- true, true
--   SELECT count(*) FROM pg_policies WHERE tablename IN ('ChamadaConsulta','PushInscricao'); -- 0
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('ChamadaConsulta','PushInscricao')
--      AND grantee IN ('anon','authenticated');                                  -- vazio
