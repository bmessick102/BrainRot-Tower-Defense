// HUD resource bar: a rounded trough that fills with gold in proportion to amount / capacity,
// the amount in bold white on top, a small "Max" line above, and the currency icon capping the right end.
import { FONT } from '../theme.js';

const FILL_MS = 300;

/** 8000000 -> "8 000 000" (space-separated, like the reference art). */
export function formatSpaced(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export class ResourceBar {
  /**
   * @param x, y  top-left of the bar
   * @param width, height  bar size (the icon overhangs the right end)
   */
  constructor(scene, x, y, width, height, iconKey, colors = {}) {
    this.scene = scene;
    this.x = x; this.y = y; this.w = width; this.h = height;
    this.colors = {
      fill: 0xf5c518, light: 0xffe680, dark: 0xc8920f, trough: 0x2b2111, edge: 0x140d04, ...colors
    };
    this.shown = 0; // fraction currently drawn (animates toward the target)
    this.counter = null;

    const inset = 3;
    this.inner = { x: x + inset, y: y + inset, w: width - inset * 2, h: height - inset * 2 };

    this.trough = scene.add.graphics();
    this.fill = scene.add.graphics();
    // Clip the fill to the rounded inner shape so tiny amounts still look like a rounded bar.
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff).fillRoundedRect(this.inner.x, this.inner.y, this.inner.w, this.inner.h, this.inner.h / 2);
    this.fill.setMask(maskShape.createGeometryMask());
    this.gloss = scene.add.graphics();

    const iconSize = Math.round(height * 1.75);
    this.icon = scene.add.image(x + width, y + height / 2, iconKey);
    this.icon.setScale(iconSize / this.icon.frame.height);
    this.iconRadius = iconSize / 2;

    this.amountText = scene.add.text(x + width - this.iconRadius - 8, y + height / 2 + 1, '0', {
      fontFamily: FONT, fontSize: `${Math.round(height * 0.78)}px`, color: '#ffffff',
      stroke: '#000000', strokeThickness: 6
    }).setOrigin(1, 0.5);
    this.amountText.setShadow(0, 3, '#1a1000', 0, true, true);

    this.maxText = scene.add.text(x + 14, y - 3, '', {
      fontFamily: FONT, fontSize: '15px', color: '#ffffff', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0, 1);

    this.drawTrough();
    this.drawFill(0);
  }

  drawTrough() {
    const { x, y, w, h } = this;
    const c = this.colors;
    const g = this.trough;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(x + 2, y + 4, w, h, h / 2);            // drop shadow
    g.fillStyle(c.edge, 1).fillRoundedRect(x, y, w, h, h / 2);                         // dark outline
    const i = this.inner;
    g.fillStyle(c.trough, 0.95).fillRoundedRect(i.x, i.y, i.w, i.h, i.h / 2);          // empty trough
    g.fillStyle(0x000000, 0.3).fillRoundedRect(i.x, i.y, i.w, i.h * 0.35, { tl: i.h / 2, tr: i.h / 2, bl: 0, br: 0 });
  }

  drawFill(fraction) {
    const c = this.colors;
    const i = this.inner;
    const w = i.w * Math.max(0, Math.min(1, fraction));
    const g = this.fill;
    g.clear();
    if (w <= 0) return;
    g.fillStyle(c.fill, 1).fillRect(i.x, i.y, w, i.h);
    g.fillStyle(c.light, 0.9).fillRect(i.x, i.y + i.h * 0.12, w, i.h * 0.3);   // shine band
    g.fillStyle(c.dark, 1).fillRect(i.x, i.y + i.h * 0.78, w, i.h * 0.22);     // bottom shade
    g.fillStyle(c.edge, 0.35).fillRect(i.x + w - 2, i.y, 2, i.h);              // leading edge
  }

  /** Update the amount and capacity. The fill animates toward the new fraction. */
  setValue(amount, capacity) {
    this.amountText.setText(formatSpaced(amount));
    this.maxText.setText(`Max: ${formatSpaced(capacity)}`);
    const target = capacity > 0 ? Math.min(1, amount / capacity) : 0;
    if (this.counter) this.counter.stop();
    this.counter = this.scene.tweens.addCounter({
      from: this.shown,
      to: target,
      duration: FILL_MS,
      ease: 'Cubic.easeOut',
      onUpdate: (t) => { this.shown = t.getValue(); this.drawFill(this.shown); }
    });
  }

  /** Screen rectangle covered by the bar, icon, and Max label (for click blocking). */
  bounds() {
    return {
      x: this.x - 4,
      y: this.y - 22,
      w: this.w + this.iconRadius + 8,
      h: Math.max(this.h + 26, this.iconRadius * 2 + 4)
    };
  }
}
