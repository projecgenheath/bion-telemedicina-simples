-- =====================================================================
-- BION — Teleconsulta v2, Pacientes (PR 3 do plano): medicamentos em uso
-- estruturados e pedido de medição do médico ("pedir levantamento")
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE no SQL Editor do
-- Supabase, DEPOIS do backup e do ok do Alisson, e ANTES do merge do PR.
-- Ordem do dia: 20261018a (Admin), 20261018b (Médicos), 20261018c (esta).
-- Esta migração não depende das outras duas e não toca nas tabelas delas.
--
-- O que faz (só aditivo; nada é removido nem renomeado):
--   1) Tabela nova "MedicamentoEmUso" (FK paciente → "User", cascade;
--      médico → "User", set null).
--   2) Tabela nova "PedidoMedicao" (FK paciente e médico → "User", cascade).
--   3) "Medicao": colunas "origem" (default 'paciente'), "consultaId",
--      "pedidoId" (FK → "PedidoMedicao", set null).
--   4) "Lembrete": colunas "origem" (default 'paciente'),
--      "medicamentoEmUsoId" (FK → "MedicamentoEmUso", set null), "documentoId".
--   "consultaId" e "documentoId" ficam SEM FK de propósito: "Consulta" e
--   "Documento" são do perfil Médicos e não são alterados aqui.
--   ADD COLUMN com DEFAULT constante não reescreve a tabela (PG ≥ 11).
--
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e
-- nenhum privilégio para anon/authenticated (só o servidor, via Prisma).
-- Idempotente (IF NOT EXISTS / duplicate_object), numa transação só.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) MedicamentoEmUso
--    posologia: JSON { vezesAoDia, horarios: ["08:00", ...], dias, textoLivre? }
--    origem: paciente | receita | medico
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."MedicamentoEmUso" (
  "id"           TEXT NOT NULL,
  "pacienteId"   TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "dose"         TEXT,
  "via"          TEXT,
  "posologia"    TEXT NOT NULL DEFAULT '{}',
  "usoContinuo"  BOOLEAN NOT NULL DEFAULT false,
  "controlado"   BOOLEAN NOT NULL DEFAULT false,
  "inicio"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fim"          TIMESTAMP(3),
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "origem"       TEXT NOT NULL DEFAULT 'paciente',
  "documentoId"  TEXT,
  "consultaId"   TEXT,
  "medicoId"     TEXT,
  "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicamentoEmUso_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MedicamentoEmUso_pacienteId_ativo_idx" ON public."MedicamentoEmUso"("pacienteId", "ativo");
CREATE INDEX IF NOT EXISTS "MedicamentoEmUso_documentoId_idx" ON public."MedicamentoEmUso"("documentoId");
CREATE INDEX IF NOT EXISTS "MedicamentoEmUso_medicoId_idx" ON public."MedicamentoEmUso"("medicoId");
DO $$ BEGIN
  ALTER TABLE public."MedicamentoEmUso" ADD CONSTRAINT "MedicamentoEmUso_pacienteId_fkey"
    FOREIGN KEY ("pacienteId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."MedicamentoEmUso" ADD CONSTRAINT "MedicamentoEmUso_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2) PedidoMedicao
--    tipos: JSON string[] com peso | altura | pressao
--    status: pendente | atendido | cancelado
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."PedidoMedicao" (
  "id"         TEXT NOT NULL,
  "consultaId" TEXT,
  "pacienteId" TEXT NOT NULL,
  "medicoId"   TEXT NOT NULL,
  "tipos"      TEXT NOT NULL DEFAULT '[]',
  "status"     TEXT NOT NULL DEFAULT 'pendente',
  "criadoEm"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atendidoEm" TIMESTAMP(3),
  CONSTRAINT "PedidoMedicao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PedidoMedicao_pacienteId_status_idx" ON public."PedidoMedicao"("pacienteId", "status");
CREATE INDEX IF NOT EXISTS "PedidoMedicao_consultaId_idx" ON public."PedidoMedicao"("consultaId");
CREATE INDEX IF NOT EXISTS "PedidoMedicao_medicoId_idx" ON public."PedidoMedicao"("medicoId");
DO $$ BEGIN
  ALTER TABLE public."PedidoMedicao" ADD CONSTRAINT "PedidoMedicao_pacienteId_fkey"
    FOREIGN KEY ("pacienteId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."PedidoMedicao" ADD CONSTRAINT "PedidoMedicao_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 3) Medicao: de onde veio a medida (origem: paciente | pedido | medico)
-- ---------------------------------------------------------------------
ALTER TABLE public."Medicao" ADD COLUMN IF NOT EXISTS "origem"     TEXT NOT NULL DEFAULT 'paciente';
ALTER TABLE public."Medicao" ADD COLUMN IF NOT EXISTS "consultaId" TEXT;
ALTER TABLE public."Medicao" ADD COLUMN IF NOT EXISTS "pedidoId"   TEXT;
CREATE INDEX IF NOT EXISTS "Medicao_pedidoId_idx" ON public."Medicao"("pedidoId");
CREATE INDEX IF NOT EXISTS "Medicao_consultaId_idx" ON public."Medicao"("consultaId");
DO $$ BEGIN
  ALTER TABLE public."Medicao" ADD CONSTRAINT "Medicao_pedidoId_fkey"
    FOREIGN KEY ("pedidoId") REFERENCES public."PedidoMedicao"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 4) Lembrete: ligação com o medicamento em uso e a receita
--    (origem: paciente | receita | medico)
-- ---------------------------------------------------------------------
ALTER TABLE public."Lembrete" ADD COLUMN IF NOT EXISTS "origem"             TEXT NOT NULL DEFAULT 'paciente';
ALTER TABLE public."Lembrete" ADD COLUMN IF NOT EXISTS "medicamentoEmUsoId" TEXT;
ALTER TABLE public."Lembrete" ADD COLUMN IF NOT EXISTS "documentoId"        TEXT;
CREATE INDEX IF NOT EXISTS "Lembrete_medicamentoEmUsoId_idx" ON public."Lembrete"("medicamentoEmUsoId");
DO $$ BEGIN
  ALTER TABLE public."Lembrete" ADD CONSTRAINT "Lembrete_medicamentoEmUsoId_fkey"
    FOREIGN KEY ("medicamentoEmUsoId") REFERENCES public."MedicamentoEmUso"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 5) Deny-by-default nas tabelas novas
