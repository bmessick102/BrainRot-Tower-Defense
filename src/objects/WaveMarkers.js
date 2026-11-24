// Wave preview markers (GameScene, world space): for each corner the next wave attacks from (the running
// wave's while it lasts), a red disc with an arrow pointing along the path toward the village, centered on the
// path at its back end where its enemies come onto the map, with the enemy kinds and their counts in centered
// rows underneath it. They pan and zoom
// with the map, counter-scaled so they stay the same size on screen, and never overlap the grass the village
// is built on (src/logic/waveMarkers.js); where the HUD would cover one, it slides in along its path (still
// short of the grass) if that clears it. UIScene feeds the counts (syncCornerHud, from waves.js
// wavePlanCounts). Drawn over buildings, enemies and effects; the HUD (UIScene) always draws over them.
// v0.7.1: each marker starts condensed, one chip with the corner's total ("42 troops"); tapping it (GameScene
// handleClick -> toggleAt) opens the full list of kinds, with a Hide chip to fold it again. A corner stays open
// or folded across waves until it's tapped again.
import { MARKER, markerLayout, markerRange, anchorAt, pickAlongPath, pathEnds, pathAngle, markerChips, markerHit } from '../logic/waveMarkers.js';
import { drawAngledArrow, fitWidth, fitIcon } from './uiDraw.js';
import { enemyKey, TEX } from '../assetKeys.js';
import { COLORS, textStyle } from '../theme.js';
import { renderScale } from '../renderScale.js';

const DEPTH = 5500; // over buildings, enemies, labels (5000); under floating damage text (6000)
// The wave's "!" warning (while a wave is coming / running): a badge on the disc's top-right, so it sits in the
// corner with its marker instead of over the village. Local px at marker scale 1 (counter-scaled with zoom).
const ALERT = { x: MARKER.disc * 0.55, y: -MARKER.disc * 0.55, scale: 0.5, pulse: 1.15, bobPx: 4 };
// Hovered marker (mouse): a little bigger, with a gold outline around it (v0.7.1).
const HOVER = { scale: 1.08, pad: 5, color: 0xffd34d };

export class WaveMarkers {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.sig = '';
    this.alertPaths = new Set();
    this.open = new Set(); // corners showing every kind (all start condensed)
    this.entries = new Map(); // path -> [[kind, n]] (to rebuild one marker when it's tapped)
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

  /** World position of path `path`'s "!" warning (shown or not), or null when it has no marker. */
  alertPoint(path) {
    const it = this.items.find((x) => x.path === path);
    if (!it) return null;
    return { x: it.c.x + ALERT.x * it.c.scaleX, y: it.c.y + ALERT.y * it.c.scaleY };
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
    this.entries.clear();
    for (const [path, kinds] of Object.entries(counts || {})) {
      const entries = Object.entries(kinds || {}).filter(([, n]) => n > 0);
      if (!entries.length || !pathEnds(path)) continue;
      this.entries.set(path, entries);
      const it = this.build(path, entries);
      this.items.push(it);
      this.syncAlert(it);
    }
    this.update();
  }

  /**
   * A tap at world (wx, wy): if it's on a marker, open or fold that corner's list and say so (the click is used).
   */
  toggleAt(wx, wy) {
    const i = this.items.findIndex((it) => it.place && markerHit(it.layout, it.place.x, it.place.y, it.place.scale, wx, wy));
    if (i < 0) return false;
    const old = this.items[i];
    if (this.open.has(old.path)) this.open.delete(old.path); else this.open.add(old.path);
    if (old.alert) this.scene.tweens.killTweensOf(old.alert);
    old.c.destroy();
    const it = this.build(old.path, this.entries.get(old.path) || []);
    this.items[i] = it;
    this.syncAlert(it);
    this.update();
    return true;
  }

  /** Light up the marker under the world point (or none: null, null); says whether there is one. */
  hoverAt(wx, wy) {
    const hit = wx == null ? null : this.items.find((it) => it.place && markerHit(it.layout, it.place.x, it.place.y, it.place.scale, wx, wy));
    this.hoverPath = hit ? hit.path : null;
    for (const it of this.items) this.syncHover(it);
    return !!hit;
  }

  syncHover(it) {
    const on = it.path === this.hoverPath;
    if (it.hl) it.hl.setVisible(on);
    if (it.place) it.c.setScale(it.place.scale * (on ? HOVER.scale : 1));
  }

