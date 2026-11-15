// DJ Babyface: a utility building (CONFIG.dj, limit 1, from Village Hall 5). Three things, all inside its
// range (its level's `range`, in tiles from its center):
//   - Work playlist: gnomes mining or repairing a building in range work gnomeBoostPct% faster.
//   - Drop the Beat: every enemy defeated (anywhere, during a wave) fills its hype meter (a packed enemy fills
//     it as many times as it stands for). Full (hypeNeeded), the player clicks the booth during a wave and every
//     defense in range fires beatPct% faster for beatSeconds. The meter keeps its charge between waves.
//   - Light show: while it's dark, enemies in range aren't restless (no night damage or speed bonus; the night
//     loot bonus still applies). See enrage.js.
import { levelStats, maxHp } from './buildings.js';
import { abilityFx } from './abilities.js';
import { applyStun, applySlow, knockback } from './motion.js';
import { damageEnemy } from './combat.js';
import { isAirKind } from './enemies.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { emit, isWaveActive } from './util.js';
import { isDark } from './clockLight.js';

/** Standing DJ booths. */
export function djBooths(state) {
  return state.buildings.filter((b) => b.type === 'dj' && !b.destroyed);
}

/**
 * A booth's numbers at its level, with its perks (RV Lab): range (+Wall of Sound), gnomeBoostPct (+Crowd
 * Pleaser), hypeNeeded (-Hype Man), beatSeconds (+Long Mix), beatPct (+Festival).
 */
export function djStats(b) {
  const l = levelStats('dj', b.level);
  const fx = abilityFx(b);
  return {
    range: l.range + (fx.rangeAdd || 0),
    gnomeBoostPct: l.gnomeBoostPct + (fx.gnomeBoostAdd || 0),
    hypeNeeded: Math.max(1, Math.round(l.hypeNeeded * (1 + (fx.hypeNeededPct || 0) / 100))),
    beatSeconds: l.beatSeconds + (fx.beatSecondsAdd || 0),
    beatPct: l.beatPct + (fx.beatPctAdd || 0)
  };
}

/** Is point (x, y) inside this booth's range? */
function inRange(b, x, y) {
  const c = footprintCenter(b);
  return distance(c.x, c.y, x, y) <= djStats(b).range;
}

/** Is any part of building `t` inside this booth's range? */
function buildingInRange(b, t) {
  const c = footprintCenter(b);
  return distanceToFootprint(t, c.x, c.y) <= djStats(b).range;
}

/**
 * The buildings a booth reaches (any part inside its range): every one of them gets something from it
 * (gnomes work faster there, defenses get the drop, VIP Lounge heals). Walls and the booth itself excluded.
 * `list` lets the map pass its draft layout in edit mode.
 */
export function buildingsInDjRange(b, list) {
  return list.filter((t) => t !== b && t.id !== b.id && t.type !== 'wall' && buildingInRange(b, t));
}

/** Work playlist: how much faster gnomes mine / repair at building `t` (1 = no booth in range). */
export function gnomeBoost(state, t) {
  let pct = 0;
  for (const b of djBooths(state)) if (buildingInRange(b, t)) pct = Math.max(pct, djStats(b).gnomeBoostPct);
  return 1 + pct / 100;
}

/** Hype the booth needs for a drop, and how full it is (0..1). */
export function hypeNeeded(b) {
  return djStats(b).hypeNeeded;
}
export function hypeFill(b) {
  return Math.min(1, (b.hype || 0) / hypeNeeded(b));
}

/** Enemies defeated fill every standing booth's meter (`n` = how many enemies that was). */
export function addHype(state, n = 1) {
  for (const b of djBooths(state)) {
    const need = hypeNeeded(b);
    if ((b.hype || 0) >= need) continue;
    b.hype = Math.min(need, (b.hype || 0) + n);
    if (b.hype >= need) emit(state, 'hypeFull', { id: b.id });
  }
}

