// Wave composition, spawn paths, spawn schedule, the wave lifecycle, and difficulty scaling.
// Difficulty: the Village Hall level picks a base wave (scripted for TH1-4, the endless formula above
// that), and every wave survived ramps it up (waveRamp), so waves keep getting harder at any hall level.
import { CONFIG } from '../config.js';
import { ENEMY_KINDS, spawnEnemy } from './enemies.js';
import { repairAll, salvageMine, addGold, getCapacity, storageCapacity } from './economy.js';
import { abilityFx } from './abilities.js';
import { isDark } from './clockLight.js';
import { resetTraps } from './traps.js';
import { addResearchPoints, waveResearchPoints } from './researchPoints.js';
import { townHallLevel } from './buildings.js';
import { emit, random, round2 } from './util.js';
import { isRestless, nightLootMult } from './enrage.js';
import { countedBuildings, starsFor, starBonus } from './waveStars.js';

export const PATHS = ['top', 'right', 'bottom', 'left'];
// Endless waves add one spawn corner every 2 Village Hall levels (charter §10 said 3), so all 4 corners are in
// play by Village Hall 9, inside the 10 Village Hall levels. TODO(design): move to the sheet's Global tab.
export const ENDLESS_WAVES_PER_EXTRA_PATH = 2;

/** Enemy counts, HP multiplier, and spawn path count for wave n (1-based). */
export function waveComposition(n) {
  return withLateKinds(baseComposition(n), n);
}

/**
 * Enemy kinds that join the waves from a Village Hall level (fromTownHall on the enemy, e.g. the Skibidi
 * Toilet): baseCount at that hall, growing by rules.endlessCountGrowth per hall after it.
 * The v0.6 kinds (OFFSET_KINDS) make room for themselves: rules.lateKindOffset of their total health comes back out of
 * the regular troops (rules.lateKindPool, each cut by the same share, never more than rules.lateKindMaxCut).
 */
export const OFFSET_KINDS = ['pork', 'skeleton', 'vaca', 'yahu', 'patapim'];

function withLateKinds(comp, n) {
  let added = 0;
  for (const k of ENEMY_KINDS) {
    const cfg = CONFIG.enemies[k];
    if (!cfg.fromTownHall || !cfg.baseCount) continue;
    comp[k] = n >= cfg.fromTownHall ? Math.round(cfg.baseCount * CONFIG.rules.endlessCountGrowth ** (n - cfg.fromTownHall)) : 0;
    if (OFFSET_KINDS.includes(k)) added += comp[k] * cfg.hp;
  }
  if (added > 0) {
    const R = CONFIG.rules;
    const pool = R.lateKindPool.reduce((sum, k) => sum + (comp[k] || 0) * CONFIG.enemies[k].hp, 0);
    const cut = pool > 0 ? Math.min(R.lateKindMaxCut, (added * R.lateKindOffset) / pool) : 0;
    for (const k of R.lateKindPool) if (comp[k] > 0) comp[k] = Math.max(1, Math.round(comp[k] * (1 - cut)));
  }
  return comp;
}

