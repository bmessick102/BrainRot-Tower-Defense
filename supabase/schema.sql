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
--   get_village_leaderboard()  top villages by best wave: player, village name, best wave, Village Hall (no emails)
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
-- "Let others view my villages" (v0.7, Settings). Added here, before the functions that read it (a fresh database
-- failed on get_village_leaderboard otherwise).
alter table public.profiles add column if not exists public_bases boolean not null default true;

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
alter table public.bases add column if not exists best_wave_at timestamptz;                -- when best_wave last went up (earlier wins leaderboard ties)
-- Villages from before these columns existed start counted as they are (runs once: before the check trigger exists).
update public.bases set verified_cleared = greatest(coalesce((save ->> 'wavesCleared')::int, 0), 0), last_night_at = now()
  where last_night_at is null;
update public.bases set best_wave_at = updated_at where best_wave > 0 and best_wave_at is null;
create index if not exists bases_board on public.bases (best_wave desc, best_wave_at asc);

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
  select coalesce(name ~ '^[A-Za-z0-9_]{3,16}$', false)
     and not exists (select 1 from public.profiles where lower(username) = lower(name));
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

-- One row per village (v0.8): villages by best wave (bases.best_wave is capped by check_base, so it is verified; earlier
-- best_wave_at wins ties). Paged (v0.8.3): `pos` is each village's place in that order (1, 2, 3...; `rank` is the
-- shown rank, shared by ties); it returns the villages at pos off + 1 .. off + lim (lim at most 100, off at most
-- 10,000), plus the caller's own best village wherever it is. A village's name is shown only if its owner lets others
-- view their villages. 40 calls a minute per player (rate_limit_hit). The old one-argument version is dropped (an
-- older game still works: `off` defaults to 0).
drop function if exists public.get_village_leaderboard(int);
drop function if exists public.get_village_leaderboard(int, int);
create or replace function public.get_village_leaderboard(lim int default 10, off int default 0)
returns table (rank bigint, pos bigint, username text, village_name text, best_wave int, town_hall int, is_me boolean, base_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  l int := least(greatest(coalesce(lim, 10), 1), 100);
  o int := least(greatest(coalesce(off, 0), 0), 10000);
begin
  if auth.uid() is null then return; end if;
  perform public.rate_limit_hit('leaderboard', 40, 60);
  return query
  with ranked as (
    select rank() over (order by b.best_wave desc, b.best_wave_at asc nulls last) as rank,
           row_number() over (order by b.best_wave desc, b.best_wave_at asc nulls last, b.id) as pos,
           row_number() over (partition by b.user_id order by b.best_wave desc, b.best_wave_at asc nulls last, b.id) as own_order,
           p.username,
           (p.public_bases or b.user_id = auth.uid()) as shown,
           b.name, b.id, b.best_wave, b.town_hall, (b.user_id = auth.uid()) as is_me
    from public.bases b
    join public.profiles p on p.id = b.user_id
    where b.best_wave > 0
  )
  select r.rank, r.pos, r.username, case when r.shown then r.name end, r.best_wave, r.town_hall, r.is_me,
         case when r.shown then r.id end
  from ranked r
  where (r.pos > o and r.pos <= o + l) or (r.is_me and r.own_order = 1)
  order by r.pos;
end $$;

-- ---------------------------------------------------------------- other players (v0.7)
-- Search, player cards and visiting villages (read only); see migration-2026-11-21-player-profiles.sql.
create or replace function public.set_public_bases(on_ boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set public_bases = coalesce(on_, true) where id = auth.uid();
$$;

-- Spam guard (v0.8.3, migration-2026-11-22-spam-guard.sql): a per-player call counter for the player functions below.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  calls int not null default 0,
  primary key (user_id, action)
);
alter table public.rate_limits enable row level security; -- no policies: only the security definer functions below
revoke all on public.rate_limits from public, anon, authenticated;

create or replace function public.rate_limit_hit(act text, max_calls int, per_secs int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if auth.uid() is null then return; end if;
  insert into public.rate_limits as r (user_id, action, window_start, calls) values (auth.uid(), act, now(), 1)
  on conflict (user_id, action) do update set
    calls = case when r.window_start < now() - make_interval(secs => per_secs) then 1 else r.calls + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => per_secs) then now() else r.window_start end
  returning r.calls into n;
  if n > max_calls then
    raise exception 'Too many requests. Wait a moment and try again.' using errcode = 'P0001';
  end if;
end $$;

-- Paged (v0.8.3): `lim` rows (at most 50) after skipping `off` (at most 10,000); the game asks for a page plus one row
-- to know if there's a next page. The old six-argument version is dropped (an older game still works: `off` defaults to 0).
drop function if exists public.search_players(text, int, int, int, text, int);
create or replace function public.search_players(q text default '', min_wave int default 0, max_wave int default null,
  hall int default null, sort text default 'wave', lim int default 30, off int default 0)
returns table (username text, best_wave int, best_town_hall int, achievements int, is_me boolean)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  qq text := left(coalesce(q, ''), 16);
begin
  if auth.uid() is null then return; end if;
  perform public.rate_limit_hit('search', 20, 60);
  return query
  with found as (
    -- A player's numbers come from their villages (as on their card and the leaderboard); the all-time stats only
    -- for a player with no villages left (v0.8.5).
    select p.username, coalesce(v.best_wave, s.best_wave, 0) as best_wave, coalesce(v.best_town_hall, s.best_town_hall, 0) as best_town_hall,
           (select count(*)::int from public.achievements a where a.user_id = p.id) as achievements,
           (p.id = auth.uid()) as is_me
    from public.profiles p
    left join public.player_stats s on s.user_id = p.id
    left join lateral (select max(b.best_wave) as best_wave, max(b.town_hall) as best_town_hall
                       from public.bases b where b.user_id = p.id) v on true
    where qq = '' or p.username ilike '%' || replace(replace(replace(qq, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select f.username, f.best_wave, f.best_town_hall, f.achievements, f.is_me from found f
  where f.best_wave >= coalesce(min_wave, 0)
    and (max_wave is null or f.best_wave <= max_wave)
    and (hall is null or f.best_town_hall = hall)
  order by case sort when 'hall' then f.best_town_hall when 'achievements' then f.achievements else f.best_wave end desc,
           f.best_wave desc, f.username
  limit least(greatest(coalesce(lim, 30), 1), 50)
  offset least(greatest(coalesce(off, 0), 0), 10000);
end $$;

create or replace function public.get_player_profile(name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  result jsonb;
begin
  if auth.uid() is null then return null; end if;
  perform public.rate_limit_hit('profile', 40, 60);
  if name is null or char_length(name) > 16 then return null; end if;
  select id into uid from public.profiles where lower(username) = lower(name);
  if uid is null then return null; end if;
  with board as (
    -- Every village's leaderboard rank (the same order as get_village_leaderboard).
    select b.id, b.user_id, rank() over (order by b.best_wave desc, b.best_wave_at asc nulls last) as rank
    from public.bases b where b.best_wave > 0
  ), mine as (
    select b.*, bd.rank from public.bases b left join board bd on bd.id = b.id where b.user_id = uid
  )
  select jsonb_build_object(
    'username', p.username,
    'joined_at', p.created_at,
    'public_bases', p.public_bases,
    'is_me', uid = auth.uid(),
    'best_wave', coalesce((select max(m.best_wave) from mine m), s.best_wave, 0),
    'best_town_hall', coalesce((select max(m.town_hall) from mine m), s.best_town_hall, 0),
    'rank', (select min(m.rank) from mine m),
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('id', a.achievement, 'earned_at', a.earned_at) order by a.earned_at)
                              from public.achievements a where a.user_id = uid), '[]'::jsonb),
    'bases', case when p.public_bases or uid = auth.uid() then
               coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'town_hall', m.town_hall,
                                                            'best_wave', m.best_wave, 'wave', m.wave, 'rank', m.rank)
                                          order by m.best_wave desc, m.best_wave_at asc nulls last, m.id)
                         from mine m where m.save is not null), '[]'::jsonb)
             else '[]'::jsonb end
  ) into result
  from public.profiles p
  left join public.player_stats s on s.user_id = p.id
  where p.id = uid;
  return result;
