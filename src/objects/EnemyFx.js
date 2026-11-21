// Visuals for the v0.6 enemies, in the same style as AbilityFx.js / Effects.js (graphics only). (The KSI Tower's
// bottle and frost burst are in Effects.js: attachFrostFx / frostImpact.)
//   missileWarningFx - Big Yahu's missile target: a red version of Arrow Storm's warning circle, pulsing, with a
//                      crosshair, shown until it lands.
//   quakeFx          - Brr Brr Patapim's earthquake: cracks running out across the ground and a dust ring.
import { rangeEllipse } from '../logic/iso.js';
import { splashRing } from './Effects.js';
import { isLowQuality } from '../quality.js';

const FX_DEPTH = 2700;
export const MISSILE_RED = 0xff3b3b;
export const ICE_BLUE = 0x8fd8ff;

/** Big Yahu's missile target at (x, y): it grows in, pulses red until the missile lands (delayMs), then fades. */
export function missileWarningFx(scene, x, y, radiusTiles, delayMs) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const warn = scene.add.graphics().setDepth(FX_DEPTH - 20).setPosition(x, y);
  const draw = (k) => {
    warn.clear();
    warn.fillStyle(MISSILE_RED, 0.12 + 0.1 * k).fillEllipse(0, 0, rx * 2, ry * 2);
    warn.lineStyle(3, 0x000000, 0.35).strokeEllipse(0, 1, rx * 2, ry * 2);
    warn.lineStyle(2.5, MISSILE_RED, 0.95).strokeEllipse(0, 0, rx * 2, ry * 2);
    warn.lineStyle(2, MISSILE_RED, 0.6 + 0.4 * k).strokeEllipse(0, 0, rx, ry);
    // Crosshair over the spot.
    warn.lineStyle(2, 0xffffff, 0.85).lineBetween(-rx * 0.35, 0, rx * 0.35, 0).lineBetween(0, -ry * 0.35, 0, ry * 0.35);
  };
  draw(0);
  warn.setScale(0.4).setAlpha(0);
  scene.tweens.add({ targets: warn, scale: 1, alpha: 1, duration: Math.min(300, delayMs * 0.3), ease: 'Cubic.easeOut' });
  const pulse = { k: 0 };
  const tw = scene.tweens.add({ targets: pulse, k: 1, duration: 260, yoyo: true, repeat: -1, onUpdate: () => draw(pulse.k) });
  scene.time.delayedCall(delayMs, () => {
    tw.stop();
    scene.tweens.add({ targets: warn, alpha: 0, duration: 200, onComplete: () => warn.destroy() });
  });
  return warn;
}

/** Brr Brr Patapim's earthquake at (x, y): jagged cracks out to the radius, then a dust ring; they fade. */
export function quakeFx(scene, x, y, radiusTiles) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  splashRing(scene, x, y, radiusTiles, 0xb08a5a, { duration: 600, depth: FX_DEPTH + 10 });
  splashRing(scene, x, y, radiusTiles * 0.55, 0x8f673d, { duration: 420, depth: FX_DEPTH + 10 });
  const g = scene.add.graphics().setDepth(FX_DEPTH - 30).setPosition(x, y);
  const cracks = isLowQuality() ? 5 : 8;
  const a0 = Math.random() * Math.PI * 2;
  for (let i = 0; i < cracks; i++) {
    const a = a0 + (i / cracks) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    let px = 0, py = 0;
    const pts = [{ x: 0, y: 0 }];
    const steps = 4;
    for (let k = 1; k <= steps; k++) {
      const d = (k / steps) * (0.75 + Math.random() * 0.25);
      const j = (Math.random() - 0.5) * 0.5;
      px = Math.cos(a + j) * rx * d; py = Math.sin(a + j) * ry * d;
      pts.push({ x: px, y: py });
    }
    g.lineStyle(4, 0x2a1a0e, 0.55).strokePoints(pts, false);
    g.lineStyle(2, 0x5a3a1e, 0.9).strokePoints(pts, false);
  }
  g.setScale(0.3);
  scene.tweens.add({ targets: g, scale: 1, duration: 160, ease: 'Cubic.easeOut' });
  scene.tweens.add({ targets: g, alpha: 0, delay: 900, duration: 600, onComplete: () => g.destroy() });
}

