import { describe, it, expect } from 'vitest';
import { countGrassTiles, canPlaceAt, canPlaceRect, isGrass, distanceToFootprint, isFootprintOnGrass } from '../src/logic/grid.js';
import { MAP } from '../src/mapTiles.js';
import { CONFIG } from '../src/config.js';

describe('grid.js', () => {
  it('loads MAP.tiles as the 52 x 52 grid with its playable tiles (the grass between the scenery)', () => {
    expect(MAP.tiles).toHaveLength(MAP.rows);
    MAP.tiles.forEach((row) => expect(row).toHaveLength(MAP.cols));
    expect(MAP.cols).toBe(52);
    expect(MAP.rows).toBe(52);
    expect(countGrassTiles()).toBe(1943); // whole tiles on the painted grass (src/mapGrass.js)
  });

  it('treats tiles outside the map, and its corners off the grass, as not grass', () => {
    expect(isGrass(-1, 5)).toBe(false);
    expect(isGrass(5, MAP.rows)).toBe(false);
    expect(isGrass(MAP.cols, 0)).toBe(false);
    expect(isGrass(0, 0)).toBe(false);   // the grid's corners lie over the scenery
    expect(isGrass(51, 51)).toBe(false);
    expect(isGrass(25, 25)).toBe(true);  // the middle
    expect(isGrass(49, 25)).toBe(true);  // out to the grass's right side
    expect(isGrass(3, 25)).toBe(true);   // ...and its left side
  });

  it('places the town hall at its anchor', () => {
    const [c, r] = MAP.townHallAnchor;
    expect(canPlaceAt([], c, r, 4).ok).toBe(true);
  });

  it('rejects overlapping buildings', () => {
    const th = { id: 'b1', col: 17, row: 15, size: 4 };
    expect(canPlaceAt([th], 15, 15, 3).ok).toBe(false); // covers col 17
    expect(canPlaceAt([th], 19, 17, 3).ok).toBe(false);
  });

  it('rejects any footprint that touches a tile outside the grid or off the grass', () => {
    expect(canPlaceAt([], -1, 0, 3).ok).toBe(false);
    expect(canPlaceAt([], 0, 0, 3).ok).toBe(false);   // a corner: over the scenery
    expect(canPlaceAt([], 24, 24, 3).ok).toBe(true);
    expect(canPlaceAt([], 47, 25, 3).ok).toBe(true);  // right up to the grass's right side (col 49)
    expect(canPlaceAt([], 48, 25, 3).ok).toBe(false); // would cover col 50
    expect(isFootprintOnGrass(0, 10, 3)).toBe(false);
  });

  it('lets buildings touch by default (buildingGap is ' + CONFIG.rules.buildingGap + ')', () => {
    const th = { id: 'b1', col: 17, row: 15, size: 4 };
    expect(CONFIG.rules.buildingGap).toBe(0);
    expect(canPlaceAt([th], 14, 15, 3).ok).toBe(true); // right edge at col 17
    expect(canPlaceAt([th], 21, 15, 3).ok).toBe(true);
    expect(canPlaceAt([th], 14, 12, 3).ok).toBe(true); // corner touch
  });

  it('still supports a gap rule when one is configured', () => {
    const th = { id: 'b1', col: 17, row: 15, size: 4 };
    expect(canPlaceAt([th], 14, 15, 3, null, MAP, 1)).toEqual({ ok: false, reason: 'Too close to another building' });
    expect(canPlaceAt([th], 14, 12, 3, null, MAP, 1).ok).toBe(false);
    expect(canPlaceAt([th], 13, 15, 3, null, MAP, 1).ok).toBe(true);
  });

  it('checks rectangles (walls) against grass and other buildings', () => {
    const th = { id: 'b1', col: 17, row: 15, size: 3 };
    expect(canPlaceRect([th], 14, 18, 3, 1).ok).toBe(true);   // horizontal wall below-left
    expect(canPlaceRect([th], 16, 15, 1, 3).ok).toBe(true);   // vertical wall hugging its left side
    expect(canPlaceRect([th], 17, 14, 3, 2).ok).toBe(false);  // overlaps row 15
  });

  it('ignores the building being moved', () => {
    const th = { id: 'b1', col: 17, row: 15, size: 4 };
    expect(canPlaceAt([th], 17, 16, 4, 'b1').ok).toBe(true);
  });

  it('measures distance to the nearest point of a footprint', () => {
    const b = { col: 10, row: 10, size: 3 };
    expect(distanceToFootprint(b, 11, 11)).toBe(0);
    expect(distanceToFootprint(b, 8, 11)).toBe(2);
    expect(distanceToFootprint(b, 16, 17)).toBe(5); // from corner (13, 13): 3-4-5
  });
});
