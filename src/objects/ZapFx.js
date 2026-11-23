// F.L.O.C.K Mothership's Triple Zap (src/logic/flockZap.js), drawn like a tesla coil (v0.8.5): each zap is a straight
// beam of electricity from the tower's emitter to its target, redrawn every frame while it lasts (LIFE_MS):
//   - a wide blue glow, a blue beam and a bright white core, all straight from emitter to target;
//   - crackle: thin arcs hugging the beam, re-randomized every frame so it flickers like real electricity;
//   - a spark burst on the target and a glowing orb on the emitter while the tower is firing.
// The beam follows a moving target (its sprite's body) and fades out over its last FADE share. GameScene feeds it the
// 'flockZap' events (add). Low graphics quality (src/quality.js): the beam only (no crackle, sparks or orb).
import { gridToScreen } from '../logic/iso.js';
import { isLowQuality } from '../quality.js';

export const LIFE_MS = 350;      // how long one zap's beam shows
const FADE = 0.45;               // the last share of it fades out
const GLOW = 0x2a7bff, BEAM = 0x58c6ff, CRACKLE = 0xbfe9ff, CORE = 0xffffff;
const CRACKLE_ARCS = 2;          // thin arcs around the beam
const CRACKLE_AMP = 5;           // px they stray from the beam (at most)
const SEG_PX = 14;               // px between their kinks
const EMITTER_DROP = 10;         // px below the top of the tower picture: where the electricity leaves it

export class ZapFx {
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(2705); // over walkers, under the float texts and the HUD
    this.zaps = [];
  }

  /** A 'flockZap' event: { sourceId, hits: [{ id, x, y }] } (x, y: where each target was, in tiles). */
  add(d, now = this.scene.time.now) {
    for (const h of d.hits || []) this.zaps.push({ sourceId: d.sourceId, targetId: h.id, x: h.x, y: h.y, born: now });
  }

  /** The emitter (screen px) of tower `id`, or null when it isn't drawn. */
  emitter(id) {
    const v = this.scene.views.buildings.get(id);
    if (!v || !v.sprite) return null;
    const t = v.topCenter();
    return { x: t.x, y: t.y + EMITTER_DROP };
  }

  /** Where a zap hits (screen px): the target's body while it's drawn, else where it was. */
  target(z) {
    const ev = this.scene.views.enemies.get(z.targetId);
    if (ev && ev.sprite && ev.sprite.visible !== false) {
      const s = ev.sprite;
      z.last = { x: s.x, y: s.y - s.displayHeight * 0.5 };
    }
    return z.last || gridToScreen(z.x, z.y);
  }

  update(time) {
    const g = this.g;
    g.clear();
    if (!this.zaps.length) return;
    this.zaps = this.zaps.filter((z) => time - z.born < LIFE_MS);
    const low = isLowQuality();
    const firing = new Map(); // emitter -> strongest alpha (for its orb)
    for (const z of this.zaps) {
      const from = this.emitter(z.sourceId);
      if (!from) continue;
      const to = this.target(z);
      const age = (time - z.born) / LIFE_MS;
      const a = age < 1 - FADE ? 1 : Math.max(0, (1 - age) / FADE);
      this.beam(g, from, to, a, low);
      if (!low) {
        this.sparks(g, to, a);
        const key = `${Math.round(from.x)},${Math.round(from.y)}`;
        firing.set(key, { ...from, a: Math.max(a, (firing.get(key) || {}).a || 0) });
      }
    }
    for (const e of firing.values()) {
      const r = 7 + Math.random() * 2.5;
      g.fillStyle(BEAM, 0.35 * e.a).fillCircle(e.x, e.y, r * 2);
      g.fillStyle(CRACKLE, 0.8 * e.a).fillCircle(e.x, e.y, r);
      g.fillStyle(CORE, e.a).fillCircle(e.x, e.y, r * 0.5);
    }
  }

  /** The straight beam, and (unless low quality) its crackle. */
  beam(g, from, to, a, low) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (len < 1) return;
    g.lineStyle(14, GLOW, 0.28 * a).lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(6, BEAM, 0.85 * a).lineBetween(from.x, from.y, to.x, to.y);
    g.lineStyle(2.5, CORE, a).lineBetween(from.x, from.y, to.x, to.y);
    if (low) return;
    // Crackle: kinked arcs that stay close to the beam (pinned to it at both ends), new every frame.
    const px = -dy / len, py = dx / len, n = Math.max(2, Math.round(len / SEG_PX));
    for (let k = 0; k < CRACKLE_ARCS; k++) {
      g.lineStyle(1.5, CRACKLE, 0.9 * a).beginPath().moveTo(from.x, from.y);
      for (let i = 1; i < n; i++) {
        const t = i / n, off = (Math.random() * 2 - 1) * CRACKLE_AMP * Math.sin(Math.PI * t) * 1.6;
        g.lineTo(from.x + dx * t + px * off, from.y + dy * t + py * off);
      }
      g.lineTo(to.x, to.y).strokePath();
    }
  }

  /** A flickering burst where the zap hits. */
  sparks(g, p, a) {
    g.fillStyle(BEAM, 0.5 * a).fillCircle(p.x, p.y, 11);
    g.fillStyle(CORE, a).fillCircle(p.x, p.y, 5);
    g.lineStyle(2, CRACKLE, a);
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2, r1 = 6, r2 = 12 + Math.random() * 8;
      g.lineBetween(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1, p.x + Math.cos(ang) * r2, p.y + Math.sin(ang) * r2);
    }
  }

  destroy() { this.g.destroy(); }
}
