import { describe, expect, it } from 'vitest';
import { GameState } from '../src/state/GameState.js';
import { SAVE_KEYS, loadGame } from '../src/logic/save.js';
import { TUTORIAL_DONE_STEP } from '../src/logic/tutorial.js';
import { addBuilding } from './helpers.js';

describe('hero recovery during raids', () => {
  it('keeps independent timers through a save, a new raid, and 4× simulation', () => {
    const data = new Map();
    const storage = { setItem: (k, v) => data.set(k, v), getItem: (k) => data.get(k) ?? null };
    const s = new GameState({ storage });
    s.startNew();
    s.buildings[0].level = 10;
    s.tutorialDone = true;
    s.tutorialStep = TUTORIAL_DONE_STEP;
    const king = addBuilding(s, 'altar', 19, 25);
    const queen = addBuilding(s, 'queenAltar', 21, 25);
    const mage = addBuilding(s, 'mageAltar', 23, 25);
    [king.heroSleep, queen.heroSleep, mage.heroSleep] = [0.024, 0.24, 0.54];
    expect(s.startWave().ok).toBe(true);
    expect(s.cancelWave()).toBe(true);
    expect(s.startWave().ok).toBe(true);

    const back = new GameState({ storage });
    back.loadFromSave(loadGame(storage, SAVE_KEYS.checkpoint).data);
    expect(back.buildings.slice(1).map((b) => b.heroSleep)).toEqual([0.024, 0.24, 0.54]);
    expect(back.startWave().ok).toBe(true);
    expect(back.startWaveNow()).toBe(true);
    back.update(0.016, 0.004);
    expect(back.wave.phase).toBe('active');
    expect([back.hero.status, back.queen.status, back.mage.status]).toEqual(['asleep', 'asleep', 'asleep']);
    expect([back.useFeast().ok, back.useEncore().ok, back.useAegis().ok]).toEqual([false, false, false]);
    for (let i = 0; i < 24; i++) back.update(0.05, 0.0125);
    expect(back.hero.status).not.toBe('asleep');
    expect(back.queen.status).not.toBe('asleep');
    expect(back.mage.status).toBe('asleep');
    expect(back.mage.sleepT).toBeCloseTo(0.236);
    expect(back.mage.zaps).toBe(0);
    expect(back.useAegis().ok).toBe(false);
  });
});
