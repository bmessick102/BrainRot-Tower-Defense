// Grass-tile map, building footprints, occupancy, and placement validation.
// A footprint is a rectangle of tiles: anchor (col, row) plus width w and height h.
// Square buildings store `size` (w = h = size); walls store w and h (a 1 x N or N x 1 segment).
import { MAP } from '../mapTiles.js';
import { CONFIG } from '../config.js';
import { distance } from './iso.js';

/** Footprint width / height of any building-like object ({ w, h } or { size }). */
export const fpW = (b) => b.w ?? b.size;
export const fpH = (b) => b.h ?? b.size;

/** True when tile (col, row) is inside the map and is grass. */
export function isGrass(col, row, map = MAP) {
  if (row < 0 || row >= map.rows || col < 0 || col >= map.cols) return false;
  return map.tiles[row][col] === '1';
}

export function countGrassTiles(map = MAP) {
  let n = 0;
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) if (isGrass(c, r, map)) n++;
  return n;
}

/** Every tile under a w x h footprint anchored at (col, row). */
export function rectTiles(col, row, w, h) {
  const tiles = [];
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) tiles.push({ col: c, row: r });
  return tiles;
}

/** Every tile under a building's footprint. */
export function buildingTiles(b) {
  return rectTiles(b.col, b.row, fpW(b), fpH(b));
}

export function isRectOnGrass(col, row, w, h, map = MAP) {
  return rectTiles(col, row, w, h).every((t) => isGrass(t.col, t.row, map));
}

export function isFootprintOnGrass(col, row, size, map = MAP) {
  return isRectOnGrass(col, row, size, size, map);
}

/** Do two footprints share any tile? Touching edges do not count. */
export function footprintsOverlap(a, b) {
  return a.col < b.col + fpW(b) && b.col < a.col + fpW(a) && a.row < b.row + fpH(b) && b.row < a.row + fpH(a);
}

/** First building (other than ignoreId) overlapping the rectangle, or null. */
export function findOverlapRect(buildings, col, row, w, h, ignoreId = null) {
  const fp = { col, row, w, h };
  return buildings.find((b) => b.id !== ignoreId && footprintsOverlap(fp, b)) || null;
}

/** First building (other than ignoreId) within `gap` tiles of the rectangle, or null. */
export function findOverlapPadded(buildings, col, row, w, h, gap, ignoreId = null) {
  return findOverlapRect(buildings, col - gap, row - gap, w + 2 * gap, h + 2 * gap, ignoreId);
}

/**
 * Placement validation for a w x h rectangle: all tiles grass, nothing covering them, and at least
 * `gap` empty tiles to every other building (CONFIG.rules.buildingGap; 0 lets buildings touch).
 */
export function canPlaceRect(buildings, col, row, w, h, ignoreId = null, map = MAP, gap = CONFIG.rules.buildingGap) {
  if (!isRectOnGrass(col, row, w, h, map)) return { ok: false, reason: 'Not on grass' };
  if (findOverlapRect(buildings, col, row, w, h, ignoreId)) return { ok: false, reason: 'Space taken' };
  if (gap > 0 && findOverlapPadded(buildings, col, row, w, h, gap, ignoreId)) return { ok: false, reason: 'Too close to another building' };
  return { ok: true, reason: '' };
}

/** Placement validation for a square footprint. */
export function canPlaceAt(buildings, col, row, size, ignoreId = null, map = MAP, gap = CONFIG.rules.buildingGap) {
  return canPlaceRect(buildings, col, row, size, size, ignoreId, map, gap);
}

/** Center of a building footprint in grid space. */
export function footprintCenter(b) {
  return { x: b.col + fpW(b) / 2, y: b.row + fpH(b) / 2 };
}

/** Closest point of a building footprint rectangle to (x, y). */
export function closestPointOnFootprint(b, x, y) {
  return {
    x: Math.max(b.col, Math.min(b.col + fpW(b), x)),
    y: Math.max(b.row, Math.min(b.row + fpH(b), y))
  };
}

/** Distance from (x, y) to the nearest point of a building footprint (0 when inside). */
export function distanceToFootprint(b, x, y) {
  const p = closestPointOnFootprint(b, x, y);
  return distance(x, y, p.x, p.y);
}

/** Is (x, y) inside the footprint expanded by `pad` tiles on every side? */
export function isInsideFootprint(b, x, y, pad = 0) {
  return x >= b.col - pad && x <= b.col + fpW(b) + pad && y >= b.row - pad && y <= b.row + fpH(b) + pad;
}
