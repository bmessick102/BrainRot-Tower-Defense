// A glossy, beveled UI button with an optional second line (used for prices and "why it's disabled").
// Fires on pointerdown so panels that refresh between press and release never swallow a click.
// opts: color, hoverColor, fontSize, radius, circle (round button), icon: 'x' | 'left' | 'right' (drawn instead of text).
import Phaser from 'phaser';
import { COLORS, shade, textStyle } from '../theme.js';
import { drawGlossy, drawCross, drawArrow } from './uiDraw.js';
import { playSfx } from '../audio.js';
import { SFX } from '../assetKeys.js';

const LIP = 4;

export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, height, label, onClick, opts = {}) {
    super(scene, x, y);
    // Not this.w / this.h: Phaser's Transform already owns `w` (setPosition(x, y) resets it to 0).
    this.btnW = width;
    this.btnH = height;
    this.color = opts.color ?? COLORS.button;
    this.hoverColor = opts.hoverColor ?? null; // null = a lighter shade of `color`
    this.fontSize = opts.fontSize ?? 18;
    this.radius = opts.radius ?? 12;
    this.circle = !!opts.circle;
    this.icon = opts.icon ?? null;
    this.onClick = onClick;
    this.enabled = true;
    this.hover = false;

    this.bg = scene.add.graphics();
    this.label = scene.add.text(0, 0, this.icon ? '' : label, textStyle(this.fontSize)).setOrigin(0.5);
    this.sub = scene.add.text(0, 0, '', textStyle(Math.max(12, Math.round(this.fontSize * 0.7)), '#fff6d8')).setOrigin(0.5);
    this.add([this.bg, this.label, this.sub]);
    this.setSize(width, height);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => { this.hover = true; this.redraw(); });
    this.on('pointerout', () => { this.hover = false; this.redraw(); });
    this.on('pointerdown', (pointer, lx, ly, event) => {
      if (event) event.stopPropagation();
      if (!this.enabled || !this.onClick) return;
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
    const base = !this.enabled ? COLORS.buttonDisabled : this.color;
    const fill = this.enabled && this.hover ? (this.hoverColor ?? shade(base, 1.12)) : base;
    g.clear();
    drawGlossy(g, -this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, fill, { radius: this.radius, lip: LIP, circle: this.circle });
    if (this.icon === 'x') drawCross(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.42);
    if (this.icon === 'left' || this.icon === 'right') drawArrow(g, 0, -LIP / 2, Math.min(this.btnW, this.btnH) * 0.4, this.icon === 'left' ? -1 : 1);
    const faceMid = -LIP / 2; // text sits on the face, above the lip
    const hasSub = this.sub.text.length > 0;
    this.label.setY(hasSub ? faceMid - this.btnH * 0.15 : faceMid);
    this.sub.setY(faceMid + this.btnH * 0.22);
    this.label.setAlpha(this.enabled ? 1 : 0.85);
  }

  setLabel(text, sub = '') {
    if (this.label.text !== text) this.label.setText(text);
    if (this.sub.text !== sub) this.sub.setText(sub);
    this.redraw();
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.input) this.input.cursor = enabled ? 'pointer' : 'default';
    this.redraw();
    return this;
  }
}
