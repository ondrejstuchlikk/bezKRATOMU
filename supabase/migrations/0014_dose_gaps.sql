-- 0014_dose_gaps.sql
-- Time between doses: record gap and average gap (all time and last 5 days),
-- added to get_user_stats and get_leaderboard. Visible to everyone like the
-- percentages; the time of the latest dose only to its owner.
-- Same as 0006 otherwise. Mirrored in src/lib/gaps.ts.

begin;

drop function if exists public.get_leaderboard();
drop function if exists public.get_user_stats(uuid);

-- Average gap in seconds. The gap still running counts only once it is longer
-- than the average of the finished ones, so a fresh dose never drags it down.
create function private.gap_mean(p_sum numeric, p_n bigint, p_running numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_running is not null and (p_n = 0 or p_running > p_sum / p_n)
      then (coalesce(p_sum, 0) + p_running) / (p_n + 1)
    when p_n > 0 then p_sum / p_n
  end
$$;

-- Gaps between doses in a row (night included), plus the one running since the
-- latest dose up to p_now. Doses later than p_now are ignored. A gap counts only
-- if every day strictly inside it is marked as a zero day, so a day nobody logged
-- doesn't produce a fake record. For the running gap yesterday doesn't need to be
-- marked yet, it is still open for logging.
create function private.gap_stats(p_user uuid, p_now timestamptz)
returns table (
  last_dose_at timestamptz, record_gap_min int, record_running boolean,
  avg_gap_5d_min int, avg_gap_all_min int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (p_now at time zone 'Europe/Prague')::date;
begin
  return query
    with d as materialized (
      select x.taken_at, x.local_date,
             lag(x.taken_at) over w as prev_at, lag(x.local_date) over w as prev_date
      from public.doses x
      where x.user_id = p_user and x.taken_at <= p_now
      window w as (order by x.taken_at)
    ),
    last_dose as (
      select d.taken_at, d.local_date from d order by d.taken_at desc limit 1
    ),
    g as (
      select extract(epoch from d.taken_at - d.prev_at) as secs, d.local_date as end_date, false as running
      from d
      where d.prev_at is not null
        and (select count(*) from public.zero_days z
             where z.user_id = p_user and z.date > d.prev_date and z.date < d.local_date)
            = greatest(0, d.local_date - d.prev_date - 1)
      union all
      select extract(epoch from p_now - l.taken_at), v_today, true
      from last_dose l
      where (select count(*) from public.zero_days z
             where z.user_id = p_user and z.date > l.local_date and z.date < v_today - 1)
            = greatest(0, v_today - l.local_date - 2)
    ),
    c as (
      select
        max(g.secs) filter (where g.running) as run_secs,
        max(g.secs) filter (where not g.running) as best_secs,
        sum(g.secs) filter (where not g.running) as all_sum,
        count(*) filter (where not g.running) as all_n,
        sum(g.secs) filter (where not g.running and g.end_date >= v_today - 4) as recent_sum,
        count(*) filter (where not g.running and g.end_date >= v_today - 4) as recent_n
      from g
    )
    select
      (select l.taken_at from last_dose l),
      floor(greatest(c.best_secs, c.run_secs) / 60)::int,
      coalesce(c.run_secs > coalesce(c.best_secs, -1), false),
      round(private.gap_mean(c.recent_sum, c.recent_n, c.run_secs) / 60)::int,
      round(private.gap_mean(c.all_sum, c.all_n, c.run_secs) / 60)::int
    from c;
end
$$;

create function public.get_user_stats(p_user uuid)
returns table (
  total_points int, met_days int, scored_days int, met_pct numeric, current_streak int,
  best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric, today_status text,
  current_limit_g numeric, has_plan boolean, last_dose_at timestamptz, record_gap_min int,
  record_gap_running boolean, avg_gap_5d_min int, avg_gap_all_min int
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
           s.has_plan,
           case when p_user = auth.uid() then gs.last_dose_at end,
           gs.record_gap_min, gs.record_running, gs.avg_gap_5d_min, gs.avg_gap_all_min
    from private.user_stats(p_user) s
    cross join private.gap_stats(p_user, now()) gs;
end
$$;

create function public.get_leaderboard()
returns table (
  user_id uuid, nickname text, total_points int, met_days int, scored_days int, met_pct numeric,
  current_streak int, best_streak int, reduction_limit_pct numeric, reduction_avg_pct numeric,
  today_status text, current_limit_g numeric, has_plan boolean, last_dose_at timestamptz,
  record_gap_min int, record_gap_running boolean, avg_gap_5d_min int, avg_gap_all_min int
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
           s.has_plan,
           case when p.id = auth.uid() then gs.last_dose_at end,
           gs.record_gap_min, gs.record_running, gs.avg_gap_5d_min, gs.avg_gap_all_min
    from public.profiles p
    cross join lateral private.user_stats(p.id) s
    cross join lateral private.gap_stats(p.id, now()) gs
    order by p.nickname;
end
$$;

revoke all on function private.gap_mean(numeric, bigint, numeric), private.gap_stats(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_user_stats(uuid), public.get_leaderboard() from public, anon;
grant execute on function public.get_user_stats(uuid), public.get_leaderboard() to authenticated;

commit;

notify pgrst, 'reload schema';
