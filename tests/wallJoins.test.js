import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createBuilding, footprintDims } from '../src/logic/buildings.js';
import { parseSave, migrateV2 } from '../src/logic/save.js';
import { makeStateWithTownHall } from './helpers.js';
import { wallTiles, wallsJoined, wallParts, wallPillarWidth, PILLAR_WIDTH, wallLinksFor } from '../src/objects/WallView.js';
import { MAP } from '../src/mapTiles.js';
import { WALL_ART_META } from '../src/wallArtMeta.js';

const wall = (s, c, r) => { const b = createBuilding(s, 'wall', c, r, 1, null, 'x'); s.buildings.push(b); return b; };
const line = (s, c, r, n, dc, dr) => Array.from({ length: n }, (_, i) => wall(s, c + i * dc, r + i * dr));
const partsOf = (s, walls) => { const t = wallTiles(s.buildings); return walls.flatMap((w) => wallParts(t, w)); };

describe('single-tile walls', () => {
  it('a wall is one tile; walls cost a third of an old 3-tile segment and 3x as many are allowed', () => {
    expect(CONFIG.walls.segmentLength).toBe(1);
    expect(footprintDims('wall', 'x')).toEqual({ w: 1, h: 1 });
    expect(footprintDims('wall', 'y')).toEqual({ w: 1, h: 1 });
    expect(CONFIG.walls.levels[0].cost).toBe(17);
    expect(CONFIG.limits.wall[0]).toBe(24);
  });

  it('old saves: each 3-tile segment becomes three walls on the same tiles, same level', () => {
    const v2 = {
      version: 2, buildings: [
        { id: 'b1', type: 'townHall', level: 2, col: 17, row: 15 },
        { id: 'b7', type: 'wall', level: 2, col: 4, row: 20, orient: 'x' },
        { id: 'b9', type: 'wall', level: 1, col: 10, row: 20, orient: 'y' }
      ]
    };
    const v3 = migrateV2(v2);
    const walls = v3.buildings.filter((b) => b.type === 'wall').map((b) => [b.col, b.row, b.level]);
    expect(walls).toEqual([[4, 20, 2], [5, 20, 2], [6, 20, 2], [10, 20, 1], [10, 21, 1], [10, 22, 1]]);
    expect(new Set(v3.buildings.map((b) => b.id)).size).toBe(v3.buildings.length); // ids stay unique
    expect(v3.version).toBe(3);
  });

  it('a version 2 save with walls still loads', () => {
    const save = {
      version: 2, savedAt: 'x', gold: 10, townHallLevel: 1, wavesCleared: 1, nightsAtMaxTownHall: 0,
      clock: { phase: 'day', t: 0 }, tutorialStep: 10, tutorialDone: true,
      buildings: [{ id: 'b1', type: 'townHall', level: 1, col: 17, row: 15 }, { id: 'b2', type: 'wall', level: 1, col: 4, row: 20, orient: 'x' }]
    };
    const r = parseSave(JSON.stringify(save));
    expect(r.status).toBe('ok');
    expect(r.data.buildings.filter((b) => b.type === 'wall')).toHaveLength(3);
  });
});

describe('connected walls: pillars, with a connector between every two touching walls', () => {
  const pillars = (parts) => parts.filter((p) => p.kind === 'pillar').map((p) => `${p.x},${p.y}`).sort();
  const links = (parts) => parts.filter((p) => p.kind === 'link').map((p) => `${p.axis}:${p.x},${p.y}`).sort();

  it('a straight line: a pillar on every wall and one connector between each pair', () => {
    const s = makeStateWithTownHall();
    const p = partsOf(s, line(s, 2, 22, 4, 1, 0));
    expect(pillars(p)).toEqual(['2.5,22.5', '3.5,22.5', '4.5,22.5', '5.5,22.5']);
    expect(links(p)).toEqual(['x:3,22.5', 'x:4,22.5', 'x:5,22.5']);
  });

  it('corners and T-junctions connect', () => {
    const s = makeStateWithTownHall();
    const p = partsOf(s, [...line(s, 2, 20, 3, 1, 0), ...line(s, 3, 21, 2, 0, 1)]); // a T: down from the middle
    expect(links(p)).toContain('y:3.5,21');
    expect(links(p)).toHaveLength(2 + 2);
  });

  it('walls running alongside each other connect too', () => {
    const s = makeStateWithTownHall();
    const ws = [...line(s, 2, 22, 3, 1, 0), ...line(s, 2, 23, 3, 1, 0)];
    expect(wallsJoined(wallTiles(s.buildings), 2, 22, 0, 1)).toBe(true);
    expect(links(partsOf(s, ws)).filter((l) => l.startsWith('y'))).toEqual(['y:2.5,23', 'y:3.5,23', 'y:4.5,23']);
  });

  it('diagonal neighbors do not connect; a destroyed wall breaks the line', () => {
    const s = makeStateWithTownHall();
    wall(s, 2, 22);
    wall(s, 3, 23);
    expect(wallsJoined(wallTiles(s.buildings), 2, 22, 1, 1)).toBe(false);
    const ws = line(s, 6, 22, 3, 1, 0);
    ws[1].destroyed = true;
    expect(links(partsOf(s, [ws[0], ws[2]]))).toEqual([]);
  });

  it('each connector is drawn by only one of the two walls', () => {
    const s = makeStateWithTownHall();
    const [a, b] = line(s, 2, 22, 2, 1, 0);
    const t = wallTiles(s.buildings);
    expect(links(wallParts(t, a))).toEqual(['x:3,22.5']);
    expect(links(wallParts(t, b))).toEqual([]);
  });
});

describe('wall size grows like buildings', () => {
  it('starts small and grows only on levels that keep the same picture', () => {
    expect(wallPillarWidth(1)).toBe(PILLAR_WIDTH.min);
    expect(wallPillarWidth(10)).toBeCloseTo(PILLAR_WIDTH.max);
    for (let l = 2; l <= 10; l++) {
      if (l % 2 === 0) expect(wallPillarWidth(l)).toBeGreaterThan(wallPillarWidth(l - 1)); // same picture: grows
      else expect(wallPillarWidth(l)).toBe(wallPillarWidth(l - 1));                         // new picture: same size
    }
  });

  it('every level stays gap-free: connecting pillars always stand closer than a pillar is wide', () => {
    const step = Math.hypot(MAP.tileWidth / 2, MAP.tileHeight / 2);
    for (let level = 1; level <= 10; level++) {
      const key = `bld_wall_lv${Math.ceil(level / 2)}`;
      const m = WALL_ART_META[key];
      const visW = MAP.tileWidth * wallPillarWidth(level) * ((m.visX1 - m.visX0) / m.width);
      const spacing = step / (wallLinksFor(key, level) + 1);
      expect(spacing).toBeLessThanOrEqual(0.65 * visW + 1e-9);
    }
    expect(wallLinksFor('bld_wall_lv1', 1)).toBeGreaterThan(wallLinksFor('bld_wall_lv5', 10)); // thin posts need more
  });

  it('several connectors per link are spread evenly and layered between the two walls', () => {
    const s = makeStateWithTownHall();
    const [a] = line(s, 2, 22, 2, 1, 0);
    const links = wallParts(wallTiles(s.buildings), a, 2).filter((p) => p.kind === 'link');
    expect(links.map((p) => p.x)).toEqual([2.5 + 1 / 3, 2.5 + 2 / 3]);
    expect(links.every((p) => p.depth > 2 + 22 + 2 && p.depth < 2 + 22 + 3)).toBe(true);
  });
});
