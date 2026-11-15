// Gnome villagers as a game rule: who lives where, and what each gnome is doing right now.
//   By day (while they're out)   each gnome works a mine (up to maxPerMine per mine; extra gnomes wander),
//                                mining its own extra gold (its house's gnomeMine x the mine's rate) into a sack. A
//                                full sack is carried to the nearest Storage / Village Hall and added to
//                                your gold there; the mine's own stock is still yours to click.
//   During an attack             gnomes come out and repair damaged buildings (not walls, not rubble):
//                                its house's gnomeRepair x max HP per second each, up to maxRepairersPerBuilding.
// A gnome's stats come from its house's level (CONFIG.house.levels: gnomeMine, gnomeRepair).
//   Before dusk / the countdown  everyone is home.
// Gnomes live in Villager Houses (odd house levels add one, even levels make them better) and sleep
// there. The Village Hall is only a shelter for gnomes whose house is destroyed (they stop working until
// it's rebuilt).
// The gnome sprites (src/objects/Villagers.js) only act out these assignments.
import { CONFIG } from '../config.js';
import { getTownHall, levelStats, maxHp } from './buildings.js';
import { distanceToFootprint, footprintCenter } from './grid.js';
import { emit, isWaveActive } from './util.js';
import { gnomeBoost } from './dj.js';
import { abilityFx } from './abilities.js';
import { addGold } from './economy.js';

const V = () => CONFIG.villagers;

/** Should the gnomes be out working right now? Whenever no wave is attacking (day or night). */
export function villagersShouldBeOut(state) {
  return !isWaveActive(state);
}

/** Which stat tier a house level's gnomes are on: 1 at level 1, +1 at every level that improves them. */
export function gnomeTier(level) {
  const levels = CONFIG.house.levels;
  let tier = 1;
  for (let l = 2; l <= Math.min(level, levels.length); l++) {
    if (levels[l - 1].gnomeMine !== levels[l - 2].gnomeMine || levels[l - 1].gnomeRepair !== levels[l - 2].gnomeRepair) tier++;
  }
  return tier;
}

/** What a gnome from a house of this level does: { mine, repair } (from CONFIG.house.levels). */
export function gnomeStats(level) {
  const l = levelStats('house', Math.max(1, Math.min(CONFIG.house.levels.length, level || 1)));
  return { mine: l.gnomeMine, repair: l.gnomeRepair };
}

/** Every gnome in the village (they all live in Villager Houses), in a stable order. Level = its house's. */
export function gnomeRoster(state) {
  const list = [];
  for (const b of state.buildings) {
    if (b.type !== 'house') continue;
    const n = levelStats('house', b.level).gnomes + (abilityFx(b).gnomesAdd || 0); // Bunk Beds, Gnome Union
    for (let i = 0; i < n; i++) list.push({ id: `${b.id}:${i}`, homeId: b.id, level: b.level });
  }
  return list;
}

/** 'repair' while enemies attack, 'work' while the gnomes are out by day, otherwise 'home'. */
export function villageMode(state) {
  if (isWaveActive(state)) return 'repair';
  return villagersShouldBeOut(state) ? 'work' : 'home';
}

/** Is this building being hit right now (within villagers.repairDelayAfterHit seconds)? */
export function isUnderFire(b) {
  return (b.underFire || 0) > 0;
}

/**
 * Buildings the gnomes repair: standing, hurt, and not walls. Quiet ones first (most damaged first),
 * then ones under fire, where gnomes only wait nearby until the shooting stops.
 */
function repairTargets(state) {
  // Duct Tape (a Villager House perk): gnomes repair walls too.
  const walls = state.buildings.some((h) => h.type === 'house' && !h.destroyed && abilityFx(h).repairWalls);
  return state.buildings
    .filter((b) => !b.destroyed && (walls || b.type !== 'wall') && b.hp < maxHp(b))
    .sort((a, b) => isUnderFire(a) - isUnderFire(b) || a.hp / maxHp(a) - b.hp / maxHp(b) || (a.id < b.id ? -1 : 1));
}

/**
 * Where each gnome sleeps (and goes in the evening): Map gnomeId -> building id. Its own house, or the
 * Village Hall while that house is destroyed.
 */
export function gnomeShelters(state, roster = gnomeRoster(state)) {
  const th = getTownHall(state);
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const out = new Map();
  for (const g of roster) {
    const home = byId.get(g.homeId);
    out.set(g.id, home && !home.destroyed ? home.id : (th ? th.id : null));
  }
  return out;
}

