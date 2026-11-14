import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ensureTarget, stepEnemy, explode, enemyDamageVs } from '../src/logic/enemies.js';
import { createBuilding } from '../src/logic/buildings.js';
import { damageBuilding, damageEnemy } from '../src/logic/combat.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const cfg = CONFIG.enemies.breaker;
const N = CONFIG.walls.segmentLength;

function wall(state, col, row, orient = 'x', level = 1) {
  const b = createBuilding(state, 'wall', col, row, level, null, orient);
  state.buildings.push(b);
  return b;
}

describe('Wall Breaker', () => {
  it('goes for the nearest wall even when buildings are closer', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'cannon', 9, 16);
    const w = wall(s, 2, 2);
    const e = addEnemy(s, 'breaker', 8, 17);
    expect(ensureTarget(s, e).id).toBe(w.id);
  });

  it('with no walls left, goes for defenses before anything else', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'mine', 9, 16);
    const cannon = addBuilding(s, 'cannon', 2, 2);
    const e = addEnemy(s, 'breaker', 8, 17);
    expect(ensureTarget(s, e).id).toBe(cannon.id);
  });

  it('with no walls or defenses, goes for anything', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 16);
    const e = addEnemy(s, 'breaker', 8, 17);
    expect(ensureTarget(s, e).id).toBe(mine.id);
  });

  it('one blast destroys even a Level 7 (top level) wall', () => {
    const s = makeStateWithTownHall();
    const w = wall(s, 5, 5, 'x', 7);
    expect(enemyDamageVs(cfg, w)).toBe(cfg.damage * 60);
    expect(enemyDamageVs(cfg, w)).toBeGreaterThanOrEqual(CONFIG.walls.levels[6].hp);
    const e = addEnemy(s, 'breaker', 6.5, 4.6);
    explode(s, e, cfg);
    expect(w.destroyed).toBe(true);
  });

  it('the blast hits buildings and walls within 2 tiles, nothing farther, and kills the breaker', () => {
    const s = makeStateWithTownHall();
    const w = wall(s, 5, 5, 'x');
    const near = addBuilding(s, 'cannon', 6, 6);   // right behind the wall, 1.4 tiles from the blast
    const far = addBuilding(s, 'mine', 11, 11);    // well outside the blast
    const e = addEnemy(s, 'breaker', 6.5, 4.6);
    const nearHp = near.hp, farHp = far.hp;
    explode(s, e, cfg);
    expect(w.destroyed).toBe(true);
    expect(nearHp - near.hp).toBe(cfg.damage);
    expect(far.hp).toBe(farHp);
    expect(e.alive).toBe(false);
    const ev = s.events.find((x) => x.name === 'enemyExploded');
    expect(ev.data.radius).toBe(cfg.blastRadius);
    expect(s.events.some((x) => x.name === 'enemyKilled')).toBe(false); // blowing itself up isn't a kill: no bounty
  });

  it('walks up to a wall ring and blasts a gap in it', () => {
    const s = makeStateWithTownHall();
    const walls = [];
    for (let c = 16; c < 21; c += N) { walls.push(wall(s, c, 14, 'x')); walls.push(wall(s, c, 18, 'x')); }
    for (let r = 15; r < 18; r += N) { walls.push(wall(s, 16, r, 'y')); walls.push(wall(s, 20, r, 'y')); }
    const e = addEnemy(s, 'breaker', 8.5, 16.5);
    for (let t = 0; t < 30 && e.alive; t += 0.05) stepEnemy(s, e, 0.05);
    expect(e.alive).toBe(false);
    expect(walls.some((w) => w.destroyed)).toBe(true);
  });

  it('blows up when shot down, wherever it is: breaks nearby walls, hurts buildings, pays its bounty', () => {
    const s = makeStateWithTownHall();
    const w = wall(s, 5, 5, 'x', 6);
    const near = addBuilding(s, 'cannon', 6, 6);
    const far = addBuilding(s, 'mine', 11, 11);
    const e = addEnemy(s, 'breaker', 6.5, 4.2, { hp: 10, maxHp: 10 });
    const gold = s.gold, nearHp = near.hp, farHp = far.hp;
    damageEnemy(s, e, 50);
    expect(e.alive).toBe(false);
    expect(w.destroyed).toBe(true);
    expect(nearHp - near.hp).toBe(cfg.damage);
    expect(far.hp).toBe(farHp);
    expect(s.gold).toBeGreaterThan(gold); // shot down: bounty paid
    expect(s.events.filter((x) => x.name === 'enemyExploded')).toHaveLength(1);
  });

  it('shot down in the open, it still explodes but hurts nothing out of reach', () => {
    const s = makeStateWithTownHall();
    const e = addEnemy(s, 'breaker', 3, 28, { hp: 10, maxHp: 10 });
    damageEnemy(s, e, 50);
    expect(s.events.find((x) => x.name === 'enemyExploded').data.hit).toEqual([]);
  });

  it('hits buildings with its base damage, not the wall multiplier', () => {
    const s = makeStateWithTownHall();
    const hp = s.buildings[0].hp;
    damageBuilding(s, s.buildings[0], enemyDamageVs(cfg, s.buildings[0]));
    expect(hp - s.buildings[0].hp).toBe(cfg.damage);
  });

  it('joins the waves from wave 3', () => {
    expect(CONFIG.waves.map((w) => w.breaker)).toEqual([0, 0, 2, 4]);
  });
});
