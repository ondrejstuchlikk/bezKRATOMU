-- 0013_group_today.sql
-- Today's intake of every group member for the group page, as % of their own
-- limit. Exact grams only for yourself and people who share them, like the
-- other read RPCs.

create or replace function public.get_group_today()
returns table (
  user_id uuid, nickname text, status text, logged boolean, pct_of_limit numeric,
  total_g numeric, limit_g numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return query
    select p.id, p.nickname, u.status, u.logged,
           -- null when nothing is logged, or something was taken on a 0 g limit
           case when u.logged then
             case when u.limit_g > 0 then round(100.0 * u.total_g / u.limit_g)
                  when u.total_g = 0 then 0
             end
           end,
           case when p.id = auth.uid() or p.share_grams then u.total_g end,
           case when p.id = auth.uid() or p.share_grams then u.limit_g end
    from public.profiles p
    cross join lateral private.user_days(p.id) u
    where u.date = private.prague_today();
end
$$;

revoke all on function public.get_group_today() from public, anon;
grant execute on function public.get_group_today() to authenticated;

notify pgrst, 'reload schema';
