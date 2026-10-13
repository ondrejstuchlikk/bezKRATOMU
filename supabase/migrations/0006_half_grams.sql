-- 0006_half_grams.sql
-- Plans and daily limits move in half-gram steps (0.5, 1, 1.5, …) instead of
-- whole grams, so small doses taper more gently. Existing whole-gram plans and
-- results stay valid and unchanged; only new plans use the half-gram formula.
-- Mirrors src/lib/plan.ts and src/lib/scoring.ts.

begin;

-- Functions whose argument or result types change must be dropped first.
drop function if exists public.get_leaderboard();
drop function if exists public.get_user_stats(uuid);
drop function if exists public.get_user_days(uuid, date, date);
drop function if exists private.user_stats(uuid);
drop function if exists private.user_days(uuid);
drop function if exists private.compute_days(uuid, date, date, int, int);
drop function if exists public.create_plan(int, int, int, text, text);
drop function if exists private.plan_limit(int, int, int, text, int);

-- ---------------------------------------------------------------------------
-- Columns: whole grams → half grams
-- ---------------------------------------------------------------------------

alter table public.plans
  drop constraint plans_baseline_g_check,
  drop constraint plans_target_g_check,
  alter column baseline_g type numeric(4, 1),
  alter column target_g type numeric(4, 1),
  add constraint plans_baseline_g_check
    check (baseline_g between 0.5 and 300 and baseline_g * 2 = trunc(baseline_g * 2)),
  add constraint plans_target_g_check
    check (target_g >= 0 and target_g * 2 = trunc(target_g * 2));

alter table public.plan_days
  drop constraint plan_days_limit_g_check,
  alter column limit_g type numeric(4, 1),
  add constraint plan_days_limit_g_check
    check (limit_g >= 0 and limit_g * 2 = trunc(limit_g * 2));

alter table public.daily_results
  alter column limit_g type numeric(4, 1),
  alter column baseline_g type numeric(4, 1);

-- ---------------------------------------------------------------------------
-- Plan generation
-- ---------------------------------------------------------------------------

