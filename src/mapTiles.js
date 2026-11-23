// The village map as the game sees it. Every number comes from src/gridConfig.js (corners measured on the art,
// grid size, world scale, path entrances): this file only assembles them into the MAP object the rest of the game
// reads. The grass is the whole 40 x 40 diamond, so every tile is placeable ground.
//
// Grid -> world is a perspective fit of the 40 x 40 grid onto the four measured corners (logic/iso.js).
// The map picture is drawn from (0, 0) at imageWidth x imageHeight world pixels.
import {
  GRID_SIZE, WORLD_SIZE, WORLD_CORNERS, TILE_WORLD, TOWN_HALL_ANCHOR, PATHS
} from './gridConfig.js';

const pick = (key) => Object.fromEntries(Object.entries(PATHS).map(([name, p]) => [name, p[key]]));

export const MAP = {
  image: 'game_map_grid.webp',
  imageWidth: WORLD_SIZE.width,
  imageHeight: WORLD_SIZE.height,
  // The top corner of the diamond (grid (0, 0)) in world pixels.
  originX: WORLD_CORNERS.top.x,
  originY: WORLD_CORNERS.top.y,
  // The nominal tile in world pixels (64 x 31.3): sprites are sized from it. Real tiles vary by about +-7%.
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
  // every tile of the diamond is grass
  tiles: Array.from({ length: GRID_SIZE }, () => '1'.repeat(GRID_SIZE))
};

export default MAP;
