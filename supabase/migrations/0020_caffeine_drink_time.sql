-- 0020_caffeine_drink_time.sql
-- How long a caffeine drink is sipped, for the "Kofein v těle" estimate (report section 9,
-- docs/caffeine-pk-model/caffeine-pk-model.pdf). The logged time is the start of drinking; the caffeine
-- is assumed to be drunk at an even pace over drink_minutes (0 = all at once, as before).
--
--   * user_settings.caffeine_drink_minutes: the user's default (0 = all at once). Used for entries
--     without their own value, also for older entries, so changing it redraws the past curve.
--   * intake_presets.drink_minutes: per drink; null = use the default.
--   * intakes.drink_minutes: copy of the preset's value when the entry was logged (like preset_name),
--     so editing a preset later doesn't change history; null = use the default. Caffeine only.
--
-- All three are private like the rest of these tables (owner-only RLS from 0002 / 0017). The estimate
-- is still computed in the browser from the owner's own entries; nothing is shared.

begin;

alter table public.user_settings
  add column caffeine_drink_minutes smallint not null default 0 check (caffeine_drink_minutes between 0 and 300);
grant update (caffeine_drink_minutes) on public.user_settings to authenticated;

alter table public.intake_presets
  add column drink_minutes smallint check (drink_minutes between 0 and 300);
grant insert (drink_minutes), update (drink_minutes) on public.intake_presets to authenticated;

alter table public.intakes
  add column drink_minutes smallint check (drink_minutes between 0 and 300);
alter table public.intakes
  add constraint intakes_drink_minutes_caffeine check (substance = 'caffeine' or drink_minutes is null);
grant insert (drink_minutes), update (drink_minutes) on public.intakes to authenticated;

commit;

notify pgrst, 'reload schema';