-- Limit on day t: target + (baseline − target) · ((D − t) / D)^k, rounded up to
-- the next half gram. Integer arithmetic in half-gram units, like planLimit().
create function private.plan_limit(
  p_baseline numeric, p_target numeric, p_duration int, p_curve text, p_t int
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_b2 bigint := round(p_baseline * 2);
  v_t2 bigint := round(p_target * 2);
  v_num bigint;
  v_den bigint;
begin
  if p_t <= 0 then return p_baseline; end if;
  if p_t >= p_duration then return p_target; end if;
  if p_curve = 'linear' then
    v_num := (v_b2 - v_t2) * (p_duration - p_t);
    v_den := p_duration;
  else
    v_num := (v_b2 - v_t2) * (p_duration - p_t) * (p_duration - p_t);
    v_den := p_duration::bigint * p_duration;
  end if;
  return ((v_t2 + (v_num + v_den - 1) / v_den) / 2.0)::numeric(4, 1);
end
$$;

-- Same as in 0003, only v_limit is now numeric.
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

-- Same as in 0003, but baseline and target may be half grams.
create function public.create_plan(
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
  v_old public.plans;
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

-- ---------------------------------------------------------------------------
-- Scoring (same rules as 0004, with numeric limits and baselines)
-- ---------------------------------------------------------------------------

create function private.compute_days(
  p_user uuid, p_from date, p_to date, p_streak int, p_missed int
)
returns table (
  date date, plan_id uuid, limit_g numeric, baseline_g numeric, total_g numeric, logged boolean,
  zero_day boolean, is_paused boolean, status text, points int, streak_after int, missed_run int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := private.prague_today();
  v_d date := p_from;
  v_streak int := p_streak;
  v_missed int := p_missed;
  v_limit numeric;
  v_plan uuid;
  v_paused boolean;
  v_baseline numeric;
  v_total numeric;
  v_count int;
  v_zero boolean;
  v_acg bigint;
  v_lcg bigint;
  v_bcg bigint;
  v_base int;
  v_k int;
  v_status text;
  v_points int;
begin
  while v_d <= p_to loop
    select pd.limit_g, pd.plan_id, pd.is_paused, pl.baseline_g
      into v_limit, v_plan, v_paused, v_baseline
      from public.plan_days pd
      join public.plans pl on pl.id = pd.plan_id
      where pd.user_id = p_user and pd.date <= v_d
      order by pd.date desc
      limit 1;

    if found then
      select coalesce(sum(x.grams), 0), count(*) into v_total, v_count
        from public.doses x where x.user_id = p_user and x.local_date = v_d;
      v_zero := v_count = 0 and exists (
        select 1 from public.zero_days z where z.user_id = p_user and z.date = v_d
      );
      v_acg := round(v_total * 100)::bigint;
      v_lcg := round(v_limit * 100)::bigint;
      v_bcg := round(v_baseline * 100)::bigint;

      if v_count = 0 and not v_zero then
        if v_d >= v_today then
          v_status := 'pending';
          v_points := 0;
        else
          v_missed := v_missed + 1;
          v_streak := 0;
          v_status := 'missed';
          v_points := -least(40, 20 + 5 * (v_missed - 1));
        end if;
      elsif v_acg <= v_lcg then
        v_status := 'met';
        v_missed := 0;
        v_streak := v_streak + 1;
        if v_lcg = 0 then
          v_base := 15;
        else
          v_base := 10 + ((10 * (v_lcg - v_acg) + v_lcg) / (2 * v_lcg))::int;
        end if;
        v_k := least(5, v_streak / 7);
        v_points := ((2 * v_base * (10 + v_k) + 10) / 20)::int;
      else
        v_status := 'over';
        v_missed := 0;
        v_streak := 0;
        v_points := -least(20, greatest(1, ((200 * (v_acg - v_lcg) + v_bcg) / (2 * v_bcg))::int));
      end if;

      date := v_d; plan_id := v_plan; limit_g := v_limit; baseline_g := v_baseline;
      total_g := v_total; logged := v_count > 0 or v_zero; zero_day := v_zero; is_paused := v_paused;
      status := v_status; points := v_points; streak_after := v_streak; missed_run := v_missed;
      return next;
    end if;

    v_d := v_d + 1;
  end loop;
end
$$;

create function private.user_days(p_user uuid)
returns table (
  date date, plan_id uuid, limit_g numeric, baseline_g numeric, total_g numeric, logged boolean,
  zero_day boolean, is_paused boolean, status text, points int, streak_after int, missed_run int,
  is_final boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_last public.daily_results;
  v_from date;
begin
  return query
    select r.date, r.plan_id, r.limit_g, r.baseline_g, r.total_g, r.logged, r.zero_day, r.is_paused,
           r.status, r.points, r.streak_after, r.missed_run, true
    from public.daily_results r
    where r.user_id = p_user
    order by r.date;

  select * into v_last from public.daily_results r where r.user_id = p_user order by r.date desc limit 1;
  if found then
    v_from := v_last.date + 1;
  else
    select min(pd.date) into v_from from public.plan_days pd where pd.user_id = p_user;
  end if;
  if v_from is null then return; end if;

  return query
    select c.*, false
    from private.compute_days(
      p_user, v_from, private.prague_today(),
      coalesce(v_last.streak_after, 0), coalesce(v_last.missed_run, 0)
    ) c;
end
$$;

-- Same as in 0004, only v_first_baseline is now numeric.
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
        values (p_user, 'target_reached', r.date, jsonb_build_object('plan_id', r.plan_id, 'target_g', r.limit_g))
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

create function private.user_stats(p_user uuid)
returns table (
  total_points int, met_days int, scored_days int, met_pct numeric, current_streak int,
  best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric, today_status text,
  current_limit_g numeric, has_plan boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_b0 numeric;
begin
  select pl.baseline_g into v_b0 from public.plans pl where pl.user_id = p_user order by pl.created_at limit 1;

  return query
    with d as materialized (select * from private.user_days(p_user))
    select
      coalesce(sum(d.points), 0)::int,
      (count(*) filter (where d.status = 'met'))::int,
      (count(*) filter (where d.status <> 'pending'))::int,
      case when count(*) filter (where d.status <> 'pending') > 0 then
        round(100.0 * count(*) filter (where d.status = 'met') / count(*) filter (where d.status <> 'pending'))
      end,
      coalesce((select d2.streak_after from d d2 order by d2.date desc limit 1), 0)::int,
      coalesce(max(d.streak_after), 0)::int,
      case when v_b0 is not null then
        round(100.0 * (1 - (select d3.limit_g from d d3 where d3.date = v_today) / v_b0))
      end,
      case when v_b0 is not null then
        round(100.0 * (1 - (select avg(d4.total_g) from d d4
                            where d4.logged and d4.date >= v_today - 7 and d4.date < v_today) / v_b0))
      end,
      coalesce((select d5.status from d d5 where d5.date = v_today), 'none'),
      (select d6.limit_g from d d6 where d6.date = v_today),
      v_b0 is not null
    from d;
end
$$;

-- ---------------------------------------------------------------------------
-- Public read RPCs (same privacy rules as 0004)
-- ---------------------------------------------------------------------------

create function public.get_user_days(p_user uuid, p_from date, p_to date)
returns table (
  date date, status text, points int, streak_after int, is_final boolean, is_paused boolean,
  zero_day boolean, logged boolean, limit_g numeric, total_g numeric, baseline_g numeric,
  plan_pct numeric, actual_pct numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_show boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select (p.id = auth.uid() or p.share_grams) into v_show from public.profiles p where p.id = p_user;
  if v_show is null then return; end if;

  return query
    select u.date, u.status, u.points, u.streak_after, u.is_final, u.is_paused, u.zero_day, u.logged,
           case when v_show then u.limit_g end,
           case when v_show then u.total_g end,
           case when v_show then u.baseline_g end,
           round(100.0 * u.limit_g / u.baseline_g, 1),
           case when u.logged then round(100.0 * u.total_g / u.baseline_g, 1) end
    from private.user_days(p_user) u
    where u.date between p_from and p_to
    order by u.date;
end
$$;

create function public.get_user_stats(p_user uuid)
returns table (
  total_points int, met_days int, scored_days int, met_pct numeric, current_streak int,
  best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric, today_status text,
  current_limit_g numeric, has_plan boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_show boolean;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select (p.id = auth.uid() or p.share_grams) into v_show from public.profiles p where p.id = p_user;
  if v_show is null then return; end if;

  return query
    select s.total_points, s.met_days, s.scored_days, s.met_pct, s.current_streak, s.best_streak,
           s.reduction_limit_pct, s.reduction_avg_pct, s.today_status,
           case when v_show then s.current_limit_g end,
           s.has_plan
    from private.user_stats(p_user) s;
end
$$;

create function public.get_leaderboard()
returns table (
  user_id uuid, nickname text, total_points int, met_days int, scored_days int, met_pct numeric,
  current_streak int, best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric,
  today_status text, current_limit_g numeric, has_plan boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query
    select p.id, p.nickname, s.total_points, s.met_days, s.scored_days, s.met_pct, s.current_streak,
           s.best_streak, s.reduction_limit_pct, s.reduction_avg_pct, s.today_status,
           case when p.id = auth.uid() or p.share_grams then s.current_limit_g end,
           s.has_plan
    from public.profiles p
    cross join lateral private.user_stats(p.id) s
    order by p.nickname;
end
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the recreated functions
-- ---------------------------------------------------------------------------

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.create_plan(numeric, numeric, int, text, text),
  public.get_user_days(uuid, date, date), public.get_user_stats(uuid), public.get_leaderboard()
  from public, anon;
grant execute on function
  public.create_plan(numeric, numeric, int, text, text),
  public.get_user_days(uuid, date, date), public.get_user_stats(uuid), public.get_leaderboard()
  to authenticated;

commit;

-- Let the API see the new create_plan signature right away.
notify pgrst, 'reload schema';
