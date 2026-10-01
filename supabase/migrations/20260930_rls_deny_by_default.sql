-- =====================================================================
-- BION — Deny-by-default no schema public (auditoria admin, C3)
-- =====================================================================
-- NÃO aplicada automaticamente. Revise e aplique MANUALMENTE no SQL Editor
-- do Supabase, depois de backup, e só após `prisma db push`.
--
-- Premissa (confirmada pelos donos dos perfis Médicos e Pacientes):
--   o app acessa o banco SOMENTE pelo servidor, via Prisma. Nenhuma tela lê
--   ou grava tabelas do Supabase direto do navegador (nenhum `.from(` nem
--   `postgres_changes` em src/). Logo, anon/authenticated não precisam de
--   NENHUM acesso às tabelas do schema public.
--
-- O que esta migration faz (apenas no schema public):
--   1) Liga RLS em TODAS as tabelas de public (incl. as 11 que estavam sem:
--      Sessao, AuditLog, PerfilMedico, Avaliacao, Ticket, Consentimento,
--      Anamnese, Medicao, ExameLaboratorial, Pagamento, NotificacaoLeitura).
--   2) Remove TODAS as policies criadas por 20260928_rls_basico.sql e
--      20260928_rls_completo.sql (lista abaixo) => sem policy = nega tudo.
--      Destaques: bion_arq_all ("Arquivo", FOR ALL: qualquer logado escrevia)
--      e bion_user_update_self ("User", FOR UPDATE sem restringir colunas:
--      o usuário podia mudar o próprio role/status/senhaHash via REST).
--   3) REVOKE ALL (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES,
--      TRIGGER) em todas as tabelas e ALL (USAGE, SELECT, UPDATE) em todas as
--      sequences de public, para anon e authenticated.
--   4) ALTER DEFAULT PRIVILEGES: tabelas/sequences novas criadas pelo role
--      que aplica a migration (postgres, o mesmo do Prisma) não recebem mais
--      grants automáticos para anon/authenticated.
--
-- O que NÃO é afetado
--   * Prisma (DATABASE_URL, role postgres = owner) — dono ignora RLS (não
--     usamos FORCE ROW LEVEL SECURITY) e não depende dos grants revogados.
--   * service_role (server-side) — tem BYPASSRLS; grants dele não mudam.
--   * Schema realtime / realtime.messages — NÃO tocados. O Broadcast em
--     canais públicos (use-teleconsulta.ts, bion-store.tsx) continua igual.
--   * Schema storage — NÃO tocado (buckets são gerenciados pelo servidor com
--     service_role em src/lib/supabase/storage.ts). Se existir policy de
--     storage criada no Dashboard que consulte tabelas de public como
--     authenticated, ela deixará de enxergar essas linhas — conferir antes.
--   * Schema auth — NÃO tocado.
--
-- Limitações
--   * Default privileges de OUTROS roles (ex.: supabase_admin) não podem ser
--     alterados por postgres; objetos criados por eles via Dashboard ainda
--     podem nascer com grants — rode novamente o bloco 3 se criar tabelas
--     pelo Dashboard.
--   * Grants em FUNÇÕES de public (EXECUTE) não foram alterados.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Remove policies permissivas (anon/authenticated) já existentes
-- ---------------------------------------------------------------------
-- de 20260928_rls_basico.sql
DROP POLICY IF EXISTS bion_user_self           ON public."User";
DROP POLICY IF EXISTS bion_msg_participantes   ON public."Mensagem";
DROP POLICY IF EXISTS bion_notif_self          ON public."Notificacao";
DROP POLICY IF EXISTS bion_arquivo_self        ON public."Arquivo";
DROP POLICY IF EXISTS bion_sinal_consulta      ON public."SinalSala";
DROP POLICY IF EXISTS bion_presenca_consulta   ON public."PresencaSala";
-- de 20260928_rls_completo.sql
DROP POLICY IF EXISTS bion_user_select         ON public."User";
DROP POLICY IF EXISTS bion_user_update_self    ON public."User";
DROP POLICY IF EXISTS bion_perfil_pac          ON public."PerfilPaciente";
DROP POLICY IF EXISTS bion_consulta_sel        ON public."Consulta";
DROP POLICY IF EXISTS bion_msg_sel             ON public."Mensagem";
DROP POLICY IF EXISTS bion_msg_ins             ON public."Mensagem";
DROP POLICY IF EXISTS bion_msg_upd             ON public."Mensagem";
DROP POLICY IF EXISTS bion_notif_sel           ON public."Notificacao";
DROP POLICY IF EXISTS bion_notif_upd           ON public."Notificacao";
DROP POLICY IF EXISTS bion_arq_all             ON public."Arquivo";
DROP POLICY IF EXISTS bion_doc_sel             ON public."Documento";
DROP POLICY IF EXISTS bion_lemb_all            ON public."Lembrete";
DROP POLICY IF EXISTS bion_sinal_all           ON public."SinalSala";
DROP POLICY IF EXISTS bion_pres_all            ON public."PresencaSala";

-- ---------------------------------------------------------------------
-- 2) RLS ligado em todas as tabelas de public (sem policies => nega tudo)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind IN ('r', 'p')          -- tabelas comuns e particionadas
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------
-- 3) Revoga todos os privilégios de anon/authenticated em public
--    (ALL em tabela inclui TRUNCATE, REFERENCES e TRIGGER)
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Objetos futuros (criados pelo role atual, ex.: postgres/Prisma)
-- ---------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) Aviso: policies em public que não constam do repositório (ex.:
--    criadas pelo Dashboard) NÃO são removidas aqui — só listadas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname, roles::text AS roles
      FROM pg_policies
     WHERE schemaname = 'public'
  LOOP
    RAISE NOTICE 'Policy remanescente em public.%: % (roles %) — revisar.',
      p.tablename, p.policyname, p.roles;
  END LOOP;
END
$$;

COMMIT;

-- Verificação sugerida (após aplicar):
--   -- todas devem ter relrowsecurity = true
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r','p')
--    ORDER BY relname;
--   -- deve voltar vazio
--   SELECT schemaname, tablename, policyname FROM pg_policies
--    WHERE schemaname = 'public';
--   -- deve voltar vazio (nenhum grant para anon/authenticated em public)
--   SELECT table_name, grantee, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
