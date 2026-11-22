// Short-lived visual feedback: floating numbers/labels and splash rings.
import { rangeEllipse } from '../logic/iso.js';
import { textStyle, RP_TEXT_COLOR } from '../theme.js';
import { isLowQuality } from '../quality.js';
import { TEX } from '../assetKeys.js';
import { fitIcon } from './uiDraw.js';

// Floating texts on screen at once (per scene). Past it, small ones (damage numbers, bounties: size under
// FLOAT_KEEP_SIZE) are skipped; call-outs like "LAST STAND!" always show. Finished texts are kept and reused.
export const FLOAT_MAX = { high: 40, low: 14 };
const FLOAT_KEEP_SIZE = 18;

function floatPool(scene) {
  if (!scene.floatPool) {
    scene.floatPool = { live: 0, free: [] };
    scene.events.once('shutdown', () => { scene.floatPool = null; });
  }
  return scene.floatPool;
}

/** Text that rises and fades (damage numbers, "+3" gold). Returns the text, or null when skipped (too many). */
export function floatText(scene, x, y, text, color = '#ffffff', size = 16) {
  const pool = floatPool(scene);
  if (size < FLOAT_KEEP_SIZE && pool.live >= (isLowQuality() ? FLOAT_MAX.low : FLOAT_MAX.high)) return null;
  let t = pool.free.pop();
  while (t && !t.scene) t = pool.free.pop(); // (destroyed with something else)
  if (t) t.setStyle(textStyle(size, color)).setText(text).setPosition(x, y).setAlpha(1).setVisible(true);
  else t = scene.add.text(x, y, text, textStyle(size, color)).setOrigin(0.5, 1).setDepth(6000);
  pool.live++;
  scene.tweens.add({
    targets: t,
    y: y - 34,
    alpha: 0,
    duration: 800,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      if (scene.floatPool !== pool) { t.destroy(); return; }
      pool.live--;
      t.setVisible(false);
      pool.free.push(t);
    }
  });
  return t;
}

/** "+3" Burgers (research points) rising beside a kill's gold, with a small burger icon after the number. */
export function rpGainText(scene, x, y, n) {
  const t = floatText(scene, x, y, `+${n}`, RP_TEXT_COLOR, 13);
  if (!t || !scene.textures.exists(TEX.researchPoint)) return t;
  const pool = floatPool(scene);
  pool.icons = pool.icons || [];
  let img = pool.icons.pop();
  while (img && !img.scene) img = pool.icons.pop();
  if (!img) img = scene.add.image(0, 0, TEX.researchPoint).setOrigin(0, 1).setDepth(6000);
  fitIcon(img, 15).setPosition(x + t.width / 2 + 2, y).setAlpha(1).setVisible(true);
  scene.tweens.add({
    targets: img, y: y - 34, alpha: 0, duration: 800, ease: 'Cubic.easeOut',
    onComplete: () => {
      if (scene.floatPool !== pool) { img.destroy(); return; }
      img.setVisible(false);
      pool.icons.push(img);
    }
  });
  return t;
}

// ---------- Wizard fireball ----------
// Fire palette for sparks and glows (hot white -> gold -> orange -> magic purple).
export const FIRE_COLORS = [0xfff4c2, 0xffd04a, 0xff8a1f, 0xff5a1f, 0xc054ff];
const FX_DEPTH = 2700; // above buildings and enemies, below UI-ish overlays

/**
 * Glow, hot core, and spark trail that ride along with a fireball sprite.
 * Returns { update(x, y, depth, time), destroy() }; the trail is left to fade out on destroy.
 */
