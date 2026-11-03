-- BION — Pendência desenhada dos projetos médios (item 18b): bloqueio
-- PARCIAL do dia (ex.: dia 12, das 14h às 16h), sem tocar no bloqueio
-- de dia inteiro que já funciona.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende desta tabela hoje. NÃO adicione o model
-- BloqueioHorario em prisma/schema.prisma antes de aplicar esta
-- migração — o client gerado quebraria contra o banco sem a tabela.
--
-- Por que tabela NOVA, e não colunas em BloqueioAgenda (a "menor mudança"
-- aparente): BloqueioAgenda tem @@unique([medicoId, dia]) — um bloqueio
-- por dia. Colunas inicio/fim anuláveis ali obrigariam a derrubar o
-- unique ou a conviver com linha mista (dia inteiro × parcial) em TODAS
-- as leituras de agenda que hoje só testam a existência da linha
-- (diaBloqueado e cia.). Tabela nova é aditiva de verdade: o bloqueio de
-- dia inteiro fica intocado, e o parcial nasce com enforcement próprio.
-- (Motivo completo em medios-agenda.md, item 18b.)
--
-- Desenho (documento completo em
-- ~/workspace/auditoria-medica-melhorias/estrategicos-desenhos.md):
-- - `dia` = dia civil em America/Sao_Paulo (DATE), como BloqueioAgenda.
-- - `inicioMin`/`fimMin` = minutos do dia civil (0–1440), intervalo
--   [inicio, fim). Vários bloqueios parciais no mesmo dia são
--   permitidos (manhã e tarde) — por isso NÃO há unique; sobreposições
--   são inofensivas (o enforcement considera a união dos intervalos).
-- - `motivo` é PRIVADO do médico, como o do bloqueio de dia.
-- - Enforcement (lote de código): conferirHorarioNaTransacao e
--   validarNovoHorario recusam consulta que intersecta um intervalo;
--   as leituras de agenda marcam os slots cobertos; a semântica
--   confirmar/cancelar para consultas dentro do intervalo é a mesma
--   do bloqueio de dia.
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object): pode rodar
-- de novo e antes ou depois de `prisma db push` (que criaria a MESMA
-- tabela — mas NÃO o CHECK; confira-o depois de qualquer db push e
-- rode este arquivo de novo se faltar).
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e
-- nenhum privilégio para os papéis da API do Supabase (anon/authenticated).

CREATE TABLE IF NOT EXISTS public."BloqueioHorario" (
  "id"        TEXT NOT NULL,
  "medicoId"  TEXT NOT NULL,
  "dia"       DATE NOT NULL,                  -- dia civil em America/Sao_Paulo
  "inicioMin" INTEGER NOT NULL,               -- minutos do dia (0–1439)
  "fimMin"    INTEGER NOT NULL,               -- minutos do dia (1–1440); intervalo [inicio, fim)
  "motivo"    TEXT NOT NULL DEFAULT '',       -- privado (ex.: "exame pessoal"); nunca vai ao paciente
  "criadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BloqueioHorario_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BloqueioHorario_medicoId_dia_idx"
  ON public."BloqueioHorario"("medicoId", "dia");
CREATE INDEX IF NOT EXISTS "BloqueioHorario_dia_idx"
  ON public."BloqueioHorario"("dia");
DO $$ BEGIN
  ALTER TABLE public."BloqueioHorario" ADD CONSTRAINT "BloqueioHorario_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."BloqueioHorario" ADD CONSTRAINT "BloqueioHorario_intervalo_check"
    CHECK ("inicioMin" >= 0 AND "fimMin" <= 1440 AND "inicioMin" < "fimMin");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."BloqueioHorario" ADD CONSTRAINT "BloqueioHorario_motivo_check"
    CHECK (length("motivo") <= 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."BloqueioHorario" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."BloqueioHorario" FROM anon, authenticated;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'BloqueioHorario'; -- true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'BloqueioHorario' AND grantee IN ('anon','authenticated'); -- vazio
