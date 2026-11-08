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
day, dose logging, server-side scoring/streaks, charts, group page with rankings, reactions/comments,
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
| `src/pages/*` | One file per screen. Tabs: Dnes (`TodayPage`), Graf, Skupina (`GroupPage`: *Dnes* tab + ranking tabs, formerly a separate Žebříček page), Nastavení |
| `src/components/DoseSheet.tsx` | Add/edit dose bottom sheet |
| `src/components/ui.tsx` | `Card`, `Button`, `Segmented`, `cx`, `inputClass`, `Loading`, `ErrorState`, … |
| `src/i18n/cs.ts` | **All** Czech UI strings. Never hard-code Czech text in components |
| `src/lib/time.ts` | Prague-time helpers (`pragueToday`, `pragueLocalToInstant`, `addDays`, …). Days are `Europe/Prague` calendar days |
| `src/lib/units.ts` | `formatGrams`, `formatNumber`, `formatPct`, teaspoon conversion, `MAX_DOSE_G` |
| `src/lib/plan.ts`, `scoring.ts`, `days.ts` | TS mirrors of the SQL plan/scoring logic (used by demo mode, unit-tested) |
| `src/lib/pk.ts` | Kratom-in-the-body estimate (closed-form sums of exponentials). Constants come from `docs/pk-model/ts_constants.json`, written by `docs/pk-model/model.py`; the full write-up is `docs/pk-model/kratom-pk-model.pdf` (LaTeX source next to it). Change the model there first, then copy the constants, then rerun `pk.test.ts` |
| `src/components/LevelCard.tsx` | The *V těle teď* card on Dnes: big number = `kratomEffectGrams` (combined level ÷ peak of 1 g, user's choice 2026-11-07), small line = mg mitragynine + 7-OH; range picker in `LevelRangePicker.tsx` (12/24/48 h + *Více*: 3/5/7 days); "when will it drop" projection via `pkTimesBelow`; its chart is `LevelChart.tsx`, lazy-loaded so Recharts stays out of the first page load |
| `supabase/migrations/0016_level_notifications.sql` | SQL copy of the combined line (`private.pk_level`, same constants as `pk.ts`) + morning recap / milestone pushes (`private.claim_level_notifications(p_now)`). Changing the model constants means changing both; `pk.test.ts` and the SQL checks pin the same numbers |
| `src/lib/substances.ts`, `src/hooks/substance.ts` | Substances other than kratom (caffeine so far): the `Substance` type, which ones a user tracks, and the per-device "which substance do the tabs show" context (`useSubstance`). Switcher pill: `SubstanceSwitcher.tsx`; one-time announcement: `SubstancesIntro.tsx` (`SUBSTANCES_INTRO_VERSION`) |
| `src/pages/TodayRoute.tsx`, `IntakeTodayPage.tsx`, `IntakeChartsPage.tsx`, `components/IntakeSheet.tsx`, `PresetForm.tsx` | Caffeine UI. Dnes/Graf/Skupina/Nastavení branch on `useSubstance()`; kratom pages are unchanged |
| `src/pages/NicotineTodayPage.tsx`, `NicotineChartsPage.tsx`, `components/NicotineSheet.tsx`, `src/lib/nicotine.ts` | Nicotine UI (one-tap +1 with undo; edit sheet can't change an entry's form — no column grant on `substance`), counts per form and money spent |
| `src/lib/intakeStats.ts` | Caffeine stats (daily totals, averages, gaps via `computeGapStats` with every day counted as logged), computed in the browser from the user's own `public.intakes` |
| `src/lib/gaps.ts` | TS mirror of `private.gap_stats` (time between doses); `gaps.test.ts` pins the same numbers as the SQL checks |
| `src/lib/parity.test.ts` | Checks TS scoring == SQL scoring using `src/lib/__fixtures__/sql_user_days.json` (written by the SQL test run) |
| `supabase/migrations/NNNN_*.sql` | Database schema/functions, applied in order |
| `supabase/tests/rls_and_scoring.sql` | Security + scoring checks; `run.sh` runs them on local Postgres |
| `supabase/functions/push/index.ts` | Edge Function that only encrypts/sends web push; the DB decides what is due |
| `src/config/push.ts` | VAPID public key. `src/config/helpContacts.ts`: help lines (user must verify) |

## Rules that must not break

- **Security lives in the database.** RLS on every table. Users write only their own doses, only for
  today and the 7 days before (Prague) — enforced by RLS policies in `0015_edit_last_7_days.sql`
  (`EDIT_WINDOW_DAYS` in `src/lib/days.ts` for the UI/demo). Scores are computed only on
  the server (`private.compute_days` / `user_days`); clients can't write them.
- **Privacy of grams.** Other users' doses are never readable directly. Other users' data comes from
  `security definer` RPCs (`get_user_days`, `get_user_stats`, `get_leaderboard`, `get_group_summary`,
  `get_group_today`) which return grams only when `p.id = auth.uid() or p.share_grams`.
  Time-between-doses stats (record, averages) are visible to everyone; `last_dose_at` only to the owner.
  A running record still reveals roughly when someone last dosed — the user accepted that. Percentages
  (% of baseline, % of today's limit) are visible to everyone. The feed and lock-screen push texts never
  contain grams. Any new RPC must follow the same pattern and be granted to `authenticated` only.
  The *V těle teď* estimate (`src/lib/pk.ts`) reveals when someone dosed, so it is only ever computed from
  the user's **own** doses and shown to them: in the browser, and (since 0016, user's decision 2026-11-07)
  in SQL `private.pk_level` for that user's own push notifications. Never compute or show it for other users,
  and never expose it through an RPC. The same applies to the caffeine estimate (`src/lib/caffeinePk.ts`).
- **Logic exists twice (SQL + TS).** Changing plan or scoring rules means changing the SQL *and*
  `src/lib/*.ts`, then running both test suites. The demo backend must mirror the real backend's rules and
  privacy filtering.
- **Doses may be at a later time today** (since 0012); RLS still blocks tomorrow and anything older
  than 7 days.
- **Days still finalize 2 days later** (pg_cron → `daily_results` + feed events). Editing a dose or
  zero day of an already final day fires a trigger → `private.refinalize_from(user, date)` deletes that
  user's `daily_results` and automatic feed events from that date on and re-runs `finalize_user`
  (since 0015). If you change `finalize_user`, keep that working (SQL tests cover it).

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
- Live DB has 0001–0019 applied (as of 2026-11-08). In the SQL Editor, 0017 shows one `NULL` row per account
  (the seeding `select`); that is success, not an error.
- Supabase grants everything on new `public` tables to `anon`/`authenticated` by default: every new table
  needs `revoke all … from anon, authenticated` and explicit column grants (see 0002, 0017).
- Don't overwrite `user_id` with `auth.uid()` in triggers of tables the server also writes for other users
  (seeding, tests run with a JWT claim set); rely on the missing column grant + `default auth.uid()` + RLS.
- Postgres `exp()` raises an error on underflow (JS returns 0): clamp exponents, e.g. `exp(greatest(x, -700))`. `0005_cron.sql` and `0010_push_cron.sql` need
  pg_cron / Vault and are skipped by the local test runner.

## Commands and checks

```bash
npm run dev          # dev server (uses .env.local → REAL Supabase if present!)
npm run build        # tsc -b + vite build — must pass
npm run lint         # oxlint; 7 pre-existing "only-export-components" warnings (SessionProvider, layout, ui) are expected
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

## The pharmacokinetic model (docs/pk-model)

- User decisions (2026-11-06): leaf powder only, 1.6 % mitragynine / 0.001 % 7-OH; one combined line
  (potency-weighted MG + 7-OH); relative % with 100 % = steady-state daily *mean* at `baselineG`; also mg
  "not yet eliminated" (dose-equivalent, assumes full absorption) for MG and 7-OH separately; average 70 kg
  adult; own data only, shown on Dnes below today's doses; no plan → mg + chart without %.
- Rebuild the report: `python3 -I docs/pk-model/model.py`, then run `pdflatex` 3–4 times in `docs/pk-model`
  (it is a TeX Live install at `/Library/TeX/texbin`) and delete the `.aux/.log/.toc/.out` files.
  To look at the pages, render them with `pypdfium2` (installed for `python3`); there is no `pdftoppm`.
- Keep the wording honest: an estimate, not a measurement, and never a cue for when to dose.
- PMC (`pmc.ncbi.nlm.nih.gov`) sometimes shows a bot check to WebFetch; NCBI E-utilities
  (`eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=…`) still return abstracts.

## Other substances (caffeine and nicotine done; caffeine body model next)

- User decisions (2026-11-08): switcher pill at the top switches the whole app; kratom always tracked, others
  opt-in in Nastavení; a one-time window per account announces new substances (bump
  `SUBSTANCES_INTRO_VERSION` + the `substances_intro_seen` check when nicotine arrives so it is offered too);
  Skupina shows "zatím jen pro kratom". No sharing yet, but design for it: own data only via RLS now, later
  security-definer RPCs with a per-substance share setting, same privacy rules as kratom.
- Caffeine: tracking only (no plan/limit), mg with user-editable presets (defaults Velký energeťák 150 mg, Malý
  energeťák 75 mg) + custom mg, no feeling/note, no reminders. Body-level (PK) model for caffeine is planned
  later, after a proper literature review — don't add a placeholder model.
- Nicotine (done 2026-11-08, `0018`): one *Nikotin* entry in the switcher with two forms, cigarettes and snus ("sibiř");
  users pick which form(s) they track (both possible). One-tap "+1" with time = now (editable after, same 7-day
  window). Stats: count per day + chart, time between (both forms together, plus counts per form), money spent
  (price per pack + pieces per pack; defaults cigarettes 160 Kč / 20, sibiř 130 Kč / 20). No note/feeling.
  Planned order: caffeine (done) → nicotine (done) → caffeine body model.
- Caffeine body model: report `docs/caffeine-pk-model/caffeine-pk-model.pdf` (LaTeX source, `model.py`,
  `ts_constants.json`, `numbers.tex`/`tables.tex` generated). Option A: one compartment, ka 4.42/h, t1/2 5.20 h
  (median of 25 control groups), V 0.669 L/kg, sleep reference 0.52 mg/kg. In the app: `src/lib/caffeinePk.ts`
  (constants copied from `ts_constants.json`; `caffeinePk.test.ts` imports the JSON and pins its check values),
  `CaffeineLevelCard.tsx` + lazy `CaffeineChart.tsx`, weight/bedtime settings (`0019`). Own data only, like kratom. Rebuild like the kratom
  report: `python3 -I docs/caffeine-pk-model/model.py`, then `pdflatex` ×3 in that folder, delete aux files.
  PubMed via E-utilities works with `curl` (Python urllib HTTPS fails here); PK-DB (pk-db.com) timed out.
- Caffeine body model decisions (2026-11-08): big number = mg of
  caffeine still in the body, plus "≈ X šálků kávy"; one population-average half-life (no smoking/pill/pregnancy
  adjustment); caffeine only (no paraxanthine line); sleep: projection at the user's bedtime plus a soft reference
  level from the literature, labelled as such; body weight default 70 kg, editable in Nastavení. Report in English,
  LaTeX → PDF in `docs/caffeine-pk-model/` with `model.py`, peer-reviewed sources only.
- Types: `Substance` = what the switcher shows (`kratom | caffeine | nicotine`); `IntakeSubstance` = the value in
  `public.intakes.substance` (`caffeine | cigarette | snus`). `listMyIntakes` takes a list of kinds.

## Open items / ideas

- **Points are hidden in the UI** (since 2026-10-26, user's decision). SQL/TS still compute `points` /
  `totalPoints` and the types still carry them (scoring parity tests use them) — just don't display them.
  Removing them from the DB entirely was deliberately not done.
- Spec phase 9 (security review write-up, v2 ideas) was never finished.
- Help contacts in `src/config/helpContacts.ts` still need the user's verification.
- No PIN reset, account deletion UI or data export yet.
- A dose logged ahead of time counts toward today immediately (also for the evening "< half of limit"
  reminder). The user accepted this.
