# bezKRATOMU

A mobile-first web app (Czech UI) that helps a small group of friends taper off kratom together:
a day-by-day plan in half grams, dose logging, streaks, charts, a group page with rankings, and
reactions/comments for motivation.

**Live:** https://ondrejstuchlikk.github.io/bezKRATOMU/

Changes are listed in [CHANGELOG.md](CHANGELOG.md); notes for AI coding agents are in [CLAUDE.md](CLAUDE.md).

## Demo mode vs. real mode

- **Demo mode** — when the build has no Supabase credentials, the app runs entirely in the browser
  (data in `localStorage`) with six simulated friends. A yellow banner says "Ukázkový režim".
  You can register, or log in as Petr / Jana / Tomáš / Lucie / Marek / Bára with PIN `123456`.
- **Real mode** — as soon as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set, the app
  talks to Supabase and all rules are enforced by the database.

## Tech stack

React + Vite + TypeScript + Tailwind CSS + Recharts + TanStack Query, `HashRouter`, PWA
(vite-plugin-pwa). Backend: Supabase (Postgres, Auth, RLS, pg_cron). Hosting: GitHub Pages via
GitHub Actions. Tests: Vitest.

## Run locally

```bash
npm install
cp .env.example .env.local   # optional: fill in Supabase URL + anon key (otherwise demo mode)
npm run dev                  # open the printed URL
```

Other commands: `npm test` (unit tests), `npm run build`, `npm run lint`.

## Supabase setup (one time)

