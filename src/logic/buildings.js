// Building types, stats by level, costs, limits, and upgrade rules. Every number comes from CONFIG.
import { CONFIG } from '../config.js';
import { FOOTPRINTS } from '../gridConfig.js';
import { isWaveActive, nextId } from './util.js';
import { canPlaceRect, footprintsOverlap, fpW, fpH } from './grid.js';
import { ABILITIES, picksFor } from '../abilityConfig.js';
import { researchPoints, needRpReason } from './researchPoints.js';

// Every building type (saves only accept these). New types must be added here too; a test checks that the
// defense / economy / wall lists are all covered.
export const BUILDING_TYPES = ['townHall', 'mine', 'storage', 'house', 'shakeCollector', 'shakeStorage', 'cannon', 'archer', 'mortar', 'wizard', 'firework', 'spear', 'ksi', 'mousetrap', 'flock', 'catapult', 'ra', 'rvlab', 'dj', 'altar', 'queenAltar', 'mageAltar', 'fuelStation', 'wall'];
// Shop order = unlock order; the Diddypult (Village Hall 10) is always last.
export const DEFENSE_TYPES = ['cannon', 'archer', 'mortar', 'wizard', 'firework', 'spear', 'ksi', 'mousetrap', 'flock', 'ra', 'catapult'];
// (v0.14: the Shake Collector and Shake Storage, Village Hall 3, after the gold buildings: see shakes.js.)
export const ECONOMY_TYPES = ['mine', 'storage', 'house', 'shakeCollector', 'shakeStorage'];
/** Buildings that fill a stock to be clicked and collected: the Bitcoin Mine (gold) and the Shake Collector (Shakes). */
export const COLLECTOR_TYPES = ['mine', 'shakeCollector'];
export const WALL_TYPES = ['wall'];
// Research buildings (the RV Lab: researches the defenses' ability paths, see abilities.js).
export const RESEARCH_TYPES = ['rvlab'];
// Utility buildings (DJ Babyface: boosts gnomes and defenses nearby, see dj.js).
export const UTILITY_TYPES = ['dj'];
// Spell buildings (the Fuel Station: brews spells for the hotbar with RP, see spells.js). In the shop's Economy tab.
export const SPELL_TYPES = ['fuelStation'];
// Hero altars: the Brisket King's (hero.js), from Village Hall 8 the Hatsune Queen's (queen.js) and from Village Hall 10
// the Locklair Mage (mage.js; he and his pedestal are one building). Each hero levels up with his or her building.
export const HERO_TYPES = ['altar', 'queenAltar', 'mageAltar'];
/** Wall orientations: 'x' runs along columns (N wide, 1 tall), 'y' along rows (1 wide, N tall). */
export const WALL_ORIENTS = ['x', 'y'];

export function isDefense(type) {
  return DEFENSE_TYPES.includes(type);
}

/** Support defenses (the F.L.O.C.K Tower) count as defenses but never attack. */
export function isSupport(type) {
  return isDefense(type) && !!typeConfig(type).support;
}

/** A defense's range at a level: its level's own range if it has one (F.L.O.C.K Tower), else the type's. */
export function defenseRange(type, level = 1) {
  const cfg = typeConfig(type);
  const l = cfg.levels[level - 1];
  return l && l.range !== undefined ? l.range : cfg.range;
}

export function typeConfig(type) {
  if (type === 'townHall') return CONFIG.townHall;
  if (type === 'mine') return CONFIG.mine;
  if (type === 'storage') return CONFIG.storage;
  if (type === 'house') return CONFIG.house;
  if (type === 'shakeCollector') return CONFIG.shakeCollector;
  if (type === 'shakeStorage') return CONFIG.shakeStorage;
  if (type === 'wall') return CONFIG.walls;
  if (type === 'rvlab') return CONFIG.rvlab;
  if (type === 'dj') return CONFIG.dj;
  if (type === 'altar') return CONFIG.altar;
  if (type === 'queenAltar') return CONFIG.queenAltar;
  if (type === 'mageAltar') return CONFIG.mageAltar;
  if (type === 'fuelStation') return CONFIG.fuelStation;
  return CONFIG.defenses[type];
}

