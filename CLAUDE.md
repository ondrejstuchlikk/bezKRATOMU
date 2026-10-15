# CLAUDE.md — working notes for AI agents

Read this first. `README.md` has setup and architecture for humans; `CHANGELOG.md` lists every change
with the migration it needs. This file is what you need to work on the repo without re-learning it.

## The user and how to work with them

- Owner: GitHub `ondrejstuchlikk`. A programming beginner — give **exact click-by-click steps** for
  anything they must do by hand (Supabase dashboard, GitHub settings). Explain trade-offs briefly.
- **Chat in English.** The app UI is Czech; code, comments and commit messages are English.
  (`prompt.txt` — the original spec, gitignored, local only — says to talk in Czech; the user overrode that.)
- Commit straight to `main` (no branches/PRs in this repo); pushing to `main` deploys to GitHub Pages.
  Only commit/push when the user asks ("push" means commit + push).
- Before pushing UI changes the user likes them checked in a real browser — see *Verify in a browser*.
- Ask before changing privacy behaviour (who can see grams). Ask clarifying questions for ambiguous UI
  requests; offer concrete options.

## Keep the docs current (part of every change)

Do this in the same commit as the change itself, without being asked:

- **`CHANGELOG.md`**: add an entry for every change a user would notice (features, behaviour, fixes,
  removed things). Put it under today's date at the top, newest first, in plain language for a non-programmer,
  and name the migration file if one is needed. Pure refactors and doc-only edits don't need an entry.
- **`README.md`**: keep it true. When a change affects anything it describes (setup steps, the migration list in
  step 2, how a feature works, known limitations, commands), update that part. If you notice something
  outdated while working, fix it.
- **`CLAUDE.md`** (this file): update it when you learn something a future agent needs: a new rule,
  workflow, gotcha, or a change in what the live DB has applied.

## What the app is

Mobile-first PWA for a small group of friends tapering off kratom: day-by-day plan with a gram limit per
day, dose logging, server-side points/streaks, charts, leaderboard, group page, reactions/comments,
web push reminders. Live: https://ondrejstuchlikk.github.io/bezKRATOMU/ (Supabase project ref
`yhusaoowjzmrdhbbgglw`, Frankfurt, Free plan).

Stack: React 19 + Vite + TypeScript + Tailwind 4 + TanStack Query + Recharts, `HashRouter`
(routes like `#/skupina`), vite-plugin-pwa. Backend: Supabase (Postgres + Auth + RLS + pg_cron +
one Edge Function). Tests: Vitest + plain-SQL checks. Lint: oxlint.

## Map of the code

