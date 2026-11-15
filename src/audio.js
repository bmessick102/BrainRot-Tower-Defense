// Sound helpers. Missing sound files are silent placeholders: playSfx does nothing for them.
// Two volume levels, Music and SFX (0-1), set from Settings / the pause menu and saved in ibtd.settings.
// Phaser's global volume stays at 1; every sound here is scaled by its level instead.

// Music sits under sound effects so it never drowns them out.
const MUSIC_MIX = 0.45;
// Per-track boost on top of MUSIC_MIX, for tracks mastered quieter than the rest.
const TRACK_GAIN = {
};
// Avoid stacking the same effect dozens of times in one frame (e.g. a big splash).
const SFX_MIN_GAP_MS = 40;

let music = null;
let musicKey = null;
const fading = new Set(); // old tracks fading out during a crossfade
const lastPlayed = new Map();

let musicLevel = 0.7;
let sfxLevel = 0.7;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const musicVolume = (key = musicKey) => Math.min(1, MUSIC_MIX * (TRACK_GAIN[key] ?? 1)) * musicLevel;

export function getMusicLevel() { return musicLevel; }
export function getSfxLevel() { return sfxLevel; }

/** Music slider: also applies to the track playing now (unless it's mid-fade). */
export function setMusicLevel(v) {
  musicLevel = clamp01(v);
  if (isAlive(music) && !fades.size) music.setVolume(musicVolume());
}

export function setSfxLevel(v) {
  sfxLevel = clamp01(v);
}

/** Scale an effect's own volume (default 1) by the SFX level. For looping sounds that set their own volume. */
export function sfxVolume(v = 1) {
  return v * sfxLevel;
}

export function playSfx(scene, key, config = undefined) {
  if (!key || !scene.cache.audio.exists(key)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(key) || 0) < SFX_MIN_GAP_MS) return;
  lastPlayed.set(key, now);
  if (sfxLevel <= 0) return;
  scene.sound.play(key, { ...config, volume: sfxVolume(config && config.volume !== undefined ? config.volume : 1) });
}

/**
 * A spoken line: one of `keys` at random (only those that are loaded). Lines never talk over each
 * other: if the previous line from this same set is still playing, this one is skipped.
 */
const voices = new Map(); // set id -> currently playing sound
export function playVoiceLine(scene, keys, group = null) {
  const id = group || keys.join('|');
  const current = voices.get(id);
  if (current && current.isPlaying) return;
  const loaded = keys.filter((k) => scene.cache.audio.exists(k));
  if (!loaded.length) return;
  const snd = scene.sound.add(loaded[Math.floor(Math.random() * loaded.length)], { volume: sfxVolume() });
  snd.once('complete', () => { snd.destroy(); if (voices.get(id) === snd) voices.delete(id); });
  voices.set(id, snd);
  snd.play();
}

/** Like playSfx, but skipped while `maxAtOnce` copies of this sound are already playing (for long tails). */
export function playSfxCapped(scene, key, maxAtOnce, config = undefined) {
  if (!key || !scene.cache.audio.exists(key)) return;
  const playing = scene.sound.getAll(key).filter((s) => s.isPlaying).length;
  if (playing >= maxAtOnce) return;
  playSfx(scene, key, config);
}

/** Length of a loaded sound in seconds (0 if missing). */
export function soundDuration(scene, key) {
  if (!scene.cache.audio.exists(key)) return 0;
  const data = scene.cache.audio.get(key);
  return data && typeof data.duration === 'number' ? data.duration : 0;
}

/**
 * Play `key` so that it finishes `seconds` from now: a longer sound starts partway in (its ending
 * lines up with the moment), a shorter one is delayed. Used for the Mortar's whistle before impact.
 */
export function playSfxEndingIn(scene, key, seconds) {
  const dur = soundDuration(scene, key);
  if (!dur || seconds <= 0) return;
  if (dur > seconds) playSfx(scene, key, { seek: dur - seconds });
  else scene.time.delayedCall((seconds - dur) * 1000, () => playSfx(scene, key));
}

/**
 * Play a music track (looping unless `loop: false`, from `seek` seconds in). Keeps playing across
 * scenes; calling again with the same key does nothing.
 */
export function playMusic(scene, key, { loop = true, seek = 0 } = {}) {
  if (musicKey === key && music && music.isPlaying) return;
  stopMusic();
  if (!scene.cache.audio.exists(key)) return;
  music = scene.sound.add(key, { loop, volume: musicVolume(key) });
  musicKey = key;
  music.play({ seek: Math.max(0, seek) });
}

