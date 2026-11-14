import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { hallIncomeRate, produceHallIncome, salvageMine, repairCost } from '../src/logic/economy.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

describe('Village Hall income', () => {
  it('is 1 gold/s at level 1, +0.5 per level, none for the ruin', () => {
    expect(hallIncomeRate(0)).toBe(0);
    expect(hallIncomeRate(1)).toBe(1);
    expect(hallIncomeRate(3)).toBe(2);
    expect(hallIncomeRate(10)).toBe(5.5);
  });

  it('pays into gold in batches of 5', () => {
    const s = makeStateWithTownHall({ gold: 0 }, 3); // 2 gold/s
    produceHallIncome(s, 2);
    expect(s.gold).toBe(0);                       // 4 so far: not a full batch
    produceHallIncome(s, 1);
    expect(s.gold).toBe(5);
    expect(s.events.filter((e) => e.name === 'hallIncome')).toHaveLength(1);
    produceHallIncome(s, 10);
    expect(s.gold).toBe(25);
  });

  it('the ruined hall makes nothing', () => {
    const s = makeStateWithTownHall({ gold: 0 }, 0);
    produceHallIncome(s, 100);
    expect(s.gold).toBe(0);
  });
});

describe('free mine salvage at dawn', () => {
  it('rebuilds the cheapest destroyed mine when none stands and you cannot afford one', () => {
    const s = makeStateWithTownHall({ gold: 0 }, 5);
    const big = addBuilding(s, 'mine', 9, 16, 4);
    const small = addBuilding(s, 'mine', 13, 20, 2);
    big.destroyed = true; big.hp = 0;
    small.destroyed = true; small.hp = 0;
    expect(salvageMine(s)).toBe(small);
    expect(small.destroyed).toBe(false);
    expect(big.destroyed).toBe(true);
  });

  it('does nothing while a mine still stands, or when you can afford the rebuild', () => {
    const s = makeStateWithTownHall({ gold: 0 });
    const a = addBuilding(s, 'mine', 9, 16);
    const b = addBuilding(s, 'mine', 13, 20);
    a.destroyed = true; a.hp = 0;
    expect(salvageMine(s)).toBeNull();            // b still works
    b.destroyed = true; b.hp = 0;
    s.gold = repairCost(a);
    expect(salvageMine(s)).toBeNull();            // can pay for it yourself
  });

  it('is no longer needed: a destroyed mine is rebuilt free as the wave is cleared', () => {
    const s = makeStateWithTownHall({ gold: 0 });
    const m = addBuilding(s, 'mine', 9, 16);
    m.destroyed = true; m.hp = 0;
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    expect(checkWaveCleared(s)).toBe(true);
    expect(m.destroyed).toBe(false);
    const ev = s.events.find((e) => e.name === 'waveCleared');
    expect(ev.data.salvaged).toBe(null);
    expect(ev.data.ruins).toBe(0);
  });
});
