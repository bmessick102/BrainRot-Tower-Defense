// Diddy Trebuchet's Barrel Burst (the merged Diddypult, CONFIG.merges.catapult.barrelBurst; v0.9.1). Every shot is a
// giant barrel (x2 damage, impact and pool, like every merged defense). Where it lands it bursts: its oil pool appears as
// usual, and `jugs` oil jugs fly `distance` tiles out on the grid's diagonals (a + on the isometric screen; 6 jugs with
// More Jugs, evenly spread). They land `delay` s later: each hits for `mult` of the barrel's hit (normal size even when
// the barrel is a Big Jug; Splash Zone counts, so jugs landing in the barrel's pool hit harder) and leaves its own
// `poolRadius`-tile pool with the barrel's pool damage and slow (Toxic Fumes too). The jugs carry none of the barrel's
// on-hit perks: Hangover, Concussion and Pressure Cap only come from the barrel's impact. A jug that lands where no enemy
// is still leaves its pool.
// The barrel's pool and its jugs' pools share a `group` (the barrel's id) and tick together, so an enemy standing in
// several of them takes one pool's damage per tick (combat.js stepPools): the ability adds coverage, not burst damage.
// Mastery: More Jugs (barrelJugs 6), Wide Spray (jugDistance 3, jugPoolRadius 1.25), Tar Pit (the barrel's own pool:
// tarSlow 0.6, tarSeconds 10).
// Jugs in the air live in state.jugs (not saved; cleared when the wave ends). combat.js starts a burst when a barrel
// lands (burstBarrel); simulate.js runs stepJugs each step.
import { MAP } from '../mapTiles.js';
import { mergedConfigOf, masteryFxOf } from './buildings.js';
import { applySplash, createPool } from './combat.js';
import { gridToScreen } from './iso.js';
import { emit } from './util.js';

/** A Diddy Trebuchet's Barrel Burst numbers right now, or null for any other building. */
export function barrelStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.barrelBurst) return null;
  const B = m.barrelBurst, mfx = masteryFxOf(b);
  return {
    jugs: mfx.barrelJugs || B.jugs,
    distance: mfx.jugDistance || B.distance,
    delay: B.delay,
    mult: B.mult,
    poolRadius: mfx.jugPoolRadius || B.poolRadius,
    tarSlow: mfx.tarSlow || 0,
    tarSeconds: mfx.tarSeconds || 0
  };
}

/**
 * Where `n` jugs land around (x, y), `dist` tiles out: on the grid's diagonals first (they read as a + on screen),
 * evenly spread. A spot off the map picture is pulled back toward the impact until it's on it.
 */
export function jugSpots(x, y, n, dist) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 4 + (i * 2 * Math.PI) / n;
    let t = 1, jx, jy;
    do {
      jx = x + Math.cos(a) * dist * t; jy = y + Math.sin(a) * dist * t;
      const s = gridToScreen(jx, jy);
      if (s.x >= 0 && s.y >= 0 && s.x <= MAP.imageWidth && s.y <= MAP.imageHeight) break;
      t -= 0.25;
    } while (t > 0);
    out.push({ x: jx, y: jy });
  }
  return out;
}

/** What a barrel carries (combat.js fireDefense): its burst, worked out when it's fired. `jugDamage` is a normal barrel's hit x mult. */
export function barrelFor(b, normalDamage, pool) {
  const st = barrelStats(b);
  if (!st || !pool) return null;
  return { sourceId: b.id, jugs: st.jugs, distance: st.distance, delay: st.delay, jugDamage: normalDamage * st.mult, jugPool: { ...pool, radius: st.poolRadius, grow: 0 } };
}

/** The Tar Pit Mastery on a barrel's own pool: slower and longer. */
export function tarPool(b, pool) {
  const st = barrelStats(b);
  if (!st || !pool || !(st.tarSeconds > 0)) return pool;
  return { ...pool, slow: Math.max(pool.slow, st.tarSlow), duration: Math.max(pool.duration, st.tarSeconds) };
}

/**
 * A barrel `p` just landed at (x, y) and left its pool (group = p.id): it bursts. Its jugs are thrown now and land
 * `delay` s later (stepJugs). Emits 'barrelBurst' with the spots (GameScene: planks, then the jugs' arcs).
 */
export function burstBarrel(state, p, x, y) {
  const B = p.barrel;
  if (!B) return;
  const spots = jugSpots(x, y, B.jugs, B.distance);
  if (!state.jugs) state.jugs = [];
  for (const s of spots) {
    state.jugs.push({ x: s.x, y: s.y, fromX: x, fromY: y, t: B.delay, damage: B.jugDamage, pool: B.jugPool, group: p.id, sourceId: B.sourceId, fx: p.fx && p.fx.poolBonus ? { poolBonus: p.fx.poolBonus } : {} });
  }
  emit(state, 'barrelBurst', { sourceId: B.sourceId, x, y, delay: B.delay, jugs: spots });
}

/** Every step: jugs in the air come down, hit what's there and leave their pools. */
export function stepJugs(state, dt) {
  if (!state.jugs || !state.jugs.length) return;
  const landing = [];
  for (const j of state.jugs) { j.t -= dt; if (j.t <= 1e-9) landing.push(j); }
  if (!landing.length) return;
  state.jugs = state.jugs.filter((j) => j.t > 1e-9);
  for (const j of landing) {
    emit(state, 'jugLanded', { sourceId: j.sourceId, x: j.x, y: j.y, radius: j.pool.radius });
    // Splash Zone: a jug hits enemies already in a pool harder (its only perk).
    const perEnemy = j.fx.poolBonus ? (e) => (e.inPoolT > 0 ? 1 + j.fx.poolBonus : 1) : undefined;
    applySplash(state, j.x, j.y, j.pool.radius, j.damage, true, false, 'jug', { source: 'jug', perEnemy });
    if (state.gameOver) return;
    // Its pool ticks with the barrel's (same group), so the two never both hurt the same enemy in a tick.
    const main = (state.pools || []).find((q) => q.group === j.group);
    const pool = createPool(state, j.x, j.y, { ...j.pool, group: j.group }, 'catapult');
    if (main) pool.tick = main.tick;
  }
}
