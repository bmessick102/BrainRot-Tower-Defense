// Small shared helpers for logic modules. No Phaser.

/** Emit an event through the state's emitter, if it has one (tests often use plain objects). */
export function emit(state, name, data) {
  if (state && typeof state.emit === 'function') state.emit(name, data);
}

/** Next stable string id with the given prefix, e.g. "b7" or "e12". */
export function nextId(state, prefix) {
  state.nextId = (state.nextId || 1);
  return `${prefix}${state.nextId++}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function round2(v) {
  return Math.round(v * 100) / 100;
}

/** Enemies are on the field (from first spawn until the wave is cleared). Shop, move, sell, upgrades locked. */
export function isWaveActive(state) {
  return !!state.wave && state.wave.phase === 'active';
}

/** A wave has been triggered and is counting down or active. */
export function isWaveInProgress(state) {
  return !!state.wave && state.wave.phase !== 'idle';
}

/** Random number in [0, 1); uses state.rng when provided so tests can be deterministic. */
export function random(state) {
  return state && typeof state.rng === 'function' ? state.rng() : Math.random();
}
