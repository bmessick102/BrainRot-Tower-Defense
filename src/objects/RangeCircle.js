// Range ellipse for a defense: white fill 15%, 2 px white outline 70%.
// Mortar also gets its dead zone: red fill 30%.
import { rangeEllipse, gridToScreen } from '../logic/iso.js';

export class RangeCircle {
  // Drawn on the ground (above the map, below buildings) so it never tints the buildings themselves.
  constructor(scene, depth = -4000) {
    this.gfx = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  /** Center in grid space (footprint center), radii in tiles. */
  show(centerX, centerY, range, minRange = 0) {
    const c = gridToScreen(centerX, centerY);
    const g = this.gfx;
    g.clear();
    const r = rangeEllipse(range);
    g.fillStyle(0xffffff, 0.15).fillEllipse(c.x, c.y, r.rx * 2, r.ry * 2);
    g.lineStyle(2, 0xffffff, 0.7).strokeEllipse(c.x, c.y, r.rx * 2, r.ry * 2);
    if (minRange > 0) {
      const m = rangeEllipse(minRange);
      g.fillStyle(0xff0000, 0.3).fillEllipse(c.x, c.y, m.rx * 2, m.ry * 2);
    }
    g.setVisible(true);
  }

  hide() {
    this.gfx.clear();
    this.gfx.setVisible(false);
  }

  destroy() {
    this.gfx.destroy();
  }
}
