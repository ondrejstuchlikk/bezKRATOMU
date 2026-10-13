-- 0010_push_cron.sql
-- Calls the push Edge Function every 5 minutes. The function URL and the shared
-- secret live in Supabase Vault (created once by hand, never committed):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/push', 'push_function_url');
--   select vault.create_secret('<random secret, same as the CRON_SECRET of the function>', 'push_cron_secret');
-- Requires pg_cron and pg_net, so it is skipped by the local test runner.

create extension if not exists pg_net;

select cron.schedule(
  'send-push',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
