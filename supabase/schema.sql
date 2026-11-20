-- Italian Brainrot Tower Defense: database for accounts, villages, achievements and the leaderboard.
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- It is safe to run again (it drops and recreates its own functions, triggers and policies).
--
-- Who can do what (Row Level Security):
--   profiles      every signed-in player can read usernames (for the leaderboard); made by a trigger at sign-up
--   bases         a player reads / writes / deletes only their own villages (max 5)
--   player_stats  a player reads / writes only their own; best wave and best Village Hall never go down
--   achievements  a player reads / records / claims only their own
--   get_leaderboard()  top players by furthest wave: username, best wave, best Village Hall (no emails)
--
-- Anti-cheat (the game runs in the player's browser, so the database checks what it's told):
--   a village's best wave can't be higher than the waves the database itself has counted for it
--   (verified_cleared), and it counts at most one wave per 30 seconds of real time and five per save (no real
--   wave is that fast). A player's leaderboard wave can't be higher than their villages back up. A village
--   imported with history starts counted for at most its Village Hall level.
--
-- Revisions: bases.updated_at is a village's revision, moved forward by the database only when its save
-- changes (stamp_base). The game saves only on top of the revision it loaded, so a stale tab or device can't
-- overwrite newer progress.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);
create unique index if not exists profiles_username_lower on public.profiles (lower(username));

create table if not exists public.bases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 20),
  save jsonb,
  checkpoint jsonb,
  town_hall int not null default 0,
  wave int not null default 0,
  best_wave int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bases_save_size check (pg_column_size(save) < 512000 and pg_column_size(checkpoint) < 512000)
);
create index if not exists bases_user on public.bases (user_id);
-- Kept by the database only (check_base), never by the game:
alter table public.bases add column if not exists verified_cleared int not null default 0; -- nights counted so far
alter table public.bases add column if not exists max_nights int not null default 0;       -- of those, at Village Hall 10
alter table public.bases add column if not exists last_night_at timestamptz;               -- when the last one was counted
-- Villages from before these columns existed start counted as they are (runs once: before the check trigger exists).
update public.bases set verified_cleared = greatest(coalesce((save ->> 'wavesCleared')::int, 0), 0), last_night_at = now()
  where last_night_at is null;

create table if not exists public.player_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  best_wave int not null default 0,
  best_town_hall int not null default 0,
  reached_at timestamptz,               -- when best_wave was reached (earlier wins ties)
  counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists player_stats_board on public.player_stats (best_wave desc, reached_at asc);

create table if not exists public.achievements (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  achievement text not null check (char_length(achievement) <= 40),
  base_id uuid references public.bases (id) on delete set null,
  earned_at timestamptz not null default now(),
  claimed_at timestamptz,
  primary key (user_id, achievement)
);

-- ---------------------------------------------------------------- sign-up: profile + stats row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  insert into public.player_stats (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is a username free? (asked before signing up, so the player gets a clear message)
create or replace function public.username_available(name text)
returns boolean language sql security definer set search_path = '' stable as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

-- ---------------------------------------------------------------- villages: at most 5 per player
-- One new village at a time per player (a lock until the insert commits), so two tabs creating villages at the
-- same moment can't both get past the count.
create or replace function public.limit_bases()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('ibtd.bases.' || new.user_id::text));
  if (select count(*) from public.bases where user_id = new.user_id) >= 5 then
    raise exception 'base limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists bases_limit on public.bases;
create trigger bases_limit before insert on public.bases
  for each row execute function public.limit_bases();

