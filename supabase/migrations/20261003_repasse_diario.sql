-- =====================================================================
-- BION — Fase 2, parte 3: repasse DIÁRIO ao médico
-- =====================================================================
-- NÃO aplicada automaticamente. Revise e aplique MANUALMENTE, depois do
-- backup. Regras aprovadas pelo Alisson (03/10/2026):
--   * repasse diário, fechado às 23:30 de São Paulo, das consultas do dia;
--   * a parte do médico na multa (50%) entra no repasse do dia em que a multa
--     foi paga;
--   * reembolso depois do fechamento é descontado no repasse seguinte
--     (tabela "RepasseAjuste");
--   * PIX no nome do médico ou do CNPJ dele ("DadosRecebimentoMedico");
--   * o admin faz o PIX por fora, marca como pago e anexa o comprovante.
--
-- APLICAR ANTES DO DEPLOY do código do repasse (src/lib/server/repasse.ts).
-- Hoje nenhum código lê ou grava "Repasse"/"RepasseItem" e as duas tabelas
-- estão VAZIAS em produção (conferido em 03/10): a troca de "competencia" de
-- mês ("AAAA-MM") para dia ("AAAA-MM-DD") não afeta nenhuma linha. Se houver
-- alguma linha mensal, a nova CHECK falha e a transação inteira é desfeita.
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object). Mesmo padrão das
-- demais: RLS ligado, sem policies e sem grants para anon/authenticated — só
-- o servidor (Prisma) lê e grava. Nada daqui vai ao paciente: fora do
-- consultaWire, do medicoWire e do bootstrap.
-- =====================================================================

BEGIN;

