import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ensureTarget, stepEnemy, enemyDamageVs, spawnEnemy, createEnemy } from '../src/logic/enemies.js';
import { createBuilding } from '../src/logic/buildings.js';
import { damageBuilding, chooseTarget, applySplash } from '../src/logic/combat.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const cfg = CONFIG.enemies.thief;
const run = (state, e, seconds, until = () => false) => {
  for (let t = 0; t < seconds && !until(); t += 0.05) stepEnemy(state, e, 0.05);
};

describe('Mr. Least (thief)', () => {
  it('goes for a money building even when other buildings are closer', () => {
    const s = makeStateWithTownHall(); // Village Hall at cols 17-19, rows 15-17
    addBuilding(s, 'cannon', 12, 16);
    const mine = addBuilding(s, 'mine', 26, 26);
    const e = addEnemy(s, 'thief', 10, 17);
    expect(ensureTarget(s, e).id).toBe(mine.id);
  });

  it('picks the nearest money building, Storages and Mines alike', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'mine', 26, 26);
    const storage = addBuilding(s, 'storage', 8, 8);
    const e = addEnemy(s, 'thief', 6, 6);
    expect(ensureTarget(s, e).id).toBe(storage.id);
  });

  it('only attacks other buildings once every money building is destroyed', () => {
    const s = makeStateWithTownHall();
    const cannon = addBuilding(s, 'cannon', 12, 16);
    const mine = addBuilding(s, 'mine', 26, 26);
    const e = addEnemy(s, 'thief', 10, 17);
    expect(ensureTarget(s, e).id).toBe(mine.id);
    damageBuilding(s, mine, 99999);
    expect(ensureTarget(s, e).id).toBe(cannon.id);
  });

  it('chooses its money target the moment it spawns', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 4, 6);
    const e = spawnEnemy(s, 'thief', 'top');
    expect(e.targetId).toBe(mine.id);
  });

  it('hits money buildings 3x as hard and everything else at 0.4x', () => {
    const s = makeStateWithTownHall();
    expect(enemyDamageVs(cfg, { type: 'mine' })).toBe(cfg.damage * 3);
    expect(enemyDamageVs(cfg, { type: 'storage' })).toBe(cfg.damage * 3);
    expect(enemyDamageVs(cfg, { type: 'cannon' })).toBe(cfg.damage * 0.4);
    expect(enemyDamageVs(cfg, { type: 'wall' })).toBe(cfg.damage * 0.4);
    expect(enemyDamageVs(cfg, s.buildings[0])).toBe(cfg.damage * 0.4); // Village Hall
    expect(enemyDamageVs(CONFIG.enemies.grunt, { type: 'mine' })).toBe(CONFIG.enemies.grunt.damage); // others unchanged
  });

  it('deals the boosted damage in a real attack', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 10, 16);
    const e = addEnemy(s, 'thief', 9.6, 17);
    e.targetId = mine.id;
    const hp = mine.hp;
    run(s, e, 3, () => mine.hp < hp);
    expect(hp - mine.hp).toBe(cfg.damage * 3);
  });

  it('hops over a ring of walls to reach a mine, without breaking any', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 6);
    const N = CONFIG.walls.segmentLength;
    const walls = [];
    const wall = (c, r, o) => { const w = createBuilding(s, 'wall', c, r, 1, null, o); s.buildings.push(w); walls.push(w); };
    for (let c = 8; c < 12; c += N) { wall(c, 5, 'x'); wall(c, 8, 'x'); }
    for (let r = 6; r < 8; r += N) { wall(8, r, 'y'); wall(11, r, 'y'); }
    const e = addEnemy(s, 'thief', 3.5, 12.5, { hp: 9999, maxHp: 9999 });
    e.targetId = mine.id;
    let hopped = false;
    const hp = mine.hp;
    run(s, e, 40, () => { if (e.overWall) hopped = true; return mine.hp < hp; });
    expect(hopped).toBe(true);
    expect(mine.hp).toBeLessThan(hp);
    expect(walls.every((w) => !w.destroyed && w.hp === CONFIG.walls.levels[0].hp)).toBe(true);
  });

  it('spawns invisible: defenses in range cannot target it', () => {
    const s = makeStateWithTownHall();
    const cannon = addBuilding(s, 'cannon', 9, 16);
    const e = createEnemy(s, 'thief', 10, 15);
    s.enemies.push(e);
    expect(e.hidden).toBe(true);
    expect(chooseTarget(s, cannon)).toBeNull();
    e.hidden = false;
    expect(chooseTarget(s, cannon)).toBe(e);
  });

  it('is revealed by its first wall jump', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 6);
    const N = CONFIG.walls.segmentLength;
    for (let c = 8; c < 12; c += N) { for (const r of [5, 8]) s.buildings.push(createBuilding(s, 'wall', c, r, 1, null, 'x')); }
    for (let r = 6; r < 8; r += N) { for (const c of [8, 11]) s.buildings.push(createBuilding(s, 'wall', c, r, 1, null, 'y')); }
    const e = addEnemy(s, 'thief', 3.5, 12.5, { hp: 9999, maxHp: 9999, hidden: true });
    e.targetId = mine.id;
    let hiddenUntilJump = true;
    run(s, e, 40, () => { if (!e.overWall && !e.hidden) return true; if (e.overWall) return true; if (!e.hidden) hiddenUntilJump = false; return false; });
    expect(hiddenUntilJump).toBe(true);
    expect(e.overWall).toBe(true);
    expect(e.hidden).toBe(false);
    expect(s.events.filter((x) => x.name === 'enemyRevealed')).toHaveLength(1);
  });

  it('with no walls in the way, its first hit on a building reveals it', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 16);
    const e = addEnemy(s, 'thief', 7, 17, { hidden: true });
    e.targetId = mine.id;
    const hp = mine.hp;
    run(s, e, 5, () => mine.hp < hp);
    expect(mine.hp).toBeLessThan(hp);
    expect(e.hidden).toBe(false);
  });

  it('splash damage still hurts it while invisible', () => {
    const s = makeStateWithTownHall();
    const e = addEnemy(s, 'thief', 5, 5, { hidden: true, hp: 60, maxHp: 60 });
    applySplash(s, 5.2, 5, 1, 25, true, false);
    expect(e.hp).toBe(35);
    expect(e.hidden).toBe(true); // getting hit doesn't reveal it
  });

  it('only scratches walls if it ever hits one', () => {
    const s = makeStateWithTownHall();
    const wall = createBuilding(s, 'wall', 8, 16, 1, null, 'y');
    s.buildings.push(wall);
    const hp = wall.hp;
    damageBuilding(s, wall, enemyDamageVs(cfg, wall));
    expect(hp - wall.hp).toBe(cfg.damage * 0.4);
  });

  it('joins the waves from wave 2', () => {
    expect(CONFIG.waves.map((w) => w.thief)).toEqual([0, 2, 4, 4, 8]); // v0.5 rebalance
  });
});
