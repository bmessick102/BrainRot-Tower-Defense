// Grid <-> world conversion and distances. Positions in logic are tile units (floats): x = column, y = row,
// (0, 0) is the top corner of the 40 x 40 grid, (40, 0) the right corner, (0, 40) the left, (40, 40) the bottom.
//
// The world is the map picture's own pixel space (see gridConfig.js): the picture, the grid and the camera all
// share it. The grid is fitted to the four measured corners of the painted grass with a bilinear map, because the
// painted diamond is a skewed quadrilateral, not a symmetric rhombus. Every grid line stays straight, the tile
// corners land exactly on the painted corners, and the map is exactly invertible (a quadratic solve).
//
//   u = x / 40, v = y / 40,  P(u, v) = T + (R - T) u + (L - T) v + (B - R - L + T) u v
//   (T, R, B, L = the top / right / bottom / left corners in world pixels)
import { MAP } from '../mapTiles.js';
import { WORLD_CORNERS, GRID_SIZE } from '../gridConfig.js';

const N = GRID_SIZE;
const { top: T, right: R, bottom: B, left: L } = WORLD_CORNERS;

// P = A + Bv * u + C * v + D * u * v
const AX = T.x, AY = T.y;
const BX = R.x - T.x, BY = R.y - T.y;
const CX = L.x - T.x, CY = L.y - T.y;
const DX = B.x - R.x - L.x + T.x, DY = B.y - R.y - L.y + T.y;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const BxD = cross(BX, BY, DX, DY);
const BxC = cross(BX, BY, CX, CY);
const DET = BxC; // determinant of the affine part [B C]

/** Grid position (tile units) -> world pixel position on the map image. */
export function gridToScreen(x, y) {
  const u = x / N, v = y / N, uv = u * v;
  return { x: AX + BX * u + CX * v + DX * uv, y: AY + BY * u + CY * v + DY * uv };
}

/** World pixel position -> grid position (floats). Exact inverse of gridToScreen (also outside the grid). */
export function screenToGrid(sx, sy) {
  const qx = sx - AX, qy = sy - AY;
  // Start from the affine (parallelogram) answer, then solve the quadratic in u.
  const u0 = (qx * CY - qy * CX) / DET;
  const a2 = BxD, a1 = BxC - cross(qx, qy, DX, DY), a0 = -cross(qx, qy, CX, CY);
  let u;
  if (Math.abs(a2) < 1e-9) u = -a0 / a1;
  else {
    const r = Math.sqrt(Math.max(0, a1 * a1 - 4 * a2 * a0));
    const r1 = (-a1 + r) / (2 * a2), r2 = (-a1 - r) / (2 * a2);
    u = Math.abs(r1 - u0) <= Math.abs(r2 - u0) ? r1 : r2;
  }
  const wx = CX + DX * u, wy = CY + DY * u;
  const v = ((qx - BX * u) * wx + (qy - BY * u) * wy) / (wx * wx + wy * wy);
  return { x: u * N, y: v * N };
}

/** World pixel position -> the tile (col, row) under it. */
export function screenToTile(sx, sy) {
  const g = screenToGrid(sx, sy);
  return { col: Math.floor(g.x), row: Math.floor(g.y) };
}

/**
 * How the world moves per grid unit at (x, y): { sxx, sxy, syx, syy } = d(world.x)/dx, d(world.x)/dy,
 * d(world.y)/dx, d(world.y)/dy. (About 32, -32, 16, 15 at the middle of the map.)
 */
export function gridJacobian(x, y) {
  const u = x / N, v = y / N;
  return { sxx: (BX + DX * v) / N, sxy: (CX + DX * u) / N, syx: (BY + DY * v) / N, syy: (CY + DY * u) / N };
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
 * A circle of radius r tiles in grid space is (very nearly) an axis-aligned ellipse on screen.
 * Semi-axes: rx = r * tileWidth / sqrt(2), ry = r * tileHeight / sqrt(2) for the nominal tile (45.25 and 22.13 px per
 * tile). Pass the grid position (gx, gy) to use the tile size right there (tiles are flatter at the top of the map
 * than at the bottom).
 */
export function rangeEllipse(r, gx = null, gy = null) {
  if (gx === null || gy === null) return { rx: (r * MAP.tileWidth) / Math.SQRT2, ry: (r * MAP.tileHeight) / Math.SQRT2 };
  const j = gridJacobian(gx, gy);
  return { rx: r * Math.hypot(j.sxx, j.sxy), ry: r * Math.hypot(j.syx, j.syy) };
}
