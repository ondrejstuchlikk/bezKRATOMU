-- Security and scoring checks. Run with supabase/tests/run.sh against a local Postgres.
-- Every "ok" NOTICE is an expected rejection; any ERROR or "FAIL" means a regression.
\set QUIET on
create function public.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL (no error): %', p_label;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok  % -> %', p_label, sqlerrm;
end $$;
grant execute on function public.expect_error(text, text) to anon, authenticated;
create function public.expect_eq(p_actual text, p_expected text, p_label text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL %: got %, expected %', p_label, p_actual, p_expected;
  end if;
  raise notice 'ok  %', p_label;
end $$;
grant execute on function public.expect_eq(text, text, text) to anon, authenticated;

-- Sign-ups (as Supabase Auth would do)
insert into auth.users (email, raw_user_meta_data) values ('petr-novak@kratom.local', '{"nickname":"Petr Novák"}') returning id as a \gset
insert into auth.users (email, raw_user_meta_data) values ('jana@kratom.local', '{"nickname":"Jana"}') returning id as b \gset
select public.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('x@kratom.local', '{"nickname":"Pepa"}')$$, 'slug mismatch rejected');
select public.expect_error($$insert into auth.users (email, raw_user_meta_data) values ('petr-novak2@kratom.local', '{"nickname":"Petr Novák"}')$$, 'nickname/slug mismatch 2');
select nickname, nickname_slug from profiles order by nickname;

-- ===== Scenario for user B (history, built directly as the server would) =====
insert into plans (id, user_id, baseline_g, target_g, start_date, duration_days, curve, preset)
  values ('00000000-0000-0000-0000-0000000000b1', :'b', 20.5, 1.5, private.prague_today() - 12, 10, 'decelerating', 'custom');
insert into pauses (plan_id, user_id, start_date, end_date)
  values ('00000000-0000-0000-0000-0000000000b1', :'b', private.prague_today() - 8, private.prague_today() - 7);
select private.rebuild_plan_days('00000000-0000-0000-0000-0000000000b1');
insert into doses (user_id, taken_at, grams, input_unit, input_amount)
select :'b', ((private.prague_today() + o) + time '12:00') at time zone 'Europe/Prague', g, 'g', g
from (values (-12, 10), (-12, 9.5), (-11, 17), (-8, 5.25), (-8, 5.25), (-8, 5.25), (-6, 30),
             (-5, 8.33), (-5, 2), (-4, 6), (-3, 4), (-3, 0.01), (-2, 3)) v(o, g);
insert into zero_days (user_id, date) values (:'b', private.prague_today() - 7);

\echo '--- B user_days before finalize'
select u.date - private.prague_today() as o, u.limit_g, u.total_g, u.status, u.points from private.user_days(:'b') u;
select private.finalize_all();
select private.finalize_all();  -- idempotent
\echo '--- after finalize: final rows / events'
select count(*) as final_rows from daily_results where user_id = :'b';
select type, event_date - private.prague_today() as day_offset, payload from feed_events order by id;
select count(*) as feed_events_with_grams from feed_events where payload::text ~ '_g"';
-- ===== Time between doses (fixed dates; same numbers as src/lib/gaps.test.ts) =====
-- 10-05 is not logged (breaks the gap across it), 10-07 and 10-09 are zero days.
insert into auth.users (email, raw_user_meta_data) values ('dana@kratom.local', '{"nickname":"Dana"}') returning id as d \gset
insert into doses (user_id, taken_at, grams, input_unit, input_amount)
select :'d', t::timestamp at time zone 'Europe/Prague', 1, 'g', 1
from unnest(array['2026-10-03 08:00', '2026-10-03 20:00', '2026-10-04 08:00', '2026-10-06 10:00',
                  '2026-10-08 10:00', '2026-10-08 16:30', '2026-10-10 09:00']) t;
insert into zero_days (user_id, date) values (:'d', '2026-10-07'), (:'d', '2026-10-09');
select public.expect_eq(format('%s/%s/%s/%s', g.record_gap_min, g.record_running, g.avg_gap_5d_min, g.avg_gap_all_min),
  expected, label)
from (values
  ('2026-10-12 12:00', '3060/t/2190/1700', 'gaps: running gap is the record'),
  ('2026-10-10 10:00', '2880/f/1900/1428', 'gaps: short running gap ignored in averages'),
  ('2026-10-14 12:00', '2880/f/2430/1428', 'gaps: unlogged days break the running gap'),
  ('2026-10-03 07:00', '/f//', 'gaps: before the first dose')
) v(at, expected, label)
cross join lateral private.gap_stats(:'d', at::timestamp at time zone 'Europe/Prague') g;
select public.expect_eq(
  (select last_dose_at from private.gap_stats(:'d', '2026-10-09 12:00'::timestamp at time zone 'Europe/Prague'))::text,
  ('2026-10-08 16:30'::timestamp at time zone 'Europe/Prague')::text, 'gaps: later doses ignored');

