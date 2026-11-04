-- =====================================================================
-- 20261104b_pg_cron_lembretes.sql — job dos avisos de lembrete a cada
-- minuto (errinho F6 da auditoria de errinhos bobos, paciente-fluxos).
--
-- ⚠️ NÃO APLICADA EM NENHUM AMBIENTE. Aplicar DEPOIS de
-- 20261104a_lembrete_feito_e_disparo.sql (o endpoint responde "inativo"
-- sem as colunas, então a ordem não quebra nada — só não avisa).
--
-- Mesmo mecanismo do toque da consulta (20261019a): pg_cron + pg_net no
-- Supabase chamam POST/GET /api/cron/lembretes a cada minuto com
-- `Authorization: Bearer <CRON_SECRET>` — a Vercel Hobby só tem cron
-- diário, insuficiente para lembrete das 08:00 tocar às 08:00.
--
-- ANTES de aplicar, criar o segredo da URL no Vault (NUNCA no
-- repositório), pelo SQL Editor do Supabase:
--   select vault.create_secret('https://<domínio de produção>/api/cron/lembretes', 'bion_lembretes_url');
-- O segredo do Bearer é o MESMO do toque: 'bion_cron_secret' (já existe
-- se o job do toque estiver ativo). Sem o segredo da URL, o job roda mas
-- o http_post falha (URL nula) — nada quebra no app; só não avisa.
--
-- Idempotente: desagenda o job se já existir antes de agendar de novo.
-- Para desligar: select cron.unschedule('bion-lembretes');
-- Log: select * from cron.job_run_details order by start_time desc limit 20;
--      select * from net._http_response order by created desc limit 20;
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bion-lembretes') then
    perform cron.unschedule('bion-lembretes');
  end if;
end
$$;

select cron.schedule(
  'bion-lembretes',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bion_lembretes_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bion_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  $job$
);
