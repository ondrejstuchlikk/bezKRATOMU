-- 0016_level_notifications.sql
-- Opt-in push notifications about the "V těle teď" estimate (combined MG + 7-OH line, src/lib/pk.ts):
--   * morning recap (8–10 h Prague): yesterday's highest estimated level vs. the day before;
--   * milestones (9–21 h Prague, at most one a day): the level is the lowest in 3/7/14/30 days, or
--     below 75/50/25/10 % of the plan baseline for the first time in this plan.
-- The estimate is computed only from the owner's own doses and only for the owner's own pushes;
-- no RPC exposes it. Lock-screen texts contain no grams. Same as 0011 otherwise.

begin;

alter table public.user_settings
  add column notify_level boolean not null default false,
  -- Written only by private.claim_level_notifications.
  add column level_checked_at timestamptz,
  add column level_recap_on date,
  add column level_low_on date,
  add column level_pct_plan uuid,
  add column level_pct_reached smallint;
grant update (notify_level) on public.user_settings to authenticated;

-- Combined index E (nM) at p_at from p_user's doses. Constants = src/lib/pk.ts (docs/pk-model/ts_constants.json).
-- Doses after p_at or older than 14 days are ignored, like pkAt(). greatest(…, -700): Postgres raises an
-- error on exp() underflow, where JS just returns 0.
create function private.pk_level(p_user uuid, p_at timestamptz)
returns double precision
language sql
stable
set search_path = ''
as $$
  select greatest(0, coalesce(sum(d.grams::float8 * (
             14.560077654968358 * exp(greatest(-0.01798397824138001 * x.h, -700))
           + 10.043733689897083 * exp(greatest(-0.10947152234747914 * x.h, -700))
           + 300.59118291341076 * exp(greatest(-0.2595274073339729 * x.h, -700))
           - 1632.3840745102586 * exp(greatest(-1.99 * x.h, -700))
           + 1307.1890802519817 * exp(greatest(-2.277781581755706 * x.h, -700)))), 0))
  from public.doses d
  cross join lateral (select extract(epoch from p_at - d.taken_at)::float8 / 3600 as h) x
  where d.user_id = p_user
    and d.local_date >= (p_at at time zone 'Europe/Prague')::date - 15  -- uses doses_user_date
    and d.taken_at <= p_at
    and d.taken_at >= p_at - interval '14 days'
$$;

-- Highest level during a Prague calendar day (sampled every 5 minutes; peaks are broad).
create function private.pk_day_max(p_user uuid, p_date date)
returns double precision
language sql
stable
set search_path = ''
as $$
  select max(private.pk_level(p_user, t))
  from generate_series(p_date::timestamp at time zone 'Europe/Prague',
                       (p_date + 1)::timestamp at time zone 'Europe/Prague',
                       interval '5 minutes') t
$$;

-- low_nm: the lowest level in (p_from, p_to]. low_days: the largest of 3/7/14/30 for which that is
-- lower than every moment of the previous days, else null.
-- Between doses the line rises and then falls, so its lowest points are at dose times and at the
-- ends of a window: checking those is enough (no sampling).
create function private.pk_recent_low(p_user uuid, p_from timestamptz, p_to timestamptz,
                                      out low_nm double precision, out low_days int)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_n int;
  v_prev double precision;
begin
  select min(private.pk_level(p_user, c.t)) into low_nm
  from (select p_to as t
        union all
        select d.taken_at from public.doses d
        where d.user_id = p_user and d.taken_at > p_from and d.taken_at <= p_to) c;
  foreach v_n in array array[3, 7, 14, 30] loop
    select min(private.pk_level(p_user, c.t)) into v_prev
    from (select p_from as t
          union all
          select p_to - make_interval(days => v_n)
          union all
          select d.taken_at from public.doses d
          where d.user_id = p_user
            and d.taken_at >= p_to - make_interval(days => v_n) and d.taken_at <= p_from) c;
    exit when not (low_nm < v_prev);
    low_days := v_n;
  end loop;
