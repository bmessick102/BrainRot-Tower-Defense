// Ground decoration (v0.9.1, pure): grass tufts scattered over a village's field, purely visual (they never block,
// cost or count anything). Where they grow comes from the village's own `decorSeed` (saved with it), so a village shows
// the same tufts every time it opens, for its owner and for visitors. A tuft under a building or wall is hidden
// (src/objects/Ground.js): build or move something onto it and it's gone; move the building away and it grows back.
import { GRID_SIZE } from '../gridConfig.js';
import { isGrass } from './grid.js';

export const DECOR = {
  tufts: 100,      // tufts per village (1,943 playable tiles: about one tile in 20)
  edge: 1,         // none in the grid's outermost tile ring (never grass anyway)
  scale: [0.72, 1] // each tuft a little bigger or smaller
};

/** A fresh seed for a new village (or an older save that has none yet). */
export const newDecorSeed = () => Math.floor(Math.random() * 2147483647);

/** Is v a usable seed (what a save may hold)? */
export const validDecorSeed = (v) => Number.isInteger(v) && v >= 0 && v <= 2147483647;

/** A small seeded random number generator (mulberry32): the same seed gives the same tufts. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where a village's tufts grow: `DECOR.tufts` different playable grass tiles, each with a size and a facing. Same seed,
 * same tufts.
 */
export function grassSpots(seed, count = DECOR.tufts) {
  const r = rng(validDecorSeed(seed) ? seed : 12345);
  const lo = DECOR.edge, span = GRID_SIZE - 2 * DECOR.edge;
  const used = new Set(), out = [];
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const col = lo + Math.floor(r() * span), row = lo + Math.floor(r() * span);
    const k = col * 100 + row;
    if (used.has(k) || !isGrass(col, row)) continue; // (only on playable grass)
    used.add(k);
    out.push({ col, row, scale: DECOR.scale[0] + r() * (DECOR.scale[1] - DECOR.scale[0]), flip: r() < 0.5 });
  }
  return out;
}

/** Every tile a building or wall stands on, as col * 100 + row (for hiding the tufts under them). */
export function coveredTiles(buildings) {
  const out = new Set();
  for (const b of buildings || []) {
    const w = b.w || b.size || 1, h = b.h || b.size || 1;
    for (let c = b.col; c < b.col + w; c++) for (let r = b.row; r < b.row + h; r++) out.add(c * 100 + r);
  }
  return out;
}
