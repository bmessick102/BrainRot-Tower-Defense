// The village map as the game sees it. Every number comes from src/gridConfig.js (corners measured on the art,
// grid size, world scale, path entrances): this file only assembles them into the MAP object the rest of the game
// reads. MAP.tiles is the playable grass (src/mapGrass.js): the 52 x 52 grid's tiles that lie wholly on the painted grass.
//
// Grid -> world is a perspective fit of the 52 x 52 grid onto its four corners (logic/iso.js).
// The map picture is drawn from (0, 0) at imageWidth x imageHeight world pixels.
import {
  GRID_SIZE, WORLD_SIZE, WORLD_CORNERS, TILE_WORLD, TOWN_HALL_ANCHOR, PATHS
} from './gridConfig.js';
import { GRASS_TILES } from './mapGrass.js';

const pick = (key) => Object.fromEntries(Object.entries(PATHS).map(([name, p]) => [name, p[key]]));

export const MAP = {
  image: 'game_map_grid.webp',
  imageWidth: WORLD_SIZE.width,
  imageHeight: WORLD_SIZE.height,
  // The top corner of the diamond (grid (0, 0)) in world pixels.
  originX: WORLD_CORNERS.top.x,
  originY: WORLD_CORNERS.top.y,
  // The nominal tile in world pixels (64 x 35.2): sprites are sized from its width.
  tileWidth: TILE_WORLD.width,
  tileHeight: TILE_WORLD.height,
  cols: GRID_SIZE,
  rows: GRID_SIZE,
  townHallAnchor: TOWN_HALL_ANCHOR,
  // where each dirt path meets the grass (grid coordinates, floats); enemies march to here
  spawnPoints: pick('entrance'),
  // where each path's enemies appear (outside the grass, on the path)
  edgeSpawnPoints: pick('edge'),
  // the bends between them (edge -> grass) that ground troops walk through
  spawnRoutes: pick('via'),
  // which tiles are playable grass (whole tiles on the painted grass oval; src/mapGrass.js)
  tiles: GRASS_TILES
};

export default MAP;
