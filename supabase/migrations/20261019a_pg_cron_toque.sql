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
-- Idempotente: as extensões usam IF NOT EXISTS e o job é desagendado se já
-- existir antes de agendar de novo.
-- Para desligar: select cron.unschedule('bion-toque');
-- Log das execuções: select * from cron.job_run_details order by start_time desc limit 20;
--                    select * from net._http_response order by created desc limit 20;
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bion-toque') then
    perform cron.unschedule('bion-toque');
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
    timeout_milliseconds := 8000
  )
  $job$
);
