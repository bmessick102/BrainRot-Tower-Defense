// Wave composition, spawn paths, spawn schedule, the wave lifecycle, and difficulty scaling.
// Difficulty: the Village Hall level picks a base wave (scripted for TH1-4, the endless formula above
// that), and every wave survived ramps it up (waveRamp), so waves keep getting harder at any hall level.
import { CONFIG } from '../config.js';
import { ENEMY_KINDS, spawnEnemy } from './enemies.js';
import { repairAll, salvageMine, addGold } from './economy.js';
import { resetTraps } from './traps.js';
import { addResearchPoints, waveResearchPoints } from './researchPoints.js';
import { townHallLevel } from './buildings.js';
import { emit, random, round2 } from './util.js';
import { isRestless, nightLootMult } from './enrage.js';

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

/** The number of the next wave: waves are numbered in the order they're fought (1, 2, 3 ...). */
export function nightWaveNumber(state) {
  return (state.wavesCleared || 0) + 1;
}

/**
 * How much bigger wave n is than its Village Hall's base wave: every wave survived before it adds
 * rules.waveRamp.countPerWave more enemies and rules.waveRamp.hpPerWave more enemy HP (linear).
 */
export function waveRamp(n) {
  const k = Math.max(0, n - 1);
  const r = CONFIG.rules.waveRamp;
  return { count: round2(1 + r.countPerWave * k), hp: round2(1 + r.hpPerWave * k) };
}

/**
 * Wave n fought at Village Hall `th`: the Village Hall picks the base wave (which enemy types appear, how
 * many, from how many corners: TH1 -> the first scripted wave ... TH10 -> the endless formula's wave 10),
 * then waveRamp(n) scales the enemy counts and HP. Kinds absent from the base stay absent.
 */
export function scaledWaveComposition(th, n) {
  const base = waveComposition(Math.max(1, Math.min(th, CONFIG.rules.maxTownHallLevel)));
  const ramp = waveRamp(n);
  const comp = { ...base };
  for (const kind of ENEMY_KINDS) comp[kind] = Math.round((base[kind] || 0) * ramp.count);
  comp.hpMultiplier = round2(base.hpMultiplier * ramp.hp);
  return comp;
}

// ---------- special waves (CONFIG.specialWaves) ----------
const SW = () => CONFIG.specialWaves;
const clampHall = (th) => Math.max(1, Math.min(th, CONFIG.rules.maxTownHallLevel));

/** Total enemy HP of a composition (before its hpMultiplier): the strength a special wave keeps. */
export function waveStrength(comp) {
  return ENEMY_KINDS.reduce((sum, k) => sum + (comp[k] || 0) * CONFIG.enemies[k].hp, 0);
}

/** Special wave types possible at Village Hall th: those whose `needs` kinds are in its base wave. */
export function specialTypesAt(th) {
  const base = waveComposition(clampHall(th));
  return SW().order.filter((key) => SW().types[key].needs.every((k) => (base[k] || 0) > 0));
}

/** The special wave type (a key of specialWaves.types) wave n at Village Hall th is, or null if normal. */
export function specialWaveType(th, n) {
  const every = SW().every;
  if (!every || n % every !== 0) return null;
  const types = specialTypesAt(th);
  return types.length ? types[(n / every - 1) % types.length] : null;
}

/**
 * A normal wave re-mixed into special type `key`: the same total enemy HP (x the type's strength) split
 * over the type's mix, same HP multiplier and spawn corners. Too many enemies -> fewer, tougher ones.
 */