export function buildingName(type) {
  return typeConfig(type).name;
}

/** Square footprint size (walls are 1 x segmentLength, a single tile by default; use footprintDims for them). */
export function buildingSize(type) {
  if (type === 'wall') return 1;
  if (type === 'townHall') return FOOTPRINTS.townHall;
  return typeConfig(type).size ?? FOOTPRINTS.default; // a type can set its own (F.L.O.C.K Tower, Mousetrap: 1)
}

/** Footprint width and height for a type (and wall orientation). */
export function footprintDims(type, orient = 'x') {
  if (type === 'wall') {
    const n = CONFIG.walls.segmentLength;
    return orient === 'y' ? { w: 1, h: n } : { w: n, h: 1 };
  }
  const s = buildingSize(type);
  return { w: s, h: s };
}

/**
 * Edit mode swap: `mover` dropped at (col, row) on top of exactly one other building trades places
 * with it. Each lands centered where the other was (identical spots when they're the same size), and
 * both new spots must be clear and on grass. Returns { ok, reason, otherId, to: {col,row}, otherTo: {col,row} }
 * or null when the drop isn't on exactly one building.
 */
export function planSwap(buildings, mover, col, row, orient = null) {
  const newOrient = mover.type === 'wall' ? (orient || mover.orient) : undefined;
  const dims = footprintDims(mover.type, newOrient);
  const dropped = { col, row, w: dims.w, h: dims.h };
  const hit = buildings.filter((b) => b.id !== mover.id && footprintsOverlap(dropped, b));
  if (hit.length !== 1) return null;
  const other = hit[0];
  const to = {
    col: Math.round(other.col + fpW(other) / 2 - dims.w / 2),
    row: Math.round(other.row + fpH(other) / 2 - dims.h / 2)
  };
  const otherTo = {
    col: Math.round(mover.col + fpW(mover) / 2 - fpW(other) / 2),
    row: Math.round(mover.row + fpH(mover) / 2 - fpH(other) / 2)
  };
  const rest = buildings.filter((b) => b.id !== mover.id && b.id !== other.id);
  const a = canPlaceRect(rest, to.col, to.row, dims.w, dims.h);
  if (!a.ok) return { ok: false, reason: a.reason, otherId: other.id, to, otherTo };
  const b = canPlaceRect([...rest, { id: mover.id, ...to, w: dims.w, h: dims.h }], otherTo.col, otherTo.row, fpW(other), fpH(other));
  if (!b.ok) return { ok: false, reason: b.reason, otherId: other.id, to, otherTo };
  return { ok: true, reason: '', otherId: other.id, to, otherTo };
}

/** Stats for a level (1-based; the Village Hall also has level 0, its starting ruin). */
export function levelStats(type, level) {
  if (type === 'townHall' && level === 0) return CONFIG.townHall.ruin;
  return typeConfig(type).levels[level - 1];
}

/** Health multiplier from ability tiers (Cannon Thick Walls: hpPct). Read straight from the trees (no import loop). */
function hpBonus(b) {
  const tree = ABILITIES[b.type];
  if (!tree || !b.picks || !b.picks.length) return 1;
  let pct = 0;
  b.picks.forEach((p, i) => { pct += (tree[p] && tree[p].tiers[i].fx.hpPct) || 0; });
  return 1 + pct / 100;
}

export function maxHp(b) {
  const hp = levelStats(b.type, b.level).hp;
  const k = hpBonus(b) * (b.merged ? mergedConfigOf(b)?.hpMult || 1 : 1); // a merged defense: CONFIG.merges[type].hpMult
  return k === 1 ? hp : Math.round(hp * k);
}

// ---------- merged defenses (CONFIG.merges; the merge itself is in merge.js) ----------
/** The merge block for a type (CONFIG.merges[type]), or null when the type can't merge. */
export function mergeConfig(type) {
  return (CONFIG.merges && CONFIG.merges[type]) || null;
}

