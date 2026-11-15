import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { getNav, distanceField } from '../src/logic/pathfinding.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';
import { MAP } from '../src/mapTiles.js';

describe('pathfinding performance (late waves)', () => {
  it('a field through rings of top-level walls and tough buildings builds fast and exactly', () => {
    const s = makeStateWithTownHall({}, 10);
    const hall = s.buildings[0];
    // Three nested rings of top-level walls around the hall: huge, uneven step costs (the case where 32-bit
    // distances made Dijkstra re-expand tiles endlessly and one field took seconds).
    const top = CONFIG.walls.levels.length;
    for (let ring = 3; ring <= 7; ring += 2) {
      for (let c = hall.col - ring; c <= hall.col + 2 + ring; c++) {
        for (const r of [hall.row - ring, hall.row + 2 + ring]) {
          if (c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows) addBuilding(s, 'wall', c, r, top);
        }
      }
      for (let r = hall.row - ring + 1; r <= hall.row + 1 + ring; r++) {
        for (const c of [hall.col - ring, hall.col + 2 + ring]) {
          if (c >= 0 && r >= 0 && c < MAP.cols && r < MAP.rows) addBuilding(s, 'wall', c, r, top);
        }
      }
    }
    const nav = getNav(s);
    const t0 = performance.now();
    for (const reach of [0.5, 0.75, 1, 2, 3]) {
      nav.fields.clear();
      distanceField(nav, hall, reach, false);
      distanceField(nav, hall, reach, true);
    }
    expect(performance.now() - t0).toBeLessThan(250); // 10 fields; each used to be able to take seconds
    // Exact: a tile outside all three rings costs at least three wall breaks to reach the hall.
    const field = distanceField(nav, hall, 0.5, false);
    const wallStep = 1 + CONFIG.walls.levels[top - 1].hp * CONFIG.pathing.wallCostPerHp;
    expect(field[0]).toBeGreaterThanOrEqual(3 * wallStep);
    expect(Number.isFinite(field[0])).toBe(true);
    // Wall jumpers pay nothing for walls.
    const jump = distanceField(nav, hall, 0.5, true);
    expect(jump[0]).toBeLessThan(3 * wallStep);
  });
});