\o fixture.json
\pset format unaligned
\pset tuples_only on
select json_agg(json_build_object('offset', u.date - private.prague_today(), 'limit_g', u.limit_g, 'total_g', u.total_g,
  'is_paused', u.is_paused, 'status', u.status, 'points', u.points, 'streak_after', u.streak_after, 'missed_run', u.missed_run)
  order by u.date) from private.user_days(:'b') u;
\pset format aligned
\pset tuples_only off
\o

-- ===== As user A =====
select private.prague_today() as today \gset
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false) \g /dev/null
select create_plan(20, 0, 14, 'decelerating', 'fast') is not null as plan_created;
select string_agg(limit_g::text, ',' order by date) as a_limits from plan_days;
select public.expect_error($$select create_plan(20, 0, 10, 'linear', 'fast')$$, 'preset/duration mismatch');
select public.expect_error($$select create_plan(10, 10, 14, 'linear', 'fast')$$, 'baseline = target');
select public.expect_error($$select create_plan(2.3, 0, 14, 'linear', 'fast')$$, 'baseline not a half gram');
select public.expect_error($$select create_plan(2, 0.25, 14, 'linear', 'fast')$$, 'target not a half gram');
select public.expect_error($$select create_plan(0, 0, 14, 'linear', 'fast')$$, 'baseline 0');
\echo '--- half-gram plan 1.5 g → 0 in 5 days (expected 1.5,1.5,1.0,1.0,0.5,0.0)'
select create_plan(1.5, 0, 5, 'linear', 'express') is not null as half_plan_created;
select string_agg(limit_g::text, ',' order by date) as a_half_limits from plan_days;

insert into doses (taken_at, grams, input_unit, input_amount, feeling, note) values (now(), 2.5, 'tsp', 1, 4, 'ok');
insert into doses (taken_at, grams, input_unit, input_amount) values (now() - interval '1 day', 1, 'g', 1);
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values ((current_date - 8 + time '12:00') at time zone 'Europe/Prague', 1, 'g', 1)$$, 'dose 8 days back');
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now() + interval '1 day', 1, 'g', 1)$$, 'dose tomorrow');
insert into doses (taken_at, grams, input_unit, input_amount, note)
  values (((now() at time zone 'Europe/Prague')::date + time '23:59') at time zone 'Europe/Prague', 1, 'g', 1, 'later today');