1. **Create the project** at [supabase.com](https://supabase.com): *New project*, name `bezKRATOMU`,
   region *Central EU (Frankfurt)*, generate and save a database password.
2. **Run the migrations**: *SQL Editor → New query*, paste the content of each file in
   `supabase/migrations/` **in order** (`0001` … `0009`, then `0011` … `0019`; `0010` comes with the notification setup below) and click *Run*. Each should end with "Success".
   If `0005_cron.sql` fails because of pg_cron, enable it in *Database → Extensions → pg_cron*
   (or *Integrations → Cron*) and run the file again.
3. **Auth settings** (*Authentication*):
   - *Sign In / Providers → Email*: turn **off** "Confirm email". Keep "Allow new users to sign up" on.
   - Minimum password length: **6** (the PIN is the password).
   - *Sessions*: "Time-box user sessions" and "Inactivity timeout" must stay **disabled** (never),
     so users stay logged in until they log out.
4. **Keys**: *Project Settings → API Keys* — copy the *Project URL* and the *anon / publishable* key.
   These are public by design. Never put the `service_role` / secret key anywhere in this repo.
5. **GitHub**: repo → *Settings → Secrets and variables → Actions → Variables* → add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Then *Actions → Deploy to GitHub Pages → Run workflow*.

## Push notifications (one time)

Evening reminder (when less than half of today's limit is logged), reactions/comments and (opt-in) the
*V těle teď* estimate: a morning recap and "lowest level" milestones, via web push. Android: Chrome.
iPhone: iOS 16.4+, only when the app is added to the home screen.

1. Generate a key pair: `npx web-push generate-vapid-keys --json`. Put the public key in
   `src/config/push.ts`; keep the private key secret.
2. Run `supabase/migrations/0009_push.sql` in the SQL editor.
3. Deploy the Edge Function and its secrets (after `npx supabase login`):
   ```bash
   npx supabase secrets set --project-ref <ref> VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… \
     VAPID_SUBJECT=https://ondrejstuchlikk.github.io/bezKRATOMU/ CRON_SECRET=<random>
   npx supabase functions deploy push --project-ref <ref> --no-verify-jwt --use-api
   ```
4. In the SQL editor, store the function URL and the same `CRON_SECRET` in Vault (see the header of
   `0010_push_cron.sql`), then run `0010_push_cron.sql`.

The database decides what is due (`private.claim_push_notifications()`); the function only encrypts and
sends. Lock-screen texts never contain grams.

## How it works

- **Security**: every table has Row Level Security. Users can only write their own doses (and only for
  today and the 7 days before it, Prague time), never scores. Other users' doses are not readable at all — the
  app gets aggregated, privacy-filtered data from `security definer` functions, and exact grams only
  when the person enabled "Sdílet přesné gramy".
- **Plans**: limits move in half-gram steps (0.5, 1, 1.5, …), so small doses taper gently.
  `src/lib/plan.ts` and `private.plan_limit()` use the same formula
  `L(t) = target + ceil½((baseline − target) · ((D − t)/D)^k)`, k = 1 (linear) or 2 (decelerating),
  computed with integers in half-gram units. The database materializes the authoritative limits in `plan_days`.
- **Hand-made plans**: users can also set the limit of each day themselves (*Můj plán → Upravit limity
  po dnech*, or *Upravit jednotlivé dny* in the wizard). Limits are half grams and never go up;
  `create_custom_plan()` stores them in `plans.custom_limits` and pauses shift them like any plan.
- **Teaspoons**: users who set their spoon size in Nastavení also see each limit in teaspoons
  (rounded down to 0.1, so following it never exceeds the limit).
- **Scoring**: computed only on the server. Today and yesterday are provisional (computed on the fly);
  an hourly pg_cron job finalizes older days and writes `daily_results` and feed events. Older days can
  still be edited for a week: a trigger then recomputes that user's final days (and automatic feed
  posts) from the edited day on (`private.refinalize_from`).
  `src/lib/scoring.ts` mirrors the rules for demo mode; `src/lib/parity.test.ts` checks both agree.
  The scoring also produces points, but since 2026-10-26 the app no longer shows them anywhere —
  they're only used internally (the database still computes and returns them).
- **Skupina page**: tabs at the top — *Dnes* (today's group summary, the group's longest time without
  a dose, everyone's intake as % of their limit) and rankings (*Aktuální série*, the default;
  *Splněné dny*, *Snížení*, *Nejdelší bez dávky*, *Odstup dávek*). The *Aktivita* feed sits below
  every tab. The old `#/zebricek` link redirects here.
- **Time between doses**: `private.gap_stats()` (mirrored by `src/lib/gaps.ts`) measures gaps between
  doses in a row, night included, plus the gap still running since the latest dose. A gap only counts
  if every day inside it was logged as a zero day (yesterday may still be open), so unlogged days don't
  produce fake records. The record, the 5-day average and the all-time average are visible to the group;
  the time of the latest dose only to its owner.
- **Time zone**: all days are calendar days in `Europe/Prague` (DST-safe).
- **Other substances** (`0017_substances.sql`): besides kratom, users can track caffeine (*Nastavení →
  Sledované látky*, off by default; a one-time window after the update offers it, remembered per account in
  `user_settings.substances_intro_seen`). A pill at the top of the tabs (*🌿 Kratom ▾*) switches Dnes, Graf,
  Skupina and Nastavení between substances; the choice is kept per device. Caffeine is plain tracking — no plan,
  no scoring — stored in `public.intakes` (mg) with the user's own drinks in `public.intake_presets`
  (every account starts with *Velký energeťák* 150 mg and *Malý energeťák* 75 mg; an entry keeps a copy of the
  drink's name, so editing a drink doesn't change history). Same 7-day edit window as doses. Only the owner can
  read their entries; Skupina says it's kratom-only for now. Statistics (daily totals, averages, time between
  entries) are computed in the browser by `src/lib/intakeStats.ts`; a day without entries counts as 0 mg.
  When sharing comes, they must move into security-definer RPCs like the kratom ones.
- **Caffeine in the body** (*Dnes* with Kofein selected → *Kofein v těle*): `src/lib/caffeinePk.ts` estimates the
  caffeine absorbed and not yet eliminated from the user's own entries of the last 72 h (one-compartment model,
  half-life 5.2 h, absorption peak ~50 min), shown in mg and cups of coffee (100 mg each), with a 24 h chart,
  a projection past bedtime, the amount at bedtime and when it falls below a soft sleep reference
  (0.52 mg per kg body weight). Body weight (default 70 kg) and bedtime (default 23:00) are in Nastavení
  (`0019_caffeine_level.sql`). Literature, model choice, validation and limits:
  `docs/caffeine-pk-model/caffeine-pk-model.pdf`; `docs/caffeine-pk-model/model.py` regenerates the constants.
  For users who track cigarettes, their own cigarettes of the last 28 days speed up the elimination (CYP1A2
  induction: dose-response by cigarettes in the last 24 h, follows changes with a 38.6 h half-life; report section 8,
  `cafSmokingClearance`). Snus doesn't count. Browser only, no database change.
