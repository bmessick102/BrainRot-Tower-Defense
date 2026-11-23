import { describe, it, expect } from 'vitest';
import { gridToScreen, screenToGrid, screenToTile, tileCenter, distance, rangeEllipse } from '../src/logic/iso.js';
import { MAP } from '../src/mapTiles.js';
import { isGrass } from '../src/logic/grid.js';
import { GRID_SIZE, WORLD_CORNERS, TILE_WORLD, TILE_SOURCE, GRID_CORNERS } from '../src/gridConfig.js';

describe('iso.js', () => {
  it('maps tile (0, 0) top corner to the map origin', () => {
    expect(gridToScreen(0, 0)).toEqual({ x: MAP.originX, y: MAP.originY });
  });

  it.each([[0, 0], [17, 15], [5, 5], [10, 20], [25, 12], [31, 18], [8, 28]])(
    'round trips tile (%i, %i) through screen space',
    (col, row) => {
      const c = tileCenter(col, row);
      const s = gridToScreen(c.x, c.y);
      expect(screenToTile(s.x, s.y)).toEqual({ col, row });
      const g = screenToGrid(s.x, s.y);
      expect(g.x).toBeCloseTo(c.x, 9);
      expect(g.y).toBeCloseTo(c.y, 9);
    }
  );

  it('round trips every grass tile', () => {
    for (let row = 0; row < MAP.rows; row++) {
      for (let col = 0; col < MAP.cols; col++) {
        if (!isGrass(col, row)) continue;
        const c = tileCenter(col, row);
        const s = gridToScreen(c.x, c.y);
        expect(screenToTile(s.x, s.y)).toEqual({ col, row });
      }
    }
  });

  it('measures Euclidean distance in tiles', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('puts the four grid corners exactly on the four corners of the grass diamond', () => {
    const N = GRID_SIZE;
    const near = (p, q) => { expect(p.x).toBeCloseTo(q.x, 6); expect(p.y).toBeCloseTo(q.y, 6); };
    near(gridToScreen(0, 0), WORLD_CORNERS.top);
    near(gridToScreen(N, 0), WORLD_CORNERS.right);
    near(gridToScreen(N, N), WORLD_CORNERS.bottom);
    near(gridToScreen(0, N), WORLD_CORNERS.left);
  });

  it('is the same grid for every map image: corners are measured once, in source pixels', () => {
    expect(MAP.cols).toBe(52);
    expect(MAP.rows).toBe(52);
    const ratio = TILE_SOURCE.width / TILE_SOURCE.height;
    expect(ratio).toBeGreaterThan(1.75);
    expect(ratio).toBeLessThan(2.1); // near 2:1 (v0.9.2: 1.82, set by the four bridges)
    expect(TILE_SOURCE.width).toBeCloseTo((GRID_CORNERS.right.x - GRID_CORNERS.left.x) / GRID_SIZE, 9);
    expect(TILE_SOURCE.height).toBeCloseTo((GRID_CORNERS.bottom.y - GRID_CORNERS.top.y) / GRID_SIZE, 9);
  });

  it('round trips arbitrary points (not just tile centres) both ways', () => {
    for (const [x, y] of [[0.3, 0.1], [39.9, 0.2], [20.5, 20.5], [0.1, 39.8], [39.7, 39.7], [12.25, 33.75]]) {
      const s = gridToScreen(x, y);
      const g = screenToGrid(s.x, s.y);
      expect(g.x).toBeCloseTo(x, 8);
      expect(g.y).toBeCloseTo(y, 8);
    }
  });

  it('turns a range circle into an ellipse one nominal tile wide and tall per tile of range', () => {
    const e = rangeEllipse(1);
    expect(e.rx).toBeCloseTo(TILE_WORLD.width / Math.SQRT2, 6);
    expect(e.ry).toBeCloseTo(TILE_WORLD.height / Math.SQRT2, 6);
    // Given a spot on the grid it follows the local tile size (the same everywhere on a symmetric diamond, v0.9.2).
    const near = rangeEllipse(1, 20, 5), far = rangeEllipse(1, 20, 35);
    expect(near.rx).toBeGreaterThan(0);
    expect(near.ry).toBeCloseTo(e.ry, 1);
    expect(far.ry).toBeCloseTo(e.ry, 1);
  });
});
