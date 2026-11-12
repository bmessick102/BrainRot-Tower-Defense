// Anti-stall: once a wave has finished spawning, its enemies get steadily angrier the longer it drags on,
// so no wave can stall forever (e.g. a ranged enemy out of every defense's reach while gnomes keep
// repairing its target). CONFIG.rules.enrage: after `after` seconds with nothing left to spawn, damage
// and speed climb by 1x and 0.5x every `ramp` seconds, up to maxDamage / maxSpeed.
import { CONFIG } from '../config.js';

/** Damage and speed multipliers for enemies right now (1 and 1 until the wave enrages). */
export function enrageFactor(state) {
  const w = state.wave;
  const E = CONFIG.rules.enrage;
  if (!w || w.phase !== 'active' || !w.stallTime || w.stallTime <= E.after) return { damage: 1, speed: 1 };
  const r = (w.stallTime - E.after) / E.ramp;
  return { damage: Math.min(E.maxDamage, 1 + r), speed: Math.min(E.maxSpeed, 1 + 0.5 * r) };
}
