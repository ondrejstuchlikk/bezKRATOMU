# Changelog

What changed in bezKRATOMU, newest first. **Migration** means a file from `supabase/migrations/` that
has to be run once in *Supabase → SQL Editor* (see README, step 2) for the change to work on the live site.

## 2026-10-14

- **Group page shows how everyone is doing today.** "Jak se dnes daří" is now a list, one person per row,
  sorted from the lowest share of their daily limit to the highest. Everyone's percentage is visible;
  people who share exact grams (and you yourself) also get a smaller "grams / limit" line. Anyone who
  hasn't logged anything is at the bottom with "–". Going over the limit turns the number red (⚠️).
  The "Splněno" / "Nezapsáno" labels were removed; the status icons stay.
  Migration: `0013_group_today.sql`.
- **Doses can be logged at a later time today.** Pick any time today, including one that hasn't
  happened yet. Tomorrow is still not possible, and only today and yesterday can be edited.
  Migration: `0012_doses_later_today.sql`.

## 2026-10-13

- **Evening reminder also comes when less than half of today's limit is logged**, not only when
  nothing is logged. Migration: `0011_reminder_half_limit.sql`.
- **Web push notifications**: evening reminder and notifications for reactions and comments
  (Android Chrome; iPhone only when the app is added to the home screen). Migrations: `0009_push.sql`,
  `0010_push_cron.sql`, plus the one-time setup in README.
- **Hand-made plans**: set the limit of each day yourself (in the wizard or *Můj plán → Upravit
  limity po dnech*). Migration: `0008_custom_plans.sql`.
- **Leaderboard** sorts by current streak by default and shows the last 5 days as small squares.
- **Sharing grams is asked at registration**, and grams were removed from the group feed.
  Migration: `0007_feed_privacy.sql`.
- **Plans taper in half-gram steps**, and limits are also shown in teaspoons for people who set their
  spoon size. Migration: `0006_half_grams.sql`.

## 2026-10-12

- **First version**: nickname + PIN login, tapering plan wizard, dose logging, points and streaks,
  charts, leaderboard, group page and feed, reactions and comments, money saved, safety pages, PWA,
  demo mode. Migrations: `0001`–`0005`.
