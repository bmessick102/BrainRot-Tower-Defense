// F.L.O.C.K Mothership's Triple Zap (src/logic/flockZap.js), drawn as a lightning bolt (v0.12, the user's reference
// picture; a straight tesla beam since v0.8.5): each zap is a jagged bolt from the tower's emitter to its target,
// redrawn every frame while it lasts (LIFE_MS):
//   - the bolt zigzags (kinks every SEG_PX, widest in the middle, pinned at both ends) and re-strikes every
//     RESTRIKE_MS, so it flickers like real lightning;
//   - layers from out to in: a blue-violet haze, a wide cyan glow, a pale blue body and a white-hot core;
//   - a few short forks branch off it (thinner, fading toward their tips);
//   - a spark burst on the target and a glowing orb on the emitter while the tower is firing.
// The beam follows a moving target (its sprite's body) and fades out over its last FADE share. GameScene feeds it the
// 'flockZap' events (add). Low graphics quality (src/quality.js): the beam only (no crackle, sparks or orb).
import { gridToScreen } from '../logic/iso.js';
import { isLowQuality } from '../quality.js';

export const LIFE_MS = 350;      // how long one zap's beam shows
const FADE = 0.45;               // the last share of it fades out
// The Mothership's blue lightning; the Locklair Mage's staff zap passes MAGE_ZAP_COLORS (purple).
export const ZAP_COLORS = { haze: 0x6a5cff, glow: 0x2fb8ff, beam: 0x58c6ff, body: 0x9fe8ff, crackle: 0xbfe9ff, core: 0xffffff };
export const MAGE_ZAP_COLORS = { haze: 0x8a2be2, glow: 0xc86bff, beam: 0xd98cff, body: 0xf3cfff, crackle: 0xffd9fb, core: 0xffffff };
const SEG_PX = 16;               // px between the bolt's kinks
const BOLT_AMP = 9;              // px the bolt strays from the straight line at most (in its middle)
const RESTRIKE_MS = 70;          // a new zigzag this often while it lasts
const FORKS = 3;                 // short branches off the bolt
const FORK_LEN = 0.22;           // their length, as a share of the bolt (at most FORK_MAX px)
const FORK_MAX = 34;
const EMITTER_DROP = 10;         // px below the top of the tower picture: where the electricity leaves it

export class ZapFx {
  constructor(scene, { colors = ZAP_COLORS } = {}) {
    this.scene = scene;
    this.c = colors;
    this.g = scene.add.graphics().setDepth(2705); // over walkers, under the float texts and the HUD
    this.zaps = [];
  }

  /** A 'flockZap' event: { sourceId, hits: [{ id, x, y }] } (x, y: where each target was, in tiles). */
  add(d, now = this.scene.time.now) {
    for (const h of d.hits || []) this.zaps.push({ sourceId: d.sourceId, targetId: h.id, x: h.x, y: h.y, born: now });
  }

  /** The emitter (screen px) of tower `id` (its picture's measured muzzle, MERGED_MUZZLE, if it has one), or null when it isn't drawn. */
  emitter(id) {
    const v = this.scene.views.buildings.get(id);
    if (!v || !v.sprite) return null;
    const m = v.muzzlePoint && v.muzzlePoint();
    if (m) return m;
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
      this.beam(g, from, to, a, low, z, time);
      if (!low) {
        this.sparks(g, to, a);
        const key = `${Math.round(from.x)},${Math.round(from.y)}`;
        firing.set(key, { ...from, a: Math.max(a, (firing.get(key) || {}).a || 0) });
      }
    }
    for (const e of firing.values()) {
      const r = 7 + Math.random() * 2.5;
      g.fillStyle(this.c.beam, 0.35 * e.a).fillCircle(e.x, e.y, r * 2);
      g.fillStyle(this.c.crackle, 0.8 * e.a).fillCircle(e.x, e.y, r);
      g.fillStyle(this.c.core, e.a).fillCircle(e.x, e.y, r * 0.5);
    }
  }

  /**
   * The lightning bolt for zap z: a zigzag from `from` to `to` (re-struck every RESTRIKE_MS: the offsets are kept on the
   * zap between strikes, so it holds its shape for a moment instead of fizzing every frame), its forks, and its layers.
   * Low graphics quality: the zigzag with a glow and a core only.
   */
  beam(g, from, to, a, low, z = {}, time = 0) {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy);
    if (len < 1) return;
    const px = -dy / len, py = dx / len, n = Math.max(3, Math.round(len / SEG_PX));
    if (!z.offs || z.offs.length !== n + 1 || time - (z.struck || 0) >= RESTRIKE_MS) {
      z.struck = time;
      z.offs = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 0 : (Math.random() * 2 - 1) * BOLT_AMP * (0.35 + 0.65 * Math.sin(Math.PI * i / n))));
      z.forks = Array.from({ length: low ? 0 : FORKS }, () => ({ at: 1 + Math.floor(Math.random() * (n - 1)), side: Math.random() < 0.5 ? -1 : 1, bend: Math.random() }));
    }
    const pts = z.offs.map((off, i) => ({ x: from.x + (dx * i) / n + px * off, y: from.y + (dy * i) / n + py * off }));
    const stroke = (width, color, alpha, list) => g.lineStyle(width, color, alpha).strokePoints(list, false);
    if (!low) stroke(22, this.c.haze, 0.2 * a, pts);
    stroke(12, this.c.glow, 0.5 * a, pts);
    if (!low) stroke(6, this.c.body, 0.9 * a, pts);
    stroke(2.5, this.c.core, a, pts);
    // Forks: a short kinked branch from a kink of the bolt, angled off toward the target's side.
    for (const f of z.forks || []) {
      const s0 = pts[f.at], fl = Math.min(FORK_MAX, len * FORK_LEN);
      const ang = Math.atan2(dy, dx) + f.side * (0.5 + 0.5 * f.bend);
      const mid = { x: s0.x + Math.cos(ang) * fl * 0.5 + px * f.side * 4, y: s0.y + Math.sin(ang) * fl * 0.5 + py * f.side * 4 };
      const tip = { x: s0.x + Math.cos(ang) * fl, y: s0.y + Math.sin(ang) * fl };
      stroke(6, this.c.glow, 0.4 * a, [s0, mid, tip]);
      stroke(1.5, this.c.core, 0.85 * a, [s0, mid]);
      stroke(1, this.c.crackle, 0.6 * a, [mid, tip]);
    }
  }

  /** A flickering burst where the zap hits. */
  sparks(g, p, a) {
    g.fillStyle(this.c.beam, 0.5 * a).fillCircle(p.x, p.y, 11);
    g.fillStyle(this.c.core, a).fillCircle(p.x, p.y, 5);
    g.lineStyle(2, this.c.crackle, a);
    for (let i = 0; i < 4; i++) {
      const ang = Math.random() * Math.PI * 2, r1 = 6, r2 = 12 + Math.random() * 8;
      g.lineBetween(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1, p.x + Math.cos(ang) * r2, p.y + Math.sin(ang) * r2);
    }
  }

  destroy() { this.g.destroy(); }
}
