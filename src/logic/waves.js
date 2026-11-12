// Wave composition, spawn paths, spawn schedule, the wave lifecycle, and endless scaling.
import { CONFIG } from '../config.js';
import { ENEMY_KINDS, spawnEnemy } from './enemies.js';
import { repairAll, salvageMine } from './economy.js';
import { resetTraps } from './traps.js';
import { townHallLevel } from './buildings.js';
import { emit, random, round2 } from './util.js';

export const PATHS = ['top', 'right', 'bottom', 'left'];
// Endless waves add one spawn corner every 2 waves (charter §10 said 3), so all 4 corners are in play
// by wave 9, inside the 10 Village Hall levels. TODO(design): move to the sheet's Global tab.
export const ENDLESS_WAVES_PER_EXTRA_PATH = 2;

export function scriptedWaveCount() {
  return CONFIG.waves.length;
}

/** Enemy counts, HP multiplier, and spawn path count for wave n (1-based). */
export function waveComposition(n) {
  const scripted = CONFIG.waves;
  if (n <= scripted.length) return { ...scripted[n - 1] };
  const last = scripted[scripted.length - 1];
  const k = n - scripted.length; // waves past the last scripted one
  const comp = {};
  for (const kind of ENEMY_KINDS) comp[kind] = Math.round(last[kind] * CONFIG.rules.endlessCountGrowth ** k);
  comp.hpMultiplier = round2(last.hpMultiplier * CONFIG.rules.endlessHpGrowth ** k);
  comp.spawnPaths = Math.min(PATHS.length, last.spawnPaths + Math.floor((k - 1) / ENDLESS_WAVES_PER_EXTRA_PATH));
  return comp;
}

/** Wave 1 (the tutorial wave) always uses the top path; otherwise random paths without repeats. */
export function choosePaths(state, n, count) {
  if (n === 1) return ['top'];
  const pool = [...PATHS];
  const chosen = [];
  while (chosen.length < Math.min(count, PATHS.length)) {
    const i = Math.floor(random(state) * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen;
}

/**
 * Split enemies as evenly as possible across paths, then order each path's queue:
 * Tanks first, then Wall Breakers (so they reach the walls first), then Grunts and Slingers alternating,
 * then Money Stealers, Sneaker Sharks, Bombers, Neegy Balloons last. (Neegies only come from balloons.)
 */
export function buildSpawnQueues(comp, paths) {
  const share = Object.fromEntries(paths.map((p) => [p, Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0]))]));
  let rotate = 0; // remainders rotate across paths so totals stay balanced
  for (const kind of ['tank', 'breaker', 'grunt', 'slinger', 'thief', 'shark', 'bomber', 'balloon']) {
    const count = comp[kind] || 0;
    const base = Math.floor(count / paths.length);
    let rem = count % paths.length;
    for (const p of paths) share[p][kind] = base;
    while (rem > 0) { share[paths[rotate % paths.length]][kind]++; rotate++; rem--; }
  }
  const queues = {};
  for (const p of paths) {
    const s = share[p];
    const q = [];
    for (let i = 0; i < s.tank; i++) q.push('tank');
    for (let i = 0; i < s.breaker; i++) q.push('breaker');
    let g = s.grunt, sl = s.slinger;
    while (g > 0 || sl > 0) {
      if (g > 0) { q.push('grunt'); g--; }
      if (sl > 0) { q.push('slinger'); sl--; }
    }
    for (let i = 0; i < s.thief; i++) q.push('thief');
    for (let i = 0; i < s.shark; i++) q.push('shark');
    for (let i = 0; i < s.bomber; i++) q.push('bomber');
    for (let i = 0; i < s.balloon; i++) q.push('balloon');
    queues[p] = q;
  }
  return queues;
}

export function createIdleWave() {
  return { phase: 'idle', number: 0, countdown: 0, paths: [], queues: {}, spawnTimer: 0, hpMultiplier: 1, bountyEarned: 0 };
}

/**
 * Which wave tonight brings: the wave matching the Town Hall level (TH1 -> wave 1, TH2 -> wave 2 ...).
 * At max Town Hall, every night survived there adds one (max, max + 1, max + 2 ...).
 */
