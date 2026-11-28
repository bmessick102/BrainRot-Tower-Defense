-- v0.15.4: one device at a time per account (the newest login wins).
-- Run once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run), AFTER the v0.15.4
-- game is deployed. Safe to run again. Also in schema.sql.
--
-- Every login (and every page load with a saved login) calls claim_session with that browser's device id, which
-- becomes the account's active device. From then on the database refuses a village save (an update of bases) unless
-- it carries that same device id (bases.session_id, written with the save and cleared again by the trigger), so a
-- device the account has moved away from can't overwrite the save. The old device also asks session_active every
-- 15 seconds and shows "opened on another device" with a Reload button; reloading logs in again and takes the
-- account back.
--
-- Before this runs, the game finds claim_session missing and plays exactly as before (nothing is enforced).
-- Saves made in the SQL editor or by the service role (no signed-in player) are never refused.

alter table public.profiles add column if not exists active_session text;
alter table public.bases add column if not exists session_id text;

-- This device becomes the account's one device.
create or replace function public.claim_session(p_session text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not signed in.'; end if;
  if p_session is null or char_length(p_session) not between 8 and 64 then raise exception 'Bad device id.'; end if;
  update public.profiles set active_session = p_session where id = auth.uid();
end $$;

-- Is this still the account's device? (True while no device has claimed the account.)
create or replace function public.session_active(p_session text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.active_session is null or p.active_session = p_session
    from public.profiles p where p.id = auth.uid()), true);
$$;

-- A village save from any other device is refused (the game reads IBTD_SESSION_REPLACED and stops saving there).
create or replace function public.check_base_session()
returns trigger language plpgsql set search_path = '' as $$
declare
  active text;
begin
  if auth.uid() is not null then
    select p.active_session into active from public.profiles p where p.id = new.user_id;
    if active is not null and new.session_id is distinct from active then
      raise exception 'IBTD_SESSION_REPLACED: this account was opened on another device.' using errcode = 'P0001';
    end if;
  end if;
  new.session_id := null; -- the device id is only checked, never kept: every save has to bring its own
  return new;
end $$;

drop trigger if exists bases_session on public.bases;
create trigger bases_session before update on public.bases
  for each row execute function public.check_base_session();

revoke execute on function public.claim_session(text) from public, anon;
grant execute on function public.claim_session(text) to authenticated;
revoke execute on function public.session_active(text) from public, anon;
grant execute on function public.session_active(text) to authenticated;
revoke execute on function public.check_base_session() from public, anon, authenticated;

notify pgrst, 'reload schema';