| Where | What |
|---|---|
| `src/api/types.ts` | `Backend` interface + all shared data types. **Every backend feature goes through it.** |
| `src/api/supabaseBackend.ts` | Real backend: tables + RPCs, maps snake_case rows → types, maps SQL errors → `AppError` codes |
| `src/api/demoBackend.ts` | Full in-browser backend used when no Supabase env vars (six fake friends, localStorage) |
| `src/api/index.ts` | Picks the backend: Supabase if `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set, else demo |
| `src/hooks/queries.ts` | TanStack Query hooks + keys; `useRefreshAfterChange()` invalidates by key prefix (`'group'` also covers `['group','today']`) |
| `src/pages/*` | One file per screen. Tabs: Dnes (`TodayPage`), Graf, Žebříček, Skupina (`GroupPage`), Nastavení |
| `src/components/DoseSheet.tsx` | Add/edit dose bottom sheet |
| `src/components/ui.tsx` | `Card`, `Button`, `Segmented`, `cx`, `inputClass`, `Loading`, `ErrorState`, … |
| `src/i18n/cs.ts` | **All** Czech UI strings. Never hard-code Czech text in components |
| `src/lib/time.ts` | Prague-time helpers (`pragueToday`, `pragueLocalToInstant`, `addDays`, …). Days are `Europe/Prague` calendar days |
| `src/lib/units.ts` | `formatGrams`, `formatNumber`, `formatPct`, teaspoon conversion, `MAX_DOSE_G` |
| `src/lib/plan.ts`, `scoring.ts`, `days.ts` | TS mirrors of the SQL plan/scoring logic (used by demo mode, unit-tested) |
| `src/lib/gaps.ts` | TS mirror of `private.gap_stats` (time between doses); `gaps.test.ts` pins the same numbers as the SQL checks |
| `src/lib/parity.test.ts` | Checks TS scoring == SQL scoring using `src/lib/__fixtures__/sql_user_days.json` (written by the SQL test run) |
| `supabase/migrations/NNNN_*.sql` | Database schema/functions, applied in order |
| `supabase/tests/rls_and_scoring.sql` | Security + scoring checks; `run.sh` runs them on local Postgres |
| `supabase/functions/push/index.ts` | Edge Function that only encrypts/sends web push; the DB decides what is due |
| `src/config/push.ts` | VAPID public key. `src/config/helpContacts.ts`: help lines (user must verify) |

## Rules that must not break

- **Security lives in the database.** RLS on every table. Users write only their own doses, only for
  today/yesterday (Prague) — enforced by RLS policies in `0002_security.sql`. Scores are computed only on
  the server (`private.compute_days` / `user_days`); clients can't write them.
- **Privacy of grams.** Other users' doses are never readable directly. Other users' data comes from
  `security definer` RPCs (`get_user_days`, `get_user_stats`, `get_leaderboard`, `get_group_summary`,
  `get_group_today`) which return grams only when `p.id = auth.uid() or p.share_grams`.
  Time-between-doses stats (record, averages) are visible to everyone; `last_dose_at` only to the owner.
  A running record still reveals roughly when someone last dosed — the user accepted that. Percentages
  (% of baseline, % of today's limit) are visible to everyone. The feed and lock-screen push texts never
  contain grams. Any new RPC must follow the same pattern and be granted to `authenticated` only.
- **Logic exists twice (SQL + TS).** Changing plan or scoring rules means changing the SQL *and*
  `src/lib/*.ts`, then running both test suites. The demo backend must mirror the real backend's rules and
  privacy filtering.
- **Doses may be at a later time today** (since 0012); RLS still blocks tomorrow and anything before
  yesterday.

## Database migrations — how they work here

- The live DB is **not** managed by the Supabase CLI. The user pastes each new migration into
  *Supabase → SQL Editor → New query → Run*. **Never suggest `supabase db push`** — there is no migration
  history table, it would re-run everything.
- **Never edit a migration that already ran.** Add the next number. To change a function, re-declare it
  with `create or replace` (or `drop function` + `create` if the return type changes) and say in the
  header comment "Same as NNNN otherwise". End with grants and `notify pgrst, 'reload schema';` when RPC
  signatures change.
- After adding a migration: add it to the list in README step 2, add a CHANGELOG entry, and tell the user to
  run it. Order matters: if the frontend calls a new RPC, the user must run the SQL **before** the push
  goes live (or the page errors until they do).
- Live DB has 0001–0014 applied (as of 2026-10-15). `0005_cron.sql` and `0010_push_cron.sql` need
  pg_cron / Vault and are skipped by the local test runner.

## Commands and checks

```bash
npm run dev          # dev server (uses .env.local → REAL Supabase if present!)
npm run build        # tsc -b + vite build — must pass
npm run lint         # oxlint; 3 pre-existing "only-export-components" warnings are expected
npm test             # vitest unit tests
```

SQL tests (local Postgres 17 via Homebrew; not running by default):
```bash
pg_ctl -D /opt/homebrew/var/postgresql@17 -l <scratch>/pg.log start -w
supabase/tests/run.sh            # creates bezkratomu_test DB, applies migrations, runs checks, refreshes fixture
pg_ctl -D /opt/homebrew/var/postgresql@17 stop
```
`expect_error` / `expect_eq` lines print `NOTICE: ok …`; a failure stops the script (ON_ERROR_STOP).
SQL functions that depend on "now" should take it as a parameter (like `private.gap_stats(p_user, p_now)`)
so tests can use fixed dates. If the fixture
`src/lib/__fixtures__/sql_user_days.json` changes, re-run `npm test`.

## Verify in a browser (demo mode, never touches real data)

`.env.local` holds real Supabase keys, so force demo mode by blanking the vars:
```bash
VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite --port 5199 --strictPort   # run in background
# stop: lsof -ti:5199 -sTCP:LISTEN | xargs kill
```
No `chromium-cli` and no system Chrome on this Mac. Install `playwright` in the session scratchpad
(not the repo) and launch with the already-downloaded Chromium (`npx playwright install` tends to stall):
`executablePath: ~/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`.
Flow: go to `#/prihlaseni` → it redirects to the safety intro `#/vitej`: check the checkbox, click
"Pokračovat" → go to `#/prihlaseni` again → fill "Přezdívka" = `Petr`, "PIN (6 číslic)" = `123456`,
click "Přihlásit se". Use viewport 390×844, test `colorScheme` dark and light, collect `pageerror`s,
and **look at the screenshots**. Demo friends: Petr (shares grams, uses teaspoons), Jana, Tomáš, Lucie,
Marek, Bára — all PIN `123456`.

## Supabase / deploy facts

- Deploy: `.github/workflows/deploy.yml` on push to `main` (runs tests, builds with repo *variables*
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`). Check with `gh run list --limit 3`.
- Auth: nickname + 6-digit PIN; the nickname is turned into a synthetic email (`src/lib/nickname.ts`),
  the PIN is the password. Email confirmation is off; sessions never expire.
- Push: Edge Function `push`, VAPID private key only in Supabase secrets. The Supabase CLI login on this
  Mac also sees an unrelated project — always pass `--project-ref yhusaoowjzmrdhbbgglw`. pg_cron calls the
  function; `private.claim_push_notifications()` (latest in `0011`) decides what to send.
- Never put the `service_role` key anywhere in the repo. The anon key is public by design.

## Open items / ideas

- Spec phase 9 (security review write-up, v2 ideas) was never finished.
- Help contacts in `src/config/helpContacts.ts` still need the user's verification.
- No PIN reset, account deletion UI or data export yet.
- A dose logged ahead of time counts toward today immediately (also for the evening "< half of limit"
  reminder). The user accepted this.
