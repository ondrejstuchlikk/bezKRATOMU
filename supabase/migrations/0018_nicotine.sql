-- 0018_nicotine.sql
-- Tracking nicotine in two forms: cigarettes ('cigarette') and snus, called "sibiř" in the app ('snus').
--
--   * public.intakes accepts the two new kinds. One row = one cigarette or one pouch (amount = 1, no preset).
--   * user_settings.track_cigarettes / track_snus: which forms the user tracks (both off by default).
--   * Prices for the "money spent" statistics: price of a pack and pieces per pack, per form.
--     Defaults 160 Kč / 20 cigarettes and 130 Kč / 20 pouches; users can change them.
--   * The "new substances" window gets version 2 (offers nicotine); see SUBSTANCES_INTRO_VERSION.
--
-- Same rules as caffeine (0017): only the owner can read or write, today and the 7 days before it.
-- Same as 0017 otherwise.

begin;

alter table public.intakes drop constraint intakes_substance;
alter table public.intakes add constraint intakes_substance check (substance in ('caffeine', 'cigarette', 'snus'));
alter table public.intakes add constraint intakes_nicotine_one_piece
  check (substance = 'caffeine' or (amount = 1 and preset_name is null and preset_count is null));

alter table public.user_settings
  add column track_cigarettes boolean not null default false,
  add column track_snus boolean not null default false,
  add column cigarette_pack_price numeric(8, 2) default 160 check (cigarette_pack_price >= 0 and cigarette_pack_price <= 10000),
  add column cigarette_pack_size smallint not null default 20 check (cigarette_pack_size between 1 and 1000),
  add column snus_pack_price numeric(8, 2) default 130 check (snus_pack_price >= 0 and snus_pack_price <= 10000),
  add column snus_pack_size smallint not null default 20 check (snus_pack_size between 1 and 1000);
grant update (track_cigarettes, track_snus, cigarette_pack_price, cigarette_pack_size, snus_pack_price, snus_pack_size)
  on public.user_settings to authenticated;

commit;
