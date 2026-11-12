import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  waveComposition, choosePaths, buildSpawnQueues, triggerWave, stepWaveSpawning, checkWaveCleared,
  enemiesLeft, nightWaveNumber, PATHS
} from '../src/logic/waves.js';
import { ENEMY_KINDS } from '../src/logic/enemies.js';
import { makeStateWithTownHall, seededRng } from './helpers.js';

const w4 = CONFIG.waves[3];

describe('waves.js', () => {
  it('waves 1 to 4 match config', () => {
    for (let n = 1; n <= 4; n++) expect(waveComposition(n)).toEqual(CONFIG.waves[n - 1]);
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
    for (const k of ENEMY_KINDS) expect(c[k]).toBe(Math.round(w4[k] * 1.15 ** 1));
    expect(c.grunt).toBe(40);
    expect(c.hpMultiplier).toBe(Math.round(1.2 * 1.1 * 100) / 100);
    expect(c.hpMultiplier).toBe(1.32);
    expect(c.spawnPaths).toBe(2);
  });

  it('wave 8 follows the endless formulas', () => {
    const c = waveComposition(8);
    for (const k of ENEMY_KINDS) expect(c[k]).toBe(Math.round(w4[k] * 1.15 ** 4));
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
    for (const k of ENEMY_KINDS) expect(all.filter((x) => x === k)).toHaveLength(w4[k]);
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

    stepWaveSpawning(state, CONFIG.rules.waveCountdown - 0.01);
    expect(state.wave.phase).toBe('countdown');
    stepWaveSpawning(state, 0.02);
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

  it("each night's wave matches the Town Hall level", () => {
    for (let th = 1; th < CONFIG.rules.maxTownHallLevel; th++) {
      expect(nightWaveNumber(makeStateWithTownHall({}, th))).toBe(th);
    }
  });

  it('at max Town Hall every night survived makes the next one harder', () => {
    const max = CONFIG.rules.maxTownHallLevel;
    const state = makeStateWithTownHall({}, max);
    expect(nightWaveNumber(state)).toBe(max);
    for (let night = 1; night <= 3; night++) {
      triggerWave(state);
      state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = [];
      checkWaveCleared(state);
      expect(state.nightsAtMaxTownHall).toBe(night);
      expect(nightWaveNumber(state)).toBe(max + night);
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
});
