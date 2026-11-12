import { describe, it, expect } from 'vitest';
import { MAP } from '../src/mapTiles.js';
import { spawnEnemy, stepEnemies, SPAWN_JITTER, ENTRY_SPREAD } from '../src/logic/enemies.js';
import { walkableGrid, findPath, TILE_OPEN, TILE_WALL } from '../src/objects/Villagers.js';
import { groundDepth } from '../src/objects/depth.js';
import { makeStateWithTownHall } from './helpers.js';

describe('edge spawning', () => {
  it('enemies appear at the map edge; ground troops march to the path entrance first', () => {
    const s = makeStateWithTownHall();
    const g = spawnEnemy(s, 'grunt', 'top');
    const [ex, ey] = MAP.edgeSpawnPoints.top;
    expect(Math.hypot(g.x - ex, g.y - ey)).toBeLessThanOrEqual(SPAWN_JITTER + 1e-9); // spread out around the corner
    expect(g.entry).toBeTruthy();
    // ...but funnelled onto the dirt path at its entrance.
    const [px, py] = MAP.spawnPoints.top;
    expect(Math.hypot(g.entry.x - px, g.entry.y - py)).toBeLessThanOrEqual(ENTRY_SPREAD + 1e-9);
    const b = spawnEnemy(s, 'bomber', 'top');
    expect(b.entry).toBeFalsy(); // flyers head straight in
    for (let i = 0; i < 400 && g.entry; i++) stepEnemies(s, 0.05);
    expect(g.entry).toBeNull();
    const [sx, sy] = MAP.spawnPoints.top;
    expect(Math.hypot(g.x - sx, g.y - sy)).toBeLessThan(1.2);
  });

  it('every edge spawn is farther from the village than its path entrance', () => {
    const [cx, cy] = MAP.townHallAnchor;
    for (const path of Object.keys(MAP.spawnPoints)) {
      const [ex, ey] = MAP.edgeSpawnPoints[path], [sx, sy] = MAP.spawnPoints[path];
      expect(Math.hypot(ex - cx, ey - cy)).toBeGreaterThan(Math.hypot(sx - cx, sy - cy) + 5);
    }
  });
});

describe('gnome paths', () => {
  it('walk around buildings and never cut through a corner', () => {
    const s = makeStateWithTownHall(); // town hall at cols 17-19, rows 15-17
    const ok = walkableGrid(s.buildings);
    const path = findPath(ok, 15.5, 16.5, 21.5, 16.5);
    expect(path).not.toBeNull();
    for (const p of path) expect(ok[Math.floor(p.y) * MAP.cols + Math.floor(p.x)]).toBe(1);
    const end = path[path.length - 1];
    expect([end.x, end.y]).toEqual([21.5, 16.5]);
    expect(findPath(ok, 15.5, 16.5, 18.5, 16.5)).toBeNull(); // can't end inside a building
  });

  const wall = (col, row) => ({ type: 'wall', col, row, w: 1, h: 1 });
  const tile = (ok, p) => ok[Math.floor(p.y) * MAP.cols + Math.floor(p.x)];

  it('hop over a long wall instead of walking all the way around it', () => {
    const s = makeStateWithTownHall();
    for (let r = 0; r < MAP.rows; r++) s.buildings.push(wall(12, r)); // splits the map in two
    const ok = walkableGrid(s.buildings);
    const path = findPath(ok, 10.5, 16.5, 14.5, 16.5);
    expect(path).not.toBeNull();
    expect(path.some((p) => tile(ok, p) === TILE_WALL)).toBe(true); // crossed it
    expect(path.filter((p) => tile(ok, p) === TILE_WALL)).toHaveLength(1); // straight over, not along it
    expect(findPath(ok, 10.5, 16.5, 12.5, 16.5)).toBeNull(); // never stops on a wall
  });

  it('still walk around a short wall when that is about as quick', () => {
    const s = makeStateWithTownHall();
    s.buildings.push(wall(12, 16));
    const ok = walkableGrid(s.buildings);
    const path = findPath(ok, 10.5, 16.5, 14.5, 16.5);
    expect(path.every((p) => tile(ok, p) === TILE_OPEN)).toBe(true);
  });
});

describe('ground draw order', () => {
  const th = { col: 17, row: 15, size: 3 };
  it('draws something in front of a building face over the building', () => {
    const front = th.col + 3 + th.row + 3;
    expect(groundDepth([th], 20.3, 15.4)).toBeGreaterThan(front); // beside the front-right face
    expect(groundDepth([th], 17.4, 18.3)).toBeGreaterThan(front); // beside the front-left face
  });
  it('leaves something behind a building under it', () => {
    expect(groundDepth([th], 16.5, 15.5)).toBeLessThan(th.col + 3 + th.row + 3);
    expect(groundDepth([th], 18, 14.5)).toBeLessThan(th.col + 3 + th.row + 3);
  });
});
