-- BION — RLS básico (defesa quando o cliente usa anon/authenticated key).
-- Prisma/service role e conexão postgres da DATABASE_URL normalmente BYPASSAM RLS.
-- Habilitar Realtime: Dashboard → Database → Publications → supabase_realtime

-- Vínculo Auth ↔ perfil: User.supabaseId = auth.uid()::text

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mensagem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Arquivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SinalSala" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PresencaSala" ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas mínimas para authenticated (ajuste fino depois)

DROP POLICY IF EXISTS bion_user_self ON "User";
CREATE POLICY bion_user_self ON "User"
  FOR SELECT TO authenticated
  USING ("supabaseId" = auth.uid()::text OR id IN (
    SELECT "pacienteId" FROM "Consulta" WHERE "medicoId" IN (
      SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text
    )
  ));

DROP POLICY IF EXISTS bion_msg_participantes ON "Mensagem";
CREATE POLICY bion_msg_participantes ON "Mensagem"
  FOR SELECT TO authenticated
  USING (
    "deId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    OR "paraId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS bion_notif_self ON "Notificacao";
CREATE POLICY bion_notif_self ON "Notificacao"
  FOR SELECT TO authenticated
  USING (
    "usuarioId" IS NULL
    OR "usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS bion_arquivo_self ON "Arquivo";
CREATE POLICY bion_arquivo_self ON "Arquivo"
  FOR SELECT TO authenticated
  USING (
    "usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS bion_sinal_consulta ON "SinalSala";
CREATE POLICY bion_sinal_consulta ON "SinalSala"
  FOR SELECT TO authenticated
  USING (
    "consultaId" IN (
      SELECT id FROM "Consulta" c
      WHERE c."pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
         OR c."medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS bion_presenca_consulta ON "PresencaSala";
CREATE POLICY bion_presenca_consulta ON "PresencaSala"
  FOR SELECT TO authenticated
  USING (
    "consultaId" IN (
      SELECT id FROM "Consulta" c
      WHERE c."pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
         OR c."medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
  );
