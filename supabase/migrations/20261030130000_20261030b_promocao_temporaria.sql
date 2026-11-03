-- BION — Item 31 da auditoria de melhorias da área médica: promoção
-- temporária com reversão automática (promocaoValor + promocaoAte no
-- PerfilMedico). Formaliza o desenho esboçado no comentário de
-- src/components/bion/medico/sheets/PromocoesSheet.tsx.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- ⚠️ NENHUM código depende destas colunas hoje: a PromocoesSheet atual
-- sobrescreve o `valor` vigente (permanente). NÃO adicione os campos ao
-- model PerfilMedico em prisma/schema.prisma antes de aplicar esta
-- migração — o client gerado passaria a selecioná-los e TODA leitura de
-- PerfilMedico (diretório, agendamento, livres-agora) quebraria contra o
-- banco sem as colunas.
--
-- Desenho (documento completo em
-- ~/workspace/auditoria-medica-melhorias/estrategicos-desenhos.md):
-- - `promocaoValor` (reais, Float como o `valor`) e `promocaoAte`
--   (instante em que a promoção vence) andam JUNTOS: os dois NULL =
--   sem promoção; os dois preenchidos = promoção vigente até `promocaoAte`.
--   O CHECK "par" garante que nunca exista um sem o outro.
-- - `valor` NÃO é tocado pela promoção: o preço normal fica intacto e a
--   "reversão" é o vencimento de `promocaoAte`, não uma escrita de volta.
-- - Preço efetivo é calculado na LEITURA (helper único no servidor):
--   promocaoValor quando preenchido e promocaoAte > agora; senão `valor`.
--   Consulta já agendada NUNCA muda de preço: o POST /api/consultas copia
--   o valor vigente para Consulta.valor na criação (snapshot).
-- - Um cron diário (nova rota /api/cron/promocoes, padrão da casa) só
--   LIMPA os pares vencidos e audita — a expiração não depende dele,
--   porque a leitura ignora promoção vencida.
--
-- Aditiva e idempotente: pode rodar de novo e antes ou depois de
-- `prisma db push` (que criaria as MESMAS colunas a partir do schema).
-- Sem backfill: todo médico nasce sem promoção (NULL/NULL).

ALTER TABLE public."PerfilMedico" ADD COLUMN IF NOT EXISTS "promocaoValor" DOUBLE PRECISION;
ALTER TABLE public."PerfilMedico" ADD COLUMN IF NOT EXISTS "promocaoAte" TIMESTAMP(3);

-- Os dois campos andam juntos (os dois NULL ou os dois preenchidos).
DO $$ BEGIN
  ALTER TABLE public."PerfilMedico" ADD CONSTRAINT "PerfilMedico_promocao_par_check"
    CHECK (("promocaoValor" IS NULL) = ("promocaoAte" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Promoção é desconto: nunca zero nem negativa. (O teto de 50% sobre o
-- `valor` vigente é regra da rota que grava — CHECK não enxerga a outra
-- coluna com comparação de negócio sem custo; o piso > 0 fica no banco.)
DO $$ BEGIN
  ALTER TABLE public."PerfilMedico" ADD CONSTRAINT "PerfilMedico_promocaoValor_check"
    CHECK ("promocaoValor" IS NULL OR "promocaoValor" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Varredura do cron de limpeza: só promoções existentes interessam.
CREATE INDEX IF NOT EXISTS "PerfilMedico_promocaoAte_idx"
  ON public."PerfilMedico"("promocaoAte") WHERE "promocaoAte" IS NOT NULL;

-- Verificação:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'PerfilMedico'
--      AND column_name IN ('promocaoValor','promocaoAte');                 -- 2 linhas
--   SELECT count(*) FROM public."PerfilMedico"
--    WHERE ("promocaoValor" IS NULL) <> ("promocaoAte" IS NULL);          -- 0