end
$$;

-- The level notifications due at p_now, one row per user (devices are joined by the caller).
-- Marks what it returns as sent. Takes "now" as a parameter so the SQL tests can use fixed dates.
create function private.claim_level_notifications(p_now timestamptz)
returns table (user_id uuid, body text, tag text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := (p_now at time zone 'Europe/Prague')::date;
  v_hour int := extract(hour from p_now at time zone 'Europe/Prague');
  s record;
  v_y double precision;
  v_yy double precision;
  v_change int;
  v_from timestamptz;
  v_low_nm double precision;
  v_low_days int;
  v_plan uuid;
  v_baseline numeric;
  v_step smallint;
begin
  for s in
    select us.* from public.user_settings us
    where us.notify_level
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = us.user_id)
  loop
    -- Morning recap, once a day between 8 and 10.
    if v_hour between 8 and 10 and s.level_recap_on is distinct from v_today then
      update public.user_settings us set level_recap_on = v_today where us.user_id = s.user_id;
      v_y := private.pk_day_max(s.user_id, v_today - 1);
      v_yy := private.pk_day_max(s.user_id, v_today - 2);
      if v_yy > 1 then  -- ~0.5 % of a 1 g peak; below that there is nothing to compare
        v_change := round(100 * (v_y - v_yy) / v_yy);
        user_id := s.user_id;
        tag := 'level-recap';
        body := case
          when v_change <= -3 then format('Včera byl nejvyšší odhad v těle o %s %% nižší než předevčírem 📉', -v_change)
          when v_change >= 3 then format('Včera byl nejvyšší odhad v těle o %s %% vyšší než předevčírem.', v_change)
          else 'Včera byl nejvyšší odhad v těle zhruba stejný jako předevčírem.'
        end;
        return next;
      end if;
    end if;

    -- Milestones between 9 and 21. The night is not checked tick by tick: the first check in the
    -- morning covers everything since the last evening check (so a low just before the morning
    -- dose still counts), and nobody is woken up.
    if v_hour between 9 and 21 then
      v_from := greatest(coalesce(s.level_checked_at, p_now - interval '10 minutes'), p_now - interval '1 day');
      update public.user_settings us set level_checked_at = p_now where us.user_id = s.user_id;
      if s.level_low_on is distinct from v_today and v_from < p_now then
        select l.low_nm, l.low_days into v_low_nm, v_low_days from private.pk_recent_low(s.user_id, v_from, p_now) l;
        select p.id, p.baseline_g into v_plan, v_baseline
        from public.plans p where p.user_id = s.user_id and p.status = 'active';
        v_step := null;
        if v_plan is not null and v_baseline > 0 then
          -- 75.549… = steady-state daily mean (nM) per g/day, PK_REF_NM_PER_G_DAY in pk.ts
          select min(x) into v_step from unnest(array[75, 50, 25, 10]::smallint[]) x
          where 100 * v_low_nm / (75.5490164830535 * v_baseline) < x;
          if s.level_pct_plan is not distinct from v_plan and v_step >= s.level_pct_reached then
            v_step := null;  -- already announced in this plan
          end if;
        end if;
        if v_step is not null then
          update public.user_settings us
            set level_low_on = v_today, level_pct_plan = v_plan, level_pct_reached = v_step
            where us.user_id = s.user_id;
          user_id := s.user_id;
          tag := 'level-low';
          body := format('Nový milník: odhad v těle klesl pod %s %% tvého výchozího stavu 🌱', v_step);
          return next;
        elsif v_low_days is not null then
          update public.user_settings us set level_low_on = v_today where us.user_id = s.user_id;
          user_id := s.user_id;
          tag := 'level-low';
          body := format('Odhad v těle klesl na nejnižší hodnotu za %s. Tělo se čistí 🌱',
                         case when v_low_days = 3 then '3 dny' else v_low_days || ' dní' end);
          return next;
        end if;
      end if;
    end if;
  end loop;
