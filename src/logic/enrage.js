// Anti-stall: once a wave has finished spawning, its enemies get steadily angrier the longer it drags on,
// so no wave can stall forever (e.g. a ranged enemy out of every defense's reach while gnomes keep
// repairing its target). CONFIG.rules.enrage: after `after` seconds with nothing left to spawn, damage
// and speed climb by 1x and 0.5x every `ramp` seconds, up to maxDamage / maxSpeed.
// Restless nights: while it's dark (clockLight.js), a wave's enemies are restless: they deal
// CONFIG.rules.night.damage x damage and move .speed x faster (on top of any enrage), and each kill pays
// +lootBonus gold and research points (nightLootMult).
import { CONFIG } from '../config.js';
import { isDark } from './clockLight.js';

/** Is a wave attacking in the dark right now? Its enemies are restless. */
export function isRestless(state) {
  const w = state.wave;
  return !!w && (w.phase === 'active' || w.phase === 'countdown') && isDark(state.clock);
}

/** Gold / research point multiplier for kills right now (1 by day, 1 + lootBonus while restless). */
export function nightLootMult(state) {
  return isRestless(state) ? 1 + CONFIG.rules.night.lootBonus : 1;
}

/** Damage and speed multipliers for enemies right now: a stalled wave's enrage, times restless nights. */
export function enrageFactor(state) {
  const w = state.wave;
  const E = CONFIG.rules.enrage;
  const N = isRestless(state) ? CONFIG.rules.night : { damage: 1, speed: 1 };
  if (!w || w.phase !== 'active' || !w.stallTime || w.stallTime <= E.after) return { damage: N.damage, speed: N.speed };
  const r = (w.stallTime - E.after) / E.ramp;
  return { damage: Math.min(E.maxDamage, 1 + r) * N.damage, speed: Math.min(E.maxSpeed, 1 + 0.5 * r) * N.speed };
}
