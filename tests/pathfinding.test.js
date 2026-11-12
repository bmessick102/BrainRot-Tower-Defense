import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepEnemy, findNearestBuilding } from '../src/logic/enemies.js';
import { getNav, distanceField, nextStep, breakCost } from '../src/logic/pathfinding.js';
import { createBuilding, footprintDims, checkBuy, limitFor } from '../src/logic/buildings.js';
import { damageBuilding } from '../src/logic/combat.js';
import { makeStateWithTownHall, addEnemy } from './helpers.js';

const N = CONFIG.walls.segmentLength;

function wall(state, col, row, orient = 'x', level = 1) {
  const b = createBuilding(state, 'wall', col, row, level, null, orient);
  state.buildings.push(b);
  return b;
}

/** Ring of walls (segments) around the rectangle [c0, c1) x [r0, r1), one tile out. */
function encloseWithWalls(state, c0, r0, c1, r1) {
  const walls = [];
  for (let c = c0 - 1; c < c1 + 1; c += N) {
    walls.push(wall(state, c, r0 - 1, 'x'));
    walls.push(wall(state, c, r1, 'x'));
  }
  for (let r = r0; r < r1; r += N) {
    walls.push(wall(state, c0 - 1, r, 'y'));
    walls.push(wall(state, c1, r, 'y'));
  }
  return walls;
}

const run = (state, e, seconds, until = () => false) => {
  for (let t = 0; t < seconds && !until(); t += 0.05) stepEnemy(state, e, 0.05);
};

describe('walls', () => {
  it('are straight segments of segmentLength tiles that can be rotated', () => {
    expect(footprintDims('wall', 'x')).toEqual({ w: N, h: 1 });
    expect(footprintDims('wall', 'y')).toEqual({ w: 1, h: N });
    const s = makeStateWithTownHall();
    const w = wall(s, 5, 5, 'y');
    expect([w.w, w.h, w.orient]).toEqual([1, N, 'y']);
  });

  it('unlock at TH1 with a per-Town-Hall segment limit', () => {
    const s = makeStateWithTownHall({ gold: 99999 });
    for (let i = 0; i < limitFor('wall', 1); i++) {
      expect(checkBuy(s, 'wall').ok).toBe(true);
      wall(s, 2 + i * N, 8);
    }
    expect(checkBuy(s, 'wall').reason).toBe('Limit reached');
  });

  it('are never chosen as an enemy target', () => {
    const s = makeStateWithTownHall();
    wall(s, 5, 5);
    expect(findNearestBuilding(s, 5, 5).type).toBe('townHall');
  });

  it('cost more to break as they level up', () => {
    const s = makeStateWithTownHall();
    expect(breakCost(wall(s, 2, 8, 'x', 5))).toBeGreaterThan(breakCost(wall(s, 2, 10, 'x', 1)));
  });
});

describe('ground pathfinding', () => {
  it('walks around a wall when there is a short way around', () => {
    const s = makeStateWithTownHall(); // TH cols 17-19, rows 15-17
    const th = s.buildings[0];
    // A short vertical wall in the straight line from the enemy to the town hall.
    const w = wall(s, 12, 15, 'y');
    const e = addEnemy(s, 'grunt', 6.5, 16.5);
    e.targetId = th.id;
    run(s, e, 60, () => th.hp < CONFIG.townHall.levels[0].hp);
    expect(th.hp).toBeLessThan(CONFIG.townHall.levels[0].hp);
    expect(w.hp).toBe(CONFIG.walls.levels[0].hp);
  });

  it('breaks through when the target is sealed in', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    const walls = encloseWithWalls(s, 17, 15, 20, 18);
    const e = addEnemy(s, 'grunt', 8.5, 16.5, { hp: 9999, maxHp: 9999 });
    e.targetId = th.id;
    run(s, e, 400, () => th.hp < CONFIG.townHall.levels[0].hp);
    expect(walls.some((w) => w.destroyed)).toBe(true);
    expect(th.hp).toBeLessThan(CONFIG.townHall.levels[0].hp);
  });

  it('picks the cheaper of a long detour and breaking a weak wall', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    // A long wall line across most of the map between enemy and target.
    const line = [];
    for (let r = 0; r < 31; r += N) line.push(wall(s, 12, r, 'y'));
    const e = addEnemy(s, 'grunt', 6.5, 16.5, { hp: 9999, maxHp: 9999 });
    e.targetId = th.id;
    const nav = getNav(s);
    const step = nextStep(nav, distanceField(nav, th, 0.5), e.x, e.y);
    expect(step).not.toBeNull();
    run(s, e, 300, () => th.hp < CONFIG.townHall.levels[0].hp);
    expect(line.some((w) => w.destroyed)).toBe(true); // smashed through rather than walking off the map edge
  });

  it('rebuilds paths when a wall is destroyed', () => {
    const s = makeStateWithTownHall();
    const w = wall(s, 12, 15, 'y');
    const before = getNav(s);
    damageBuilding(s, w, 99999);
    const after = getNav(s);
    expect(after).not.toBe(before);
  });

  it('Sneaker Sharks leap a full ring of walls without breaking any', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    const walls = encloseWithWalls(s, 17, 15, 20, 18);
    const e = addEnemy(s, 'shark', 8.5, 16.5, { hp: 9999, maxHp: 9999 });
    e.targetId = th.id;
    let hopped = false;
    run(s, e, 60, () => { if (e.overWall) hopped = true; return th.hp < CONFIG.townHall.levels[0].hp; });
    expect(hopped).toBe(true);
    expect(th.hp).toBeLessThan(CONFIG.townHall.levels[0].hp);
    expect(walls.every((w) => !w.destroyed && w.hp === CONFIG.walls.levels[0].hp)).toBe(true);
    // One 'enemyJump' per leap (for the jump sound), not one every step spent over the wall.
    const jumps = s.events.filter((ev) => ev.name === 'enemyJump' && ev.data.id === e.id).length;
    expect(jumps).toBeGreaterThanOrEqual(1);
    expect(jumps).toBeLessThanOrEqual(2);
  });

  it('melee attacks say which enemy struck (for its hit sound)', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    const e = addEnemy(s, 'tank', 16.4, 16.5);
    e.targetId = th.id;
    run(s, e, 3, () => s.events.some((ev) => ev.name === 'enemyAttack'));
    expect(s.events.find((ev) => ev.name === 'enemyAttack').data.kind).toBe('tank');
  });

  it('Sneaker Sharks still walk around other buildings', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    const blocker = createBuilding(s, 'cannon', 10, 16, 1);
    s.buildings.push(blocker);
    const e = addEnemy(s, 'shark', 6, 17.5, { hp: 9999, maxHp: 9999 });
    e.targetId = th.id;
    let entered = false;
    run(s, e, 40, () => { if (e.x > 10 && e.x < 12 && e.y > 16 && e.y < 18) entered = true; return th.hp < CONFIG.townHall.levels[0].hp; });
    expect(entered).toBe(false);
    expect(blocker.hp).toBe(CONFIG.defenses.cannon.levels[0].hp);
  });

  it('air enemies fly straight over walls', () => {
    const s = makeStateWithTownHall();
    const th = s.buildings[0];
    const walls = encloseWithWalls(s, 17, 15, 20, 18);
    const b = addEnemy(s, 'bomber', 8.5, 16.5);
    b.targetId = th.id;
    run(s, b, 30);
    expect(b.x).toBeCloseTo(18.5, 3);
    expect(b.y).toBeCloseTo(16.5, 3);
    expect(walls.every((w) => !w.destroyed && w.hp === CONFIG.walls.levels[0].hp)).toBe(true);
  });
});
