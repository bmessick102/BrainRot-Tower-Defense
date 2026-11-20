import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepFlockTowers, flockRange, flockBonus } from '../src/logic/flock.js';
import { damageEnemy, stepDefenses, matchesTypes } from '../src/logic/combat.js';
import { isDefense, isSupport, defenseRange, limitFor, maxLevel, DEFENSE_TYPES, footprintDims } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const cfg = CONFIG.defenses.flock;

describe('F.L.O.C.K Tower', () => {
  it('is a 10-level support defense: range 6 to 8.5, bonus +15% to +35%, unlocks at VH3', () => {
    expect(maxLevel('flock')).toBe(10);
    expect(isDefense('flock')).toBe(true);
    expect(isSupport('flock')).toBe(true);
    expect(isSupport('cannon')).toBe(false);
    expect(flockRange(1)).toBe(6);
    expect(flockRange(10)).toBe(8.5);
    expect(defenseRange('flock', 4)).toBe(cfg.levels[3].range);
    expect(defenseRange('cannon', 4)).toBe(CONFIG.defenses.cannon.range);
    expect(flockBonus(1)).toBeCloseTo(0.15);
    expect(flockBonus(10)).toBeCloseTo(0.35);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('flock', th))).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 3, 3]);
  });

  it('marks enemies inside its range only, and marked enemies take extra damage', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'flock', 9, 16);                 // center (10, 17)
    const near = addEnemy(s, 'grunt', 13, 17, { hp: 100, maxHp: 100 });
    const far = addEnemy(s, 'grunt', 10, 25, { hp: 100, maxHp: 100 });
    stepFlockTowers(s);
    expect(near.markBonus).toBeCloseTo(0.15);
    expect(far.markBonus).toBe(0);
    damageEnemy(s, near, 20);
    damageEnemy(s, far, 20);
    expect(100 - near.hp).toBeCloseTo(23);
    expect(100 - far.hp).toBe(20);
  });

  it('several towers do not stack: the strongest bonus applies', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'flock', 9, 16, 1);
    addBuilding(s, 'flock', 9, 20, 6);
    const e = addEnemy(s, 'grunt', 10, 19);
    stepFlockTowers(s);
    expect(e.markBonus).toBeCloseTo(flockBonus(6));
  });

  it('reveals invisible enemies that come into range, for good', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'flock', 9, 16);
    const least = addEnemy(s, 'thief', 12, 17, { hidden: true });
    stepFlockTowers(s);
    expect(least.hidden).toBe(false);
    expect(s.events.filter((x) => x.name === 'enemyRevealed')).toHaveLength(1);
    least.x = 30; least.y = 30;                  // walks out of range
    stepFlockTowers(s);
    expect(least.hidden).toBe(false);
    expect(least.markBonus).toBe(0);
  });

  it('a destroyed tower marks nothing, and towers never shoot', () => {
    const s = makeStateWithTownHall();
    const t = addBuilding(s, 'flock', 9, 16);
    const e = addEnemy(s, 'grunt', 11, 17);
    stepDefenses(s, 5);
    expect(s.projectiles).toHaveLength(0);
    t.destroyed = true;
    stepFlockTowers(s);
    expect(e.markBonus).toBe(0);
  });

  it('alerts once when an enemy enters an empty range, not for each enemy after it', () => {
    const s = makeStateWithTownHall();
    const t = addBuilding(s, 'flock', 9, 16);
    const a = addEnemy(s, 'grunt', 10, 30);
    const b = addEnemy(s, 'grunt', 10, 31);
    const alerts = () => s.events.filter((x) => x.name === 'flockSpotted' && x.data.id === t.id).length;
    stepFlockTowers(s);
    expect(alerts()).toBe(0);                       // nobody in range yet
    a.y = 18; stepFlockTowers(s);
    expect(alerts()).toBe(1);                       // first one in: alert
    b.y = 19; stepFlockTowers(s);
    expect(alerts()).toBe(1);                       // a second one joining: no new alert
    a.y = 30; b.y = 31; stepFlockTowers(s);         // range empty again
    a.y = 18; stepFlockTowers(s);
    expect(alerts()).toBe(2);                       // a new first arrival: alert again
  });

  it('stands on a single tile', () => {
    expect(footprintDims('flock')).toEqual({ w: 1, h: 1 });
    expect(footprintDims('cannon')).toEqual({ w: 2, h: 2 });
  });

  it('comes before the Diddypult in the shop (it unlocks earlier)', () => {
    expect(DEFENSE_TYPES.indexOf('flock')).toBeLessThan(DEFENSE_TYPES.indexOf('catapult'));
    expect(cfg.unlockTownHall).toBeLessThan(CONFIG.defenses.catapult.unlockTownHall);
  });

  it('counts as a defense for enemies that go after defenses (Wall Breakers)', () => {
    const s = makeStateWithTownHall();
    const t = addBuilding(s, 'flock', 9, 16);
    expect(matchesTypes(t, ['defense'])).toBe(true);
  });
});