export function attachFireballFx(scene, sprite, lightKey) {
  // Bright outline on the fireball art itself (WebGL only).
  if (sprite.preFX) {
    sprite.preFX.padding = 12;
    sprite.preFX.addGlow(0xffb347, 6, 1, false, 0.1, 14);
  }
  const halo = scene.add.image(0, 0, lightKey).setBlendMode('ADD').setTint(0xff8a2a);
  const core = scene.add.image(0, 0, lightKey).setBlendMode('ADD').setTint(0xfff4c2);
  const trail = scene.add.particles(0, 0, lightKey, {
    speed: { min: 6, max: 30 },
    lifespan: { min: 260, max: 460 },
    scale: { start: 0.11, end: 0 },
    alpha: { start: 0.95, end: 0 },
    tint: FIRE_COLORS,
    blendMode: 'ADD',
    frequency: 14,
    quantity: 2
  });
  trail.startFollow(sprite);
  const phase = Math.random() * Math.PI * 2;
  return {
    update(x, y, depth, time) {
      const pulse = 1 + 0.18 * Math.sin(time * 0.03 + phase);
      halo.setPosition(x, y).setScale(0.42 * pulse).setAlpha(0.85).setDepth(depth - 0.2);
      core.setPosition(x, y).setScale(0.16 * pulse).setAlpha(1).setDepth(depth + 0.1);
      trail.setDepth(depth - 0.3);
    },
    destroy() {
      halo.destroy();
      core.destroy();
      trail.stopFollow();
      trail.stop();
      scene.time.delayedCall(500, () => trail.destroy());
    }
  };
}

