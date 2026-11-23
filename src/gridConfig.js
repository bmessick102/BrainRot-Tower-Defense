// THE grid numbers: every measurement the 40 x 40 isometric base-building grid depends on lives in this one file
// (corners, grid size, world scale, building footprints, path entrances, per-map tile tints). Other files import
// from here (mapTiles.js builds MAP from it; logic/iso.js turns it into the grid <-> world transform).
//
// ---------------------------------------------------------------------------------------------------------------
// How the grid fits the art
// ---------------------------------------------------------------------------------------------------------------
// The four village maps (day, dawn, dusk, night) are the same painting at 6688 x 3764 px with the same geometry:
// one grid fits all of them (checked: the four pictures line up within ~2 px at full size).
//
// The playable grass "diamond" is not a symmetric rhombus: the painted quadrilateral is skewed (the top corner sits
// 121 px right of the bottom corner, the left / right corners sit ~140 px above the middle of top and bottom, and the
// top edges are shallower than the bottom ones). A uniform isometric grid could not meet all four corners, so the
// 40 x 40 grid is mapped onto the four measured corners with a bilinear transform: tile (0,0) is the top corner,
// (39,0) the right corner tile, (0,39) the left corner tile and (39,39) the bottom tile, every grid line is a straight
// line, and the lines meet the painted edges and corners exactly. Bilinear (rather than perspective) because the
// painted checker pattern has the same period everywhere (measured at five places), i.e. the art has no perspective
// foreshortening: bilinear spaces the tiles evenly along each painted edge and keeps tile width within +-3%.
// (See logic/iso.js.)

/** Size of the source paintings (and so of the coordinates below), in image pixels. */
export const SOURCE_IMAGE = { width: 6688, height: 3764 };

/** Tiles along each side of the grid. */
export const GRID_SIZE = 40;

/**
 * The four corners of the playable grass diamond, in SOURCE IMAGE PIXELS (6688 x 3764).
 * Measured from the real day painting, not guessed: the lime grass was separated from the foliage by colour
 * (HSV), each of the four edges was fitted with a robust line (RANSAC, outliers = bushes / stones covering the
 * border) and neighbouring edges were intersected. Where a bush covers the true corner, the corner is the
 * intersection of the two fitted edge lines. Checked on all four maps with the debug grid (press G in the game).
 */
export const GRID_CORNERS = {
  top: { x: 3397, y: 624 },
  right: { x: 5687, y: 1706 },
  bottom: { x: 3276, y: 2984 },
  left: { x: 861, y: 1626 }
};

/**
 * Tile size in source image pixels, derived from the corners:
 *   width  = (right.x - left.x) / GRID_SIZE      height = (bottom.y - top.y) / GRID_SIZE
 * (120.65 x 59.0, a ratio of 2.045 : 1). This is the nominal (average) tile; with the four-corner fit the real tile is
 * within +-3% of that wide everywhere and 52 to 66 px tall (flatter at the top, as the painted diamond is).
 */
export const TILE_SOURCE = {
  width: (GRID_CORNERS.right.x - GRID_CORNERS.left.x) / GRID_SIZE,
  height: (GRID_CORNERS.bottom.y - GRID_CORNERS.top.y) / GRID_SIZE
};

/**
 * World pixels per source image pixel. The map picture, the grid and the camera all share one world space: the
 * picture is drawn at SOURCE_IMAGE x WORLD_SCALE world pixels from (0, 0). 0.5305 makes the nominal tile 64 px wide
 * (64 x 31.3), the size every building / wall / enemy sprite in the game was drawn for.
 */
export const WORLD_SCALE = 0.5305;

/** The map picture in world pixels. */
export const WORLD_SIZE = { width: SOURCE_IMAGE.width * WORLD_SCALE, height: SOURCE_IMAGE.height * WORLD_SCALE };

/** The nominal tile in world pixels (64 x 31.3). */
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
/** Top-left tile of the 3 x 3 Village Hall (centered on the grid). */
export const TOWN_HALL_ANCHOR = [19, 19];

/**
 * The seven ways enemies come in (never the lake on the bottom-right edge; the left waterfall corner was dropped in
 * v0.9.1, the pillar path beside it already brings enemies in there), clockwise from the top:
 *   top         the dirt path into the top corner
 *   topRight    the winding path past the gate on the top-right edge
 *   right       the right corner, across the waterfall's stream (no path: out of the forest)
 *   bottom      the dirt path into the bottom corner
 *   bottomLeft  over the bridge on the bottom-left edge
 *   upperLeft   the path by the stone pillar near the left corner (top-left edge)
 *   topLeft     the path between the rocks halfway along the top-left edge
 * `entrance`: where it meets the grass (0.6 tile onto it). `edge`: where its enemies appear, in the spawn fog, about
 * 13 tiles of walking back along the painted dirt (the old map's paths were 10-14; the dirt runs on into the trees
 * further out, but from the picture's edge some would be ~38 tiles). `via`: the bends in between, from the edge
 * toward the grass, so ground troops follow the dirt (and cross the bridge) before they pathfind. All measured by
 * eye on the day painting (1600 px preview, converted with logic/iso.js screenToGrid).
 */
export const PATHS = {
  top: { entrance: [0.6, 0.6], edge: [-9.3, -7.9], via: [[-5.3, -4.3]] },
  topRight: { entrance: [28.3, 0.6], edge: [27.5, -12.1], via: [[26.9, -9.3], [26.9, -5.1], [28.3, -1.5]] },
  right: { entrance: [39.4, 0.6], edge: [47.9, -8.1], via: [[44.1, -3.8], [41.7, -1.2]] },
  bottom: { entrance: [39.4, 39.4], edge: [48.9, 48.3], via: [[45.1, 44.5]] },
  bottomLeft: { entrance: [21.2, 39.4], edge: [21.6, 52.4], via: [[21.7, 49.7], [21.5, 45.2], [21.2, 40.7]] },
  upperLeft: { entrance: [0.6, 34.2], edge: [-11.8, 30.4], via: [[-8.2, 31.7], [-4.2, 32.6]] },
  topLeft: { entrance: [0.6, 15], edge: [-11, 9.5], via: [[-9.3, 10.8], [-7.1, 12], [-4.7, 12.6], [0.1, 15]] }
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
  day: tint(0xa4cb02, 0x779f01),
  dawn: tint(0xb9c40e, 0x7d9b10),
  dusk: tint(0x9ea702, 0x6b7e03),
  night: tint(0x378656, 0x134b3a)
};

/** The grid before the 40 x 40 rework: 32 x 31 tiles with the hall at (17, 15). Old saves are shifted from this. */
export const LEGACY_GRID = { townHallAnchor: [17, 15] };
