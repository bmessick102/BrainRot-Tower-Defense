import { describe, it, expect } from 'vitest';
import { countGrassTiles, canPlaceAt, canPlaceRect, isGrass, distanceToFootprint, isFootprintOnGrass } from '../src/logic/grid.js';
import { MAP } from '../src/mapTiles.js';
import { CONFIG } from '../src/config.js';

describe('grid.js', () => {
  it('loads MAP.tiles with exactly 803 grass tiles', () => {
    expect(MAP.tiles).toHaveLength(MAP.rows);
    MAP.tiles.forEach((row) => expect(row).toHaveLength(MAP.cols));
    expect(countGrassTiles()).toBe(803);
  });

  it('treats tiles outside the map as not grass', () => {
    expect(isGrass(-1, 5)).toBe(false);
    expect(isGrass(5, MAP.rows)).toBe(false);
    expect(isGrass(0, 0)).toBe(false); // corner is forest
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

  it('rejects any footprint that touches a non-grass tile', () => {
    // Row 0 starts with six forest tiles: a footprint at col 4 covers cols 4..6, and cols 4-5 are forest.
    expect(isGrass(4, 0)).toBe(false);
    expect(canPlaceAt([], 4, 0, 3).ok).toBe(false);
    expect(canPlaceAt([], 6, 0, 3).ok).toBe(true);
    // Bottom edge: row 30 is mostly forest.
    expect(isFootprintOnGrass(14, 28, 3)).toBe(false);
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
