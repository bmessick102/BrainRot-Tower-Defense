// Grid <-> screen conversion and distances. Positions in logic are tile units (floats).
// Grid -> image pixels: sx = originX + (x - y) * tileWidth/2, sy = originY + (x + y) * tileHeight/2.
import { MAP } from '../mapTiles.js';

const HALF_W = MAP.tileWidth / 2;
const HALF_H = MAP.tileHeight / 2;

/** Grid position (tile units) -> world pixel position on the map image. */
export function gridToScreen(x, y) {
  return { x: MAP.originX + (x - y) * HALF_W, y: MAP.originY + (x + y) * HALF_H };
}

/** World pixel position -> grid position (floats). */
export function screenToGrid(sx, sy) {
  const a = (sx - MAP.originX) / HALF_W;
  const b = (sy - MAP.originY) / HALF_H;
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** World pixel position -> the tile (col, row) under it. */
export function screenToTile(sx, sy) {
  const g = screenToGrid(sx, sy);
  return { col: Math.floor(g.x), row: Math.floor(g.y) };
}

/** Center of a tile in grid space. */
export function tileCenter(col, row) {
  return { x: col + 0.5, y: row + 0.5 };
}

/** Euclidean distance in grid space (tiles). */
export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * A circle of radius r tiles in grid space is an axis-aligned ellipse on screen.
 * Semi-axes: rx = r * tileWidth / sqrt(2), ry = r * tileHeight / sqrt(2)  (45.25 and 22.63 px per tile).
 */
export function rangeEllipse(r) {
  return { rx: (r * MAP.tileWidth) / Math.SQRT2, ry: (r * MAP.tileHeight) / Math.SQRT2 };
}