/**
 * What every gnome is doing: Map gnomeId -> { id, homeId, shelterId, task, targetId, slot }.
 * task: 'mine' / 'repair' (at targetId, work spot `slot`), 'wander', 'inside' (in its shelter), or
 * 'displaced' (its house is rubble: shelters in the Village Hall, targetId = the hall).
 * shelterId: where it sleeps (see gnomeShelters).
 * Jobs are handed out a round at a time (every target gets one gnome before any gets a second), each to
 * the free gnome whose home is closest.
 */
export function assignGnomes(state) {
  const th = getTownHall(state);
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  const mode = villageMode(state);
  const out = new Map();
  const free = [];
  const roster = gnomeRoster(state);
  const shelters = gnomeShelters(state, roster);
  for (const r of roster) {
    const g = { ...r, shelterId: shelters.get(r.id) };
    const home = byId.get(g.homeId);
    if (!home || home.destroyed) {
      out.set(g.id, { ...g, task: 'displaced', targetId: th ? th.id : null, slot: 0 });
      continue;
    }
    out.set(g.id, { ...g, task: mode === 'work' ? 'wander' : 'inside', targetId: null, slot: 0 });
    free.push(g);
  }
  if (mode === 'home') return out;
  const targets = mode === 'work' ? state.buildings.filter((b) => b.type === 'mine' && !b.destroyed) : repairTargets(state);
  const perTarget = mode === 'work' ? V().maxPerMine : V().maxRepairersPerBuilding;
  for (let slot = 0; slot < perTarget; slot++) {
    for (const t of targets) {
      if (!free.length) return out;
      let best = 0, bestD = Infinity;
      free.forEach((g, i) => {
        const c = footprintCenter(byId.get(g.homeId));
        const d = distanceToFootprint(t, c.x, c.y);
        if (d < bestD) { best = i; bestD = d; }
      });
      const g = free.splice(best, 1)[0];
      out.set(g.id, { ...g, task: mode === 'work' ? 'mine' : 'repair', targetId: t.id, slot });
    }
  }
  return out;
}

/** How many gnomes are on each target: Map buildingId -> count (for one task). */
export function workersPerTarget(assignments, task) {
  const counts = new Map();
  for (const a of assignments.values()) if (a.task === task) counts.set(a.targetId, (counts.get(a.targetId) || 0) + 1);
  return counts;
}

/** Gold per second one gnome of this level mines into its sack at this mine. */
export function gnomeMiningRate(mine, gnomeLevel = 1) {
  return levelStats('mine', mine.level).production * gnomeStats(gnomeLevel).mine;
}

