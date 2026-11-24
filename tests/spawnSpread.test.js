// v0.12.5: many-sided waves spawn more slowly per entrance, and their entrances open one at a time.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { triggerWave, stepWaveSpawning, spawnGap, startingEntrances } from '../src/logic/waves.js';
import { makeStateWithTownHall } from './helpers.js';

const S = CONFIG.rules.spawnSpread;

describe('spawn spread', () => {
  it('each entrance spawns more slowly the more entrances are open', () => {
    expect(spawnGap(1)).toBeCloseTo(0.8);
    expect(spawnGap(2)).toBeCloseTo(1.0);
    expect(spawnGap(4)).toBeCloseTo(1.4);
    expect(spawnGap(8)).toBeCloseTo(2.2);
  });

  it('a wave starts from one entrance (two from 5 or more)', () => {
    expect(startingEntrances(1)).toBe(1);
    expect(startingEntrances(3)).toBe(1);
    expect(startingEntrances(S.startTwoFrom)).toBe(2);
    expect(startingEntrances(7)).toBe(2);
  });

  it('only the open entrances spawn, and the next one joins every few seconds', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: 60 }, 13);
    triggerWave(s, 0);
    const w = s.wave;
    expect(w.paths.length).toBeGreaterThan(2);
    // Make every entrance's queue long so none runs out early.
    for (const p of w.paths) w.queues[p] = Array(200).fill('grunt');
    stepWaveSpawning(s, 0.01);
    const start = startingEntrances(w.paths.length);
    expect(w.open).toBe(start);
    const sides = () => new Set(s.events.filter((e) => e.name === 'enemySpawned').map((e) => e.data.path)).size;
    expect(sides()).toBe(start);
    for (let t = 0; t < S.every - 0.5; t += 0.1) stepWaveSpawning(s, 0.1);
    expect(w.open).toBe(start);
    for (let t = 0; t < 1; t += 0.1) stepWaveSpawning(s, 0.1);
    expect(w.open).toBe(start + 1);
    for (let t = 0; t < 2; t += 0.1) stepWaveSpawning(s, 0.1);
    expect(sides()).toBe(start + 1);
  });

  it("an entrance that runs out doesn't hold the next one back", () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: 60 }, 13);
    triggerWave(s, 0);
    const w = s.wave;
    for (const p of w.paths) w.queues[p] = [];
    w.queues[w.paths[w.paths.length - 1]] = ['grunt'];
    for (let t = 0; t < 1; t += 0.1) stepWaveSpawning(s, 0.1);
    expect(s.enemies.length).toBe(1); // the last entrance opened early and sent its enemy
  });
});
