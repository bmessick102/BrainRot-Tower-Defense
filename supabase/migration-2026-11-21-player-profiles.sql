-- v0.7: see other players. Run once in the Supabase SQL editor (safe to re-run); schema.sql has the same.
--   search_players     - find players by name, league (a wave range), Village Hall, sorted by wave / hall / achievements
--   get_player_profile - a player's card: stats, rank, achievements, and their villages (best first) unless hidden
--   get_player_base    - one village's layout to look at (read only), unless its owner hides their villages
--   set_public_bases   - "Let others view my villages" (Settings); profiles.public_bases, on by default
-- Everything is read only for other players and needs a login. A village's save holds only the game (buildings,
-- gold, waves), nothing personal.

alter table public.profiles add column if not exists public_bases boolean not null default true;

create or replace function public.set_public_bases(on_ boolean)
returns void language sql security definer set search_path = '' as $$
  update public.profiles set public_bases = coalesce(on_, true) where id = auth.uid();
$$;

create or replace function public.search_players(q text default '', min_wave int default 0, max_wave int default null,
  hall int default null, sort text default 'wave', lim int default 30)
returns table (username text, best_wave int, best_town_hall int, achievements int, is_me boolean)
language sql security definer set search_path = '' stable as $$
  with found as (
    select p.username, coalesce(s.best_wave, 0) as best_wave, coalesce(s.best_town_hall, 0) as best_town_hall,
           (select count(*)::int from public.achievements a where a.user_id = p.id) as achievements,
           (p.id = auth.uid()) as is_me
    from public.profiles p
    left join public.player_stats s on s.user_id = p.id
    where auth.uid() is not null
      and (coalesce(q, '') = '' or p.username ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%')
  )
  select * from found
  where best_wave >= coalesce(min_wave, 0)
    and (max_wave is null or best_wave <= max_wave)
    and (hall is null or best_town_hall = hall)
  order by case sort when 'hall' then best_town_hall when 'achievements' then achievements else best_wave end desc,
           best_wave desc, username
  limit least(greatest(coalesce(lim, 30), 1), 50);
$$;

create or replace function public.get_player_profile(name text)
returns jsonb language plpgsql security definer set search_path = '' stable as $$
declare
  uid uuid;
  result jsonb;
begin
  if auth.uid() is null then return null; end if;
  select id into uid from public.profiles where lower(username) = lower(name);
  if uid is null then return null; end if;
  select jsonb_build_object(
    'username', p.username,
    'joined_at', p.created_at,
    'public_bases', p.public_bases,
    'is_me', uid = auth.uid(),
    'best_wave', coalesce(s.best_wave, 0),
    'best_town_hall', coalesce(s.best_town_hall, 0),
    'rank', (select count(*) + 1 from public.player_stats s2 where s2.best_wave > coalesce(s.best_wave, 0)),
    'achievements', coalesce((select jsonb_agg(jsonb_build_object('id', a.achievement, 'earned_at', a.earned_at) order by a.earned_at)
                              from public.achievements a where a.user_id = uid), '[]'::jsonb),
    'bases', case when p.public_bases or uid = auth.uid() then
               coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'town_hall', b.town_hall,
                                                            'best_wave', b.best_wave, 'wave', b.wave)
                                          order by b.best_wave desc, b.town_hall desc)
                         from public.bases b where b.user_id = uid and b.save is not null), '[]'::jsonb)
             else '[]'::jsonb end
  ) into result
  from public.profiles p
  left join public.player_stats s on s.user_id = p.id
  where p.id = uid;
  return result;
end $$;

create or replace function public.get_player_base(base uuid)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('id', b.id, 'name', b.name, 'username', p.username, 'town_hall', b.town_hall,
                            'best_wave', b.best_wave, 'save', b.save)
  from public.bases b
  join public.profiles p on p.id = b.user_id
  where auth.uid() is not null and b.id = base and b.save is not null
    and (p.public_bases or b.user_id = auth.uid());
$$;

revoke execute on function public.set_public_bases(boolean) from public, anon;
grant execute on function public.set_public_bases(boolean) to authenticated;
revoke execute on function public.search_players(text, int, int, int, text, int) from public, anon;
grant execute on function public.search_players(text, int, int, int, text, int) to authenticated;
revoke execute on function public.get_player_profile(text) from public, anon;
grant execute on function public.get_player_profile(text) to authenticated;
revoke execute on function public.get_player_base(uuid) from public, anon;
grant execute on function public.get_player_base(uuid) to authenticated;

-- Make the API see the new functions right away (otherwise: "Could not find the function ... in the schema cache").
notify pgrst, 'reload schema';
