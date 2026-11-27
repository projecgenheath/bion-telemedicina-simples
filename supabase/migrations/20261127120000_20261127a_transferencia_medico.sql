-- BION — Modelo de pagamento de 21/11/2026 (decisão do Alisson).
-- 1) Tabela "TransferenciaMedico": uma linha por consulta realizada (e por
--    multa aplicada). A cobrança nasce na conta da PLATAFORMA; nada é
--    creditado no pagamento. A transferência ao médico (90% menos a taxa
--    real do cartão) é criada no desfecho "realizada" e enviada com
--    source_transaction (obrigatório no Brasil; o saldo fica pending na
--    conta do médico até a charge ficar disponível, ~30 dias corridos).
--    Multa ≤ 24 h: a metade do médico é transferida quando a multa é
--    aplicada; a taxa sai dessa metade (liquido = multas − taxas).
--    status: pendente | enviada | falhou. "stripeTransferId" preenchido =
--    enviada. UNIQUE em "consultaId"/"remarcacaoId": repetição do desfecho
--    ou webhook concorrente nunca cria duas transferências.
-- 2) "RepasseAjuste" ganha o motivo 'taxa_reembolso': no reembolso a taxa
--    do cartão NÃO é devolvida ao médico (o #137 sai deste modelo); ela
--    fica no saldo da plataforma e pode ser descontada de recebimento
--    futuro do médico daquela consulta.
-- 3) "Consulta"."reembolsoAutomaticoEm": prazo do reembolso integral
--    automático + cancelamento (regras 4 e 5: falta do médico sem
--    remarcação; falta do paciente sem remarcação em 7 dias corridos).
--    Remarcação dentro do prazo limpa o campo. O cron espera-medico varre.
--
-- ⚠️ Aplicar em produção ANTES do merge, só com ok do Alisson.
-- Aditiva e idempotente (IF NOT EXISTS / duplicate_object).

BEGIN;

