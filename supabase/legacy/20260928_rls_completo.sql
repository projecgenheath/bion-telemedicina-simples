-- BION RLS completo (SELECT + INSERT/UPDATE sensatos)
-- Prisma/DATABASE_URL (role postgres) bypassa RLS.
-- Aplique no SQL Editor após prisma db push.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PerfilPaciente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consulta" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mensagem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notificacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Arquivo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Documento" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SinalSala" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PresencaSala" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lembrete" ENABLE ROW LEVEL SECURITY;

-- helper: id do User ligado ao auth.uid()
-- (repete subquery — Postgres não permite função custom sem create)

-- User: ler a si; update nome/email próprio limitado
DROP POLICY IF EXISTS bion_user_select ON "User";
CREATE POLICY bion_user_select ON "User" FOR SELECT TO authenticated
  USING (
    "supabaseId" = auth.uid()::text
    OR id IN (
      SELECT "pacienteId" FROM "Consulta"
      WHERE "medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
    OR id IN (
      SELECT "medicoId" FROM "Consulta"
      WHERE "pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
  );

DROP POLICY IF EXISTS bion_user_update_self ON "User";
CREATE POLICY bion_user_update_self ON "User" FOR UPDATE TO authenticated
  USING ("supabaseId" = auth.uid()::text)
  WITH CHECK ("supabaseId" = auth.uid()::text);

-- Perfil paciente: próprio
DROP POLICY IF EXISTS bion_perfil_pac ON "PerfilPaciente";
CREATE POLICY bion_perfil_pac ON "PerfilPaciente" FOR ALL TO authenticated
  USING ("userId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text))
  WITH CHECK ("userId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text));

-- Consultas: participante
DROP POLICY IF EXISTS bion_consulta_sel ON "Consulta";
CREATE POLICY bion_consulta_sel ON "Consulta" FOR SELECT TO authenticated
  USING (
    "pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    OR "medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

-- Mensagens: participantes; insert como remetente
DROP POLICY IF EXISTS bion_msg_sel ON "Mensagem";
CREATE POLICY bion_msg_sel ON "Mensagem" FOR SELECT TO authenticated
  USING (
    "deId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    OR "paraId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );
DROP POLICY IF EXISTS bion_msg_ins ON "Mensagem";
CREATE POLICY bion_msg_ins ON "Mensagem" FOR INSERT TO authenticated
  WITH CHECK ("deId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text));
DROP POLICY IF EXISTS bion_msg_upd ON "Mensagem";
CREATE POLICY bion_msg_upd ON "Mensagem" FOR UPDATE TO authenticated
  USING (
    "deId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    OR "paraId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

-- Notificações
DROP POLICY IF EXISTS bion_notif_sel ON "Notificacao";
CREATE POLICY bion_notif_sel ON "Notificacao" FOR SELECT TO authenticated
  USING (
    "usuarioId" IS NULL
    OR "usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );
DROP POLICY IF EXISTS bion_notif_upd ON "Notificacao";
CREATE POLICY bion_notif_upd ON "Notificacao" FOR UPDATE TO authenticated
  USING ("usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text));

-- Arquivos / Documentos / Lembretes: dono
DROP POLICY IF EXISTS bion_arq_all ON "Arquivo";
CREATE POLICY bion_arq_all ON "Arquivo" FOR ALL TO authenticated
  USING ("usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text))
  WITH CHECK ("usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text));

DROP POLICY IF EXISTS bion_doc_sel ON "Documento";
CREATE POLICY bion_doc_sel ON "Documento" FOR SELECT TO authenticated
  USING (
    "pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    OR "medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS bion_lemb_all ON "Lembrete";
CREATE POLICY bion_lemb_all ON "Lembrete" FOR ALL TO authenticated
  USING ("usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text))
  WITH CHECK ("usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text));

-- Sala: participantes da consulta
DROP POLICY IF EXISTS bion_sinal_all ON "SinalSala";
CREATE POLICY bion_sinal_all ON "SinalSala" FOR ALL TO authenticated
  USING (
    "consultaId" IN (
      SELECT id FROM "Consulta" c WHERE
        c."pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
        OR c."medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
  )
  WITH CHECK (
    "deUsuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );

DROP POLICY IF EXISTS bion_pres_all ON "PresencaSala";
CREATE POLICY bion_pres_all ON "PresencaSala" FOR ALL TO authenticated
  USING (
    "consultaId" IN (
      SELECT id FROM "Consulta" c WHERE
        c."pacienteId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
        OR c."medicoId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
    )
  )
  WITH CHECK (
    "usuarioId" IN (SELECT id FROM "User" WHERE "supabaseId" = auth.uid()::text)
  );
