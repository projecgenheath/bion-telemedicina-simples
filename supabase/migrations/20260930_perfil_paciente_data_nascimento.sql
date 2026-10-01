-- BION — M4 (auditoria do perfil do paciente): data de nascimento do paciente
-- (PerfilPaciente.dataNascimento). A idade passa a ser calculada a partir dela;
-- a coluna "idade" continua existindo para quem ainda não informou a data.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- Coluna nula, sem backfill. Idempotente: pode rodar antes ou depois de
-- `prisma db push` (que cria a MESMA coluna, tipo DATE).
--
-- ⚠️ O código deste PR lê a coluna (o Prisma seleciona todas as colunas do
-- PerfilPaciente): fazer deploy SEM esta migração quebra o carregamento do
-- perfil do paciente. Aplicar ANTES (ou junto) do deploy.

ALTER TABLE "PerfilPaciente" ADD COLUMN IF NOT EXISTS "dataNascimento" DATE;
