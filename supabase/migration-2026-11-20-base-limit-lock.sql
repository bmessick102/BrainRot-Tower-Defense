-- Migration (2026-11-20, QA accounts pass). Safe to run more than once; it only replaces one function.
-- Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. (Running the whole schema.sql
-- again does the same thing.)
--
-- The 5-villages-per-player limit counted the player's villages and then inserted. Two tabs creating a village
-- at the same moment could both see 4 and end up with 6. Now each player's new villages go one at a time: a
-- lock held until the insert commits.
create or replace function public.limit_bases()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ibtd.bases.' || new.user_id::text));
  if (select count(*) from public.bases where user_id = new.user_id) >= 5 then
    raise exception 'base limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.limit_bases() from public, anon, authenticated;
