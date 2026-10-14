-- 0012_doses_later_today.sql
-- A dose can be logged at a later time today, not only up to now. The insert
-- and update policies already keep doses within yesterday and today, so the
-- trigger no longer rejects future times. Same as 0002 otherwise.

create or replace function private.doses_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := coalesce(auth.uid(), new.user_id);
    new.created_at := now();
  else
    new.user_id := old.user_id;
    new.created_at := old.created_at;
  end if;
  new.local_date := (new.taken_at at time zone 'Europe/Prague')::date;
  return new;
end
$$;
