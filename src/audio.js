// Sound helpers. Missing sound files are silent placeholders: playSfx does nothing for them.
// Two volume levels, Music and SFX (0-1), set from Settings / the pause menu and saved in ibtd.settings.
// Phaser's global volume stays at 1; every sound here is scaled by its level instead.

import { requestAudio } from './assetLoader.js';
import { audioPath } from './assetPlan.js';
import { clamp01, scaleVolume, musicTrackVolume, ambienceVolumes } from './logic/volume.js';
import { SFX, MUSIC } from './assetKeys.js';
import { HERO_TYPES } from './logic/buildings.js';

// Music sits under sound effects so it never drowns them out.
const MUSIC_MIX = 0.45;
// Per-track boost on top of MUSIC_MIX, for tracks mastered quieter than the rest.
const TRACK_GAIN = {
  music_planning: 2.2 // the 30 s wave-countdown track: full volume (0.45 x 2.2 = 1)
};
// Avoid stacking the same effect dozens of times in one frame (e.g. a big splash).
const SFX_MIN_GAP_MS = 40;
// Crowded audio (v0.12.5: a big wave at 2x / 4x crackled, then went silent): at most MAX_LIVE_SFX effects play at once
// (more are skipped), and the gap between two plays of the same effect grows with how many are playing
// (SFX_MIN_GAP_MS x (1 + playing / CROWD_GAP_PER)), so a busy fight thins out its repeats instead of piling up.
const MAX_LIVE_SFX = 18;
const CROWD_GAP_PER = 6;

let music = null;
let musicKey = null;
// Music and ambience load when they first play (v0.6.2, src/assetPlan.js). A track asked for before its file is in
// waits here and starts when it arrives, unless something else was asked for (or the music stopped) meanwhile.
let pendingMusic = null;
let ambiencePending = null;
const sceneAlive = (scene) => !!scene && !!scene.sys && (scene.sys.isActive() || scene.sys.isPaused() || scene.sys.isSleeping());

/** Is the track loaded? If not (and it has a file), fetch it and run `then` when it's in, if it's still wanted. */
function whenLoaded(scene, key, then) {
  if (scene.cache.audio.exists(key)) {
    unlockStreamedAudio(scene, key);
    return true;
  }
  if (!audioPath(key)) return false; // no file: the caller's fallback applies
  const request = {};
  pendingMusic = request;
  requestAudio(key).then((ok) => {
    if (pendingMusic !== request) return;
    pendingMusic = null;
    if (ok && sceneAlive(scene)) then();
  });
  return false;
}

// Phaser marks streamed HTML5 audio tags as locked on touch devices, even after the first tap.
function unlockStreamedAudio(scene, key) {
  if (scene.sound.context || scene.sound.locked || typeof scene.sound.unlock !== 'function') return;
  const tags = scene.cache.audio.get(key);
  if (Array.isArray(tags) && tags.some((tag) => tag.dataset.locked === 'true')) scene.sound.unlock();
}

/** Fetch a track ahead of time (so it starts on cue), without playing it. */
export function prefetchMusic(key) {
  if (audioPath(key)) requestAudio(key);
}

/** Does this track have a file (loaded or not)? */
export function hasMusicFile(key) {
  return !!audioPath(key);
}

/**
 * Free a track's decoded sound (tens of MB for a long one) once it isn't playing, e.g. the title music in a
 * village. It loads again (from the browser's cache) the next time it plays.
 */
export function releaseMusic(scene, key) {
  if (musicKey === key || !scene.cache.audio.exists(key)) return;
  // Retain unlocked HTML5 tags. Only the Web Audio cache holds full decoded buffers.
  if (Array.isArray(scene.cache.audio.get(key))) return;
  const sounds = scene.sound.getAll(key);
  if (sounds.some((s) => s.isPlaying)) return;
  for (const s of sounds) s.destroy();
  scene.cache.audio.remove(key);
}
const fading = new Set(); // old tracks fading out during a crossfade
const lastPlayed = new Map();

