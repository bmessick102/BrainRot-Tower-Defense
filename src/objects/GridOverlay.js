// Debug grid overlay (press G): the 40 x 40 tile grid drawn on top of the map, lined up with the grass diamond.
// It is drawn from the same gridToScreen the game uses for everything else, so what you see here is exactly where
// buildings, enemies and clicks land. Colours follow the map being shown (day / dawn / dusk / night: see GRID_TINTS
// in gridConfig.js) and fade with the day/night clock the same way the map pictures do.
import { gridToScreen } from '../logic/iso.js';
import { GRID_SIZE, GRID_TINTS, GRID_DEBUG_KEY } from '../gridConfig.js';
import { skyBlend } from '../logic/clockLight.js';
import { lerpColor } from './DayNight.js';

const DEPTH = -8500;     // over the map and its dirt plots, under buildings, enemies and lights
const LINE_SCREEN_PX = 1.4; // grid line width on screen, whatever the zoom

/** The overlay colours for a clock: the day set, blended toward the dawn / dusk / night set the way the maps fade. */
export function overlayColors(clock) {
  const b = skyBlend(clock);
  let c = GRID_TINTS.day;
  const mix = (a, z, t) => ({
    light: lerpColor(a.light, z.light, t), dark: lerpColor(a.dark, z.dark, t),
    line: lerpColor(a.line, z.line, t), edge: lerpColor(a.edge, z.edge, t), tileAlpha: a.tileAlpha, lineAlpha: a.lineAlpha
  });
  if (b.dawn > 0) c = mix(c, GRID_TINTS.dawn, b.dawn);
  if (b.dusk > 0) c = mix(c, GRID_TINTS.dusk, b.dusk);
  if (b.night > 0) c = mix(c, GRID_TINTS.night, b.night);
  return c;
}

export class GridOverlay {
  constructor(scene) {
    this.scene = scene;
    this.visible = false;
    this.gfx = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.drawnKey = '';
    scene.input.keyboard.on(`keydown-${GRID_DEBUG_KEY}`, () => this.toggle());
  }

  toggle(on = !this.visible) {
    this.visible = on;
    this.gfx.setVisible(on);
    this.drawnKey = ''; // redraw on the next update
  }

  /** Redraws when the colours or the zoom changed enough to matter (cheap otherwise). */
  update(clock) {
    if (!this.visible) return;
    const colors = overlayColors(clock);
    const zoom = this.scene.cameras.main.zoom;
    const key = `${colors.light}|${colors.line}|${Math.round(Math.log(zoom) * 20)}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.draw(colors, LINE_SCREEN_PX / zoom);
  }

  draw(c, lineW) {
    const g = this.gfx;
    const N = GRID_SIZE;
    g.clear();
    // Checkered tile wash: every tile, alternating the map's light and dark grass shade.
    for (let phase = 0; phase < 2; phase++) {
      g.fillStyle(phase ? c.dark : c.light, c.tileAlpha);
      for (let r = 0; r < N; r++) {
        for (let col = 0; col < N; col++) {
          if (((col + r) & 1) !== phase) continue;
          const a = gridToScreen(col, r), b = gridToScreen(col + 1, r), d = gridToScreen(col + 1, r + 1), e = gridToScreen(col, r + 1);
          g.fillPoints([a, b, d, e], true);
        }
      }
    }
    // Grid lines: straight in this fit (a line of constant column or row is linear in the other coordinate).
    g.lineStyle(lineW, c.line, c.lineAlpha);
    for (let i = 1; i < N; i++) {
      const a = gridToScreen(i, 0), b = gridToScreen(i, N), p = gridToScreen(0, i), q = gridToScreen(N, i);
      g.lineBetween(a.x, a.y, b.x, b.y);
      g.lineBetween(p.x, p.y, q.x, q.y);
    }
    // The outline (the diamond's edge) and a dot on each of the four corners.
    g.lineStyle(lineW * 2, c.edge, 0.95);
    const T = gridToScreen(0, 0), R = gridToScreen(N, 0), B = gridToScreen(N, N), L = gridToScreen(0, N);
    g.strokePoints([T, R, B, L], true, true);
    g.fillStyle(c.edge, 1);
    for (const p of [T, R, B, L]) g.fillCircle(p.x, p.y, lineW * 3);
  }
}
