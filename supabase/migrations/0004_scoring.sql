-- 0004_scoring.sql
-- Server-side scoring (mirrors src/lib/scoring.ts and src/lib/days.ts),
-- day finalization, statistics and the privacy-aware read RPCs.
-- All amounts are compared as integer centigrams so rounding matches the app.

-- Evaluates consecutive days for one user, starting from the given streak state.
create or replace function private.compute_days(
  p_user uuid, p_from date, p_to date, p_streak int, p_missed int
)
returns table (
  date date, plan_id uuid, limit_g int, baseline_g int, total_g numeric, logged boolean,
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
  v_limit int;
  v_plan uuid;
  v_paused boolean;
  v_baseline int;
  v_total numeric;
  v_count int;
  v_zero boolean;
  v_acg bigint;
  v_lcg bigint;
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
      v_lcg := v_limit::bigint * 100;

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
        if v_limit = 0 then
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
        v_points := -least(20, greatest(1, ((2 * (v_acg - v_lcg) + v_baseline) / (2 * v_baseline))::int));
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

-- Full history of a user: final rows plus provisional rows computed on the fly
-- for every day after the last finalized one (normally yesterday and today).
create or replace function private.user_days(p_user uuid)
returns table (
  date date, plan_id uuid, limit_g int, baseline_g int, total_g numeric, logged boolean,
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

-- Finalizes all days of a user whose edit window has closed (≤ today − 2)
-- and emits feed events for milestones. Idempotent.
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
  v_first_baseline int;
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

-- Run by pg_cron every hour (see 0005_cron.sql).
create or replace function private.finalize_all()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select distinct user_id from public.plan_days loop
    perform private.finalize_user(v_user);
  end loop;
end
$$;

-- Statistics of one user (no privacy filtering; callers must apply it).
create or replace function private.user_stats(p_user uuid)
returns table (
  total_points int, met_days int, scored_days int, met_pct numeric, current_streak int,
  best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric, today_status text,
  current_limit_g int, has_plan boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_b0 int;
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
        round(100.0 * (1 - (select d3.limit_g from d d3 where d3.date = v_today)::numeric / v_b0))
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
-- Public read RPCs (privacy-aware). Exact grams of other users are returned
-- only when they enabled "share_grams"; otherwise only relative values.
-- ---------------------------------------------------------------------------

create or replace function public.get_user_days(p_user uuid, p_from date, p_to date)
returns table (
  date date, status text, points int, streak_after int, is_final boolean, is_paused boolean,
  zero_day boolean, logged boolean, limit_g int, total_g numeric, baseline_g int,
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

create or replace function public.get_user_stats(p_user uuid)
returns table (
  total_points int, met_days int, scored_days int, met_pct numeric, current_streak int,
  best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric, today_status text,
  current_limit_g int, has_plan boolean
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

create or replace function public.get_leaderboard()
returns table (
  user_id uuid, nickname text, total_points int, met_days int, scored_days int, met_pct numeric,
  current_streak int, best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric,
  today_status text, current_limit_g int, has_plan boolean
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

-- "Dnes zatím splnilo 5 z 8 · nezapsáno 2" / "Včera splnilo 6 z 8".
create or replace function public.get_group_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := private.prague_today();
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select jsonb_build_object(
    'today', jsonb_build_object(
      'participants', count(*) filter (where s.t is not null),
      'met', count(*) filter (where s.t = 'met'),
      'over', count(*) filter (where s.t = 'over'),
      'pending', count(*) filter (where s.t = 'pending')
    ),
    'yesterday', jsonb_build_object(
      'participants', count(*) filter (where s.y is not null),
      'met', count(*) filter (where s.y = 'met'),
      'over', count(*) filter (where s.y = 'over'),
      'missed', count(*) filter (where s.y = 'missed')
    )
  ) into v_result
  from public.profiles p
  cross join lateral (
    select max(u.status) filter (where u.date = v_today) as t,
           max(u.status) filter (where u.date = v_today - 1) as y
    from private.user_days(p.id) u
    where u.date >= v_today - 1
  ) s;
  return v_result;
end
$$;

-- Lets the registration form check a nickname before signing up.
create or replace function public.is_nickname_available(p_nickname text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles where nickname_slug = private.slugify_nickname(p_nickname)
  )
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function
  public.get_user_days(uuid, date, date), public.get_user_stats(uuid),
  public.get_leaderboard(), public.get_group_summary(), public.is_nickname_available(text)
  from public, anon;
grant execute on function
  public.get_user_days(uuid, date, date), public.get_user_stats(uuid),
  public.get_leaderboard(), public.get_group_summary(), public.is_nickname_available(text)
  to authenticated;
grant execute on function public.is_nickname_available(text) to anon;
