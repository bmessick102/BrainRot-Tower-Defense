// Visual effects for the RV Lab abilities: chain lightning, Arrow Storm, Meteor, Solar Flare, the Tower of
// Rah Fire Ring, sparkler pops, and small "Stun!" / "Crit!" tags. All screen positions are world pixels.
import Phaser from 'phaser';
import { rangeEllipse } from '../logic/iso.js';
import { splashRing, fireworkBurst, fireballImpact, floatText } from './Effects.js';

const FX_DEPTH = 2700;

/** A jagged lightning bolt through the points (screen), flashing and fading fast. */
export function chainLightningFx(scene, points, lightKey) {
  const g = scene.add.graphics().setDepth(FX_DEPTH + 5).setBlendMode('ADD');
  const bolt = (width, color, alpha, jag) => {
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const segs = 4;
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const off = k === segs ? 0 : Phaser.Math.FloatBetween(-jag, jag);
        g.lineTo(a.x + (b.x - a.x) * t + off, a.y + (b.y - a.y) * t + off * 0.6);
      }
    }
    g.strokePath();
  };
  bolt(7, 0x6a8cff, 0.35, 8);
  bolt(3, 0xbfe0ff, 0.95, 6);
  bolt(1.5, 0xffffff, 1, 3);
  for (const p of points.slice(1)) {
    const spark = scene.add.image(p.x, p.y, lightKey).setBlendMode('ADD').setTint(0x9fc8ff).setDepth(FX_DEPTH + 6).setScale(0.22);
    scene.tweens.add({ targets: spark, scale: 0.05, alpha: 0, duration: 260, onComplete: () => spark.destroy() });
  }
  scene.tweens.add({ targets: g, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
}

/** Arrow Storm: a warning circle, then a volley of arrows streaking down into it as it lands. */
export function arrowStormFx(scene, x, y, radiusTiles, delayMs) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const warn = scene.add.graphics().setDepth(FX_DEPTH - 20).setPosition(x, y);
  warn.lineStyle(2, 0xffe08a, 0.9).strokeEllipse(0, 0, rx * 2, ry * 2);
  warn.fillStyle(0xffe08a, 0.12).fillEllipse(0, 0, rx * 2, ry * 2);
  warn.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: warn, scale: 1, alpha: 1, duration: delayMs * 0.6, ease: 'Cubic.easeOut' });
  const count = 18;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random());
    const tx = x + Math.cos(a) * rx * d, ty = y + Math.sin(a) * ry * d;
    const fall = 220;
    const arrow = scene.add.graphics().setDepth(FX_DEPTH + 2);
    arrow.lineStyle(2, 0x5a3a1a, 1).lineBetween(0, -14, 0, 0);
    arrow.fillStyle(0xd8d8d8, 1).fillTriangle(-3, -2, 3, -2, 0, 4);
    arrow.setPosition(tx - 30, ty - fall).setRotation(-0.13).setAlpha(0);
    const startAt = delayMs * 0.35 + Math.random() * delayMs * 0.55;
    scene.tweens.add({
      targets: arrow, x: tx, y: ty, alpha: 1, delay: startAt, duration: delayMs - startAt, ease: 'Quad.easeIn',
      onComplete: () => scene.tweens.add({ targets: arrow, alpha: 0, duration: 400, delay: 200, onComplete: () => arrow.destroy() })
    });
  }
  scene.time.delayedCall(delayMs, () => {
    splashRing(scene, x, y, radiusTiles, 0xffe08a, { duration: 450, depth: FX_DEPTH + 1 });
    scene.tweens.add({ targets: warn, alpha: 0, duration: 250, onComplete: () => warn.destroy() });
  });
}

