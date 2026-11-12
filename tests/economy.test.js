import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createBuilding } from '../src/logic/buildings.js';
import { getCapacity, collectMine, produceMines, sellRefund, repairCost, checkRepair, repairBuilding, repairAll, storageDrainAmount, addGold } from '../src/logic/economy.js';
import { damageBuilding } from '../src/logic/combat.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const thCap = CONFIG.townHall.levels[0].capacity;
const storageCap = CONFIG.storage.levels[0].capacity;

describe('economy.js', () => {
  it('capacity = town hall + every storage, destroyed or not', () => {
    const state = makeStateWithTownHall();
    expect(getCapacity(state)).toBe(thCap);
    const s = addBuilding(state, 'storage', 21, 15);
    expect(getCapacity(state)).toBe(thCap + storageCap);
    s.destroyed = true;
    expect(getCapacity(state)).toBe(thCap + storageCap);
  });

  it('gold never exceeds capacity', () => {
    const state = makeStateWithTownHall({ gold: thCap - 5 });
    expect(addGold(state, 100)).toBe(5);
    expect(state.gold).toBe(thCap);
  });

  it('collect stops at capacity and leaves the rest in the mine', () => {
    const state = makeStateWithTownHall({ gold: thCap - 30 });
    const mine = addBuilding(state, 'mine', 13, 15);
    mine.stock = 100;
    const r = collectMine(state, mine);
    expect(r.collected).toBe(30);
    expect(state.gold).toBe(thCap);
    expect(mine.stock).toBe(70);
    const again = collectMine(state, mine);
    expect(again).toEqual({ collected: 0, storageFull: true });
    expect(mine.stock).toBe(70);
  });

  it('mines cannot be collected while a wave is attacking, and their stock is kept', () => {
    const state = makeStateWithTownHall({ gold: 0 });
    const mine = addBuilding(state, 'mine', 13, 15);
    mine.stock = 50;
    state.wave = { ...state.wave, phase: 'active' };
    expect(collectMine(state, mine)).toEqual({ collected: 0, storageFull: false, waveActive: true });
    expect(state.gold).toBe(0);
    expect(mine.stock).toBe(50);
    state.wave.phase = 'countdown'; // the dusk countdown is still fine
    expect(collectMine(state, mine).collected).toBe(50);
  });

  it('mine stock stops at its cap and destroyed mines do not produce', () => {
    const state = makeStateWithTownHall();
    const mine = addBuilding(state, 'mine', 13, 15);
    const { production, stockCap } = CONFIG.mine.levels[0];
    produceMines(state, 1);
    expect(mine.stock).toBeCloseTo(production);
    produceMines(state, 100000);
    expect(mine.stock).toBe(stockCap);
    mine.stock = 0; mine.destroyed = true;
    produceMines(state, 10);
    expect(mine.stock).toBe(0);
  });

  it('sell refunds 50% of everything spent (build plus upgrades)', () => {
    const state = makeStateWithTownHall({}, 3);
    const cannon = addBuilding(state, 'cannon', 13, 15, 3);
    const spent = CONFIG.defenses.cannon.levels.slice(0, 3).reduce((s, l) => s + l.cost, 0);
    expect(sellRefund(cannon)).toBe(Math.round(spent * CONFIG.rules.sellRefund));
    expect(sellRefund(cannon)).toBe(Math.round(spent / 2));
  });

  it('rebuilding costs 30% of the building current level cost, any time, but never for walls', () => {
    const state = makeStateWithTownHall({}, 3);
    const cannon = addBuilding(state, 'cannon', 13, 15, 3);
    expect(repairCost(cannon)).toBe(Math.round(CONFIG.defenses.cannon.levels[2].cost * 0.3));
    state.gold = repairCost(cannon) + 10;
    expect(checkRepair(state, cannon).ok).toBe(false);         // not destroyed
    cannon.destroyed = true; cannon.hp = 0;
    expect(checkRepair(state, cannon).ok).toBe(true);          // daytime is fine
    expect(repairBuilding(state, cannon)).toBe(true);
    expect(cannon.destroyed).toBe(false);
    expect(cannon.hp).toBe(CONFIG.defenses.cannon.levels[2].hp);
    expect(state.gold).toBe(10);
    const wall = createBuilding(state, 'wall', 6, 20, 1, null, 'x');
    state.buildings.push(wall);
    wall.destroyed = true;
    expect(checkRepair(state, wall)).toEqual({ ok: false, reason: 'Walls rebuild at dawn' });
  });

  it('at dawn damaged buildings heal and walls come back, but ruins stay ruins', () => {
    const state = makeStateWithTownHall();
    const mine = addBuilding(state, 'mine', 13, 15);
    const cannon = addBuilding(state, 'cannon', 9, 16);
    const wall = createBuilding(state, 'wall', 6, 20, 1, null, 'x');
    state.buildings.push(wall);
    mine.hp = 10;
    cannon.destroyed = true; cannon.hp = 0;
    wall.destroyed = true; wall.hp = 0;
    expect(repairAll(state)).toBe(1);
    expect(mine.hp).toBe(CONFIG.mine.levels[0].hp);
    expect(wall.destroyed).toBe(false);
    expect(cannon.destroyed).toBe(true);
  });

  it('storage damage drains gold by the charter formula', () => {
    const state = makeStateWithTownHall({ gold: 900 });
    const storage = addBuilding(state, 'storage', 21, 15);
    const maxHp = CONFIG.storage.levels[0].hp;
    // storedHere = 900 * 1000 / 1500 = 600; 100 damage of 500 HP -> 100/500 * 0.5 * 600 = 60
    const storedHere = (900 * storageCap) / (thCap + storageCap);
    const expected = Math.round((100 / maxHp) * CONFIG.rules.storageDrainOnDestroy * storedHere);
    expect(storageDrainAmount(state, storage, 100)).toBe(expected);
    damageBuilding(state, storage, 100);
    expect(state.gold).toBe(900 - expected);
  });

  it('destroying a storage in one hit drains half of what it holds', () => {
    const state = makeStateWithTownHall({ gold: 1500 });
    const storage = addBuilding(state, 'storage', 21, 15);
    const storedHere = (1500 * storageCap) / (thCap + storageCap);
    damageBuilding(state, storage, 99999);
    expect(storage.destroyed).toBe(true);
    expect(state.gold).toBe(1500 - Math.round(storedHere * 0.5));
  });
});
