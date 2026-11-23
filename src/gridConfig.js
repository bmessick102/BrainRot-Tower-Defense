// THE grid numbers: every measurement the 52 x 52 isometric base-building grid depends on lives in this one file
// (corners, grid size, world scale, building footprints, path entrances, per-map tile tints). Other files import
// from here (mapTiles.js builds MAP from it; logic/iso.js turns it into the grid <-> world transform).
//
// ---------------------------------------------------------------------------------------------------------------
// How the grid fits the art
// ---------------------------------------------------------------------------------------------------------------
// The four village maps (day, dawn, dusk, night; v0.9.2: the user's new forest-and-mountains paintings, 6680 x 3768 px)
// share one geometry, so one grid fits all of them. Their grass is a rounded oval with a wooden bridge at each of its
// four points. A 40 x 40 diamond's corners meet those four bridges (the user's pick; 4550 x 2505 px, a 1.82 : 1 shape,
// tiles a little taller than 2 : 1), and the grid carries on GRID_EXTEND tiles past it on every side, so the whole
// tiles that fit on the oval's rounded sides are grid tiles too. Only the tiles lying wholly on the painted grass are
// playable (src/mapGrass.js): the grid's own corners lie over the scenery. The grid is mapped onto its four corners with
// a bilinear transform: tile (0,0) is the top corner, (51,0) the right corner tile, (0,51) the left and (51,51) the
// bottom, every grid line straight. The corners here are symmetric, so it's an even isometric grid. (See logic/iso.js.)

/** Size of the source paintings (and so of the coordinates below), in image pixels. */
export const SOURCE_IMAGE = { width: 6680, height: 3768 };

/** Tiles along each side of the grid: the measured 40 x 40 diamond between the bridges and GRID_EXTEND more on every side
 * (v0.9.2), so the whole tiles that fit on the grass oval's rounded sides are on the grid too (src/mapGrass.js says which
 * tiles are playable). */
export const BRIDGE_DIAMOND_SIZE = 40;
export const GRID_EXTEND = 6;
export const GRID_SIZE = BRIDGE_DIAMOND_SIZE + 2 * GRID_EXTEND;

/**
 * The four corners of the playable grass diamond, in SOURCE IMAGE PIXELS (6680 x 3768): where the grass meets each wooden
 * bridge (read on the day painting at full size; the bridges sit symmetrically round the field's middle, x 3327 / y 1837).
 */
export const BRIDGE_CORNERS = {
  top: { x: 3327, y: 585 },
  right: { x: 5615, y: 1837 },
  bottom: { x: 3327, y: 3090 },
  left: { x: 1065, y: 1837 }
};

/** The 52 x 52 grid's corners: the bridge diamond carried GRID_EXTEND tiles further out on every side (same tiles). */
const extend = (C, n, k) => {
  const at = (u, v) => ({ // bilinear, in tiles of the n x n diamond
    x: C.top.x + (C.right.x - C.top.x) * u / n + (C.left.x - C.top.x) * v / n + (C.bottom.x - C.right.x - C.left.x + C.top.x) * u * v / (n * n),
    y: C.top.y + (C.right.y - C.top.y) * u / n + (C.left.y - C.top.y) * v / n + (C.bottom.y - C.right.y - C.left.y + C.top.y) * u * v / (n * n)
  });
  return { top: at(-k, -k), right: at(n + k, -k), bottom: at(n + k, n + k), left: at(-k, n + k) };
};
export const GRID_CORNERS = extend(BRIDGE_CORNERS, BRIDGE_DIAMOND_SIZE, GRID_EXTEND);

/**
 * Tile size in source image pixels, derived from the corners (the same for the bridge diamond and the extended grid):
 *   width  = (right.x - left.x) / GRID_SIZE      height = (bottom.y - top.y) / GRID_SIZE
 * (113.75 x 62.6, a ratio of 1.82 : 1).
 */
export const TILE_SOURCE = {
  width: (GRID_CORNERS.right.x - GRID_CORNERS.left.x) / GRID_SIZE,
  height: (GRID_CORNERS.bottom.y - GRID_CORNERS.top.y) / GRID_SIZE
};

/**
 * World pixels per source image pixel. The map picture, the grid and the camera all share one world space: the
 * picture is drawn at SOURCE_IMAGE x WORLD_SCALE world pixels from (0, 0). 64 / 113.75 makes the nominal tile 64 px wide
 * (64 x 35.2), the width every building / wall / enemy sprite in the game was drawn for.
 */
export const WORLD_SCALE = 64 / 113.75;

/** The map picture in world pixels. */
export const WORLD_SIZE = { width: SOURCE_IMAGE.width * WORLD_SCALE, height: SOURCE_IMAGE.height * WORLD_SCALE };

/** The nominal tile in world pixels (64 x 35.2). */
export const TILE_WORLD = { width: TILE_SOURCE.width * WORLD_SCALE, height: TILE_SOURCE.height * WORLD_SCALE };

/** The corners in world pixels (what logic/iso.js fits the grid to). */
export const WORLD_CORNERS = {
  top: { x: GRID_CORNERS.top.x * WORLD_SCALE, y: GRID_CORNERS.top.y * WORLD_SCALE },
  right: { x: GRID_CORNERS.right.x * WORLD_SCALE, y: GRID_CORNERS.right.y * WORLD_SCALE },
  bottom: { x: GRID_CORNERS.bottom.x * WORLD_SCALE, y: GRID_CORNERS.bottom.y * WORLD_SCALE },
  left: { x: GRID_CORNERS.left.x * WORLD_SCALE, y: GRID_CORNERS.left.y * WORLD_SCALE }
};

