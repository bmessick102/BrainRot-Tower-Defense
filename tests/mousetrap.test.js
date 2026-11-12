import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepTraps, springTrap, resetTraps, isTrap } from '../src/logic/traps.js';
import { stepEnemy, ensureTarget } from '../src/logic/enemies.js';
import { stepDefenses, damageBuilding } from '../src/logic/combat.js';
import { getNav } from '../src/logic/pathfinding.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { footprintDims, maxLevel, limitFor } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const T = CONFIG.defenses.mousetrap;
const attack = () => { const s = makeStateWithTownHall({}, 5); s.wave.phase = 'active'; return s; };

describe('Mousetrap', () => {
  it('is a 1-tile, 10-level trap that unlocks at Village Hall 2', () => {
    expect(isTrap('mousetrap')).toBe(true);
    expect(footprintDims('mousetrap')).toEqual({ w: 1, h: 1 });
    expect(maxLevel('mousetrap')).toBe(10);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('mousetrap', th))).toEqual([0, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('enemies cannot see it: never a target, never in the way, never damaged', () => {
    const s = attack();
    s.buildings = s.buildings.filter((b) => b.type !== 'townHall');
    const trap = addBuilding(s, 'mousetrap', 9, 16);
    const mine = addBuilding(s, 'mine', 12, 16);
    const e = addEnemy(s, 'grunt', 8.5, 16.5);
    expect(ensureTarget(s, e).id).toBe(mine.id);
    expect(getNav(s).occ[16 * 32 + 9]).toBe(null);   // its tile is open ground
    damageBuilding(s, trap, 9999);
    expect(trap.destroyed).toBe(false);
  });

  it('a ground enemy stepping on it springs it: everyone within 1.5 tiles is hurt and held', () => {
    const s = attack();
    addBuilding(s, 'mousetrap', 9, 16);              // center (9.5, 16.5)
    const on = addEnemy(s, 'grunt', 9.4, 16.6, { hp: 500, maxHp: 500 });
    const near = addEnemy(s, 'tank', 10.5, 17, { hp: 500, maxHp: 500 });
    const far = addEnemy(s, 'grunt', 13, 16.5, { hp: 500, maxHp: 500 });
    const flyer = addEnemy(s, 'bomber', 9.5, 16.5, { hp: 500, maxHp: 500 });
    stepTraps(s);
    expect(500 - on.hp).toBe(T.levels[0].damage);
    expect(500 - near.hp).toBe(T.levels[0].damage);
    expect(far.hp).toBe(500);
    expect(flyer.hp).toBe(500);                       // flyers are never caught
    expect(on.held).toBe(T.levels[0].hold);
    const x = on.x;
    stepEnemy(s, on, 1);
    expect(on.x).toBe(x);                             // held in place
    stepEnemy(s, on, T.levels[0].hold);
    expect(on.held).toBe(0);
  });

  it('flyers alone never spring it', () => {
    const s = attack();
    const trap = addBuilding(s, 'mousetrap', 9, 16);
    addEnemy(s, 'bomber', 9.5, 16.5);
    stepTraps(s);
    expect(trap.sprung).toBeFalsy();
  });

  it('springs only once per wave, and resets when the wave is cleared', () => {
    const s = attack();
    const trap = addBuilding(s, 'mousetrap', 9, 16);
    const a = addEnemy(s, 'grunt', 9.5, 16.5, { hp: 9999, maxHp: 9999 });
    stepTraps(s);
    const hp = a.hp;
    stepTraps(s);
    expect(a.hp).toBe(hp);                            // already sprung
    expect(trap.sprung).toBe(true);
    s.enemies = [];
    s.wave = { ...s.wave, queues: {}, paths: [], number: 1, bountyEarned: 0 };
    checkWaveCleared(s);
    expect(trap.sprung).toBe(false);
  });

  it('never fires like a tower', () => {
    const s = attack();
    addBuilding(s, 'mousetrap', 9, 16);
    addEnemy(s, 'grunt', 10, 17);
    stepDefenses(s, 5);
    expect(s.projectiles).toHaveLength(0);
    void springTrap; void resetTraps;
  });
});
