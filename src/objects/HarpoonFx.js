// Harpoon Ballista's Reel In chains (src/logic/harpoon.js), drawn in code every frame from the logic's state: while an
// enemy is being dragged (e.reelT > 0), a steel chain runs from the top of the tower that hooked it (e.reelSourceId) to
// the enemy's body, links alternating along it, with a hook glint at the enemy's end. When the drag ends the chain
// fades out over FADE_MS. Low graphics quality (src/quality.js): a plain line, no links.
import { isLowQuality } from '../quality.js';

const FADE_MS = 180;
const STEEL = 0xc9d2dc, DARK = 0x3b4450, GLINT = 0xfff6d8;
const LINK = 9; // px between links

export class HarpoonFx {
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(2700); // over walkers, under the float texts and the HUD
    this.last = new Map(); // enemy id -> { from, to, endedAt } (for the fade after the drag ends)
  }

  /** Where the chain runs now for enemy e: { from, to } in screen px, or null if either end isn't drawn. */
  ends(e) {
    const bv = this.scene.views.buildings.get(e.reelSourceId), ev = this.scene.views.enemies.get(e.id);
    if (!bv || !bv.sprite || !ev || !ev.sprite) return null;
    const s = ev.sprite;
    return { from: bv.topCenter(), to: { x: s.x, y: s.y - s.displayHeight * 0.45 } };
  }

  update(time) {
    const gs = this.scene.gs;
    this.g.clear();
    const live = new Set();
    for (const e of (gs && gs.enemies) || []) {
      if (!(e.reelT > 0) || !e.alive) continue;
      const ends = this.ends(e);
      if (!ends) continue;
      live.add(e.id);
      this.last.set(e.id, { ...ends, endedAt: null });
      this.drawChain(ends.from, ends.to, 1);
    }
    for (const [id, c] of this.last) {
      if (live.has(id)) continue;
      if (c.endedAt === null) c.endedAt = time;
      const a = 1 - (time - c.endedAt) / FADE_MS;
      if (a <= 0) { this.last.delete(id); continue; }
      this.drawChain(c.from, c.to, a);
    }
  }

  drawChain(from, to, alpha) {
    const g = this.g, dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (len < 2) return;
    g.lineStyle(4, DARK, 0.85 * alpha).lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(2, STEEL, alpha).lineBetween(from.x, from.y, to.x, to.y);
    if (!isLowQuality()) {
      // Links: small rings along the chain, every other one turned (drawn flat or edge-on).
      const ux = dx / len, uy = dy / len, n = Math.floor(len / LINK);
      for (let i = 1; i < n; i++) {
        const x = from.x + ux * LINK * i, y = from.y + uy * LINK * i;
        if (i % 2) g.lineStyle(2, STEEL, alpha).strokeEllipse(x, y, 7, 5);
        else g.lineStyle(2.5, DARK, alpha).lineBetween(x - ux * 3, y - uy * 3, x + ux * 3, y + uy * 3);
      }
    }
    g.fillStyle(GLINT, alpha).fillCircle(to.x, to.y, 3.5); // the hook, caught in the enemy
    g.lineStyle(1.5, DARK, alpha).strokeCircle(to.x, to.y, 5);
  }

  destroy() {
    this.g.destroy();
  }
}
