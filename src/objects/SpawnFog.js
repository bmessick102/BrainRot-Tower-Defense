// Spawn fog (GameScene, world space): a soft bank of drifting cloud puffs over the back end of every dirt path,
// where enemies can come onto the map, always on (all four, whichever corners the next wave uses: the wave
// markers show those). It's part of the map: it pans and zooms with it, draws over the ground, buildings and
// enemies there but under the wave markers (WaveMarkers) and the HUD (UIScene), and thins out a little at
// night. A few big sprites of the pre-rendered puff texture (TEX.fog, drawn in BootScene) per path; per frame
// only a tint / alpha check against the time of day.
import Phaser from 'phaser';
import { TEX } from '../assetKeys.js';
import { pathEnds } from '../logic/waveMarkers.js';
import { PATHS } from '../logic/waves.js';
import { isLowQuality, onQualityChange } from '../quality.js';

const DEPTH = 5400; // over buildings and enemies (up to 5000), under the wave markers (5500)
export const SPAWN_FOG = {
  color: 0xe4ecf2,
  alpha: 0.65,          // a puff's strongest alpha
  nightFade: 0.4,       // share of the alpha lost at full night (a pale bank would glow on the dark map)
  fadeInMs: 1200,       // fades in as the village opens
  // Puffs along the map's edge at the path's back end: [along the path inward (world px), across it, scale].
  // The puff texture is 256 px with soft edges, so a scale-2.4 puff reaches ~260 px from its center.
  puffs: [[10, 0, 2.6], [-10, -190, 2.2], [-10, 190, 2.2], [90, -60, 1.7], [90, 80, 1.6]],
  drift: [20, 45],
  period: [7000, 11000],
  lowQualityPuffs: 1    // low graphics quality (quality.js): only the first (biggest) puffs of each path show
};

export class SpawnFog {
  constructor(scene) {
    this.scene = scene;
    this.puffs = [];
    this.tint = null;
    this.level = { v: 0 };
    this.c = scene.add.container(0, 0).setDepth(DEPTH).setAlpha(0);
    if (!scene.textures.exists(TEX.fog)) return;
    const R = Phaser.Math;
    for (const path of PATHS) {
      const ends = pathEnds(path);
      if (!ends) continue;
      const { entrance: a, edge: b } = ends;
      const len = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const ux = (a.x - b.x) / len, uy = (a.y - b.y) / len; // in along the path
      SPAWN_FOG.puffs.forEach(([along, across, scale], i) => {
        const x = b.x + ux * along - uy * across, y = b.y + uy * along + ux * across;
        const alpha = SPAWN_FOG.alpha * (1 - i * 0.12);
        const puff = scene.add.image(x, y, TEX.fog).setScale(scale).setAlpha(alpha).setRotation(R.FloatBetween(0, Math.PI * 2));
        // Slow drift along the edge and a little in and out, swelling and thinning as it goes.
        const side = R.FloatBetween(-1, 1), d = R.Between(SPAWN_FOG.drift[0], SPAWN_FOG.drift[1]);
        scene.tweens.add({
          targets: puff,
          x: x - uy * d * side + ux * d * 0.4,
          y: y + ux * d * side + uy * d * 0.4,
          scale: scale * 1.1,
          alpha: alpha * 0.75,
          rotation: puff.rotation + R.FloatBetween(-0.25, 0.25),
          duration: R.Between(SPAWN_FOG.period[0], SPAWN_FOG.period[1]),
          delay: R.Between(0, 3000),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
        puff.fogIndex = i;
        this.puffs.push(puff);
      });
    }
    this.c.add(this.puffs);
    this.applyQuality(isLowQuality());
    this.offQuality = onQualityChange((low) => this.applyQuality(low));
    scene.events.once('shutdown', () => this.destroy());
    scene.tweens.add({ targets: this.level, v: 1, duration: SPAWN_FOG.fadeInMs, ease: 'Sine.easeInOut' });
  }

  /** Every frame: the fade-in, and the time of day (moonlit tint, thinner at night). */
  update() {
    const s = this.scene;
    const tint = s.ambientTint ?? 0xffffff;
    if (tint !== this.tint) {
      this.tint = tint;
      const col = multiply(SPAWN_FOG.color, tint);
      for (const p of this.puffs) p.setTint(col);
    }
    this.c.setAlpha(this.level.v * (1 - SPAWN_FOG.nightFade * (s.night || 0)));
  }

  /** Low graphics quality: fewer, so less of the screen is drawn over several times (the puffs are big). */
  applyQuality(low) {
    for (const p of this.puffs) p.setVisible(!low || p.fogIndex < SPAWN_FOG.lowQualityPuffs);
  }

  destroy() {
    if (this.offQuality) { this.offQuality(); this.offQuality = null; }
    if (this.c.scene) this.c.destroy();
    this.puffs = [];
  }
}

/** Multiply two 0xRRGGBB colors (a tint over a tint). */
function multiply(a, b) {
  const ch = (shift) => Math.round((((a >> shift) & 255) * ((b >> shift) & 255)) / 255);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
