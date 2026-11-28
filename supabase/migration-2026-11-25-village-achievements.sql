-- Each village earns and claims its own set. Existing awards keep their village and claim date.
-- Rows from deleted villages remain archived with a null base_id. No lifetime totals are assigned to a village.
begin;

alter table public.achievements drop constraint if exists achievements_pkey;
create unique index if not exists achievements_per_village
  on public.achievements (user_id, base_id, achievement);

drop policy if exists "achievements: insert own" on public.achievements;
create policy "achievements: insert own" on public.achievements
  for insert to authenticated with check (
    user_id = auth.uid() and exists (select 1 from public.bases b where b.id = base_id and b.user_id = auth.uid())
  );
drop policy if exists "achievements: update own" on public.achievements;
create policy "achievements: update own" on public.achievements
  for update to authenticated
  using (user_id = auth.uid() and base_id is not null and claimed_at is null)
  with check (user_id = auth.uid() and base_id is not null and claimed_at is not null);

revoke update on public.achievements from authenticated;
grant select, insert on public.achievements to authenticated;
grant update (claimed_at) on public.achievements to authenticated;

-- Preserve independent village counters when two devices upload their account stats.
create or replace function public.merge_village_achievement_counters()
returns trigger language plpgsql set search_path = '' as $$
declare
  previous jsonb := '{}'::jsonb;
  incoming jsonb := coalesce(new.counters -> 'villages', '{}'::jsonb);
  merged jsonb;
begin
  if tg_op = 'UPDATE' then previous := coalesce(old.counters -> 'villages', '{}'::jsonb); end if;
  select coalesce(jsonb_object_agg(b.id::text, village.counters), '{}'::jsonb) into merged
  from public.bases b
  cross join lateral (
    select jsonb_object_agg(k.name, greatest(
      case when jsonb_typeof(v.before_value) = 'number' then (v.before_value #>> '{}')::numeric else 0 end,
      case when jsonb_typeof(v.input_value) = 'number' then (v.input_value #>> '{}')::numeric else 0 end
    )) as counters
    from unnest(array['kills','bomberKills','balloonKills','traps','rahMax','perfect','early','mined','stars']) k(name)
    cross join lateral (values (previous #> array[b.id::text, k.name], incoming #> array[b.id::text, k.name])) v(before_value, input_value)
    where jsonb_typeof(v.before_value) = 'number' or jsonb_typeof(v.input_value) = 'number'
  ) village
  where b.user_id = new.user_id and village.counters is not null;
  new.counters := jsonb_set(new.counters, '{villages}', merged);
  return new;
end $$;

drop trigger if exists merge_village_achievement_counters on public.player_stats;
create trigger merge_village_achievement_counters before insert or update of counters on public.player_stats
  for each row execute function public.merge_village_achievement_counters();

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
    'achievements', case when p.public_bases or uid = auth.uid() then
                       coalesce((select jsonb_agg(jsonb_build_object('id', a.achievement, 'base_id', a.base_id, 'earned_at', a.earned_at)
                                             order by a.earned_at, a.base_id, a.achievement)
                                 from public.achievements a join mine m on m.id = a.base_id
                                 where a.user_id = uid and m.save is not null), '[]'::jsonb)
                     else '[]'::jsonb end,
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

commit;
