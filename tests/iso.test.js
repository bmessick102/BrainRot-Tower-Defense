import { describe, it, expect } from 'vitest';
import { gridToScreen, screenToGrid, screenToTile, tileCenter, distance, rangeEllipse } from '../src/logic/iso.js';
import { MAP } from '../src/mapTiles.js';
import { isGrass } from '../src/logic/grid.js';

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

  it('turns a range circle into the charter ellipse (45.25 x 22.63 px per tile)', () => {
    const e = rangeEllipse(1);
    expect(e.rx).toBeCloseTo(45.25, 2);
    expect(e.ry).toBeCloseTo(22.63, 2);
  });
});
