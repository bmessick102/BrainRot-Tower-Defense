// Wave preview markers (pure, no Phaser): where each attack corner's marker (a red disc with an arrow pointing
// along the path toward the village, plus the enemy kinds and counts) sits on the map, and how its pieces are
// laid out. GameScene draws them (src/objects/WaveMarkers.js) in world space at the back of each attacking
// path, where its enemies come onto the map, so they never cover the village: buildings only ever stand on
// grass tiles (MAP.tiles), and no marker overlaps a grass tile at any size it's drawn at
// (tests/waveMarkers.test.js).
//
// Layout: the disc is centered on the anchor, a point on the path's center line, and the enemy chips sit in
// centered rows underneath it (screen-down) on every path. Underneath stays off the grass everywhere:
// - top: underneath points in toward the village, but the strip of map above the grass is ~200 px tall and wide
//   open sideways, so one wide row (PER_ROW) keeps it short. Putting the chips above instead (outward) wouldn't add
//   room: the marker is just as tall and the map edge is right there.
// - bottom: underneath is the outward side (toward the map's bottom edge), away from the grass, so the chips
//   never get near it; the disc sits a little further up the path to leave the chips room below it.
// - left / right: underneath is beside the path, on the dirt outside the grass, in narrow columns.
import { MAP } from '../mapTiles.js';
import { gridToScreen } from './iso.js';

/** Marker pieces, in screen px: the arrow disc's size, an enemy chip's size, gaps. */
export const MARKER = { disc: 40, chipW: 62, chipH: 40, gap: 6, rowGap: 4 };
/**
 * Most chips per row under the disc: wide rows above / below the map (lots of room sideways, little up and
 * down), narrow ones beside it (the strips left / right of the grass are short of room sideways). More kinds
 * than that wrap onto more rows, balanced and each centered under the disc. The top keeps every kind on one
 * row: its strip of map is the shortest, and the HUD's top row sits over it whenever the camera is up there,
 * so a second row would leave the marker no room to slide out from under the HUD.
 */
export const PER_ROW = { top: 12, bottom: 6, left: 3, right: 3 };
/** World px kept between a marker and the nearest grass tile. */
export const GRASS_MARGIN = 10;

const HALF_W = MAP.tileWidth / 2, HALF_H = MAP.tileHeight / 2;
let grassCache = null;
/** Bounding box (world px) of every grass tile, where buildings can stand. */
export function grassBoxes() {
  if (!grassCache) {
    grassCache = [];
    MAP.tiles.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== '1') continue;
        const top = gridToScreen(c, r); // the tile's top corner
        grassCache.push({ x: top.x - HALF_W, y: top.y, w: MAP.tileWidth, h: MAP.tileHeight });
      }
    });
  }
  return grassCache;
}

const overlaps = (a, b, pad) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

/** Does world rect r come within `margin` of any grass tile? */
export function touchesGrass(r, margin = GRASS_MARGIN) {
  return grassBoxes().some((g) => overlaps(r, g, margin));
}

/** World points (px) where path meets the grass (its entrance) and where it runs off the map. */
export function pathEnds(path) {
  const s = MAP.spawnPoints[path], e = MAP.edgeSpawnPoints[path];
  if (!s) return null;
  const a = gridToScreen(s[0], s[1]), b = e ? gridToScreen(e[0], e[1]) : a;
  return { entrance: a, edge: b };
}

