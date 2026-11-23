-- Migration (2026-11-23, v0.8.3): fixes "column b.best_wave_at does not exist" on the leaderboard. Safe to run more than
-- once. Run it in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run. (schema.sql has the same.)
--
-- Why: the paged leaderboard (migration-2026-11-22-spam-guard.sql) reads bases.best_wave_at, which
-- migration-2026-11-22-v0.8.sql adds. A database that skipped that one got a leaderboard that fails. This file has
-- everything from the v0.8 migration plus the paged leaderboard, so it works whichever of the two ran before:
--   * bases.best_wave_at (when a village's best wave last went up; earlier wins leaderboard ties), filled in once for
--     villages that already have a best wave, and its index. Also the other columns check_base keeps, in case they're
--     missing too (each is only added if it isn't there).
--   * check_base / keep_bests: Village Hall levels up to 15 (were capped at 11), and best_wave_at kept up to date.
--   * get_village_leaderboard(lim, off): the paged, one-row-per-village leaderboard (as in the spam-guard migration;
--     needs rate_limit_hit from it, which this file also makes sure exists).
-- Don't run migration-2026-11-22-v0.8.sql after this (it's covered here); if you do, it now leaves this leaderboard alone.

alter table public.bases add column if not exists verified_cleared int not null default 0;
alter table public.bases add column if not exists max_nights int not null default 0;
alter table public.bases add column if not exists last_night_at timestamptz;
alter table public.bases add column if not exists best_wave_at timestamptz;
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

drop trigger if exists bases_check on public.bases;
create trigger bases_check before insert or update on public.bases
  for each row execute function public.check_base();

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

drop trigger if exists player_stats_bests on public.player_stats;
create trigger player_stats_bests before insert or update on public.player_stats
  for each row execute function public.keep_bests();

-- The call counter the paged leaderboard uses (from migration-2026-11-22-spam-guard.sql; the same definition).
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  window_start timestamptz not null default now(),
  calls int not null default 0,
  primary key (user_id, action)
);
alter table public.rate_limits enable row level security;
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

revoke execute on function public.check_base() from public, anon, authenticated;
revoke execute on function public.keep_bests() from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
revoke execute on function public.get_village_leaderboard(int, int) from public, anon;
grant execute on function public.get_village_leaderboard(int, int) to authenticated;

-- Make the API see the changed functions right away.
notify pgrst, 'reload schema';
