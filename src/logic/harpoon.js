// Harpoon Ballista's Reel In (the merged Spear Thrower, CONFIG.merges.spear.harpoon; v0.8.3). Like the Locklair Citadel's
// Ballista Bolt it counts its throws: every `every`th throw (b.harpoonCount) is a harpoon. Instead of its usual target it
// throws at the toughest enemy in range (the most current health, ground or air, only ones it can target), with the
// spear's normal (merged) damage and line. When the harpoon hits that enemy, it hooks it and drags it `pull` tiles back
// the way it came (the opposite of its movement, e.vx / e.vy; away from the tower when it's standing still) over
// `pullSeconds`. The drag interrupts it (held while dragged, so a dashing Quandale Dingle's dash ends with no impact).
// Ground enemies are shoved with knockback, which stops at walls and buildings (and ends the drag there); flyers glide.
// Bosses (Da Baby Car) are never dragged: they're slowed (bossSlow for bossSlowSeconds).
// Mastery: Longer Chain (harpoonPullAdd: a longer drag), Dragnet (harpoonDrag: enemies within dragRadius of the dragged
// one take that share of the harpoon's hit, once per harpoon each), Double Hook (harpoonHooks: 2, the two toughest).
// The drag lives on the enemy (e.reelT, e.reelLeft, e.reelDx / e.reelDy...): never saved, gone when the wave ends
// (the enemies are cleared). combat.js shoot() calls harpoonDue / throwHarpoons, and its spear line calls hookEnemy.
import { CONFIG } from '../config.js';
import { mergedConfigOf, masteryFxOf } from './buildings.js';
import { validTargets, damageEnemy, applySlow, fireDefense, enemyIsAir } from './combat.js';
import { applyStun, knockback, moveToward } from './motion.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { emit } from './util.js';

/** A Harpoon Ballista's harpoon numbers right now: { every, pull, pullSeconds, hooks, dragShare, dragRadius, bossSlow, bossSlowSeconds }. */
export function harpoonStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.harpoon) return null;
  const H = m.harpoon, mfx = masteryFxOf(b);
  return {
    every: H.every, pull: H.pull + (mfx.harpoonPullAdd || 0), pullSeconds: H.pullSeconds,
    hooks: Math.max(1, mfx.harpoonHooks || 1), dragShare: mfx.harpoonDrag || 0, dragRadius: H.dragRadius ?? 0.6,
    bossSlow: H.bossSlow, bossSlowSeconds: H.bossSlowSeconds
  };
}

/** The `n` toughest enemies it can target now (most current health first). */
export function harpoonTargets(state, b, n = 1) {
  return validTargets(state, b).sort((p, q) => q.hp - p.hp).slice(0, n);
}

/** Count this throw; true when it's a harpoon (every `every`th throw of a Harpoon Ballista). */
export function harpoonDue(b) {
  const st = harpoonStats(b);
  if (!st) return false;
  b.harpoonCount = (b.harpoonCount || 0) + 1;
  if (b.harpoonCount < st.every) return false;
  b.harpoonCount = 0;
  return true;
}

/** Throw the harpoon(s): a spear at each of the toughest enemies (Double Hook: two). Returns the spears thrown. */
export function throwHarpoons(state, b, mult, extra = {}) {
  const st = harpoonStats(b);
  if (!st) return [];
  return harpoonTargets(state, b, st.hooks).map((t) =>
    fireDefense(state, b, t, { ...extra, damageMult: mult, harpoon: { ...st, sourceId: b.id, targetId: t.id } }));
}

/**
 * The harpoon hit its enemy (`hit`: the damage it dealt): hook it and start the drag, or slow a boss. Emits 'harpoonHit'
 * { sourceId, targetId, x, y, boss }. Returns true if it's being dragged.
 */
export function hookEnemy(state, h, e, hit = 0) {
  if (!e || !e.alive) return false;
  const boss = !!CONFIG.enemies[e.kind].boss;
  if (boss) applySlow(e, h.bossSlow, h.bossSlowSeconds);
  else {
    // Back the way it came; standing still: away from the tower.
    let dx = -(e.vx || 0), dy = -(e.vy || 0);
    if (Math.hypot(dx, dy) < 0.05) {
      const src = state.buildings.find((x) => x.id === h.sourceId);
      const c = src ? footprintCenter(src) : { x: e.x - 1, y: e.y };
      dx = e.x - c.x; dy = e.y - c.y;
    }
    const len = Math.hypot(dx, dy) || 1;
    Object.assign(e, {
      reelT: h.pullSeconds, reelLeft: h.pull, reelRate: h.pull / h.pullSeconds, reelDx: dx / len, reelDy: dy / len,
      reelSourceId: h.sourceId, reelDrag: h.dragShare * hit, reelDragRadius: h.dragRadius, reelHitIds: []
    });
    applyStun(e, h.pullSeconds); // dragged: no walking or attacking meanwhile (and a dash ends with no impact)
  }
  emit(state, 'harpoonHit', { sourceId: h.sourceId, targetId: e.id, x: e.x, y: e.y, boss });
  return !boss;
}

/** Stop dragging this enemy. */
export function endReel(e) {
  e.reelT = 0; e.reelLeft = 0; e.reelHitIds = null;
}

/** Every step: hooked enemies are dragged along (Dragnet: hurting the enemies they're dragged through). */
export function stepHarpoons(state, dt) {
  for (const e of state.enemies) {
    if (!(e.reelT > 0)) continue;
    if (!e.alive) { endReel(e); continue; }
    const want = Math.min(e.reelRate * dt, e.reelLeft);
    let moved = want;
    if (enemyIsAir(e)) moveToward(e, e.x + e.reelDx * want, e.y + e.reelDy * want, want);
    else moved = knockback(state, e, e.reelDx, e.reelDy, want); // stops at walls and buildings
    e.reelLeft -= want;
    e.reelT -= dt;
    if (e.reelDrag > 0) {
      for (const o of state.enemies) {
        if (o === e || !o.alive || e.reelHitIds.includes(o.id) || distance(e.x, e.y, o.x, o.y) > e.reelDragRadius) continue;
        e.reelHitIds.push(o.id);
        damageEnemy(state, o, e.reelDrag, 'spear');
        if (state.gameOver) return;
      }
    }
    if (moved < want - 1e-6 || e.reelLeft <= 1e-6 || e.reelT <= 0) endReel(e);
  }
}
