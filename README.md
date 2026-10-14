# bezKRATOMU

A mobile-first web app (Czech UI) that helps a small group of friends taper off kratom together:
a day-by-day plan in whole grams, dose logging, points and streaks, charts, a leaderboard, and
reactions/comments for motivation.

**Live:** https://ondrejstuchlikk.github.io/bezKRATOMU/

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
   `supabase/migrations/` **in order** (`0001` … `0009`, then `0011`, `0012`; `0010` comes with the notification setup below) and click *Run*. Each should end with "Success".
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

Evening reminder (only if today isn't logged) and reactions/comments, via web push. Android: Chrome.
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
  today and yesterday, Prague time), never scores. Other users' doses are not readable at all — the
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
  an hourly pg_cron job finalizes older days and writes `daily_results` and feed events.
  `src/lib/scoring.ts` mirrors the rules for demo mode; `src/lib/parity.test.ts` checks both agree.
- **Time zone**: all days are calendar days in `Europe/Prague` (DST-safe).

## Database tests

`supabase/tests/run.sh` applies the migrations to a local Postgres (with stand-ins for Supabase's
`auth` schema) and runs security + scoring checks, including attempts to read or modify another
user's data. Requires `brew install postgresql@17` and a running server.

## Editing things

- **Help contacts**: `src/config/helpContacts.ts` — ⚠️ verify every number and link before publishing.
- **Czech texts**: `src/i18n/cs.ts` (all UI strings in one place).
- **Colors / fonts**: `src/index.css`.
- **PWA icons**: edit `public/pwa-icon.svg`, then run `npx pwa-assets-generator`.

## Known limitations (v1)

- No PIN reset, no account deletion UI, no push notifications, no data export.
- A 6-digit PIN is only as strong as Supabase's sign-in rate limiting; keep the app link among friends.
