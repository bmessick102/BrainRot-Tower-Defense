// Range ellipse for a defense: white fill 15%, 2 px white outline 70%.
// Mortar also gets its dead zone: red fill 30%.
import { rangeEllipse, gridToScreen } from '../logic/iso.js';
import { footprintCenter } from '../logic/grid.js';
import { isDefense } from '../logic/buildings.js';
import { towerRange, towerMinRange } from '../logic/abilities.js';
import { djStats } from '../logic/dj.js';
import { heroStats } from '../logic/hero.js';
import { queenStats } from '../logic/queen.js';
import { mageStats } from '../logic/mage.js';

export function inspectionRange(b) {
  if (!b) return 0;
  if (b.type === 'dj') return djStats(b).range;
  if (b.type === 'altar') return heroStats(b).guardRange;
  if (b.type === 'queenAltar') return queenStats(b).guardRange;
  if (b.type === 'mageAltar') return mageStats(b).attackRange;
  return isDefense(b.type) ? towerRange(b) : 0;
}

export class RangeCircle {
  // Drawn above the buildings (but under their labels and health bars) so the range is always visible.
  constructor(scene, depth = 4900) {
    this.gfx = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  showBuilding(b) {
    const range = inspectionRange(b);
    if (!(range > 0)) { this.hide(); return; }
    const c = footprintCenter(b);
    this.show(c.x, c.y, range, isDefense(b.type) ? towerMinRange(b) : 0);
  }

  /** Center in grid space (footprint center), radii in tiles. */
  show(centerX, centerY, range, minRange = 0) {
    const c = gridToScreen(centerX, centerY);
    const g = this.gfx;
    g.clear();
    const r = rangeEllipse(range, centerX, centerY); // sized to the tiles where it stands
    g.fillStyle(0xffffff, 0.15).fillEllipse(c.x, c.y, r.rx * 2, r.ry * 2);
    g.lineStyle(2, 0xffffff, 0.7).strokeEllipse(c.x, c.y, r.rx * 2, r.ry * 2);
    if (minRange > 0) {
      const m = rangeEllipse(minRange, centerX, centerY);
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
