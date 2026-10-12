-- 0001_schema.sql
-- Tables, constraints and small helper functions.
-- Internal functions live in the `private` schema, which is not exposed by the API.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Calendar "today" in Prague. All days in the app are Prague calendar days.
create or replace function private.prague_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Europe/Prague')::date
$$;

-- ASCII slug of a nickname: must match slugifyNickname() in src/lib/nickname.ts.
create or replace function private.slugify_nickname(p_nickname text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      lower(translate(
        btrim(p_nickname),
        'ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜĽĹŔÔáčďéěíňóřšťúůýžäöüľĺŕô',
        'ACDEEINORSTUUYZAOULLROacdeeinorstuuyzaoullro'
      )),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  )
$$;

-- Public part of a user: visible to all logged-in users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
    check (nickname ~ '^[A-Za-z0-9ÁČĎÉĚÍŇÓŘŠŤÚŮÝŽÄÖÜĽĹŔÔáčďéěíňóřšťúůýžäöüľĺŕô _.-]{3,20}$'
           and nickname = btrim(nickname)),
  nickname_slug text not null unique
    check (nickname_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(nickname_slug) between 2 and 40),
  share_grams boolean not null default false,
  created_at timestamptz not null default now()
);

-- Private part of a user: visible only to the owner.
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  teaspoon_grams numeric(5, 2) check (teaspoon_grams > 0 and teaspoon_grams <= 20),
  price_per_gram numeric(8, 2) check (price_per_gram >= 0 and price_per_gram <= 10000),
  updated_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  baseline_g int not null check (baseline_g between 1 and 300),
  target_g int not null check (target_g >= 0),
  start_date date not null,
  duration_days int not null check (duration_days between 1 and 365),
  curve text not null check (curve in ('linear', 'decelerating')),
  preset text not null check (preset in ('express', 'fast', 'medium', 'slow', 'very_slow', 'custom')),
  status text not null default 'active' check (status in ('active', 'replaced', 'completed')),
  -- Exclusive end date, set when the plan is replaced by a new one.
  ended_on date,
  created_at timestamptz not null default now(),
  check (target_g < baseline_g)
);

create unique index plans_one_active_per_user on public.plans (user_id) where status = 'active';

create table public.pauses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  -- Inclusive last paused day; null while the pause is running.
  end_date date,
  check (end_date is null or end_date >= start_date)
);

create unique index pauses_one_open_per_plan on public.pauses (plan_id) where end_date is null;

-- Authoritative daily limits, written only by private.rebuild_plan_days().
-- The limit of a day is the latest row on or before that day (so the target
-- holds forever after the plan ends, and an open pause holds its limit).
create table public.plan_days (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  plan_id uuid not null references public.plans (id) on delete cascade,
  limit_g int not null check (limit_g >= 0),
  is_paused boolean not null default false,
  primary key (user_id, date)
);

create index plan_days_plan_id on public.plan_days (plan_id);

create table public.doses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  taken_at timestamptz not null,
  -- Prague calendar day of taken_at, always set by a trigger.
  local_date date not null,
  grams numeric(6, 2) not null check (grams > 0 and grams <= 200),
  input_unit text not null check (input_unit in ('g', 'tsp')),
  input_amount numeric(6, 2) not null check (input_amount > 0 and input_amount <= 200),
  feeling smallint check (feeling between 1 and 5),
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);

create index doses_user_date on public.doses (user_id, local_date);

-- Explicit "I took nothing today", so a zero day differs from a forgotten one.
create table public.zero_days (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- Final results of days whose edit window has closed. Written only by the
-- server (pg_cron). Today and yesterday are computed on the fly (provisional).
create table public.daily_results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  plan_id uuid references public.plans (id) on delete set null,
  limit_g int not null,
  baseline_g int not null,
  total_g numeric(7, 2) not null,
  logged boolean not null,
  zero_day boolean not null,
  is_paused boolean not null,
  status text not null check (status in ('met', 'over', 'missed')),
  points int not null,
  streak_after int not null,
  missed_run int not null,
  finalized_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_user uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  -- 👏 💪 ❤️ 🔥
  emoji text not null check (emoji in (E'\U0001F44F', E'\U0001F4AA', E'❤️', E'\U0001F525')),
  created_at timestamptz not null default now(),
  unique (from_user, target_user, date, emoji),
  check (from_user <> target_user)
);

create index reactions_target on public.reactions (target_user, date);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_user uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now()
);

create index comments_target on public.comments (target_user, date);

create table public.feed_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null
    check (type in ('plan_started', 'streak', 'half_baseline', 'target_reached', 'first_zero_day')),
  event_date date not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, type, event_date)
);

create index feed_events_created on public.feed_events (created_at desc);
