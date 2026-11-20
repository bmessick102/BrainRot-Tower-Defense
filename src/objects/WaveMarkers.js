// Wave preview markers (GameScene, world space): for each corner the next wave attacks from (the running
// wave's while it lasts), a red disc with an arrow pointing along the path toward the village, centered on the
// path at its back end where its enemies come onto the map, with the enemy kinds and their counts in centered
// rows underneath it. They pan and zoom
// with the map, counter-scaled so they stay the same size on screen, and never overlap the grass the village
// is built on (src/logic/waveMarkers.js); where the HUD would cover one, it slides in along its path (still
// short of the grass) if that clears it. UIScene feeds the counts (syncCornerHud, from waves.js
// wavePlanCounts). Drawn over buildings, enemies and effects; the HUD (UIScene) always draws over them, and
// nothing here takes clicks.
import { MARKER, markerLayout, markerRange, anchorAt, pickAlongPath, pathEnds, pathAngle } from '../logic/waveMarkers.js';
import { drawAngledArrow, fitWidth, fitIcon } from './uiDraw.js';
import { enemyKey, TEX } from '../assetKeys.js';
import { COLORS, textStyle } from '../theme.js';

const DEPTH = 5500; // over buildings, enemies, labels (5000); under floating damage text (6000)
// The wave's "!" warning (while a wave is coming / running): a badge on the disc's top-right, so it sits in the
// corner with its marker instead of over the village. Local px at marker scale 1 (counter-scaled with zoom).
const ALERT = { x: MARKER.disc * 0.55, y: -MARKER.disc * 0.55, scale: 0.5, pulse: 1.15, bobPx: 4 };

export class WaveMarkers {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sig = '';
    this.alertPaths = new Set();
  }

  /** Show the "!" warning on these paths' markers (the running wave's), or none with []. */
  setAlerts(paths) {
    this.alertPaths = new Set(paths || []);
    for (const it of this.items) this.syncAlert(it);
  }

  syncAlert(it) {
    const want = this.alertPaths.has(it.path);
    if (want && !it.alert && this.scene.textures.exists(TEX.spawnMarker)) {
      const s = this.scene;
      const a = s.add.image(ALERT.x, ALERT.y, TEX.spawnMarker).setScale(ALERT.scale);
      it.c.add(a);
      s.tweens.add({ targets: a, scale: ALERT.scale * ALERT.pulse, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      s.tweens.add({ targets: a, y: ALERT.y - ALERT.bobPx, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      it.alert = a;
    } else if (!want && it.alert) {
      this.scene.tweens.killTweensOf(it.alert);
      it.alert.destroy();
      it.alert = null;
    }
  }

  /** World position of the first "!" warning (for the tutorial's pointer), or null. */
  alertWorld() {
    const it = this.items.find((x) => x.alert);
    if (!it) return null;
    return { x: it.c.x + ALERT.x * it.c.scaleX, y: it.c.y + ALERT.y * it.c.scaleY };
  }

  /** counts: { path: { kind: n } } (wavePlanCounts), or {} to clear. Rebuilds only when it changes. */
  setCounts(counts) {
    const sig = JSON.stringify(counts || {});
    if (sig === this.sig) return;
    this.sig = sig;
    for (const it of this.items) { if (it.alert) this.scene.tweens.killTweensOf(it.alert); it.c.destroy(); }
    this.items = [];
    for (const [path, kinds] of Object.entries(counts || {})) {
      const entries = Object.entries(kinds || {}).filter(([, n]) => n > 0);
      if (!entries.length || !pathEnds(path)) continue;
      const it = this.build(path, entries);
      this.items.push(it);
      this.syncAlert(it);
    }
    this.update();
  }

  build(path, entries) {
    const s = this.scene, M = MARKER, R = M.disc / 2;
    const layout = markerLayout(path, entries.length);
    const c = s.add.container(0, 0).setDepth(DEPTH);
    const g = s.add.graphics();
    const { x: dx, y: dy } = layout.disc;
    g.fillStyle(0x000000, 0.35).fillCircle(dx + 1, dy + 3, R);
    g.fillStyle(0xc0392b, 1).fillCircle(dx, dy, R);
    g.lineStyle(3, COLORS.frame, 1).strokeCircle(dx, dy, R);
    drawAngledArrow(g, dx, dy, M.disc * 0.62, pathAngle(path)); // along the path, toward the village
    c.add(g);
    entries.forEach(([kind, n], i) => {
      const p = layout.chips[i];
      const icon = 26;
      const bg = s.add.graphics();
      bg.fillStyle(0x1b2a38, 0.82).fillRoundedRect(p.x, p.y, M.chipW, M.chipH, 8);
      bg.lineStyle(2, 0x000000, 0.5).strokeRoundedRect(p.x, p.y, M.chipW, M.chipH, 8);
      const img = s.add.image(p.x + icon / 2 + 3, p.y + M.chipH / 2, enemyKey(kind));
      if (img.frame && img.frame.width) fitIcon(img, icon);
      const t = s.add.text(p.x + icon + 5, p.y + M.chipH / 2, `x${n}`, textStyle(15)).setOrigin(0, 0.5);
      const room = M.chipW - icon - 8; // a big count still fits its chip
      fitWidth(t, room);
      c.add([bg, img, t]);
    });
    return { path, c, layout, places: new Map(), place: null, alert: null };
  }

  /**
   * Every frame: keep a constant size on screen, at the back of the path, but slid in along it (never onto the
   * grass) when the HUD would hide it there. The stretch of path it may use is cached per zoom step (it costs a
   * search against the grass).
   */
  update() {
    if (!this.items.length) return;
    const s = this.scene;
    const want = Math.round((1 / s.cameras.main.zoom) * 20) / 20;
    const ui = s.scene.isActive('UIScene') ? s.scene.get('UIScene') : null;
    const hud = ui && ui.hudRects ? Object.values(ui.hudRects()) : [];
    const z = s.cameras.main.zoom;
    const toScreen = (r) => { const p = s.worldToScreen(r.x, r.y); return { x: p.x, y: p.y, w: r.w * z, h: r.h * z }; };
    for (const it of this.items) {
      let range = it.places.get(want);
      if (!range) { range = markerRange(it.path, it.layout, want); it.places.set(want, range); }
      const d = pickAlongPath(range, it.layout, toScreen, hud);
      if (it.place && it.place.range === range && it.place.d === d) continue;
      const a = anchorAt(range, d);
      it.place = { range, d, x: a.x, y: a.y, scale: range.scale };
      it.c.setPosition(a.x, a.y).setScale(range.scale);
    }
  }

  destroy() {
    for (const it of this.items) { if (it.alert) this.scene.tweens.killTweensOf(it.alert); it.c.destroy(); }
    this.items = [];
    this.sig = '';
  }
}
