// The ground under and around a village (v0.9.1), shared by GameScene (your village) and VisitScene (someone else's):
//  - drawGroundPlots: a solid grass-green fill over every building's and wall's tiles, so the map's checker doesn't show
//    under them, in the grass colour of the map being shown (day, dawn, dusk or night: groundColor), with the light rim
//    round each building's plot (not walls).
//  - GrassTufts: the village's grass tufts (logic/decor.js picks the tiles from its decorSeed), drawn on the ground
//    under everything else; a tuft under a building or wall is hidden. Purely visual.
import { gridToScreen } from '../logic/iso.js';
import { fpW, fpH } from '../logic/grid.js';
import { grassSpots, coveredTiles } from '../logic/decor.js';
import { MAP } from '../mapTiles.js';
import { overlayColors } from './GridOverlay.js';
import { lerpColor } from './DayNight.js';

export const GRASS_TEX = 'deco_grass';
const PLOT_RIM = 0xf0dcae, PLOT_RIM_ALPHA = 0.28;
const TUFT_DEPTH = -8800;      // over the map and the plots, under lights, buildings, enemies and effects
const TUFT_WIDTH = 0.9;        // share of a tile's width
const TUFT_BASE = 0.7;         // share of the picture's height (from its top) where its base sits on the tile's center

/** The map's own grass colour for a clock (the middle of its two tile shades, blended like the map pictures). */
export function groundColor(clock) {
  const c = overlayColors(clock || { phase: 'day', t: 0 });
  return lerpColor(c.light, c.dark, 0.5);
}

/** Solid grass under every building's and wall's tiles (`skipId`: the one being moved), and a rim round each plot. */
export function drawGroundPlots(g, list, color, skipId = null) {
  g.clear();
  for (const b of list) {
    if (skipId && b.id === skipId) continue;
    const w = fpW(b), h = fpH(b);
    const pts = [gridToScreen(b.col, b.row), gridToScreen(b.col + w, b.row), gridToScreen(b.col + w, b.row + h), gridToScreen(b.col, b.row + h)];
    g.fillStyle(color, 1).fillPoints(pts, true);
  }
  for (const b of list) {
    if (b.type === 'wall' || (skipId && b.id === skipId)) continue;
    const w = fpW(b), h = fpH(b), inset = 0.08;
    const rim = [gridToScreen(b.col + inset, b.row + inset), gridToScreen(b.col + w - inset, b.row + inset),
      gridToScreen(b.col + w - inset, b.row + h - inset), gridToScreen(b.col + inset, b.row + h - inset)];
    g.lineStyle(2, PLOT_RIM, PLOT_RIM_ALPHA).strokePoints(rim, true);
  }
}

/** A village's grass tufts: one sprite each, hidden while a building or wall stands on its tile. */
export class GrassTufts {
  constructor(scene, seed) {
    this.scene = scene;
    this.tufts = [];
    this.tint = null;
    if (!scene.textures.exists(GRASS_TEX)) return; // (no picture: no tufts)
    for (const s of grassSpots(seed)) {
      const c = gridToScreen(s.col + 0.5, s.row + 0.5);
      const img = scene.add.image(c.x, c.y, GRASS_TEX).setOrigin(0.5, TUFT_BASE).setDepth(TUFT_DEPTH);
      img.setScale((MAP.tileWidth * TUFT_WIDTH * s.scale) / img.frame.width);
      if (s.flip) img.setFlipX(true);
      img.tileKey = s.col * 100 + s.row;
      this.tufts.push(img);
    }
  }

  /** Hide the tufts under `buildings` (call when the layout changes). */
  layout(buildings, skipId = null) {
    const covered = coveredTiles(skipId ? buildings.filter((b) => b.id !== skipId) : buildings);
    for (const t of this.tufts) t.setVisible(!covered.has(t.tileKey));
  }

  /** The time of day's tint (night darkens them like the rest of the village). */
  setTint(tint) {
    if (tint === this.tint) return;
    this.tint = tint;
    for (const t of this.tufts) t.setTint(tint);
  }

  destroy() {
    for (const t of this.tufts) t.destroy();
    this.tufts = [];
  }
}