-- ---------------------------------------------------------------------
ALTER TABLE public."MedicamentoEmUso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PedidoMedicao"    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."MedicamentoEmUso" FROM anon, authenticated;
REVOKE ALL ON TABLE public."PedidoMedicao"    FROM anon, authenticated;

COMMIT;

-- Verificação:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('MedicamentoEmUso', 'PedidoMedicao');                       -- true, true
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('MedicamentoEmUso', 'PedidoMedicao')
--      AND grantee IN ('anon', 'authenticated');                                    -- vazio
--   SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name IN ('Medicao', 'Lembrete')
--      AND column_name IN ('origem', 'consultaId', 'pedidoId', 'medicamentoEmUsoId', 'documentoId')
--    ORDER BY table_name, column_name;
--
-- Reverter (só se o PR não entrar; perde os dados das tabelas novas):
--   BEGIN;
--   ALTER TABLE public."Lembrete" DROP CONSTRAINT IF EXISTS "Lembrete_medicamentoEmUsoId_fkey";
--   ALTER TABLE public."Medicao"  DROP CONSTRAINT IF EXISTS "Medicao_pedidoId_fkey";
--   ALTER TABLE public."Lembrete" DROP COLUMN IF EXISTS "documentoId", DROP COLUMN IF EXISTS "medicamentoEmUsoId", DROP COLUMN IF EXISTS "origem";
--   ALTER TABLE public."Medicao"  DROP COLUMN IF EXISTS "pedidoId", DROP COLUMN IF EXISTS "consultaId", DROP COLUMN IF EXISTS "origem";
--   DROP TABLE IF EXISTS public."PedidoMedicao";
--   DROP TABLE IF EXISTS public."MedicamentoEmUso";
--   COMMIT;