/** A merged building's merge block, or null (not merged, or its type can no longer merge). */
export function mergedConfigOf(b) {
  return b && b.merged ? mergeConfig(b.type) : null;
}

/** What a building is called: a merged one has its own name ("Mega Cannon"). */
export function displayName(b) {
  const m = mergedConfigOf(b);
  return m ? m.name : buildingName(b.type);
}

/**
 * Timed perk specials (Flak Burst, Broadside, Volley Lock, Earthquake...) on a merged defense hit as much harder as its
 * shots' damage per second went up: damageMult / fireIntervalMult (Mega Cannon 1.5, Locklair Citadel 1.4). 1 if not merged.
 */
export function mergeDpsMult(b) {
  const m = mergedConfigOf(b);
  return m ? (m.damageMult || 1) / (m.fireIntervalMult || 1) : 1;
}

/** Extra on each regular shot on top of mergeDpsMult, so a shot hits for damageMult in all (Mega Cannon: 1.6). */
export function mergeShotMult(b) {
  const m = mergedConfigOf(b);
  return m ? m.fireIntervalMult || 1 : 1;
}

/**
 * A merged building's Mastery effects (its type's researched Mastery tiers, kept on the building as b.mastery by
 * syncMastery in merge.js): the tiers' fx merged like perks (a later tier's keys join the earlier ones). {} if none.
 */
export function masteryFxOf(b) {
  const m = mergedConfigOf(b);
  const n = m ? Math.min(b.mastery || 0, m.mastery.tiers.length) : 0;
  if (!n) return NO_FX;
  const key = `${b.type}|${n}`;
  let fx = masteryCache.get(key);
  if (!fx) {
    fx = {};
    for (const t of m.mastery.tiers.slice(0, n)) for (const [k, v] of Object.entries(t.fx)) fx[k] = fx[k] === undefined ? v : Math.max(fx[k], v);
    masteryCache.set(key, Object.freeze(fx));
  }
  return fx;
}
const NO_FX = Object.freeze({});
const masteryCache = new Map();

export function maxLevel(type) {
  const n = typeConfig(type).levels.length;
  return type === 'townHall' ? Math.min(n, CONFIG.rules.maxTownHallLevel) : n;
}

export function unlockTownHall(type) {
  return type === 'townHall' ? 1 : typeConfig(type).unlockTownHall;
}

/**
 * Shop price = level 1 cost. Walls, given the state, cost what one wall at the village's wall level has cost
 * (wallBuildCost: they're placed at that level).
 */
export function buildCost(type, state = null) {
  if (type === 'wall' && state) return wallBuildCost(state);
  if (type === 'townHall') return 0;
  return typeConfig(type).levels[0].cost;
}

/** Price to go from `level` to `level + 1`, or null at max level. */
export function upgradeCost(type, level) {
  if (level >= maxLevel(type)) return null;
  const next = typeConfig(type).levels[level];
  return type === 'townHall' ? next.upgradeCost : next.cost;
}

/** Everything spent on a building of this level: build cost plus every upgrade. */
export function totalSpent(type, level) {
  if (type === 'townHall') return 0;
  return typeConfig(type).levels.slice(0, level).reduce((sum, l) => sum + (l.costCurrency === 'rp' ? 0 : l.cost), 0); // gold only
}

/** 'gold' or 'rp': what going from `level` to `level + 1` is paid with (a level's `costCurrency`). */
export function upgradeCurrency(type, level) {
  const next = typeConfig(type).levels[level];
  return (next && next.costCurrency) || 'gold';
}

/** How many of a type are allowed at a town hall level (its cap). */
export function limitFor(type, townHallLevel) {
  return CONFIG.limits[type][townHallLevel - 1] ?? 0;
}

/** How many of a type count toward its limit: a merged building counts as 2 (it took two slots and keeps them). */
export function countOwned(buildings, type) {
  let n = 0;
  for (const b of buildings) if (b.type === type) n += b.merged ? 2 : 1;
  return n;
}

