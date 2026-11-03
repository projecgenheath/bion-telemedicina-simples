-- BION — 20261103a: status do documento clínico (emitido | cancelado) e
-- guarda do prontuário na exclusão de conta do paciente.
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Precisa do ok do Alisson antes de
-- rodar em produção. ATENÇÃO À ORDEM: o PR que adiciona `status` e
-- `canceladoEm` ao model Documento no schema.prisma só pode ir para
-- produção DEPOIS desta migração aplicada — o client gerado seleciona as
-- colunas e as leituras de Documento quebrariam sem elas.
--
-- 1) Documento.status ('emitido' | 'cancelado') + canceladoEm. Cancelado
--    não é apagado: continua no prontuário e a verificação pública
--    (/verificar/[codigo]) mostra "Documento cancelado".
-- 2) FK Documento.pacienteId: ON DELETE CASCADE -> RESTRICT. O prontuário
--    é guardado por 20 anos (Lei 13.787/2018, art. 6º); a exclusão de conta
--    anonimiza o paciente (src/lib/server/lgpd.ts) e nunca apaga o User,
--    mas o CASCADE apagaria os documentos se alguém apagasse a linha.
--
-- Aditiva e idempotente (pode rodar de novo).

ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'emitido';
ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "canceladoEm" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Documento_status_check'
  ) THEN
    ALTER TABLE "Documento"
      ADD CONSTRAINT "Documento_status_check" CHECK ("status" IN ('emitido', 'cancelado'));
  END IF;
END $$;

ALTER TABLE "Documento" DROP CONSTRAINT IF EXISTS "Documento_pacienteId_fkey";
ALTER TABLE "Documento"
  ADD CONSTRAINT "Documento_pacienteId_fkey" FOREIGN KEY ("pacienteId")
  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
