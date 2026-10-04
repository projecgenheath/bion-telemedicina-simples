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
--   * a multa entra como item próprio do repasse ("RepasseItem".tipo), então
--     uma consulta pode ter o item dela e itens de multa em dias diferentes;
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

-- ---------- Fórmula (vale no Repasse e, sem "ajustes", no RepasseItem) --
--   liquido = bruto − comissao − taxas − reembolsos + multas − ajustes
--   bruto      = valor pago da consulta (0 nos itens de multa)
--   comissao   = 10% do bruto (só do bruto; multa não paga comissão)
--   taxas      = taxa do gateway (0 até o pagamento informar)
--   reembolsos = parte do MÉDICO em reembolsos feitos ANTES do fechamento
--   multas     = parte do MÉDICO na multa (50%), no dia em que foi paga
--   ajustes    = descontos de reembolsos feitos DEPOIS de um fechamento
--                anterior (soma de RepasseAjuste.valorAplicadoCentavos)
-- O banco confere a fórmula e que nada fica negativo.

-- ---------- Repasse: competência diária + comissão, ajustes, pagamento ----
-- Só existe a partir do fechamento (23:30): não há linha "aberta" durante o
-- dia — a prévia do dia é calculada na hora. status: fechado | pago.
ALTER TABLE public."Repasse" DROP CONSTRAINT IF EXISTS "Repasse_competencia_check";
ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_competencia_check"
  CHECK ("competencia" ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
         AND to_char(to_date("competencia", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "competencia");
ALTER TABLE public."Repasse" DROP CONSTRAINT IF EXISTS "Repasse_status_check";
ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_status_check" CHECK ("status" IN ('fechado', 'pago'));
ALTER TABLE public."Repasse" ALTER COLUMN "status" SET DEFAULT 'fechado';
ALTER TABLE public."Repasse" ALTER COLUMN "fechadoEm" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public."Repasse" ALTER COLUMN "fechadoEm" SET NOT NULL;

ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "comissaoCentavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "ajustesCentavos"  INTEGER NOT NULL DEFAULT 0;
-- Caminho no bucket PRIVADO de comprovantes (nunca URL pública).
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "comprovantePath"  TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pagoPorId"        TEXT;   -- User.id do admin
-- Cópia da chave usada no pagamento: trocar a chave depois não muda o histórico.
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTipo"          TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixChave"         TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTitularNome"   TEXT;
ALTER TABLE public."Repasse" ADD COLUMN IF NOT EXISTS "pixTitularDocumento" TEXT;

-- Alvo das FKs compostas (repasseId, medicoId): item/ajuste de um médico não
-- cai no repasse de outro.
CREATE UNIQUE INDEX IF NOT EXISTS "Repasse_id_medicoId_key" ON public."Repasse"("id","medicoId");

DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_valores_check" CHECK (
    "brutoCentavos" >= 0 AND "comissaoCentavos" >= 0 AND "taxasCentavos" >= 0 AND
    "reembolsosCentavos" >= 0 AND "multasCentavos" >= 0 AND "ajustesCentavos" >= 0 AND
    "liquidoCentavos" >= 0 AND
    "liquidoCentavos" = "brutoCentavos" - "comissaoCentavos" - "taxasCentavos"
                        - "reembolsosCentavos" + "multasCentavos" - "ajustesCentavos");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Pago exige data, quem pagou, comprovante e a cópia completa da chave PIX.
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_pago_check" CHECK (
    "status" <> 'pago' OR (
      "pagoEm" IS NOT NULL AND "pagoPorId" IS NOT NULL AND "comprovantePath" IS NOT NULL AND
      "pixTipo" IS NOT NULL AND "pixChave" IS NOT NULL AND
      "pixTitularNome" IS NOT NULL AND "pixTitularDocumento" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."Repasse" ADD CONSTRAINT "Repasse_pagoPorId_fkey"
    FOREIGN KEY ("pagoPorId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- RepasseItem: consulta OU multa ------------------------------
-- tipo = 'consulta'           → a consulta realizada (uma vez só por consulta)
-- tipo = 'multa_cancelamento' → parte do médico na multa de cancelamento
--                               (uma por consulta), bruto = comissão = 0
-- tipo = 'multa_remarcacao'   → parte do médico na multa de UMA remarcação
--                               paga (uma por remarcação), bruto = comissão = 0
-- Unicidade por "chave" (texto montado pelo servidor e conferido pela CHECK):
--   'consulta:<consultaId>' | 'multa_cancelamento:<consultaId>' |
--   'multa_remarcacao:<remarcacaoId>'.
-- (Índice único comum, que o Prisma 6 entende; índice parcial ele não
-- representa no schema e um `db push` o apagaria.)
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "medicoId"         TEXT NOT NULL;
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "tipo"             TEXT NOT NULL;
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "remarcacaoId"     TEXT;
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "chave"            TEXT NOT NULL;
ALTER TABLE public."RepasseItem" ADD COLUMN IF NOT EXISTS "comissaoCentavos" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS public."RepasseItem_consultaId_key";
CREATE INDEX IF NOT EXISTS "RepasseItem_consultaId_idx"        ON public."RepasseItem"("consultaId");
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseItem_chave_key"        ON public."RepasseItem"("chave");
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseItem_remarcacaoId_key" ON public."RepasseItem"("remarcacaoId");

-- Repasse é registro financeiro: apagar não leva os itens junto (RESTRICT).
ALTER TABLE public."RepasseItem" DROP CONSTRAINT IF EXISTS "RepasseItem_repasseId_fkey";
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_repasseId_medicoId_fkey"
    FOREIGN KEY ("repasseId","medicoId") REFERENCES public."Repasse"("id","medicoId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A consulta do item é do MESMO médico do repasse, e a multa de remarcação
-- é de uma remarcação da MESMA consulta. ON UPDATE RESTRICT: trocar o médico
-- de uma consulta que já entrou num repasse fica bloqueado.
CREATE UNIQUE INDEX IF NOT EXISTS "Consulta_id_medicoId_key"           ON public."Consulta"("id","medicoId");
CREATE UNIQUE INDEX IF NOT EXISTS "RemarcacaoPendente_id_consultaId_key" ON public."RemarcacaoPendente"("id","consultaId");
ALTER TABLE public."RepasseItem" DROP CONSTRAINT IF EXISTS "RepasseItem_consultaId_fkey";
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_consultaId_medicoId_fkey"
    FOREIGN KEY ("consultaId","medicoId") REFERENCES public."Consulta"("id","medicoId") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_remarcacaoId_consultaId_fkey"
    FOREIGN KEY ("remarcacaoId","consultaId") REFERENCES public."RemarcacaoPendente"("id","consultaId") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_tipo_check" CHECK (
    ("tipo" = 'consulta' AND "remarcacaoId" IS NULL
       AND "chave" = 'consulta:' || "consultaId") OR
    ("tipo" = 'multa_cancelamento' AND "remarcacaoId" IS NULL
       AND "brutoCentavos" = 0 AND "comissaoCentavos" = 0
       AND "chave" = 'multa_cancelamento:' || "consultaId") OR
    ("tipo" = 'multa_remarcacao' AND "remarcacaoId" IS NOT NULL
       AND "brutoCentavos" = 0 AND "comissaoCentavos" = 0
       AND "chave" = 'multa_remarcacao:' || "remarcacaoId"));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseItem" ADD CONSTRAINT "RepasseItem_valores_check" CHECK (
    "brutoCentavos" >= 0 AND "comissaoCentavos" >= 0 AND "taxasCentavos" >= 0 AND
    "reembolsosCentavos" >= 0 AND "multasCentavos" >= 0 AND "liquidoCentavos" >= 0 AND
    "liquidoCentavos" = "brutoCentavos" - "comissaoCentavos" - "taxasCentavos"
                        - "reembolsosCentavos" + "multasCentavos");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- RepasseAjuste: desconto em repasse seguinte -----------------
-- motivo = 'reembolso'      → reembolso efetivado DEPOIS de a consulta (ou a
--                             multa) já ter entrado num repasse fechado.
--                             "reembolsoId" e "consultaId" obrigatórios;
--                             "reembolsoId" único (desconta uma vez só).
-- motivo = 'saldo_anterior' → sobra de um ajuste aplicado em parte (o repasse
--                             fechou em 0). "origemAjusteId" único; a
--                             consulta é opcional (vem da origem).
-- Pendente: repasseId, aplicadoEm nulos e valorAplicadoCentavos = 0.
-- Aplicado: 0 < valorAplicadoCentavos ≤ valorCentavos; se for menor, o resto
-- (valor − aplicado) vira um 'saldo_anterior' pendente.
CREATE TABLE IF NOT EXISTS public."RepasseAjuste" (
  "id"                    TEXT NOT NULL,
  "medicoId"              TEXT NOT NULL,
  "consultaId"            TEXT,
  "motivo"                TEXT NOT NULL,
  "reembolsoId"           TEXT,
  "origemAjusteId"        TEXT,
  "valorCentavos"         INTEGER NOT NULL,          -- parte do MÉDICO a descontar (> 0)
  "valorAplicadoCentavos" INTEGER NOT NULL DEFAULT 0, -- quanto foi descontado no repasse
  "repasseId"             TEXT,
  "criadoEm"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "aplicadoEm"            TIMESTAMP(3),
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
-- Composta: a consulta do ajuste é do MESMO médico (MATCH SIMPLE: sem
-- consulta, não confere).
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_consultaId_medicoId_fkey"
    FOREIGN KEY ("consultaId","medicoId") REFERENCES public."Consulta"("id","medicoId") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_reembolsoId_fkey"
    FOREIGN KEY ("reembolsoId") REFERENCES public."Reembolso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Composta: a sobra ('saldo_anterior') fica com o MESMO médico da origem.
CREATE UNIQUE INDEX IF NOT EXISTS "RepasseAjuste_id_medicoId_key" ON public."RepasseAjuste"("id","medicoId");
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_origemAjusteId_medicoId_fkey"
    FOREIGN KEY ("origemAjusteId","medicoId") REFERENCES public."RepasseAjuste"("id","medicoId") ON DELETE RESTRICT ON UPDATE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  -- Composta: o repasse onde o desconto cai é do MESMO médico.
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_repasseId_medicoId_fkey"
    FOREIGN KEY ("repasseId","medicoId") REFERENCES public."Repasse"("id","medicoId") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_regras_check" CHECK (
    "valorCentavos" > 0 AND
    (("motivo" = 'reembolso'      AND "reembolsoId" IS NOT NULL AND "consultaId" IS NOT NULL AND "origemAjusteId" IS NULL) OR
     ("motivo" = 'saldo_anterior' AND "origemAjusteId" IS NOT NULL AND "reembolsoId" IS NULL)) AND
    (("repasseId" IS NULL AND "aplicadoEm" IS NULL AND "valorAplicadoCentavos" = 0) OR
     ("repasseId" IS NOT NULL AND "aplicadoEm" IS NOT NULL
        AND "valorAplicadoCentavos" > 0 AND "valorAplicadoCentavos" <= "valorCentavos")));
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
