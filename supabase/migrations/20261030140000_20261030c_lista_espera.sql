-- BION — Item 29 da auditoria de melhorias da área médica: lista de
-- espera / encaixe (paciente entra na fila de um médico; vaga liberada
-- notifica o primeiro da fila, com prazo para aceitar).
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende desta tabela hoje. NÃO adicione o model
-- ListaEspera em prisma/schema.prisma antes de aplicar esta migração —
-- o client gerado quebraria contra o banco sem a tabela.
--
-- Desenho (documento completo em
-- ~/workspace/auditoria-medica-melhorias/estrategicos-desenhos.md):
-- - Uma linha por entrada do paciente na fila de UM médico. A POSIÇÃO
--   não é gravada: é a ordem de `criadoEm` entre as entradas
--   `aguardando` do mesmo médico (FIFO derivada, sem corrida de update).
-- - status: aguardando | notificado | aceito | expirado | cancelado |
--   atendido. Só `aguardando` e `notificado` são estados ATIVOS — o
--   índice único parcial garante no máximo UMA entrada ativa por
--   (paciente, médico); quem saiu/expirou pode entrar de novo.
-- - `notificadoEm`/`expiraEm` marcam a oferta viva: vaga liberada
--   (cancelamento de consulta futura, dia desbloqueado) promove o
--   primeiro `aguardando` a `notificado` com prazo (desenho: 30 min)
--   para aceitar; vencido sem aceite → `expirado` e a fila anda.
-- - `consultaId` guarda a consulta criada no aceite (SetNull se a
--   consulta sumir: a entrada é histórico, não pode quebrar).
-- - `especialidade` é snapshot da especialidade do médico na entrada
--   (a fila é do médico, não da especialidade — serve à exibição sem
--   join e sobrevive a troca de especialidade do perfil).
--
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object): pode rodar
-- de novo e antes ou depois de `prisma db push` (que criaria a MESMA
-- tabela — mas NÃO o índice parcial nem o CHECK; confira-os depois de
-- qualquer db push e rode este arquivo de novo se faltarem).
-- Deny-by-default como as demais tabelas: RLS ligado, sem políticas, e
-- nenhum privilégio para os papéis da API do Supabase (anon/authenticated).

CREATE TABLE IF NOT EXISTS public."ListaEspera" (
  "id"            TEXT NOT NULL,
  "pacienteId"    TEXT NOT NULL,
  "medicoId"      TEXT NOT NULL,
  "especialidade" TEXT NOT NULL DEFAULT '',
  "status"        TEXT NOT NULL DEFAULT 'aguardando',
  "criadoEm"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notificadoEm"  TIMESTAMP(3),
  "expiraEm"      TIMESTAMP(3),
  "consultaId"    TEXT,
  CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id")
);
-- Fila do médico: FIFO por (medicoId, status, criadoEm).
CREATE INDEX IF NOT EXISTS "ListaEspera_medicoId_status_criadoEm_idx"
  ON public."ListaEspera"("medicoId", "status", "criadoEm");
-- Entradas de um paciente (minhas filas / auto-saída ao agendar).
CREATE INDEX IF NOT EXISTS "ListaEspera_pacienteId_status_idx"
  ON public."ListaEspera"("pacienteId", "status");
-- No máximo UMA entrada ativa por (paciente, médico).
CREATE UNIQUE INDEX IF NOT EXISTS "ListaEspera_paciente_medico_ativa_key"
  ON public."ListaEspera"("pacienteId", "medicoId")
  WHERE "status" IN ('aguardando', 'notificado');
DO $$ BEGIN
  ALTER TABLE public."ListaEspera" ADD CONSTRAINT "ListaEspera_pacienteId_fkey"
    FOREIGN KEY ("pacienteId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."ListaEspera" ADD CONSTRAINT "ListaEspera_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."ListaEspera" ADD CONSTRAINT "ListaEspera_consultaId_fkey"
    FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."ListaEspera" ADD CONSTRAINT "ListaEspera_status_check"
    CHECK ("status" IN ('aguardando', 'notificado', 'aceito', 'expirado', 'cancelado', 'atendido'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public."ListaEspera" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ListaEspera" FROM anon, authenticated;

-- Verificação:
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'ListaEspera';   -- true
--   SELECT indexname FROM pg_indexes WHERE tablename = 'ListaEspera';    -- 4 índices (pkey + 3)
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'ListaEspera' AND grantee IN ('anon','authenticated'); -- vazio