  build(path, entries) {
    const s = this.scene, M = MARKER, R = M.disc / 2;
    const chips = markerChips(entries, this.open.has(path));
    const layout = markerLayout(path, chips.length);
    const c = s.add.container(0, 0).setDepth(DEPTH);
    const g = s.add.graphics();
    const { x: dx, y: dy } = layout.disc;
    g.fillStyle(0x000000, 0.35).fillCircle(dx + 1, dy + 3, R);
    g.fillStyle(0xc0392b, 1).fillCircle(dx, dy, R);
    g.lineStyle(3, COLORS.frame, 1).strokeCircle(dx, dy, R);
    drawAngledArrow(g, dx, dy, M.disc * 0.62, pathAngle(path)); // along the path, toward the village
    c.add(g);
    // The hover outline (hidden until the mouse is over it): around the whole marker, under its pieces.
    const r = layout.rect, hl = s.add.graphics().setVisible(false);
    hl.fillStyle(0xffffff, 0.14).fillRoundedRect(r.x - HOVER.pad, r.y - HOVER.pad, r.w + HOVER.pad * 2, r.h + HOVER.pad * 2, 12);
    hl.lineStyle(3, HOVER.color, 1).strokeRoundedRect(r.x - HOVER.pad, r.y - HOVER.pad, r.w + HOVER.pad * 2, r.h + HOVER.pad * 2, 12);
    c.addAt(hl, 0);
    chips.forEach((chip, i) => {
      const p = layout.chips[i];
      const icon = 26;
      const bg = s.add.graphics();
      // The summary and Hide chips are buttons: red like the disc, so they read as part of it.
      const button = chip.summary || chip.hide;
      bg.fillStyle(button ? 0xa8322a : 0x1b2a38, button ? 0.95 : 0.82).fillRoundedRect(p.x, p.y, M.chipW, M.chipH, 8);
      bg.lineStyle(2, button ? COLORS.frame : 0x000000, button ? 1 : 0.5).strokeRoundedRect(p.x, p.y, M.chipW, M.chipH, 8);
      if (button) {
        const cx = p.x + M.chipW / 2;
        if (chip.summary) {
          // "98 v" on top (the triangle says it opens), "troops" under it.
          const t = s.add.text(cx - 6, p.y + 14, String(chip.total), textStyle(18)).setOrigin(0.5);
          fitWidth(t, M.chipW - 26);
          const tx = t.x + t.displayWidth / 2 + 8, ty = p.y + 14;
          bg.fillStyle(0xffffff, 0.95).fillTriangle(tx - 5, ty - 3, tx + 5, ty - 3, tx, ty + 4);
          const sub = s.add.text(cx, p.y + 30, chip.total === 1 ? 'troop' : 'troops', textStyle(12)).setOrigin(0.5);
          fitWidth(sub, M.chipW - 8);
          c.add([bg, t, sub]);
        } else {
          // Hide, with an up triangle over it.
          bg.fillStyle(0xffffff, 0.95).fillTriangle(cx - 5, p.y + 13, cx + 5, p.y + 13, cx, p.y + 6);
          const t = s.add.text(cx, p.y + 26, 'Hide', textStyle(15)).setOrigin(0.5);
          fitWidth(t, M.chipW - 10);
          c.add([bg, t]);
        }
        return;
      }
      const { kind, n } = chip;
      const img = s.add.image(p.x + icon / 2 + 3, p.y + M.chipH / 2, enemyKey(kind));
      if (img.frame && img.frame.width) fitIcon(img, icon);
      const t = s.add.text(p.x + icon + 5, p.y + M.chipH / 2, `x${n}`, textStyle(15)).setOrigin(0, 0.5);
      const room = M.chipW - icon - 8; // a big count still fits its chip
      fitWidth(t, room);
      c.add([bg, img, t]);
    });
    return { path, c, layout, hl, places: new Map(), place: null, alert: null };
  }

  /**
   * Every frame: keep a constant size on screen, at the back of the path, but slid in along it (never onto the
   * grass) when the HUD would hide it there. The stretch of path it may use is cached per zoom step (it costs a
   * search against the grass).
   */
  update() {
    if (!this.items.length) return;
    const s = this.scene;
    const r = renderScale(); // (zoom per view pixel, and HUD rects in view pixels: renderScale.js)
    const want = Math.round((r / s.cameras.main.zoom) * 20) / 20;
    const ui = s.scene.isActive('UIScene') ? s.scene.get('UIScene') : null;
    const hud = ui && ui.hudRects ? Object.values(ui.hudRects()) : [];
    const z = s.cameras.main.zoom / r;
    const toScreen = (q) => { const p = s.worldToScreen(q.x, q.y); return { x: p.x / r, y: p.y / r, w: q.w * z, h: q.h * z }; };
    for (const it of this.items) {
      let range = it.places.get(want);
      if (!range) { range = markerRange(it.path, it.layout, want); it.places.set(want, range); }
      const d = pickAlongPath(range, it.layout, toScreen, hud);
      if (it.place && it.place.range === range && it.place.d === d) continue;
      const a = anchorAt(range, d);
      it.place = { range, d, x: a.x, y: a.y, scale: range.scale };
      it.c.setPosition(a.x, a.y);
      this.syncHover(it);
    }
  }

  destroy() {
    for (const it of this.items) { if (it.alert) this.scene.tweens.killTweensOf(it.alert); it.c.destroy(); }
    this.items = [];
    this.sig = '';
  }
}
