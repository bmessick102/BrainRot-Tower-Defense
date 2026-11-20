import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { pierceMultiplier, fireDefense, stepProjectiles, stepDefenses, isValidTarget } from '../src/logic/combat.js';
import { DEFENSE_TYPES, limitFor, maxLevel, unlockTownHall } from '../src/logic/buildings.js';
import { artTier } from '../src/objects/BuildingView.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const cfg = CONFIG.defenses.spear;
const fly = (s, seconds = 3, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepProjectiles(s, dt); };

describe('Spear Thrower', () => {
  it('pierce damage: 100% on the first enemy, then 25% less for each one behind it', () => {
    expect([0, 1, 2, 3, 4].map((i) => pierceMultiplier(i, 0.25))).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(pierceMultiplier(7, 0.25)).toBe(0); // never negative
    expect(pierceMultiplier(-1, 0.25)).toBe(1);
  });

  it('is a slow, long-range ground-and-air sniper with 10 levels (a picture per 2), unlocking at VH3', () => {
    expect(cfg.range).toBeGreaterThanOrEqual(8);
    expect(cfg.range).toBeGreaterThan(CONFIG.defenses.cannon.range);
    expect(cfg.fireInterval).toBeCloseTo(2.5);
    expect(cfg.hitsGround).toBe(true);
    expect(cfg.hitsAir).toBe(true);
    expect(maxLevel('spear')).toBe(10);
    expect(artTier(1, 'spear')).toBe(1);
    expect(artTier(2, 'spear')).toBe(1);
    expect(artTier(10, 'spear')).toBe(5);
    for (let l = 1; l < 10; l++) expect(cfg.levels[l].cost).toBeGreaterThan(cfg.levels[l - 1].cost);
    expect(unlockTownHall('spear')).toBe(3);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('spear', th))).toEqual([0, 0, 1, 1, 2, 2, 2, 3, 3, 3]);
    expect(cfg.levels[0].damage).toBeGreaterThan(CONFIG.defenses.cannon.levels[0].damage * 2);
    expect(DEFENSE_TYPES.indexOf('spear')).toBeLessThan(DEFENSE_TYPES.indexOf('catapult'));
  });

  it('hits ground and air enemies out to its range', () => {
    const s = makeStateWithTownHall();
    const b = addBuilding(s, 'spear', 10, 10);   // center (11, 11)
    expect(isValidTarget(b, addEnemy(s, 'grunt', 19, 11))).toBe(true);   // 8 tiles
    expect(isValidTarget(b, addEnemy(s, 'grunt', 22, 11))).toBe(false);  // 11 tiles
    expect(isValidTarget(b, addEnemy(s, 'balloon', 14, 11))).toBe(true);
    expect(isValidTarget(b, addEnemy(s, 'bomber', 22, 11))).toBe(false); // flyers out of range too
  });

  it('a spear thrown at a flyer pierces flyers only; one thrown at a ground enemy pierces ground only', () => {
    const hp = 100000;
    const dmg = cfg.levels[0].damage;
    // At a flyer: the bombers on the line are hit (100 / 75%), the grunt between them is not.
    let s = makeStateWithTownHall();
    let b = addBuilding(s, 'spear', 10, 10);     // center (11, 11)
    const air1 = addEnemy(s, 'bomber', 15, 11, { hp, maxHp: hp });
    const ground = addEnemy(s, 'grunt', 15.8, 11, { hp, maxHp: hp });
    const air2 = addEnemy(s, 'bomber', 16.5, 11, { hp, maxHp: hp });
    fireDefense(s, b, air1);
    fly(s);
    expect(hp - air1.hp).toBeCloseTo(dmg, 5);
    expect(hp - air2.hp).toBeCloseTo(dmg * 0.75, 5);
    expect(ground.hp).toBe(hp);
    // At a ground enemy: the flyer on the line is skipped.
    s = makeStateWithTownHall();
    b = addBuilding(s, 'spear', 10, 10);
    const g1 = addEnemy(s, 'grunt', 15, 11, { hp, maxHp: hp });
    const flyer = addEnemy(s, 'bomber', 15.8, 11, { hp, maxHp: hp });
    const g2 = addEnemy(s, 'grunt', 16.5, 11, { hp, maxHp: hp });
    fireDefense(s, b, g1);
    fly(s);
    expect(hp - g1.hp).toBeCloseTo(dmg, 5);
    expect(hp - g2.hp).toBeCloseTo(dmg * 0.75, 5);
    expect(flyer.hp).toBe(hp);
  });

  it('a spear hits the enemies in a line for 100 / 75 / 50 / 25% and skips the ones off the line', () => {
    const s = makeStateWithTownHall();
    const b = addBuilding(s, 'spear', 10, 10);   // center (11, 11)
    const hp = 100000;
    const line = [15, 16, 17, 18].map((x) => addEnemy(s, 'grunt', x, 11, { hp, maxHp: hp }));
    const off = addEnemy(s, 'grunt', 16, 14, { hp, maxHp: hp });
    const fifth = addEnemy(s, 'grunt', 19, 11, { hp, maxHp: hp });
    fireDefense(s, b, line[0]);
    fly(s);
    const dmg = cfg.levels[0].damage;
    line.forEach((e, i) => expect(hp - e.hp).toBeCloseTo(dmg * [1, 0.75, 0.5, 0.25][i], 5));
    expect(off.hp).toBe(hp);
    expect(fifth.hp).toBe(hp);   // out of pierces (max 4)
  });

  it('fires at its slow rate through stepDefenses', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'spear', 10, 10);
    const e = addEnemy(s, 'grunt', 17, 11, { hp: 100000, maxHp: 100000 });
    stepDefenses(s, 0.05);
    expect(s.projectiles.length).toBe(1);
    stepDefenses(s, 1);
    expect(s.projectiles.length).toBe(1);   // still reloading
    for (let t = 0; t < 3; t += 0.05) { stepDefenses(s, 0.05); stepProjectiles(s, 0.05); }
    expect(e.hp).toBeLessThan(100000);
  });
});
