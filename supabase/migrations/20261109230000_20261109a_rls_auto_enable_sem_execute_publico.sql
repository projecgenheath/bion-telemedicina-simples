-- =====================================================================
-- 20261109a_rls_auto_enable_sem_execute_publico.sql — tira o EXECUTE
-- público da função public.rls_auto_enable() (aviso do Security Advisor
-- do Supabase: 0028 anon_security_definer_function_executable e
-- 0029 authenticated_security_definer_function_executable).
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Aplicar só com o ok do Alisson.
--
-- Contexto (lido em produção, só SELECT, em 09/11/2026):
--   * public.rls_auto_enable() RETURNS event_trigger, plpgsql,
--     SECURITY DEFINER, dono postgres, SET search_path = pg_catalog.
--   * É usada só pelo event trigger "ensure_rls" (ddl_command_end, tags
--     CREATE TABLE / CREATE TABLE AS / SELECT INTO), que liga o RLS em
--     toda tabela nova do schema public.
--   * ACL: {=X/postgres, postgres, anon, authenticated, service_role}.
--     Por estar no schema public, o PostgREST a expõe em
--     /rest/v1/rpc/rls_auto_enable para anon e authenticated.
--
-- Correção: REVOKE EXECUTE de PUBLIC, anon, authenticated e service_role.
-- O comportamento não muda: o Postgres não confere EXECUTE quando o
-- event trigger dispara a função (só na criação do trigger), então o RLS
-- continua sendo ligado em tabela nova, inclusive quando quem cria a
-- tabela não tem EXECUTE. A função continua SECURITY DEFINER (mesmo
-- comportamento de hoje) e com search_path fixo em pg_catalog.
-- Não movemos de schema nem trocamos para INVOKER para não mexer no
-- event trigger nem no dono.
--
-- Idempotente: REVOKE de privilégio que não existe não dá erro, e o
-- bloco não faz nada se a função não existir (bancos locais).
--
-- Verificar depois de aplicar:
--   select proacl from pg_proc where oid = 'public.rls_auto_enable()'::regprocedure;
--     -- esperado: {postgres=X/postgres}
--   select has_function_privilege('anon', 'public.rls_auto_enable()', 'execute');          -- false
--   select has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'); -- false
--   Security Advisor: os avisos 0028/0029 de rls_auto_enable somem.
--   O trigger segue ativo: select evtname, evtenabled from pg_event_trigger where evtname = 'ensure_rls';
--
-- Rollback (volta ao estado de hoje; reabre o aviso):
--   grant execute on function public.rls_auto_enable() to public, anon, authenticated, service_role;
-- =====================================================================

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is null then
    raise notice 'public.rls_auto_enable() não existe neste banco; nada a fazer.';
    return;
  end if;

  revoke execute on function public.rls_auto_enable() from public;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.rls_auto_enable() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function public.rls_auto_enable() from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function public.rls_auto_enable() from service_role;
  end if;
end
$$;
