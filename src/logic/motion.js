// Status effects that move or hold enemies, shared by the ability effects: knockback (shoved back along a
// direction, never into a building or wall), slows, stuns, and walking toward a point (Cheese Bait).
// Only imports the nav map, so combat.js, traps.js and flock.js can all use it without import loops.
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { getNav } from './pathfinding.js';
import { distance } from './iso.js';

const KNOCK_STEP = 0.1; // tiles: knockback moves in small steps and stops at the first blocked one

const isAir = (e) => CONFIG.enemies[e.kind].type === 'air';

/** Can a ground enemy stand at (x, y)? Off-grid edges are open; standing buildings and walls are not. */
export function standable(nav, x, y, jumper = false) {
  const c = Math.floor(x), r = Math.floor(y);
  if (c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows) return true;
  const occ = nav.occ[r * MAP.cols + c];
  return !occ || occ.destroyed || (jumper && occ.type === 'wall');
}

/**
 * Shove a ground enemy `dist` tiles along (dx, dy) (normalized here). It stops early at a building or wall.
 * Flyers aren't knocked back. Returns how far it actually moved.
 */
export function knockback(state, e, dx, dy, dist) {
  if (!e.alive || isAir(e) || !(dist > 0)) return 0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 0;
  dx /= len; dy /= len;
  const nav = getNav(state);
  const jumper = !!CONFIG.enemies[e.kind].jumpsWalls;
  let moved = 0;
  while (moved < dist - 1e-9) {
    const step = Math.min(KNOCK_STEP, dist - moved);
    const nx = e.x + dx * step, ny = e.y + dy * step;
    if (!standable(nav, nx, ny, jumper)) break;
    e.x = nx; e.y = ny; moved += step;
  }
  return moved;
}

/** Slow an enemy by `slow` (0.3 = 30% slower) for `seconds`; the strongest slow wins, the longest timer wins. */
export function applySlow(e, slow, seconds) {
  if (!e.alive || !(slow > 0)) return;
  e.slow = Math.max(e.slowTimer > 0 ? e.slow || 0 : 0, slow);
  e.slowTimer = Math.max(e.slowTimer || 0, seconds);
}

/** Stun: held in place, can't move or attack (same as being caught in a Mousetrap). */
export function applyStun(e, seconds) {
  if (!e.alive || !(seconds > 0)) return;
  e.held = Math.max(e.held || 0, seconds);
}

/**
 * Walk a ground enemy up to `step` tiles straight toward (tx, ty) (a Cheese Bait lure). Returns false when a
 * building or wall is in the way (the lure gives up on it) and true while it's moving or has arrived.
 */
export function walkToward(state, e, tx, ty, step) {
  const d = distance(e.x, e.y, tx, ty);
  if (d < 1e-6) return true;
  const k = Math.min(step, d) / d;
  const nx = e.x + (tx - e.x) * k, ny = e.y + (ty - e.y) * k;
  if (!standable(getNav(state), nx, ny, !!CONFIG.enemies[e.kind].jumpsWalls)) return false;
  e.x = nx; e.y = ny;
  return true;
}
