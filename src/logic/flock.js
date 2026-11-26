// F.L.O.C.K Tower: a support defense that never attacks. Every enemy within a standing tower's range is
//   - marked: it takes +markBonus% damage from every defense (projectiles, splash, Diddypult pools), and
//   - revealed: an invisible enemy (Mr. Least) shows up for good, so defenses can target it.
// Several towers don't stack: a marked enemy takes the strongest bonus among the towers covering it.
// Range and bonus grow with level (CONFIG.defenses.flock.levels).
// 'flockSpotted' fires when an enemy enters a tower's range while no other enemy was in it (its alert sound).
//
// RV Lab abilities: Exposer (markAdd, markSlow, exposedChance / exposedMult on marked enemies) and Commander
// (an aura on every other defense whose center is in range: auraFireRatePct, auraRangeAdd, auraDamagePct;
// the strongest tower's value of each wins). The aura is kept on each defense as b._aura (not saved).
import { levelStats, isDefense, mergedConfigOf } from './buildings.js';
import { abilityFx, towerRange } from './abilities.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { revealEnemy } from './enemies.js';
import { applySlow, SLOW_LINGER, enemyIsAir } from './combat.js';
import { emit } from './util.js';

/** A tower's reach in tiles at this level (measured from its footprint center), before abilities. */
export function flockRange(level) {
  return levelStats('flock', level).range;
}

/** Extra damage a marked enemy takes at this tower level, as a fraction (0.15 = +15%), before abilities. */
export function flockBonus(level) {
  return levelStats('flock', level).markBonus / 100;
}

export function flockMarkBonus(b) {
  return flockBonus(b.level) + ((abilityFx(b).markAdd || 0) + (mergedConfigOf(b)?.markAdd || 0)) / 100;
}

const AURA_KEYS = { auraFireRatePct: 'fireRatePct', auraRangeAdd: 'rangeAdd', auraDamagePct: 'damagePct', auraSeeInvisible: 'seeInvisible' };

/** Mark (and reveal) every enemy inside a tower's range; unmark the rest; set Commander auras. Runs every step. */
export function stepFlockTowers(state) {
  // A tower silenced by John Pork's call (b.silencedT, specialEnemies.js) marks, reveals and boosts nothing.
  const towers = state.buildings.filter((b) => b.type === 'flock' && !b.destroyed && !(b.silencedT > 0)).map((b) => {
    const fx = abilityFx(b);
    // (A F.L.O.C.K Mothership, the merged tower, marks a little stronger: CONFIG.merges.flock.markAdd.)
    return { b, fx, c: footprintCenter(b), range: towerRange(b), bonus: flockMarkBonus(b), seen: 0 };
  });
  for (const e of state.enemies) {
    if (!e.alive) continue;
    let best = 0, slow = 0, exposed = 0, exposedMult = 0, jam = 0, scramble = 0, linger = 0, execute = 0, bounty = 0, leech = 0, airJam = false;
    for (const t of towers) {
      if (distance(t.c.x, t.c.y, e.x, e.y) > t.range) continue;
      t.seen++;
      if (t.bonus > best) best = t.bonus;
      slow = Math.max(slow, t.fx.markSlow || 0);
      jam = Math.max(jam, t.fx.jam || 0);
      linger = Math.max(linger, t.fx.markLinger || 0);
      execute = Math.max(execute, t.fx.executeMark || 0);
      bounty = Math.max(bounty, t.fx.markBounty || 0);
      leech = Math.max(leech, t.fx.leechRp || 0);
      if (t.fx.airJam) airJam = true;
      scramble = Math.max(scramble, t.fx.scrambleSlow || 0);
      if ((t.fx.exposedChance || 0) > exposed) { exposed = t.fx.exposedChance; exposedMult = t.fx.exposedMult; }
    }
    // Drone Tail: a mark keeps following an enemy for a few seconds after it leaves range.
    if (best > 0 && linger > 0) { e.markLingerT = linger; e.lingerBonus = best; }
    if (best === 0 && e.markLingerT > 0) best = e.lingerBonus || 0;
    e.markBonus = best;
    e.flockSeen = best > 0;               // a tunneling Skibidi Toilet can be targeted and hit while seen
    e.markExecute = execute;              // Weak Point Scan
    e.markBounty = best > 0 ? bounty : 0; // Bounty Hunter
    e.leechRp = leech;                    // Data Leech
    e.airJammed = airJam;                 // Frequency Jam
    e.exposedChance = exposed;
    e.exposedMult = exposedMult;
    if (slow > 0) applySlow(e, slow, SLOW_LINGER);
    e.weaken = jam; // Hacker Jammer: deals less damage while in range
    if (scramble > 0 && enemyIsAir(e)) applySlow(e, scramble, SLOW_LINGER); // Signal Scramble
    if (best > 0 && e.hidden) revealEnemy(state, e);
  }
  for (const t of towers) {
    if (t.seen > 0 && !t.b.spotting) emit(state, 'flockSpotted', { id: t.b.id });
    t.b.spotting = t.seen > 0;
  }
  // Commander auras on the other defenses in range.
  const commanders = towers.filter((t) => Object.keys(AURA_KEYS).some((k) => t.fx[k]));
  for (const b of state.buildings) {
    if (!isDefense(b.type) || b.type === 'flock') continue;
    if (!commanders.length || b.destroyed) { if (b._aura) delete b._aura; continue; }
    const c = footprintCenter(b);
    let aura = null;
    for (const t of commanders) {
      if (distance(t.c.x, t.c.y, c.x, c.y) > t.range) continue;
      aura = aura || {};
      for (const [k, out] of Object.entries(AURA_KEYS)) if (t.fx[k]) aura[out] = Math.max(aura[out] || 0, t.fx[k]);
    }
    if (aura) b._aura = aura;
    else if (b._aura) delete b._aura;
  }
}
