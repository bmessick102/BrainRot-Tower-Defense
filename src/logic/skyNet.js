// Missile Silo's Sky Net (the merged Firework Launcher, CONFIG.merges.firework.net; v0.8). Every `every` s, on top of
// its normal rockets, it fires a net rocket at the spot in range that covers the most flyers it could shoot (and ground
// troops too with Ground Show, fx.groundDamage). After `flightTime` the net opens there for `seconds`: every enemy of
// those layers inside `radius` is slowed by `slow` (applySlow: the strongest slow wins, so it never stacks with pools,
// glue or a Frigo Camillo) and pulled toward the middle (at most `pull` tiles over the whole net; flyers glide, ground
// troops are shoved and stop at walls and buildings). Bosses (Da Baby Car) are slowed, never pulled. A flyer chasing a
// Decoy Flare or knocked down by Grounding Burst is still caught (the pull just adds to where it's going).
// Mastery: Wider Net (netRadiusAdd), Tangled (netVuln: more damage from everything while caught), Double Net (nets: 2,
// the two biggest different groups). Nets live in state.nets (not saved; cleared when the wave ends).
import { CONFIG } from '../config.js';
import { mergedConfigOf, masteryFxOf } from './buildings.js';
import { abilityFx } from './abilities.js';
import { validTargets, enemyIsAir, applySlow, applyVuln, isBurrowedUnseen } from './combat.js';
import { knockback, moveToward } from './motion.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { emit, nextId } from './util.js';

/** A Missile Silo's net numbers right now: { radius, seconds, pull, slow, vuln, count, ground }. */
export function netStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.net) return null;
  const N = m.net, mfx = masteryFxOf(b);
  return {
    radius: N.radius + (mfx.netRadiusAdd || 0), seconds: N.seconds, pull: N.pull, slow: N.slow, linger: N.linger,
    vuln: mfx.netVuln || 0, count: Math.max(1, mfx.nets || 1), ground: !!abilityFx(b).groundDamage, every: N.every, flightTime: N.flightTime
  };
}

/** Can the net catch this enemy? Flyers always (a downed flyer too); ground troops only with Ground Show. */
function catchable(e, ground) {
  if (!e.alive || isBurrowedUnseen(e)) return false;
  return CONFIG.enemies[e.kind].type === 'air' || ground;
}

/**
 * Up to `count` net spots: each the position of an enemy whose `radius` circle covers the most of `targets`; the next
 * spot only counts enemies the earlier nets don't cover (a different group). Ties go to the spot nearer `from`.
 * Returns [{ x, y, covered }].
 */
export function netSpots(targets, radius, count = 1, from = null) {
  const spots = [], taken = new Set();
  for (let k = 0; k < count; k++) {
    let best = null, bestN = 0, bestD = Infinity;
    for (const c of targets) {
      if (taken.has(c)) continue;
      let n = 0;
      for (const e of targets) if (!taken.has(e) && distance(c.x, c.y, e.x, e.y) <= radius) n++;
      const d = from ? distance(from.x, from.y, c.x, c.y) : 0;
      if (n > bestN || (n === bestN && d < bestD)) { best = c; bestN = n; bestD = d; }
    }
    if (!best) break;
    const covered = targets.filter((e) => !taken.has(e) && distance(best.x, best.y, e.x, e.y) <= radius);
    for (const e of covered) taken.add(e);
    spots.push({ x: best.x, y: best.y, covered: covered.length });
  }
  return spots;
}

/** Fire this Missile Silo's net(s) now, if anything it can catch is in range. Returns the nets fired. */
export function fireNets(state, b) {
  const st = netStats(b);
  if (!st) return [];
  const targets = validTargets(state, b).filter((e) => catchable(e, st.ground));
  if (!targets.length) return [];
  const c = footprintCenter(b);
  if (!state.nets) state.nets = [];
  const out = [];
  for (const s of netSpots(targets, st.radius, st.count, c)) {
    const net = {
      id: nextId(state, 'net'), sourceId: b.id, x: s.x, y: s.y, fromX: c.x, fromY: c.y, delay: st.flightTime, flightTime: st.flightTime, t: st.seconds, seconds: st.seconds,
      radius: st.radius, pullRate: st.pull / st.seconds, slow: st.slow, linger: st.linger, vuln: st.vuln, ground: st.ground, caught: []
    };
    state.nets.push(net);
    out.push(net);
    emit(state, 'netFired', { id: net.id, sourceId: b.id, fromX: c.x, fromY: c.y, x: s.x, y: s.y, flightTime: st.flightTime, radius: st.radius });
  }
  return out;
}

/** Every step: Missile Silos charge and fire their nets; open nets slow and pull what's inside. */
export function stepSkyNets(state, dt) {
  for (const b of state.buildings) {
    if (b.destroyed || !b.merged || b.type !== 'firework' || !mergedConfigOf(b)?.net) continue;
    if (b.stunT > 0 || b.silencedT > 0) continue;
    b.netT = (b.netT || 0) + dt;
    if (b.netT >= mergedConfigOf(b).net.every && fireNets(state, b).length) b.netT = 0;
  }
  if (!state.nets || !state.nets.length) return;
  const core = CONFIG.merges.firework.net.coreRadius || 0.2;
  for (const n of state.nets) {
    if (n.delay > 0) {
      n.delay -= dt;
      if (n.delay > 0) continue;
      emit(state, 'netOpened', { id: n.id, x: n.x, y: n.y, radius: n.radius, seconds: n.seconds });
    }
    n.t -= dt;
    const caught = [];
    for (const e of state.enemies) {
      if (!catchable(e, n.ground) || distance(n.x, n.y, e.x, e.y) > n.radius) continue;
      caught.push(e.id);
      applySlow(e, n.slow, n.linger);              // slows never stack: the strongest wins
      if (n.vuln) applyVuln(e, n.vuln, n.linger);   // Tangled
      if (CONFIG.enemies[e.kind].boss) continue;    // bosses: slowed, never pulled
      const d = distance(n.x, n.y, e.x, e.y);
      const step = Math.min(n.pullRate * dt, Math.max(0, d - core));
      if (step <= 0) continue;
      if (enemyIsAir(e) || CONFIG.enemies[e.kind].type === 'air') moveToward(e, n.x, n.y, step); // flyers glide in
      else knockback(state, e, n.x - e.x, n.y - e.y, step);                                     // ground troops: stopped by walls
    }
    n.caught = caught;
  }
  state.nets = state.nets.filter((n) => n.t > 0);
}
