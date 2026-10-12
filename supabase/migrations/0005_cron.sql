-- 0005_cron.sql
-- Finalizes days every hour (at minute 7). The job is idempotent, so running
-- it more often or re-running this file is harmless.

create extension if not exists pg_cron;

select cron.schedule('finalize-days', '7 * * * *', $$select private.finalize_all()$$);
