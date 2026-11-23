// KSI Frost Fortress's Shatter (the merged KSI Tower, CONFIG.merges.ksi.shatter; v0.8.11). Its bottles chill what they
// splash, like every KSI Tower; each enemy they chill is also marked (e.shatter, for as long as that chill lasts:
// e.shatterT). A marked enemy that dies while still marked (whatever kills it: this tower, another defense, a spell, a
// hero) bursts into ice shards: every enemy within `radius` tiles of it (ground and air) takes `mult` x one of the
// tower's bottles (at the time it was marked). A shard that kills another marked enemy shatters that one too, one step
// later, so a chain can run through a chilled crowd.
// Mastery: Bigger Burst (shatterRadiusAdd), Sharp Shards (shatterMult: 1.5), Splinter (shatterChill: the shards chill
// what they hit with the tower's own chill and mark it, so those enemies can shatter too).
// Bursts waiting to go off live in state.shatters (not saved; cleared when the wave ends) and the marks on the enemies.
// combat.js marks enemies (landSplash -> markShatter) and reports deaths (damageEnemy -> queueShatter); simulate.js
// runs stepShatters each step.
import { mergedConfigOf, masteryFxOf, typeConfig, mergeShotMult } from './buildings.js';
import { towerDamageMult } from './abilities.js';
import { areaDamage, chillEnemy, isBurrowedUnseen } from './combat.js';
import { distance } from './iso.js';
import { emit } from './util.js';

/** A Frost Fortress's Shatter numbers right now: { radius, damage, chill } (chill: Splinter), or null for any other building. */
export function shatterStats(b) {
  const m = mergedConfigOf(b);
  if (!m || !m.shatter) return null;
  const S = m.shatter, mfx = masteryFxOf(b);
  const lvl = typeConfig(b.type).levels[b.level - 1];
  const bottle = lvl ? lvl.damage * towerDamageMult(b) * mergeShotMult(b) : 0; // one of its bottles
  return { radius: S.radius + (mfx.shatterRadiusAdd || 0), damage: bottle * (mfx.shatterMult || S.mult), chill: !!mfx.shatterChill };
}

/** What a Frost Fortress's bottle carries (combat.js fireDefense): its tower, burst numbers, and the chill Splinter passes on. */
export function shatterFor(b, chill) {
  const st = shatterStats(b);
  if (!st) return null;
  return { sourceId: b.id, radius: st.radius, damage: st.damage, chill: st.chill ? chill : null };
}

/** Its bottle (or a Splinter shard) chilled `e` for `seconds`: it shatters if it dies before that runs out. */
export function markShatter(e, shatter, seconds) {
  if (!e.alive || !shatter || !(seconds > 0)) return;
  e.shatter = shatter;
  e.shatterT = Math.max(e.shatterT || 0, seconds);
}

/** `e` just died (combat.js damageEnemy): if it was still marked, its burst goes off on the next stepShatters. */
export function queueShatter(state, e) {
  if (!(e.shatterT > 0) || !e.shatter) return;
  e.shatterT = 0;
  (state.shatters || (state.shatters = [])).push({ ...e.shatter, x: e.x, y: e.y, fromId: e.id });
}

/** Every step: marks run down, and the bursts waiting go off (their kills queue the next ones). */
export function stepShatters(state, dt) {
  for (const e of state.enemies) if (e.shatterT > 0) e.shatterT = Math.max(0, e.shatterT - dt);
  if (!state.shatters || !state.shatters.length) return;
  const bursts = state.shatters;
  state.shatters = [];
  for (const s of bursts) {
    emit(state, 'enemyShattered', { sourceId: s.sourceId, x: s.x, y: s.y, radius: s.radius, fromId: s.fromId });
    const hit = state.enemies.filter((e) => e.alive && !isBurrowedUnseen(e) && distance(s.x, s.y, e.x, e.y) <= s.radius);
    for (const e of hit) {
      areaDamage(state, e, s.damage, 'shatter'); // (its death, if a marked one, queues the next burst)
      if (s.chill && e.alive) { chillEnemy(e, s.chill); markShatter(e, s, s.chill.seconds); } // Splinter
      if (state.gameOver) return;
    }
  }
}
