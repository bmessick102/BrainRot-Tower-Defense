// Gandolf the Grand's You Shall Not Pass walls (src/logic/wizardWall.js), drawn in code from the logic's state.barriers
// every frame: a glowing see-through wall of light standing on the ground along each wall's line (it rises up when cast
// and sinks away at the end), with runes shimmering in it, a bright top edge and a glow on the ground at its foot, and
// small sparks where it holds an enemy. Low graphics quality (src/quality.js): no ground glow, runes or sparks.
import { gridToScreen } from '../logic/iso.js';
import { isLowQuality } from '../quality.js';

const HEIGHT = 58;        // px: how tall the wall stands
const RISE_SECONDS = 0.25;
const FADE_SECONDS = 0.4;
const LIGHT = 0xbfe6ff, CORE = 0xffffff, EDGE = 0x7fc8ff;

export class WallFx {
  constructor(scene) {
    this.scene = scene;
    this.ground = scene.add.graphics().setDepth(-8970); // on the ground, over the plots
    this.wall = scene.add.graphics().setDepth(2640);    // over walkers (it's see-through), under the nets and the HUD
  }

  update(time) {
    const gs = this.scene.gs;
    const walls = (gs && gs.barriers) || [];
    this.ground.clear();
    this.wall.clear();
    if (!walls.length) return;
    const low = isLowQuality();
    for (const w of walls) {
      const age = w.seconds - w.t;
      const rise = Math.min(1, age / RISE_SECONDS);
      const alpha = Math.min(1, w.t / FADE_SECONDS);
      const h = HEIGHT * rise * (0.6 + 0.4 * alpha);
      const a = gridToScreen(w.x1, w.y1), b = gridToScreen(w.x2, w.y2);
      const shimmer = 0.85 + 0.15 * Math.sin(time * 0.01 + w.id.length);
      if (!low) {
        // A soft glow on the ground along its foot.
        this.ground.lineStyle(14, LIGHT, 0.18 * alpha).lineBetween(a.x, a.y, b.x, b.y);
        this.ground.lineStyle(5, CORE, 0.35 * alpha).lineBetween(a.x, a.y, b.x, b.y);
      }
      const g = this.wall;
      // The wall itself: a see-through sheet of light, brighter toward the bottom.
      const pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y - h }, { x: a.x, y: a.y - h }];
      g.fillStyle(LIGHT, 0.34 * alpha * shimmer).fillPoints(pts, true);
      const low3 = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: b.x, y: b.y - h * 0.4 }, { x: a.x, y: a.y - h * 0.4 }];
      g.fillStyle(CORE, 0.22 * alpha).fillPoints(low3, true);
      // Edges: a bright top line and glowing posts at the ends.
      g.lineStyle(3, CORE, 0.95 * alpha).lineBetween(a.x, a.y - h, b.x, b.y - h);
      g.lineStyle(2, EDGE, 0.8 * alpha).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(4, EDGE, 0.9 * alpha).lineBetween(a.x, a.y, a.x, a.y - h).lineBetween(b.x, b.y, b.x, b.y - h);
      if (low) continue;
      // Runes: short glowing strokes drifting up through the wall.
      const n = 6;
      g.lineStyle(2, CORE, 0.7 * alpha);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        const up = ((time * 0.04 + i * 17) % h) || 0, len = 8;
        g.lineBetween(x - 3, y - up, x + 3, y - up - len * 0.5).lineBetween(x + 3, y - up - len * 0.5, x - 3, y - up - len);
      }
      // Sparks where it's holding an enemy back.
      for (const id of w.held || []) {
        const v = this.scene.views.enemies.get(id);
        if (!v || !v.sprite) continue;
        const s = v.sprite, by = s.y - s.displayHeight * 0.35;
        const r = 3 + 2 * Math.sin(time * 0.03 + s.x);
        g.fillStyle(CORE, 0.9 * alpha).fillCircle(s.x, by, r);
        g.lineStyle(1.5, LIGHT, 0.7 * alpha).strokeCircle(s.x, by, r + 4);
      }
    }
  }

  destroy() {
    this.ground.destroy();
    this.wall.destroy();
  }
}