/** Meteor: a shadow grows on the ground while a blazing rock falls from the sky; a big fiery impact. */
export function meteorFx(scene, x, y, radiusTiles, delayMs, lightKey) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const shadow = scene.add.ellipse(x, y, rx * 2, ry * 2, 0x000000, 0.28).setDepth(FX_DEPTH - 20).setScale(0.2);
  scene.tweens.add({ targets: shadow, scale: 1, duration: delayMs, ease: 'Quad.easeIn' });
  const rock = scene.add.image(x + 140, y - 420, lightKey).setBlendMode('ADD').setTint(0xff7a1a).setDepth(FX_DEPTH + 10).setScale(0.5);
  const core = scene.add.circle(x + 140, y - 420, 10, 0x4a2a1a, 1).setStrokeStyle(3, 0xffb02e, 1).setDepth(FX_DEPTH + 11);
  const trail = scene.add.particles(0, 0, lightKey, {
    speed: { min: 5, max: 30 }, lifespan: { min: 250, max: 500 }, scale: { start: 0.25, end: 0 }, alpha: { start: 0.9, end: 0 },
    tint: [0xffe08a, 0xff8a1f, 0xff3b1a], blendMode: 'ADD', frequency: 10, quantity: 3
  }).setDepth(FX_DEPTH + 9);
  trail.startFollow(core);
  scene.tweens.add({ targets: [rock, core], x, y: y - 8, duration: delayMs, ease: 'Quad.easeIn' });
  scene.time.delayedCall(delayMs, () => {
    rock.destroy(); core.destroy(); shadow.destroy();
    trail.stopFollow(); trail.stop();
    scene.time.delayedCall(500, () => trail.destroy());
    fireballImpact(scene, x, y, radiusTiles, lightKey);
    splashRing(scene, x, y, radiusTiles, 0xff7a1a, { duration: 600, depth: FX_DEPTH + 1 });
    scene.cameras.main.shake(220, 0.006);
  });
}

/** Solar Flare: the Fire Ring flashes white-gold and a shockwave races out to its edge. */
export function solarFlareFx(scene, x, y, radiusTiles, lightKey) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const flash = scene.add.image(x, y, lightKey).setBlendMode('ADD').setTint(0xfff0b0).setDepth(FX_DEPTH)
    .setDisplaySize(rx * 2.6, ry * 2.6);
  scene.tweens.add({ targets: flash, alpha: 0, duration: 500, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  const ring = scene.add.graphics().setDepth(FX_DEPTH + 1).setPosition(x, y).setScale(0.2);
  ring.lineStyle(6, 0xffd04a, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
  ring.lineStyle(2, 0xffffff, 1).strokeEllipse(0, 0, rx * 1.8, ry * 1.8);
  scene.tweens.add({ targets: ring, scale: 1.05, alpha: 0, duration: 520, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

/** Sparkler pop: a small firework burst. */
export function sparklerFx(scene, x, y, radiusTiles, lightKey) {
  fireworkBurst(scene, x, y - 24, radiusTiles * 0.7, lightKey);
}

/** The Tower of Rah's Fire Ring: a flickering band of flame on the ground (redrawn every frame into g). */
export function drawFireRing(g, x, y, radiusTiles, time, phase = 0) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const f = 1 + 0.05 * Math.sin(time * 0.012 + phase);
  g.fillStyle(0xff5a1a, 0.08).fillEllipse(x, y, rx * 2 * f, ry * 2 * f);
  g.lineStyle(10, 0xff5a1a, 0.22).strokeEllipse(x, y, rx * 2 * f, ry * 2 * f);
  g.lineStyle(4, 0xffa02e, 0.55).strokeEllipse(x, y, rx * 2 * f, ry * 2 * f);
  g.lineStyle(1.5, 0xfff0b0, 0.75).strokeEllipse(x, y, rx * 2 * f, ry * 2 * f);
  // Little flame licks around the edge.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + time * 0.0006;
    const h = 5 + 4 * Math.sin(time * 0.02 + i * 1.7 + phase);
    const px = x + Math.cos(a) * rx * f, py = y + Math.sin(a) * ry * f;
    g.fillStyle(i % 2 ? 0xffb02e : 0xff6a1a, 0.7).fillTriangle(px - 3, py, px + 3, py, px, py - h);
  }
}

/** A short tag over an enemy ("Stun!", "Crit!"). */
export function tagText(scene, x, y, text, color) {
  floatText(scene, x, y, text, color, 13);
}
