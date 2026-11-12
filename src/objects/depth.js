// Draw order for things standing on the ground (gnomes, enemies).
//
// Isometric sprites are layered by x + y (further down the screen = in front). Buildings use their
// front corner, so something standing right beside a big building's front face can have a smaller
// x + y than the building and get drawn behind it even though it's visually in front. This fixes that:
// anything past a building's front-right face (x >= right edge) or front-left face (y >= front edge),
// while overlapping that face on screen, is drawn in front of the building.
import { fpW, fpH } from '../logic/grid.js';

export function groundDepth(buildings, x, y) {
  let d = x + y;
  for (const b of buildings) {
    if (b.type === 'mousetrap') continue; // flat trap: anything on it draws on top anyway
    const x1 = b.col + fpW(b), y1 = b.row + fpH(b);
    const frontOfRightFace = x >= x1 && y > b.row - 0.5 && y < y1 + 0.5;
    const frontOfLeftFace = y >= y1 && x > b.col - 0.5 && x < x1 + 0.5;
    if ((frontOfRightFace || frontOfLeftFace) && d <= x1 + y1) d = x1 + y1 + 0.01;
  }
  return d;
}
