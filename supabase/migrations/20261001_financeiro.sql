-- =====================================================================
-- BION — Fase financeira: eventos de consulta, reembolsos e repasses
-- =====================================================================
-- NÃO aplicada automaticamente. Revise e aplique MANUALMENTE, depois do
-- backup e das migrações anteriores da corrente (inclusive
-- 20260930_rls_deny_by_default.sql do PR #1).
--
-- Só cria tabelas novas: nenhuma coluna existente muda. O status novo
-- "aguardando_reagendamento" de Consulta é texto livre (coluna String), então
-- não precisa de ALTER. Valores novos em centavos (INTEGER).
-- Regras de negócio: src/lib/server/financeiro.ts.
-- Mesmo padrão do PR #1: RLS ligado, sem policies e sem grants para
-- anon/authenticated — só o servidor (Prisma, role owner) lê e grava.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public."EventoConsulta" (
    "id" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "por" TEXT NOT NULL,
    "atorId" TEXT,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataAnterior" TIMESTAMP(3) NOT NULL,
    "dataNova" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "multaCentavos" INTEGER,

    CONSTRAINT "EventoConsulta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Reembolso" (
    "id" TEXT NOT NULL,
    "pagamentoId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "multaCentavos" INTEGER NOT NULL DEFAULT 0,
    "motivo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'solicitado',
    "gatewayRef" TEXT,
    "solicitadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadoEm" TIMESTAMP(3),

    CONSTRAINT "Reembolso_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."Repasse" (
    "id" TEXT NOT NULL,
    "medicoId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "brutoCentavos" INTEGER NOT NULL DEFAULT 0,
    "taxasCentavos" INTEGER NOT NULL DEFAULT 0,
    "reembolsosCentavos" INTEGER NOT NULL DEFAULT 0,
    "multasCentavos" INTEGER NOT NULL DEFAULT 0,
    "liquidoCentavos" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),

    CONSTRAINT "Repasse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS public."RepasseItem" (
    "id" TEXT NOT NULL,
    "repasseId" TEXT NOT NULL,
    "consultaId" TEXT NOT NULL,
    "brutoCentavos" INTEGER NOT NULL,
    "taxasCentavos" INTEGER NOT NULL DEFAULT 0,
    "reembolsosCentavos" INTEGER NOT NULL DEFAULT 0,
    "multasCentavos" INTEGER NOT NULL DEFAULT 0,
    "liquidoCentavos" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepasseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EventoConsulta_consultaId_em_idx" ON public."EventoConsulta"("consultaId", "em");

CREATE INDEX IF NOT EXISTS "EventoConsulta_dataAnterior_idx" ON public."EventoConsulta"("dataAnterior");

CREATE INDEX IF NOT EXISTS "EventoConsulta_em_idx" ON public."EventoConsulta"("em");

CREATE INDEX IF NOT EXISTS "Reembolso_pagamentoId_status_idx" ON public."Reembolso"("pagamentoId", "status");

CREATE INDEX IF NOT EXISTS "Reembolso_status_criadoEm_idx" ON public."Reembolso"("status", "criadoEm");

CREATE INDEX IF NOT EXISTS "Repasse_competencia_status_idx" ON public."Repasse"("competencia", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "Repasse_medicoId_competencia_key" ON public."Repasse"("medicoId", "competencia");

CREATE UNIQUE INDEX IF NOT EXISTS "RepasseItem_consultaId_key" ON public."RepasseItem"("consultaId");

CREATE INDEX IF NOT EXISTS "RepasseItem_repasseId_idx" ON public."RepasseItem"("repasseId");

DO $$ BEGIN
  ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES public."Pagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_medicoId_fkey" FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_repasseId_fkey" FOREIGN KEY ("repasseId") REFERENCES public."Repasse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_consultaId_fkey" FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Validação dos domínios (o servidor também valida).
DO $$ BEGIN
  ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_tipo_check"
    CHECK ("tipo" IN ('cancelada', 'remarcada', 'falha_tecnica'));
  ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_por_check"
    CHECK ("por" IN ('paciente', 'medico', 'sistema', 'admin'));
  ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_motivo_check"
    CHECK ("motivo" IN ('pedido_paciente', 'agenda_cancelada', 'falha_tecnica', 'admin'));
  ALTER TABLE public."EventoConsulta" ADD CONSTRAINT "EventoConsulta_multa_check"
    CHECK ("multaCentavos" IS NULL OR "multaCentavos" >= 0);
  ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_status_check"
    CHECK ("status" IN ('solicitado', 'aprovado', 'processado', 'negado', 'falhou'));
  ALTER TABLE public."Reembolso" ADD CONSTRAINT "Reembolso_valores_check"
    CHECK ("valorCentavos" >= 0 AND "multaCentavos" >= 0);
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_status_check"
    CHECK ("status" IN ('aberto', 'fechado', 'pago'));
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_competencia_check"
    CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Só UM reembolso ATIVO por pagamento (evita pedido duplo por clique duplo).
-- Negado/falhou não contam: o paciente pode pedir de novo depois.
CREATE UNIQUE INDEX IF NOT EXISTS "Reembolso_pagamentoId_ativo_key"
  ON public."Reembolso" ("pagamentoId")
  WHERE "status" IN ('solicitado', 'aprovado', 'processado');

-- Deny-by-default: RLS sem policies + nenhum privilégio para os papéis da API.
ALTER TABLE public."EventoConsulta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Reembolso"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Repasse"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."RepasseItem"    ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EventoConsulta" FROM anon, authenticated;
REVOKE ALL ON TABLE public."Reembolso"      FROM anon, authenticated;
REVOKE ALL ON TABLE public."Repasse"        FROM anon, authenticated;
REVOKE ALL ON TABLE public."RepasseItem"    FROM anon, authenticated;

COMMIT;

-- Verificação:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('EventoConsulta','Reembolso','Repasse','RepasseItem');      -- todos true
--   SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name IN ('EventoConsulta','Reembolso','Repasse','RepasseItem')
--      AND grantee IN ('anon','authenticated');                                      -- vazio
