// Missile Silo's Sky Net (src/logic/skyNet.js), drawn in code from the logic's state.nets every frame: the net rocket
// arcing from the launcher to its spot, then a glowing gold net bursting open over the group (a web of rings and
// spokes in the air, a soft ring on the ground under it) with tether lines from its middle to every enemy it holds.
// Low graphics quality (src/quality.js): no tethers and no ground ring, just the net.
import { gridToScreen, rangeEllipse } from '../logic/iso.js';
import { isLowQuality } from '../quality.js';

const NET_HEIGHT = 34;   // px above the ground where the net hangs (about where flyers fly)
const ROCKET_ARC = 120;  // px the net rocket climbs on its way
const OPEN_SECONDS = 0.25;
const FADE_SECONDS = 0.4;
const GOLD = 0xffd84a, PALE = 0xfff3c0;

export class NetFx {
  constructor(scene) {
    this.scene = scene;
    this.ground = scene.add.graphics().setDepth(-8970); // on the ground, over the plots
    this.air = scene.add.graphics().setDepth(2650);     // over walkers, under the HUD
  }

  update(time) {
    const gs = this.scene.gs;
    const nets = (gs && gs.nets) || [];
    this.ground.clear();
    this.air.clear();
    if (!nets.length) return;
    const low = isLowQuality();
    for (const n of nets) {
      if (n.delay > 0) { this.drawRocket(n); continue; }
      const age = n.seconds - n.t;
      const open = Math.min(1, age / OPEN_SECONDS);
      const alpha = Math.min(1, n.t / FADE_SECONDS);
      const c = gridToScreen(n.x, n.y);
      const { rx, ry } = rangeEllipse(n.radius);
      const ex = rx * (0.5 + 0.5 * open), ey = ry * (0.5 + 0.5 * open), cy = c.y - NET_HEIGHT;
      if (!low) {
        this.ground.fillStyle(GOLD, 0.12 * alpha).fillEllipse(c.x, c.y, ex * 2, ey * 2);
        this.ground.lineStyle(2, GOLD, 0.45 * alpha).strokeEllipse(c.x, c.y, ex * 2, ey * 2);
      }
      const g = this.air;
      const wobble = 1 + 0.03 * Math.sin(time * 0.012);
      g.fillStyle(GOLD, 0.1 * alpha).fillEllipse(c.x, cy, ex * 2 * wobble, ey * 2 * wobble);
      for (const k of [1, 0.66, 0.33]) g.lineStyle(k === 1 ? 3 : 2, k === 1 ? GOLD : PALE, (k === 1 ? 0.95 : 0.7) * alpha).strokeEllipse(c.x, cy, ex * 2 * k * wobble, ey * 2 * k * wobble);
      g.lineStyle(1.5, PALE, 0.7 * alpha);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 + age * 0.6;
        g.lineBetween(c.x, cy, c.x + Math.cos(a) * ex * wobble, cy + Math.sin(a) * ey * wobble);
      }
      g.fillStyle(0xffffff, 0.9 * alpha).fillCircle(c.x, cy, 4);
      if (low) continue;
      // Tethers: from the net's middle to the body of every enemy it's holding.
      g.lineStyle(2, GOLD, 0.8 * alpha);
      for (const id of n.caught || []) {
        const v = this.scene.views.enemies.get(id);
        if (!v || !v.sprite) continue;
        const s = v.sprite, by = s.y - s.originY * s.displayHeight + s.displayHeight * 0.5;
        g.lineBetween(c.x, cy, s.x, by);
        g.fillStyle(PALE, 0.9 * alpha).fillCircle(s.x, by, 2.5);
      }
    }
  }

  /** The net rocket on its way: a bright ball with a short trail, arcing up and over to its spot. */
  drawRocket(n) {
    const t = Math.max(0, Math.min(1, 1 - n.delay / (n.flightTime || 0.5)));
    const g0 = gridToScreen(n.fromX, n.fromY), b = gridToScreen(n.x, n.y);
    // From the Missile Silo's rocket nose (BuildingView.muzzlePoint), else 40 px over its footprint's center.
    const bv = this.scene.views && this.scene.views.buildings && this.scene.views.buildings.get(n.sourceId);
    const a = (bv && bv.muzzlePoint && bv.muzzlePoint()) || { x: g0.x, y: g0.y - 40 };
    const at = (k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - NET_HEIGHT - a.y) * k - Math.sin(Math.PI * k) * ROCKET_ARC });
    const g = this.air;
    for (let i = 4; i >= 1; i--) { const p = at(Math.max(0, t - i * 0.04)); g.fillStyle(GOLD, 0.15 * (5 - i)).fillCircle(p.x, p.y, 3 + i); }
    const p = at(t);
    g.fillStyle(0xffffff, 1).fillCircle(p.x, p.y, 5);
    g.lineStyle(2, GOLD, 1).strokeCircle(p.x, p.y, 7);
  }

  destroy() {
    this.ground.destroy();
    this.air.destroy();
  }
}
