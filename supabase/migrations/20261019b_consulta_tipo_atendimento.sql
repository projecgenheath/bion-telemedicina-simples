-- =====================================================================
-- BION — Teleconsulta v2: tipo do atendimento e consulta de origem
-- (renovação de receita, retorno, segunda opinião). Dono: Médicos.
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE com apply_migration,
-- depois do backup e ANTES do merge do PR que a acompanha.
--
-- Só ADITIVA: duas colunas novas em "Consulta" (uma com default, outra
-- opcional), FK para a própria "Consulta" com ON DELETE SET NULL, índice e
-- trava de domínio. As linhas existentes recebem 'padrao' e origem nula,
-- então nenhuma viola a trava. Sem BEGIN/COMMIT (o apply_migration já roda
-- numa transação). Idempotente (IF NOT EXISTS / DROP IF EXISTS + ADD).
-- Reversão: DROP CONSTRAINT dos dois, DROP INDEX e DROP COLUMN das duas.
-- =====================================================================

ALTER TABLE public."Consulta"
  ADD COLUMN IF NOT EXISTS "tipoAtendimento" TEXT NOT NULL DEFAULT 'padrao',
  ADD COLUMN IF NOT EXISTS "consultaOrigemId" TEXT NULL;

ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_consultaOrigemId_fkey";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_consultaOrigemId_fkey"
  FOREIGN KEY ("consultaOrigemId") REFERENCES public."Consulta"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Consulta_consultaOrigemId_idx"
  ON public."Consulta"("consultaOrigemId");

ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_tipoAtendimento_check";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_tipoAtendimento_check"
  CHECK ("tipoAtendimento" IN (
    'padrao',
    'renovacao',
    'retorno',
    'segunda_opiniao'
  ));
