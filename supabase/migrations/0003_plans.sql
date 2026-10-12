-- 0003_plans.sql
-- Plan generation (same integer arithmetic as src/lib/plan.ts) and the RPCs
-- the app calls to create, pause and resume plans.

-- Limit on day t: target + ceil((baseline − target) · ((D − t) / D)^k).
create or replace function private.plan_limit(
  p_baseline int, p_target int, p_duration int, p_curve text, p_t int
)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_num bigint;
  v_den bigint;
begin
  if p_t <= 0 then return p_baseline; end if;
  if p_t >= p_duration then return p_target; end if;
  if p_curve = 'linear' then
    v_num := (p_baseline - p_target)::bigint * (p_duration - p_t);
    v_den := p_duration;
  else
    v_num := (p_baseline - p_target)::bigint * (p_duration - p_t) * (p_duration - p_t);
    v_den := p_duration::bigint * p_duration;
  end if;
  return p_target + ((v_num + v_den - 1) / v_den)::int;
end
$$;

-- Rewrites plan_days for one plan from its parameters and pauses.
-- Mirrors buildPlanDays() in src/lib/plan.ts.
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
  v_limit int;
begin
  select * into v_plan from public.plans where id = p_plan_id;
  if not found then return; end if;

  delete from public.plan_days where plan_id = p_plan_id;
  select start_date into v_open_start from public.pauses where plan_id = p_plan_id and end_date is null;

  v_d := v_plan.start_date;
  while v_t <= v_plan.duration_days and (v_plan.ended_on is null or v_d < v_plan.ended_on) loop
    v_limit := private.plan_limit(v_plan.baseline_g, v_plan.target_g, v_plan.duration_days, v_plan.curve, v_t);
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

-- Creates a new plan starting today. An existing active plan is kept for
-- history (status 'replaced', ending yesterday) or removed if it also
-- started today.
create or replace function public.create_plan(
  p_baseline int, p_target int, p_duration int, p_curve text, p_preset text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := private.prague_today();
  v_old public.plans;
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_baseline is null or p_baseline < 1 or p_baseline > 300 then raise exception 'invalid_baseline'; end if;
  if p_target is null or p_target < 0 or p_target >= p_baseline then raise exception 'invalid_target'; end if;
  if p_duration is null or p_duration < 1 or p_duration > 365 then raise exception 'invalid_duration'; end if;
  if p_curve is null or p_curve not in ('linear', 'decelerating') then raise exception 'invalid_curve'; end if;
  if p_preset is null or p_duration is distinct from (case p_preset
      when 'express' then 5 when 'fast' then 14 when 'medium' then 28
      when 'slow' then 56 when 'very_slow' then 84 when 'custom' then p_duration
    end) then
    raise exception 'invalid_preset';
  end if;

  select * into v_old from public.plans where user_id = v_user and status = 'active' for update;
  if found then
    if v_old.start_date >= v_today then
      delete from public.plans where id = v_old.id;
    else
      delete from public.pauses where plan_id = v_old.id and start_date >= v_today;
      update public.pauses set end_date = v_today - 1 where plan_id = v_old.id and end_date is null;
      update public.plans set status = 'replaced', ended_on = v_today where id = v_old.id;
      perform private.rebuild_plan_days(v_old.id);
    end if;
  end if;

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

-- "Zůstanu na současné dávce": hold today's limit until resumed.
create or replace function public.pause_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_plan public.plans;
  v_last date;
begin
  select * into v_plan from public.plans where user_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'no_active_plan'; end if;
  if exists (select 1 from public.pauses where plan_id = v_plan.id and end_date is null) then
    raise exception 'already_paused';
  end if;
  select max(date) into v_last from public.plan_days where plan_id = v_plan.id;
  if v_last is null or v_today >= v_last then raise exception 'plan_finished'; end if;

  insert into public.pauses (plan_id, user_id, start_date) values (v_plan.id, v_plan.user_id, v_today);
  perform private.rebuild_plan_days(v_plan.id);
end
$$;

-- Resumes the plan today; the remaining schedule is shifted by the pause length.
create or replace function public.resume_plan()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_plan public.plans;
  v_pause public.pauses;
begin
  select * into v_plan from public.plans where user_id = auth.uid() and status = 'active' for update;
  if not found then raise exception 'no_active_plan'; end if;
  select * into v_pause from public.pauses where plan_id = v_plan.id and end_date is null;
  if not found then raise exception 'not_paused'; end if;

  if v_pause.start_date >= v_today then
    delete from public.pauses where id = v_pause.id;
  else
    update public.pauses set end_date = v_today - 1 where id = v_pause.id;
  end if;
  perform private.rebuild_plan_days(v_plan.id);
end
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.create_plan(int, int, int, text, text), public.pause_plan(), public.resume_plan()
  from public, anon;
grant execute on function public.create_plan(int, int, int, text, text), public.pause_plan(), public.resume_plan()
  to authenticated;
