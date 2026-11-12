// Ground-enemy pathfinding on the tile grid (air enemies fly straight and never use this).
//
// Each tile has a cost to step onto: 1 for open ground; a standing wall or building costs extra,
// because the enemy has to break it first (CONFIG.pathing). So enemies walk around walls when the
// detour is cheaper and smash through when the base is sealed or the detour is long.
//
// For each target building we build a distance field with Dijkstra: for every tile, the cheapest
// cost from there to a tile where the enemy can attack the target. Enemies follow the field
// downhill. Fields are cached and rebuilt only when buildings change (placed, moved, destroyed...).
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { maxHp } from './buildings.js';
import { fpW, fpH, distanceToFootprint } from './grid.js';

const COLS = MAP.cols;
const ROWS = MAP.rows;
const SQRT2 = Math.SQRT2;
// [dx, dy, step length]
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

const idx = (c, r) => r * COLS + c;
const inGrid = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;

/** Extra cost to break through a building on a path (walls are cheaper per HP than buildings). */
export function breakCost(b) {
  const p = CONFIG.pathing;
  return b.type === 'wall' ? maxHp(b) * p.wallCostPerHp : maxHp(b) * p.buildingCostPerHp + p.buildingExtraCost;
}

/** Changes whenever anything that affects paths changes. */
export function navSignature(state) {
  return state.buildings.map((b) => `${b.id}:${b.col},${b.row},${fpW(b)},${fpH(b)},${b.level},${b.destroyed ? 1 : 0}`).join('|');
}

/** Tile occupancy and step costs, rebuilt only when the buildings change. */
export function getNav(state) {
  const sig = navSignature(state);
  if (state._nav && state._nav.sig === sig) return state._nav;
  const occ = new Array(COLS * ROWS).fill(null);
  const cost = new Float32Array(COLS * ROWS).fill(1);
  const costJump = new Float32Array(COLS * ROWS).fill(1); // for wall jumpers: walls cost nothing extra
  for (const b of state.buildings) {
    if (b.destroyed || CONFIG.defenses[b.type]?.trap) continue; // rubble and hidden traps are walkable
    const extra = breakCost(b);
    for (let r = b.row; r < b.row + fpH(b); r++) {
      for (let c = b.col; c < b.col + fpW(b); c++) {
        if (!inGrid(c, r)) continue;
        occ[idx(c, r)] = b;
        cost[idx(c, r)] = 1 + extra;
        costJump[idx(c, r)] = b.type === 'wall' ? 1 : 1 + extra;
      }
    }
  }
  state._nav = { sig, occ, cost, costJump, fields: new Map() };
  return state._nav;
}

// Small binary heap keyed by distance.
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(i, d) {
    const a = this.a; a.push([d, i]);
    let k = a.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (a[p][0] <= a[k][0]) break; [a[p], a[k]] = [a[k], a[p]]; k = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]]; k = m;
      }
    }
    return top;
  }
}

/** A diagonal step may not cut the corner of a blocked tile. */
function diagonalClear(nav, c, r, dx, dy, jump = false) {
  const a = idx(c + dx, r), b = idx(c, r + dy);
  const blocked = (i) => nav.occ[i] !== null && !(jump && nav.occ[i].type === 'wall');
  return inGrid(c + dx, r) && inGrid(c, r + dy) && !blocked(a) && !blocked(b);
}

/**
 * Cost-to-goal for every tile, for enemies attacking `target` from up to `reach` tiles away.
 * Goal tiles: tile centers within reach of the target's footprint. The target's own tiles are never entered.
 */
export function distanceField(nav, target, reach, jump = false) {
  const key = `${target.id}|${reach}|${jump ? 'j' : ''}`;
  const tileCost = jump ? nav.costJump : nav.cost;
  const cached = nav.fields.get(key);
  if (cached) return cached;
  const dist = new Float32Array(COLS * ROWS).fill(Infinity);
  const heap = new Heap();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = idx(c, r);
      if (nav.occ[i] === target) continue;
      if (distanceToFootprint(target, c + 0.5, r + 0.5) <= reach + 1e-6) { dist[i] = 0; heap.push(i, 0); }
    }
  }
  while (heap.size) {
    const [d, m] = heap.pop();
    if (d > dist[m]) continue;
    const mc = m % COLS, mr = (m / COLS) | 0;
    // Relax every neighbor n that can step onto m (paying m's cost).
    for (const [dx, dy, len] of DIRS) {
      const nc = mc - dx, nr = mr - dy;
      if (!inGrid(nc, nr)) continue;
      const n = idx(nc, nr);
      if (nav.occ[n] === target) continue;
      if (len > 1 && !diagonalClear(nav, nc, nr, dx, dy, jump)) continue;
      const nd = d + tileCost[m] * len;
      if (nd < dist[n]) { dist[n] = nd; heap.push(n, nd); }
    }
  }
  nav.fields.set(key, dist);
  return dist;
}

/**
 * Where should an enemy at (x, y) go next?
 *   null                 - off the grid or no route at all (caller falls back to walking straight)
 *   { goal: true }       - already on a tile in reach of the target
 *   { tx, ty, blocker }  - head for that tile center; `blocker` is the wall/building in the way (to break), or null
 */
export function nextStep(nav, field, x, y, jump = false) {
  const tileCost = jump ? nav.costJump : nav.cost;
  const c = Math.floor(x), r = Math.floor(y);
  if (!inGrid(c, r)) return null;
  const here = field[idx(c, r)];
  if (!Number.isFinite(here)) return null;
  if (here === 0) return { goal: true };
  let best = null, bestCost = Infinity;
  for (const [dx, dy, len] of DIRS) {
    const nc = c + dx, nr = r + dy;
    if (!inGrid(nc, nr)) continue;
    const n = idx(nc, nr);
    if (!Number.isFinite(field[n])) continue;
    if (len > 1 && !diagonalClear(nav, c, r, dx, dy, jump)) continue;
    const total = tileCost[n] * len + field[n];
    if (total < bestCost - 1e-9) { bestCost = total; best = n; }
  }
  if (best === null) return null;
  const bc = best % COLS, br = (best / COLS) | 0;
  const occ = nav.occ[best];
  // A jumper hops a wall instead of breaking it, so a wall is never its blocker.
  return { tx: bc + 0.5, ty: br + 0.5, blocker: jump && occ && occ.type === 'wall' ? null : occ };
}
