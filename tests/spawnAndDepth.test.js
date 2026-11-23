import { describe, it, expect } from 'vitest';
import { MAP } from '../src/mapTiles.js';
import { spawnEnemy, stepEnemies, SPAWN_JITTER, ENTRY_SPREAD } from '../src/logic/enemies.js';
import { PATHS } from '../src/logic/waves.js';
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
    // ...but funnelled along the dirt path: through its bends (MAP.spawnRoutes), then its entrance onto the grass.
    const stops = [g.entry, ...g.route];
    const want = [...MAP.spawnRoutes.top, MAP.spawnPoints.top];
    expect(stops).toHaveLength(want.length);
    stops.forEach((p, i) => expect(Math.hypot(p.x - want[i][0], p.y - want[i][1])).toBeLessThanOrEqual(ENTRY_SPREAD + 1e-9));
    const b = spawnEnemy(s, 'bomber', 'top');
    expect(b.entry).toBeFalsy(); // flyers head straight in
    for (let i = 0; i < 400 && g.entry; i++) stepEnemies(s, 0.05);
    expect(g.entry).toBeNull();
    const [sx, sy] = MAP.spawnPoints.top;
    expect(Math.hypot(g.x - sx, g.y - sy)).toBeLessThan(1.2);
  });

  it('ground troops on a winding path walk every bend in order (out of the cave, over the stone bridge)', () => {
    for (const path of ['cave', 'stoneBridge']) {
      const s = makeStateWithTownHall();
      const g = spawnEnemy(s, 'grunt', path);
      const want = [...MAP.spawnRoutes[path], MAP.spawnPoints[path]];
      expect(want.length).toBeGreaterThan(2);
      let next = 0;
      for (let i = 0; i < 2000 && g.entry; i++) {
        stepEnemies(s, 0.05);
        const [wx, wy] = want[next];
        if (next < want.length - 1 && Math.hypot(g.x - wx, g.y - wy) < 1.2) next++;
      }
      expect(g.entry, path).toBeNull();
      expect(next, path).toBe(want.length - 1); // passed every bend on the way
    }
  });

  it('there are 8 entrances, every one with a spawn, a route and an entrance on the grass', () => {
    expect(Object.keys(MAP.spawnPoints).sort()).toEqual([...PATHS].sort());
    for (const path of PATHS) {
      const [sx, sy] = MAP.spawnPoints[path];
      expect(sx >= 0.5 && sy >= 0.5 && sx <= MAP.cols - 0.5 && sy <= MAP.rows - 0.5, path).toBe(true);
      const [ex, ey] = MAP.edgeSpawnPoints[path];
      expect(ex < 0 || ey < 0 || ex > MAP.cols || ey > MAP.rows, path).toBe(true); // appears off the grass
      expect(Array.isArray(MAP.spawnRoutes[path]), path).toBe(true);
    }
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
    const s = makeStateWithTownHall(); // town hall at cols 19-21, rows 19-21
    const ok = walkableGrid(s.buildings);
    const path = findPath(ok, 17.5, 20.5, 23.5, 20.5);
    expect(path).not.toBeNull();
    for (const p of path) expect(ok[Math.floor(p.y) * MAP.cols + Math.floor(p.x)]).toBe(1);
    const end = path[path.length - 1];
    expect([end.x, end.y]).toEqual([23.5, 20.5]);
    expect(findPath(ok, 17.5, 20.5, 20.5, 20.5)).toBeNull(); // can't end inside a building
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
