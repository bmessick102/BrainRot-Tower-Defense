// Wave composition, spawn paths, spawn schedule, the wave lifecycle, and difficulty scaling.
// Difficulty: the Village Hall level picks a base wave (scripted for TH1-4, the endless formula above
// that), and every wave survived ramps it up (waveRamp), so waves keep getting harder at any hall level.
import { CONFIG } from '../config.js';
import { ENEMY_KINDS, spawnEnemy, hallWaveGrowth } from './enemies.js';
import { repairAll, salvageMine, addGold, getCapacity, storageCapacity } from './economy.js';
import { abilityFx } from './abilities.js';
import { isDark } from './clockLight.js';
import { resetTraps } from './traps.js';
import { addResearchPoints, waveResearchPoints } from './researchPoints.js';
import { townHallLevel } from './buildings.js';
import { emit, random, round2 } from './util.js';
import { isRestless, nightLootMult } from './enrage.js';
import { countedBuildings, starsFor, starBonus } from './waveStars.js';

// The ways in (the 40 x 40 map's seven entrances, clockwise from the top; never the lake): gridConfig.js PATHS.
export const PATHS = ['top', 'topRight', 'right', 'bottom', 'bottomLeft', 'upperLeft', 'topLeft'];

/** The most entrances a wave can use at Village Hall `th` (rules.entrancesByHall; past its end, the last). */
export function entrancesForHall(th) {
  const t = CONFIG.rules.entrancesByHall;
  return Math.min(PATHS.length, t[Math.max(1, Math.min(th, t.length)) - 1]);
}

/** Enemy counts, HP multiplier, and spawn path count (the hall's most entrances) for Village Hall n's base wave. */
export function waveComposition(n) {
  return { ...withLateKinds(baseComposition(n), n), spawnPaths: entrancesForHall(n) };
}

/**
 * Enemy kinds that join the waves from a Village Hall level (fromTownHall on the enemy, e.g. the Skibidi
 * Toilet): baseCount at that hall, growing like the base wave per hall after it (hallWaveGrowth in enemies.js).
 * The v0.6 kinds (OFFSET_KINDS) make room for themselves: rules.lateKindOffset of their total health comes back out of
 * the regular troops (rules.lateKindPool, each cut by the same share, never more than rules.lateKindMaxCut).
 */
export const OFFSET_KINDS = ['pork', 'skeleton', 'vaca', 'yahu', 'patapim', 'lirili', 'bicus', 'frigo', 'bombo', 'quandale', 'grimace'];

