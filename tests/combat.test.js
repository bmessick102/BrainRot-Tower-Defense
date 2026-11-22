import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { chooseTarget, stepDefenses, stepProjectiles, applySplash, isValidTarget, fireDefense, fireEnemyProjectile } from '../src/logic/combat.js';
import { footprintCenter } from '../src/logic/grid.js';
import { limitFor } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

function setup(type, level = 1) {
  const state = makeStateWithTownHall({ gold: 0 }, 5);
  const b = addBuilding(state, type, 6, 10, level);
  const c = footprintCenter(b); // (7.5, 11.5)
  return { state, b, c };
}

describe('combat.js', () => {
  it('Cannon and Mortar never target Bombers', () => {
    for (const type of ['cannon', 'mortar']) {
      const { state, b, c } = setup(type);
      const bomber = addEnemy(state, 'bomber', c.x + 3.5, c.y);
      expect(isValidTarget(b, bomber)).toBe(false);
      expect(chooseTarget(state, b)).toBeNull();
    }
  });

  it('Archer and Wizard can target Bombers', () => {
    for (const type of ['archer', 'wizard']) {
      const { state, b, c } = setup(type);
      const bomber = addEnemy(state, 'bomber', c.x + 2, c.y);
      expect(chooseTarget(state, b).id).toBe(bomber.id);
    }
  });

  it('Mortar ignores enemies inside its minimum range', () => {
    const { state, b, c } = setup('mortar');
    const close = addEnemy(state, 'grunt', c.x + CONFIG.defenses.mortar.minRange - 0.5, c.y);
    expect(chooseTarget(state, b)).toBeNull();
    const far = addEnemy(state, 'grunt', c.x + CONFIG.defenses.mortar.minRange + 1, c.y);
    expect(chooseTarget(state, b).id).toBe(far.id);
    expect(isValidTarget(b, close)).toBe(false);
  });

  it('shoots the closest valid enemy and keeps it while valid', () => {
    const { state, b, c } = setup('archer');
    const far = addEnemy(state, 'grunt', c.x + 5, c.y);
    const near = addEnemy(state, 'grunt', c.x + 2, c.y);
    expect(chooseTarget(state, b).id).toBe(near.id);
    addEnemy(state, 'grunt', c.x + 1, c.y);
    expect(chooseTarget(state, b).id).toBe(near.id); // sticky
    near.alive = false;
    expect(chooseTarget(state, b).id).not.toBe(near.id);
    expect(far.alive).toBe(true);
  });

  it('splash hits every valid enemy in the radius, each for full damage', () => {
    const { state } = setup('wizard');
    const a = addEnemy(state, 'grunt', 10, 10, { hp: 500, maxHp: 500 });
    const bb = addEnemy(state, 'bomber', 10.5, 10, { hp: 500, maxHp: 500 });
    const out = addEnemy(state, 'grunt', 12, 10, { hp: 500, maxHp: 500 });
    applySplash(state, 10, 10, 1, 40, true, true);
    expect(a.hp).toBe(460);
    expect(bb.hp).toBe(460);
    expect(out.hp).toBe(500);
    // Mortar-style splash (ground only) leaves the bomber alone
    applySplash(state, 10, 10, 1.5, 40, true, false);
    expect(a.hp).toBe(420);
    expect(bb.hp).toBe(460);
  });

  it('a homing shot fizzles when its target dies first', () => {
    const { state, b, c } = setup('cannon');
    const e = addEnemy(state, 'grunt', c.x + 4, c.y, { hp: 500, maxHp: 500 });
    const p = fireDefense(state, b, e);
    e.alive = false;
    const other = addEnemy(state, 'grunt', c.x + 4, c.y, { hp: 500, maxHp: 500 });
    for (let i = 0; i < 20; i++) stepProjectiles(state, 0.05);
    expect(state.projectiles.find((q) => q.id === p.id)).toBeUndefined();
    expect(other.hp).toBe(500);
  });

  it('mortar shells land where the target was at fire time', () => {
    const { state, b, c } = setup('mortar');
    const e = addEnemy(state, 'grunt', c.x + 5, c.y, { hp: 500, maxHp: 500 });
    fireDefense(state, b, e);
    e.x += 3; // moves away before the shell lands
    for (let i = 0; i < 30; i++) stepProjectiles(state, 0.05);
    expect(e.hp).toBe(500);
    expect(state.projectiles).toHaveLength(0);
  });

  it('defenses fire on cooldown and kills pay a bounty', () => {
    const { state, b, c } = setup('cannon');
    const e = addEnemy(state, 'grunt', c.x + 2, c.y, { hp: 1, maxHp: 1 });
    stepDefenses(state, 0.016);
    expect(state.projectiles).toHaveLength(1);
    expect(b.cooldown).toBe(CONFIG.defenses.cannon.fireInterval);
    for (let i = 0; i < 20; i++) stepProjectiles(state, 0.05);
    expect(e.alive).toBe(false);
    expect(state.gold).toBe(CONFIG.enemies.grunt.bounty);
  });

  it('splash and bomb events say what caused them (for their sounds)', () => {
    for (const type of ['mortar', 'wizard']) {
      const { state, b, c } = setup(type);
      const e = addEnemy(state, 'grunt', c.x + 4, c.y, { hp: 9999, maxHp: 9999 });
      fireDefense(state, b, e);
      for (let i = 0; i < 40; i++) stepProjectiles(state, 0.05);
      expect(state.events.find((ev) => ev.name === 'splash').data.kind).toBe(type);
    }
    const { state, b } = setup('cannon');
    const bomber = addEnemy(state, 'bomber', b.col + 1, b.row + 1);
    fireEnemyProjectile(state, bomber, b);
    for (let i = 0; i < 20; i++) stepProjectiles(state, 0.05);
    expect(state.events.some((ev) => ev.name === 'bombExploded' && ev.data.targetId === b.id)).toBe(true);
  });

  it('the Firework Launcher only targets flyers', () => {
    const { state, b, c } = setup('firework');
    const grunt = addEnemy(state, 'grunt', c.x + 2, c.y);
    expect(isValidTarget(b, grunt)).toBe(false);
    expect(chooseTarget(state, b)).toBeNull();
    const bomber = addEnemy(state, 'bomber', c.x + 4, c.y);
    expect(chooseTarget(state, b).id).toBe(bomber.id);
  });

  it('a firework burst hits every flyer in the radius and never ground enemies', () => {
    const { state, b, c } = setup('firework');
    const dmg = CONFIG.defenses.firework.levels[0].damage;
    const target = addEnemy(state, 'bomber', c.x + 4, c.y, { hp: 9999, maxHp: 9999 });
    const wingman = addEnemy(state, 'bomber', c.x + 4.6, c.y, { hp: 9999, maxHp: 9999 });
    const below = addEnemy(state, 'grunt', c.x + 4, c.y, { hp: 9999, maxHp: 9999 });
    fireDefense(state, b, target);
    for (let i = 0; i < 30; i++) stepProjectiles(state, 0.05);
    expect(target.hp).toBe(9999 - dmg);
    expect(wingman.hp).toBe(9999 - dmg);
    expect(below.hp).toBe(9999);
    expect(state.events.find((ev) => ev.name === 'splash').data.kind).toBe('firework');
  });

  it('the Firework Launcher hits air hard but is fragile and limited', () => {
    const fw = CONFIG.defenses.firework, archer = CONFIG.defenses.archer;
    expect(fw.levels[0].damage).toBeGreaterThan(archer.levels[0].damage * 3);
    expect(fw.levels[0].hp).toBeLessThan(archer.levels[0].hp);
    expect(fw.unlockTownHall).toBe(3);
    expect(Math.max(...CONFIG.limits.firework.slice(0, 14))).toBe(3); // (Village Hall 15 allows a 4th)
    expect(limitFor('firework', 15)).toBe(4);
    // Single-tile walls: 3x the old 3-tile segments; every hall from 11 adds 12.
    expect(CONFIG.limits.wall).toEqual([24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192]);
  });

  it('destroyed defenses never fire', () => {
    const { state, b, c } = setup('cannon');
    addEnemy(state, 'grunt', c.x + 2, c.y);
    b.destroyed = true;
    stepDefenses(state, 1);
    expect(state.projectiles).toHaveLength(0);
  });
});
