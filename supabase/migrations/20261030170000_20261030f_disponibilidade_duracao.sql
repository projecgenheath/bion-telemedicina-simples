-- BION — Item 34 da auditoria de melhorias da área médica:
-- "disponível agora" sob demanda (disponivelAte) e duração da consulta
-- configurável por médico (duracaoConsultaMin) no PerfilMedico.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende destas colunas hoje: "livre agora" deriva só
-- da grade (diasAtendimento/pausasSemanais) e TODA conferência de
-- horário assume 30 min (DURACAO_CONSULTA_MIN no servidor e espelhos no
-- cliente). NÃO adicione os campos ao model PerfilMedico em
-- prisma/schema.prisma antes de aplicar esta migração — o client
-- gerado passaria a selecioná-los e as leituras de PerfilMedico
-- quebrariam contra o banco sem as colunas.
--
-- Desenho (documento completo em
-- ~/workspace/auditoria-medica-melhorias/estrategicos-desenhos.md):
-- - `disponivelAte` (instante): enquanto > agora, o médico aparece em
--   "livres agora" MESMO fora da grade — o bypass pula SÓ os motivos de
--   grade de motivoMedicoOcupado (dia_sem_atendimento/pausa_semanal).
--   Pix cadastrado, consulta em andamento/próxima, evolução pendente,
--   dia bloqueado e janela vedada continuam barrando. Vencido é
--   ignorado na leitura (sem job) e limpo oportunisticamente.
-- - `duracaoConsultaMin` NULL = 30 (comportamento atual, sem exceção).
--   Faixa 10–240 = a mesma de validarGrade (medico/metricas.ts).
--   Quando preenchida, servidor e clientes leem a duração DO PERFIL
--   (uma fonte só) em vez das constantes-espelho de 30 min — a lista de
--   pontos está no documento de desenho.
--
-- Aditiva e idempotente: pode rodar de novo e antes ou depois de
-- `prisma db push` (que criaria as MESMAS colunas a partir do schema).
-- Sem backfill: NULL/NULL = comportamento de hoje para todos os médicos.

ALTER TABLE public."PerfilMedico" ADD COLUMN IF NOT EXISTS "disponivelAte" TIMESTAMP(3);
ALTER TABLE public."PerfilMedico" ADD COLUMN IF NOT EXISTS "duracaoConsultaMin" INTEGER;

DO $$ BEGIN
  ALTER TABLE public."PerfilMedico" ADD CONSTRAINT "PerfilMedico_duracao_check"
    CHECK ("duracaoConsultaMin" IS NULL
           OR ("duracaoConsultaMin" >= 10 AND "duracaoConsultaMin" <= 240));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verificação:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'PerfilMedico'
--      AND column_name IN ('disponivelAte','duracaoConsultaMin');        -- 2 linhas
--   SELECT count(*) FROM public."PerfilMedico"
--    WHERE "disponivelAte" IS NOT NULL OR "duracaoConsultaMin" IS NOT NULL; -- 0 (na aplicação)
