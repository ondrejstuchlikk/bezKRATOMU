-- 0007_feed_privacy.sql
-- The group feed is readable by every logged-in user, so it must never contain
-- grams. "target_reached" events used to store the target in grams; this
-- removes it from existing events and stops writing it. Mirrors deriveDayEvents()
-- in src/lib/days.ts.

begin;

update public.feed_events set payload = payload - 'target_g' where payload ? 'target_g';

-- Same as in 0006, without 'target_g' in the target_reached payload.
create or replace function private.finalize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last public.daily_results;
  v_from date;
  v_to date := private.prague_today() - 2;
  v_first_baseline numeric;
  r record;
begin
  select * into v_last from public.daily_results where user_id = p_user order by date desc limit 1;
  if found then
    v_from := v_last.date + 1;
  else
    select min(date) into v_from from public.plan_days where user_id = p_user;
  end if;
  if v_from is null or v_from > v_to then return; end if;

  select baseline_g into v_first_baseline from public.plans where user_id = p_user order by created_at limit 1;

  for r in
    select c.* from private.compute_days(
      p_user, v_from, v_to, coalesce(v_last.streak_after, 0), coalesce(v_last.missed_run, 0)
    ) c
  loop
    insert into public.daily_results (
      user_id, date, plan_id, limit_g, baseline_g, total_g, logged, zero_day, is_paused,
      status, points, streak_after, missed_run
    ) values (
      p_user, r.date, r.plan_id, r.limit_g, r.baseline_g, r.total_g, r.logged, r.zero_day, r.is_paused,
      r.status, r.points, r.streak_after, r.missed_run
    ) on conflict (user_id, date) do nothing;

    if r.status = 'met' and r.streak_after in (7, 14, 30) then
      insert into public.feed_events (user_id, type, event_date, payload)
        values (p_user, 'streak', r.date, jsonb_build_object('days', r.streak_after))
        on conflict do nothing;
    end if;

    if r.status = 'met' and r.limit_g * 2 <= v_first_baseline
       and not exists (select 1 from public.feed_events where user_id = p_user and type = 'half_baseline') then
      insert into public.feed_events (user_id, type, event_date) values (p_user, 'half_baseline', r.date)
        on conflict do nothing;
    end if;

    if r.status = 'met'
       and r.limit_g = (select target_g from public.plans where id = r.plan_id)
       and not exists (
         select 1 from public.feed_events
         where user_id = p_user and type = 'target_reached' and payload ->> 'plan_id' = r.plan_id::text
       ) then
      insert into public.feed_events (user_id, type, event_date, payload)
        values (p_user, 'target_reached', r.date, jsonb_build_object('plan_id', r.plan_id))
        on conflict do nothing;
    end if;

    if r.zero_day
       and not exists (select 1 from public.feed_events where user_id = p_user and type = 'first_zero_day') then
      insert into public.feed_events (user_id, type, event_date) values (p_user, 'first_zero_day', r.date)
        on conflict do nothing;
    end if;
  end loop;
end
$$;

revoke all on all functions in schema private from public, anon, authenticated;

commit;
