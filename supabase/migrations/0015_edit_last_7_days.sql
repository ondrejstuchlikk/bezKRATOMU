-- 0015_edit_last_7_days.sql
-- Doses and zero-day marks can be added, changed and deleted for today and the
-- 7 days before it (Prague time), not only today and yesterday.
--
-- Days still become final 2 days later (pg_cron, private.finalize_user), so the
-- "předběžně" label and feed posts stay as quick as before. When a dose or
-- zero-day mark of an already final day changes, that user's final results from
-- that day on are thrown away and finalized again, so points, streaks and the
-- automatic feed posts (streak, half_baseline, target_reached, first_zero_day)
-- follow the edit. Mirrors EDIT_WINDOW_DAYS in src/lib/days.ts.

begin;

-- Recomputes the final results of a user from p_date on. No-op when nothing
-- from that day on is final yet (today, yesterday, or a fresh user).
create function private.refinalize_from(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Also skips users being deleted (their rows cascade away; re-inserting would fail).
  if not exists (select 1 from public.daily_results where user_id = p_user and date >= p_date)
     or not exists (select 1 from public.profiles where id = p_user) then
    return;
  end if;
  delete from public.daily_results where user_id = p_user and date >= p_date;
  delete from public.feed_events
    where user_id = p_user and event_date >= p_date
      and type in ('streak', 'half_baseline', 'target_reached', 'first_zero_day');
  perform private.finalize_user(p_user);
end
$$;

create function private.doses_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.refinalize_from(new.user_id, new.local_date);
  elsif tg_op = 'UPDATE' then
    perform private.refinalize_from(new.user_id, least(old.local_date, new.local_date));
  else
    perform private.refinalize_from(old.user_id, old.local_date);
  end if;
  return null;
end
$$;

create trigger doses_after_change
  after insert or update or delete on public.doses
  for each row execute function private.doses_after_change();

create function private.zero_days_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refinalize_from(old.user_id, old.date);
  else
    perform private.refinalize_from(new.user_id, new.date);
  end if;
  return null;
end
$$;

create trigger zero_days_after_change
  after insert or delete on public.zero_days
  for each row execute function private.zero_days_after_change();

-- Same as 0002 otherwise: only the owner, now for today and the 7 days before.
drop policy "doses: owner can add today or yesterday" on public.doses;
drop policy "doses: owner can edit today or yesterday" on public.doses;
drop policy "doses: owner can delete today or yesterday" on public.doses;
drop policy "zero_days: owner can add today or yesterday" on public.zero_days;
drop policy "zero_days: owner can delete today or yesterday" on public.zero_days;

create policy "doses: owner can add in the last 7 days"
  on public.doses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 7
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "doses: owner can edit in the last 7 days"
  on public.doses for update to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 7
  )
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 7
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "doses: owner can delete in the last 7 days"
  on public.doses for delete to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 7
  );

create policy "zero_days: owner can add in the last 7 days"
  on public.zero_days for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and date between (now() at time zone 'Europe/Prague')::date - 7
                 and (now() at time zone 'Europe/Prague')::date
  );
create policy "zero_days: owner can delete in the last 7 days"
  on public.zero_days for delete to authenticated
  using (
    user_id = (select auth.uid())
    and date >= (now() at time zone 'Europe/Prague')::date - 7
  );

revoke all on all functions in schema private from public, anon, authenticated;

commit;