/**
 * How many of `type` this village has past its cap (0 normally). v0.6.1-v0.7's Bonus Slots let Village Hall 11 build
 * up to 5 defenses past their caps; those villages keep them (they work, upgrade and move as usual), but no more of
 * that type can be built until the village is back under the cap.
 */
export function overCap(state, type) {
  return Math.max(0, countOwned(state.buildings, type) - limitFor(type, townHallLevel(state)));
}

/** How many more of `type` this village may build now (its cap's room; 0 at or over the cap). */
export function roomFor(state, type) {
  return Math.max(0, limitFor(type, townHallLevel(state)) - countOwned(state.buildings, type));
}

/** How many more buildings and wall segments the Town Hall level allows (shop badge): every type's room under its cap. */
export function buildableCount(state) {
  return BUILDING_TYPES.filter((t) => t !== 'townHall').reduce((n, t) => n + roomFor(state, t), 0);
}

/**
 * What each Village Hall level adds over the one before it: [{ type, add }] for every type whose cap goes up, in
 * shop order (defenses first, then the economy and the rest; walls last). Empty for levels past the top.
 */
export function hallUnlocks(level) {
  if (level < 2 || level > CONFIG.rules.maxTownHallLevel) return [];
  const order = [...DEFENSE_TYPES, ...ECONOMY_TYPES, ...SPELL_TYPES, ...RESEARCH_TYPES, ...UTILITY_TYPES, ...HERO_TYPES, ...WALL_TYPES];
  return order.map((type) => ({ type, add: limitFor(type, level) - limitFor(type, level - 1) })).filter((u) => u.add > 0);
}

export function getTownHall(state) {
  return state.buildings.find((b) => b.type === 'townHall') || null;
}

export function townHallLevel(state) {
  const th = getTownHall(state);
  return th ? th.level : 1; // 0 while the starting hall is still in ruins
}

export function needGoldReason(cost, gold) {
  return `Need ${(cost - gold).toLocaleString('en-US')} more gold`;
}

/** Can the player buy one more of this type right now? Reasons match the shop card text. */
export function checkBuy(state, type) {
  const th = townHallLevel(state);
  const unlock = unlockTownHall(type);
  if (th < unlock) return { ok: false, reason: `Requires VH${unlock}` };
  if (roomFor(state, type) <= 0) {
    // Limit is 0 at this TH level even though the type is "unlocked": point at the next TH that allows one.
    if (limitFor(type, th) === 0) return { ok: false, reason: `Requires VH${th + 1}` };
    return { ok: false, reason: 'Limit reached' }; // (over the cap too: see overCap)
  }
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave' };
  const cost = buildCost(type, state);
  if (state.gold < cost) return { ok: false, reason: needGoldReason(cost, state.gold) };
  return { ok: true, reason: '' };
}

/** Can this building be upgraded right now? Returns { ok, reason, cost }. Walls: Upgrade Walls (all of them). */
export function checkUpgrade(state, b) {
  if (b.type === 'wall') return checkWallUpgrade(state);
  const cost = upgradeCost(b.type, b.level);
  if (cost === null) return { ok: false, reason: 'Max level', cost: null };
  // Every answer names the currency, so a locked Shake-priced level still reads "600 Shakes", not "600".
  const currency = upgradeCurrency(b.type, b.level);
  if (b.type !== 'townHall' && b.level >= townHallLevel(state)) {
    return { ok: false, reason: `Requires VH${b.level + 1}`, cost, currency };
  }
  // Some levels need a higher Village Hall than that (the RV Lab: level N needs VH N+3).
  const needVH = levelStats(b.type, b.level + 1).townHall;
  if (needVH && townHallLevel(state) < needVH) return { ok: false, reason: `Requires VH${needVH}`, cost, currency };
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave', cost, currency };
  if (b.destroyed) return { ok: false, reason: 'Destroyed', cost, currency };
  if (currency === 'rp') {
    const have = researchPoints(state);
    if (have < cost) return { ok: false, reason: needRpReason(cost, have), cost, currency };
    return { ok: true, reason: '', cost, currency };
  }
  if (state.gold < cost) return { ok: false, reason: needGoldReason(cost, state.gold), cost, currency };
  return { ok: true, reason: '', cost, currency };
}

