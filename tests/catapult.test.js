import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { isValidTarget, fireDefense, stepProjectiles, stepPools, createPool, POOL_TICK } from '../src/logic/combat.js';
import { stepEnemy } from '../src/logic/enemies.js';
import { checkBuy, limitFor, maxLevel, buildCost, DEFENSE_TYPES } from '../src/logic/buildings.js';
import { footprintCenter } from '../src/logic/grid.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const cfg = CONFIG.defenses.catapult;
const run = (fn, seconds, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) fn(dt); };

describe('Catapult', () => {
  it('reaches far but has a big dead zone (range 16, not within 6)', () => {
    const s = makeStateWithTownHall();
    const cat = addBuilding(s, 'catapult', 2, 2);
    const c = footprintCenter(cat);
    expect(isValidTarget(cat, addEnemy(s, 'grunt', c.x + 10, c.y))).toBe(true);
    expect(isValidTarget(cat, addEnemy(s, 'grunt', c.x + 5, c.y))).toBe(false);  // dead zone
    expect(isValidTarget(cat, addEnemy(s, 'grunt', c.x + cfg.range - 0.5, c.y))).toBe(true);
    expect(isValidTarget(cat, addEnemy(s, 'grunt', c.x + cfg.range + 1, c.y))).toBe(false); // out of range
    expect(isValidTarget(cat, addEnemy(s, 'bomber', c.x + 10, c.y))).toBe(false); // ground only
  });

  it('lands light damage and leaves a pink pool with its level\'s damage', () => {
    const s = makeStateWithTownHall();
    const cat = addBuilding(s, 'catapult', 2, 2, 3);
    const c = footprintCenter(cat);
    const e = addEnemy(s, 'grunt', c.x + 10, c.y, { hp: 999, maxHp: 999 });
    fireDefense(s, cat, e);
    run((dt) => stepProjectiles(s, dt), CONFIG.projectiles.catapult.flightTime + 0.1);
    expect(e.hp).toBe(999 - cfg.levels[2].damage);
    expect(s.pools).toHaveLength(1);
    expect(s.pools[0]).toMatchObject({ dps: cfg.levels[2].poolDps, radius: cfg.pool.radius, slow: cfg.pool.slow });
  });

  it('pools hurt ground troops standing in them every half second, then expire', () => {
    const s = makeStateWithTownHall();
    const e = addEnemy(s, 'grunt', 5, 5, { hp: 999, maxHp: 999 });
    createPool(s, 5, 5, { ...cfg.pool, dps: 8 });
    run((dt) => stepPools(s, dt), 2);
    expect(999 - e.hp).toBeCloseTo(8 * 2, 6);
    expect(s.events.filter((ev) => ev.name === 'enemyHit').every((ev) => ev.data.source === 'pool')).toBe(true);
    run((dt) => stepPools(s, dt), cfg.pool.duration);
    expect(s.pools).toHaveLength(0);
  });

  it('never hurts flyers or troops outside the pool', () => {
    const s = makeStateWithTownHall();
    const flyer = addEnemy(s, 'bomber', 5, 5, { hp: 999, maxHp: 999 });
    const outside = addEnemy(s, 'grunt', 5 + cfg.pool.radius + 0.5, 5, { hp: 999, maxHp: 999 });
    createPool(s, 5, 5, { ...cfg.pool, dps: 8 });
    run((dt) => stepPools(s, dt), 3);
    expect(flyer.hp).toBe(999);
    expect(outside.hp).toBe(999);
    expect(flyer.slowTimer || 0).toBe(0);
  });

  it('overlapping pools stack damage but not the slow', () => {
    const s = makeStateWithTownHall();
    const e = addEnemy(s, 'grunt', 5, 5, { hp: 999, maxHp: 999 });
    createPool(s, 5, 5, { ...cfg.pool, dps: 8 });
    createPool(s, 5.2, 5, { ...cfg.pool, dps: 8 });
    run((dt) => stepPools(s, dt), 1);
    expect(999 - e.hp).toBeCloseTo(16, 6);
    expect(e.slow).toBe(cfg.pool.slow);
  });

  it('slows ground troops by 25% while they stand in a pool', () => {
    const walk = (inPool) => {
      const s = makeStateWithTownHall();
      const th = s.buildings[0];
      const e = addEnemy(s, 'grunt', 6, 16.5, { hp: 999, maxHp: 999 });
      e.targetId = th.id;
      if (inPool) createPool(s, 6, 16.5, { ...cfg.pool, radius: 20, duration: 99, dps: 0 });
      const x0 = e.x;
      run((dt) => { stepPools(s, dt); stepEnemy(s, e, dt); }, 1);
      return e.x - x0;
    };
    const normal = walk(false), slowed = walk(true);
    expect(slowed / normal).toBeCloseTo(1 - cfg.pool.slow, 1);
  });

  it('is the last unlock: from Village Hall 10, one at the normal price, and has 5 levels', () => {
    expect(cfg.unlockTownHall).toBe(10);
    expect(limitFor('catapult', 9)).toBe(0);
    expect(limitFor('catapult', 10)).toBe(1);
    expect([11, 12, 13, 14, 15].map((th) => limitFor('catapult', th))).toEqual([2, 2, 3, 3, 4]); // v0.8: +1 at VH11 and VH13; v0.10.1: a 4th at VH15 (two Diddy Trebuchets)
    expect(maxLevel('catapult')).toBe(5);
    const s = makeStateWithTownHall({ gold: 9999999 }, 10);
    expect(checkBuy(s, 'catapult').ok).toBe(true);
    addBuilding(s, 'catapult', 2, 2);
    expect(checkBuy(s, 'catapult')).toEqual({ ok: false, reason: 'Limit reached' }); // Village Hall 10: one
    // Village Hall 11 allows a second, at the normal price.
    const s11 = makeStateWithTownHall({ gold: 9999999 }, 11);
    addBuilding(s11, 'catapult', 2, 2);
    expect(checkBuy(s11, 'catapult').ok).toBe(true);
    expect(buildCost('catapult', s11)).toBe(cfg.levels[0].cost);
    // Last in the shop too.
    expect(DEFENSE_TYPES[DEFENSE_TYPES.length - 1]).toBe('catapult');
    for (const t of DEFENSE_TYPES) expect(CONFIG.defenses[t].unlockTownHall).toBeLessThanOrEqual(cfg.unlockTownHall);
  });

  it('pool ticks are half a second', () => {
    expect(POOL_TICK).toBe(0.5);
  });
});