/** Fireball landing: white-hot flash, spark burst, rising embers, and a purple shockwave ring. */
export function fireballImpact(scene, x, y, radiusTiles, lightKey) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  // Flash: a bright additive bloom the size of the splash that fades fast.
  const flash = scene.add.image(x, y, lightKey).setBlendMode('ADD').setTint(0xffe2a0).setDepth(FX_DEPTH)
    .setDisplaySize(rx * 2.4, ry * 2.4).setAlpha(1);
  scene.tweens.add({ targets: flash, alpha: 0, scaleX: flash.scaleX * 1.4, scaleY: flash.scaleY * 1.4, duration: 320, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  const core = scene.add.image(x, y - 6, lightKey).setBlendMode('ADD').setTint(0xffffff).setDepth(FX_DEPTH + 1).setScale(0.35);
  scene.tweens.add({ targets: core, alpha: 0, scale: 0.6, duration: 220, onComplete: () => core.destroy() });

  // Spark burst flying out in every direction.
  const burst = scene.add.particles(x, y - 6, lightKey, {
    speed: { min: 70, max: 220 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 300, max: 650 },
    scale: { start: 0.13, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: FIRE_COLORS,
    blendMode: 'ADD',
    gravityY: 120,
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  burst.explode(28);
  // Embers drifting up afterward.
  const embers = scene.add.particles(x, y, lightKey, {
    x: { min: -rx * 0.6, max: rx * 0.6 },
    y: { min: -ry * 0.6, max: ry * 0.6 },
    speedY: { min: -60, max: -25 },
    speedX: { min: -12, max: 12 },
    lifespan: { min: 600, max: 1100 },
    scale: { start: 0.07, end: 0 },
    alpha: { start: 0.9, end: 0 },
    tint: [0xffd04a, 0xff8a1f, 0xc054ff],
    blendMode: 'ADD',
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  embers.explode(14);
  scene.time.delayedCall(1300, () => { burst.destroy(); embers.destroy(); });

  // Shockwave: a purple ring racing out to the splash radius.
  const ring = scene.add.graphics().setDepth(FX_DEPTH - 1).setPosition(x, y).setScale(0.3);
  ring.lineStyle(5, 0xc054ff, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
  ring.lineStyle(2, 0xffe2a0, 1).strokeEllipse(0, 0, rx * 1.7, ry * 1.7);
  ring.fillStyle(0xff8a1f, 0.25).fillEllipse(0, 0, rx * 2, ry * 2);
  scene.tweens.add({ targets: ring, scale: 1.15, alpha: 0, duration: 420, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}

// ---------- KSI Tower bottle (v0.6.3: ice effects in the style of the Gandolf fireball) ----------
// Ice palette for sparkles and glows (white -> pale ice -> ice blue -> deep blue).
export const ICE_COLORS = [0xffffff, 0xe4f8ff, 0xa8e6ff, 0x6fd0ff, 0x3d9bff];

/**
 * An icy glow, a frosty halo with a bright core, and a trail of ice sparkles and snow that ride along with a KSI
 * Tower bottle. Same interface as attachFireballFx.
 */
export function attachFrostFx(scene, sprite, lightKey) {
  if (sprite.preFX) {
    sprite.preFX.padding = 10;
    sprite.preFX.addGlow(0x9fe6ff, 5, 1, false, 0.1, 12);
  }
  const halo = scene.add.image(0, 0, lightKey).setBlendMode('ADD').setTint(0x5cc8ff);
  const core = scene.add.image(0, 0, lightKey).setBlendMode('ADD').setTint(0xeafaff);
  const trail = scene.add.particles(0, 0, lightKey, {
    speed: { min: 4, max: 24 },
    lifespan: { min: 300, max: 560 },
    scale: { start: 0.1, end: 0 },
    alpha: { start: 0.95, end: 0 },
    tint: ICE_COLORS,
    blendMode: 'ADD',
    gravityY: 30, // the frost settles a little as it trails
    frequency: 14,
    quantity: 2
  });
  trail.startFollow(sprite);
  const phase = Math.random() * Math.PI * 2;
  return {
    update(x, y, depth, time) {
      const pulse = 1 + 0.15 * Math.sin(time * 0.025 + phase);
      halo.setPosition(x, y).setScale(0.36 * pulse).setAlpha(0.75).setDepth(depth - 0.2);
      core.setPosition(x, y).setScale(0.13 * pulse).setAlpha(0.95).setDepth(depth + 0.1);
      trail.setDepth(depth - 0.3);
    },
    destroy() {
      halo.destroy();
      core.destroy();
      trail.stopFollow();
      trail.stop();
      scene.time.delayedCall(600, () => trail.destroy());
    }
  };
}

/** A six-armed snowflake drawn in white (the frost burst's flakes). */
function snowflake(scene, x, y, size, depth) {
  const f = scene.add.graphics().setDepth(depth).setPosition(x, y);
  f.lineStyle(1.6, 0xffffff, 1);
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI) / 3, c = Math.cos(a) * size, s = Math.sin(a) * size;
    f.lineBetween(-c, -s, c, s);
    // little side twigs near each tip
    for (const sign of [-1, 1]) {
      const tx = c * 0.6 * sign, ty = s * 0.6 * sign, b = a + Math.PI / 2;
      f.lineBetween(tx, ty, tx + (Math.cos(a) * sign * 0.3 + Math.cos(b) * 0.3) * size, ty + (Math.sin(a) * sign * 0.3 + Math.sin(b) * 0.3) * size);
    }
  }
  return f;
}

/**
 * A KSI Tower bottle bursting: a cold white flash, ice shards flying out, frost mist and snowflakes drifting down,
 * and an ice-blue shockwave ring racing to the splash radius (the Gandolf fireball's impact, in ice).
 */
export function frostImpact(scene, x, y, radiusTiles, lightKey) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const flash = scene.add.image(x, y, lightKey).setBlendMode('ADD').setTint(0xcff2ff).setDepth(FX_DEPTH)
    .setDisplaySize(rx * 2.3, ry * 2.3).setAlpha(1);
  scene.tweens.add({ targets: flash, alpha: 0, scaleX: flash.scaleX * 1.35, scaleY: flash.scaleY * 1.35, duration: 340, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  const core = scene.add.image(x, y - 6, lightKey).setBlendMode('ADD').setTint(0xffffff).setDepth(FX_DEPTH + 1).setScale(0.3);
  scene.tweens.add({ targets: core, alpha: 0, scale: 0.55, duration: 240, onComplete: () => core.destroy() });

  // Ice shards bursting out and falling.
  const shards = scene.add.particles(x, y - 6, lightKey, {
    speed: { min: 60, max: 200 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 320, max: 680 },
    scale: { start: 0.12, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: ICE_COLORS,
    blendMode: 'ADD',
    gravityY: 160,
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  shards.explode(26);
  // Frost mist hanging over the splash, drifting slowly down.
  const mist = scene.add.particles(x, y, lightKey, {
    x: { min: -rx * 0.7, max: rx * 0.7 },
    y: { min: -ry * 0.7, max: ry * 0.5 },
    speedY: { min: 4, max: 18 },
    speedX: { min: -10, max: 10 },
    lifespan: { min: 700, max: 1200 },
    scale: { start: 0.09, end: 0.02 },
    alpha: { start: 0.7, end: 0 },
    tint: [0xffffff, 0xd8f4ff, 0x9fe0ff],
    blendMode: 'ADD',
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  mist.explode(14);
  scene.time.delayedCall(1400, () => { shards.destroy(); mist.destroy(); });

  // Shockwave: an ice-blue ring with a white inner rim and a frosty fill.
  const ring = scene.add.graphics().setDepth(FX_DEPTH - 1).setPosition(x, y).setScale(0.3);
  ring.lineStyle(5, 0x5cc8ff, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
  ring.lineStyle(2, 0xffffff, 1).strokeEllipse(0, 0, rx * 1.7, ry * 1.7);
  ring.fillStyle(0xa8e6ff, 0.28).fillEllipse(0, 0, rx * 2, ry * 2);
  scene.tweens.add({ targets: ring, scale: 1.15, alpha: 0, duration: 440, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });

  // Snowflakes spinning out and drifting down (not in low graphics quality).
  if (isLowQuality()) return;
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2, d = 0.35 + Math.random() * 0.65;
    const f = snowflake(scene, x, y - 8, 3.5 + Math.random() * 2, FX_DEPTH + 3);
    scene.tweens.add({
      targets: f, x: x + Math.cos(a) * rx * d, y: y - 8 + Math.sin(a) * ry * d + 6, alpha: 0, rotation: (Math.random() - 0.5) * 4,
      duration: 700 + Math.random() * 300, ease: 'Cubic.easeOut', onComplete: () => f.destroy()
    });
  }
}

// ---------- Bombombini Gusini's fire breath (v0.7) ----------
/**
 * A stream of fire from `from` (its beak) to `to` (the target), a burst on the target and small flames on the
 * buildings right next to it (`splash`: screen points). All in screen coordinates.
 */
export function fireBreathFx(scene, from, to, splash, lightKey) {
  const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
  const angle = Phaser_angle(dx, dy);
  const life = 260;
  const stream = scene.add.particles(from.x, from.y, lightKey, {
    speed: { min: dist / (life / 1000) * 0.85, max: dist / (life / 1000) * 1.05 },
    angle: { min: angle - 7, max: angle + 7 },
    lifespan: life,
    scale: { start: 0.07, end: 0.2 },
    alpha: { start: 1, end: 0.15 },
    tint: FIRE_COLORS,
    blendMode: 'ADD',
    frequency: 12,
    quantity: 3
  }).setDepth(FX_DEPTH + 2);
  scene.time.delayedCall(240, () => stream.stop());
  scene.time.delayedCall(240 + life + 60, () => stream.destroy());
  const burst = (p, size, delay) => scene.time.delayedCall(delay, () => {
    const f = scene.add.image(p.x, p.y, lightKey).setBlendMode('ADD').setTint(0xff8a2a).setDepth(FX_DEPTH + 1).setScale(size);
    scene.tweens.add({ targets: f, scale: size * 1.8, alpha: 0, duration: 360, ease: 'Cubic.easeOut', onComplete: () => f.destroy() });
    const sparks = scene.add.particles(p.x, p.y, lightKey, {
      speed: { min: 30, max: 110 }, angle: { min: 200, max: 340 }, lifespan: { min: 260, max: 520 },
      scale: { start: 0.08, end: 0 }, alpha: { start: 1, end: 0 }, tint: FIRE_COLORS, blendMode: 'ADD', gravityY: 90, emitting: false
    }).setDepth(FX_DEPTH + 2);
    sparks.explode(Math.round(10 * size / 0.3));
    scene.time.delayedCall(700, () => sparks.destroy());
  });
  burst(to, 0.32, 200);
  for (const p of splash) burst(p, 0.18, 260);
}
const Phaser_angle = (dx, dy) => (Math.atan2(dy, dx) * 180) / Math.PI;

// ---------- Firework rocket ----------
export const FIREWORK_COLORS = [0xff3b5c, 0xffd23f, 0x3df5a7, 0x4cc9ff, 0xb46bff, 0xffffff];

/** A rocket's glow and crackling spark trail. Same interface as attachFireballFx. `k`: size (a Missile Silo's bigger rockets). */
export function attachRocketFx(scene, sprite, lightKey, k = 1) {
  if (sprite.preFX) {
    sprite.preFX.padding = 8;
    sprite.preFX.addGlow(0xffd23f, 4, 0, false, 0.1, 10);
  }
  const glow = scene.add.image(0, 0, lightKey).setBlendMode('ADD').setTint(0xffb03c);
  const trail = scene.add.particles(0, 0, lightKey, {
    speed: { min: 4, max: 22 },
    lifespan: { min: 220, max: 420 },
    scale: { start: 0.08 * k, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: [0xfff4c2, 0xffd23f, 0xff8a1f, 0xff3b5c],
    blendMode: 'ADD',
    gravityY: 40,
    frequency: 12,
    quantity: 2
  });
  trail.startFollow(sprite);
  return {
    update(x, y, depth, time) {
      glow.setPosition(x, y).setScale((0.16 + 0.03 * Math.sin(time * 0.05)) * k).setAlpha(0.9).setDepth(depth - 0.2);
      trail.setDepth(depth - 0.3);
    },
    destroy() {
      glow.destroy();
      trail.stopFollow();
      trail.stop();
      scene.time.delayedCall(450, () => trail.destroy());
    }
  };
}

/** Firework burst in the air: a flash, then colored stars that shower down. (x, y) = the burst point on screen. */
export function fireworkBurst(scene, x, y, radiusTiles, lightKey) {
  const { rx } = rangeEllipse(radiusTiles);
  const flash = scene.add.image(x, y, lightKey).setBlendMode('ADD').setTint(0xffffff).setDepth(FX_DEPTH + 1).setScale(0.3);
  scene.tweens.add({ targets: flash, scale: 0.75, alpha: 0, duration: 260, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });
  // Two colors per burst, like a real shell.
  const pick = () => FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
  const colors = [pick(), pick(), 0xffffff];
  const stars = scene.add.particles(x, y, lightKey, {
    speed: { min: rx * 1.4, max: rx * 2.4 },
    angle: { min: 0, max: 360 },
    lifespan: { min: 650, max: 1100 },
    scale: { start: 0.09, end: 0.02 },
    alpha: { start: 1, end: 0 },
    tint: colors,
    blendMode: 'ADD',
    gravityY: 70,
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  stars.explode(36);
  // A few slow, glittering sparks that hang a moment longer.
  const glitter = scene.add.particles(x, y, lightKey, {
    speed: { min: 10, max: rx },
    angle: { min: 0, max: 360 },
    lifespan: { min: 900, max: 1400 },
    scale: { start: 0.05, end: 0 },
    alpha: { start: 1, end: 0 },
    tint: [0xffffff, 0xffe9a0],
    blendMode: 'ADD',
    gravityY: 30,
    emitting: false
  }).setDepth(FX_DEPTH + 2);
  glitter.explode(14);
  scene.time.delayedCall(1500, () => { stars.destroy(); glitter.destroy(); });
}

/** A ring the size of a splash radius (tiles) at a world point, fading over `duration` ms (0.3 s by default). */
export function splashRing(scene, x, y, radiusTiles, color = 0xffe08a, { duration = 300, depth = 2600 } = {}) {
  const { rx, ry } = rangeEllipse(radiusTiles);
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(3, color, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
  g.fillStyle(color, 0.18).fillEllipse(0, 0, rx * 2, ry * 2);
  g.setPosition(x, y).setScale(0.6);
  scene.tweens.add({ targets: g, scale: 1, alpha: 0, duration, onComplete: () => g.destroy() });
  return g;
}

// ---------- Wall Breaker blast ----------
const BLAST_FIRE = [0xffffff, 0xfff1a8, 0xffc23a, 0xff7a1a, 0xe2401c];
const DEBRIS_COLORS = [0x6b4a2f, 0x8a6a46, 0x4a3a2e, 0x9a9a9a, 0x5c5c5c];
const SMOKE_COLORS = [0x3a3430, 0x4d4640, 0x625a52];

/** A small square chunk texture for debris (made once, on first use). */
function chunkTexture(scene) {
  const key = 'fx_chunk';
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1).fillRect(1, 2, 7, 5).fillRect(3, 1, 4, 7);
    g.generateTexture(key, 9, 9);
    g.destroy();
  }
  return key;
}

/**
 * Big cartoon boom for a Wall Breaker: white flash, a billowing fireball, dirt and stone chunks
 * thrown out, a shockwave ring, rolling smoke, and a scorch mark left on the ground that fades.
 * (x, y) is the ground point; radiusTiles is the blast radius.
 */
export function breakerExplosion(scene, x, y, radiusTiles, lightKey) {
  const { rx, ry } = rangeEllipse(radiusTiles);

  // Scorch mark on the ground (under buildings and enemies), fading after a few seconds.
  const scorch = scene.add.graphics().setDepth(-4150).setPosition(x, y);
  scorch.fillStyle(0x1a1410, 0.45).fillEllipse(0, 0, rx * 1.3, ry * 1.3);
  scorch.fillStyle(0x0d0a08, 0.5).fillEllipse(0, 0, rx * 0.75, ry * 0.75);
  scene.tweens.add({ targets: scorch, alpha: 0, delay: 2600, duration: 1600, onComplete: () => scorch.destroy() });

  // White-hot flash.
  const flash = scene.add.image(x, y - 10, lightKey).setBlendMode('ADD').setTint(0xfff6d8).setDepth(FX_DEPTH + 4)
    .setDisplaySize(rx * 3, ry * 3.4);
  scene.tweens.add({ targets: flash, alpha: 0, scaleX: flash.scaleX * 1.3, scaleY: flash.scaleY * 1.3, duration: 260, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });

  // Fireball: overlapping balls of fire that swell, rise and burn out into the smoke.
  const balls = 7;
  for (let i = 0; i < balls; i++) {
    const a = (i / balls) * Math.PI * 2 + Math.random() * 0.6;
    const d = i === 0 ? 0 : 0.35 + Math.random() * 0.3;
    const bx = x + Math.cos(a) * rx * d * 0.6, by = y - 18 + Math.sin(a) * ry * d * 0.6;
    const size = rx * (i === 0 ? 0.9 : 0.55 + Math.random() * 0.25);
    const ball = scene.add.image(bx, by, lightKey).setBlendMode('ADD').setDepth(FX_DEPTH + 1 + (i % 2))
      .setTint(BLAST_FIRE[1 + (i % 3)]).setDisplaySize(size * 0.4, size * 0.4);
    const s = ball.scaleX;
    scene.tweens.add({
      targets: ball, scale: s * 2.6, y: by - 26 - Math.random() * 16, alpha: 0,
      delay: i * 22, duration: 520 + Math.random() * 220, ease: 'Quad.easeOut', onComplete: () => ball.destroy()
    });
  }

  // Sparks.
  const sparks = scene.add.particles(x, y - 14, lightKey, {
    speed: { min: 120, max: 320 }, angle: { min: 0, max: 360 },
    lifespan: { min: 260, max: 560 }, scale: { start: 0.12, end: 0 }, alpha: { start: 1, end: 0 },
    tint: BLAST_FIRE, blendMode: 'ADD', gravityY: 200, emitting: false
  }).setDepth(FX_DEPTH + 3);
  sparks.explode(34);

  // Debris: dirt and stone chunks thrown up and out, tumbling back down.
  const debris = scene.add.particles(x, y - 8, chunkTexture(scene), {
    speed: { min: 110, max: 280 }, angle: { min: 200, max: 340 },
    lifespan: { min: 650, max: 1000 }, scale: { min: 0.6, max: 1.4 }, rotate: { start: 0, end: 540 },
    alpha: { start: 1, end: 0.2 }, tint: DEBRIS_COLORS, gravityY: 620, emitting: false
  }).setDepth(FX_DEPTH + 2);
  debris.explode(26);

  // Rolling smoke that lingers after the fire is gone.
  const smoke = scene.add.particles(x, y - 20, lightKey, {
    x: { min: -rx * 0.45, max: rx * 0.45 }, y: { min: -ry * 0.4, max: ry * 0.3 },
    speedY: { min: -46, max: -18 }, speedX: { min: -26, max: 26 },
    lifespan: { min: 1100, max: 1800 }, scale: { start: 0.22, end: 0.6 }, alpha: { start: 0.55, end: 0 },
    tint: SMOKE_COLORS, emitting: false
  }).setDepth(FX_DEPTH);
  scene.time.delayedCall(140, () => smoke.explode(18));
  scene.time.delayedCall(2100, () => { sparks.destroy(); debris.destroy(); smoke.destroy(); });

  // Shockwave: an orange ring racing out to the blast radius.
  const ring = scene.add.graphics().setDepth(FX_DEPTH - 1).setPosition(x, y).setScale(0.25);
  ring.lineStyle(6, 0xff7a1a, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
  ring.lineStyle(2, 0xfff1a8, 1).strokeEllipse(0, 0, rx * 1.8, ry * 1.8);
  ring.fillStyle(0xffa23a, 0.22).fillEllipse(0, 0, rx * 2, ry * 2);
  scene.tweens.add({ targets: ring, scale: 1.1, alpha: 0, duration: 480, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
}