/** Where a gnome takes a full sack from this mine: the nearest standing Storage or Village Hall. */
export function nearestDropoff(state, mine) {
  const c = footprintCenter(mine);
  let best = null, bestD = Infinity;
  for (const b of state.buildings) {
    if (b.destroyed || (b.type !== 'storage' && b.type !== 'townHall')) continue;
    const d = distanceToFootprint(b, c.x, c.y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/** Seconds for a gnome to walk between a mine and a drop-off (straight line x tripDetour, at walkSpeed). */
export function tripTime(mine, drop) {
  const c = footprintCenter(mine);
  // Gnome Rail (mine) / Express Lane (storage) perks shorten the walk.
  const faster = (abilityFx(mine).tripFasterPct || 0) + (abilityFx(drop).tripFasterPct || 0);
  return (((distanceToFootprint(drop, c.x, c.y) + 1) * V().tripDetour) / V().walkSpeed) * Math.max(0.3, 1 - faster / 100);
}

/**
 * How much faster a gnome mines with perks: its house's (Lunchboxes, Better Pickaxes) and a Storage near the
 * mine (Payroll), as a multiplier (DJ Babyface's work playlist is applied separately).
 */
function gnomeMinePerk(state, a, mine) {
  const home = state.buildings.find((h) => h.id === a.homeId);
  let pct = home ? abilityFx(home).gnomeMinePct || 0 : 0;
  const c = footprintCenter(mine);
  for (const o of state.buildings) {
    if (o.type !== 'storage' || o.destroyed) continue;
    const fx = abilityFx(o);
    if (fx.gnomeAuraPct && distanceToFootprint(o, c.x, c.y) <= fx.auraRadius) pct = pct + fx.gnomeAuraPct;
  }
  return 1 + pct / 100;
}

/**
 * Gnome gold trips. Per gnome (state._gnomeWork, not saved): 'mining' fills its sack at its mine;
 * a full sack (sackSeconds of work) starts 'carrying' to the nearest drop-off, where the gold is added
 * ('gnomeDelivered'); then 'returning' to the mine. A gnome taken off its mine (evening, attack, mine
 * lost) drops the trip but keeps what's in its sack for next time.
 */
export function stepGnomeMining(state, dt, assignments) {
  const work = state._gnomeWork || (state._gnomeWork = new Map());
  for (const id of work.keys()) if (!assignments.has(id)) work.delete(id);
  const byId = new Map(state.buildings.map((b) => [b.id, b]));
  for (const a of assignments.values()) {
    let w = work.get(a.id);
    if (!w) work.set(a.id, (w = { sack: 0, phase: 'mining', timer: 0, mineId: null, dropId: null }));
    const mine = a.task === 'mine' ? byId.get(a.targetId) : null;
    if (!mine || mine.destroyed) { w.phase = 'mining'; w.timer = 0; w.mineId = null; w.dropId = null; continue; }
    if (w.mineId !== mine.id) { w.phase = 'mining'; w.timer = 0; w.mineId = mine.id; }
    const rate = gnomeMiningRate(mine, a.level) * gnomeBoost(state, mine) * gnomeMinePerk(state, a, mine); // DJ + perks
    const home = state.buildings.find((h) => h.id === a.homeId);
    const full = rate * V().sackSeconds * (1 + (home ? abilityFx(home).sackPct || 0 : 0) / 100); // Bigger Sacks
    if (w.phase === 'mining') {
      w.sack = Math.min(full, w.sack + rate * dt);
      if (w.sack >= full - 1e-9) {
        const drop = nearestDropoff(state, mine);
        if (drop) { w.phase = 'carrying'; w.dropId = drop.id; w.timer = tripTime(mine, drop); }
      }
    } else if (w.phase === 'carrying') {
      let drop = byId.get(w.dropId);
      if (!drop || drop.destroyed) {
        drop = nearestDropoff(state, mine);
        if (!drop) { w.phase = 'mining'; continue; }
        w.dropId = drop.id;
      }
      w.timer -= dt;
      if (w.timer <= 0) {
        const amount = Math.floor(w.sack);
        // Loading Dock (a Storage perk): deliveries there are worth more.
        const added = addGold(state, amount + Math.round(amount * (abilityFx(drop).dropBonusPct || 0) / 100));
        w.sack -= amount;
        emit(state, 'gnomeDelivered', { gnomeId: a.id, dropId: drop.id, amount, added });
        w.phase = 'returning';
        w.timer = tripTime(mine, drop);
      }
    } else if (w.phase === 'returning') {
      w.timer -= dt;
      if (w.timer <= 0) w.phase = 'mining';
    }
  }
}

/**
 * Repairing gnomes heal their building, but never one under fire (hit in the last few seconds), so an
 * attack always makes progress. Emits 'buildingHealed' in 5% steps (and at full HP) so the UI can
 * refresh without an event every frame.
 */
export function stepGnomeRepairs(state, dt, assignments) {
  for (const b of state.buildings) if (b.underFire > 0) b.underFire = Math.max(0, b.underFire - dt);
  // Each building's repair speed: the sum of its repairers' rates (higher-level gnomes repair faster).
  // Villager House perks: Toolbelts / Pit Crew (faster), Brave Gnomes (keep going under fire, slower),
  // Field Medics (the building being repaired takes less damage: b._repairArmor, read by damageBuilding).
  const rates = new Map(), brave = new Map();
  for (const b of state.buildings) b._repairArmor = 0;
  for (const a of assignments.values()) {
    if (a.task !== 'repair') continue;
    const home = state.buildings.find((h) => h.id === a.homeId);
    const fx = home ? abilityFx(home) : {};
    rates.set(a.targetId, (rates.get(a.targetId) || 0) + gnomeStats(a.level).repair * (1 + (fx.gnomeRepairPct || 0) / 100));
    if (fx.repairUnderFire) brave.set(a.targetId, Math.max(brave.get(a.targetId) || 0, fx.repairUnderFire));
    const t = state.buildings.find((x) => x.id === a.targetId);
    if (t && fx.repairArmorPct) t._repairArmor = Math.max(t._repairArmor || 0, fx.repairArmorPct);
  }
  for (const [id, base] of rates) {
    const b = state.buildings.find((x) => x.id === id);
    if (!b || b.destroyed) continue;
    let rate = base;
    if (isUnderFire(b)) { if (!brave.get(id)) continue; rate *= brave.get(id); }
    const max = maxHp(b);
    if (b.hp >= max) continue;
    const before = Math.floor((b.hp / max) * 20);
    b.hp = Math.min(max, b.hp + rate * gnomeBoost(state, b) * max * dt); // (faster near DJ Babyface)
    if (b.hp >= max || Math.floor((b.hp / max) * 20) !== before) emit(state, 'buildingHealed', { id: b.id, hp: b.hp });
  }
}