- **Nicotine** (`0018_nicotine.sql`): cigarettes and snus (*sibiř*), each switched on separately; nicotine
  shows in the switcher when at least one is on. One entry = one piece (`public.intakes` with substance
  `cigarette` / `snus`, amount 1): *+1 cigareta* / *+1 sibiř* logs it at the current time (with *Zpět* to undo),
  *Zapsat s jiným časem…* and the lists allow other times within the 7-day window. Graf: pieces per day by form,
  averages, time between entries (both forms together, `src/lib/intakeStats.ts`) and money spent
  (`src/lib/nicotine.ts`; pack price + pieces per pack per form in Nastavení, defaults 160 Kč / 20 and
  130 Kč / 20, applied at today's prices). The update window (version 2) offers nicotine to everyone once.
- **Kratom in the body** (*Dnes* → *V těle teď*): `src/lib/pk.ts` estimates mitragynine and
  7-OH-mitragynine from your own doses of the last 14 days with a published two-compartment
  pharmacokinetic model, calibrated to clinical data for leaf powder (1.6 % mitragynine assumed).
  The big number is *kratom by effect* (`kratomEffectGrams`): the combined, potency-weighted level expressed
  in grams of powder, scaled so that a 1 g dose shows 1 g at its peak (~1.7 h). It is not powder in the body;
  it moves exactly with the level. A small line shows the mg of mitragynine and 7-OH not yet eliminated. *Hladina* is
  the same combined level in %, where 100 % = the average level at the plan's baseline. The chart shows the last 12, 24 (default) or 48 hours, or 3/5/7 days (*Více* menu), plus a 12-hour projection; the choice
  is kept in `localStorage`. Below it: when the level would fall under the next steps (75/50/25/10 % of
  baseline; without a plan or below 10 %: to half and a tenth of now) if no more is taken, each with a range
from a faster and a slower variant of the model (terminal half-life 20 h and 60 h; 84 h when the last 14 days
averaged more than 12 g/day), also drawn as a light band around the projection. The card runs only
  in the browser and only on your own doses. The opt-in notifications (`0016_level_notifications.sql`) compute
  the same combined line in SQL (`private.pk_level`), only for the owner's own pushes: a morning recap (8–10 h:
  yesterday's highest level vs. the day before) and at most one milestone a day (9–22 h): the lowest level in
  3/7/14/30 days, or below 75/50/25/10 % of baseline for the first time in the plan. The night is checked in one
  go at the first check after 9:00, so nobody is woken up. The literature review, maths,
  validation and limits are in `docs/pk-model/kratom-pk-model.pdf` (section 9: the review of studies on regular
  and heavy users behind the range); `docs/pk-model/model.py` regenerates the report's numbers and the constants
  used in `pk.ts`. Publishers' PDFs used for the review are kept locally in `papers/` (gitignored).

## Database tests

`supabase/tests/run.sh` applies the migrations to a local Postgres (with stand-ins for Supabase's
`auth` schema) and runs security + scoring checks, including attempts to read or modify another
user's data. Requires `brew install postgresql@17` and a running server.

## Editing things

- **Help contacts**: `src/config/helpContacts.ts` — ⚠️ verify every number and link before publishing.
- **Czech texts**: `src/i18n/cs.ts` (all UI strings in one place).
- **Kratom powder strength** (1.6 % mitragynine) for the *V těle teď* card: change `F_MG_CONTENT` in
  `docs/pk-model/model.py`, run `python3 -I docs/pk-model/model.py`, copy the numbers from
  `docs/pk-model/ts_constants.json` into `src/lib/pk.ts`, update the "1,6 %" texts in `src/i18n/cs.ts`, and
  run `npm test` (the tests that pin 1.6 % will need their values updated too).
- **Colors / fonts**: `src/index.css`.
- **PWA icons**: edit `public/pwa-icon.svg`, then run `npx pwa-assets-generator`.

## Known limitations (v1)

- No PIN reset, no account deletion UI, no data export.
- The *V těle teď* estimate is a population average for one powder strength (1.6 % mitragynine);
  it has no per-user settings (body weight, product strength) and doesn't know doses taken before
  someone started logging. There are no measurements in long-term users above about 12 g/day, so for them the
  projection's range is an extrapolation.
- A 6-digit PIN is only as strong as Supabase's sign-in rate limiting; keep the app link among friends.
