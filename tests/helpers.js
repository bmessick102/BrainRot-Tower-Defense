// Test helpers: a tiny game state without Phaser.
import { createIdleWave } from '../src/logic/waves.js';
import { createBuilding } from '../src/logic/buildings.js';

/** Deterministic RNG (mulberry32). */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeState(overrides = {}) {
  const events = [];
  return {
    gold: 0,
    buildings: [],
    enemies: [],
    projectiles: [],
    pools: [],
    wave: createIdleWave(),
    wavesCleared: 0,
    tutorialStep: 1,
    tutorialDone: false,
    gameOver: false,
    nextId: 1,
    rng: seededRng(42),
    events,
    emit(name, data) { events.push({ name, data }); },
    ...overrides
  };
}

/**
 * Where the mechanics tests' town hall stands (cols / rows 19-21). It's a fixed spot rather than the map's anchor (25, 25
 * since v0.9.2's 52 x 52 grid), so the fights the tests set up around it keep their numbers. Pathfinding ignores the
 * grass, and every spot used here is inside the grid.
 */
export const TEST_TOWN_HALL = [19, 19];

/** State with a town hall at TEST_TOWN_HALL. */
export function makeStateWithTownHall(overrides = {}, level = 1) {
  const state = makeState(overrides);
  const [c, r] = TEST_TOWN_HALL;
  state.buildings.push(createBuilding(state, 'townHall', c, r, level));
  return state;
}

export function addBuilding(state, type, col, row, level = 1) {
  const b = createBuilding(state, type, col, row, level);
  state.buildings.push(b);
  return b;
}

export function addEnemy(state, kind, x, y, extra = {}) {
  const e = { id: `e${state.nextId++}`, kind, x, y, hp: 100, maxHp: 100, targetId: null, cooldown: 0, alive: true, hit: false, ...extra };
  state.enemies.push(e);
  return e;
}

// ---------- Shakes (v0.14): the cap a Village Hall can reach, and the biggest Shake price open there ----------
// (Imported lazily inside the functions below would be nicer, but these modules are cheap and have no side effects.)
import { CONFIG } from '../src/config.js';
import { BUILDING_TYPES, typeConfig, maxLevel, levelStats, limitFor } from '../src/logic/buildings.js';
import { ABILITY_COSTS } from '../src/abilityConfig.js';

/** The lowest Village Hall at which a building can reach `level` (no higher than the hall, plus any level's own `townHall`). */
export function firstHallFor(type, level) {
  if (type === 'townHall') return Math.max(1, level - 1);
  return Math.max(level, typeConfig(type).unlockTownHall || 1, levelStats(type, level).townHall || 0);
}

/** The highest level a type can be at Village Hall `vh` (0 before it unlocks). */
export function topLevelAt(type, vh) {
  let top = 0;
  for (let l = 1; l <= maxLevel(type); l++) if (firstHallFor(type, l) <= vh) top = l;
  return top;
}

/** The most Shakes a village can hold at Village Hall `vh`: the hall's own store plus every Shake Storage it may have, each at its top level. */
export function shakeCapAt(vh) {
  const hall = CONFIG.townHall.levels[vh - 1].shakeCapacity;
  const n = limitFor('shakeStorage', vh), lvl = topLevelAt('shakeStorage', vh);
  return hall + (n && lvl ? n * levelStats('shakeStorage', lvl).capacity : 0);
}

/**
 * Every Shake price open at Village Hall `vh`, as [label, price]: building levels priced in Shakes (heroes, RV Lab,
 * Fuel Station), RV Lab perks up to the lab's top tier there and the biggest path reset, merges and their Mastery tiers
 * once the type can reach its top level, and spells the Fuel Station can brew.
 */
export function shakePricesAt(vh) {
  const out = [];
  for (const type of BUILDING_TYPES) {
    for (let l = 2; l <= maxLevel(type); l++) {
      const s = levelStats(type, l);
      if (s.costCurrency === 'rp' && firstHallFor(type, l) <= vh) out.push([`${type} Lv${l}`, s.cost]);
    }
  }
  const lab = topLevelAt('rvlab', vh);
  const tiers = ABILITY_COSTS.research.slice(0, lab);
  tiers.forEach((c, i) => out.push([`perk tier ${i + 1}`, c]));
  if (tiers.length) out.push(['path reset', Math.round(tiers.reduce((a, b) => a + b, 0) * CONFIG.rules.respecShare)]);
  for (const [type, m] of Object.entries(CONFIG.merges || {})) {
    if (topLevelAt(type, vh) < maxLevel(type)) continue;
    out.push([`merge ${type}`, m.cost.rp]);
    m.mastery.costs.forEach((c, i) => { if (m.mastery.labLevel[i] <= lab) out.push([`${type} Mastery ${i + 1}`, c]); });
  }
  const fuel = topLevelAt('fuelStation', vh);
  for (const [kind, sp] of Object.entries(CONFIG.fuelStation.spells)) if (sp.level <= fuel) out.push([`spell ${kind}`, sp.brewCost]);
  return out;
}

/** The biggest Shake price open at Village Hall `vh` (0 when there's none). */
export function maxShakePriceAt(vh) {
  return Math.max(0, ...shakePricesAt(vh).map(([, c]) => c));
}
