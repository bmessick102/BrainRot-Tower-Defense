// How light or dark the day/night clock is: pure helpers with no game imports, so enemy and combat code
// (enrage.js) can ask "is it dark?" without an import loop through dayNight.js -> waves.js.
import { CONFIG } from '../config.js';

export function phaseLength(phase) {
  const d = CONFIG.dayNight;
  return { day: d.daySeconds, dusk: d.duskSeconds, night: d.nightSeconds, dawn: d.dawnSeconds }[phase] ?? d.daySeconds;
}

function smooth(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** How dark it is (0 day .. 1 night). */
export function nightAmount(clock) {
  if (!clock) return 0;
  if (clock.phase === 'dusk') return smooth(clock.t / phaseLength('dusk'));
  if (clock.phase === 'night') return 1;
  if (clock.phase === 'dawn') return smooth(1 - clock.t / phaseLength('dawn'));
  return 0;
}

/** nightAmount at which it counts as dark: night lighting shows and attacking enemies turn restless. */
export const DARK_AT = 0.35;

/** Is it dark? (From about a third of the way into dusk until about two thirds of the way into dawn.) */
export function isDark(clock) {
  return nightAmount(clock) >= DARK_AT;
}
