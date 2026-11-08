-- 0017_substances.sql
-- Tracking substances other than kratom, starting with caffeine.
--
--   * public.intakes: one row per intake (caffeine in mg). Separate from public.doses so nothing about
--     kratom plans, scoring, streaks, finalization or the body-level estimate changes.
--   * public.intake_presets: the user's own drinks ("Velký energeťák" = 150 mg, …), like the teaspoon
--     for kratom. Each intake keeps a copy of the preset's name, so editing or deleting a preset
--     doesn't change history.
--   * user_settings.track_caffeine: whether the user tracks caffeine (off by default).
--   * user_settings.substances_intro_seen: which version of the "new substances" window the user has
--     closed (1 = caffeine). Stored on the account so it shows once, not once per device.
--
-- Only the owner can read or write their intakes and presets. Intakes can be added, changed and
-- deleted for today and the 7 days before it (Prague time), like doses (0015). Nothing is shared with
-- other users yet; when sharing comes, it must go through security-definer RPCs like kratom (0004).

begin;

alter table public.user_settings
  add column track_caffeine boolean not null default false,
  add column substances_intro_seen smallint not null default 0
    check (substances_intro_seen between 0 and 100);
grant update (track_caffeine, substances_intro_seen) on public.user_settings to authenticated;

create table public.intake_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  substance text not null constraint intake_presets_substance check (substance in ('caffeine')),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  amount_mg numeric(6, 1) not null check (amount_mg > 0 and amount_mg <= 1000),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index intake_presets_user on public.intake_presets (user_id, substance);

create table public.intakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  substance text not null constraint intakes_substance check (substance in ('caffeine')),
  taken_at timestamptz not null,
  -- Prague calendar day of taken_at, always set by a trigger.
  local_date date not null,
  -- Caffeine: mg.
  amount numeric(6, 1) not null check (amount > 0 and amount <= 2000),
  -- Copy of the preset used (null = amount typed in directly) and how many of it.
  preset_name text check (char_length(preset_name) between 1 and 40),
  preset_count numeric(4, 1) check (preset_count > 0 and preset_count <= 20),
  created_at timestamptz not null default now(),
  check ((preset_name is null) = (preset_count is null))
);

create index intakes_user_date on public.intakes (user_id, substance, local_date);

-- The Prague day is always derived on the server (like private.doses_before_write). user_id can't be
-- set by clients (no column grant, defaults to auth.uid(), checked by RLS) and never changes.
create function private.intakes_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.substance := old.substance;
    new.created_at := old.created_at;
  end if;
  new.local_date := (new.taken_at at time zone 'Europe/Prague')::date;
  return new;
end
$$;

create trigger intakes_before_write
  before insert or update on public.intakes
  for each row execute function private.intakes_before_write();

create function private.intake_presets_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if tg_op = 'INSERT' then
    -- user_id: clients can't set it (no column grant, defaults to auth.uid(); RLS checks it), and the
    -- server seeds presets for other accounts, so it is not overwritten here.
    new.created_at := now();
    if (select count(*) from public.intake_presets p where p.user_id = new.user_id) >= 30 then
      raise exception 'too_many_presets';
    end if;
  else
    new.user_id := old.user_id;
    new.substance := old.substance;
    new.created_at := old.created_at;
  end if;
  return new;
end
$$;

create trigger intake_presets_before_write
  before insert or update on public.intake_presets
  for each row execute function private.intake_presets_before_write();

-- Default caffeine presets for every account, now and for new sign-ups.
create function private.seed_intake_presets(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.intake_presets (user_id, substance, name, amount_mg, sort_order)
  values (p_user, 'caffeine', 'Velký energeťák', 150, 1),
         (p_user, 'caffeine', 'Malý energeťák', 75, 2)
$$;

create function private.profiles_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_intake_presets(new.id);
  return null;
end
$$;

create trigger profiles_after_insert
  after insert on public.profiles
  for each row execute function private.profiles_after_insert();

select private.seed_intake_presets(id) from public.profiles;

-- Privileges: Supabase grants everything on new tables by default, so start from nothing.
revoke all on public.intakes, public.intake_presets from anon, authenticated;

grant select, delete on public.intakes to authenticated;
grant insert (substance, taken_at, amount, preset_name, preset_count) on public.intakes to authenticated;
grant update (taken_at, amount, preset_name, preset_count) on public.intakes to authenticated;

grant select, delete on public.intake_presets to authenticated;
grant insert (substance, name, amount_mg, sort_order) on public.intake_presets to authenticated;
grant update (name, amount_mg, sort_order) on public.intake_presets to authenticated;

alter table public.intakes enable row level security;
alter table public.intake_presets enable row level security;

create policy "intakes: owner can read"
  on public.intakes for select to authenticated using (user_id = (select auth.uid()));
create policy "intakes: owner can add in the last 7 days"
  on public.intakes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 7
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "intakes: owner can edit in the last 7 days"
  on public.intakes for update to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 7
  )
  with check (
    user_id = (select auth.uid())
    and local_date between (now() at time zone 'Europe/Prague')::date - 7
                       and (now() at time zone 'Europe/Prague')::date
  );
create policy "intakes: owner can delete in the last 7 days"
  on public.intakes for delete to authenticated
  using (
    user_id = (select auth.uid())
    and local_date >= (now() at time zone 'Europe/Prague')::date - 7
  );

create policy "intake_presets: owner can read"
  on public.intake_presets for select to authenticated using (user_id = (select auth.uid()));
create policy "intake_presets: owner can add"
  on public.intake_presets for insert to authenticated with check (user_id = (select auth.uid()));
create policy "intake_presets: owner can edit"
  on public.intake_presets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "intake_presets: owner can delete"
  on public.intake_presets for delete to authenticated using (user_id = (select auth.uid()));

revoke all on all functions in schema private from public, anon, authenticated;

commit;
