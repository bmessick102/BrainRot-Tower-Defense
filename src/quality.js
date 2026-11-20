// Graphics quality (Settings > Graphics, saved with the settings as 'auto', 'high' or 'low').
// Low quality keeps the game the same but draws less: fewer particles (phaserPerf.js), fewer fog puffs at the
// path ends (SpawnFog), no night glows around enemies and the hero, fewer floating damage numbers (Effects
// floatText), and a calmer title screen (TitleBackdropScene's ambient wisps and sparks).
// 'auto' starts on high and switches to low for the rest of the session when the game runs slowly for a while
// (LowFpsWatch, fed every frame from main.js).

export const QUALITY_MODES = ['auto', 'high', 'low'];
export const QUALITY_LABELS = { auto: 'Auto', high: 'High', low: 'Low' };

let mode = 'auto';
let autoLow = false; // 'auto' decided this device needs low quality (this session only)
const listeners = new Set();

/** The chosen setting: 'auto', 'high' or 'low'. */
export function qualityMode() {
  return mode;
}

/** Is the game drawing in low quality right now (chosen, or picked by 'auto')? */
export function isLowQuality() {
  return mode === 'low' || (mode === 'auto' && autoLow);
}

/** 'auto' has switched to low quality this session. */
export function autoSwitchedLow() {
  return autoLow;
}

function changed(before) {
  if (isLowQuality() === before) return;
  for (const fn of [...listeners]) { try { fn(isLowQuality()); } catch { /* a view that's gone */ } }
}

export function setQualityMode(m) {
  const before = isLowQuality();
  mode = QUALITY_MODES.includes(m) ? m : 'auto';
  changed(before);
}

/** 'auto' found the game running slowly: switch to low quality (no effect on a chosen 'high' or 'low'). */
export function setAutoLow(on = true) {
  const before = isLowQuality();
  autoLow = !!on;
  changed(before);
}

/** Call fn(low) whenever the quality changes. Returns a function that stops it. */
export function onQualityChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * The slow-device detector for 'auto': fed each frame's length (ms), it counts frames per second of play and
 * reports (once) when the frame rate stayed under `lowFps` for `seconds` seconds in a row. Frames longer than
 * `ignoreAboveMs` (loading, the tab coming back, a dialog) cancel the second they fall in, and the first
 * `warmupMs` are not counted, so one hitch never turns the quality down.
 */
export class LowFpsWatch {
  constructor({ lowFps = 30, seconds = 8, ignoreAboveMs = 1000, warmupMs = 5000 } = {}) {
    Object.assign(this, { lowFps, seconds, ignoreAboveMs, warmupMs });
    this.reset();
  }

  reset() {
    this.elapsed = 0;
    this.windowMs = 0;
    this.frames = 0;
    this.streak = 0;
    this.fired = false;
  }

  /** Feed one frame's length; true once, on the frame that shows the device is slow. */
  feed(deltaMs) {
    if (this.fired || !(deltaMs > 0)) return false;
    if (deltaMs > this.ignoreAboveMs) { this.windowMs = 0; this.frames = 0; return false; }
    this.elapsed += deltaMs;
    if (this.elapsed < this.warmupMs) return false;
    this.windowMs += deltaMs;
    this.frames++;
    if (this.windowMs < 1000) return false;
    const fps = (this.frames * 1000) / this.windowMs;
    this.windowMs = 0;
    this.frames = 0;
    this.streak = fps < this.lowFps ? this.streak + 1 : 0;
    if (this.streak < this.seconds) return false;
    this.fired = true;
    return true;
  }
}