-- ---------------------------------------------------------------- villages: anti-cheat
-- Waves are numbered in the order they're fought (wave N = waves cleared + 1), so the furthest wave a village
-- can have survived is the number of waves the database has counted for it (verified_cleared). 30 s is the
-- fastest a wave can count, and at most 5 are counted per save. (Before waves were numbered this way the cap
-- was the Village Hall level, then one per night at Village Hall 10: that left the leaderboard far behind the
-- game's own count. max_nights is still kept, but no longer used.)
create or replace function public.check_base()
returns trigger language plpgsql set search_path = '' as $$
declare
  th int;
  cleared int;
  credit int := 0;
  supported int;
begin
  th := least(greatest(coalesce((new.save ->> 'townHallLevel')::int, 0), 0), 10);
  cleared := greatest(coalesce((new.save ->> 'wavesCleared')::int, 0), 0);
  new.town_hall := th;
  if tg_op = 'INSERT' then
    -- A village that starts with history (imported from a browser) can't be checked: it starts counted for
    -- at most its Village Hall level, and the rest is counted at the usual pace as it is played and saved.
    new.verified_cleared := least(cleared, th);
    new.max_nights := 0;
    new.last_night_at := now();
    new.best_wave := least(greatest(new.best_wave, 0), new.verified_cleared);
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
  return new;
end $$;

drop trigger if exists bases_check on public.bases;
create trigger bases_check before insert or update on public.bases
  for each row execute function public.check_base();

-- ---------------------------------------------------------------- villages: revisions
-- updated_at is a village's revision: the game saves only on top of the revision it loaded (SupabaseBackend.
-- updateBase), so a stale tab or device can't overwrite newer progress. The server alone moves it, forward,
-- whenever the save or checkpoint changes (a rename is not a new revision). Also in
-- migration-2026-11-20-base-revision.sql.
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

-- ---------------------------------------------------------------- stats: bests only go up
-- ... and never past what the player's villages back up (their best_wave / town_hall, checked above).
create or replace function public.keep_bests()
returns trigger language plpgsql set search_path = '' as $$
declare
  cap_wave int;
  cap_hall int;
begin
  select coalesce(max(best_wave), 0), coalesce(max(town_hall), 0) into cap_wave, cap_hall
    from public.bases where user_id = new.user_id;
  new.best_wave := least(greatest(new.best_wave, 0), cap_wave);
  new.best_town_hall := least(greatest(new.best_town_hall, 0), cap_hall, 10);
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

drop trigger if exists player_stats_bests on public.player_stats;
create trigger player_stats_bests before insert or update on public.player_stats
  for each row execute function public.keep_bests();

-- ---------------------------------------------------------------- leaderboard
-- Top `lim` players by furthest wave (earlier wins ties), plus the caller's own row wherever it is.
create or replace function public.get_leaderboard(lim int default 10)
returns table (rank bigint, username text, best_wave int, best_town_hall int, is_me boolean)
language sql security definer set search_path = '' stable as $$
  with ranked as (
    select rank() over (order by s.best_wave desc, s.reached_at asc nulls last) as rank,
           p.username, s.best_wave, s.best_town_hall, (s.user_id = auth.uid()) as is_me
    from public.player_stats s
    join public.profiles p on p.id = s.user_id
    where s.best_wave > 0
  )
  select * from ranked where rank <= least(greatest(lim, 1), 100) or is_me order by rank;
$$;

-- ---------------------------------------------------------------- row level security
alter table public.profiles enable row level security;
alter table public.bases enable row level security;
alter table public.player_stats enable row level security;
alter table public.achievements enable row level security;

drop policy if exists "profiles: signed-in players read" on public.profiles;
create policy "profiles: signed-in players read" on public.profiles
  for select to authenticated using (true);

drop policy if exists "bases: own" on public.bases;
create policy "bases: own" on public.bases
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "stats: read own" on public.player_stats;
create policy "stats: read own" on public.player_stats
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "stats: insert own" on public.player_stats;
create policy "stats: insert own" on public.player_stats
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "stats: update own" on public.player_stats;
create policy "stats: update own" on public.player_stats
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "achievements: read own" on public.achievements;
create policy "achievements: read own" on public.achievements
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "achievements: insert own" on public.achievements;
create policy "achievements: insert own" on public.achievements
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "achievements: update own" on public.achievements;
create policy "achievements: update own" on public.achievements
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------- access for the game (anon key)
grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.bases to authenticated;
grant select, insert, update on public.player_stats to authenticated;
grant select, insert, update on public.achievements to authenticated;

revoke execute on function public.get_leaderboard(int) from public, anon;
grant execute on function public.get_leaderboard(int) to authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.limit_bases() from public, anon, authenticated;
revoke execute on function public.check_base() from public, anon, authenticated;
revoke execute on function public.stamp_base() from public, anon, authenticated;
revoke execute on function public.keep_bests() from public, anon, authenticated;
