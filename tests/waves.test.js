import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  waveComposition, choosePaths, buildSpawnQueues, triggerWave, stepWaveSpawning, checkWaveCleared,
  enemiesLeft, nightWaveNumber, waveRamp, scaledWaveComposition, nextWaveComposition, nextWaveInfo,
  getWavePlan, wavePlanCounts, specialTypesAt, specialWaveType, specialComposition, waveStrength, PATHS, skipCountdown, cancelCountdown
} from '../src/logic/waves.js';
import { startTutorialWave } from '../src/logic/dayNight.js';
import { TUTORIAL_NIGHT_STEP } from '../src/logic/tutorial.js';
import { ENEMY_KINDS } from '../src/logic/enemies.js';
import { makeStateWithTownHall, seededRng } from './helpers.js';

const w4 = CONFIG.waves[3];
const w5 = CONFIG.waves[4];

describe('waves.js', () => {
  it('waves 1 to 5 match config (Village Hall 5 has a scripted base wave too)', () => {
    expect(CONFIG.waves).toHaveLength(5);
    for (let n = 1; n <= 4; n++) expect(waveComposition(n)).toEqual({ ...CONFIG.waves[n - 1], toilet: 0 }); // (Skibidi Toilets join from Village Hall 5)
    expect(waveComposition(5)).toEqual({ ...CONFIG.waves[4], toilet: CONFIG.enemies.toilet.baseCount });
  });

  it('wave 1 always uses the top path', () => {
    for (let seed = 1; seed < 30; seed++) {
      expect(choosePaths({ rng: seededRng(seed) }, 1, 1)).toEqual(['top']);
    }
  });

  it('other waves pick random paths without repeats', () => {
    for (let seed = 1; seed < 30; seed++) {
      const paths = choosePaths({ rng: seededRng(seed) }, 3, 2);
      expect(paths).toHaveLength(2);
      expect(new Set(paths).size).toBe(2);
      paths.forEach((p) => expect(PATHS).toContain(p));
    }
  });

  it('wave 6 follows the endless formulas from the Village Hall 5 base', () => {
    const { endlessCountGrowth: cg, endlessHpGrowth: hg } = CONFIG.rules;
    const c = waveComposition(6);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromTownHall) expect(c[k]).toBe(Math.round((w5[k] || 0) * cg));
    expect(c.toilet).toBe(Math.round(CONFIG.enemies.toilet.baseCount * cg)); // joined at Village Hall 5
    expect(c.hpMultiplier).toBe(Math.round(w5.hpMultiplier * hg * 100) / 100);
    expect(c.spawnPaths).toBe(2);
  });

  it('wave 8 follows the endless formulas', () => {
    const { endlessCountGrowth: cg, endlessHpGrowth: hg } = CONFIG.rules;
    const c = waveComposition(8);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromTownHall) expect(c[k]).toBe(Math.round((w5[k] || 0) * cg ** 3));
    expect(c.toilet).toBe(Math.round(CONFIG.enemies.toilet.baseCount * cg ** 3));
    expect(c.hpMultiplier).toBe(Math.round(w5.hpMultiplier * hg ** 3 * 100) / 100);
    expect(c.spawnPaths).toBe(3);
  });

  it('spawn corners by Village Hall: 1, 1, 2, 2, 2, 2, 3, 3, 4, 4', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => waveComposition(n).spawnPaths)).toEqual([1, 1, 2, 2, 2, 2, 3, 3, 4, 4]);
  });

  it('each Village Hall base wave is tougher than the one before (total enemy HP x hpMultiplier)', () => {
    let prev = 0;
    for (let n = 1; n <= 10; n++) {
      const c = waveComposition(n);
      const s = waveStrength(c) * c.hpMultiplier;
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('all 4 corners are in play by wave 9', () => {
    expect(waveComposition(9).spawnPaths).toBe(4);
  });

  it('spawn paths cap at 4', () => {
    expect(waveComposition(11).spawnPaths).toBe(4);
    expect(waveComposition(30).spawnPaths).toBe(4);
  });

  it('splits enemies evenly and interleaves the troop types instead of sending one type at a time', () => {
    const q = buildSpawnQueues(w4, ['left', 'right']);
    const all = [...q.left, ...q.right];
    for (const k of ENEMY_KINDS) expect(all.filter((x) => x === k)).toHaveLength(w4[k] || 0);
    expect(Math.abs(q.left.length - q.right.length)).toBeLessThanOrEqual(1);
    for (const path of ['left', 'right']) {
      const list = q[path];
      // No type forms a long back-to-back run, and the first 10 already mix at least 3 types.
      let run = 1, longest = 1;
      for (let i = 1; i < list.length; i++) { run = list[i] === list[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
      expect(longest).toBeLessThanOrEqual(3);
      expect(new Set(list.slice(0, 10)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('the Da Baby Car boss still leads its path', () => {
    const q = buildSpawnQueues({ ...w4, babycar: 1 }, ['top']);
    expect(q.top[0]).toBe('babycar');
  });

  it('the wave plan has 1-4 random corners, is made ahead, and is kept until the wave is cleared', () => {
    const seen = new Set();
    for (let seed = 1; seed < 80; seed++) {
      const state = makeStateWithTownHall({}, 10);
      state.rng = seededRng(seed);
      state.wavesCleared = 20;
      const plan = getWavePlan(state);
      expect(plan.number).toBe(21);
      expect(new Set(plan.paths).size).toBe(plan.paths.length);
      seen.add(plan.paths.length);
      expect(getWavePlan(state)).toBe(plan); // stable until the wave is cleared
      triggerWave(state);
      expect(state.wave.paths).toEqual(plan.paths);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it('wave 1 plans only the top corner; the plan is replaced for a new wave number', () => {
    const state = makeStateWithTownHall({}, 1);
    expect(getWavePlan(state).paths).toEqual(['top']);
    state.wavesCleared = 3;
    expect(getWavePlan(state).number).toBe(4);
  });

  it('wavePlanCounts reports per-corner enemy counts that add up to the wave', () => {
    const state = makeStateWithTownHall({}, 3);
    state.wavesCleared = 2;
    const counts = wavePlanCounts(state);
    const total = Object.values(counts).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
    const comp = nextWaveComposition(state);
    expect(total).toBe(ENEMY_KINDS.reduce((n, k) => n + (comp[k] || 0), 0));
  });

  it('runs countdown -> spawning -> cleared with free repair', () => {
    const state = makeStateWithTownHall({}, 1);
    const th = state.buildings[0];
    triggerWave(state);
    expect(state.wave).toMatchObject({ phase: 'countdown', number: 1, paths: ['top'] });
    expect(enemiesLeft(state)).toBe(CONFIG.waves[0].grunt);

    // The countdown: a tick each second, nothing spawns until it runs out.
    for (let t = 0; t < CONFIG.rules.waveCountdown - 0.55; t += 0.1) stepWaveSpawning(state, 0.1);
    expect(state.wave.phase).toBe('countdown');
    expect(state.enemies).toHaveLength(0);
    expect(state.events.filter((e) => e.name === 'waveTick').length).toBe(CONFIG.rules.waveCountdown - 1);
    stepWaveSpawning(state, 0.52);
    expect(state.wave.phase).toBe('active');
    expect(state.enemies).toHaveLength(1);
    stepWaveSpawning(state, CONFIG.rules.spawnInterval);
    expect(state.enemies).toHaveLength(2);

    for (let i = 0; i < 100; i++) stepWaveSpawning(state, CONFIG.rules.spawnInterval);
    expect(state.enemies).toHaveLength(CONFIG.waves[0].grunt);

    th.hp = 1;
    expect(checkWaveCleared(state)).toBe(false);
    state.enemies.forEach((e) => { e.alive = false; });
    expect(checkWaveCleared(state)).toBe(true);
    expect(state.wavesCleared).toBe(1);
    expect(state.wave.phase).toBe('idle');
    expect(th.hp).toBe(CONFIG.townHall.levels[0].hp);
    expect(state.events.some((e) => e.name === 'waveCleared')).toBe(true);
  });

  it('waves are numbered in the order they are fought, whatever the Village Hall level', () => {
    for (let th = 1; th <= CONFIG.rules.maxTownHallLevel; th++) {
      expect(nightWaveNumber(makeStateWithTownHall({}, th))).toBe(1);
      expect(nightWaveNumber(makeStateWithTownHall({ wavesCleared: 6 }, th))).toBe(7);
    }
  });

  it('the Village Hall picks the base wave; the first wave is exactly that base', () => {
    for (let th = 1; th <= 4; th++) expect(scaledWaveComposition(th, 1)).toEqual({ ...CONFIG.waves[th - 1], babycar: 0, toilet: 0 }); // (no Da Baby Cars or Skibidi Toilets in these base waves)
    expect(scaledWaveComposition(7, 1)).toEqual(waveComposition(7));
    expect(scaledWaveComposition(12, 1)).toEqual(waveComposition(CONFIG.rules.maxTownHallLevel)); // capped
  });

  it('every wave survived ramps up enemies and HP, even at the same Village Hall', () => {
    const r = CONFIG.rules.waveRamp;
    expect(waveRamp(1)).toEqual({ count: 1, hp: 1 });
    expect(waveRamp(11).count).toBeCloseTo(1 + 10 * r.countPerWave, 5);
    expect(waveRamp(11).hp).toBeCloseTo(1 + 10 * r.hpPerWave, 5);
    const base = CONFIG.waves[1]; // Village Hall 2
    let prev = null;
    for (const n of [1, 5, 10, 20]) {
      const c = scaledWaveComposition(2, n);
      expect(c.grunt).toBe(Math.round(base.grunt * waveRamp(n).count));
      expect(c.hpMultiplier).toBeCloseTo(base.hpMultiplier * waveRamp(n).hp, 2);
      expect(c.bomber).toBe(0); // kinds the hall's base wave doesn't have never show up
      expect(c.spawnPaths).toBe(base.spawnPaths);
      if (prev) { expect(c.grunt).toBeGreaterThan(prev.grunt); expect(c.hpMultiplier).toBeGreaterThan(prev.hpMultiplier); }
      prev = c;
    }
  });

  it('clearing waves at the same Village Hall makes the next one bigger', () => {
    const state = makeStateWithTownHall({}, 3);
    const total = (c) => ENEMY_KINDS.reduce((n, k) => n + (c[k] || 0), 0);
    const normalNext = () => scaledWaveComposition(3, nightWaveNumber(state)); // (wave 3 is a special wave)
    let before = total(normalNext());
    for (let night = 1; night <= 3; night++) {
      triggerWave(state);
      expect(state.wave.number).toBe(night);
      state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = [];
      checkWaveCleared(state);
      const after = total(normalNext());
      expect(after).toBeGreaterThan(before);
      before = after;
    }
    expect(state.wavesCleared).toBe(3);
  });

  it('nights below max Town Hall do not count toward the max-level ramp', () => {
    const state = makeStateWithTownHall({}, 2);
    triggerWave(state);
    state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = [];
    checkWaveCleared(state);
    expect(state.nightsAtMaxTownHall || 0).toBe(0);
    expect(state.wavesCleared).toBe(1);
  });

  describe('special waves', () => {
    const SW = CONFIG.specialWaves;
    const kinds = (c) => ENEMY_KINDS.filter((k) => c[k] > 0);

    it('come every Nth wave, rotating through the types the Village Hall has unlocked', () => {
      expect(specialWaveType(4, 1)).toBeNull();
      expect(specialWaveType(4, SW.every + 1)).toBeNull();
      const seen = [];
      for (let i = 1; i <= SW.order.length; i++) seen.push(specialWaveType(4, i * SW.every));
      expect(seen).toEqual(SW.order); // every type once, in order
      expect(specialWaveType(1, SW.every)).toBeNull(); // nothing unlocked yet at Village Hall 1
    });

    it('only show up once their enemies are in the normal waves (there is always a counter)', () => {
      expect(specialTypesAt(1)).toEqual([]);
      expect(specialTypesAt(2)).not.toContain('air');
      expect(specialTypesAt(3)).toContain('air');
      expect(specialTypesAt(3)).not.toContain('siege'); // no Tanks until Village Hall 4
      expect(specialTypesAt(4)).toEqual(SW.order);
    });

    it('keep about the same strength as the normal wave, all of one kind', () => {
      const normal = scaledWaveComposition(4, 9);
      const air = specialComposition(normal, 'air');
      expect(kinds(air).every((k) => CONFIG.enemies[k].type === 'air')).toBe(true);
      const ground = specialComposition(normal, 'ground');
      expect(kinds(ground).some((k) => CONFIG.enemies[k].type === 'air')).toBe(false);
      expect(kinds(specialComposition(normal, 'siege')).sort()).toEqual(['breaker', 'tank']);
      expect(kinds(specialComposition(normal, 'heist'))).toContain('thief');
      for (const key of SW.order) {
        const c = specialComposition(normal, key);
        expect(c.special).toBe(key);
        expect(c.spawnPaths).toBe(normal.spawnPaths);
        const ratio = (waveStrength(c) * c.hpMultiplier) / (waveStrength(normal) * normal.hpMultiplier);
        expect(ratio).toBeGreaterThan(SW.types[key].strength * 0.85);
        expect(ratio).toBeLessThan(SW.types[key].strength * 1.15);
      }
    });

    it('never have more than maxEnemiesFactor x the normal count (the rest goes into HP)', () => {
      // A few big enemies: the same strength in Mr. Leasts would be far more than 2x the count.
      const normal = { ...scaledWaveComposition(4, 1), grunt: 1, slinger: 0, bomber: 0, tank: 3, shark: 0, thief: 1, breaker: 0, balloon: 0 };
      const c = specialComposition(normal, 'heist');
      expect(kinds(c).reduce((n, k) => n + c[k], 0)).toBeLessThanOrEqual(Math.round(5 * SW.maxEnemiesFactor));
      expect(c.hpMultiplier).toBeGreaterThan(normal.hpMultiplier);
    });

    it('the next wave is announced ahead, triggered as that type, and pays a bonus when cleared', () => {
      const state = makeStateWithTownHall({ wavesCleared: SW.every - 1, gold: 0 }, 3);
      const info = nextWaveInfo(state);
      expect(info.special).toBe(SW.order[0]);
      expect(info.specialInfo.name).toBe(SW.types[SW.order[0]].name);
      triggerWave(state);
      expect(state.wave.special).toBe(SW.order[0]);
      state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = []; state.wave.bountyEarned = 40;
      state.wave.lost = state.wave.startBuildings; // 1 star: no star bonus, only the special wave's
      checkWaveCleared(state);
      const cleared = state.events.find((e) => e.name === 'waveCleared').data;
      expect(cleared).toMatchObject({ special: SW.order[0], bonus: Math.floor(40 * SW.bonusBounty) });
      expect(state.gold).toBe(cleared.bonus);
      expect(nextWaveInfo(state).special).toBeNull(); // the wave after is normal again
    });
  });

  it('Start Now skips the rest of the countdown; the tutorial wave counts down for less', () => {
    const state = makeStateWithTownHall({}, 1);
    triggerWave(state);
    stepWaveSpawning(state, 5);
    expect(skipCountdown(state)).toBe(true);
    stepWaveSpawning(state, 0.01);
    expect(state.wave.phase).toBe('active');
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(skipCountdown(state)).toBe(false); // already attacking
    const tut = makeStateWithTownHall({ tutorialDone: false, tutorialStep: TUTORIAL_NIGHT_STEP }, 1);
    startTutorialWave(tut);
    expect(tut.wave.countdown).toBe(CONFIG.rules.tutorialCountdown);
  });

  it('Cancel during the countdown puts the wave back (same number), and never as a quick start', () => {
    const state = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10 }, 1);
    state.sinceWaveCleared = 0;
    triggerWave(state);
    const n = state.wave.number;
    stepWaveSpawning(state, 5);
    expect(cancelCountdown(state)).toBe(true);
    expect(state.wave.phase).toBe('idle');
    expect(state.events.some((e) => e.name === 'waveCancelled' && e.data.number === n)).toBe(true);
    expect(nightWaveNumber(state)).toBe(n);
    expect(state.sinceWaveCleared).toBe(Infinity);
    stepWaveSpawning(state, 60);
    expect(state.enemies).toHaveLength(0); // nothing comes
    triggerWave(state); stepWaveSpawning(state, CONFIG.rules.waveCountdown + 0.1);
    expect(cancelCountdown(state)).toBe(false); // too late once it attacks
  });
});
