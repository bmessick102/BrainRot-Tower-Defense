// Shop-style HP bar drawn over a building, wall or enemy: dark rounded frame, glossy team-colored fill
// (green = yours, red = enemy), a pale "damage trail" that drains after each hit, a quick flash + bump
// on a hit, and an optional level badge on the left end. Hidden until draw() is called with visible = true.
import { COLORS, textStyle, shade, mix } from '../theme.js';
import { drawGlossy } from './uiDraw.js';
import { TEX } from '../assetKeys.js';

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
   * @param {number} [opts.badgeColor] the badge's color (buildings: blue; enemies: dark red)
   */
  constructor(scene, { width = 60, height = 12, depth = 5000, color = HP_TEAM.player, badge = false, badgeColor = COLORS.buttonBlue, badgeStyle = 'circle' } = {}) {
    this.scene = scene;
    this.badgeColor = badgeColor;
    this.badgeStyle = badgeStyle; // 'circle', or 'crown' (the Brisket King: a dark purple crown with his level)
    this.width = width;
    this.height = height;
    this.color = color;
    this.container = scene.add.container(0, 0).setDepth(depth).setVisible(false);
    this.gfx = scene.add.graphics();
    this.container.add(this.gfx);
    if (badge) {
      // The hero's crown is a picture (TEX.heroCrown) when it's loaded; the level number is drawn on top of it.
      if (badgeStyle === 'crown' && scene.textures.exists(TEX.heroCrown)) {
        this.crownImg = scene.add.image(0, 0, TEX.heroCrown);
        this.container.add(this.crownImg);
      }
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

  /** Change the fill color (redrawn on the next draw). */
  setColor(color) {
    if (color === this.color) return;
    this.color = color;
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

    // Redrawn only when something moves by a pixel (or the flash by a tenth): a busy wave has hundreds of bars.
    const px = (v) => (v > 0 ? Math.round(v * this.width) + 1 : 0); // (any health left still shows a sliver)
    const key = `${px(f)}|${px(this.trail)}|${flash.toFixed(1)}|${level}`;
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

    if (this.badgeText && this.badgeStyle === 'crown') {
      if (this.crownImg) {
        const cw = br * 2.9;
        this.crownImg.setScale(cw / this.crownImg.frame.width).setPosition(bx, -br * 0.12);
      } else drawCrown(g, bx, br);
      const label = level == null ? '' : String(level);
      this.badgeText.setText(label).setPosition(bx, br * 0.12).setScale(label.length >= 2 ? 1 : 1.2)
        .setStroke('#120a18', Math.max(3, Math.round(br * 0.4)));
    } else if (this.badgeText) {
      drawGlossy(g, bx - br, -br, br * 2, br * 2, this.badgeColor, { circle: true, lip: 2, shadow: true });
      const label = level == null ? '' : String(level);
      // Three digits or more (very late enemies): smaller, so the number stays inside the badge.
      this.badgeText.setText(label).setPosition(bx, -1).setScale(label.length >= 3 ? 0.72 : 1);
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

/**
 * A hero's level badge: a dark purple crown (flared corner points, a flat raised middle) with a thin lavender
 * rim, a slightly lighter top and a faint band near the bottom, wider than tall, centered on (cx, 0) with `r`
 * the round badge's radius. The level number sits on it in big white figures.
 */
function drawCrown(g, cx, r) {
  const w = r * 2.5, tip = -r * 1.08, side = -r * 0.3, notch = -r * 0.62, mid = -r * 0.86, bottom = r * 0.98;
  const pts = (o) => [
    { x: cx - w / 2 - o, y: bottom + o }, { x: cx - w / 2 - o, y: side },
    { x: cx - w / 2 - r * 0.24 - o, y: tip - o }, { x: cx - w * 0.27, y: notch - o },
    { x: cx - w * 0.16, y: mid - o }, { x: cx + w * 0.16, y: mid - o },
    { x: cx + w * 0.27, y: notch - o }, { x: cx + w / 2 + r * 0.24 + o, y: tip - o },
    { x: cx + w / 2 + o, y: side }, { x: cx + w / 2 + o, y: bottom + o }
  ];
  g.fillStyle(0x000000, 0.35).fillPoints(pts(0).map((p) => ({ x: p.x + 1, y: p.y + 2 })), true); // shadow
  g.fillStyle(0x0c0610, 1).fillPoints(pts(2.2), true);                                         // dark outline
  g.fillStyle(0x8f7ba6, 1).fillPoints(pts(1), true);                                           // lavender rim
  g.fillStyle(0x2a1838, 1).fillPoints(pts(0), true);                                           // body
  g.fillStyle(0x3d2652, 1).fillPoints(pts(0).map((p) => ({ x: p.x, y: Math.min(p.y, -r * 0.05) })), true); // lighter top
  g.fillStyle(0x6e5888, 0.9).fillRect(cx - w / 2 + 2, bottom - r * 0.3, w - 4, Math.max(1.5, r * 0.12)); // band
}