/** Width the game ships each map picture at (the height follows the source's shape); drawn stretched to WORLD_SIZE. */
export const MAP_TEXTURE_WIDTH = 2672;

// ---------------------------------------------------------------------------------------------------------------
// Town hall, paths, spawn points (grid coordinates: x = column, y = row, floats; (0,0) is the top corner)
// ---------------------------------------------------------------------------------------------------------------
/** Top-left tile of the 3 x 3 Village Hall (centered on the grid; v0.9.2: 52 x 52, was (19, 19) on 40 x 40). */
export const TOWN_HALL_ANCHOR = [25, 25];

/**
 * The eight ways enemies come in (v0.9.2 map), clockwise from the top:
 *   top          over the wooden bridge at the field's top point
 *   cave         out of the cave in the mountains (top right), down its fenced path
 *   right        over the wooden bridge at the right point
 *   stairsRight  up the stairs of the mountain path (bottom right)
 *   bottom       over the wooden bridge at the bottom point
 *   stoneBridge  over the stone arch bridge (bottom left)
 *   left         over the wooden bridge at the left point
 *   stairsLeft   down the forest stairs (top left)
 * `entrance`: the middle of the first playable tile the path reaches (v0.9.2: tiles touching a bridge aren't playable). `edge`: where its enemies appear, in the spawn fog: the picture's
 * edge behind the wooden bridges, the cave's mouth, the far end of the stone bridge, the stairs (12-16 tiles of walking,
 * like the old maps). `via`: the bends in between, from the edge toward the grid, so ground troops follow the paths and
 * cross the bridges before they pathfind. Read by eye on the day painting (1600 px preview, converted with
 * logic/iso.js screenToGrid).
 */
export const PATHS = {
  top: { entrance: [7.5, 7.5], edge: [-1.3, -2.1], via: [[1.7, 1.6], [4.1, 4.1], [6.6, 6.6]] },
  cave: { entrance: [28.5, 2.5], edge: [26.6, -9.5], via: [[27.4, -5.8], [28.2, -1.6], [28.5, 1.6]] },
  right: { entrance: [44.5, 7.5], edge: [54, -1.7], via: [[50.6, 1.4], [47.5, 4.5], [45.4, 6.6]] },
  stairsRight: { entrance: [48.5, 29.5], edge: [59.3, 31.4], via: [[56.3, 29.3], [53.4, 29], [51.2, 29]] },
  bottom: { entrance: [44.5, 44.5], edge: [56.1, 55.3], via: [[52.1, 51.8], [47.9, 47.8], [45.4, 45.4]] },
  stoneBridge: { entrance: [28.5, 47.5], edge: [25.8, 58.7], via: [[27.2, 53.5], [28.6, 49]] },
  left: { entrance: [7.5, 44.5], edge: [-1.8, 54.1], via: [[1, 51], [4.3, 47.7], [6.6, 45.4]] },
  stairsLeft: { entrance: [1.5, 29.5], edge: [-8.3, 27], via: [[-3.8, 28.4], [-0.4, 29]] }
};

// ---------------------------------------------------------------------------------------------------------------
// Footprints, in tiles (width = height): the Village Hall's and the usual building's. A type can set its own in
// config.js (`size`: the F.L.O.C.K Tower and the Mousetrap are 1); walls are single tiles (config.js
// walls.segmentLength joins them into fences). Sprites are scaled so a building fills its footprint (BuildingView).
// ---------------------------------------------------------------------------------------------------------------
export const FOOTPRINTS = {
  default: 2,
  townHall: 3
};

// ---------------------------------------------------------------------------------------------------------------
// Tile colours for the debug grid overlay (press G) and the gridded map exports. Each map gets the shading of its
// OWN grass: `light` / `dark` are the mean colours of the painting's light and dark checker squares, sampled from
// the real picture (centre of the grass, 40 x 40 sample points). The overlay washes the tiles in a checker of those
// two shades and draws the lines in a paler version of the same colour, so on every map (day lime, dawn gold-green,
// dusk olive-orange, night teal) the grid looks like it belongs to that painting.
// ---------------------------------------------------------------------------------------------------------------
export const GRID_DEBUG_KEY = 'G';

const mixRgb = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const tint = (light, dark) => ({ light, dark, line: mixRgb(light, 0xffffff, 0.6), edge: mixRgb(light, 0xffffff, 0.88), tileAlpha: 0.42, lineAlpha: 0.75 });

export const GRID_TINTS = {
  // v0.9.2 maps: each map's light / dark tile colour, sampled from the tiled pictures (the middle of the field)
  day: tint(0x6ba801, 0x578901),
  dawn: tint(0x9dbb1a, 0x809915),
  dusk: tint(0x6a8d01, 0x577301),
  night: tint(0x1e744a, 0x195f3c)
};

/** The grid before v0.9.0's 40 x 40 rework: 32 x 31 tiles with the hall at (17, 15). Old saves are shifted from this. */
export const LEGACY_GRID = { townHallAnchor: [17, 15] };

/** v0.9.0-0.9.1 saves (`grid: 40`, the 40 x 40 grid with the hall at (19, 19)): every building moves GRID_EXTEND tiles. */
export const GRID_40 = { size: 40, shift: GRID_EXTEND };
