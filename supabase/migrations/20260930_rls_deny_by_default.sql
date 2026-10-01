-- =====================================================================
-- BION — RLS deny-by-default nas tabelas restantes (auditoria admin, C3)
-- =====================================================================
-- NÃO aplicada automaticamente. Revise e aplique MANUALMENTE no SQL Editor
-- do Supabase, depois de backup, e só após `prisma db push`.
--
-- Contexto
--   * 20260928_rls_completo.sql ativa RLS em 10 tabelas. As 11 abaixo ficaram
--     SEM RLS e, com os GRANTs padrão do Supabase para anon/authenticated,
--     ficavam legíveis/graváveis via PostgREST com a anon key pública
--     (inclui "Sessao" — tokens de sessão — e "AuditLog").
--   * Esta migration liga RLS SEM criar policy => nega tudo para anon e
--     authenticated (deny-by-default). Não há leitura dessas tabelas pelo
--     navegador hoje (nenhum `.from(` / `postgres_changes` em src/).
--
-- Quem NÃO é afetado
--   * Prisma (DATABASE_URL, role postgres/owner) — dono das tabelas, ignora
--     RLS (não usamos FORCE ROW LEVEL SECURITY).
--   * service_role (chamadas server-side) — tem BYPASSRLS.
--   * Supabase Realtime Broadcast (canais públicos usados por
--     use-teleconsulta.ts / bion-store.tsx) — não lê tabelas; esta migration
--     NÃO mexe em realtime.messages nem torna canais privados.
--
-- Também corrige escalonamento de privilégio:
--   * bion_user_update_self (20260928_rls_completo.sql:34-37) permitia ao
--     usuário autenticado fazer UPDATE na PRÓPRIA linha de "User" sem
--     restringir colunas — ou seja, alterar o próprio "role" (ex.: ADMIN),
--     "status" e "senhaHash" via REST. A policy é removida e o UPDATE direto
--     revogado; alterações de perfil seguem pelas rotas /api (Prisma).
--
-- Pontos pré-existentes NÃO alterados aqui (para revisão):
--   * bion_perfil_pac (FOR ALL) ainda deixa o paciente gravar o próprio
--     "PerfilPaciente" via REST.
--   * bion_user_select referencia "User" dentro da própria policy de "User"
--     (possível recursão de RLS — avaliar função SECURITY DEFINER).
-- =====================================================================

BEGIN;

-- 1) RLS ligado (sem policies) + revogação explícita para os papéis da API.
--    Algumas tabelas só existem após `prisma db push`; por isso to_regclass.
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'Sessao', 'AuditLog', 'PerfilMedico', 'Avaliacao', 'Ticket',
    'Consentimento', 'Anamnese', 'Medicao', 'ExameLaboratorial',
    'Pagamento', 'NotificacaoLeitura'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      RAISE NOTICE 'Tabela public.% não existe — ignorada (rode prisma db push antes).', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
END
$$;

-- 2) Remove a policy que permitia auto-promoção de papel / troca de senhaHash.
DROP POLICY IF EXISTS bion_user_update_self ON public."User";
REVOKE INSERT, UPDATE, DELETE ON TABLE public."User" FROM anon, authenticated;

COMMIT;

-- Verificação sugerida (após aplicar):
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
--    ORDER BY relname;                       -- todas devem estar = true
--   SELECT policyname FROM pg_policies WHERE tablename = 'User';
--                                             -- sem bion_user_update_self
