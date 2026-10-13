-- 0008_custom_plans.sql
-- Hand-made plans: the user sets the limit of every day (curve 'manual').
-- The limits are stored per plan day (index 1 = the start day), so pauses shift
-- them exactly like generated plans. Mirrors src/lib/plan.ts.

begin;

alter table public.plans
  add column custom_limits numeric(4, 1)[],
  drop constraint plans_curve_check,
  add constraint plans_curve_check check (curve in ('linear', 'decelerating', 'manual')),
  -- A hand-made plan may also hold the dose flat (target = baseline).
  drop constraint plans_check,
  add constraint plans_check check (target_g < baseline_g or (curve = 'manual' and target_g = baseline_g)),
  add constraint plans_custom_limits_check check (
    (curve = 'manual') = (custom_limits is not null)
    and (custom_limits is null or cardinality(custom_limits) = duration_days + 1)
  );

-- Ends the user's active plan before a new one starts today: removed if it also
-- started today, otherwise kept for history (status 'replaced', ending yesterday).
create or replace function private.retire_active_plan(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_old public.plans;
begin
  select * into v_old from public.plans where user_id = p_user and status = 'active' for update;
  if not found then return; end if;
  if v_old.start_date >= v_today then
    delete from public.plans where id = v_old.id;
  else
    delete from public.pauses where plan_id = v_old.id and start_date >= v_today;
    update public.pauses set end_date = v_today - 1 where plan_id = v_old.id and end_date is null;
    update public.plans set status = 'replaced', ended_on = v_today where id = v_old.id;
    perform private.rebuild_plan_days(v_old.id);
  end if;
end
$$;

-- Same as in 0006, but hand-made plans take their limits from custom_limits.
create or replace function private.rebuild_plan_days(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_open_start date;
  v_d date;
  v_t int := 0;
  v_limit numeric;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then return; end if;

  delete from public.plan_days where plan_id = p_plan_id;
  select start_date into v_open_start from public.pauses where plan_id = p_plan_id and end_date is null;

  v_d := v_plan.start_date;
  while v_t <= v_plan.duration_days and (v_plan.ended_on is null or v_d < v_plan.ended_on) loop
    if v_plan.curve = 'manual' then
      v_limit := v_plan.custom_limits[v_t + 1];
    else
      v_limit := private.plan_limit(v_plan.baseline_g, v_plan.target_g, v_plan.duration_days, v_plan.curve, v_t);
    end if;
    if v_open_start is not null and v_d >= v_open_start then
      insert into public.plan_days (user_id, date, plan_id, limit_g, is_paused)
        values (v_plan.user_id, v_d, v_plan.id, v_limit, true);
      exit;
    elsif exists (
      select 1 from public.pauses p
      where p.plan_id = p_plan_id and p.end_date is not null and v_d between p.start_date and p.end_date
    ) then
      insert into public.plan_days (user_id, date, plan_id, limit_g, is_paused)
        values (v_plan.user_id, v_d, v_plan.id, v_limit, true);
    else
      insert into public.plan_days (user_id, date, plan_id, limit_g, is_paused)
        values (v_plan.user_id, v_d, v_plan.id, v_limit, false);
      v_t := v_t + 1;
    end if;
    v_d := v_d + 1;
  end loop;
end
$$;

-- Same as in 0006, with the old-plan handling moved to private.retire_active_plan().
create or replace function public.create_plan(
  p_baseline numeric, p_target numeric, p_duration int, p_curve text, p_preset text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.prague_today();
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_baseline is null or p_baseline < 0.5 or p_baseline > 300 or p_baseline * 2 <> trunc(p_baseline * 2) then
    raise exception 'invalid_baseline';
  end if;
  if p_target is null or p_target < 0 or p_target >= p_baseline or p_target * 2 <> trunc(p_target * 2) then
    raise exception 'invalid_target';
  end if;
  if p_duration is null or p_duration < 1 or p_duration > 365 then raise exception 'invalid_duration'; end if;
  if p_curve is null or p_curve not in ('linear', 'decelerating') then raise exception 'invalid_curve'; end if;
  if p_preset is null or p_duration is distinct from (case p_preset
      when 'express' then 5 when 'fast' then 14 when 'medium' then 28
      when 'slow' then 56 when 'very_slow' then 84 when 'custom' then p_duration
    end) then
    raise exception 'invalid_preset';
  end if;

  perform private.retire_active_plan(v_user);

  insert into public.plans (user_id, baseline_g, target_g, start_date, duration_days, curve, preset)
    values (v_user, p_baseline, p_target, v_today, p_duration, p_curve, p_preset)
    returning id into v_id;
  perform private.rebuild_plan_days(v_id);

  insert into public.feed_events (user_id, type, event_date, payload)
    values (v_user, 'plan_started', v_today, jsonb_build_object('preset', p_preset, 'duration_days', p_duration))
    on conflict do nothing;

  return v_id;
end
$$;

-- Hand-made plan starting today: p_limits[1] is today's limit, p_limits[2]
-- tomorrow's, … Each limit is a half gram from 0 to 300 and never higher than
-- the day before; the first one is at least 0.5. Mirrors validateCustomLimits().
create or replace function public.create_custom_plan(p_limits numeric[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.prague_today();
  v_limits numeric[];
  v_n int;
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  -- Normalize to a plain 1-based array.
  select array_agg(x order by i) into v_limits from unnest(p_limits) with ordinality u(x, i);
  v_n := coalesce(cardinality(v_limits), 0);
  if v_n < 2 or v_n > 366 then raise exception 'invalid_duration'; end if;
  if exists (
    select 1 from unnest(v_limits) with ordinality u(x, i)
    where x is null or x < 0 or x > 300 or x * 2 <> trunc(x * 2) or (i > 1 and x > v_limits[i - 1])
  ) then
    raise exception 'invalid_limits';
  end if;
  if v_limits[1] < 0.5 then raise exception 'invalid_baseline'; end if;

  perform private.retire_active_plan(v_user);

  insert into public.plans (user_id, baseline_g, target_g, start_date, duration_days, curve, preset, custom_limits)
    values (v_user, v_limits[1], v_limits[v_n], v_today, v_n - 1, 'manual', 'custom', v_limits)
    returning id into v_id;
  perform private.rebuild_plan_days(v_id);

  insert into public.feed_events (user_id, type, event_date, payload)
    values (v_user, 'plan_started', v_today, jsonb_build_object('preset', 'custom', 'duration_days', v_n - 1))
    on conflict do nothing;

  return v_id;
end
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_custom_plan(numeric[]) from public, anon;
grant execute on function public.create_custom_plan(numeric[]) to authenticated;

commit;

-- Let the API see the new function right away.
notify pgrst, 'reload schema';