export function nightWaveNumber(state) {
  const th = townHallLevel(state);
  const max = CONFIG.rules.maxTownHallLevel;
  return th < max ? th : max + (state.nightsAtMaxTownHall || 0);
}

/** Trigger tonight's wave: start the countdown (dusk) with paths chosen. */
export function triggerWave(state) {
  const n = nightWaveNumber(state);
  const comp = waveComposition(n);
  const paths = choosePaths(state, n, comp.spawnPaths);
  state.wave = {
    phase: 'countdown',
    number: n,
    countdown: CONFIG.rules.waveCountdown,
    paths,
    queues: buildSpawnQueues(comp, paths),
    spawnTimer: 0,
    hpMultiplier: comp.hpMultiplier,
    bountyEarned: 0,
    lastTick: Math.ceil(CONFIG.rules.waveCountdown)
  };
  emit(state, 'waveTriggered', { number: n, paths });
  return state.wave;
}

export function queuedCount(state) {
  return Object.values(state.wave.queues || {}).reduce((n, q) => n + q.length, 0);
}

/** Enemies still to beat this wave: alive plus not yet spawned. */
export function enemiesLeft(state) {
  if (!state.wave || state.wave.phase === 'idle') return 0;
  return state.enemies.filter((e) => e.alive).length + queuedCount(state);
}

/** Countdown, then one enemy per path every spawnInterval seconds. */
export function stepWaveSpawning(state, dt) {
  const w = state.wave;
  if (!w || w.phase === 'idle') return;
  if (w.phase === 'countdown') {
    w.countdown -= dt;
    const tick = Math.max(0, Math.ceil(w.countdown));
    if (tick !== w.lastTick) { w.lastTick = tick; emit(state, 'waveTick', { number: w.number, seconds: tick }); }
    if (w.countdown > 0) return;
    w.phase = 'active';
    w.spawnTimer = 0; // first enemies spawn the moment the countdown ends
    emit(state, 'waveStarted', { number: w.number });
  } else {
    w.spawnTimer -= dt;
  }
  while (w.spawnTimer <= 0 && queuedCount(state) > 0) {
    for (const path of w.paths) {
      const kind = w.queues[path].shift();
      if (kind) spawnEnemy(state, kind, path, w.hpMultiplier);
    }
    w.spawnTimer += CONFIG.rules.spawnInterval;
  }
  // Anti-stall clock: runs once nothing is left to spawn; past rules.enrage.after the enemies enrage.
  if (w.phase === 'active' && queuedCount(state) === 0) {
    w.stallTime = (w.stallTime || 0) + dt;
    if (!w.enraged && w.stallTime > CONFIG.rules.enrage.after) {
      w.enraged = true;
      emit(state, 'enemiesEnraged', { number: w.number });
    }
  }
}

/** Active wave with nothing alive and nothing queued -> cleared. Returns true when it just cleared. */
export function checkWaveCleared(state) {
  const w = state.wave;
  if (!w || w.phase !== 'active' || state.gameOver) return false;
  if (queuedCount(state) > 0 || state.enemies.some((e) => e.alive)) return false;
  state.wavesCleared += 1; // nights survived
  if (townHallLevel(state) >= CONFIG.rules.maxTownHallLevel) state.nightsAtMaxTownHall = (state.nightsAtMaxTownHall || 0) + 1;
  // Dawn starts the moment the night's wave is beaten (set before the event so the autosave stores dawn).
  if (state.clock) state.clock = { phase: 'dawn', t: 0 };
  state.enemies = [];
  state.projectiles = [];
  state.pools = [];
  let ruins = repairAll(state);
  resetTraps(state); // every Mousetrap is set again for the next wave
  // No working mine and too broke to rebuild one: the gnomes salvage the cheapest for free.
  const salvaged = salvageMine(state);
  if (salvaged) ruins--;
  const cleared = { number: w.number, bounty: w.bountyEarned, ruins, salvaged: salvaged ? salvaged.id : null };
  state.wave = createIdleWave();
  emit(state, 'waveCleared', cleared);
  return true;
}
