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
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now() - interval '3 days', 1, 'g', 1)$$, 'dose older than yesterday');
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now() + interval '1 hour', 1, 'g', 1)$$, 'dose in future');
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now(), 0, 'g', 0)$$, 'zero grams');
select public.expect_error($$insert into doses (taken_at, grams, input_unit, input_amount) values (now(), 500, 'g', 500)$$, 'too many grams');
select public.expect_error($$insert into doses (user_id, taken_at, grams, input_unit, input_amount) values ('$$ || :'b' || $$', now(), 1, 'g', 1)$$, 'insert dose for someone else');
select public.expect_error($$update doses set taken_at = now() - interval '5 days' where grams = 2.5$$, 'move dose out of window');
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
select get_group_summary();
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

-- ===== Anonymous =====
set role anon;
select is_nickname_available('Petr Novak') as petr_free, is_nickname_available('Někdo nový') as new_free;
select public.expect_error($$select get_leaderboard()$$, 'anon leaderboard');
select public.expect_error($$select * from profiles$$, 'anon read profiles');
select public.expect_error($$select * from doses$$, 'anon read doses');
reset role;
