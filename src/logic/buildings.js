// Building types, stats by level, costs, limits, and upgrade rules. Every number comes from CONFIG.
import { CONFIG } from '../config.js';
import { isWaveActive, nextId } from './util.js';
import { canPlaceRect, footprintsOverlap, fpW, fpH } from './grid.js';

// Every building type (saves only accept these). New types must be added here too; a test checks that the
// defense / economy / wall lists are all covered.
export const BUILDING_TYPES = ['townHall', 'mine', 'storage', 'house', 'cannon', 'archer', 'mortar', 'wizard', 'firework', 'mousetrap', 'flock', 'catapult', 'ra', 'wall'];
export const DEFENSE_TYPES = ['cannon', 'archer', 'mortar', 'wizard', 'firework', 'mousetrap', 'flock', 'catapult', 'ra'];
export const ECONOMY_TYPES = ['mine', 'storage', 'house'];
export const WALL_TYPES = ['wall'];
/** Wall orientations: 'x' runs along columns (N wide, 1 tall), 'y' along rows (1 wide, N tall). */
export const WALL_ORIENTS = ['x', 'y'];

export function isWall(typeOrBuilding) {
  return (typeof typeOrBuilding === 'string' ? typeOrBuilding : typeOrBuilding && typeOrBuilding.type) === 'wall';
}

export function isDefense(type) {
  return DEFENSE_TYPES.includes(type);
}

/** Hidden traps (the Mousetrap): enemies never see, target, path around or damage them. */
export function isHiddenTrap(type) {
  const cfg = CONFIG.defenses[type];
  return !!(cfg && cfg.trap);
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
  if (type === 'wall') return CONFIG.walls;
  return CONFIG.defenses[type];
}

export function buildingName(type) {
  return typeConfig(type).name;
}

/** Square footprint size (walls are 1 x segmentLength, a single tile by default; use footprintDims for them). */
export function buildingSize(type) {
  if (type === 'wall') return 1;
  if (type === 'townHall') return CONFIG.grid.townHallSize;
  return typeConfig(type).size ?? CONFIG.grid.buildingSize; // a type can set its own (F.L.O.C.K Tower: 1)
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

export function maxHp(b) {
  return levelStats(b.type, b.level).hp;
}

export function maxLevel(type) {
  const n = typeConfig(type).levels.length;
  return type === 'townHall' ? Math.min(n, CONFIG.rules.maxTownHallLevel) : n;
}

export function unlockTownHall(type) {
  return type === 'townHall' ? 1 : typeConfig(type).unlockTownHall;
}

/** Shop price = level 1 cost. */
export function buildCost(type) {
  return type === 'townHall' ? 0 : typeConfig(type).levels[0].cost;
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
  return typeConfig(type).levels.slice(0, level).reduce((sum, l) => sum + l.cost, 0);
}

/** How many of a type are allowed at a town hall level. */
export function limitFor(type, townHallLevel) {
  return CONFIG.limits[type][townHallLevel - 1] ?? 0;
}

export function countOwned(buildings, type) {
  return buildings.filter((b) => b.type === type).length;
}

/** How many more buildings and wall segments the Town Hall level allows (shop badge). */
export function buildableCount(state) {
  const th = townHallLevel(state);
  return BUILDING_TYPES.filter((t) => t !== 'townHall')
    .reduce((n, t) => n + Math.max(0, limitFor(t, th) - countOwned(state.buildings, t)), 0);
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
  if (countOwned(state.buildings, type) >= limitFor(type, th)) {
    // Limit is 0 at this TH level even though the type is "unlocked": point at the next TH that allows one.
    if (limitFor(type, th) === 0) return { ok: false, reason: `Requires VH${th + 1}` };
    return { ok: false, reason: 'Limit reached' };
  }
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave' };
  const cost = buildCost(type);
  if (state.gold < cost) return { ok: false, reason: needGoldReason(cost, state.gold) };
  return { ok: true, reason: '' };
}

/** Can this building be upgraded right now? Returns { ok, reason, cost }. */
export function checkUpgrade(state, b) {
  const cost = upgradeCost(b.type, b.level);
  if (cost === null) return { ok: false, reason: 'Max level', cost: null };
  if (b.type !== 'townHall' && b.level >= townHallLevel(state)) {
    return { ok: false, reason: `Requires VH${b.level + 1}`, cost };
  }
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave', cost };
  if (b.destroyed) return { ok: false, reason: 'Destroyed', cost };
  if (state.gold < cost) return { ok: false, reason: needGoldReason(cost, state.gold), cost };
  return { ok: true, reason: '', cost };
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
  if (type === 'mine') b.stock = 0;
  if (isDefense(type)) { b.cooldown = 0; b.targetId = null; }
  return b;
}

/** Raise a building's level by one. HP scales so the same fraction of health is kept. */
export function applyLevelUp(b) {
  const oldMax = maxHp(b);
  b.level += 1;
  const newMax = maxHp(b);
  b.hp = b.destroyed ? 0 : Math.round((b.hp / oldMax) * newMax);
}

// ---------- wall groups (upgrade a whole stretch of wall at once) ----------
/**
 * Every standing wall at the same level as `wall` that's connected to it through side-by-side walls of
 * that level, nearest first (breadth-first from `wall`). Diagonal neighbors aren't connected.
 */
export function wallGroup(state, wall) {
  if (!wall || wall.type !== 'wall' || wall.destroyed) return [];
  const at = new Map();
  for (const b of state.buildings) {
    if (b.type === 'wall' && !b.destroyed && b.level === wall.level) at.set(`${b.col},${b.row}`, b);
  }
  const out = [wall], seen = new Set([wall.id]);
  for (let i = 0; i < out.length; i++) {
    const { col, row } = out[i];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at.get(`${col + dc},${row + dr}`);
      if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); }
    }
  }
  return out;
}

/**
 * What upgrading a group of walls would do: the walls that can be upgraded with the gold there is (in
 * order, nearest first), their total cost, and the full group's size. reason explains when none can be.
 */
export function planWallGroupUpgrade(state, walls) {
  let gold = state.gold, cost = 0;
  const ids = [];
  let reason = '';
  for (const b of walls) {
    const check = checkUpgrade({ ...state, gold }, b);
    if (!check.ok) { reason = reason || check.reason; break; }
    gold -= check.cost; cost += check.cost; ids.push(b.id);
  }
  const each = walls.length ? upgradeCost('wall', walls[0].level) : null;
  return { ids, cost, total: walls.length, each, reason: ids.length ? '' : reason };
}
