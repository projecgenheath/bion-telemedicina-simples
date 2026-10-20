-- =====================================================================
-- 20261020c_pg_cron_espera_medico.sql — job da espera do médico a cada minuto
-- (Admin, depois do #67). Mesmo modelo do 20261019a_pg_cron_toque:
-- pg_cron + pg_net, segredos no Vault.
--
-- O pg_cron chama POST /api/cron/espera-medico a cada minuto com
-- `Authorization: Bearer <CRON_SECRET>` (a rota aceita GET e POST e usa o
-- mesmo autorizadoCron do toque).
--
-- NÃO cria segredo novo: reaproveita os do toque.
--   - bion_cron_secret: o mesmo CRON_SECRET da Vercel;
--   - bion_toque_url: a URL do toque; a URL da espera é derivada dela,
--     trocando o sufixo '/api/cron/toque' por '/api/cron/espera-medico'.
-- Sem os segredos, o job roda mas o http_post falha (URL nula) — nada
-- quebra no app; só não expira as esperas.
--
-- SÓ APLICAR COM O OK DO ALISSON E DEPOIS DO BACKUP.
--
-- Tempo: timeout de 10 s, igual ao maxDuration da rota (plano Hobby).
-- Idempotente: extensões com IF NOT EXISTS; os jobs são desagendados se já
-- existirem antes de agendar de novo. Sem BEGIN/COMMIT.
-- Reagenda também `bion-limpa-cron` (domingo 03:00 UTC = 00:00 em SP), com
-- o mesmo comando do 20261019a, para garantir a limpeza semanal do
-- cron.job_run_details agora que há dois jobs por minuto.
-- Para desligar: select cron.unschedule('bion-espera-medico');
-- Log: select * from cron.job_run_details order by start_time desc limit 20;
--      select * from net._http_response order by created desc limit 20;
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bion-espera-medico') then
    perform cron.unschedule('bion-espera-medico');
  end if;
  if exists (select 1 from cron.job where jobname = 'bion-limpa-cron') then
    perform cron.unschedule('bion-limpa-cron');
  end if;
end
$$;

select cron.schedule(
  'bion-espera-medico',
  '* * * * *',
  $job$
  select net.http_post(
    url := (
      select regexp_replace(decrypted_secret, '/api/cron/toque/?$', '/api/cron/espera-medico')
      from vault.decrypted_secrets where name = 'bion_toque_url'
    ),
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
