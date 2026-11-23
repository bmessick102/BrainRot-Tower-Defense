import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { findNearestBuilding, ensureTarget, stepEnemy, stepEnemies, separateEnemies, createEnemy, SPAWN_JITTER } from '../src/logic/enemies.js';
import { isInsideFootprint, distanceToFootprint } from '../src/logic/grid.js';
import { damageBuilding, isValidTarget } from '../src/logic/combat.js';
import { footprintCenter } from '../src/logic/grid.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

describe('enemies.js', () => {
  it('picks the nearest non-destroyed building by footprint distance', () => {
    const state = makeStateWithTownHall();       // town hall at (19,19)
    const mine = addBuilding(state, 'mine', 6, 6);
    expect(findNearestBuilding(state, 5, 5).id).toBe(mine.id);
    expect(findNearestBuilding(state, 22, 18).id).toBe(state.buildings[0].id);
    mine.destroyed = true;
    expect(findNearestBuilding(state, 5, 5).id).toBe(state.buildings[0].id);
  });

  it('breaks ties by building list order', () => {
    const state = makeStateWithTownHall();
    const a = addBuilding(state, 'mine', 5, 10);
    const right = a.col + a.size + 3;
    addBuilding(state, 'cannon', right, 10);
    // halfway between a's right edge and the cannon's left edge: equal distance to both
    const mid = (a.col + a.size + right) / 2;
    expect(findNearestBuilding(state, mid, 11).id).toBe(a.id);
  });

  it('re-targets only after the current target is destroyed', () => {
    const state = makeStateWithTownHall();
    const mine = addBuilding(state, 'mine', 6, 6);
    const cannon = addBuilding(state, 'cannon', 10, 6);
    const e = addEnemy(state, 'grunt', 9.5, 4);
    e.targetId = mine.id;                           // farther than the cannon, but current
    expect(ensureTarget(state, e).id).toBe(mine.id);
    damageBuilding(state, mine, 99999);
    expect(ensureTarget(state, e).id).toBe(cannon.id);
  });

  it('targets the town hall when everything else is destroyed', () => {
    const state = makeStateWithTownHall();
    const mine = addBuilding(state, 'mine', 6, 6);
    mine.destroyed = true;
    const e = addEnemy(state, 'grunt', 5, 5);
    expect(ensureTarget(state, e).type).toBe('townHall');
  });

  it('walks around a building in its way instead of through it', () => {
    const state = makeStateWithTownHall();          // TH at cols 19-21, rows 19-21
    const th = state.buildings[0];
    const blocker = addBuilding(state, 'cannon', 12, 20);  // on the straight line to the town hall
    const e = addEnemy(state, 'grunt', 8, 21.5);
    e.targetId = th.id;
    let enteredBlocker = false;
    for (let i = 0; i < 600 && th.hp === CONFIG.townHall.levels[0].hp; i++) {
      stepEnemy(state, e, 0.05);
      if (e.x > 12 && e.x < 14 && e.y > 20 && e.y < 22) enteredBlocker = true;
    }
    expect(th.hp).toBeLessThan(CONFIG.townHall.levels[0].hp); // reached and hit the target
    expect(blocker.hp).toBe(CONFIG.defenses.cannon.levels[0].hp); // never attacked the cannon
    expect(enteredBlocker).toBe(false);
    expect(e.targetId).toBe(th.id);
  });

  it('ground enemies stop at attack range and hit their target', () => {
    const state = makeStateWithTownHall();
    const th = state.buildings[0];
    const e = addEnemy(state, 'grunt', 12, 20.5);
    e.targetId = th.id;
    for (let i = 0; i < 400; i++) stepEnemy(state, e, 0.05);
    expect(19 - e.x).toBeCloseTo(CONFIG.enemies.grunt.attackRange, 5);
    expect(th.hp).toBeLessThan(CONFIG.townHall.levels[0].hp);
  });

  it.each(['cannon', 'wizard'])('slingers attacking a %s stop where it can shoot back', (type) => {
    // From straight on and from the diagonals (a footprint corner is the worst case).
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7]]) {
      const state = makeStateWithTownHall();
      const def = addBuilding(state, type, 10, 8);
      const c = footprintCenter(def);
      const e = addEnemy(state, 'slinger', c.x + dx * 9, c.y + dy * 9);
      e.targetId = def.id;
      for (let i = 0; i < 400 && !e.attacking; i++) stepEnemy(state, e, 0.05);
      expect(e.attacking).toBe(true);
      expect(isValidTarget(def, e)).toBe(true);
    }
  });

  it('slingers keep their full range against buildings that cannot shoot', () => {
    const state = makeStateWithTownHall();
    const mine = addBuilding(state, 'mine', 10, 8);
    const e = addEnemy(state, 'slinger', 3, 9);
    e.targetId = mine.id;
    for (let i = 0; i < 400 && !e.attacking; i++) stepEnemy(state, e, 0.05);
    expect(distanceToFootprint(mine, e.x, e.y)).toBeCloseTo(CONFIG.enemies.slinger.attackRange, 1); // within a frame's step
  });

  it('bombers fly to the footprint center and drop bombs', () => {
    const state = makeStateWithTownHall();
    const th = state.buildings[0];
    const e = addEnemy(state, 'bomber', 5, 5);
    for (let i = 0; i < 400; i++) stepEnemy(state, e, 0.05);
    const c = footprintCenter(th);
    expect(e.x).toBeCloseTo(c.x, 5);
    expect(e.y).toBeCloseTo(c.y, 5);
    expect(state.projectiles.some((p) => p.kind === 'bomb')).toBe(true);
  });

  it('enemies on the same spot push apart instead of stacking', () => {
    const state = makeStateWithTownHall();
    const a = addEnemy(state, 'grunt', 8, 8);
    const b = addEnemy(state, 'grunt', 8, 8);
    for (let i = 0; i < 20; i++) separateEnemies(state);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(CONFIG.enemies.grunt.radius * 2 * 0.9);
  });

  it('a crowd attacking a building spreads around it, keeps attacking, and is never pushed inside it', () => {
    const state = makeStateWithTownHall();
    const th = state.buildings[0];
    th.hp = 1e9;
    const crowd = [];
    for (let i = 0; i < 20; i++) crowd.push(addEnemy(state, 'grunt', 8 + (i % 4) * 0.05, 16 + Math.floor(i / 4) * 0.05, { hp: 1e6, maxHp: 1e6 }));
    for (let i = 0; i < 600; i++) stepEnemies(state, 0.05);
    let minD = Infinity;
    for (let i = 0; i < crowd.length; i++) for (let j = i + 1; j < crowd.length; j++) minD = Math.min(minD, Math.hypot(crowd[i].x - crowd[j].x, crowd[i].y - crowd[j].y));
    expect(minD).toBeGreaterThan(CONFIG.enemies.grunt.radius * 2 * 0.7);
    expect(crowd.every((e) => !isInsideFootprint(th, e.x, e.y, -0.01))).toBe(true);
    expect(crowd.filter((e) => e.attacking).length).toBeGreaterThan(10);
    expect(th.hp).toBeLessThan(1e9);
  });

  it('a group of bombers spreads out over the target and every one still bombs it', () => {
    const state = makeStateWithTownHall();
    state.buildings[0].hp = 1e9;
    const bombers = [];
    for (let i = 0; i < 6; i++) bombers.push(addEnemy(state, 'bomber', 6 + i * 0.1, 6, { hp: 1e6, maxHp: 1e6 }));
    const bombedBy = new Set();
    for (let i = 0; i < 400; i++) {
      stepEnemies(state, 0.05);
      for (const p of state.projectiles) if (p.kind === 'bomb') bombedBy.add(p.sourceId);
    }
    let minD = Infinity;
    for (let i = 0; i < bombers.length; i++) for (let j = i + 1; j < bombers.length; j++) minD = Math.min(minD, Math.hypot(bombers[i].x - bombers[j].x, bombers[i].y - bombers[j].y));
    expect(minD).toBeGreaterThan(CONFIG.enemies.bomber.radius);
    expect(bombedBy.size).toBe(bombers.length);
  });

  it('spawns within the jitter radius and scales HP only', () => {
    const state = makeStateWithTownHall();
    for (let i = 0; i < 50; i++) {
      const e = createEnemy(state, 'tank', 10, 10, 1.2);
      expect(Math.abs(e.x - 10)).toBeLessThanOrEqual(SPAWN_JITTER);
      expect(Math.abs(e.y - 10)).toBeLessThanOrEqual(SPAWN_JITTER);
      expect(e.maxHp).toBe(Math.round(CONFIG.enemies.tank.hp * 1.2));
    }
  });
});
