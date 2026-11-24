// The Locklair Mage's effects on the map (v0.12; his logic is src/logic/mage.js, his picture is his building's):
//   - a small purple glow pulsing around his staff's crystal (brighter while he's zapping, faint while he sleeps);
//   - Sanctuary Aura: while he's awake in a raid, a soft violet ring on the ground over his aura, with a ring of light
//     rippling out from him every PULSE_MS;
//   - Arcane Aegis: while it lasts, a shimmering golden-violet dome over the aura;
//   - asleep (a nap or the night): "Z" letters drifting up from his head; knocked out (his building destroyed): his
//     statue stays (greyed by BuildingView) with three stars circling over it;
//   - always (v0.12.1): a faint white ring on the ground around his tile, gently pulsing; selected: his aura's outline in
//     gold (the buildings inside it are highlighted by GameScene.updateDjHighlight).
// One ground graphics, one overlay graphics, one glow image and one text: cheap on phones. GameScene calls update().
import { TEX } from '../assetKeys.js';
import { gridToScreen, rangeEllipse } from '../logic/iso.js';
import { footprintCenter } from '../logic/grid.js';
import { isWaveActive } from '../logic/util.js';
import { getMageAltar, mageStats } from '../logic/mage.js';
import { textStyle } from '../theme.js';

const VIOLET = 0xb46bff, AEGIS_GOLD = 0xffd98a, STAFF_GLOW = 0xd36bff;
const PULSE_MS = 1600;
const HOME_RING = 1.35; // tiles: the white ring around his tile (his footprint is 2 x 2)
const ZZZ_MS = 1800;

export class MageFx {
  constructor(scene) {
    this.scene = scene;
    this.ground = scene.add.graphics().setDepth(-4140);                    // the aura on the ground, under buildings
    this.over = scene.add.graphics().setDepth(2640).setBlendMode('ADD');   // the Aegis dome and the stars
    this.glow = scene.add.image(0, 0, TEX.light).setBlendMode('ADD').setDepth(2645).setVisible(false);
    this.zzz = scene.add.text(0, 0, 'Z', textStyle(16, '#e9d8ff')).setOrigin(0.5).setDepth(2646).setVisible(false);
  }

  update(time) {
    const gs = this.scene.gs;
    this.ground.clear();
    this.over.clear();
    const altar = gs && getMageAltar(gs), h = gs && gs.mage;
    const bv = altar && this.scene.views.buildings.get(altar.id);
    if (!altar || !h || !bv || !bv.sprite) { this.glow.setVisible(false); this.zzz.setVisible(false); return; }
    const st = mageStats(altar);
    const c = footprintCenter(altar), sc = gridToScreen(c.x, c.y), { rx, ry } = rangeEllipse(st.auraRadius, c.x, c.y);
    const down = altar.destroyed;
    // The white ring around his tile, always.
    {
      const k = 0.5 + 0.5 * Math.sin(time * 0.0035);
      const e = rangeEllipse(HOME_RING, c.x, c.y);
      this.ground.fillStyle(0xffffff, 0.03 + 0.03 * k).fillEllipse(sc.x, sc.y, e.rx * 2, e.ry * 2);
      this.ground.lineStyle(2.5, 0xffffff, 0.16 + 0.22 * k).strokeEllipse(sc.x, sc.y, e.rx * 2, e.ry * 2);
    }
    // Selected: his aura's outline (what Arcane Aegis covers), in gold.
    if (this.scene.selectedId === altar.id) {
      this.ground.lineStyle(2.5, 0xffd98a, 0.75).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
    }
    const asleep = !down && (h.status === 'asleep' || h.status === 'waking' || h.resting);
    // Staff glow (not while he's knocked out).
    const tip = bv.muzzlePoint();
    if (tip && !down) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.006);
      const size = (asleep ? 18 : h.attacking ? 34 : 26) * (0.85 + 0.15 * k);
      this.glow.setVisible(true).setPosition(tip.x, tip.y).setTint(STAFF_GLOW).setDisplaySize(size, size).setAlpha(asleep ? 0.45 : 0.85);
      this.over.fillStyle(0xffe6ff, asleep ? 0.35 : 0.8).fillCircle(tip.x, tip.y, asleep ? 2 : 3 + k);
    } else this.glow.setVisible(false);
    // Sanctuary Aura (awake, in a raid).
    if (!down && !asleep && h.status === 'ready' && isWaveActive(gs)) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.003);
      this.ground.fillStyle(VIOLET, 0.07 + 0.03 * k).fillEllipse(sc.x, sc.y, rx * 2, ry * 2);
      this.ground.lineStyle(2, VIOLET, 0.35 + 0.15 * k).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
      const p = (time % PULSE_MS) / PULSE_MS;
      this.ground.lineStyle(3, 0xe8c8ff, 0.5 * (1 - p)).strokeEllipse(sc.x, sc.y, rx * 2 * p, ry * 2 * p);
    }
    // Arcane Aegis: a dome over the aura while it lasts.
    if (h.aegisT > 0) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.012);
      const domeH = ry * 2.2;
      this.over.fillStyle(AEGIS_GOLD, 0.1 + 0.05 * k).fillEllipse(sc.x, sc.y, rx * 2, ry * 2);
      this.over.lineStyle(3, AEGIS_GOLD, 0.55 + 0.25 * k).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
      // The dome's arcs: half ellipses rising over the ground ring.
      for (const [w, a] of [[1, 0.5], [0.66, 0.35], [0.33, 0.25]]) {
        this.over.lineStyle(2, 0xf0d8ff, (a + 0.15 * k)).beginPath();
        for (let i = 0; i <= 24; i++) {
          const t = Math.PI * (i / 24);
          const x = sc.x - Math.cos(t) * rx * w, y = sc.y - Math.sin(t) * domeH; // (meridians: narrower, same height)
          if (i === 0) this.over.moveTo(x, y); else this.over.lineTo(x, y);
        }
        this.over.strokePath();
      }
    }
    // Asleep: a "Z" drifting up from his head. Knocked out: three stars circling over the statue.
    const head = bv.topCenter();
    if (asleep) {
      const p = (time % ZZZ_MS) / ZZZ_MS;
      this.zzz.setVisible(true).setPosition(head.x + 10 + p * 14, head.y + 6 - p * 26).setScale(0.7 + p * 0.6).setAlpha(1 - p);
    } else this.zzz.setVisible(false);
    if (down) {
      for (let i = 0; i < 3; i++) {
        const a = time * 0.004 + (i * Math.PI * 2) / 3;
        star(this.over, head.x + Math.cos(a) * 18, head.y + 4 + Math.sin(a) * 6, 6, 0xffe066);
      }
    }
  }

  destroy() { this.ground.destroy(); this.over.destroy(); this.glow.destroy(); this.zzz.destroy(); }
}

/** A small five-pointed star. */
function star(g, x, y, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(color, 1).fillPoints(pts, true);
}
