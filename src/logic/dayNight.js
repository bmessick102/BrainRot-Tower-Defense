// The day/night clock: a cycle that runs on its own while you play, separate from the waves.
//   day   (CONFIG.dayNight.daySeconds)    -> full daylight
//   dusk  (CONFIG.dayNight.duskSeconds)   -> it gets dark
//   night (CONFIG.dayNight.nightSeconds)  -> dark: the night map, building lights, glowing enemies
//   dawn  (CONFIG.dayNight.dawnSeconds)   -> it gets light, then day again
// Start Wave sends the next wave right away, whatever the time: start it by day and they attack by day, at
// night and they attack at night. While it's dark, attacking enemies are restless (enrage.js): they hit harder
// and move faster, but pay more gold and research points. Otherwise the time of day changes nothing (gnomes
// work, mines produce).
// The clock is game state (saved) and only runs once the tutorial reaches its first wave (and the starting
// Village Hall ruin is rebuilt). It runs on game time, so it stops while the game is paused.
import { CONFIG } from '../config.js';
import { triggerWave } from './waves.js';
import { TUTORIAL_NIGHT_STEP } from './tutorial.js';
import { emit } from './util.js';
import { phaseLength, nightAmount, isDark, DARK_AT } from './clockLight.js';

export { phaseLength, nightAmount, isDark, DARK_AT };

export const PHASES = ['day', 'dusk', 'night', 'dawn'];

export function createClock() {
  return { phase: 'day', t: 0 };
}

/** Seconds in one full day + night. */
export function cycleLength() {
  return PHASES.reduce((s, p) => s + phaseLength(p), 0);
}

/** The clock stands still at day during the tutorial until its first wave. */
export function isClockRunning(state) {
  // The clock waits until the starting Village Hall ruin is rebuilt.
  const th = state.buildings && state.buildings.find((b) => b.type === 'townHall');
  if (th && th.level === 0) return false;
  return !!state.tutorialDone || state.tutorialStep >= TUTORIAL_NIGHT_STEP;
}

/** Daytime (day or dawn). */
export function isDaytime(clock) {
  return !!clock && (clock.phase === 'day' || clock.phase === 'dawn');
}

/** Seconds until the next phase starts. */
export function secondsToNextPhase(clock) {
  if (!clock) return 0;
  return Math.max(0, phaseLength(clock.phase) - clock.t);
}

/** The phase after this one. */
export function nextPhase(phase) {
  return PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length];
}

function setPhase(state, phase, t = 0) {
  state.clock = { phase, t };
  emit(state, 'clockPhase', { phase });
}

/** Can the player start the next wave right now? (Not in the tutorial, mid-wave, or after losing.) Any time of day. */
export function canStartWave(state) {
  if (!state.tutorialDone || state.gameOver || !state.clock) return false;
  if (!isClockRunning(state)) return false; // the starting hall ruin must be rebuilt first
  return !state.wave || state.wave.phase === 'idle';
}

/**
 * The Start Wave button: the next wave starts right away, at whatever time of day it is. Starting within
 * rules.quickStartSeconds of clearing the last wave counts as a quick start (the "Bring It On" achievement).
 */
export function startNextWave(state) {
  if (!canStartWave(state)) return { ok: false, quick: false };
  const quick = (state.sinceWaveCleared ?? Infinity) <= CONFIG.rules.quickStartSeconds;
  triggerWave(state);
  emit(state, 'waveCalled', { number: state.wave.number, quick });
  if (quick) emit(state, 'waveQuickStarted', { number: state.wave.number });
  return { ok: true, quick };
}

/** The tutorial's first wave: sent as soon as the tutorial reaches it (no button). */
export function startTutorialWave(state) {
  if (!state.wave || state.wave.phase === 'idle') triggerWave(state);
}

/** Advance the clock: day -> dusk -> night -> dawn -> day, on its own. Runs before wave spawning each step. */
export function stepClock(state, dt) {
  if (!state.clock) state.clock = createClock();
  // How long the village has been calm since the last wave was cleared (for quick starts; not saved).
  if (state.sinceWaveCleared !== undefined && (!state.wave || state.wave.phase === 'idle')) state.sinceWaveCleared += dt;
  if (!isClockRunning(state)) return;
  const c = state.clock;
  c.t = Math.max(0, c.t) + dt; // (older saves could hold a negative "grace" time)
  // A long step (or a save from a longer phase) can pass more than one phase.
  for (let i = 0; i < PHASES.length && state.clock.t >= phaseLength(state.clock.phase); i++) {
    const over = state.clock.t - phaseLength(state.clock.phase);
    setPhase(state, nextPhase(state.clock.phase), over);
  }
}

/** Retry after losing a wave: the village goes back to before that wave; the clock keeps the checkpoint's time. */
export function startGrace(state) {
  if (!state.clock) state.clock = createClock();
  emit(state, 'graceStarted', {});
}

/** After loading: the clock carries on from the saved time of day. */
export function resumeClockOnLoad(state) {
  if (!state.clock || !PHASES.includes(state.clock.phase)) state.clock = createClock();
  if (state.clock.t < 0) state.clock.t = 0;
}