function withLateKinds(comp, n) {
  let added = 0;
  for (const k of ENEMY_KINDS) {
    const cfg = CONFIG.enemies[k];
    if (!cfg.fromTownHall || !cfg.baseCount) continue;
    comp[k] = n >= cfg.fromTownHall ? Math.round(cfg.baseCount * hallWaveGrowth(cfg.fromTownHall, n)) : 0;
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
  const grow = hallWaveGrowth(scripted.length, n), growHp = hallWaveGrowth(scripted.length, n, 'hp');
  const comp = {};
  for (const kind of ENEMY_KINDS) comp[kind] = Math.round((last[kind] || 0) * grow);
  comp.hpMultiplier = round2(last.hpMultiplier * growHp);
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
 * The entrances wave n attacks from: a random number from 1 up to `maxCount` (the hall's most, entrancesForHall),
 * each a random entrance, new every wave. Wave 1 is always ['top'].
 */
export function planPaths(state, n, maxCount) {
  if (n === 1) return ['top'];
  const most = Math.min(PATHS.length, Math.max(1, maxCount || 1));
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
const QUEUE_ORDER = ['babycar', 'grimace', 'patapim', 'lirili', 'tank', 'frigo', 'bicus', 'quandale', 'breaker', 'skeleton', 'pork', 'grunt', 'slinger', 'yahu', 'thief', 'toilet', 'shark', 'bomber', 'bombo', 'vaca', 'balloon'];

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

// ---------- themed waves (CONFIG.waveThemes, v0.7) ----------
const WT = () => CONFIG.waveThemes;
const clampHall = (th) => Math.max(1, Math.min(th, CONFIG.rules.maxTownHallLevel));
// Enemies that debut in v0.7 (new, or Brr Brr Patapim's new ability) and v0.8: an older save that already met every
// enemy at its hall still gets their debut waves (legacyDebuted). (Saves with a `debuted` list get v0.8's on their own.)
const V07_DEBUTS = ['bicus', 'frigo', 'bombo', 'lirili', 'patapim', 'quandale', 'grimace'];

/** Total enemy HP of a composition (before its hpMultiplier): the strength a themed wave keeps. */
export function waveStrength(comp) {
  return ENEMY_KINDS.reduce((sum, k) => sum + (comp[k] || 0) * CONFIG.enemies[k].hp, 0);
}

/** The rotating themes possible at Village Hall th: those whose `needs` kinds are in its base wave, in `order`. */
export function themesAt(th) {
  const base = waveComposition(clampHall(th));
  return WT().order.filter((key) => WT().types[key].needs.every((k) => (base[k] || 0) > 0));
}

/** Kinds that join the waves by Village Hall (fromTownHall), in ENEMY_KINDS order: the ones that get a debut wave. */
export function debutKindsAt(th) {
  return ENEMY_KINDS.filter((k) => { const c = CONFIG.enemies[k]; return c.fromTownHall && c.baseCount && c.fromTownHall <= th; });
}

/** For a save from before debut waves: every debut kind of its hall counts as met, except the v0.7 ones. */
export function legacyDebuted(th) {
  return debutKindsAt(th).filter((k) => !V07_DEBUTS.includes(k));
}

/** The enemy whose debut wave is next for this village (or null): the first debut kind of its hall it hasn't met. */
export function nextDebut(state) {
  if (!Array.isArray(state.debuted)) return null; // (only a real village keeps the list; GameState always has one)
  const met = new Set(state.debuted);
  return debutKindsAt(townHallLevel(state)).find((k) => !met.has(k)) || null;
}

/**
 * The theme key of wave n at Village Hall th (null = a plain wave): 'debut:<kind>' if `debutKind` is due, else
 * 'boss' every boss.every-th wave, else the next rotating theme. Wave 1 (and anything before fromWave) is plain.
 */
export function waveThemeKey(th, n, debutKind = null) {
  if (n < WT().fromWave) return null;
  if (debutKind) return `debut:${debutKind}`;
  if (WT().boss.every && n % WT().boss.every === 0) return 'boss';
  const list = themesAt(th);
  return list.length ? list[(n - WT().fromWave) % list.length] : null;
}

/** A theme's { name, hint, pure, bonus } (bonus: share of the bounty paid on top when the wave is cleared). */
export function themeInfo(key) {
  if (!key) return null;
  if (key === 'boss') { const B = WT().boss; return { name: B.name, hint: B.hint, pure: false, bonus: B.bonusBounty }; }
  if (key.startsWith('debut:')) {
    const cfg = CONFIG.enemies[key.slice(6)];
    return cfg ? { name: `New: ${cfg.name}`, hint: `A new enemy joins the raid: ${cfg.role}`, pure: false, bonus: 0, debut: key.slice(6) } : null;
  }
  const t = WT().types[key];
  return t ? { name: t.name, hint: t.hint, pure: !!t.pure, bonus: t.pure ? WT().bonusBounty : 0 } : null;
}

/** The theme's mix, share and strength (boss and debut themes are built from the wave itself). */
function themeSpec(normal, key) {
  if (key === 'boss') {
    const B = WT().boss;
    const kinds = ENEMY_KINDS.filter((k) => (normal[k] || 0) > 0 && !CONFIG.enemies[k].boss)
      .sort((a, b) => CONFIG.enemies[b].hp - CONFIG.enemies[a].hp).slice(0, B.headliners);
    return { mix: Object.fromEntries(kinds.map((k) => [k, 1])), share: B.share, strength: B.strength };
  }
  if (key.startsWith('debut:')) return { mix: { [key.slice(6)]: 1 }, share: WT().debut.share, strength: 1 };
  const t = WT().types[key];
  return { mix: t.mix, share: t.pure ? 1 : t.share, strength: t.strength ?? 1, pure: !!t.pure };
}

/**
 * A normal wave re-mixed into theme `key`: `share` of its total enemy HP (x the theme's strength) goes to the theme's
 * mix (kinds the wave has; a pure theme with `mix: null` = its ground kinds in their own proportions), and the rest
 * of the normal mix stays at (1 - share). Same HP multiplier and spawn corners. Too many enemies -> fewer, tougher ones.
 */
export function themedComposition(normal, key) {
  const spec = themeSpec(normal, key);
  const hp = (k) => CONFIG.enemies[k].hp;
  const weights = {};
  if (spec.mix) {
    for (const [k, w] of Object.entries(spec.mix)) if ((normal[k] || 0) > 0) weights[k] = w;
  } else {
    for (const k of ENEMY_KINDS) if ((normal[k] || 0) > 0 && CONFIG.enemies[k].type !== 'air') weights[k] = normal[k] * hp(k);
  }
  const totalW = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!totalW) return { ...normal };
  const budget = waveStrength(normal) * spec.strength * spec.share;
  const comp = { ...normal, special: key };
  for (const k of ENEMY_KINDS) comp[k] = spec.pure ? 0 : Math.round((normal[k] || 0) * (1 - spec.share));
  for (const [k, w] of Object.entries(weights)) comp[k] += Math.max(1, Math.round((budget * w) / totalW / hp(k)));
  // Ability enemies are capped (waveThemes.headlinerCap); what they'd have had goes to the other troops.
  const cap = WT().headlinerCap;
  let spare = 0;
  if (cap) {
    for (const k of cap.kinds) {
      if (!(comp[k] > 0)) continue;
      const max = Math.max(Math.round((normal[k] || 0) * cap.mult), (normal[k] || 0) + cap.extra);
      if (comp[k] > max) { spare += (comp[k] - max) * hp(k); comp[k] = max; }
    }
    const others = ENEMY_KINDS.filter((k) => comp[k] > 0 && !cap.kinds.includes(k) && !CONFIG.enemies[k].boss);
    const pool = others.reduce((a, k) => a + comp[k] * hp(k), 0);
    if (spare > 0 && pool > 0) for (const k of others) comp[k] = Math.round(comp[k] * (1 + spare / pool));
  }
  const count = (c) => ENEMY_KINDS.reduce((n, k) => n + (c[k] || 0), 0);
  const total = count(comp), max = Math.max(1, Math.round(count(normal) * WT().maxEnemiesFactor));
  if (total > max) {
    const f = max / total;
    for (const k of ENEMY_KINDS) if (comp[k] > 0) comp[k] = Math.max(1, Math.floor(comp[k] * f));
    comp.hpMultiplier = round2(normal.hpMultiplier / f);
  }
  return comp;
}

/** The village's next wave: its theme (key and info, or null), Village Hall level, wave number and raid bosses. */
export function nextWaveInfo(state) {
  const th = townHallLevel(state), n = nightWaveNumber(state);
  const theme = waveThemeKey(th, n, n >= WT().fromWave ? nextDebut(state) : null);
  const info = themeInfo(theme);
  const babyCars = theme === 'boss' ? bossWaveCars(th) : info && info.pure ? 0 : babyCarCount(th, n);
  // (`special` / `specialInfo`: the theme under the names the HUD and tips have always read.)
  return { number: n, th, theme, themeInfo: info, special: theme, specialInfo: info, babyCars };
}

/** Da Baby Cars on a Boss Wave: one more than its hall's usual count (none before the hall that has them). */
export function bossWaveCars(th) {
  const B = CONFIG.rules.babyCar;
  if (!B || th < B.fromTownHall) return 0;
  return (th >= B.lateTownHall ? B.countLate : B.count) + 1;
}

/**
 * How many Da Baby Cars (raid bosses) wave n at Village Hall th brings on its own schedule (rules.babyCar): from
 * fromTownHall, every `every`th wave; more from lateTownHall. (Pure themes never have them; Boss Waves bring more.)
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

/** The composition of the village's next wave (its theme included), capped at the crowd limit. */
export function nextWaveComposition(state) {
  const { number, th, theme, babyCars } = nextWaveInfo(state);
  const normal = { ...scaledWaveComposition(th, number), babycar: 0 };
  const comp = theme ? themedComposition(normal, theme) : normal;
  return applyCrowdCap({ ...comp, babycar: babyCars });
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
    special: comp.special || null, // its theme key (waveThemes); the HUD names it
    // Wave stars: buildings standing as it starts (not walls), and how many get destroyed during it.
    startBuildings: countedBuildings(state),
    lost: 0
  };
  // A debut wave: this village has now met that enemy (no debut for it again).
  const info = themeInfo(state.wave.special);
  if (info && info.debut && !(state.debuted || []).includes(info.debut)) state.debuted = [...(state.debuted || []), info.debut];
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
  // A cancelled debut wave gives the debut back (it comes again when the wave is started for real).
  const info = themeInfo(w.special);
  if (info && info.debut && Array.isArray(state.debuted)) state.debuted = state.debuted.filter((k) => k !== info.debut);
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
  state.nets = []; // Missile Silo nets (skyNet.js)
  state.barriers = []; // Gandolf the Grand's walls (wizardWall.js)
  state.shatters = []; // KSI Frost Fortress's bursts waiting to go off (shatter.js)
  state.jugs = [];     // Diddy Trebuchet's oil jugs still in the air (barrelBurst.js)
  let ruins = repairAll(state);
  resetTraps(state); // every Mousetrap is set again for the next wave
  // Once per night: Last Stand; Spellsteal and Ready Rack start over.
  for (const b of state.buildings) { b.lastStandUsed = false; b.lastStandT = 0; b.stealStacks = 0; b.rack = 0; b.djBoostT = 0; }
  // No working mine and too broke to rebuild one: the gnomes salvage the cheapest for free.
  const salvaged = salvageMine(state);
  if (salvaged) ruins--;
  // A pure theme (the old special waves) or a Boss Wave pays a bonus on top of its bounty (up to storage capacity).
  const theme = themeInfo(w.special);
  let bonus = theme && theme.bonus ? addGold(state, Math.floor((w.bountyEarned || 0) * theme.bonus)) : 0;
  // Economy perks: Compound Interest / Night Dividend (Storage), Insurance (Storage), After Party (DJ Babyface).
  bonus += economyWavePayout(state, w);
  const cleared = { number: w.number, bounty: w.bountyEarned, rp: w.rpEarned || 0, ruins, salvaged: salvaged ? salvaged.id : null, special: w.special || null, bonus,
    stars, starGold, starRp, lost: w.lost || 0 };
  state.wave = createIdleWave();
  state.wavePlan = null; // the next wave's corners are planned fresh
  emit(state, 'waveCleared', cleared);
  return true;
}
