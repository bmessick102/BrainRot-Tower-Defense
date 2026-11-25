// The wave speed button (the round button beside Start Wave showing "1x" / "2x" / "4x", hotkey T). Pure logic, no Phaser.
// Each press steps through WAVE_SPEEDS: off (1x) -> 2x -> 4x -> off (v0.8.9: 4x added; it was a 2x toggle).
//
// How it works: while a wave is counting down or running, GameScene.update runs the simulation `stepsPerFrame`
// times per frame, each with the normal (capped) frame step, instead of one step with a multiplied dt. Combat timers,
// spawns and projectiles see the same steps as at 1x, just two or four times as often. Hero recovery stays on the
// unaccelerated frame clock so a new raid can't shorten an existing nap. Between waves the game runs at 1x (the day/night
// clock, building time and gold income are not sped up), so the button only changes how fast a wave plays.
// The choice is saved with the settings (`fast` in ibtd.settings: true for 2x, 4 for 4x) and stays for later waves.
import { isWaveInProgress } from './util.js';

export const WAVE_SPEEDS = [1, 2, 4];
export const FAST_FACTOR = 2; // the first speed-up (what `true` means wherever an on/off is passed)

let speed = 1; // this session's choice (loaded from the settings when the HUD is built)

/** A valid wave speed from any value: true -> 2x, a number in WAVE_SPEEDS -> itself, anything else -> 1x. */
export function toWaveSpeed(v) {
  if (v === true) return FAST_FACTOR;
  return WAVE_SPEEDS.includes(v) ? v : 1;
}

export const getWaveSpeed = () => speed;
export function setWaveSpeed(v) { speed = toWaveSpeed(v); return speed; }
/** The speed after `v` when the button is pressed: 1x -> 2x -> 4x -> 1x. */
export function nextWaveSpeed(v = speed) {
  const i = WAVE_SPEEDS.indexOf(toWaveSpeed(v));
  return WAVE_SPEEDS[(i + 1) % WAVE_SPEEDS.length];
}

/** Is the wave sped up (2x or 4x)? */
export const isFastForward = () => speed > 1;
/** On (2x) or off (1x); a number sets that speed. */
export function setFastForward(on) { return setWaveSpeed(on === false ? 1 : on) > 1; }

/** Is the button available (shown) right now? During the wave countdown and the wave itself, not between waves. */
export function canFastForward(state) {
  return !!state && !state.gameOver && isWaveInProgress(state);
}

/**
 * How many simulation steps to run for one frame: the wave speed while a wave is in progress, else 1. `on` is the
 * speed (a number, or true for 2x / false for 1x); it defaults to the current choice.
 */
export function stepsPerFrame(state, on = speed) {
  const n = on === false ? 1 : toWaveSpeed(on);
  return n > 1 && canFastForward(state) ? n : 1;
}
