-- 20261020d — ChatConsulta: chat da teleconsulta guardado com a consulta.
-- Dono: Admin. Decisão do Alisson (20/10/2026): o chat da sala faz parte do
-- prontuário (CFM, 20 anos) e não é apagado. A limpeza da sala (limparSala)
-- copia as linhas tipo 'chat' da "SinalSala" para cá antes de apagar.
-- Idempotente, sem BEGIN/COMMIT (o runner já envolve em transação).
-- RLS ligado e sem política: anon/authenticated não leem nada; o acesso é só
-- pelo servidor (Prisma), que libera para o médico e o paciente da consulta.
--
-- Reversão (perde o chat guardado):
--   DROP TABLE IF EXISTS public."ChatConsulta";

CREATE TABLE IF NOT EXISTS public."ChatConsulta" (
  "id"         TEXT NOT NULL,
  "sinalId"    TEXT NOT NULL,
  "consultaId" TEXT NOT NULL,
  "autorId"    TEXT NOT NULL,
  "papel"      TEXT NOT NULL,
  "texto"      TEXT NOT NULL,
  "criadoEm"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatConsulta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatConsulta_sinalId_key" ON public."ChatConsulta"("sinalId");
CREATE INDEX IF NOT EXISTS "ChatConsulta_consultaId_criadoEm_idx" ON public."ChatConsulta"("consultaId", "criadoEm");

ALTER TABLE public."ChatConsulta" DROP CONSTRAINT IF EXISTS "ChatConsulta_consultaId_fkey";
ALTER TABLE public."ChatConsulta" ADD CONSTRAINT "ChatConsulta_consultaId_fkey"
  FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."ChatConsulta" ENABLE ROW LEVEL SECURITY;
