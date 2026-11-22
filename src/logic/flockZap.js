// F.L.O.C.K Mothership's Triple Zap (the merged F.L.O.C.K Tower, CONFIG.merges.flock.zap; v0.8.2): the support tower
// that fights back, like a tesla coil. On top of marking (its marks are a little stronger, merges.flock.markAdd), every
// `every` s it zaps the `targets` closest enemies within `range` tiles (ground and air) at once, `damage` each. Its own
// mark makes the zaps hit harder (damageEnemy adds the mark bonus). Silenced by John Pork's call or stunned: no zaps.
// Mastery: Fourth Bolt (zapTargets: 4), Overcharge (zapLowMult: more damage to enemies under half health), EMP Pulse
// (every empEvery s, stuns every enemy in zap range for empSeconds; bosses are only slowed).
import { CONFIG } from '../config.js';
import { mergedConfigOf, masteryFxOf } from './buildings.js';
import { validTargets, damageEnemy, applySlow } from './combat.js';
import { applyStun } from './motion.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { emit } from './util.js';

/** A Mothership's zap numbers right now: { every, range, damage, targets, lowMult, empEvery, empSeconds, bossSlow }. */
export function zapStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.zap) return null;
  const Z = m.zap, mfx = masteryFxOf(b);
  return {
    every: Z.every, range: Z.range, damage: Z.damage, targets: Math.max(Z.targets, mfx.zapTargets || 0),
    lowMult: mfx.zapLowMult || 1, empEvery: mfx.empEvery || 0, empSeconds: mfx.empSeconds || 0, bossSlow: Z.bossSlow
  };
}

/** The enemies it would zap now: the `targets` closest it can hit within its zap range (closest first). */
export function zapTargets(state, b, st = zapStats(b)) {
  if (!st) return [];
  const c = footprintCenter(b);
  return validTargets(state, b)
    .map((e) => ({ e, d: distance(c.x, c.y, e.x, e.y) }))
    .filter((t) => t.d <= st.range)
    .sort((p, q) => p.d - q.d)
    .slice(0, st.targets)
    .map((t) => t.e);
}

/** Zap now (if anything is in zap range). Returns the enemies zapped. */
export function zap(state, b) {
  const st = zapStats(b);
  const hits = zapTargets(state, b, st);
  if (!hits.length) return [];
  for (const e of hits) {
    const low = e.hp < (e.maxHp || e.hp) / 2;
    damageEnemy(state, e, st.damage * (low ? st.lowMult : 1)); // (a normal hit: armor and marks apply)
  }
  emit(state, 'flockZap', { sourceId: b.id, hits: hits.map((e) => ({ id: e.id, x: e.x, y: e.y })) });
  return hits;
}

/** EMP Pulse: stun every enemy in zap range (bosses slowed). Returns how many it caught. */
export function empPulse(state, b) {
  const st = zapStats(b);
  if (!st || !st.empEvery) return 0;
  const c = footprintCenter(b);
  let n = 0;
  for (const e of validTargets(state, b)) {
    if (distance(c.x, c.y, e.x, e.y) > st.range) continue;
    if (CONFIG.enemies[e.kind].boss) applySlow(e, st.bossSlow, st.empSeconds);
    else applyStun(e, st.empSeconds);
    n++;
  }
  if (n) emit(state, 'flockEmp', { sourceId: b.id, x: c.x, y: c.y, radius: st.range });
  return n;
}

/** Every step: each Mothership charges and zaps (and, with EMP Pulse, pulses). */
export function stepFlockZaps(state, dt) {
  for (const b of state.buildings) {
    if (b.destroyed || !b.merged || b.type !== 'flock' || !mergedConfigOf(b)?.zap) continue;
    if (b.stunT > 0 || b.silencedT > 0) continue;
    const st = zapStats(b);
    b.zapT = (b.zapT || 0) + dt;
    if (b.zapT >= st.every && zap(state, b).length) b.zapT = 0;
    if (st.empEvery) {
      b.empT = (b.empT || 0) + dt;
      if (b.empT >= st.empEvery && empPulse(state, b)) b.empT = 0;
    }
  }
}
