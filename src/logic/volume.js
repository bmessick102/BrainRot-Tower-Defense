// Pure volume maths for src/audio.js (kept free of Phaser so it can be unit-tested).
// Rule: a sound's final volume is its own base volume x a category level (Music or Effects, 0-1). A level of 0 is
// silence: never treat 0 as "unset" (no `level || 1`).

/** Clamp to 0..1; anything that isn't a finite number counts as 0 (silent is the safe failure). */
export function clamp01(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}

/** A sound's base volume scaled by a category level. Result is 0 whenever the level is 0. */
export function scaleVolume(base, level) {
  const b = typeof base === 'number' && Number.isFinite(base) ? Math.max(0, base) : 1;
  return b * clamp01(level);
}

/** Volume of a music track: the mix level and per-track gain (capped at 1) times the Music level and fade factor. */
export function musicTrackVolume(mix, gain, level, fade = 1) {
  return Math.min(1, mix * gain) * clamp01(level) * clamp01(fade);
}

/** Volumes of the day and night ambience beds. `night` 0..1, `presence` 0..1 (faded out during a wave). */
export function ambienceVolumes(mix, level, presence, night) {
  const base = Math.min(1, mix) * clamp01(level) * clamp01(presence);
  const n = clamp01(night);
  return { day: base * (1 - n), night: base * n };
}
