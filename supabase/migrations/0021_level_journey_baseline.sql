-- 0021_level_journey_baseline.sql
-- "V těle teď": 100 % is now the usual level at the start of the user's records, not at the start of the
-- current plan (people start new plans). The start = average grams per day over the days with doses among the
-- first 7 days from the first dose, today excluded; at least 3 such days are needed, until then the first plan's
-- baseline is used. TS mirror: journeyBaselineG in src/lib/pk.ts.
-- The milestone pushes ("below 75/50/25/10 % of your starting level") use this reference and are announced once
-- ever instead of once per plan; level_pct_plan is no longer used (set to null).
-- Same as 0016 otherwise.

begin;

create function private.journey_baseline_g(p_user uuid, p_today date)
returns numeric
language sql
stable
set search_path = ''
as $$
  with first as (
    select min(d.local_date) as d from public.doses d where d.user_id = p_user
  ), days as (
    select d.local_date, sum(d.grams) as g
    from public.doses d cross join first f
    where d.user_id = p_user
      and d.local_date between f.d and f.d + 6
      and d.local_date < p_today
      and d.grams > 0
    group by d.local_date
  )
  select case when count(*) >= 3 then avg(g) end from days
$$;

create or replace function private.claim_level_notifications(p_now timestamptz)
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
  v_ref numeric;
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
        -- 100 % = start of the records, else the first plan's baseline (useLevelReference in queries.ts).
        v_ref := coalesce(
          private.journey_baseline_g(s.user_id, v_today),
          (select p.baseline_g from public.plans p where p.user_id = s.user_id order by p.created_at limit 1));
        v_step := null;
        if v_ref > 0 then
          -- 75.549… = steady-state daily mean (nM) per g/day, PK_REF_NM_PER_G_DAY in pk.ts
          select min(x) into v_step from unnest(array[75, 50, 25, 10]::smallint[]) x
          where 100 * v_low_nm / (75.5490164830535 * v_ref) < x;
          if v_step >= s.level_pct_reached then
            v_step := null;  -- already announced (once ever, as the 100 % no longer changes with a new plan)
          end if;
        end if;
        if v_step is not null then
          update public.user_settings us
            set level_low_on = v_today, level_pct_plan = null, level_pct_reached = v_step
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

revoke all on all functions in schema private from public, anon, authenticated;

commit;