export function specialComposition(normal, key) {
  const t = SW().types[key];
  const hp = (k) => CONFIG.enemies[k].hp;
  // Weights: the type's mix (kinds the normal wave has), or for `mix: null` every ground kind it has,
  // weighted by its share of the strength (so the troops just multiply up).
  const weights = {};
  if (t.mix) {
    for (const [k, w] of Object.entries(t.mix)) if ((normal[k] || 0) > 0) weights[k] = w;
  } else {
    for (const k of ENEMY_KINDS) if ((normal[k] || 0) > 0 && CONFIG.enemies[k].type !== 'air') weights[k] = normal[k] * hp(k);
  }
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!totalW) return { ...normal };
  const budget = waveStrength(normal) * t.strength;
  const comp = { ...normal, special: key };
  for (const k of ENEMY_KINDS) comp[k] = 0;
  for (const [k, w] of Object.entries(weights)) comp[k] = Math.max(1, Math.round((budget * w) / totalW / hp(k)));
  const count = (c) => ENEMY_KINDS.reduce((n, k) => n + (c[k] || 0), 0);
  const total = count(comp), max = Math.max(1, Math.round(count(normal) * SW().maxEnemiesFactor));
  if (total > max) {
    const f = max / total;
    for (const k of ENEMY_KINDS) if (comp[k] > 0) comp[k] = Math.max(1, Math.floor(comp[k] * f));
    comp.hpMultiplier = round2(normal.hpMultiplier / f);
  }
  return comp;
}

/** The village's next wave: special type (or null), Village Hall level and wave number. */
export function nextWaveInfo(state) {
  const th = townHallLevel(state), n = nightWaveNumber(state);
  const special = specialWaveType(th, n);
  return { number: n, th, special, specialInfo: special ? SW().types[special] : null };
}

/** The composition of the village's next wave (special waves included). */
export function nextWaveComposition(state) {
  const { number, th, special } = nextWaveInfo(state);
  const normal = scaledWaveComposition(th, number);
  return special ? specialComposition(normal, special) : normal;
}

/** Trigger the next wave: paths chosen, queues built; it goes active on the next spawning step. */
export function triggerWave(state) {
  const n = nightWaveNumber(state);
  const comp = nextWaveComposition(state);
  const paths = choosePaths(state, n, comp.spawnPaths);
  state.wave = {
    phase: 'countdown', // only for one step: stepWaveSpawning starts it right away
    number: n,
    countdown: 0,
    paths,
    queues: buildSpawnQueues(comp, paths),
    spawnTimer: 0,
    hpMultiplier: comp.hpMultiplier,
    bountyEarned: 0,
    special: comp.special || null
  };
  emit(state, 'waveTriggered', { number: n, paths, special: state.wave.special });
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

/** A triggered wave starts on the next step; then one enemy per path every spawnInterval seconds. */
export function stepWaveSpawning(state, dt) {
  const w = state.wave;
  if (!w || w.phase === 'idle') return;
  if (w.phase === 'countdown') {
    w.countdown -= dt;
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
  // Restless nights: tell the UI when the enemies turn restless (it got dark) or calm down (it got light).
  const restless = isRestless(state);
  if (restless !== !!w.restless) {
    w.restless = restless;
    emit(state, 'restlessChanged', { restless, number: w.number });
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
  state.wavesCleared += 1; // nights survived (the next wave is wavesCleared + 1)
  state.sinceWaveCleared = 0; // starting the next one soon counts as a quick start (dayNight.js)
  addResearchPoints(state, Math.round(waveResearchPoints(w.number) * nightLootMult(state))); // beating the wave pays research points (more at night)
  // Kept in saves for older versions; waves no longer depend on it.
  if (townHallLevel(state) >= CONFIG.rules.maxTownHallLevel) state.nightsAtMaxTownHall = (state.nightsAtMaxTownHall || 0) + 1;
  state.enemies = [];
  state.projectiles = [];
  state.pools = [];
  state.strikes = [];
  let ruins = repairAll(state);
  resetTraps(state); // every Mousetrap is set again for the next wave
  // Once per night: Last Stand; Spellsteal and Ready Rack start over.
  for (const b of state.buildings) { b.lastStandUsed = false; b.lastStandT = 0; b.stealStacks = 0; b.rack = 0; }
  // No working mine and too broke to rebuild one: the gnomes salvage the cheapest for free.
  const salvaged = salvageMine(state);
  if (salvaged) ruins--;
  // A special wave pays a bonus on top of its bounty (up to storage capacity).
  const bonus = w.special ? addGold(state, Math.floor((w.bountyEarned || 0) * SW().bonusBounty)) : 0;
  const cleared = { number: w.number, bounty: w.bountyEarned, rp: w.rpEarned || 0, ruins, salvaged: salvaged ? salvaged.id : null, special: w.special || null, bonus };
  state.wave = createIdleWave();
  emit(state, 'waveCleared', cleared);
  return true;
}