CREATE TABLE IF NOT EXISTS public."TransferenciaMedico" (
  "id"               TEXT PRIMARY KEY,
  "consultaId"       TEXT,
  "remarcacaoId"     TEXT,
  "medicoId"         TEXT NOT NULL,
  "pagamentoId"      TEXT,
  "tipo"             TEXT NOT NULL,
  "brutoCentavos"    INTEGER NOT NULL DEFAULT 0,
  "comissaoCentavos" INTEGER NOT NULL DEFAULT 0,
  "taxasCentavos"    INTEGER NOT NULL DEFAULT 0,
  "multasCentavos"   INTEGER NOT NULL DEFAULT 0,
  "liquidoCentavos"  INTEGER NOT NULL,
  "status"           TEXT NOT NULL DEFAULT 'pendente',
  "stripeTransferId" TEXT,
  "criadaEm"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "enviadaEm"        TIMESTAMP(3),
  "tentativas"       INTEGER NOT NULL DEFAULT 0,
  "erro"             TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS "TransferenciaMedico_consultaId_key"   ON public."TransferenciaMedico" ("consultaId");
CREATE UNIQUE INDEX IF NOT EXISTS "TransferenciaMedico_remarcacaoId_key" ON public."TransferenciaMedico" ("remarcacaoId");
CREATE UNIQUE INDEX IF NOT EXISTS "TransferenciaMedico_stripeTransferId_key" ON public."TransferenciaMedico" ("stripeTransferId");
CREATE INDEX IF NOT EXISTS "TransferenciaMedico_medicoId_idx" ON public."TransferenciaMedico" ("medicoId");
CREATE INDEX IF NOT EXISTS "TransferenciaMedico_status_idx"   ON public."TransferenciaMedico" ("status");

DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_medicoId_fkey"
    FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_consultaId_fkey"
    FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_remarcacaoId_fkey"
    FOREIGN KEY ("remarcacaoId") REFERENCES public."RemarcacaoPendente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_pagamentoId_fkey"
    FOREIGN KEY ("pagamentoId") REFERENCES public."Pagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_tipo_check"
    CHECK ("tipo" IN ('consulta', 'multa_cancelamento', 'multa_remarcacao'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_status_check"
    CHECK ("status" IN ('pendente', 'enviada', 'falhou'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Fórmula única do contrato: liquido = bruto − comissão − taxas + multas.
-- Nada negativo.
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_valores_check"
    CHECK ("brutoCentavos" >= 0 AND "comissaoCentavos" >= 0 AND "taxasCentavos" >= 0
       AND "multasCentavos" >= 0 AND "liquidoCentavos" >= 0
       AND "liquidoCentavos" = "brutoCentavos" - "comissaoCentavos" - "taxasCentavos" + "multasCentavos");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- consultaId nulo SÓ em multa de remarcação (que usa remarcacaoId).
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_origem_check"
    CHECK (("tipo" = 'multa_remarcacao' AND "remarcacaoId" IS NOT NULL AND "consultaId" IS NULL)
        OR ("tipo" <> 'multa_remarcacao' AND "consultaId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Enviada = transfer id + data; pendente/falhou ainda não têm transfer id.
DO $$ BEGIN
  ALTER TABLE public."TransferenciaMedico" ADD CONSTRAINT "TransferenciaMedico_enviada_check"
    CHECK (("status" = 'enviada' AND "stripeTransferId" IS NOT NULL AND "enviadaEm" IS NOT NULL)
        OR ("status" <> 'enviada' AND "stripeTransferId" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Padrão da casa: RLS ligado, sem policies (Prisma usa o papel postgres).
ALTER TABLE public."TransferenciaMedico" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."TransferenciaMedico" FROM anon, authenticated;

-- RepasseAjuste: motivo 'taxa_reembolso' (taxa do cartão retida no reembolso,
-- descontável de recebimento futuro do médico daquela consulta). Mesma forma
-- do 'reembolso': reembolsoId + consultaId obrigatórios, únicos por reembolso.
ALTER TABLE public."RepasseAjuste" DROP CONSTRAINT IF EXISTS "RepasseAjuste_regras_check";
ALTER TABLE public."RepasseAjuste" ADD CONSTRAINT "RepasseAjuste_regras_check" CHECK (
  "valorCentavos" > 0 AND
  (("motivo" = 'reembolso'      AND "reembolsoId" IS NOT NULL AND "consultaId" IS NOT NULL AND "origemAjusteId" IS NULL AND "chargebackId" IS NULL) OR
   ("motivo" = 'saldo_anterior' AND "origemAjusteId" IS NOT NULL AND "reembolsoId" IS NULL AND "chargebackId" IS NULL) OR
   ("motivo" = 'chargeback'     AND "chargebackId" IS NOT NULL AND "reembolsoId" IS NULL AND "origemAjusteId" IS NULL) OR
   ("motivo" = 'taxa_reembolso' AND "reembolsoId" IS NOT NULL AND "consultaId" IS NOT NULL AND "origemAjusteId" IS NULL AND "chargebackId" IS NULL)) AND
  (("repasseId" IS NULL AND "aplicadoEm" IS NULL AND "valorAplicadoCentavos" = 0) OR
   ("repasseId" IS NOT NULL AND "aplicadoEm" IS NOT NULL
      AND "valorAplicadoCentavos" > 0 AND "valorAplicadoCentavos" <= "valorCentavos")));

-- Prazo do reembolso automático (regras 4 e 5). Nulo = sem prazo ativo.
ALTER TABLE public."Consulta" ADD COLUMN IF NOT EXISTS "reembolsoAutomaticoEm" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Consulta_reembolsoAutomaticoEm_idx"
  ON public."Consulta" ("reembolsoAutomaticoEm") WHERE "reembolsoAutomaticoEm" IS NOT NULL;

-- Taxa real da cobrança da multa de remarcação (modelo 21/11): sai da
-- metade do médico na TransferenciaMedico (regra 7).
ALTER TABLE public."RemarcacaoPendente" ADD COLUMN IF NOT EXISTS "stripeTaxaCentavos" INTEGER;

-- Backfill do prazo nas consultas já pagas em falta/aguardando (modelo
-- antigo): 7 dias corridos a partir de agora, para o cron novo alcançar.
UPDATE public."Consulta"
   SET "reembolsoAutomaticoEm" = CURRENT_TIMESTAMP + INTERVAL '7 days'
 WHERE "pago" = TRUE
   AND "status" IN ('falta_paciente', 'aguardando_reagendamento')
   AND "reembolsoAutomaticoEm" IS NULL
   -- Só modelo novo (plataforma, sem repasse PIX): nada de estorno automático
   -- nas consultas antigas creditadas na conta do médico.
   AND NOT EXISTS (
     SELECT 1 FROM public."Pagamento" p
      WHERE p."consultaId" = public."Consulta"."id" AND p."stripeContaMedico" IS NOT NULL
   )
   AND NOT EXISTS (
     SELECT 1 FROM public."RepasseItem" ri WHERE ri."consultaId" = public."Consulta"."id"
   );

COMMIT;

-- Verificação:
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public."TransferenciaMedico"'::regclass;
--   SELECT relrowsecurity FROM pg_class WHERE relname = 'TransferenciaMedico'; -- true
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'RepasseAjuste_regras_check'; -- inclui taxa_reembolso
