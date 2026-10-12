-- 0002_security.sql
-- Row Level Security, table privileges and integrity triggers.
-- The anon key is public, so every rule that matters is enforced here.

-- ---------------------------------------------------------------------------
-- Profile creation on sign-up
-- ---------------------------------------------------------------------------

-- Supabase Auth creates auth.users rows; we derive the profile from them.
-- The login email is "<slug>@<domain>"; the display nickname comes from the
-- sign-up metadata and must slugify to the same slug.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nickname text := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
  v_slug text := split_part(new.email, '@', 1);
begin
  if private.slugify_nickname(v_nickname) <> v_slug then
    raise exception 'nickname_slug_mismatch';
  end if;
  insert into public.profiles (id, nickname, nickname_slug) values (new.id, v_nickname, v_slug);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Doses: owner and Prague day are always derived on the server.
create or replace function private.doses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  if new.taken_at > now() + interval '5 minutes' then
    raise exception 'dose_in_future';
  end if;
  new.local_date := (new.taken_at at time zone 'Europe/Prague')::date;
  return new;
end
$$;

create trigger doses_before_write
  before insert or update on public.doses
  for each row execute function private.doses_before_write();

-- Logging a dose replaces an explicit zero-day mark for that day.
create or replace function private.doses_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.zero_days where user_id = new.user_id and date = new.local_date;
  return null;
end
$$;

create trigger doses_after_write
  after insert or update on public.doses
  for each row execute function private.doses_after_write();

create or replace function private.zero_days_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  if exists (select 1 from public.doses d where d.user_id = new.user_id and d.local_date = new.date) then
    raise exception 'doses_exist';
  end if;
  return new;
end
$$;

create trigger zero_days_before_insert
  before insert on public.zero_days
  for each row execute function private.zero_days_before_insert();

create or replace function private.social_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'reactions' then
    new.from_user := coalesce(auth.uid(), new.from_user);
  else
    new.author_id := coalesce(auth.uid(), new.author_id);
    new.body := btrim(new.body);
  end if;
  new.created_at := now();
  return new;
end
$$;

create trigger reactions_before_insert
  before insert on public.reactions
  for each row execute function private.social_before_insert();

create trigger comments_before_insert
  before insert on public.comments
  for each row execute function private.social_before_insert();

-- ---------------------------------------------------------------------------
-- Privileges: start from nothing, then grant exactly what the app needs.
-- Scoring tables (plans, plan_days, pauses, daily_results, feed_events) are
-- read-only for clients; they are written only by security-definer functions.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (share_grams) on public.profiles to authenticated;

grant select on public.user_settings to authenticated;
grant update (teaspoon_grams, price_per_gram, updated_at) on public.user_settings to authenticated;

grant select on public.plans, public.pauses, public.plan_days, public.daily_results to authenticated;

grant select, delete on public.doses to authenticated;
grant insert (taken_at, grams, input_unit, input_amount, feeling, note) on public.doses to authenticated;
grant update (taken_at, grams, input_unit, input_amount, feeling, note) on public.doses to authenticated;

grant select, delete on public.zero_days to authenticated;
grant insert (date) on public.zero_days to authenticated;

grant select, delete on public.reactions to authenticated;
grant insert (target_user, date, emoji) on public.reactions to authenticated;

grant select, delete on public.comments to authenticated;
grant insert (target_user, date, body) on public.comments to authenticated;

grant select on public.feed_events to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.plans enable row level security;
alter table public.pauses enable row level security;
alter table public.plan_days enable row level security;
alter table public.doses enable row level security;
alter table public.zero_days enable row level security;
alter table public.daily_results enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.feed_events enable row level security;

create policy "profiles: everyone logged in can read"
  on public.profiles for select to authenticated using (true);
create policy "profiles: owner can update"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "settings: owner can read"
  on public.user_settings for select to authenticated using (user_id = (select auth.uid()));
create policy "settings: owner can update"
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "plans: owner can read"
  on public.plans for select to authenticated using (user_id = (select auth.uid()));
create policy "pauses: owner can read"
  on public.pauses for select to authenticated using (user_id = (select auth.uid()));
create policy "plan_days: owner can read"
  on public.plan_days for select to authenticated using (user_id = (select auth.uid()));
create policy "daily_results: owner can read"
  on public.daily_results for select to authenticated using (user_id = (select auth.uid()));

-- Doses: only the owner, and only for today and yesterday (Prague time).
-- Other users never read doses directly; they get aggregated, privacy-filtered
-- data from the security-definer functions in 0004_scoring.sql.
create policy "doses: owner can read"
  on public.doses for select to authenticated using (user_id = (select auth.uid()));
create policy "doses: owner can add today or yesterday"
  on public.doses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 1
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "doses: owner can edit today or yesterday"
  on public.doses for update to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 1
  )
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 1
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "doses: owner can delete today or yesterday"
  on public.doses for delete to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 1
  );

create policy "zero_days: owner can read"
  on public.zero_days for select to authenticated using (user_id = (select auth.uid()));
create policy "zero_days: owner can add today or yesterday"
  on public.zero_days for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and date between (now() at time zone 'Europe/Prague')::date - 1
                 and (now() at time zone 'Europe/Prague')::date
  );
create policy "zero_days: owner can delete today or yesterday"
  on public.zero_days for delete to authenticated
  using (
    user_id = (select auth.uid())
    and date >= (now() at time zone 'Europe/Prague')::date - 1
  );

create policy "reactions: everyone logged in can read"
  on public.reactions for select to authenticated using (true);
create policy "reactions: add as yourself"
  on public.reactions for insert to authenticated
  with check (
    from_user = (select auth.uid())
    and date <= (now() at time zone 'Europe/Prague')::date
  );
create policy "reactions: remove your own"
  on public.reactions for delete to authenticated using (from_user = (select auth.uid()));

create policy "comments: everyone logged in can read"
  on public.comments for select to authenticated using (true);
create policy "comments: add as yourself"
  on public.comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and date <= (now() at time zone 'Europe/Prague')::date
  );
create policy "comments: author or day owner can delete"
  on public.comments for delete to authenticated
  using (author_id = (select auth.uid()) or target_user = (select auth.uid()));

create policy "feed: everyone logged in can read"
  on public.feed_events for select to authenticated using (true);

-- Internal functions are never callable through the API.
revoke all on all functions in schema private from public, anon, authenticated;