/** Screen angle (radians) of the arrow from `from` toward `to` (both in the same pixel space). */
export function arrowAngle(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

/**
 * Pieces of one marker relative to its anchor, in screen px at scale 1: the arrow disc's center (the anchor
 * itself, 0, 0), each enemy chip's top-left, and the whole marker's rect. The chips sit in rows under the disc,
 * the rows as even as they can be (7 kinds in rows of 6 at most: 4 + 3) and each centered under it.
 */
export function markerLayout(path, kinds) {
  const M = MARKER, per = PER_ROW[path] || 4;
  const n = Math.max(0, kinds);
  const rows = Math.ceil(n / per);
  const base = rows ? Math.floor(n / rows) : 0, extra = rows ? n % rows : 0; // the first `extra` rows get one more
  const rowW = (k) => (k ? k * M.chipW + (k - 1) * M.gap : 0);
  const chipsW = rowW(rows ? base + (extra ? 1 : 0) : 0);
  const chipsH = rows ? rows * M.chipH + (rows - 1) * M.rowGap : 0;
  const w = Math.max(M.disc, chipsW), h = M.disc + (rows ? M.gap + chipsH : 0);
  const disc = { x: 0, y: 0 };
  const chips = [];
  let y = M.disc / 2 + M.gap;
  for (let r = 0; r < rows; r++) {
    const k = base + (r < extra ? 1 : 0);
    const x0 = -rowW(k) / 2;
    for (let c = 0; c < k; c++) chips.push({ x: x0 + c * (M.chipW + M.gap), y });
    y += M.chipH + M.rowGap;
  }
  return { disc, chips, rect: { x: -w / 2, y: -M.disc / 2, w, h } };
}

/** The marker's world rect with its anchor at (ax, ay), drawn at `scale`. */
export function markerRect(layout, ax, ay, scale) {
  const r = layout.rect;
  return { x: ax + r.x * scale, y: ay + r.y * scale, w: r.w * scale, h: r.h * scale };
}

/** World px a marker keeps inside the map image's edge. */
export const EDGE_MARGIN = 8;

/**
 * Where path's marker goes at `scale` (world px per screen px, 1 / camera zoom for a constant screen size): its
 * disc on the path's center line at the back of the path, where its enemies come onto the map
 * (MAP.edgeSpawnPoints), moved in along the path just far enough for the whole marker to be on the map, and
 * never onto the grass. If it doesn't fit at that size it's drawn
 * smaller. Returns { x, y, scale } (the anchor, world px), or null for an unknown path.
 */
export function markerPlacement(path, layout, scale, step = 4) {
  const range = markerRange(path, layout, scale, step);
  return range ? { ...anchorAt(range, range.dMin), scale: range.scale } : null;
}

/**
 * The stretch of path the marker may sit on at `scale`: distances d (world px, from the map's edge inward)
 * from dMin (the back: the first spot wholly on the map) to dMax (the last spot still clear of the grass).
 * Shrinks the scale when there's no such spot. Returns { scale, dMin, dMax, edge, ux, uy }, or null.
 */
export function markerRange(path, layout, scale, step = 4) {
  const ends = pathEnds(path);
  if (!ends) return null;
  const { entrance: a, edge: b } = ends;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (a.x - b.x) / len, uy = (a.y - b.y) / len; // from the map's edge in toward the village
  const m = EDGE_MARGIN;
  const onMap = (r) => r.x >= m && r.y >= m && r.x + r.w <= MAP.imageWidth - m && r.y + r.h <= MAP.imageHeight - m;
  for (let s = scale; s >= 0.2; s *= 0.85) {
    let dMin = null, dMax = null;
    for (let d = 0; d <= len; d += step) {
      const r = markerRect(layout, b.x + ux * d, b.y + uy * d, s);
      if (touchesGrass(r)) break; // further in only gets closer to the village
      if (!onMap(r)) { if (dMin !== null) break; continue; }
      if (dMin === null) dMin = d;
      dMax = d;
    }
    if (dMin !== null) return { scale: s, dMin, dMax, edge: b, ux, uy };
  }
  return { scale: 0.2, dMin: 0, dMax: 0, edge: b, ux, uy };
}

/** The anchor (world px) d px in from the back of the path. */
export function anchorAt(range, d) {
  return { x: range.edge.x + range.ux * d, y: range.edge.y + range.uy * d };
}

/**
 * Where on its stretch of path (markerRange) to draw the marker so the HUD doesn't hide it: the spot nearest
 * the back whose screen rect (`toScreen(worldRect)`) overlaps none of `obstacles` (screen rects); the back
 * itself when every spot is covered. Returns the distance d.
 */
export function pickAlongPath(range, layout, toScreen, obstacles, step = 4) {
  const list = obstacles.filter(Boolean);
  for (let d = range.dMin; d <= range.dMax; d += step) {
    const p = anchorAt(range, d);
    const r = toScreen(markerRect(layout, p.x, p.y, range.scale));
    if (!list.some((o) => overlaps(r, o, 0))) return d;
  }
  return range.dMin;
}

/** Screen angle of the path from the map's edge toward the village (the way its enemies walk). */
export function pathAngle(path) {
  const ends = pathEnds(path);
  return ends ? arrowAngle(ends.edge, ends.entrance) : 0;
}
