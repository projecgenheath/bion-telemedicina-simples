-- Dias da semana de atendimento e pausas semanais do médico.
-- diasAtendimento: JSON number[] (0=Dom … 6=Sáb). Vazio = todos os dias.
-- pausasSemanais: JSON {dia: number, inicio: "HH:MM", fim: "HH:MM"}[].

ALTER TABLE "PerfilMedico"
  ADD COLUMN IF NOT EXISTS "diasAtendimento" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "pausasSemanais" TEXT NOT NULL DEFAULT '[]';