// The 2x wave speed toggle (the round "2x" button beside Start Wave, hotkey T). Pure logic, no Phaser.
//
// How it works: while a wave is counting down or running, GameScene.update runs the simulation `stepsPerFrame`
// times per frame, each with the normal (capped) frame step, instead of one step with a doubled dt. So every
// timer, cooldown, spell, spawn, projectile and collision sees exactly the steps it would at 1x, just twice as
// many per real second; nothing can tunnel or skip. Between waves the game always runs at 1x (the day/night
// clock, building time and gold income are not sped up), so the toggle only changes how fast a wave plays.
// The choice is saved with the settings (`fast` in ibtd.settings) and stays on for later waves.
import { isWaveInProgress } from './util.js';

export const FAST_FACTOR = 2;

let fast = false; // this session's choice (loaded from the settings when the HUD is built)

export const isFastForward = () => fast;
export function setFastForward(on) { fast = !!on; return fast; }

/** Is the toggle available (shown) right now? During the wave countdown and the wave itself, not between waves. */
export function canFastForward(state) {
  return !!state && !state.gameOver && isWaveInProgress(state);
}

/** How many simulation steps to run for one frame: FAST_FACTOR while a wave is in progress and the toggle is on. */
export function stepsPerFrame(state, on = fast) {
  return on && canFastForward(state) ? FAST_FACTOR : 1;
}
