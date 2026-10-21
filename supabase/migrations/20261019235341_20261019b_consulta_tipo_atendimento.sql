-- =====================================================================
-- BION — Teleconsulta v2: tipo do atendimento e consulta de origem
-- (renovação de receita, retorno, segunda opinião). Dono: Médicos.
-- =====================================================================
-- NÃO aplicada automaticamente. Aplique MANUALMENTE com apply_migration,
-- depois do backup e ANTES do merge do PR que a acompanha.
--
-- Só ADITIVA: duas colunas novas em "Consulta" (uma com default, outra
-- opcional), FK para a própria "Consulta" com ON DELETE SET NULL, índice e
-- trava de domínio. As linhas existentes recebem 'padrao' e origem nula,
-- então nenhuma viola a trava. Sem BEGIN/COMMIT (o apply_migration já roda
-- numa transação). Idempotente (IF NOT EXISTS / DROP IF EXISTS + ADD).
-- Reversão (parte 1): DROP CONSTRAINT dos dois, DROP INDEX e DROP COLUMN das duas.
-- =====================================================================

ALTER TABLE public."Consulta"
  ADD COLUMN IF NOT EXISTS "tipoAtendimento" TEXT NOT NULL DEFAULT 'padrao',
  ADD COLUMN IF NOT EXISTS "consultaOrigemId" TEXT NULL;

ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_consultaOrigemId_fkey";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_consultaOrigemId_fkey"
  FOREIGN KEY ("consultaOrigemId") REFERENCES public."Consulta"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Consulta_consultaOrigemId_idx"
  ON public."Consulta"("consultaOrigemId");

ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_tipoAtendimento_check";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_tipoAtendimento_check"
  CHECK ("tipoAtendimento" IN (
    'padrao',
    'renovacao',
    'retorno',
    'segunda_opiniao'
  ));

-- Uma consulta não pode ser a própria origem. Em produção (19/10/2026) a
-- coluna ainda não existe, então nenhuma linha viola.
ALTER TABLE public."Consulta" DROP CONSTRAINT IF EXISTS "Consulta_origem_diferente_check";
ALTER TABLE public."Consulta" ADD CONSTRAINT "Consulta_origem_diferente_check"
  CHECK ("consultaOrigemId" IS NULL OR "consultaOrigemId" <> "id");

