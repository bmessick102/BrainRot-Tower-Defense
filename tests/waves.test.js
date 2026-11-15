import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  waveComposition, choosePaths, buildSpawnQueues, triggerWave, stepWaveSpawning, checkWaveCleared,
  enemiesLeft, nightWaveNumber, waveRamp, scaledWaveComposition, nextWaveComposition, nextWaveInfo,
  specialTypesAt, specialWaveType, specialComposition, waveStrength, PATHS
} from '../src/logic/waves.js';
import { ENEMY_KINDS } from '../src/logic/enemies.js';
import { makeStateWithTownHall, seededRng } from './helpers.js';

const w4 = CONFIG.waves[3];

describe('waves.js', () => {
  it('waves 1 to 4 match config', () => {
    for (let n = 1; n <= 4; n++) expect(waveComposition(n)).toEqual({ ...CONFIG.waves[n - 1], toilet: 0 }); // (Skibidi Toilets join from Village Hall 5)
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

  it('wave 5 follows the endless formulas', () => {
    const c = waveComposition(5);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromTownHall) expect(c[k]).toBe(Math.round((w4[k] || 0) * 1.15 ** 1));
    expect(c.toilet).toBe(CONFIG.enemies.toilet.baseCount); // joins at Village Hall 5
    expect(c.grunt).toBe(40);
    expect(c.hpMultiplier).toBe(Math.round(1.2 * 1.1 * 100) / 100);
    expect(c.hpMultiplier).toBe(1.32);
    expect(c.spawnPaths).toBe(2);
  });

  it('wave 8 follows the endless formulas', () => {
    const c = waveComposition(8);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromTownHall) expect(c[k]).toBe(Math.round((w4[k] || 0) * 1.15 ** 4));
    expect(c.toilet).toBe(Math.round(CONFIG.enemies.toilet.baseCount * 1.15 ** 3));
    expect(c.grunt).toBe(61);
    expect(c.hpMultiplier).toBe(1.76);
    expect(c.spawnPaths).toBe(3);
  });

  it('all 4 corners are in play by wave 9', () => {
    expect(waveComposition(9).spawnPaths).toBe(4);
  });

  it('spawn paths cap at 4', () => {
    expect(waveComposition(11).spawnPaths).toBe(4);
    expect(waveComposition(30).spawnPaths).toBe(4);
  });

  it('splits enemies evenly and orders Tanks, Wall Breakers, Grunt/Slinger alternating, Bombers then Balloons last', () => {
    const q = buildSpawnQueues(w4, ['left', 'right']);
    const all = [...q.left, ...q.right];
    for (const k of ENEMY_KINDS) expect(all.filter((x) => x === k)).toHaveLength(w4[k] || 0);
    expect(Math.abs(q.left.length - q.right.length)).toBeLessThanOrEqual(1);
    for (const path of ['left', 'right']) {
      const list = q[path];
      const firstNonTank = list.findIndex((k) => k !== 'tank');
      expect(list.slice(0, firstNonTank).every((k) => k === 'tank')).toBe(true);
      const firstBomber = list.indexOf('bomber');
      // Bombers, then Neegy Balloons, bring up the rear.
      expect(list.slice(firstBomber).every((k) => k === 'bomber' || k === 'balloon')).toBe(true);
      expect(list.lastIndexOf('bomber')).toBeLessThan(list.indexOf('balloon'));
      // Wall Breakers come right after the Tanks, so they reach the walls first.
      const firstGrunt = list.indexOf('grunt');
      expect(list.slice(firstNonTank, firstGrunt).every((k) => k === 'breaker')).toBe(true);
      expect(list.slice(firstGrunt, firstGrunt + 4)).toEqual(['grunt', 'slinger', 'grunt', 'slinger']);
    }
  });

  it('runs countdown -> spawning -> cleared with free repair', () => {
    const state = makeStateWithTownHall({}, 1);
    const th = state.buildings[0];
    triggerWave(state);
    expect(state.wave).toMatchObject({ phase: 'countdown', number: 1, paths: ['top'] });
    expect(enemiesLeft(state)).toBe(CONFIG.waves[0].grunt);

    stepWaveSpawning(state, 0.02); // no countdown: it starts on the next step
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
      // A few big enemies: the same strength in Bitcoin Stealers would be far more than 2x the count.
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
});
