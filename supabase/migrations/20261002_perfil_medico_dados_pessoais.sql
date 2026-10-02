-- BION — Médicos (fase 2, parte 1): dados pessoais do médico no perfil
-- (PerfilMedico.dataNascimento, genero, telefone) e CNPJ (PerfilMedico.cnpj:
-- 14 caracteres normalizados, numérico ou alfanumérico, ou '' quando não
-- informado).
--
-- ⚠️ APLICAR ANTES DO DEPLOY DO CÓDIGO. O Prisma seleciona TODAS as colunas do
-- PerfilMedico (bootstrap, /api/consultas, /api/avaliacoes, /api/medicos…):
-- publicar o código sem esta migração quebra o carregamento do app para TODOS
-- os papéis (paciente, médico e admin), não só para o médico.
--
-- Aditiva e idempotente: só ADD COLUMN IF NOT EXISTS (sem backfill, sem
-- reescrita de tabela) + CHECK protegido por consulta a pg_constraint. Pode
-- rodar antes ou depois de `prisma db push` (que cria as MESMAS colunas).
-- Mesma convenção do paciente: dataNascimento DATE (dia de calendário) e
-- genero TEXT (rótulo "Sexo" na UI).
--
-- Privacidade: estes campos são lidos/gravados só pelo próprio médico em
-- /api/medico/perfil e NÃO fazem parte do diretório público de médicos.
-- RLS do PerfilMedico continua ativo e sem políticas (deny by default).

ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "dataNascimento" DATE;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "genero" TEXT;
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "telefone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "PerfilMedico" ADD COLUMN IF NOT EXISTS "cnpj" TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PerfilMedico_genero_check'
      AND conrelid = '"PerfilMedico"'::regclass
  ) THEN
    ALTER TABLE "PerfilMedico" ADD CONSTRAINT "PerfilMedico_genero_check"
      CHECK ("genero" IS NULL OR "genero" IN ('Feminino', 'Masculino', 'Outro', 'Prefiro não informar'));
  END IF;
END $$;