function baseComposition(n) {
  const scripted = CONFIG.waves;
  if (n <= scripted.length) return { ...scripted[n - 1] };
  const last = scripted[scripted.length - 1];
  const k = n - scripted.length; // waves past the last scripted one
  const comp = {};
  for (const kind of ENEMY_KINDS) comp[kind] = Math.round((last[kind] || 0) * CONFIG.rules.endlessCountGrowth ** k);
  comp.hpMultiplier = round2(last.hpMultiplier * CONFIG.rules.endlessHpGrowth ** k);
  // (Village Halls 6-10 come from 2, 3, 3, 4, 4 corners, as they did before Village Hall 5 got a scripted wave.)
  comp.spawnPaths = Math.min(PATHS.length, last.spawnPaths + Math.floor(k / ENDLESS_WAVES_PER_EXTRA_PATH));
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
 * then Mr. Leasts, Sneaker Sharks, Bombers, Neegy Balloons last. (Neegies only come from balloons.)
 */
/**
 * The corners wave n attacks from (1-4), random every wave at every level. Wave 1 is always ['top'].
 * `maxCount` is the wave's own corner count (its base wave's spawnPaths): early villages stay modest
 * (up to one more than that), later ones can be anything from 1 to all 4.
 */
export function planPaths(state, n, maxCount) {
  if (n === 1) return ['top'];
  const most = Math.min(PATHS.length, Math.max(1, (maxCount || 1) + 1));
  return choosePaths(state, n, 1 + Math.floor(random(state) * most));
}

/**
 * The plan for the village's next wave ({ number, paths }), made ahead of time so the HUD can show it.
 * Saved with the game; a plan for an older wave number is replaced. triggerWave uses it.
 */
export function getWavePlan(state) {
  const n = nightWaveNumber(state);
  const p = state.wavePlan;
  const valid = p && p.number === n && Array.isArray(p.paths) && p.paths.length >= 1 && p.paths.every((x) => PATHS.includes(x));
  if (!valid) state.wavePlan = { number: n, paths: planPaths(state, n, scaledWaveComposition(townHallLevel(state), n).spawnPaths) };
  return state.wavePlan;
}

/** Per corner, how many of each enemy kind: { top: { grunt: 4, ... } } for the plan (or the running wave). */
export function wavePlanCounts(state) {
  const w = state.wave;
  if (w && w.phase !== 'idle' && w.counts) return w.counts;
  return countQueues(buildSpawnQueues(nextWaveComposition(state), getWavePlan(state).paths));
}

function countQueues(queues) {
  const out = {};
  for (const [p, q] of Object.entries(queues)) {
    out[p] = {};
    for (const k of q) out[p][k] = (out[p][k] || 0) + 1;
  }
  return out;
}

/**
 * Split enemies as evenly as possible across paths, then order each path's queue. Da Baby Cars (bosses)
 * lead; the rest are interleaved in proportion to their numbers, so several troop types attack at once
 * instead of one type arriving back-to-back.
 */
// Every kind a wave queues (Neegies only come from balloons), in the order their shares are dealt to the paths.
const QUEUE_ORDER = ['babycar', 'patapim', 'tank', 'breaker', 'skeleton', 'pork', 'grunt', 'slinger', 'yahu', 'thief', 'toilet', 'shark', 'bomber', 'vaca', 'balloon'];

export function buildSpawnQueues(comp, paths) {
  const share = Object.fromEntries(paths.map((p) => [p, Object.fromEntries(ENEMY_KINDS.map((k) => [k, 0]))]));
  let rotate = 0; // remainders rotate across paths so totals stay balanced
  for (const kind of QUEUE_ORDER) {
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
    for (let i = 0; i < s.babycar; i++) q.push('babycar'); // the Da Baby Car leads its path
    // Smooth proportional interleave: each step takes the kind that is furthest behind its fair share.
    const kinds = QUEUE_ORDER.filter((k) => k !== 'babycar' && s[k] > 0);
    const total = kinds.reduce((n, k) => n + s[k], 0);
    const left = Object.fromEntries(kinds.map((k) => [k, s[k]]));
    const credit = Object.fromEntries(kinds.map((k) => [k, 0]));
    for (let i = 0; i < total; i++) {
      let best = null;
      for (const k of kinds) {
        credit[k] += s[k];
        if (left[k] > 0 && (best === null || credit[k] > credit[best])) best = k;
      }
      credit[best] -= total;
      left[best]--;
      q.push(best);
    }
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
  return { number: n, th, special, specialInfo: special ? SW().types[special] : null, babyCars: special ? 0 : babyCarCount(th, n) };
}

/**
 * How many Da Baby Cars (raid bosses) normal wave n at Village Hall th brings (rules.babyCar): from
 * fromTownHall, every `every`th wave; more from lateTownHall. Special waves never have them.
 */
export function babyCarCount(th, n) {
  const B = CONFIG.rules.babyCar;
  if (!B || th < B.fromTownHall || n % B.every !== 0) return 0;
  return th >= B.lateTownHall ? B.countLate : B.count;
}

/**
 * Crowd cap (CONFIG.rules.crowdCap): a wave with more than maxEnemies (bosses not counted) keeps the same mix
 * at maxEnemies, and `pack` (its old total enemy HP / its new one) multiplies each enemy's health, damage,
 * gold and RP, so it's as strong and pays as much, with far fewer enemies on screen. pack 1 = no cap.
 */
export function applyCrowdCap(comp) {
  const cap = CONFIG.rules.crowdCap && CONFIG.rules.crowdCap.maxEnemies;
  const kinds = ENEMY_KINDS.filter((k) => !CONFIG.enemies[k].boss);
  const total = kinds.reduce((n, k) => n + (comp[k] || 0), 0);
  if (!cap || total <= cap) return { ...comp, pack: 1 };
  const before = kinds.reduce((s, k) => s + (comp[k] || 0) * CONFIG.enemies[k].hp, 0);
  const out = { ...comp };
  const f = cap / total;
  for (const k of kinds) if ((comp[k] || 0) > 0) out[k] = Math.max(1, Math.round(comp[k] * f));
  const after = kinds.reduce((s, k) => s + (out[k] || 0) * CONFIG.enemies[k].hp, 0);
  out.pack = round2(before / after);
  return out;
}

/** The composition of the village's next wave (special waves included), capped at the crowd limit. */
export function nextWaveComposition(state) {
  const { number, th, special, babyCars } = nextWaveInfo(state);
  const normal = { ...scaledWaveComposition(th, number), babycar: 0 };
  if (special) return applyCrowdCap(specialComposition(normal, special));
  return applyCrowdCap({ ...normal, babycar: babyCars });
}

/**
 * Trigger the next wave: paths chosen, queues built, and a `countdown` (s) before it attacks; the "!"
 * markers show the paths meanwhile. It goes active when the countdown runs out (or skipCountdown).
 */
export function triggerWave(state, countdown = CONFIG.rules.waveCountdown) {
  const n = nightWaveNumber(state);
  const comp = nextWaveComposition(state);
  const paths = [...getWavePlan(state).paths];
  const queues = buildSpawnQueues(comp, paths);
  state.wave = {
    phase: 'countdown',
    number: n,
    countdown: Math.max(0, countdown),
    lastTick: Math.ceil(Math.max(0, countdown)),
    paths,
    queues,
    counts: countQueues(queues), // what the HUD shows for this wave (stays as planned)
    spawnTimer: 0,
    hpMultiplier: comp.hpMultiplier,
    pack: comp.pack || 1, // crowd cap: each (non-boss) enemy counts this many times over (applyCrowdCap)
    bountyEarned: 0,
    special: comp.special || null,
    // Wave stars: buildings standing as it starts (not walls), and how many get destroyed during it.
    startBuildings: countedBuildings(state),
    lost: 0
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

/**
 * Cancel during the countdown: the wave goes back to waiting for Start Wave (same wave number; its paths are
 * picked again next time). A cancelled call never counts as a quick start, so cancelling and starting again
 * can't farm the "Bring It On" achievement.
 */
export function cancelCountdown(state) {
  const w = state.wave;
  if (!w || w.phase !== 'countdown') return false;
  const number = w.number;
  state.wave = createIdleWave();
  state.sinceWaveCleared = Infinity;
  emit(state, 'waveCancelled', { number });
  return true;
}

/** Start Now: a counting-down wave attacks on the next step. */
export function skipCountdown(state) {
  const w = state.wave;
  if (!w || w.phase !== 'countdown') return false;
  w.countdown = 0;
  return true;
}

/** The countdown ('waveTick' each second), then one enemy per path every spawnInterval seconds. */
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
      if (kind) spawnEnemy(state, kind, path, w.hpMultiplier, w.pack || 1);
    }
    // Crowd cap: packed enemies come proportionally further apart, so the wave arrives at the same strength
    // per second as the uncapped one would (just fewer, tougher enemies).
    w.spawnTimer += CONFIG.rules.spawnInterval * (w.pack || 1);
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

/** Gold that economy perks pay when a wave is beaten (added to the cleared banner's bonus). */
function economyWavePayout(state, w) {
  const cap = getCapacity(state);
  const dark = isDark(state.clock);
  let pay = 0;
  for (const b of state.buildings) {
    if (b.destroyed) continue;
    const fx = abilityFx(b);
    if (b.type === 'storage' && fx.interestPct && cap > 0) {
      const storedHere = (state.gold * storageCapacity(b)) / cap;
      pay += storedHere * fx.interestPct / 100 * (dark && fx.nightInterestMult ? fx.nightInterestMult : 1);
    }
    if (b.type === 'dj' && fx.afterPartyPct) pay += (w.bountyEarned || 0) * fx.afterPartyPct / 100;
  }
  pay += w.insured || 0;
  return pay > 0 ? addGold(state, Math.round(pay)) : 0;
}

/** Active wave with nothing alive and nothing queued -> cleared. Returns true when it just cleared. */
export function checkWaveCleared(state) {
  const w = state.wave;
  if (!w || w.phase !== 'active' || state.gameOver) return false;
  if (queuedCount(state) > 0 || state.enemies.some((e) => e.alive)) return false;
  state.wavesCleared += 1; // nights survived (the next wave is wavesCleared + 1)
  state.sinceWaveCleared = 0; // starting the next one soon counts as a quick start (dayNight.js)
  addResearchPoints(state, Math.round(waveResearchPoints(w.number) * nightLootMult(state))); // beating the wave pays research points (more at night)
  // Wave stars: how much of the village came through, and the bonus on the wave's gold and RP.
  const stars = starsFor(w.startBuildings || 0, w.lost || 0);
  const share = starBonus(stars);
  const starGold = share ? addGold(state, Math.round((w.bountyEarned || 0) * share)) : 0;
  const starRp = share ? addResearchPoints(state, Math.round((w.rpEarned || 0) * share)) : 0;
  // Kept in saves for older versions; waves no longer depend on it.
  if (townHallLevel(state) >= CONFIG.rules.maxTownHallLevel) state.nightsAtMaxTownHall = (state.nightsAtMaxTownHall || 0) + 1;
  state.enemies = [];
  state.projectiles = [];
  state.pools = [];
  state.strikes = [];
  let ruins = repairAll(state);
  resetTraps(state); // every Mousetrap is set again for the next wave
  // Once per night: Last Stand; Spellsteal and Ready Rack start over.
  for (const b of state.buildings) { b.lastStandUsed = false; b.lastStandT = 0; b.stealStacks = 0; b.rack = 0; b.djBoostT = 0; }
  // No working mine and too broke to rebuild one: the gnomes salvage the cheapest for free.
  const salvaged = salvageMine(state);
  if (salvaged) ruins--;
  // A special wave pays a bonus on top of its bounty (up to storage capacity).
  let bonus = w.special ? addGold(state, Math.floor((w.bountyEarned || 0) * SW().bonusBounty)) : 0;
  // Economy perks: Compound Interest / Night Dividend (Storage), Insurance (Storage), After Party (DJ Babyface).
  bonus += economyWavePayout(state, w);
  const cleared = { number: w.number, bounty: w.bountyEarned, rp: w.rpEarned || 0, ruins, salvaged: salvaged ? salvaged.id : null, special: w.special || null, bonus,
    stars, starGold, starRp, lost: w.lost || 0 };
  state.wave = createIdleWave();
  state.wavePlan = null; // the next wave's corners are planned fresh
  emit(state, 'waveCleared', cleared);
  return true;
}
