-- 0009_push.sql
-- Web push notifications: an evening reminder when today isn't logged yet, and
-- a heads-up when someone reacts to or comments on your day. The database
-- decides what is due (private.claim_push_notifications); the Edge Function in
-- supabase/functions/push only encrypts and delivers. Lock-screen texts are kept
-- discreet: no grams and no mention of what is being tapered.

begin;

-- One row per device (browser) that allowed notifications.
create table public.push_subscriptions (
  endpoint text primary key
    -- Only the browsers' real push services, so the sender never posts elsewhere.
    check (endpoint ~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com)/'
           and char_length(endpoint) <= 1000),
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index push_subscriptions_user on public.push_subscriptions (user_id);

-- Written only through the functions below.
alter table public.push_subscriptions enable row level security;
create policy "push: owner can read"
  on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
grant select on public.push_subscriptions to authenticated;

-- Per-user preferences (apply to all of the user's devices).
alter table public.user_settings
  add column reminder_hour smallint check (reminder_hour between 0 and 23),
  add column notify_social boolean not null default false,
  add column last_reminder_on date;
grant update (reminder_hour, notify_social) on public.user_settings to authenticated;

-- Reactions and comments remember whether their notification went out.
-- Existing ones are marked as done so nobody gets a burst of old news.
alter table public.reactions add column notified boolean not null default false;
alter table public.comments add column notified boolean not null default false;
update public.reactions set notified = true;
update public.comments set notified = true;

-- Saves this device for the logged-in user. A device that was used by someone
-- else before (log out, log in as another user) moves to the new user.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
    values (p_endpoint, auth.uid(), p_p256dh, p_auth)
    on conflict (endpoint) do update
      set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end
$$;

create function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Everything that should be sent now, one row per device. Marks what it
-- returns as sent, so calling it again returns nothing new. Called every few
-- minutes by the push Edge Function (see 0010_push_cron.sql).
create function private.claim_push_notifications()
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
  -- Evening reminder: once a day at the chosen Prague hour, only if today has
  -- neither a dose nor a "nothing today" mark.
  return query
    with due as (
      update public.user_settings s set last_reminder_on = v_today
      where s.reminder_hour = v_hour
        and s.last_reminder_on is distinct from v_today
        and exists (select 1 from public.plans p where p.user_id = s.user_id and p.status = 'active')
        and not exists (select 1 from public.doses d where d.user_id = s.user_id and d.local_date = v_today)
        and not exists (select 1 from public.zero_days z where z.user_id = s.user_id and z.date = v_today)
      returning s.user_id
    )
    select ps.endpoint, ps.p256dh, ps.auth, 'bezKRATOMU'::text, 'Nezapomeň zapsat dnešek 🌱'::text, './'::text, 'reminder'::text
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

-- Devices whose subscription the push service reports as gone.
create function private.remove_push_subscriptions(p_endpoints text[])
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = any (p_endpoints)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.delete_push_subscription(text)
  to authenticated;

commit;

notify pgrst, 'reload schema';
