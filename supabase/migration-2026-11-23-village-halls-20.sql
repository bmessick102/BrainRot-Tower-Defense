-- Migration (2026-11-23, updated for v0.15). Safe to run more than once.
-- Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- v0.11 adds Village Halls 16-20. The server capped a village's Village Hall level (bases.town_hall, check_base) and a
-- player's best Village Hall (player_stats.best_town_hall, keep_bests) at 15; now 20. Both functions are copied from
-- schema.sql as they are today, with only that cap changed. Without this migration the game still works and saves
-- normally: a Village Hall 16-20 village just shows as 15 on the leaderboard and in player search.
-- Re-running also restores Hall 16–20 from already saved villages without changing save revisions or wave credit.
begin;
create or replace function public.check_base()
returns trigger language plpgsql set search_path = '' as $$
declare
  th int;
  cleared int;
  credit int := 0;
  supported int;
begin
  th := least(greatest(coalesce((new.save ->> 'townHallLevel')::int, 0), 0), 20); -- Village Hall 20 is the top level (v0.11)
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

-- Update only the two derived Hall columns. Hold the table locks until both triggers are enabled again.
alter table public.bases disable trigger bases_check;
alter table public.player_stats disable trigger player_stats_bests;

update public.bases
set town_hall = (save ->> 'townHallLevel')::int
where save ->> 'townHallLevel' in ('16', '17', '18', '19', '20')
  and town_hall < case when save ->> 'townHallLevel' in ('16', '17', '18', '19', '20')
                       then (save ->> 'townHallLevel')::int end;

update public.player_stats s
set best_town_hall = h.level
from (select user_id, max(town_hall) as level from public.bases where town_hall between 16 and 20 group by user_id) h
where s.user_id = h.user_id and s.best_town_hall < h.level;

alter table public.player_stats enable trigger player_stats_bests;
alter table public.bases enable trigger bases_check;

create or replace function public.keep_bests()
returns trigger language plpgsql set search_path = '' as $$
declare
  cap_wave int;
  cap_hall int;
begin
  select coalesce(max(best_wave), 0), coalesce(max(town_hall), 0) into cap_wave, cap_hall
    from public.bases where user_id = new.user_id;
  new.best_wave := least(greatest(new.best_wave, 0), cap_wave);
  new.best_town_hall := least(greatest(new.best_town_hall, 0), cap_hall, 20); -- Village Hall 20 is the top level (v0.11)
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

commit;
