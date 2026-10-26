# Changelog

What changed in bezKRATOMU, newest first. **Migration** means a file from `supabase/migrations/` that
has to be run once in *Supabase → SQL Editor* (see README, step 2) for the change to work on the live site.

## 2026-10-26

- **Žebříček and Skupina are now one page: *Skupina*.** At the top there's a row of tabs:
  *Dnes* (what the Skupina page used to show — how the group is doing today, the group's longest time
  without a dose, and everyone's intake as % of their limit), then the rankings *Aktuální série*
  (opens by default), *Splněné dny (%)*, *Snížení (%)*, *Nejdelší bez dávky* and *Odstup dávek (5 dní)*.
  The *Aktivita* feed is at the bottom under every tab. The bottom menu now has four items:
  Dnes, Graf, Skupina, Nastavení. Old links to the Žebříček page open Skupina.
- **Points are gone from the app.** No more points on *Dnes*, in day lists, on the day detail, in
  the stats, in the *Body* ranking or in the *Body v čase* chart. On *Dnes*, the "Celkem … bodů" tile
  now shows your longest streak (*Nejdelší série*). Days are still marked as met/over, and streaks
  work as before. No migration needed.

## 2026-10-17

- **Doses can be changed for the last 7 days**, not only today and yesterday: add, edit or delete a
  dose, or mark a day as "nic jsem si nevzal(a)". On *Dnes*, the new *Starší dny* card shows the
  days before yesterday as date chips with their status; tap one to see and edit its doses. The dose
  form now has a day dropdown (Dnes, Včera, čt 15. 10., …) instead of the Dnes/Včera switch.
  Points still become final after 2 days. If you change an older day, its points, your streak and
  the automatic group feed posts (streaks, milestones) are recalculated from that day on.
- **Time between doses in the dose lists.** Between two doses you now see how long the gap was
  (e.g. "3 h 15 min"), and above the first dose of a day how long it was since the dose before it
  ("14 h 40 min od předchozí dávky"). Works for today, yesterday and the older days. Only you see it.
  Migration: `0015_edit_last_7_days.sql`.

## 2026-10-15

- **Time between doses.** The today card shows how long it has been since your last dose
  ("Od poslední dávky 5 h 12 min"), updating every minute. Only you see this.
- **New stats on Graf and on profiles**: longest time without a dose (it counts live while a break is
  still going), and the average time between doses over the last 5 days and over all time. Night is
  included. A break still going counts toward the average only once it is longer than your average,
  so a fresh dose never pulls it down. Days that weren't logged at all (not even "nic jsem si nevzal(a)")
  break the count, so forgetting to log doesn't create a fake record. Everyone in the group sees
  these numbers, but not the time of your last dose.
- **Leaderboard** has two new tables: *Nejdelší bez dávky* and *Odstup dávek (5 dní)*.
- **Group page** shows who holds the group's longest time without a dose.
  Migration: `0014_dose_gaps.sql`.

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