end
$$;

create or replace function private.claim_push_notifications()
returns table (endpoint text, p256dh text, auth text, title text, body text, url text, tag text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := private.prague_today();
  v_hour int := extract(hour from now() at time zone 'Europe/Prague');
begin
  -- Evening reminder: once a day at the chosen Prague hour, when less than half
  -- of today's limit is logged (nothing at all counts too), unless the day is
  -- marked as "nothing today". A limit of 0 only reminds when nothing is logged.
  return query
    with candidates as (
      select s.user_id,
             (select pd.limit_g from public.plan_days pd
              where pd.user_id = s.user_id and pd.date <= v_today
              order by pd.date desc limit 1) as limit_g,
             (select coalesce(sum(d.grams), 0) from public.doses d
              where d.user_id = s.user_id and d.local_date = v_today) as total_g,
             exists (select 1 from public.doses d
                     where d.user_id = s.user_id and d.local_date = v_today) as has_doses
      from public.user_settings s
      where s.reminder_hour = v_hour
        and s.last_reminder_on is distinct from v_today
        and exists (select 1 from public.plans p where p.user_id = s.user_id and p.status = 'active')
        and not exists (select 1 from public.zero_days z where z.user_id = s.user_id and z.date = v_today)
    ),
    due as (
      update public.user_settings s set last_reminder_on = v_today
      from candidates c
      where s.user_id = c.user_id and c.limit_g is not null and (not c.has_doses or c.total_g * 2 < c.limit_g)
      returning s.user_id, c.has_doses
    )
    select ps.endpoint, ps.p256dh, ps.auth, 'bezKRATOMU'::text,
           case when due.has_doses
             then 'Zatím máš zapsanou méně než polovinu dnešního limitu. Nezapomeň zapsat všechny dávky 🌱'
             else 'Nezapomeň zapsat dnešek 🌱'
           end,
           './'::text, 'reminder'::text
    from due join public.push_subscriptions ps on ps.user_id = due.user_id;

  -- Estimate of the level in the body (0016).
  return query
    select ps.endpoint, ps.p256dh, ps.auth, 'bezKRATOMU'::text, l.body, './'::text, l.tag
    from private.claim_level_notifications(now()) l
    join public.push_subscriptions ps on ps.user_id = l.user_id;

  -- Reactions to your day (all pending ones are marked, sent only if wanted).
  return query
    with r as (
      update public.reactions x set notified = true where not x.notified
      returning x.from_user, x.target_user, x.date, x.emoji
    )
    select ps.endpoint, ps.p256dh, ps.auth, 'bezKRATOMU'::text,
           p.nickname || ' ti poslal(a) ' || r.emoji,
           './#/u/' || r.target_user || '/' || r.date,
           'social-' || r.date
    from r
    join public.user_settings s on s.user_id = r.target_user and s.notify_social
    join public.profiles p on p.id = r.from_user
    join public.push_subscriptions ps on ps.user_id = r.target_user;

  -- Comments on your day (the text itself stays in the app).
  return query
    with c as (
      update public.comments x set notified = true where not x.notified
      returning x.author_id, x.target_user, x.date
    )
    select ps.endpoint, ps.p256dh, ps.auth, 'bezKRATOMU'::text,
           p.nickname || ' ti napsal(a) komentář 💬',
           './#/u/' || c.target_user || '/' || c.date,
           'social-' || c.date
    from c
    join public.user_settings s on s.user_id = c.target_user and s.notify_social
    join public.profiles p on p.id = c.author_id
    join public.push_subscriptions ps on ps.user_id = c.target_user
    where c.author_id <> c.target_user;
end
$$;

revoke all on all functions in schema private from public, anon, authenticated;

commit;