/** Pause / resume the current track, only if it's `key` (the planning track pauses with the game). */
export function pauseMusic(key) {
  if (musicKey === key && isAlive(music) && music.isPlaying) music.pause();
}
export function resumeMusic(key) {
  if (musicKey === key && isAlive(music) && music.isPaused) music.resume();
}

/**
 * Crossfade from the current track to another (e.g. village -> attack at night).
 * If the new track's file is missing, the current music just keeps playing.
 */
export function crossfadeMusic(scene, key, ms = 1500, { loop = true } = {}) {
  if (musicKey === key && music && music.isPlaying) return;
  if (!scene.cache.audio.exists(key)) return;
  const old = music;
  if (old) {
    fading.add(old);
    fadeVolume(scene, old, 0, ms, () => { destroySound(old); fading.delete(old); });
  }
  music = scene.sound.add(key, { loop, volume: 0 });
  musicKey = key;
  music.play();
  fadeVolume(scene, music, musicVolume(), ms);
}

/**
 * Fade the current music to silence over `ms`, then stop it.
 * The next playMusic / crossfadeMusic starts fresh from silence.
 */
export function fadeOutMusic(scene, ms = 500) {
  const old = music;
  music = null;
  musicKey = null;
  if (!isAlive(old)) return;
  fading.add(old);
  fadeVolume(scene, old, 0, ms, () => { destroySound(old); fading.delete(old); });
}

const isAlive = (s) => s && !s.pendingRemove && s.manager;

function destroySound(s) {
  if (!isAlive(s)) return;
  s.stop();
  s.destroy();
}

// Volume fades tween a plain number and only touch the sound while it still exists, so a track
// stopped mid-fade (quit to title, game over) can't throw. stopMusic() also cancels them.
const fades = new Set();
function fadeVolume(scene, s, to, ms, onDone) {
  const v = { value: s.volume };
  const tween = scene.tweens.add({
    targets: v, value: to, duration: ms,
    onUpdate: () => { if (isAlive(s)) s.setVolume(v.value); },
    onComplete: () => { fades.delete(tween); if (onDone) onDone(); }
  });
  fades.add(tween);
}

// ---------- ambience: day and night beds between waves ----------
// Two looping tracks play together; their volumes follow the day/night clock (night 0 = all day bed, 1 = all
// night bed), so they crossfade through dusk and dawn. While a wave attacks they fade out (the attack music
// takes over) and fade back in when it's beaten. They follow the Music slider. updateAmbience runs every frame.
const AMBIENCE_GAIN = 1;          // on top of MUSIC_MIX, like a music track
const AMBIENCE_FADE_PER_S = 0.7;  // how fast they fade out for a wave / back in after (share of full per second)
let ambience = null;              // { day, night, presence }

/** Are the ambience files loaded? (Without them the village music plays between waves, as before.) */
export function hasAmbience(scene, dayKey, nightKey) {
  return scene.cache.audio.exists(dayKey) && scene.cache.audio.exists(nightKey);
}

/** Start both beds (silent; updateAmbience sets their volumes). Does nothing if they're already playing. */
export function startAmbience(scene, dayKey, nightKey, { presence = 0 } = {}) {
  if (ambience || !hasAmbience(scene, dayKey, nightKey)) return;
  const day = scene.sound.add(dayKey, { loop: true, volume: 0 });
  const night = scene.sound.add(nightKey, { loop: true, volume: 0 });
  day.play();
  night.play();
  ambience = { day, night, presence };
}

/**
 * Every frame: `night` is how dark it is (0..1), `on` whether the beds should be heard (no wave attacking).
 * Presence eases toward `on`, so the beds fade out for a wave and back in after it.
 */
export function updateAmbience(night, on, dt) {
  if (!ambience) return;
  const a = ambience;
  const target = on ? 1 : 0;
  const step = AMBIENCE_FADE_PER_S * dt;
  a.presence = a.presence < target ? Math.min(target, a.presence + step) : Math.max(target, a.presence - step);
  const base = Math.min(1, MUSIC_MIX * AMBIENCE_GAIN) * musicLevel * a.presence;
  const n = clamp01(night);
  if (isAlive(a.day)) a.day.setVolume(base * (1 - n));
  if (isAlive(a.night)) a.night.setVolume(base * n);
}

export function stopAmbience() {
  if (!ambience) return;
  destroySound(ambience.day);
  destroySound(ambience.night);
  ambience = null;
}

export function stopMusic() {
  for (const t of fades) t.stop();
  fades.clear();
  destroySound(music);
  // Also silence anything that was mid-crossfade.
  for (const s of fading) destroySound(s);
  fading.clear();
  music = null;
  musicKey = null;
}
