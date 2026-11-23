-- Migration (2026-11-22, v0.8.3): spam guard for player search, player cards and visiting, and paging for player
-- search and the leaderboard. Safe to run more than once (if you ran an earlier copy of this file, run it again).
-- Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. (schema.sql has the same.)
--
-- * rate_limits + rate_limit_hit(act, max_calls, per_secs): a per-player counter per action. Past `max_calls` calls
--   in `per_secs` seconds the call fails with "Too many requests" (the game shows "Too many tries. Wait a minute and
--   try again.") until the window has passed. Only these server functions touch the table (row level security on,
--   no policies, no grants).
-- * search_players: 20 searches a minute per player; the name searched is cut to 16 characters (the longest
--   username) before it's used, whatever a caller sends.
-- * get_player_profile: 40 cards a minute; a name longer than 16 characters finds nobody.
-- * get_player_base: 40 village visits a minute.
-- * username_available (asked before signing up, no login needed): a name that isn't 3-16 letters, numbers or _ is
--   never available, so it only ever looks up real usernames.
-- * Paging: search_players takes `off` (rows to skip) and get_village_leaderboard(lim, off) returns one page of
--   villages (with each one's place, `pos`) plus your own best village; 40 leaderboard pages a minute per player.
--   An older game keeps working (both default `off` to 0); the new game falls back to the old calls until this runs.
-- These were `stable` (read only); the three player functions are volatile now because they count the call. The game
-- calls them the same way (supabase-js rpc posts them).

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

create or replace function public.username_available(name text)
returns boolean language sql security definer set search_path = '' stable as $$
  select coalesce(name ~ '^[A-Za-z0-9_]{3,16}$', false)
     and not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.search_players(text, int, int, int, text, int, int) from public, anon;
grant execute on function public.search_players(text, int, int, int, text, int, int) to authenticated;
revoke execute on function public.get_player_profile(text) from public, anon;
grant execute on function public.get_player_profile(text) to authenticated;
revoke execute on function public.get_player_base(uuid) from public, anon;
grant execute on function public.get_player_base(uuid) to authenticated;
revoke execute on function public.get_village_leaderboard(int, int) from public, anon;
grant execute on function public.get_village_leaderboard(int, int) to authenticated;
revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Make the API see the changed functions right away.
notify pgrst, 'reload schema';