-- ---------- Repasse: competência diária + comissão, ajustes, pagamento ----
ALTER TABLE public."Repasse" DROP CONSTRAINT IF EXISTS "Repasse_competencia_check";
ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_competencia_check"
  CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');

ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "comissaoCentavos" INTEGER NOT NULL DEFAULT 0;
-- Descontos de reembolsos feitos depois do fechamento de um repasse anterior.
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "ajustesCentavos"  INTEGER NOT NULL DEFAULT 0;
-- Caminho no bucket PRIVADO de comprovantes (nunca URL pública).
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "comprovantePath"  TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pagoPorId"        TEXT;   -- User.id do admin
-- Cópia da chave usada no pagamento: trocar a chave depois não muda o histórico.
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTipo"          TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixChave"         TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTitularNome"   TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTitularDocumento" TEXT;

ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "comissaoCentavos" INTEGER NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_valores_check" CHECK (
    "brutoCentavos" >= 0 AND "comissaoCentavos" >= 0 AND "taxasCentavos" >= 0 AND
    "reembolsosCentavos" >= 0 AND "multasCentavos" >= 0 AND "ajustesCentavos" >= 0 AND
    "liquidoCentavos" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Pago exige data, quem pagou e comprovante.
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_pago_check" CHECK (
    "status" <> 'pago' OR ("pagoEm" IS NOT NULL AND "pagoPorId" IS NOT NULL AND "comprovantePath" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_fechado_check" CHECK (
    "status" = 'aberto' OR "fechadoEm" IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_pagoPorId_fkey"
    FOREIGN KEY ("pagoPorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_valores_check" CHECK (
    "brutoCentavos" >= 0 AND "comissaoCentavos" >= 0 AND "taxasCentavos" >= 0 AND
    "reembolsosCentavos" >= 0 AND "multasCentavos" >= 0 AND "liquidoCentavos" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- RepasseAjuste: desconto em repasse seguinte -----------------
-- motivo = 'reembolso'      → reembolso efetivado DEPOIS de a consulta (ou a
--                             multa) já ter entrado num repasse fechado.
--                             "reembolsoId" único: cada reembolso é
--                             descontado uma vez só.
-- motivo = 'saldo_anterior' → sobra de um ajuste maior que o líquido do dia
--                             (o repasse fecha em 0 e o resto vai pro dia
--                             seguinte). "origemAjusteId" único.
-- "repasseId" nulo = desconto pendente; preenchido = descontado nesse repasse.
CREATE TABLE IF NOT EXISTS public."RepasseAjuste" (
  "id"            TEXT NOT NULL,
  "medicoId"      TEXT NOT NULL,
  "consultaId"    TEXT NOT NULL,
  "motivo"        TEXT NOT NULL,
  "reembolsoId"   TEXT,
  "origemAjusteId" TEXT,
  "valorCentavos" INTEGER NOT NULL,          -- parte do MÉDICO a descontar (> 0)
  "repasseId"     TEXT,
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aplicadoEm"    TIMESTAMP(3),
  CONSTRAINT "RepasseAjuste_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseAjuste_reembolsoId_key"    ON public."RepasseAjuste"("reembolsoId");
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseAjuste_origemAjusteId_key" ON public."RepasseAjuste"("origemAjusteId");
CREATE INDEX IF NOT EXISTS "RepasseAjuste_medicoId_repasseId_idx"   ON public."RepasseAjuste"("medicoId","repasseId");
CREATE INDEX IF NOT EXISTS "RepasseAjuste_repasseId_idx"            ON public."RepasseAjuste"("repasseId");
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_consultaId_fkey"
    FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_reembolsoId_fkey"
    FOREIGN KEY ("reembolsoId") REFERENCES public."Reembolso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_origemAjusteId_fkey"
    FOREIGN KEY ("origemAjusteId") REFERENCES public."RepasseAjuste"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_repasseId_fkey"
    FOREIGN KEY ("repasseId") REFERENCES public."Repasse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_regras_check" CHECK (
    "valorCentavos" > 0 AND
    (("motivo" = 'reembolso'      AND "reembolsoId" IS NOT NULL AND "origemAjusteId" IS NULL) OR
     ("motivo" = 'saldo_anterior' AND "origemAjusteId" IS NOT NULL AND "reembolsoId" IS NULL)) AND
    (("repasseId" IS NULL) = ("aplicadoEm" IS NULL)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- DadosRecebimentoMedico: chave PIX (privada) -----------------
-- Uma por médico. O médico edita na tela dele; o admin só lê. O titular tem
-- de ser o próprio médico (CPF, com o nome dele) ou o CNPJ do PerfilMedico:
-- a igualdade com o CNPJ é conferida no servidor. "titularDocumento" só com
-- dígitos/letras normalizados (11 = CPF, 14 = CNPJ).
CREATE TABLE IF NOT EXISTS public."DadosRecebimentoMedico" (
  "id"               TEXT NOT NULL,
  "medicoId"         TEXT NOT NULL,
  "pixTipo"          TEXT NOT NULL,           -- cpf | cnpj | email | telefone | aleatoria
  "pixChave"         TEXT NOT NULL,
  "titularTipo"      TEXT NOT NULL,           -- pf | pj
  "titularNome"      TEXT NOT NULL,
  "titularDocumento" TEXT NOT NULL,
  "criadoEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DadosRecebimentoMedico_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DadosRecebimentoMedico_medicoId_key" ON public."DadosRecebimentoMedico"("medicoId");
DO $$ BEGIN
  ALTER TABLE public."DadosRecebimentoMedico" ADD CONSTRAINT "DadosRecebimentoMedico_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."DadosRecebimentoMedico" ADD CONSTRAINT "DadosRecebimentoMedico_regras_check" CHECK (
    "pixTipo" IN ('cpf','cnpj','email','telefone','aleatoria') AND
    length("pixChave") BETWEEN 1 AND 140 AND
    length("titularNome") BETWEEN 1 AND 120 AND
    (("titularTipo" = 'pf' AND "titularDocumento" ~ '^[0-9]{11}$') OR
     ("titularTipo" = 'pj' AND "titularDocumento" ~ '^[0-9A-Z]{12}[0-9]{2}$')) AND
    ("pixTipo" <> 'cpf'  OR ("titularTipo" = 'pf' AND "pixChave" = "titularDocumento")) AND
    ("pixTipo" <> 'cnpj' OR ("titularTipo" = 'pj' AND "pixChave" = "titularDocumento")));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Deny-by-default ---------------------------------------------
ALTER TABLE public."RepasseAjuste"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DadosRecebimentoMedico" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."RepasseAjuste"          FROM anon, authenticated;
REVOKE ALL ON TABLE public."DadosRecebimentoMedico" FROM anon, authenticated;

COMMIT;

-- Verificação:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('Repasse','RepasseItem','RepasseAjuste','DadosRecebimentoMedico');   -- todos true
--   SELECT grantee, table_name FROM information_schema.role_table_grants
--    WHERE table_name IN ('Repasse','RepasseItem','RepasseAjuste','DadosRecebimentoMedico')
--      AND grantee IN ('anon','authenticated');                                            -- vazio
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'Repasse_competencia_check';
