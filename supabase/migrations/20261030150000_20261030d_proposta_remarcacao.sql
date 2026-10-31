-- BION — Pendência desenhada dos projetos médios (item 17): remarcação
-- PROPOSTA PELO MÉDICO, com aceite do paciente. Formaliza o desenho de
-- ~/workspace/auditoria-medica-melhorias/medios-agenda.md.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende desta tabela hoje. NÃO adicione o model
-- PropostaRemarcacao em prisma/schema.prisma antes de aplicar esta
-- migração — o client gerado quebraria contra o banco sem a tabela.
-- ⚠️ NÃO reutiliza RemarcacaoPendente: aquela é reserva de multa PAGA
-- PELO PACIENTE via Stripe ("pendente" = aguardando pagamento). A
-- proposta do médico é SEM multa (o imprevisto é do médico) e
-- "pendente" = aguardando ACEITE — semânticas opostas, modelos separados.
--
-- Desenho (documento completo em
-- ~/workspace/auditoria-medica-melhorias/estrategicos-desenhos.md):
-- - O médico propõe 2–3 horários da própria grade (`horarios`: JSON
--   string[] de instantes ISO, convenção dos demais JSON do schema —
--   horariosDisponiveis/pausasSemanais). Horário proposto NÃO reserva
--   a grade: a disponibilidade é reconferida na trava no aceite.
-- - status: pendente | aceita | recusada | expirada | cancelada.
--   O índice único parcial garante UMA proposta pendente por consulta.
-- - `expiraEm` = min(criação + 48 h, data original − 24 h) — calculado
--   pela rota; o banco só guarda. `horarioAceito`/`respondidaEm`
--   registram o desfecho. Recusa/expiração NÃO tocam a consulta.
-- - `medicoId` é o médico da consulta, desnormalizado para as leituras
--   da agenda do médico sem join (a consulta é a fonte; a rota grava
--   os dois do mesmo registro).
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object): pode rodar
-- de novo e antes ou depois de `prisma db push` (que criaria a MESMA
-- tabela — mas NÃO o índice parcial nem o CHECK; confira-os depois de
-- qualquer db push e rode este arquivo de novo se faltarem).
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e
-- nenhum privilégio para os papéis da API do Supabase (anon/authenticated).

CREATE TABLE IF NOT EXISTS public."PropostaRemarcacao" (
  "id"            TEXT NOT NULL,
  "consultaId"    TEXT NOT NULL,
  "medicoId"      TEXT NOT NULL,
  "horarios"      TEXT NOT NULL DEFAULT '[]',
  "status"        TEXT NOT NULL DEFAULT 'pendente',
  "criadaEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiraEm"      TIMESTAMP(3) NOT NULL,
  "respondidaEm"  TIMESTAMP(3),
  "horarioAceito" TIMESTAMP(3),
  CONSTRAINT "PropostaRemarcacao_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PropostaRemarcacao_consultaId_status_idx"
  ON public."PropostaRemarcacao"("consultaId", "status");
CREATE INDEX IF NOT EXISTS "PropostaRemarcacao_medicoId_status_idx"
  ON public."PropostaRemarcacao"("medicoId", "status");
-- No máximo UMA proposta pendente por consulta.
CREATE UNIQUE INDEX IF NOT EXISTS "PropostaRemarcacao_consulta_pendente_key"
  ON public."PropostaRemarcacao"("consultaId")
  WHERE "status" = 'pendente';
DO $$ BEGIN
  ALTER TABLE public."PropostaRemarcacao" ADD CONSTRAINT "PropostaRemarcacao_consultaId_fkey"
    FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."PropostaRemarcacao" ADD CONSTRAINT "PropostaRemarcacao_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."PropostaRemarcacao" ADD CONSTRAINT "PropostaRemarcacao_status_check"
    CHECK ("status" IN ('pendente', 'aceita', 'recusada', 'expirada', 'cancelada'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."PropostaRemarcacao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PropostaRemarcacao" FROM anon, authenticated;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'PropostaRemarcacao'; -- true
--   SELECT indexname FROM pg_indexes WHERE tablename = 'PropostaRemarcacao';  -- 4 índices (pkey + 3)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'PropostaRemarcacao' AND grantee IN ('anon','authenticated'); -- vazio
