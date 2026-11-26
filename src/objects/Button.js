// A glossy, beveled UI button with an optional second line (used for prices and "why it's disabled").
// Fires on pointerdown so panels that refresh between press and release never swallow a click.
// opts: color, hoverColor, disabledColor (default: the shared grey), fontSize, radius, circle (round button), icon: 'x' | 'left' | 'right' | 'eye' | 'fullscreen' |
// 'exitFullscreen' (drawn instead of text), onRelease (fire when the press ends instead: browsers only allow some
// things, like full screen, from a finished tap or click).
import Phaser from 'phaser';
import { COLORS, shade, textStyle } from '../theme.js';
import { drawGlossy, drawCross, drawArrow, drawFullscreenIcon, drawEye } from './uiDraw.js';
import { playSfx, playSfxCapped } from '../audio.js';
import { SFX } from '../assetKeys.js';
import { IS_TOUCH } from '../device.js';
import { currencyCost } from './CurrencyCost.js';

const LIP = 4;
// Touch screens: small buttons (close X, info, arrows) also react a little outside their edges, so a finger
// can hit them on a phone, where the whole game is drawn about half size.
const TOUCH_MIN = 60, TOUCH_MAX_PAD = 14;

/** The click area for a button of this size: its own box, grown on touch screens if it's small. */
function hitRect(w, h, rect) {
  const pad = (d) => (IS_TOUCH ? Math.min(TOUCH_MAX_PAD, Math.max(0, (TOUCH_MIN - d) / 2)) : 0);
  const px = pad(w), py = pad(h);
  return rect.setTo(-px, -py, w + px * 2, h + py * 2);
}

export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, height, label, onClick, opts = {}) {
    super(scene, x, y);
    // Not this.w / this.h: Phaser's Transform already owns `w` (setPosition(x, y) resets it to 0).
    this.btnW = width;
    this.btnH = height;
    this.color = opts.color ?? COLORS.button;
    this.hoverColor = opts.hoverColor ?? null; // null = a lighter shade of `color`
    this.disabledColor = opts.disabledColor ?? COLORS.buttonDisabled;
    this.fontSize = opts.fontSize ?? 18;
    this.radius = opts.radius ?? 12;
    this.circle = !!opts.circle;
    this.icon = opts.icon ?? null;
    this.onClick = onClick;
    // Called when a disabled button is tapped (a greyed button that explains itself), instead of nothing.
    this.onDisabledClick = opts.onDisabledClick ?? null;
    this.invalidFeedback = !!opts.invalidFeedback;
    this.enabled = true;
    this.hover = false;

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, this.icon ? '' : label, textStyle(this.fontSize)).setOrigin(0.5);
    this.sub = scene.add.text(0, 0, '', textStyle(Math.max(12, Math.round(this.fontSize * 0.7)), '#fff6d8')).setOrigin(0.5);
    this.add([this.bg, this.label, this.sub]);
    this.setSize(width, height);
    this.setInteractive({ hitArea: hitRect(width, height, new Phaser.Geom.Rectangle()), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.on('pointerover', () => { this.hover = true; this.redraw(); });
    this.on('pointerout', () => { this.hover = false; this.redraw(); });
    this.on(opts.onRelease ? 'pointerup' : 'pointerdown', (pointer, lx, ly, event) => {
      if (event) event.stopPropagation();
      if (!this.enabled) {
        if (this.invalidFeedback) playSfxCapped(scene, SFX.invalid, 1);
        if (this.onDisabledClick) this.onDisabledClick();
        return;
      }
      if (!this.onClick) return;
      playSfx(scene, SFX.uiClick);
      this.squash();
      this.onClick();
    });
    this.redraw();
    scene.add.existing(this);
  }

  /** Quick press squash; skipped if the click destroyed the button. */
  squash() {
    if (!this.scene) return;
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.scene.tweens.add({ targets: this, scaleX: 0.94, scaleY: 0.9, duration: 60, yoyo: true, ease: 'Quad.easeOut' });
  }

  redraw() {
    const g = this.bg;
    const base = !this.enabled ? this.disabledColor : this.color;
    const fill = this.enabled && this.hover ? (this.hoverColor ?? shade(base, 1.12)) : base;
    g.clear();
    drawGlossy(g, -this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, fill, { radius: this.radius, lip: LIP, circle: this.circle });
    if (this.icon === 'x') drawCross(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.42);
    if (this.icon === 'fullscreen' || this.icon === 'exitFullscreen') drawFullscreenIcon(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.5, this.icon === 'exitFullscreen');
    if (this.icon === 'left' || this.icon === 'right') drawArrow(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.4, this.icon === 'left' ? -1 : 1);
    if (this.icon === 'eye') drawEye(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.62);
    const faceMid = -LIP / 2; // text sits on the face, above the lip
    const hasSub = this.sub.text.length > 0;
    this.label.setY(hasSub ? faceMid - this.btnH * 0.15 : faceMid);
    this.sub.setY(faceMid + this.btnH * 0.22);
    this.label.setAlpha(this.enabled ? 1 : 0.85);
    if (this.costRow) {
      const scale = Math.min(1, (this.btnW - 16) / this.costRow.width);
      this.costRow.setScale(scale).setPosition(-this.costRow.width * scale / 2, this.label.y).setAlpha(this.label.alpha);
    }
  }

  /** Change the button's size (drawing and click area). */
  resize(width, height = this.btnH) {
    if (width === this.btnW && height === this.btnH) return this;
    this.btnW = width;
    this.btnH = height;
    this.setSize(width, height);
    if (this.input && this.input.hitArea) hitRect(width, height, this.input.hitArea);
    this.redraw();
    return this;
  }

  setLabel(text, sub = '') {
    this.costRow?.destroy();
    this.costRow = null;
    this.costKey = null;
    if (this.label.text !== text) this.label.setText(text);
    if (this.sub.text !== sub) this.sub.setText(sub);
    this.redraw();
    return this;
  }

  setCosts(costs, title = '', sub = '') {
    const key = JSON.stringify([costs, title]);
    if (key !== this.costKey) {
      this.setLabel('', sub);
      this.costRow = currencyCost(this.scene, costs, textStyle(this.fontSize), title);
      this.add(this.costRow);
      this.costKey = key;
    }
    this.sub.setText(sub);
    this.redraw();
    return this;
  }

  get contentWidth() {
    return Math.max(this.costRow?.width || this.label.width, this.sub.width);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.input) this.input.cursor = enabled ? 'pointer' : 'default';
    this.redraw();
    return this;
  }
}
