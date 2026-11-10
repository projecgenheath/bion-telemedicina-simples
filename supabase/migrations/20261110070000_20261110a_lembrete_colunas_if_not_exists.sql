-- 20261110a — Alinha o schema do Lembrete às colunas que já existem em
-- produção (feitoEm, ultimoDisparoEm, diaSemana). Dono: Admin.
--
-- ⚠️ NÃO APLICADA. Aplicar só com ok do Alisson (merge pelo Presidente).
-- Em produção a aplicação é um no-op: as três colunas já existem com estes
-- tipos (confirmado em 10/11/2026 por SELECT em information_schema.columns
-- no projeto tnygegihboiyptrnmaqt):
--   feitoEm, ultimoDisparoEm: timestamp without time zone, precisão 3, NULL
--   diaSemana: integer (int4), NULL
-- Sem default, sem CHECK nova, sem backfill.
--
-- Compatível com 20261104a_lembrete_feito_e_disparo.sql (já no repositório):
-- aquela migration cria feitoEm e ultimoDisparoEm como TIMESTAMP(3), os
-- mesmos tipos, mas SEM "IF NOT EXISTS" e SEM diaSemana. Não foi registrada
-- no schema_migrations de produção (as colunas entraram pelo SQL Editor).
-- Esta migration não altera a 20261104a. Em ambiente novo, rodar as duas é
-- seguro se 20261104a vier antes (esta só adiciona diaSemana e ignora as
-- outras). Rodar esta sozinha também basta para os três campos. Rodar a
-- 20261104a num banco que já tem as colunas FALHA (não tem IF NOT EXISTS) —
-- não rode a 20261104a em produção.
--
-- Rollback (só se as colunas tiverem sido criadas por esta migration e
-- estiverem vazias; em produção NÃO dropar):
--   ALTER TABLE "Lembrete" DROP COLUMN IF EXISTS "diaSemana";
--   ALTER TABLE "Lembrete" DROP COLUMN IF EXISTS "ultimoDisparoEm";
--   ALTER TABLE "Lembrete" DROP COLUMN IF EXISTS "feitoEm";

ALTER TABLE "Lembrete" ADD COLUMN IF NOT EXISTS "feitoEm" TIMESTAMP(3);
ALTER TABLE "Lembrete" ADD COLUMN IF NOT EXISTS "ultimoDisparoEm" TIMESTAMP(3);
ALTER TABLE "Lembrete" ADD COLUMN IF NOT EXISTS "diaSemana" INTEGER;
