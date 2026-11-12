// Shop-style HP bar drawn over a building, wall or enemy: dark rounded frame, glossy team-colored fill
// (green = yours, red = enemy), a pale "damage trail" that drains after each hit, a quick flash + bump
// on a hit, and an optional level badge on the left end. Hidden until draw() is called with visible = true.
import { COLORS, textStyle, shade, mix } from '../theme.js';
import { drawGlossy } from './uiDraw.js';

export const HP_TEAM = { player: COLORS.buttonGood, enemy: COLORS.buttonDanger };

const TRAIL_COLOR = 0xfff1cf;
const TRAIL_HOLD_MS = 260;   // the lost chunk lingers this long before it starts draining
const TRAIL_DRAIN_MS = 110;  // then shrinks toward the real value (exponential time constant)
const FLASH_MS = 220;        // how long a hit brightens and bumps the bar
const BUMP = 0.16;           // extra scale at the start of a hit

export class HealthBar {
  /**
   * @param {object} opts
   * @param {number} [opts.width] bar length in px (not counting the badge)
   * @param {number} [opts.height] outer height in px, frame included
   * @param {number} [opts.depth]
   * @param {number} [opts.color] fill color (use HP_TEAM)
   * @param {boolean} [opts.badge] draw a level badge on the left end
   */
  constructor(scene, { width = 60, height = 12, depth = 5000, color = HP_TEAM.player, badge = false } = {}) {
    this.scene = scene;
    this.width = width;
    this.height = height;
    this.color = color;
    this.container = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);
    if (badge) {
      this.badgeR = Math.round(height * 0.85);
      this.badgeText = scene.add.text(0, 0, '', textStyle(Math.round(this.badgeR * 1.25))).setOrigin(0.5);
      this.container.add(this.badgeText);
    }
    this.last = null;   // HP fraction seen last frame (null until the first draw)
    this.trail = 0;     // where the pale damage chunk currently ends
    this.holdUntil = 0;
    this.flashAt = -Infinity;
    this.lastTime = 0;
    this.drawnKey = '';
  }

  /** (x, y) is the top-center of the bar. Tracks damage even while hidden so the first visible hit animates. */
  draw(x, y, fraction, visible = true, level = null) {
    const now = this.scene.time.now;
    const dt = Math.min(100, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    const f = Math.max(0, Math.min(1, fraction));

    if (this.last === null) {
      this.last = this.trail = f; // first sight (e.g. a damaged building loaded from a save): no animation
    } else if (f < this.last - 1e-6) {
      this.trail = Math.max(this.trail, this.last);
      this.holdUntil = now + TRAIL_HOLD_MS;
      this.flashAt = now;
    }
    this.last = f;
    if (f >= this.trail) this.trail = f; // healed / repaired: no trail
    else if (now >= this.holdUntil) {
      this.trail = f + (this.trail - f) * Math.exp(-dt / TRAIL_DRAIN_MS);
      if (this.trail - f < 0.002) this.trail = f;
    }

    this.container.setVisible(visible);
    if (!visible) return;

    const flash = Math.max(0, 1 - (now - this.flashAt) / FLASH_MS);
    this.container.setPosition(x, y + this.height / 2).setScale(1 + BUMP * flash * flash);

    const key = `${f.toFixed(4)}|${this.trail.toFixed(4)}|${flash.toFixed(2)}|${level}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    this.redraw(f, flash, level);
  }

  redraw(f, flash, level) {
    const g = this.gfx;
    const w = this.width, h = this.height;
    const x = -w / 2, y = -h / 2, r = h / 2;
    // With a badge, the trough starts at the badge's right edge so the badge never hides any of the fill.
    const br = this.badgeR || 0, bx = x + br * 0.4;
    const ix = br ? bx + br - 2 : x + 2;
    const iy = y + 2, iw = x + w - 2 - ix, ih = h - 4, ir = ih / 2;
    g.clear();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 1, y + 2, w, h, r);   // drop shadow
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, h, r);          // outline
    g.fillStyle(0x2c261f, 1).fillRoundedRect(ix, iy, iw, ih, ir);         // empty trough

    // Rounded rects need at least their height in width, so tiny slivers are drawn as a pill end.
    const span = (frac) => (frac <= 0 ? 0 : Math.max(ih, iw * frac));
    const tw = span(this.trail);
    if (tw > 0 && this.trail > f) g.fillStyle(TRAIL_COLOR, 1).fillRoundedRect(ix, iy, tw, ih, ir);

    const fw = span(f);
    if (fw > 0) {
      const face = mix(this.color, 0xffffff, 0.65 * flash);
      const lip = ih >= 6 ? 2 : 1;
      g.fillStyle(shade(face, 0.7), 1).fillRoundedRect(ix, iy, fw, ih, ir);        // darker underside
      g.fillStyle(face, 1).fillRoundedRect(ix, iy, fw, ih - lip, Math.min(ir, (ih - lip) / 2));
      if (fw > ih) g.fillStyle(0xffffff, 0.4).fillRect(ix + ir, iy + 1, fw - ih, Math.max(1, Math.round(ih * 0.28))); // shine
    }

    if (this.badgeText) {
      drawGlossy(g, bx - br, -br, br * 2, br * 2, COLORS.buttonBlue, { circle: true, lip: 2, shadow: true });
      this.badgeText.setText(level == null ? '' : String(level)).setPosition(bx, -1);
    }
  }

  setAlpha(a) {
    this.container.setAlpha(a);
  }

  setDepth(d) {
    this.container.setDepth(d);
  }

  destroy() {
    this.container.destroy();
  }
}