let musicLevel = 0.7;
let sfxLevel = 0.7;
// Every music sound (the current track and ones fading out) carries a fade factor 0..1; its volume is always
// factor x track volume x Music level, recomputed whenever the slider moves (so a slider at 0 silences a mid-fade
// track too, and a fade tween never writes a stale full volume).
const FADE = Symbol('fade');
const fadeOf = (s) => (typeof s[FADE] === 'number' ? s[FADE] : 1);
const musicVolume = (key = musicKey, fade = 1) => musicTrackVolume(MUSIC_MIX, TRACK_GAIN[key] ?? 1, musicLevel, fade);
const applyMusicVolume = (s) => { if (isAlive(s) && !lockedTag(s)) s.setVolume(musicVolume(s.key, fadeOf(s))); };
// Effect sounds that are playing: sound -> its own base volume, rescaled when the Effects slider moves.
const liveSfx = new Map();
function trackSfx(snd, base) {
  liveSfx.set(snd, base);
  const drop = () => liveSfx.delete(snd);
  snd.once('complete', drop);
  snd.once('stop', drop);
  snd.once('destroy', drop);
}

/** How many effect sounds are playing right now (dead ones are dropped from the count). */
export function liveSfxCount() {
  for (const snd of liveSfx.keys()) if (!isAlive(snd) || (!snd.isPlaying && !snd.isPaused)) liveSfx.delete(snd);
  return liveSfx.size;
}

/** Is there room for one more effect? (MAX_LIVE_SFX) */
const sfxRoom = () => liveSfxCount() < MAX_LIVE_SFX;

/**
 * Keep the game's audio running: a browser can suspend (or 'interrupt') the audio context under load or after the tab
 * was hidden, and then every sound is silent until something resumes it. Called every second or so by GameScene; does
 * nothing while the browser still waits for the first click (Phaser unlocks it then).
 */
export function keepAudioAlive(scene) {
  const mgr = scene && scene.sound;
  const ctx = mgr && mgr.context;
  if (!ctx || mgr.locked || ctx.state === 'running' || ctx.state === 'closed') return;
  try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed yet */ }
}

export function playBuildingSelect(scene, type) {
  playSfx(scene, HERO_TYPES.includes(type) && scene.cache.audio.exists(SFX.altarSelect) ? SFX.altarSelect : SFX.buildingSelect);
}

export function getMusicLevel() { return musicLevel; }
export function getSfxLevel() { return sfxLevel; }

/** Music slider: also applies to the track playing now (unless it's mid-fade). */
export function setMusicLevel(v) {
  musicLevel = clamp01(v);
  applyMusicVolume(music);
  for (const s of fading) applyMusicVolume(s);
  applyAmbience();
  applyJingleVolume();
}

export function setSfxLevel(v) {
  sfxLevel = clamp01(v);
  for (const [snd, base] of liveSfx) {
    if (isAlive(snd)) snd.setVolume(scaleVolume(base, sfxLevel)); else liveSfx.delete(snd);
  }
}

/** Scale an effect's own volume (default 1) by the SFX level. For looping sounds that set their own volume. */
export function sfxVolume(v = 1) {
  return scaleVolume(v, sfxLevel);
}

// While the browser still blocks audio (no click or tap yet), Phaser queues every sound it's asked to play and
// keeps it until then (and it never finishes, so it's never cleaned up): effects are skipped instead.
const audioLocked = (scene) => !!(scene.sound && scene.sound.locked);
const effectReady = (scene, key) => {
  if (!key || !scene.cache.audio.exists(key) || audioLocked(scene)) return false;
  // HTML5 can still have locked tags as it swaps in newly loaded audio.
  const tags = scene.cache.audio.get?.(key);
  return !Array.isArray(tags) || tags[0]?.dataset?.locked !== 'true';
};

