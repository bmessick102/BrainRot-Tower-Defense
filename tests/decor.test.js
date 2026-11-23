// Grass tufts (v0.9.1): where they grow comes from the village's decorSeed, inside the field, the same every time; the
// tiles buildings and walls cover hide them; the seed is saved with the village.
import { describe, it, expect } from 'vitest';
import { grassSpots, coveredTiles, validDecorSeed, newDecorSeed, DECOR } from '../src/logic/decor.js';
import { serializeGame, parseSave, deserializeGame } from '../src/logic/save.js';
import { GRID_SIZE } from '../src/gridConfig.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

describe('grass tufts', () => {
  it('the same seed grows the same tufts; another seed, others', () => {
    const a = grassSpots(4242), b = grassSpots(4242), c = grassSpots(99);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a).toHaveLength(DECOR.tufts);
  });

  it('every tuft is on its own tile inside the field, off its outermost ring', () => {
    const spots = grassSpots(newDecorSeed());
    const keys = new Set(spots.map((s) => s.col * 100 + s.row));
    expect(keys.size).toBe(spots.length);
    for (const s of spots) {
      expect(s.col).toBeGreaterThanOrEqual(DECOR.edge);
      expect(s.row).toBeGreaterThanOrEqual(DECOR.edge);
      expect(s.col).toBeLessThan(GRID_SIZE - DECOR.edge);
      expect(s.row).toBeLessThan(GRID_SIZE - DECOR.edge);
      expect(s.scale).toBeGreaterThanOrEqual(DECOR.scale[0]);
      expect(s.scale).toBeLessThanOrEqual(DECOR.scale[1]);
    }
  });

  it('a building or wall covers every tile of its footprint (those tufts hide)', () => {
    const s = makeStateWithTownHall({}, 3); // hall 3 x 3 at (19, 19)
    const wall = addBuilding(s, 'wall', 5, 5, 1);
    const covered = coveredTiles(s.buildings);
    for (let c = 19; c < 22; c++) for (let r = 19; r < 22; r++) expect(covered.has(c * 100 + r)).toBe(true);
    expect(covered.has(wall.col * 100 + wall.row)).toBe(true);
    expect(covered.has(18 * 100 + 19)).toBe(false);
  });

  it('the seed is saved with the village; a bad one is refused, a missing one is fine (older saves)', () => {
    const s = makeStateWithTownHall({}, 3);
    s.decorSeed = 777;
    const saved = serializeGame(s);
    expect(saved.decorSeed).toBe(777);
    expect(deserializeGame(parseSave(JSON.stringify(saved)).data).decorSeed).toBe(777);
    expect(parseSave(JSON.stringify({ ...saved, decorSeed: -3 })).status).toBe('invalid');
    expect(parseSave(JSON.stringify({ ...saved, decorSeed: 'x' })).status).toBe('invalid');
    const old = { ...saved }; delete old.decorSeed;
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.status).toBe('ok');
    expect(deserializeGame(parsed.data).decorSeed).toBeNull();
    expect(validDecorSeed(newDecorSeed())).toBe(true);
  });
});
