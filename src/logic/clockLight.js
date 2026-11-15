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

/**
 * How the sky pictures are blended for a clock (all 0..1), the same way going in and out of night:
 *   twilight  the dusk (or dawn) picture's strength: fades in as it starts getting dark and stays under the
 *             night picture, so day -> dusk -> night and night -> dawn -> day pass through the same warm sky
 *   dusk/dawn `twilight` for whichever phase it is now (the other is 0)
 *   night     the night picture's strength: fades in once it is dark (nightAmount >= DARK_AT), exactly when
 *             building lights and restless enemies switch on
 *   warm      how warm the twilight tint on sprites is: strongest where the twilight picture is full and the
 *             night picture is still fading in
 */
export function skyBlend(clock) {
  const n = nightAmount(clock);
  const twilight = Math.min(1, n / DARK_AT);
  const night = Math.max(0, Math.min(1, (n - DARK_AT) / (1 - DARK_AT)));
  const phase = clock && clock.phase;
  return {
    night,
    twilight,
    dusk: phase === 'dusk' ? twilight : 0,
    dawn: phase === 'dawn' ? twilight : 0,
    warm: phase === 'dusk' || phase === 'dawn' ? twilight * (1 - night) : 0
  };
}