-- ---------------------------------------------------------------------
-- 2) Tabela nova "PedidoRenovacao": pedido de renovação de receita feito
--    pelo paciente. FKs: paciente e médico → "User" (cascade); consulta de
--    origem, chamada curta e documentos (receita anterior e nova) → set null.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."PedidoRenovacao" (
  "id"                 TEXT NOT NULL,
  "pacienteId"         TEXT NOT NULL,
  "medicoId"           TEXT NOT NULL,
  "consultaOrigemId"   TEXT NULL,
  "documentoId"        TEXT NULL,
  "documentoNovoId"    TEXT NULL,
  "status"             TEXT NOT NULL DEFAULT 'pendente',
  "observacaoPaciente" TEXT NULL,
  "mensagemMedico"     TEXT NULL,
  "consultaId"         TEXT NULL,
  "criadoEm"           TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "respondidoEm"       TIMESTAMPTZ(3) NULL,
  CONSTRAINT "PedidoRenovacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PedidoRenovacao_medicoId_status_criadoEm_idx" ON public."PedidoRenovacao"("medicoId", "status", "criadoEm");
CREATE INDEX IF NOT EXISTS "PedidoRenovacao_pacienteId_idx" ON public."PedidoRenovacao"("pacienteId");
CREATE INDEX IF NOT EXISTS "PedidoRenovacao_consultaOrigemId_idx" ON public."PedidoRenovacao"("consultaOrigemId");

ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_pacienteId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_pacienteId_fkey"
  FOREIGN KEY ("pacienteId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_medicoId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_medicoId_fkey"
  FOREIGN KEY ("medicoId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_consultaOrigemId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_consultaOrigemId_fkey"
  FOREIGN KEY ("consultaOrigemId") REFERENCES public."Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_consultaId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_consultaId_fkey"
  FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_documentoId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_documentoId_fkey"
  FOREIGN KEY ("documentoId") REFERENCES public."Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_documentoNovoId_fkey";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_documentoNovoId_fkey"
  FOREIGN KEY ("documentoNovoId") REFERENCES public."Documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_status_check";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_status_check"
  CHECK ("status" IN (
    'pendente',
    'renovada',
    'chamada_marcada',
    'recusada',
    'cancelado'  -- cancelado pelo paciente enquanto pendente
  ));

-- Pendente <=> sem resposta. Qualquer saída de 'pendente' (inclusive o
-- cancelamento pelo paciente) preenche "respondidoEm".
ALTER TABLE public."PedidoRenovacao" DROP CONSTRAINT IF EXISTS "PedidoRenovacao_respondido_check";
ALTER TABLE public."PedidoRenovacao" ADD CONSTRAINT "PedidoRenovacao_respondido_check"
  CHECK (("status" = 'pendente') = ("respondidoEm" IS NULL));

-- Um só pedido pendente por paciente e receita (índice único parcial; o
-- Prisma não representa índice parcial, por isso só existe aqui).
CREATE UNIQUE INDEX IF NOT EXISTS "PedidoRenovacao_pendente_unico"
  ON public."PedidoRenovacao"("pacienteId", "documentoId")
  WHERE "status" = 'pendente';

-- Fila do médico/Admin: pendentes por antiguidade (índice parcial, só no SQL).
CREATE INDEX IF NOT EXISTS "PedidoRenovacao_pendente_criadoEm_idx"
  ON public."PedidoRenovacao"("criadoEm")
  WHERE "status" = 'pendente';

-- RLS negando tudo por padrão (o app acessa só pelo servidor), como as demais.
ALTER TABLE public."PedidoRenovacao" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PedidoRenovacao" FROM anon, authenticated;
-- Reversão da parte 2: DROP TABLE IF EXISTS public."PedidoRenovacao";

-- ---------------------------------------------------------------------
-- 3) Trava de domínio em "PedidoMedicao".status (valores previstos na
--    20261018c). Produção em 19/10/2026: tabela vazia, nenhuma linha viola.
-- ---------------------------------------------------------------------
ALTER TABLE public."PedidoMedicao" DROP CONSTRAINT IF EXISTS "PedidoMedicao_status_check";
ALTER TABLE public."PedidoMedicao" ADD CONSTRAINT "PedidoMedicao_status_check"
  CHECK ("status" IN (
    'pendente',
    'atendido',
    'cancelado'
  ));
-- Reversão da parte 3: ALTER TABLE public."PedidoMedicao" DROP CONSTRAINT IF EXISTS "PedidoMedicao_status_check";

-- ---------------------------------------------------------------------
-- 4) "Documento": receita de controlado e consulta de emissão;
--    "Consulta": data de retorno sugerida pelo médico. Só aditivo.
-- ---------------------------------------------------------------------
ALTER TABLE public."Documento"
  ADD COLUMN IF NOT EXISTS "controlado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "consultaId" TEXT NULL;

ALTER TABLE public."Documento" DROP CONSTRAINT IF EXISTS "Documento_consultaId_fkey";
ALTER TABLE public."Documento" ADD CONSTRAINT "Documento_consultaId_fkey"
  FOREIGN KEY ("consultaId") REFERENCES public."Consulta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Documento_consultaId_idx" ON public."Documento"("consultaId");

ALTER TABLE public."Consulta"
  ADD COLUMN IF NOT EXISTS "retornoSugeridoEm" TIMESTAMPTZ(3) NULL;
-- Reversão da parte 4: DROP INDEX "Documento_consultaId_idx"; DROP CONSTRAINT "Documento_consultaId_fkey";
--   DROP COLUMN "Documento"."controlado", "Documento"."consultaId", "Consulta"."retornoSugeridoEm".
