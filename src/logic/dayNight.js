// The day/night clock. Waves come at night:
//   day  (CONFIG.dayNight.daySeconds)  -> building time
//   dusk (CONFIG.rules.waveCountdown)  -> the wave countdown; a wave is triggered as dusk begins
//   night (until the wave is cleared)  -> enemies attack
//   dawn (CONFIG.dayNight.dawnSeconds) -> back to day
// The clock is game state (saved) and only runs once the tutorial reaches its night step.
import { CONFIG } from '../config.js';
import { triggerWave } from './waves.js';
import { addGold } from './economy.js';
import { TUTORIAL_NIGHT_STEP } from './tutorial.js';
import { emit } from './util.js';

export const PHASES = ['day', 'dusk', 'night', 'dawn'];

export function createClock() {
  return { phase: 'day', t: 0 };
}

export function phaseLength(phase) {
  if (phase === 'day') return CONFIG.dayNight.daySeconds;
  if (phase === 'dusk') return CONFIG.rules.waveCountdown;
  if (phase === 'dawn') return CONFIG.dayNight.dawnSeconds;
  return Infinity; // night lasts until the wave is cleared
}

/** The clock stands still at day during the tutorial until night is introduced. */
export function isClockRunning(state) {
  // Nights wait until the starting Village Hall ruin is rebuilt.
  const th = state.buildings && state.buildings.find((b) => b.type === 'townHall');
  if (th && th.level === 0) return false;
  return !!state.tutorialDone || state.tutorialStep >= TUTORIAL_NIGHT_STEP;
}

function smooth(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** How dark it is (0 day .. 1 night), for the visuals. */
export function nightAmount(clock) {
  if (!clock) return 0;
  if (clock.phase === 'dusk') return smooth(clock.t / phaseLength('dusk'));
  if (clock.phase === 'night') return 1;
  if (clock.phase === 'dawn') return smooth(1 - clock.t / phaseLength('dawn'));
  return 0;
}

/** Seconds until dusk (the next wave countdown), or null during dusk/night. */
export function secondsUntilDusk(clock) {
  if (clock.phase === 'day') return phaseLength('day') - clock.t;
  if (clock.phase === 'dawn') return phaseLength('dawn') - clock.t + phaseLength('day');
  return null;
}

function setPhase(state, phase) {
  state.clock = { phase, t: 0 };
  emit(state, 'clockPhase', { phase });
}

/** Dusk begins now: start the wave countdown (used by the clock, the tutorial, and loading a save). */
export function beginDusk(state) {
  setPhase(state, 'dusk');
  if (!state.wave || state.wave.phase === 'idle') triggerWave(state);
}

/**
 * Seconds the player would skip by calling the next wave now, or null when they can't:
 * during day or dawn it's the time left until dusk; during the dusk countdown it's the countdown left.
 * Not available during the tutorial, a running wave, or after the game is lost.
 */
export function earlyCallSkip(state) {
  if (!state.tutorialDone || state.gameOver || !state.clock) return null;
  if (!isClockRunning(state)) return null; // the starting hall ruin must be rebuilt first
  const c = state.clock;
  if (c.phase === 'day' || c.phase === 'dawn') return Math.max(0, secondsUntilDusk(c));
  if (c.phase === 'dusk' && state.wave && state.wave.phase === 'countdown') return Math.max(0, state.wave.countdown);
  return null;
}

/** Gold bonus for calling the next wave now (rules.earlyCallGoldPerSecond per second skipped, rounded down). */
export function earlyCallBonus(state) {
  const skip = earlyCallSkip(state);
  // The epsilon keeps clock float drift (e.g. 79.9999999 s) from rounding a whole bonus down by one.
  return skip === null ? 0 : Math.floor(skip * CONFIG.rules.earlyCallGoldPerSecond + 1e-6);
}

/**
 * Call the next wave early. From day/dawn: dusk (the 30 s countdown) starts now. From the countdown:
 * the wave starts on the next step. Pays the bonus first (up to capacity) so the dusk checkpoint keeps it.
 */
export function callWaveEarly(state) {
  const skipped = earlyCallSkip(state);
  if (skipped === null) return { ok: false, bonus: 0 };
  const from = state.clock.phase;
  const bonus = addGold(state, earlyCallBonus(state));
  if (from === 'dusk') state.wave.countdown = 0; // stepWaveSpawning starts the wave next step
  else beginDusk(state);
  emit(state, 'waveCalledEarly', { from, skipped, bonus });
  return { ok: true, bonus, from };
}

/** Advance the clock. Runs before wave spawning each simulation step. */
export function stepClock(state, dt) {
  if (!state.clock) state.clock = createClock();
  if (!isClockRunning(state)) return;
  const c = state.clock;
  if (c.phase === 'night') {
    // Night holds until the wave is over (waves.js also moves the clock to dawn when it clears).
    if (!state.wave || state.wave.phase === 'idle') setPhase(state, 'dawn');
    return;
  }
  const before = secondsUntilDusk(c);
  c.t += dt;
  if (c.t >= phaseLength(c.phase)) {
    if (c.phase === 'day') beginDusk(state);
    else if (c.phase === 'dusk') setPhase(state, 'night');
    else if (c.phase === 'dawn') setPhase(state, 'day');
    return;
  }
  const after = secondsUntilDusk(c);
  if (before !== null && after !== null && Math.ceil(before) !== Math.ceil(after)) {
    emit(state, 'clockTick', { secondsUntilDusk: Math.ceil(after) });
  }
}

/**
 * After losing a night: daytime with exactly `seconds` left before dusk, so the player can rebuild
 * instead of being thrown straight back into the same wave. (t can be negative for a grace longer than a day.)
 */
export function startGrace(state, seconds = CONFIG.dayNight.graceSeconds) {
  state.clock = { phase: 'day', t: phaseLength('day') - seconds };
  emit(state, 'graceStarted', { seconds });
}

/** After loading: a save made at dusk or night means that night's wave comes again from the start of dusk. */
export function resumeClockOnLoad(state) {
  if (!state.clock) state.clock = createClock();
  if (isClockRunning(state) && (state.clock.phase === 'dusk' || state.clock.phase === 'night')) beginDusk(state);
}
