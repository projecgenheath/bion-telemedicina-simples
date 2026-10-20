-- =====================================================================
-- BION — Teleconsulta v2: evolução do médico (1 por consulta). Dono: Médicos.
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE com apply_migration,
-- só com o ok do Alisson, DEPOIS do backup e ANTES do merge do PR.
--
-- Só ADITIVA: tabela nova "Evolucao", índices, FKs e trava de status.
-- Nenhuma tabela existente muda. Sem BEGIN/COMMIT (o apply_migration já
-- roda numa transação). Idempotente (IF NOT EXISTS / DROP IF EXISTS + ADD).
-- Reversão: DROP TABLE IF EXISTS public."Evolucao";
-- =====================================================================

CREATE TABLE IF NOT EXISTS public."Evolucao" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "pacienteId" TEXT NOT NULL,
    "dados" TEXT NOT NULL DEFAULT '{}',
    "triagem" TEXT NOT NULL DEFAULT '{}',
    "exames" TEXT NOT NULL DEFAULT '{}',
    "medicamentos" TEXT NOT NULL DEFAULT '{}',
    "conduta" TEXT NOT NULL DEFAULT '{}',
    "cid" TEXT,
    "documentos" TEXT NOT NULL DEFAULT '[]',
    "rascunho" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "criadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluidaEm" TIMESTAMPTZ(3),
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Evolucao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Evolucao_consultaId_key" ON public."Evolucao"("consultaId");
CREATE INDEX IF NOT EXISTS "Evolucao_medicoId_status_idx" ON public."Evolucao"("medicoId", "status");
CREATE INDEX IF NOT EXISTS "Evolucao_pacienteId_idx" ON public."Evolucao"("pacienteId");

ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_consultaId_fkey";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_consultaId_fkey"
  FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_medicoId_fkey";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_pacienteId_fkey";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_pacienteId_fkey"
  FOREIGN KEY ("pacienteId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trava de domínio e coerência: concluída sempre com concluidaEm.
ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_status_check";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_status_check"
  CHECK ("status" IN ('rascunho', 'concluida'));
ALTER TABLE public."Evolucao" DROP CONSTRAINT IF EXISTS "Evolucao_concluida_check";
ALTER TABLE public."Evolucao" ADD CONSTRAINT "Evolucao_concluida_check"
  CHECK (("status" = 'concluida') = ("concluidaEm" IS NOT NULL));

-- RLS negando tudo por padrão (o app acessa só pelo servidor), como as demais.
ALTER TABLE public."Evolucao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."Evolucao" FROM anon, authenticated;