/** Can the player drop the beat at this booth now? (A full meter, during a wave.) */
export function checkDropBeat(state, b) {
  if (!b || b.type !== 'dj' || b.destroyed) return { ok: false, reason: 'Not a standing DJ booth' };
  if ((b.hype || 0) < hypeNeeded(b)) return { ok: false, reason: `Hype ${Math.floor(b.hype || 0)} / ${hypeNeeded(b)}` };
  if (!isWaveActive(state)) return { ok: false, reason: 'Only during a wave' };
  return { ok: true, reason: '' };
}

/** Drop the Beat: every defense in range fires beatPct% faster for beatSeconds; the meter empties. */
export function dropTheBeat(state, b, defenseTypes) {
  const check = checkDropBeat(state, b);
  if (!check.ok) return check;
  const s = djStats(b);
  const fx = abilityFx(b);
  b.hype = Math.floor(s.hypeNeeded * (fx.encorePct || 0) / 100); // Encore: the meter starts part full
  const ids = [];
  for (const d of state.buildings) {
    if (d.destroyed || !defenseTypes.includes(d.type) || !buildingInRange(b, d)) continue;
    d.djBoostT = s.beatSeconds;
    d.djBoostPct = s.beatPct;
    d.djDmgPct = fx.beatDamagePct || 0; // Main Stage
    ids.push(d.id);
  }
  // Bass perks: the drop stuns (Subwoofer), hurts (Bass Shake) and knocks back (Bass Drop) enemies in range.
  if (fx.dropStun || fx.dropDamage || fx.dropKnockback) {
    const c = footprintCenter(b);
    for (const e of state.enemies) {
      if (!e.alive || !inRange(b, e.x, e.y)) continue;
      if (fx.dropStun) applyStun(e, fx.dropStun);
      if (fx.dropDamage) damageEnemy(state, e, fx.dropDamage, 'beat');
      if (fx.dropKnockback && e.alive && !isAirKind(e.kind)) {
        const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy) || 1;
        knockback(state, e, dx / d, dy / d, fx.dropKnockback);
      }
    }
  }
  emit(state, 'beatDropped', { id: b.id, ids, seconds: s.beatSeconds, pct: s.beatPct });
  return { ok: true, reason: '', ids };
}

/** Each step: boosts run down, and in the dark the light show calms enemies in range (e.calmed). */
export function stepDj(state, dt, defenseTypes = []) {
  for (const d of state.buildings) if (d.djBoostT > 0) d.djBoostT = Math.max(0, d.djBoostT - dt);
  const booths = djBooths(state);
  const dark = booths.length > 0 && isDark(state.clock);
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const calmBy = dark ? booths.find((b) => inRange(b, e.x, e.y)) : null;
    e.calmed = !!calmBy;
    const slow = calmBy ? abilityFx(calmBy).calmSlow : 0;      // Strobe Lights
    if (slow) applySlow(e, slow, 0.2);
  }
  const wave = isWaveActive(state);
  for (const b of booths) {
    const fx = abilityFx(b);
    if (fx.autoDrop && wave && checkDropBeat(state, b).ok) dropTheBeat(state, b, defenseTypes); // Auto-DJ
    if (fx.partyHealPct && wave) {                                                             // VIP Lounge
      for (const o of state.buildings) {
        if (o.destroyed || o === b || !buildingInRange(b, o)) continue;
        o.hp = Math.min(maxHp(o), o.hp + maxHp(o) * fx.partyHealPct / 100 * dt);
      }
    }
    if (fx.danceEvery && wave) {                                                               // Dance Floor
      b.danceT = (b.danceT || 0) + dt;
      if (b.danceT >= fx.danceEvery) {
        b.danceT = 0;
        for (const e of state.enemies) if (e.alive && inRange(b, e.x, e.y)) applyStun(e, fx.danceSeconds);
        emit(state, 'djDance', { id: b.id });
      }
    }
  }
}

/** Hype as saved on the booth (an integer, 0 when missing). */
export function validHype(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 1000);
}