export function playSfx(scene, key, config = undefined) {
  if (!effectReady(scene, key)) return;
  const live = liveSfxCount();
  if (live >= MAX_LIVE_SFX) return; // crowded: skipped
  const now = performance.now();
  if (now - (lastPlayed.get(key) || 0) < SFX_MIN_GAP_MS * (1 + live / CROWD_GAP_PER)) return;
  lastPlayed.set(key, now);
  if (sfxLevel <= 0) return;
  const base = config && config.volume !== undefined ? config.volume : 1;
  const snd = scene.sound.add(key, { ...config, volume: sfxVolume(base) });
  trackSfx(snd, base);
  snd.once('complete', () => snd.destroy());
  snd.play();
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
  if (audioLocked(scene) || !sfxRoom()) return;
  const loaded = keys.filter((k) => scene.cache.audio.exists(k));
  if (!loaded.length) return;
  if (sfxLevel <= 0) return;
  const snd = scene.sound.add(loaded[Math.floor(Math.random() * loaded.length)], { volume: sfxVolume() });
  trackSfx(snd, 1);
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

const guideMessages = new WeakMap();

/** The village bubble and the RV Lab can display the same message. Play it once across both. */
export function notifyGuideMessage(scene, state, key) {
  let guide = guideMessages.get(state);
  if (!guide) {
    guide = { shown: new Set(), key: null, sound: null };
    guideMessages.set(state, guide);
  }
  if (guide.shown.has(key)) return;
  guide.shown.add(key);
  guide.key = key;
  const play = () => {
    if (guide.key !== key || !scene.sys.isActive()) return;
    if (isAlive(guide.sound)) destroySound(guide.sound);
    guide.sound = playSfxClip(scene, SFX.guideMessage, { maxAtOnce: 1, minGapMs: 0 });
  };
  if (audioLocked(scene)) scene.sound.once('unlocked', play);
  else play();
}

/**
 * A sound effect that may be long (a spell's cast, John Pork's call, Brr Brr Patapim's quake): played through the SFX
 * level like playSfx (skipped while the browser still blocks audio or the SFX slider is at 0), but
 *   - skipped if the same sound started less than `minGapMs` ago (casting the same spell twice quickly) or
 *     `maxAtOnce` copies are already playing, and
 *   - cut after `maxSeconds` (when given) with a `fadeMs` fade-out, so a long file works as a short clip.
 */
const clipStarts = new Map();
export function playSfxClip(scene, key, { maxSeconds = 0, fadeMs = 400, maxAtOnce = 2, minGapMs = 300, volume = 1 } = {}) {
  if (!effectReady(scene, key) || sfxLevel <= 0 || !sfxRoom()) return null;
  const now = performance.now();
  if (now - (clipStarts.get(key) || -Infinity) < minGapMs) return null;
  if (scene.sound.getAll(key).filter((s) => s.isPlaying).length >= maxAtOnce) return null;
  clipStarts.set(key, now);
  const snd = scene.sound.add(key, { volume: sfxVolume(volume) });
  trackSfx(snd, volume);
  snd.once('complete', () => destroySound(snd));
  snd.play();
  if (maxSeconds > 0 && (soundDuration(scene, key) || snd.duration) > maxSeconds) {
    scene.time.delayedCall(Math.max(0, maxSeconds * 1000 - fadeMs), () => {
      if (!isAlive(snd)) return;
      const v = { value: 1 }; // fade factor on top of the (live) Effects level
      scene.tweens.add({ targets: v, value: 0, duration: fadeMs, onUpdate: () => { if (isAlive(snd)) { liveSfx.set(snd, volume * v.value); snd.setVolume(scaleVolume(volume * v.value, sfxLevel)); } }, onComplete: () => destroySound(snd) });
    });
  }
  return snd;
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
  if (holdForJingle(() => playMusic(scene, key, { loop, seek }), scene, key)) return;
  if (musicKey === key && music && (music.isPlaying || music.tags?.[0]?.dataset.locked === 'true')) return;
  stopMusic();
  if (!whenLoaded(scene, key, () => playMusic(scene, key, { loop, seek }))) return;
  music = scene.sound.add(key, { loop, volume: musicVolume(key) });
  music[FADE] = 1;
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
  if (holdForJingle(() => crossfadeMusic(scene, key, ms, { loop }), scene, key)) return;
  if (musicKey === key && music && music.isPlaying) return;
  if (!whenLoaded(scene, key, () => crossfadeMusic(scene, key, ms, { loop }))) return; // (the current track plays on meanwhile)
  const old = music;
  if (old) {
    fading.add(old);
    fadeVolume(scene, old, 0, ms, () => { destroySound(old); fading.delete(old); });
  }
  music = scene.sound.add(key, { loop, volume: 0 });
  music[FADE] = 0;
  musicKey = key;
  music.play();
  fadeVolume(scene, music, 1, ms);
}

/**
 * Fade the current music to silence over `ms`, then stop it.
 * The next playMusic / crossfadeMusic starts fresh from silence.
 */
export function fadeOutMusic(scene, ms = 500) {
  pendingMusic = null;
  afterJingle = null;
  const old = music;
  music = null;
  musicKey = null;
  if (!isAlive(old)) return;
  fading.add(old);
  fadeVolume(scene, old, 0, ms, () => { destroySound(old); fading.delete(old); });
}

const isAlive = (s) => s && !s.pendingRemove && s.manager;
const lockedTag = (s) => s.tags?.[0]?.dataset?.locked === 'true';

function destroySound(s) {
  if (!isAlive(s)) return;
  const manager = s.manager;
  if (!lockedTag(s)) s.stop();
  s.destroy();
  // Phaser queues play/stop/volume actions while the HTML5 tag is locked. If we leave the
  // village before the first gesture, the manager must not replay actions on this destroyed sound.
  if (manager.lockedActionsQueue?.length) {
    manager.lockedActionsQueue = manager.lockedActionsQueue.filter((action) => action.sound !== s);
  }
}

// Volume fades tween a plain number and only touch the sound while it still exists, so a track
// stopped mid-fade (quit to title, game over) can't throw. stopMusic() also cancels them.
const fades = new Set();
function fadeVolume(scene, s, to, ms, onDone) {
  const v = { value: fadeOf(s) }; // the fade factor 0..1, not a raw volume
  const tween = scene.tweens.add({
    targets: v, value: to, duration: ms,
    onUpdate: () => { if (isAlive(s)) { s[FADE] = v.value; applyMusicVolume(s); } },
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

/** Does the game have the ambience files (loaded or not)? (Without them the village music plays between waves.) */
export function hasAmbience(scene, dayKey, nightKey) {
  return !!audioPath(dayKey) && !!audioPath(nightKey);
}

/** Start both beds (silent; updateAmbience sets their volumes). Does nothing if they're already playing. */
export function startAmbience(scene, dayKey, nightKey, { presence = 0 } = {}) {
  if (ambience || ambiencePending || !hasAmbience(scene, dayKey, nightKey)) return;
  cancelWaitingJingle(); // a village opened before the first tap: too late for the startup jingle
  if (!scene.cache.audio.exists(dayKey) || !scene.cache.audio.exists(nightKey)) {
    // Not loaded yet: fetch both, then start them (silent; they fade in), unless stopAmbience came first.
    const request = {};
    ambiencePending = request;
    Promise.all([requestAudio(dayKey), requestAudio(nightKey)]).then(([a, b]) => {
      if (ambiencePending !== request) return;
      ambiencePending = null;
      if (a && b && sceneAlive(scene)) startAmbience(scene, dayKey, nightKey, { presence });
    });
    return;
  }
  unlockStreamedAudio(scene, dayKey);
  unlockStreamedAudio(scene, nightKey);
  const day = scene.sound.add(dayKey, { loop: true, volume: 0 });
  const night = scene.sound.add(nightKey, { loop: true, volume: 0 });
  day.play();
  night.play();
  ambience = { day, night, presence, dark: 0 };
  applyAmbience();
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
  a.dark = night;
  applyAmbience();
}

/** Set both beds' volumes from the last clock/presence values (also called when the Music slider moves, so the
 *  beds go quiet at once even while the game is paused and updateAmbience isn't running). */
function applyAmbience() {
  const a = ambience;
  if (!a) return;
  const v = ambienceVolumes(MUSIC_MIX * AMBIENCE_GAIN, musicLevel, a.presence, a.dark);
  if (isAlive(a.day) && !lockedTag(a.day)) a.day.setVolume(v.day);
  if (isAlive(a.night) && !lockedTag(a.night)) a.night.setVolume(v.night);
}

export function stopAmbience() {
  ambiencePending = null;
  if (!ambience) return;
  destroySound(ambience.day);
  destroySound(ambience.night);
  ambience = null;
}

// ---------- the startup jingle ----------
// index.html starts it the moment the page loads (a plain <audio>, before this code has even downloaded) and keeps its
// state in window.__ibtdJingle: { state: 'playing' | 'waiting' (for the first click) | 'done', audio, waiters, cancel }.
// The loading screen waits while it plays (whenJingleDone, BootScene), and music asked for meanwhile (the title music)
// starts when it ends. If it's still waiting for a first click when a village's music or ambience starts, it's dropped.
let afterJingle = null; // the latest music call held until the jingle ends
const startupJingle = () => globalThis.__ibtdJingle || null;
const jingleState = () => startupJingle()?.state || 'done';

// A short pause after the jingle before the title screen and its music (v0.15: 0.75 s).
export const AFTER_JINGLE_MS = 750;

/**
 * Run `fn` once the startup jingle has finished playing and AFTER_JINGLE_MS have passed since (at once if it ended
 * longer ago than that or never played), and `maxMs` after the call at the latest (a file stuck downloading never holds
 * the loading screen for good). A jingle blocked until the first tap: at once, or with `waitForTap` after that tap
 * has played it (the cap then counts from the tap).
 */
export function whenJingleDone(fn, maxMs = 8000, { waitForTap = false } = {}) {
  const j = startupJingle();
  let ran = false;
  const once = () => { if (!ran) { ran = true; fn(); } };
  const state = jingleState();
  if (state === 'playing') {
    j.waiters.push(() => setTimeout(once, AFTER_JINGLE_MS));
    setTimeout(once, maxMs);
  } else if (state === 'waiting' && waitForTap) {
    // Blocked until the first tap (index.html plays it then): wait for it, and cap the wait from that tap.
    j.waiters.push(() => setTimeout(once, AFTER_JINGLE_MS));
    const events = ['pointerdown', 'touchend', 'keydown'];
    const tapped = () => { events.forEach((e) => globalThis.removeEventListener?.(e, tapped, true)); setTimeout(once, maxMs); };
    events.forEach((e) => globalThis.addEventListener?.(e, tapped, true));
  } else if (state === 'done' && typeof j?.endedAt === 'number') {
    const left = j.endedAt + AFTER_JINGLE_MS - performance.now();
    if (left > 0) setTimeout(once, left); else once();
  } else once();
}

/**
 * Run `fn` now, or at the player's first tap / click / key if the startup jingle is waiting for one ("Tap to start").
 * (index.html's own listener runs first, so the jingle has started by then.)
 */
export function whenStartTapped(fn) {
  if (jingleState() !== 'waiting') { fn(); return; }
  const events = ['pointerdown', 'touchend', 'keydown'];
  const go = () => { events.forEach((e) => globalThis.removeEventListener?.(e, go, true)); fn(); };
  events.forEach((e) => globalThis.addEventListener?.(e, go, true));
}

/** Is the startup jingle blocked until the first tap (the browser wouldn't play sound yet)? */
export function jingleWaitingForTap() {
  return jingleState() === 'waiting';
}

/** While the jingle plays (or waits for the first click), hold this music call for after it. True when held. */
function holdForJingle(play, scene, key) {
  const state = jingleState();
  if (state === 'done') return false;
  if (state === 'waiting' && key !== MUSIC.title) { cancelWaitingJingle(); return false; } // a village's music: go ahead
  if (!afterJingle) startupJingle().waiters.push(() => setTimeout(playAfterJingle, AFTER_JINGLE_MS));
  afterJingle = { play, scene };
  return true;
}

function playAfterJingle() {
  const next = afterJingle;
  afterJingle = null;
  if (next && sceneAlive(next.scene)) next.play();
}

function cancelWaitingJingle() {
  if (jingleState() !== 'waiting') return;
  afterJingle = null; // (the caller's own music plays instead of the held one)
  startupJingle().cancel();
}

/** The Music slider moved: the jingle follows it (0 stops it). */
function applyJingleVolume() {
  const j = startupJingle();
  if (!j || !j.audio || j.state === 'done') return;
  j.audio.volume = clamp01(musicLevel);
  if (musicLevel <= 0) j.stop();
}

export function stopMusic() {
  pendingMusic = null;
  afterJingle = null;
  for (const t of fades) t.stop();
  fades.clear();
  destroySound(music);
  // Also silence anything that was mid-crossfade.
  for (const s of fading) destroySound(s);
  fading.clear();
  music = null;
  musicKey = null;
}
