// Great Pyramid of Rah's Solar Lance (the merged Tower of Rah, CONFIG.merges.ra.lance; v0.10.2). Each of its beams that
// has heated up to `stage` (2 = x8, the top heat; Early Lance: 1 = x3) becomes a lance: a line from the tower's center
// through the beam's target out to the tower's range. Every other enemy (ground and air) whose center is within
// `halfWidth` tiles of that line takes `mult` x the beam's current tick (its heat, Hotter Peak and damage perks; the
// enemy's own mark is added by damageEnemy), source 'lance'. An enemy takes at most one lance hit per beam tick from a
// tower, even where two Prism lances cross it (b._lanceHits: enemy id -> time of its last lance hit, on the tower's own
// clock b._lanceClock; neither is saved). Blinding Light (lanceSlow) slows everything a lance touches, its target too,
// renewed every step for slowLinger s (bosses take bossShare of it, like a KSI chill).
// Chained beams never lance, and a lance hit or kill never sets off Afterburn, Cauterize or Supernova (beams.js only
// gives those to the beam's own target). beams.js stepBeams calls these, so the game and the headless simulation
// (both run simulate.js) lance the same way.
import { CONFIG } from '../config.js';
import { mergedConfigOf, masteryFxOf } from './buildings.js';
import { towerRange } from './abilities.js';
import { damageEnemy, applySlow, isBurrowedUnseen } from './combat.js';
import { distToSegment } from './wizardWall.js';
import { footprintCenter } from './grid.js';

/** A Great Pyramid's lance numbers right now ({ stage, halfWidth, mult, slow, bossShare, slowLinger }), or null for any other building. */
export function lanceStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.lance) return null;
  const L = m.lance, mfx = masteryFxOf(b);
  return {
    stage: mfx.lanceStage ?? L.stage,           // Early Lance
    halfWidth: mfx.lanceHalfWidth || L.halfWidth, // Wide Lance
    mult: mfx.lanceMult || L.mult,
    slow: mfx.lanceSlow || 0,                     // Blinding Light
    bossShare: L.bossShare, slowLinger: L.slowLinger
  };
}

/**
 * The lance's line in tiles, { x1, y1, x2, y2 }: from the tower's center through `target`, as long as the tower's range
 * (or to the target, if a held lock has it just past range). null when the target stands on the tower's center.
 */
export function lanceLine(b, target) {
  const c = footprintCenter(b);
  const dx = target.x - c.x, dy = target.y - c.y, d = Math.hypot(dx, dy);
  if (d < 1e-6) return null;
  const reach = Math.max(towerRange(b), d);
  return { x1: c.x, y1: c.y, x2: c.x + (dx / d) * reach, y2: c.y + (dy / d) * reach };
}

/** The enemies a lance passes through (centers within halfWidth of its line), apart from `exceptId` (its beam's target). */
export function lanceEnemies(state, line, halfWidth, exceptId = null) {
  return state.enemies.filter((e) => e.alive && e.id !== exceptId && !isBurrowedUnseen(e)
    && distToSegment(e.x, e.y, line.x1, line.y1, line.x2, line.y2) <= halfWidth);
}

/** Blinding Light: slow what a lance touches for the next slowLinger s (bosses: bossShare of it). */
export function blindEnemies(enemies, st) {
  if (!st.slow) return;
  for (const e of enemies) applySlow(e, st.slow * (CONFIG.enemies[e.kind]?.boss ? st.bossShare : 1), st.slowLinger);
}

/**
 * One beam tick's lance hits: `amount` to each enemy in `enemies` that this tower hasn't lanced in the last tick
 * (`tickTime` on the tower's clock; `tickInterval` the beam's).
 */
export function lanceHit(state, b, enemies, amount, tickTime, tickInterval) {
  const hits = b._lanceHits || (b._lanceHits = new Map());
  for (const e of enemies) {
    if (!e.alive) continue;
    const last = hits.get(e.id);
    if (last !== undefined && tickTime - last < tickInterval - 1e-6) continue;
    hits.set(e.id, tickTime);
    damageEnemy(state, e, amount, 'lance');
    if (state.gameOver) return;
  }
}

/** Forget lance hits older than a tick (keeps b._lanceHits small). */
export function pruneLanceHits(b, tickInterval) {
  const hits = b._lanceHits;
  if (!hits || !hits.size) return;
  for (const [id, t] of hits) if (b._lanceClock - t >= tickInterval) hits.delete(id);
}
