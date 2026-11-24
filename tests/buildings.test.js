import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { limitFor, checkBuy, checkUpgrade, upgradeCost, buildCost, totalSpent, maxLevel, buildableCount, BUILDING_TYPES } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';
import { artTier } from '../src/objects/BuildingView.js';

describe('buildings.js', () => {
  it('limits per town hall level match config', () => {
    for (const type of BUILDING_TYPES) {
      for (let th = 1; th <= CONFIG.rules.maxTownHallLevel; th++) expect(limitFor(type, th)).toBe(CONFIG.limits[type][th - 1]);
    }
  });

  it('enforces the limit when buying', () => {
    const state = makeStateWithTownHall({ gold: 500 });
    expect(checkBuy(state, 'mine').ok).toBe(true);
    addBuilding(state, 'mine', 13, 15);
    expect(checkBuy(state, 'mine')).toEqual({ ok: false, reason: 'Limit reached' });
  });

  it('locks buildings until their town hall level', () => {
    const state = makeStateWithTownHall({ gold: 5000 });
    expect(checkBuy(state, 'archer')).toEqual({ ok: false, reason: 'Requires VH2' });
    expect(checkBuy(state, 'wizard')).toEqual({ ok: false, reason: 'Requires VH3' });
  });

  it('explains missing gold', () => {
    const state = makeStateWithTownHall({ gold: 50 });
    expect(checkBuy(state, 'mine')).toEqual({ ok: false, reason: 'Need 100 more gold' });
  });

  it('reads shop and upgrade prices from config', () => {
    expect(buildCost('cannon')).toBe(CONFIG.defenses.cannon.levels[0].cost);
    expect(upgradeCost('cannon', 1)).toBe(CONFIG.defenses.cannon.levels[1].cost);
    expect(upgradeCost('townHall', 1)).toBe(CONFIG.townHall.levels[1].upgradeCost);
    const m = CONFIG.mine.levels;
    expect(totalSpent('mine', 3)).toBe(m[0].cost + m[1].cost + m[2].cost);
  });

  it('blocks upgrades above the town hall level', () => {
    const state = makeStateWithTownHall({ gold: 99999 }, 2);
    const cannon = addBuilding(state, 'cannon', 13, 15, 1);
    expect(checkUpgrade(state, cannon).ok).toBe(true);
    cannon.level = 2;
    expect(checkUpgrade(state, cannon)).toMatchObject({ ok: false, reason: 'Requires VH3' });
  });

  it('has 10 levels (the Catapult 5, walls 10, the Tower of Rah 8, the RV Lab and DJ Babyface 5, the Fuel Station 8, the three heroes and the Storage 20) and blocks upgrades at the top level', () => {
    const max = CONFIG.rules.maxTownHallLevel;
    expect(max).toBe(20); // v0.8: Village Halls 12-15; v0.11: 16-20
    for (const type of BUILDING_TYPES) expect(maxLevel(type)).toBe({ townHall: 20, catapult: 5, wall: 10, ra: 8, rvlab: 5, dj: 5, fuelStation: 8, altar: 20, queenAltar: 20, mageAltar: 20, storage: 20, shakeStorage: 12 }[type] ?? 10); // (v0.14: the Shake Collector 10, the Shake Storage 12)
    const s6 = makeStateWithTownHall({ gold: 9999999 }, max);
    const cat = addBuilding(s6, 'catapult', 8, 8, 5);
    expect(checkUpgrade(s6, cat)).toMatchObject({ ok: false, reason: 'Max level' });
    const state = makeStateWithTownHall({ gold: 9999999 }, max);
    const cannon = addBuilding(state, 'cannon', 13, 15, maxLevel('cannon'));
    expect(checkUpgrade(state, cannon)).toMatchObject({ ok: false, reason: 'Max level' });
    expect(checkUpgrade(state, state.buildings[0])).toMatchObject({ ok: false, reason: 'Max level' });
  });

  it('counts buildings and wall segments still allowed (shop badge)', () => {
    const state = makeStateWithTownHall({ gold: 0 });
    const th1 = Object.entries(CONFIG.limits).filter(([t]) => t !== 'townHall').reduce((n, [, l]) => n + l[0], 0);
    expect(buildableCount(state)).toBe(th1);
    addBuilding(state, 'mine', 13, 15);
    addBuilding(state, 'wall', 2, 8);
    expect(buildableCount(state)).toBe(th1 - 2);
    state.buildings[0].level = 2; // a Town Hall upgrade opens new slots
    expect(buildableCount(state)).toBeGreaterThan(th1 - 2);
  });

  it('a new picture every two levels (1-2 -> 1, 3-4 -> 2 ... 9-10 -> 5)', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(artTier)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('blocks upgrades only while enemies are on the field', () => {
    const state = makeStateWithTownHall({ gold: 99999 }, 2);
    const cannon = addBuilding(state, 'cannon', 13, 15, 1);
    state.wave.phase = 'countdown';
    expect(checkUpgrade(state, cannon).ok).toBe(true);
    expect(checkUpgrade(state, state.buildings[0]).ok).toBe(true);
    state.wave.phase = 'active';
    expect(checkUpgrade(state, cannon).reason).toBe('Not during a wave');
    expect(checkUpgrade(state, state.buildings[0]).reason).toBe('Not during a wave');
  });
});
