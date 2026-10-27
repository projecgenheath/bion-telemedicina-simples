-- =====================================================================
-- 20261019a_pg_cron_toque.sql — job do toque da consulta a cada minuto
-- (PR 7 do plano teleconsulta-v2, Admin). Decisão do Alisson (18/10/2026):
-- pg_cron + pg_net no Supabase, não Vercel Pro (a Hobby só tem cron diário).
--
-- O pg_cron chama POST/GET /api/cron/toque a cada minuto com
-- `Authorization: Bearer <CRON_SECRET>` (mesmo segredo do fechar-repasses).
--
-- SÓ APLICAR COM O OK DO ALISSON E DEPOIS DO BACKUP.
--
-- ANTES de aplicar, criar os DOIS segredos no Vault (NUNCA no repositório),
-- pelo SQL Editor do Supabase:
--   select vault.create_secret('https://<domínio de produção>/api/cron/toque', 'bion_toque_url');
--   select vault.create_secret('<o mesmo valor de CRON_SECRET da Vercel>', 'bion_cron_secret');
-- Para trocar depois: select vault.update_secret(id, '<novo>') usando o id de
--   select id, name from vault.secrets where name in ('bion_toque_url','bion_cron_secret');
-- Sem os segredos, o job roda mas o http_post falha (URL nula) — nada quebra
-- no app; só não toca.
--
-- Tempo: o job para sozinho em 7 s (ORCAMENTO_MS em toque.ts), abaixo deste
-- timeout de 10 s e do maxDuration de 10 s da rota (plano Hobby).
--
-- Idempotente: as extensões usam IF NOT EXISTS e o job é desagendado se já
-- existir antes de agendar de novo.
-- Também agenda `bion-limpa-cron` (domingo 03:00 UTC = 00:00 em SP): apaga o
-- histórico do pg_cron (cron.job_run_details) com mais de 7 dias — o job por
-- minuto grava ~10 mil linhas por semana.
-- Para desligar: select cron.unschedule('bion-toque'); select cron.unschedule('bion-limpa-cron');
-- Log das execuções: select * from cron.job_run_details order by start_time desc limit 20;
--                    select * from net._http_response order by created desc limit 20;
-- =====================================================================

-- Schemas como na documentação do Supabase (pg_cron em pg_catalog; pg_net em
-- extensions — as funções ficam no schema net de qualquer forma).
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bion-toque') then
    perform cron.unschedule('bion-toque');
  end if;
  if exists (select 1 from cron.job where jobname = 'bion-limpa-cron') then
    perform cron.unschedule('bion-limpa-cron');
  end if;
end
$$;

select cron.schedule(
  'bion-toque',
  '* * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'bion_toque_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'bion_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  $job$
);

select cron.schedule(
  'bion-limpa-cron',
  '0 3 * * 0',
  $limpa$ delete from cron.job_run_details where end_time < now() - interval '7 days' $limpa$
);
