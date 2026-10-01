-- BION — A3 (auditoria 2026-09): destinatário do arquivo (Arquivo.pacienteId)
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Revisar antes de rodar no SQL Editor.
-- Idempotente: pode rodar depois de `prisma db push` (que cria só a coluna,
-- o índice e a FK — com os MESMOS nomes abaixo — mas NÃO faz o backfill).
--
-- DDL equivalente ao gerado por `prisma migrate diff` a partir do
-- schema.prisma deste commit.

BEGIN;

-- 1) Coluna + índice + FK (paciente removido → SET NULL; o arquivo continua
--    visível ao remetente/admin).
ALTER TABLE "Arquivo" ADD COLUMN IF NOT EXISTS "pacienteId" TEXT;

CREATE INDEX IF NOT EXISTS "Arquivo_pacienteId_idx" ON "Arquivo"("pacienteId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Arquivo_pacienteId_fkey') THEN
    ALTER TABLE "Arquivo"
      ADD CONSTRAINT "Arquivo_pacienteId_fkey" FOREIGN KEY ("pacienteId")
      REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 2) Backfill A — arquivo enviado por PACIENTE pertence a ele mesmo.
UPDATE "Arquivo" a
SET "pacienteId" = a."usuarioId"
FROM "User" u
WHERE u."id" = a."usuarioId"
  AND u."role" = 'PACIENTE'
  AND a."pacienteId" IS NULL;

-- 3) Backfill B — arquivo enviado por MÉDICO na sala de teleconsulta.
--    A UI gravava em "consulta" o rótulo exato
--      'Consulta em andamento — <nome do paciente> / <nome do médico>'
--    (src/components/bion/Consulta.tsx). Só preenche quando:
--      - o remetente é MEDICO;
--      - o rótulo bate EXATAMENTE com o nome ATUAL de um paciente com quem
--        esse médico tem/teve consulta e com o nome ATUAL do médico;
--      - existe UM ÚNICO paciente assim (homônimos → fica NULL).
--    Qualquer outro caso (ex.: "Envio avulso", "Consulta em andamento" sem
--    nome, nomes alterados/anonimizados depois do upload) fica NULL.
WITH candidatos AS (
  SELECT a."id" AS arquivo_id,
         MIN(p."id") AS paciente_id,
         COUNT(DISTINCT p."id") AS n
  FROM "Arquivo" a
  JOIN "User" d ON d."id" = a."usuarioId" AND d."role" = 'MEDICO'
  JOIN "Consulta" c ON c."medicoId" = d."id"
  JOIN "User" p ON p."id" = c."pacienteId" AND p."role" = 'PACIENTE'
  WHERE a."pacienteId" IS NULL
    AND a."consulta" = 'Consulta em andamento — ' || p."nome" || ' / ' || d."nome"
  GROUP BY a."id"
)
UPDATE "Arquivo" a
SET "pacienteId" = c.paciente_id
FROM candidatos c
WHERE a."id" = c.arquivo_id
  AND c.n = 1;

COMMIT;

-- Conferência (opcional, depois do COMMIT):
-- SELECT u."role" AS remetente, (a."pacienteId" IS NOT NULL) AS com_destinatario, COUNT(*)
-- FROM "Arquivo" a JOIN "User" u ON u."id" = a."usuarioId"
-- GROUP BY 1, 2 ORDER BY 1, 2;