end $$;

create or replace function public.get_player_base(base uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null then return null; end if;
  perform public.rate_limit_hit('village', 40, 60);
  select jsonb_build_object('id', b.id, 'name', b.name, 'username', p.username, 'town_hall', b.town_hall,
                            'best_wave', b.best_wave, 'save', b.save)
  into result
  from public.bases b
  join public.profiles p on p.id = b.user_id
  where b.id = base and b.save is not null
    and (p.public_bases or b.user_id = auth.uid());
  return result;
end $$;

revoke execute on function public.set_public_bases(boolean) from public, anon;
grant execute on function public.set_public_bases(boolean) to authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.search_players(text, int, int, int, text, int, int) from public, anon;
grant execute on function public.search_players(text, int, int, int, text, int, int) to authenticated;
revoke execute on function public.get_player_profile(text) from public, anon;
grant execute on function public.get_player_profile(text) to authenticated;
revoke execute on function public.get_player_base(uuid) from public, anon;
grant execute on function public.get_player_base(uuid) to authenticated;

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
revoke execute on function public.get_village_leaderboard(int, int) from public, anon;
grant execute on function public.get_village_leaderboard(int, int) to authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.limit_bases() from public, anon, authenticated;
revoke execute on function public.check_base() from public, anon, authenticated;
revoke execute on function public.stamp_base() from public, anon, authenticated;
revoke execute on function public.keep_bests() from public, anon, authenticated;

-- Make the API see new or changed functions right away.
notify pgrst, 'reload schema';
