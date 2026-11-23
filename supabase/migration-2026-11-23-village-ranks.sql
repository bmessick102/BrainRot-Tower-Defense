-- Migration (2026-11-23, v0.8.5): every rank and number on a player's card matches the village leaderboard. Safe to
-- run more than once. Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run (after
-- migration-2026-11-23-leaderboard-fix.sql). schema.sql has the same.
--
-- * Village Hall levels saved while the database capped them at 11 (before the leaderboard fix) are read again from
--   each village's save (bases.town_hall) and each player's best (player_stats.best_town_hall). This runs with the
--   tables' triggers switched off for the moment, so it changes nothing else: no wave counting, and no new village
--   revision (a game that's open keeps saving normally).
-- * get_village_leaderboard also returns base_id (only for villages whose name it shows: the owner's public ones and
--   your own), so a click on a row opens the card on that village.
-- * get_player_profile, the player's card: `rank` is the rank of their best village on the village leaderboard (it was
--   a per-player rank, which could differ from the board), "Furthest wave" and "Village Hall" are their villages'
--   best (they were all-time numbers that could include a deleted village; with no villages left, the all-time ones),
--   and each village carries its own leaderboard rank, best first in leaderboard order.
-- * search_players (Find Players): the same numbers, from each player's villages.

-- ---- Village Hall levels capped at 11 (one time; triggers off so nothing else changes)
alter table public.bases disable trigger user;
update public.bases
  set town_hall = least(greatest(coalesce((save ->> 'townHallLevel')::int, 0), 0), 15)
  where save is not null and town_hall is distinct from least(greatest(coalesce((save ->> 'townHallLevel')::int, 0), 0), 15);
alter table public.bases enable trigger user;
alter table public.player_stats disable trigger user;
update public.player_stats s
  set best_town_hall = least(x.th, 15)
  from (select user_id, max(town_hall) as th from public.bases group by user_id) x
  where x.user_id = s.user_id and x.th > s.best_town_hall;
alter table public.player_stats enable trigger user;

-- ---- The leaderboard, with each row's village id (for the ones whose name it shows)
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

-- ---- Find Players: the same numbers as the card (each player's villages)
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

-- ---- A player's card, in village-leaderboard terms
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

revoke execute on function public.get_village_leaderboard(int, int) from public, anon;
grant execute on function public.get_village_leaderboard(int, int) to authenticated;
revoke execute on function public.search_players(text, int, int, int, text, int, int) from public, anon;
grant execute on function public.search_players(text, int, int, int, text, int, int) to authenticated;
revoke execute on function public.get_player_profile(text) from public, anon;
grant execute on function public.get_player_profile(text) to authenticated;

-- Make the API see the changed functions right away.
notify pgrst, 'reload schema';
