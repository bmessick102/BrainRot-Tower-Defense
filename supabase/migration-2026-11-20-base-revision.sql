-- Migration (2026-11-20, sync safety). Safe to run more than once; it only (re)creates one function and one
-- trigger, and changes no data. Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- (Running the whole schema.sql again does the same thing.)
--
-- A village's `updated_at` is its revision. The game saves a village only on top of the revision it loaded
-- ("update ... where updated_at = <what this tab had>", SupabaseBackend.updateBase), so a stale tab or device
-- can no longer silently overwrite newer progress: its save matches no row and the game keeps its copy as a
-- backup instead.
--
-- Until this runs the game sends updated_at itself, which already makes the check work. This trigger makes
-- the server the only clock: it moves updated_at forward (never back, never by the player's clock) whenever
-- the save or checkpoint changes, and leaves it alone for other changes (a rename is not a new revision).
create or replace function public.stamp_base()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.save is distinct from old.save or new.checkpoint is distinct from old.checkpoint then
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

drop trigger if exists bases_stamp on public.bases;
create trigger bases_stamp before update on public.bases
  for each row execute function public.stamp_base();

revoke execute on function public.stamp_base() from public, anon, authenticated;
