-- =====================================================================
-- BION — Atalhos do médico (modelos de mensagem, kits, pacotes). Dono: Médicos.
-- =====================================================================
-- NÃO aplicada. Aplicar MANUALMENTE com apply_migration, só com o ok do
-- Alisson, DEPOIS do backup e ANTES do merge do PR.
--
-- Só ADITIVA: tabela nova "AtalhoMedico". Nenhuma tabela existente muda.
-- Sem BEGIN/COMMIT (o apply_migration já roda numa transação).
-- Idempotente (IF NOT EXISTS / DROP IF EXISTS + ADD).
-- Reversão: DROP TABLE IF EXISTS public."AtalhoMedico";
-- =====================================================================

CREATE TABLE IF NOT EXISTS public."AtalhoMedico" (
    "userId" TEXT NOT NULL,
    "modelosMensagem" TEXT NOT NULL DEFAULT '[]',
    "bancoKits" TEXT NOT NULL DEFAULT '{"kits":[],"pacotes":[],"exemplosOcultos":[]}',
    "atualizadoEm" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AtalhoMedico_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE public."AtalhoMedico" DROP CONSTRAINT IF EXISTS "AtalhoMedico_userId_fkey";
ALTER TABLE public."AtalhoMedico" ADD CONSTRAINT "AtalhoMedico_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS negando tudo por padrão (o app acessa só pelo servidor).
ALTER TABLE public."AtalhoMedico" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."AtalhoMedico" FROM anon, authenticated;
