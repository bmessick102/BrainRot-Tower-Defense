// Gandolf the Grand's "You Shall Not Pass" (the merged Gandolf Tower, CONFIG.merges.wizard.wall; v0.8.2). Every
// `every` s, when a ground enemy is in range, he slams his staff and raises a glowing barrier across the enemies' way
// for `seconds`: a straight wall `length` tiles long across the way the biggest ground crowd in range is walking (toward
// the tower when it's standing still), `ahead` tiles in front of it (never nearer the tower than `minFromTower`). Ground
// troops that touch it
// (within `thickness` of the wall) can't get through: they're held there (applyStun, a short `linger` renewed every
// step), so they pile up against it, right where his splash fireballs hit hardest. Bosses (Da Baby Car) are only
// slowed (`bossSlow`). Flyers fly over it; burrowed tunnelers pass under it.
// Mastery: Wider Wall (wallLengthAdd, wallSecondsAdd), Searing Ward (wallBurn: enemies held at a wall burn for that
// share of his fireball's damage every second), Double Cast (walls: 2, the second closes in behind the crowd, so it's
// trapped between the two). Walls live in state.barriers (not saved; cleared when the wave ends).
import { CONFIG } from '../config.js';
import { mergedConfigOf, masteryFxOf, typeConfig, mergeShotMult } from './buildings.js';
import { towerDamageMult } from './abilities.js';
import { validTargets, applySlow, isBurrowedUnseen, damageEnemy } from './combat.js';
import { applyStun } from './motion.js';
import { netSpots } from './skyNet.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { emit, nextId } from './util.js';

/** Gandolf the Grand's wall numbers right now: { every, seconds, length, thickness, count, burnDps }. */
export function wallStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.wall) return null;
  const W = m.wall, mfx = masteryFxOf(b);
  const lvl = typeConfig(b.type).levels[b.level - 1];
  const shot = lvl ? lvl.damage * towerDamageMult(b) * mergeShotMult(b) : 0; // one of his fireballs
  return {
    every: W.every, seconds: W.seconds + (mfx.wallSecondsAdd || 0), length: W.length + (mfx.wallLengthAdd || 0),
    thickness: W.thickness, ahead: W.ahead, minFromTower: W.minFromTower, linger: W.linger, bossSlow: W.bossSlow,
    count: Math.max(1, mfx.walls || 1), burnDps: (mfx.wallBurn || 0) * shot
  };
}

/** Can the wall stop this enemy? Ground troops only (not flyers, not a tunneler out of sight). */
function blockable(e) {
  if (!e.alive || isBurrowedUnseen(e)) return false;
  return CONFIG.enemies[e.kind].type !== 'air';
}

/** Distance from (px, py) to the segment (x1, y1)-(x2, y2). */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Where the wall(s) go for a crowd at `spot` near a tower centered at `c`: [{ x1, y1, x2, y2 }]. `heading` is the way
 * the crowd walks ({ x, y }, any length); without one (standing still) it's toward the tower. The first wall is `ahead`
 * tiles in front of the crowd (pulled back so it stays at least `minFromTower` from the tower); with Double Cast the
 * second is the same distance behind the crowd.
 */
export function wallLines(spot, c, st, heading = null) {
  let dx = heading ? heading.x : c.x - spot.x, dy = heading ? heading.y : c.y - spot.y;
  if (Math.hypot(dx, dy) < 1e-6) { dx = c.x - spot.x; dy = c.y - spot.y; }
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;                                   // the way the crowd is going
  const px = -dy, py = dx, half = st.length / 2;      // along the wall
  let ahead = st.ahead;
  while (ahead > 0 && distance(spot.x + dx * ahead, spot.y + dy * ahead, c.x, c.y) < st.minFromTower) ahead = Math.max(0, ahead - 0.25);
  const centers = [{ x: spot.x + dx * ahead, y: spot.y + dy * ahead }];
  if (st.count > 1) centers.push({ x: spot.x - dx * st.ahead, y: spot.y - dy * st.ahead });
  return centers.map((m) => ({ x1: m.x - px * half, y1: m.y - py * half, x2: m.x + px * half, y2: m.y + py * half }));
}

/** Raise this Gandolf the Grand's wall(s) now, if a ground enemy is in range. Returns the walls raised. */
export function raiseWalls(state, b) {
  const st = wallStats(b);
  if (!st) return [];
  const targets = validTargets(state, b).filter(blockable);
  if (!targets.length) return [];
  const c = footprintCenter(b);
  const [spot] = netSpots(targets, 1.5, 1, c); // the biggest ground crowd in range
  // The way it's walking: the crowd's average step (vx / vy, set as enemies move); none if it's standing still.
  const crowd = targets.filter((e) => distance(spot.x, spot.y, e.x, e.y) <= 1.5);
  const hx = crowd.reduce((a, e) => a + (e.vx || 0), 0), hy = crowd.reduce((a, e) => a + (e.vy || 0), 0);
  const heading = Math.hypot(hx, hy) > 0.05 * crowd.length ? { x: hx, y: hy } : null;
  if (!state.barriers) state.barriers = [];
  const out = [];
  for (const line of wallLines(spot, c, st, heading)) {
    const w = { id: nextId(state, 'wall'), sourceId: b.id, ...line, t: st.seconds, seconds: st.seconds, thickness: st.thickness,
      linger: st.linger, bossSlow: st.bossSlow, burnDps: st.burnDps, held: [] };
    state.barriers.push(w);
    out.push(w);
  }
  emit(state, 'wallRaised', { sourceId: b.id, walls: out.map((w) => ({ id: w.id, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 })), seconds: st.seconds });
  return out;
}

/** Every step: Gandolfs the Grand charge and raise their walls; standing walls stop the ground troops touching them. */
export function stepWizardWalls(state, dt) {
  for (const b of state.buildings) {
    if (b.destroyed || !b.merged || b.type !== 'wizard' || !mergedConfigOf(b)?.wall) continue;
    if (b.stunT > 0 || b.silencedT > 0) continue;
    b.wallT = (b.wallT || 0) + dt;
    if (b.wallT >= mergedConfigOf(b).wall.every && raiseWalls(state, b).length) b.wallT = 0;
  }
  if (!state.barriers || !state.barriers.length) return;
  for (const w of state.barriers) {
    w.t -= dt;
    const held = [];
    for (const e of state.enemies) {
      if (!blockable(e) || distToSegment(e.x, e.y, w.x1, w.y1, w.x2, w.y2) > w.thickness) continue;
      held.push(e.id);
      if (CONFIG.enemies[e.kind].boss) applySlow(e, w.bossSlow, w.linger); // bosses: slowed, never stopped
      else applyStun(e, w.linger);                                          // held at the wall (renewed every step)
      if (w.burnDps > 0) damageEnemy(state, e, w.burnDps * dt, 'pool');    // Searing Ward
    }
    w.held = held;
  }
  state.barriers = state.barriers.filter((w) => w.t > 0);
}
