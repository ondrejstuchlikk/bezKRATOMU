-- 0019_caffeine_level.sql
-- Settings for the "Kofein v těle" estimate (docs/caffeine-pk-model/caffeine-pk-model.pdf):
--   * body_weight_kg: scales the soft sleep reference (0.52 mg/kg); null = the default 70 kg.
--   * bedtime: Prague clock time used for "how much caffeine at bedtime" (default 23:00).
-- Both are private like the rest of user_settings (owner-only RLS from 0002). The estimate itself is
-- computed in the browser from the owner's own intakes; nothing new is stored or shared.

begin;

alter table public.user_settings
  add column body_weight_kg numeric(4, 1) check (body_weight_kg between 30 and 250),
  add column bedtime text not null default '23:00' check (bedtime ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
grant update (body_weight_kg, bedtime) on public.user_settings to authenticated;

commit;
