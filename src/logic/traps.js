// Mousetraps: hidden 1-tile traps. Enemies can't see them, so they never target them, never path around
// them and walk right over them (traps can't be damaged). The first ground enemy to step onto a set trap
// springs it: every ground enemy within its catch radius takes its damage and is held in place (can't
// move or attack) for its hold time. Flyers are never caught. A sprung trap stays sprung for the rest of
// the wave and resets when the wave is cleared.
import { CONFIG } from '../config.js';
import { levelStats } from './buildings.js';
import { footprintCenter, isInsideFootprint } from './grid.js';
import { distance } from './iso.js';
import { damageEnemy } from './combat.js';
import { emit, isWaveActive } from './util.js';

/** Is this a trap type (hidden from enemies, sprung by walking onto it)? */
export function isTrap(type) {
  const cfg = CONFIG.defenses[type];
  return !!(cfg && cfg.trap);
}

/** Damage and hold time (s) of a trap at this level. */
export function trapStats(type, level) {
  const l = levelStats(type, level);
  return { damage: l.damage, hold: l.hold, radius: CONFIG.defenses[type].range };
}

const groundEnemy = (e) => e.alive && CONFIG.enemies[e.kind].type !== 'air' && !(e.landing > 0);

/** Spring any set trap a ground enemy is standing on. */
export function stepTraps(state) {
  if (!isWaveActive(state)) return;
  for (const b of state.buildings) {
    if (!isTrap(b.type) || b.destroyed || b.sprung) continue;
    const trigger = state.enemies.find((e) => groundEnemy(e) && isInsideFootprint(b, e.x, e.y));
    if (!trigger) continue;
    springTrap(state, b);
  }
}

/** Snap a trap: damage and hold every ground enemy within its catch radius. */
export function springTrap(state, b) {
  const { damage, hold, radius } = trapStats(b.type, b.level);
  const c = footprintCenter(b);
  b.sprung = true;
  const caught = state.enemies.filter((e) => groundEnemy(e) && distance(c.x, c.y, e.x, e.y) <= radius);
  emit(state, 'trapSprung', { id: b.id, x: c.x, y: c.y, radius, caught: caught.map((e) => e.id) });
  for (const e of caught) {
    e.held = Math.max(e.held || 0, hold);
    damageEnemy(state, e, damage, 'trap');
  }
}

/** The wave is over: every trap is set again. */
export function resetTraps(state) {
  for (const b of state.buildings) if (isTrap(b.type)) b.sprung = false;
}