delete from doses where note = 'later today';
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now(), 0, 'g', 0)$$, 'zero grams');
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now(), 500, 'g', 500)$$, 'too many grams');
select public.expect_error($$insert into doses (user_id, taken_at, grams, input_unit, input_amount) values ('$$ || :'b' || $$', now(), 1, 'g', 1)$$, 'insert dose for someone else');
select public.expect_error($$update doses set taken_at = now() - interval '9 days' where grams = 2.5$$, 'move dose out of window');
select public.expect_error($$insert into zero_days (date) values ('$$ || :'today' || $$')$$, 'zero day while doses exist');
select count(*) as visible_doses, count(distinct user_id) as owners from doses;
with u as (update doses set grams = 99 where user_id = :'b' returning 1) select count(*) as updated_other_users_doses from u;
with d as (delete from doses where user_id = :'b' returning 1) select count(*) as deleted_other_users_doses from d;
select count(*) as visible_other_plans from plans where user_id = :'b';
select count(*) as visible_other_results from daily_results;
select public.expect_error($$insert into daily_results select * from daily_results$$, 'write daily_results');
select public.expect_error($$update plan_days set limit_g = 100$$, 'write plan_days');
select public.expect_error($$insert into feed_events (user_id, type, event_date) values (auth.uid(), 'streak', current_date)$$, 'write feed');
select public.expect_error($$update profiles set nickname = 'Hacker' where id = auth.uid()$$, 'rename nickname');
select public.expect_error($$select private.finalize_all()$$, 'call private function');
select public.expect_error($$insert into reactions (target_user, date, emoji) values (auth.uid(), current_date, E'\U0001F525')$$, 'react to own day');
select public.expect_error($$insert into reactions (target_user, date, emoji) values ('$$ || :'b' || $$', current_date, 'X')$$, 'invalid emoji');
update profiles set share_grams = true where id = :'b';  -- must affect 0 rows
select share_grams as b_share_still_false from profiles where id = :'b';
insert into reactions (target_user, date, emoji) values (:'b', (:'today')::date - 1, E'\u2764\uFE0F');
insert into comments (target_user, date, body) values (:'b', (:'today')::date - 1, '  Drž se! 💪  ');
select body from comments;
\echo '--- A sees B days without grams'
select date - (:'today')::date as o, status, points, limit_g, total_g, plan_pct, actual_pct from get_user_days(:'b', (:'today')::date - 3, (:'today')::date);
\echo '--- leaderboard / summary'
select nickname, total_points, met_pct, current_streak, best_streak, reduction_limit_pct, reduction_avg_pct, today_status, current_limit_g from get_leaderboard();
\echo '--- time between doses: latest dose time only for yourself'
select nickname, last_dose_at is not null as sees_last_dose, record_gap_min is not null as sees_record from get_leaderboard() order by nickname;
select public.expect_eq((select (last_dose_at is null and record_gap_min > 0)::text from get_user_stats(:'d')), 'true', 'other user: record yes, last dose time no');
select public.expect_eq((select (last_dose_at is not null)::text from get_user_stats(auth.uid())), 'true', 'own last dose time');
select get_group_summary();
\echo '--- group today: % of limit for everyone, grams only for A'
select nickname, status, logged, pct_of_limit, total_g, limit_g from get_group_today() order by nickname;
\echo '--- push notifications'
select public.expect_error($$select save_push_subscription('https://evil.example.com/x', 'k', 'a')$$, 'push endpoint must be a push service');
select save_push_subscription('https://fcm.googleapis.com/fcm/send/dev1', 'p256dh-a', 'auth-a');
select public.expect_error($$update user_settings set last_reminder_on = current_date$$, 'write last_reminder_on');
update user_settings set reminder_hour = extract(hour from now() at time zone 'Europe/Prague'), notify_social = true;
select set_config('request.jwt.claim.sub', :'b', false) \g /dev/null
select save_push_subscription('https://web.push.apple.com/dev2', 'p256dh-b', 'auth-b');
update user_settings set reminder_hour = extract(hour from now() at time zone 'Europe/Prague'), notify_social = true;
select count(*) as b_sees_push_rows from push_subscriptions;
select set_config('request.jwt.claim.sub', :'a', false) \g /dev/null
select delete_push_subscription('https://web.push.apple.com/dev2');
select count(*) as a_sees_push_rows from push_subscriptions;
select public.expect_error($$select private.claim_push_notifications()$$, 'claim notifications as user');
reset role;
-- B logs 0.5 g today (limit 1.5 g → under half); C has a plan but logged nothing.
select set_config('request.jwt.claim.sub', :'b', false) \g /dev/null
insert into doses (taken_at, grams, input_unit, input_amount) values (now(), 0.5, 'g', 0.5);
insert into auth.users (email, raw_user_meta_data) values ('cyril@kratom.local', '{"nickname":"Cyril"}') returning id as c \gset
select set_config('request.jwt.claim.sub', :'c', false) \g /dev/null
insert into plans (user_id, baseline_g, target_g, start_date, duration_days, curve, preset)
  values (:'c', 6, 0, private.prague_today() - 1, 14, 'linear', 'fast') returning id as cp \gset
select private.rebuild_plan_days(:'cp');
select save_push_subscription('https://fcm.googleapis.com/fcm/send/dev3', 'p256dh-c', 'auth-c');
update user_settings set reminder_hour = extract(hour from now() at time zone 'Europe/Prague') where user_id = :'c';
select count(*) as push_rows_total from push_subscriptions;
\echo '--- due (expected: B partial reminder + reaction + comment, C plain reminder; A is over its limit so no reminder)'
select endpoint, body, url, tag from private.claim_push_notifications() order by tag, body;
select count(*) as due_again from private.claim_push_notifications();
select private.remove_push_subscriptions(array['https://web.push.apple.com/dev2']);
select count(*) as push_rows_after_remove from push_subscriptions;
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false) \g /dev/null
\echo '--- hand-made plan (expected 4.0,3.5,3.5,1.0,0.0 / flat 2.0,2.0)'
select public.expect_error($$select create_custom_plan(array[3, 3.5])$$, 'custom limits go up');
select public.expect_error($$select create_custom_plan(array[3, 2.2])$$, 'custom limit not a half gram');
select public.expect_error($$select create_custom_plan(array[3])$$, 'custom plan with one day');
select public.expect_error($$select create_custom_plan(array[3, null])$$, 'custom plan with empty day');
select public.expect_error($$select create_custom_plan(array[0, 0])$$, 'custom plan starting at 0');
select public.expect_error($$select create_custom_plan(array_fill(1::numeric, array[367]))$$, 'custom plan too long');
select create_custom_plan(array[2, 2]) is not null as flat_plan_created;
select string_agg(limit_g::text, ',' order by date) as a_flat_limits from plan_days;
select create_custom_plan(array[4, 3.5, 3.5, 1, 0]) is not null as custom_plan_created;
select string_agg(limit_g::text, ',' order by date) as a_custom_limits from plan_days;
select curve, preset, baseline_g, target_g, duration_days, custom_limits from plans where status = 'active';
select count(*) as a_plans_total from plans;
select public.expect_error($$select pause_plan(); select pause_plan()$$, 'double pause');
select pause_plan();
select is_paused, limit_g from plan_days order by date;
select resume_plan();
select count(*) as a_plan_days_after_resume from plan_days;

