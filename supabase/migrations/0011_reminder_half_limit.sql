-- 0011_reminder_half_limit.sql
-- The evening reminder now also comes when less than half of today's limit is
-- logged (maybe some doses weren't written down yet), not only when nothing is.
-- Same as 0009 otherwise.

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