/** Make a new building object (not yet added to state). */
export function createBuilding(state, type, col, row, level = 1, id = null, orient = 'x') {
  const { w, h } = footprintDims(type, orient);
  const b = {
    id: id || nextId(state, 'b'),
    type,
    level,
    col,
    row,
    w,
    h,
    hp: levelStats(type, level).hp,
    destroyed: false
  };
  if (type === 'wall') b.orient = orient;
  else b.size = buildingSize(type); // square buildings keep `size` too (w = h = size)
  if (COLLECTOR_TYPES.includes(type)) b.stock = 0;
  if (isDefense(type)) { b.cooldown = 0; b.targetId = null; }
  // RV Lab perks: every building of a type gets its type's picks (its level plays no part).
  if (ABILITIES[type]) b.picks = picksFor(state && state.research, type);
  return b;
}

/** Raise a building's level by one. HP scales so the same fraction of health is kept. */
export function applyLevelUp(b) {
  const oldMax = maxHp(b);
  b.level += 1;
  const newMax = maxHp(b);
  b.hp = b.destroyed ? 0 : Math.round((b.hp / oldMax) * newMax);
}

// ---------- walls: one level for the whole village ----------
// Walls are never upgraded one by one: "Upgrade Walls" raises every wall one level at once, for
// (walls placed) x (the new level's price), and new walls are placed at the village's wall level
// (state.wallLevel, saved). Each level still needs its Village Hall (`townHall` on CONFIG.walls.levels).

/**
 * The wall level a village without a saved one gets (older saves, see deserializeGame): the most common
 * level among its walls, ties going to the higher level. 1 with no walls.
 */
export function commonWallLevel(buildings) {
  const counts = new Map();
  for (const b of buildings || []) if (b && b.type === 'wall' && Number.isInteger(b.level)) counts.set(b.level, (counts.get(b.level) || 0) + 1);
  let best = 1, most = 0;
  for (const [level, n] of counts) if (n > most || (n === most && level > best)) { best = level; most = n; }
  return Math.max(1, Math.min(maxLevel('wall'), best));
}

/** The village's wall level: every wall is at it, and new walls are placed at it. */
export function wallLevel(state) {
  const l = state && state.wallLevel;
  return Number.isInteger(l) && l >= 1 ? Math.min(l, maxLevel('wall')) : commonWallLevel(state && state.buildings);
}

/**
 * A new wall's price: what one wall at the village's wall level has cost (level 1 + every upgrade), so a wall
 * bought late costs the same as one bought early and upgraded.
 */
export function wallBuildCost(state) {
  return totalSpent('wall', wallLevel(state));
}

/**
 * Upgrade Walls: can every wall go up one level now? { ok, reason, cost, currency, count, each, level }:
 * cost = count (walls placed) x each (the new level's price); level = the level they'd go to.
 */
export function checkWallUpgrade(state) {
  const from = wallLevel(state);
  const count = countOwned(state.buildings, 'wall');
  const base = { count, level: from + 1, currency: 'gold' };
  if (from >= maxLevel('wall')) return { ok: false, reason: 'Max level', cost: null, each: null, ...base, level: from };
  const each = upgradeCost('wall', from);
  const cost = count * each;
  const out = { ...base, cost, each };
  const needVH = levelStats('wall', from + 1).townHall || from + 1;
  if (townHallLevel(state) < needVH) return { ...out, ok: false, reason: `Requires VH${needVH}` };
  if (isWaveActive(state)) return { ...out, ok: false, reason: 'Not during a wave' };
  if (count === 0) return { ...out, ok: false, reason: 'No walls yet' };
  if (state.gold < cost) return { ...out, ok: false, reason: needGoldReason(cost, state.gold) };
  return { ...out, ok: true, reason: '' };
}
