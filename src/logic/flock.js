// F.L.O.C.K Tower: a support defense that never attacks. Every enemy within a standing tower's range is
//   - marked: it takes +markBonus% damage from every defense (projectiles, splash, Diddypult pools), and
//   - revealed: an invisible enemy (Goyum Goblin) shows up for good, so defenses can target it.
// Several towers don't stack: a marked enemy takes the strongest bonus among the towers covering it.
// Range and bonus grow with level (CONFIG.defenses.flock.levels).
// 'flockSpotted' fires when an enemy enters a tower's range while no other enemy was in it (its alert sound).
import { levelStats } from './buildings.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { revealEnemy } from './enemies.js';
import { emit } from './util.js';

/** A tower's reach in tiles at this level (measured from its footprint center). */
export function flockRange(level) {
  return levelStats('flock', level).range;
}

/** Extra damage a marked enemy takes at this tower level, as a fraction (0.15 = +15%). */
export function flockBonus(level) {
  return levelStats('flock', level).markBonus / 100;
}

/** Mark (and reveal) every enemy inside a tower's range; unmark the rest. Runs every step. */
export function stepFlockTowers(state) {
  const towers = state.buildings.filter((b) => b.type === 'flock' && !b.destroyed)
    .map((b) => ({ b, c: footprintCenter(b), range: flockRange(b.level), bonus: flockBonus(b.level), seen: 0 }));
  for (const e of state.enemies) {
    if (!e.alive) continue;
    let best = 0;
    for (const t of towers) {
      if (distance(t.c.x, t.c.y, e.x, e.y) > t.range) continue;
      t.seen++;
      if (t.bonus > best) best = t.bonus;
    }
    e.markBonus = best;
    if (best > 0 && e.hidden) revealEnemy(state, e);
  }
  for (const t of towers) {
    if (t.seen > 0 && !t.b.spotting) emit(state, 'flockSpotted', { id: t.b.id });
    t.b.spotting = t.seen > 0;
  }
}
