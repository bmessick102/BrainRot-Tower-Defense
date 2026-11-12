// AUTO-GENERATED from the map art. Which grid tiles are placeable grass.
// rows[r][c] === '1' means tile (col c, row r) is grass and can hold buildings and enemies.
// Grid -> world: sx = originX + (col - row) * 32, sy = originY + (col + row) * 16.
//
// The expanded map (game_map_grid.png, 1672 x 941 px, plus its _night twin) holds the original
// clearing at 67.25% scale. The game draws it at imageWidth x imageHeight world pixels (1.487x)
// so tiles stay 64 x 32. originX/originY are in those world pixels. Measured by matching the old
// 2102 x 1182 map (origin 994, 70) inside the new image: scale 0.6725, offset (129.25, 43.25).
export const MAP = {
  image: 'game_map_grid.png',
  imageWidth: 2486,
  imageHeight: 1399,
  originX: 1186,
  originY: 134,
  tileWidth: 64,
  tileHeight: 32,
  cols: 32,
  rows: 31,
  townHallAnchor: [17, 15],
  // where each dirt path meets the grass (grid coordinates, floats); enemies spawn here
  spawnPoints: { top: [3.2, 2.9], right: [27.2, 3.9], bottom: [30.0, 28.6], left: [6.8, 25.9] },
  // Where each dirt path runs off the edge of the map (same line as its entrance above, carried out to
  // ~14 px from the image edge). Enemies appear here; ground troops march down the path to the entrance.
  edgeSpawnPoints: { top: [-3.6, -3.9], right: [35.64, -4.54], bottom: [39.79, 38.39], left: [-1.96, 34.66] },
  tiles: [
    "00000011111111111111111100000000",
    "00000011111111111111111100000000",
    "00000111111111111111111100000000",
    "00001111111111111111111111000000",
    "00111111111111111111111111000000",
    "00111111111111111111111111110000",
    "00111111111111111111111111111100",
    "00111111111111111111111111111110",
    "01111111111111111111111111111110",
    "01111111111111111111111111111110",
    "01111111111111111111111111111110",
    "11111111111111111111111111111110",
    "11111111111111111111111111111110",
    "01111111111111111111111111111111",
    "01111111111111111111111111111111",
    "01111111111111111111111111111111",
    "01111111111111111111111111111111",
    "01111111111111111111111111111111",
    "11111111111111111111111111111111",
    "11111111111111111111111111111111",
    "01111111111111111111111111111111",
    "01111111111111111111111111111111",
    "01101111111111111111111111111111",
    "00000111111111111111111111111111",
    "00000001111111111111111111111111",
    "00000000111111111111111111111101",
    "00000000111111111111111111111100",
    "00000000111111111111111111111100",
    "00000000111111111111111111101000",
    "00000000000001111111111111100000",
    "00000000000000001000011000000000"
  ]
};

export default MAP;
