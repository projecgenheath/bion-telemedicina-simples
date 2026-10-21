-- =====================================================================
-- BION — Admin: espera do médico (paciente na sala, médico ainda não entrou)
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE no SQL Editor do
-- Supabase, DEPOIS do backup e do ok do Alisson, e ANTES do merge do PR.
-- Depende do #64 (já em produção): a consulta remarcada grava
-- "Consulta"."consultaOrigemId" apontando para a antiga (sem ALTER aqui).
--
-- O que faz (só aditivo):
--   Tabela nova "EsperaMedico", uma por consulta.
--   status: aguardando | medico_entrou | expirada | remarcando | cancelada | remarcada
--   remarcando = remarcação para médico mais caro esperando o pagamento da
--     diferença; a consulta nova fica reservada até "reservaExpiraEm" (10 min).
--   iniciadaEm = quando o paciente atendeu (atendidaPacienteEm);
--   expiraEm   = max(horário marcado, iniciadaEm) + 10 min (servidor);
--   diferencaCentavos (remarcada): valor novo − valor antigo, em centavos
--     (> 0 o paciente paga a diferença; < 0 recebe de volta; 0 nada).
-- Deny-by-default: RLS ligada, sem políticas, REVOKE de anon/authenticated.
-- Idempotente (IF NOT EXISTS; DROP CONSTRAINT IF EXISTS + ADD). Sem BEGIN/COMMIT
-- (o SQL Editor do Supabase já roda o lote numa transação).
-- Reversão: DROP TABLE IF EXISTS public."EsperaMedico";
-- =====================================================================


CREATE TABLE IF NOT EXISTS public."EsperaMedico" (
  "id"                TEXT NOT NULL,
  "consultaId"        TEXT NOT NULL,
  "iniciadaEm"        TIMESTAMP(3) NOT NULL,
  "expiraEm"          TIMESTAMP(3) NOT NULL,
  "status"            TEXT NOT NULL DEFAULT 'aguardando',
  "consultaNovaId"    TEXT,
  "valorAntigoCentavos" INTEGER,
  "valorNovoCentavos"   INTEGER,
  "diferencaCentavos"   INTEGER,
  "reembolsoId"       TEXT,
  "reservaExpiraEm"   TIMESTAMP(3),
  "criadoEm"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvidoEm"       TIMESTAMP(3),
  CONSTRAINT "EsperaMedico_pkey" PRIMARY KEY ("id")
);

ALTER TABLE public."EsperaMedico" ADD COLUMN IF NOT EXISTS "reservaExpiraEm" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "EsperaMedico_consultaId_key" ON public."EsperaMedico"("consultaId");
CREATE INDEX IF NOT EXISTS "EsperaMedico_consultaNovaId_idx" ON public."EsperaMedico"("consultaNovaId");
CREATE INDEX IF NOT EXISTS "EsperaMedico_status_resolvidoEm_idx" ON public."EsperaMedico"("status", "resolvidoEm");
-- Só as que o job precisa varrer.
CREATE INDEX IF NOT EXISTS "EsperaMedico_aguardando_expiraEm_idx"
  ON public."EsperaMedico"("expiraEm") WHERE "status" = 'aguardando';
CREATE INDEX IF NOT EXISTS "EsperaMedico_remarcando_reserva_idx"
  ON public."EsperaMedico"("reservaExpiraEm") WHERE "status" = 'remarcando';

ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_consultaId_fkey";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_consultaId_fkey"
  FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_consultaNovaId_fkey";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_consultaNovaId_fkey"
  FOREIGN KEY ("consultaNovaId") REFERENCES public."Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_status_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_status_check"
  CHECK ("status" IN ('aguardando', 'medico_entrou', 'expirada', 'remarcando', 'cancelada', 'remarcada'));
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_expira_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_expira_check"
  CHECK ("expiraEm" > "iniciadaEm");
-- Desfecho fechado ⇔ resolvidoEm preenchido; remarcada ⇔ consulta nova e valores.
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_resolvido_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_resolvido_check"
  CHECK (("status" IN ('aguardando', 'expirada', 'remarcando')) = ("resolvidoEm" IS NULL));
-- remarcando ⇔ consulta nova reservada com prazo.
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_remarcando_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_remarcando_check"
  CHECK (("status" = 'remarcando') = ("reservaExpiraEm" IS NOT NULL AND "consultaNovaId" IS NOT NULL));
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_remarcada_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_remarcada_check"
  CHECK ("status" <> 'remarcada' OR ("valorAntigoCentavos" IS NOT NULL AND "valorNovoCentavos" IS NOT NULL
    AND "diferencaCentavos" = "valorNovoCentavos" - "valorAntigoCentavos"));
ALTER TABLE public."EsperaMedico" DROP CONSTRAINT IF EXISTS "EsperaMedico_nova_diferente_check";
ALTER TABLE public."EsperaMedico" ADD CONSTRAINT "EsperaMedico_nova_diferente_check"
  CHECK ("consultaNovaId" IS NULL OR "consultaNovaId" <> "consultaId");

ALTER TABLE public."EsperaMedico" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."EsperaMedico" FROM anon, authenticated;

