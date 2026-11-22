-- Migration (2026-11-22, v0.8). Safe to run more than once. This one file has everything v0.8 needs on the server.
-- Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. (Running the whole schema.sql
-- again does the same thing.)
--
-- 1. Village Halls 12-15. The server capped a village's Village Hall level (bases.town_hall, check_base) and a player's
--    best Village Hall (player_stats.best_town_hall, keep_bests) at 11; now 15. Without it the game still saves
--    normally: a Village Hall 12-15 village just shows as 11 on the leaderboard and in player search.
--    (Bonus Slots are gone too, but the server never checked building counts, so villages that built past the new
--    caps with them save exactly as before: nothing to change for that.)
--
-- 2. The leaderboard lists villages, not players: every village of every player can be on it, ranked by that
--    village's best wave (earlier wins ties), with the player's name and the village's name.
--    * bases.best_wave_at: when a village's best wave last went up. Kept by check_base (the database), never by the game.
--    * get_village_leaderboard(lim): the top `lim` villages, plus the caller's own best village if it is lower.
--    It reads bases.best_wave, which check_base already caps at the waves the database counted for the village
--    (verified_cleared), so it is exactly as trustworthy as the old per-player leaderboard. A village's name is only
--    shown when its owner lets others view their villages (profiles.public_bases) or it is the caller's own.
--    Without this the game still works: it falls back to the old one-row-per-player get_leaderboard.
-- (This replaces migration-2026-11-22-leaderboard-villages.sql: run this one instead.)

alter table public.bases add column if not exists best_wave_at timestamptz; -- kept by check_base only
-- Villages that already have a best wave: counted as reached when last saved (runs once; before the trigger below).
update public.bases set best_wave_at = updated_at where best_wave > 0 and best_wave_at is null;
create index if not exists bases_board on public.bases (best_wave desc, best_wave_at asc);

create or replace function public.check_base()
returns trigger language plpgsql set search_path = '' as $$
declare
  th int;
  cleared int;
  credit int := 0;
  supported int;
begin
  th := least(greatest(coalesce((new.save ->> 'townHallLevel')::int, 0), 0), 15); -- Village Hall 15 is the top level (v0.8)
  cleared := greatest(coalesce((new.save ->> 'wavesCleared')::int, 0), 0);
  new.town_hall := th;
  if tg_op = 'INSERT' then
    -- A village that starts with history (imported from a browser) can't be checked: it starts counted for
    -- at most its Village Hall level, and the rest is counted at the usual pace as it is played and saved.
    new.verified_cleared := least(cleared, th);
    new.max_nights := 0;
    new.last_night_at := now();
    new.best_wave := least(greatest(new.best_wave, 0), new.verified_cleared);
    new.best_wave_at := case when new.best_wave > 0 then now() end;
    return new;
  end if;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.max_nights := old.max_nights;
  new.last_night_at := old.last_night_at;
  -- Fewer nights than counted (an older save came back): count from there.
  new.verified_cleared := least(old.verified_cleared, cleared);
  if cleared > new.verified_cleared then
    -- Nights not counted yet: at most one per 30 s since the last counted one, and 5 per save.
    credit := least(cleared - new.verified_cleared, 5,
      floor(extract(epoch from (now() - coalesce(old.last_night_at, old.created_at))) / 30)::int);
  end if;
  if credit > 0 then
    new.verified_cleared := new.verified_cleared + credit;
    new.last_night_at := now();
    if th >= 10 then new.max_nights := old.max_nights + credit; end if;
  end if;
  -- The furthest wave this village can have survived: every wave counted for it. It only goes up.
  supported := new.verified_cleared;
  new.best_wave := greatest(old.best_wave, least(greatest(new.best_wave, 0), supported));
  new.best_wave_at := case when new.best_wave > old.best_wave then now() else old.best_wave_at end;
  return new;
end $$;

create or replace function public.keep_bests()
returns trigger language plpgsql set search_path = '' as $$
declare
  cap_wave int;
  cap_hall int;
begin
  select coalesce(max(best_wave), 0), coalesce(max(town_hall), 0) into cap_wave, cap_hall
    from public.bases where user_id = new.user_id;
  new.best_wave := least(greatest(new.best_wave, 0), cap_wave);
  new.best_town_hall := least(greatest(new.best_town_hall, 0), cap_hall, 15); -- Village Hall 15 is the top level (v0.8)
  if tg_op = 'INSERT' then
    new.reached_at := case when new.best_wave > 0 then now() end;
  elsif new.best_wave > old.best_wave then
    new.reached_at := now();
  else
    new.best_wave := old.best_wave;
    new.reached_at := old.reached_at;
  end if;
  if tg_op = 'UPDATE' then new.best_town_hall := greatest(new.best_town_hall, old.best_town_hall); end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.get_village_leaderboard(lim int default 10)
returns table (rank bigint, username text, village_name text, best_wave int, town_hall int, is_me boolean)
language sql security definer set search_path = '' stable as $$
  with ranked as (
    select rank() over (order by b.best_wave desc, b.best_wave_at asc nulls last) as rank,
           row_number() over (partition by b.user_id order by b.best_wave desc, b.best_wave_at asc nulls last, b.id) as own_order,
           p.username,
           case when p.public_bases or b.user_id = auth.uid() then b.name end as village_name,
           b.best_wave, b.town_hall, (b.user_id = auth.uid()) as is_me
    from public.bases b
    join public.profiles p on p.id = b.user_id
    where b.best_wave > 0 and auth.uid() is not null
  )
  select rank, username, village_name, best_wave, town_hall, is_me
  from ranked
  where rank <= least(greatest(lim, 1), 100) or (is_me and own_order = 1)
  order by rank, username, village_name;
$$;

revoke execute on function public.get_village_leaderboard(int) from public, anon;
grant execute on function public.get_village_leaderboard(int) to authenticated;
revoke execute on function public.check_base() from public, anon, authenticated;
revoke execute on function public.keep_bests() from public, anon, authenticated;

notify pgrst, 'reload schema';
