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
create or replace function public.limit_bases()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.bases where user_id = new.user_id) >= 5 then
    raise exception 'base limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists bases_limit on public.bases;
create trigger bases_limit before insert on public.bases
  for each row execute function public.limit_bases();

-- ---------------------------------------------------------------- stats: bests only go up
create or replace function public.keep_bests()
returns trigger language plpgsql set search_path = '' as $$
begin
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