-- ===== As user B: comment moderation on own day =====
select set_config('request.jwt.claim.sub', :'b', false) \g /dev/null
with d as (delete from comments returning 1) select count(*) as b_deleted_comment_on_own_day from d;
select date - (:'today')::date as o, limit_g, total_g from get_user_days(:'a', (:'today')::date - 1, (:'today')::date);

-- ===== Editing final days (older than yesterday) recomputes the results =====
reset role;
create function public.final_differs_from_fresh(p_user uuid) returns bigint language sql as $$
  with f as (select date, status, points, streak_after, missed_run, total_g from public.daily_results where user_id = p_user),
       c as (select date, status, points, streak_after, missed_run, total_g from private.compute_days(
               p_user, (select min(date) from public.plan_days where user_id = p_user), private.prague_today() - 2, 0, 0))
  select (select count(*) from (table f except table c) x) + (select count(*) from (table c except table f) y)
$$;
create function public.b_events(p_user uuid) returns text language sql as $$
  select coalesce(string_agg(type || '@' || (event_date - private.prague_today()), ',' order by type), '')
  from public.feed_events where user_id = p_user and type <> 'plan_started'
$$;
set role authenticated;
select set_config('request.jwt.claim.sub', :'a', false) \g /dev/null
select public.expect_error($$insert into zero_days (date) values ('$$ || ((:'today')::date - 8) || $$')$$, 'zero day 8 days back');
select set_config('request.jwt.claim.sub', :'b', false) \g /dev/null
update doses set grams = 1, input_amount = 1 where local_date = (:'today')::date - 6;
reset role;
select public.expect_eq((select status || '/' || points from daily_results where user_id = :'b' and date = (:'today')::date - 6), 'met/14', 'edited final day is met now');
select public.expect_eq(public.final_differs_from_fresh(:'b')::text, '0', 'final rows recomputed after edit');
set role authenticated;
delete from zero_days where date = (:'today')::date - 7;
reset role;
select public.expect_eq(public.b_events(:'b'), 'half_baseline@-6', 'feed follows a removed zero day');
select public.expect_eq(public.final_differs_from_fresh(:'b')::text, '0', 'final rows recomputed after removing zero day');
set role authenticated;
insert into zero_days (date) values ((:'today')::date - 7);
reset role;
select public.expect_eq(public.b_events(:'b'), 'first_zero_day@-7,half_baseline@-7', 'feed restored with the zero day');
set role authenticated;
insert into doses (taken_at, grams, input_unit, input_amount)
  values (((:'today')::date - 7 + time '12:00') at time zone 'Europe/Prague', 1, 'g', 1);
reset role;
select public.expect_eq(public.b_events(:'b'), 'half_baseline@-7', 'dose 7 days back replaces the zero day');
select public.expect_eq(public.final_differs_from_fresh(:'b')::text, '0', 'final rows recomputed after adding a dose');
select public.expect_eq((select count(*)::text from daily_results where user_id = :'b'), '11', 'still 11 final days');
delete from auth.users where id = :'b';
select public.expect_eq((select count(*)::text from daily_results where user_id = :'b'), '0', 'deleting a user still works');
select set_config('request.jwt.claim.sub', :'a', false) \g /dev/null

-- ===== Anonymous =====
set role anon;
select is_nickname_available('Petr Novak') as petr_free, is_nickname_available('Někdo nový') as new_free;
select public.expect_error($$select get_leaderboard()$$, 'anon leaderboard');
select public.expect_error($$select get_group_today()$$, 'anon group today');
select public.expect_error($$select * from profiles$$, 'anon read profiles');
select public.expect_error($$select * from doses$$, 'anon read doses');
reset role;
