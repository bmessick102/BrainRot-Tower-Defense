// Full-detail map pieces over the shipped map pictures (v0.9.3; the pieces and their numbers: src/mapDetail.js).
//
// The 2672 px map pictures are enough until the camera shows a map pixel bigger than a screen pixel; past that
// (zoomed in, or a big / high-DPI screen drawn at its real resolution, src/renderScale.js) they'd look soft. Then, on a
// desktop at High graphics, the full-size pieces of the time of day showing are loaded for the part of the map in view
// and drawn over it. The normal map stays under the opaque detail pieces, including while pieces load or the camera
// moves. Partly transparent layers use their normal map during a crossfade. Unused pieces are dropped after a while (each is ~12 MB of
// graphics memory), and never more than MAX_PIECES are kept. A piece that fails to load is left out and asked for again
// after RETRY_MS (e.g. a file that was being rewritten by prepare-art while it loaded).
import { MAP } from '../mapTiles.js';
import { MAP_DETAIL, detailPieces } from '../mapDetail.js';
import { isLowQuality } from '../quality.js';
import { IS_TOUCH } from '../device.js';

const BASE = import.meta.env.BASE_URL; // the site's base path ('/BrainRot-Tower-Defense/')
const ZOOM_IN_AT = 1.15;     // load pieces once a map picture pixel covers 1.15 screen pixels
const DROP_AFTER_MS = 15000; // a piece unused this long is let go
const MAX_PIECES = 20;       // at most this many in memory (the rest are dropped, least recently used first)
const CHECK_MS = 200;        // how often to work out which pieces are wanted
const RETRY_MS = 5000;       // a piece that failed to load is tried again after this long

export class MapDetail {
  /**
   * layers: the map pictures from the bottom up, [{ key: 'game_map_grid', image, depth }] (key = the map's file name,
   * image = the Phaser image showing it, depth = the depth to draw its pieces at: just above that image).
   */
  constructor(scene, layers) {
    this.scene = scene;
    this.layers = layers.filter((l) => l && l.image);
    this.pieces = new Map(); // texture key -> { layer, piece, image, state: 'loading' | 'ready' | 'failed', usedAt }
    this.nextCheck = 0;
    this.enabled = !IS_TOUCH && typeof window !== 'undefined';
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Is detail worth it right now (desktop, High graphics, zoomed in past the shipped picture)? */
  wanted() {
    if (!this.enabled || isLowQuality() || !this.layers.length) return false;
    const tex = this.layers[0].image.texture;
    const src = tex && tex.source && tex.source[0];
    if (!src || !src.width) return false;
    const texelsPerWorldPx = src.width / MAP.imageWidth;
    return this.scene.cameras.main.zoom > texelsPerWorldPx * ZOOM_IN_AT;
  }

  /**
   * Use the current camera transform. Phaser's worldView still has the previous frame's bounds here.
   */
  update(time) {
    if (!this.enabled) return;
    for (const p of this.pieces.values()) if (p.image && p.layer.image.alpha < 1) p.image.setVisible(false);
    const cam = this.scene.cameras.main;
    const viewKey = `${Math.round(cam.scrollX)}|${Math.round(cam.scrollY)}|${cam.zoom.toFixed(4)}|${cam.width}|${cam.height}|${this.layers.map((l) => l.image.alpha >= 1).join()}`;
    if (viewKey !== this.lastView) { this.lastView = viewKey; this.nextCheck = 0; }
    if (time < this.nextCheck) return;
    this.nextCheck = time + CHECK_MS;
    const now = Date.now();
    const want = this.wanted();
    const halfW = cam.width / (2 * cam.zoom), halfH = cam.height / (2 * cam.zoom);
    const cx = cam.scrollX + cam.width / 2, cy = cam.scrollY + cam.height / 2;
    const sx = MAP.imageWidth / MAP_DETAIL.sourceWidth, sy = MAP.imageHeight / MAP_DETAIL.sourceHeight;
    // From the top layer down: a layer fully hidden under an opaque one above needs no pieces.
    let covered = false;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      const a = layer.image.alpha;
      const show = want && !covered && a >= 1 && layer.image.texture && layer.image.texture.key !== '__MISSING';
      for (const piece of detailPieces(layer.key)) {
        const key = `mapdetail_${this.scene.sys.settings.key}_${piece.file.replace(/\.webp$/, '')}`; // (per scene: a sleeping scene keeps its own)
        const r = piece.rect;
        const x = r.x * sx, y = r.y * sy, w = r.w * sx, h = r.h * sy;
        const inView = x < cx + halfW && x + w > cx - halfW && y < cy + halfH && y + h > cy - halfH;
        let p = this.pieces.get(key);
        if (p && p.state === 'failed' && now - p.failedAt > RETRY_MS) { this.pieces.delete(key); p = null; } // try it again
        if (show && inView) {
          if (!p) p = this.load(key, layer, piece, { x, y, w, h });
          p.usedAt = now;
          if (p.image) p.image.setAlpha(1).setVisible(true);
        } else if (p && p.image) p.image.setVisible(false);
      }
      if (a >= 1) covered = true;
    }
    this.evict(now);
  }

  load(key, layer, piece, at) {
    const p = { layer, piece, at, image: null, state: 'loading', usedAt: Date.now() };
    this.pieces.set(key, p);
    const scene = this.scene;
    if (scene.textures.exists(key)) { this.place(key, p); return p; }
    const done = () => { scene.load.off('loaderror', fail); this.place(key, p); };
    const fail = (file) => { if (file.key !== key) return; scene.load.off(`filecomplete-image-${key}`, done); scene.load.off('loaderror', fail); p.state = 'failed'; p.failedAt = Date.now(); };
    scene.load.once(`filecomplete-image-${key}`, done);
    scene.load.on('loaderror', fail);
    // (from the site's base path, like every other picture: a relative path broke when the page's address wasn't the
    // game's root folder, and the server answered with its HTML page instead: "Failed to process file")
    scene.load.image(key, `${BASE}${MAP_DETAIL.dir}/${piece.file}`);
    if (!scene.load.isLoading()) scene.load.start();
    return p;
  }

  place(key, p) {
    if (!this.pieces.has(key) || !this.scene.sys.isActive()) { // (landed after the scene closed, paused or let it go: asked again later)
      this.pieces.delete(key);
      if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
      return;
    }
    const { x, y, w, h } = p.at;
    p.image = this.scene.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(w, h)
      .setDepth(p.layer.depth).setAlpha(p.layer.image.alpha).setVisible(false);
    p.state = 'ready';
    this.nextCheck = 0; // re-check now: maybe the full set is in and the soft picture can go
  }

  /** Let go of pieces unused for a while, and of the oldest ones past MAX_PIECES. */
  evict(now) {
    const list = [...this.pieces.entries()].filter(([, p]) => p.state !== 'loading');
    list.sort((a, b) => a[1].usedAt - b[1].usedAt);
    let over = this.pieces.size - MAX_PIECES;
    for (const [key, p] of list) {
      const stale = now - p.usedAt > DROP_AFTER_MS;
      if (!stale && over <= 0) break;
      if (p.image && p.image.visible && !stale) continue; // never drop one on screen
      this.drop(key, p);
      over--;
    }
  }

  drop(key, p) {
    if (p.image) p.image.destroy();
    this.pieces.delete(key);
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }

  destroy() {
    for (const [key, p] of [...this.pieces.entries()]) this.drop(key, p); // (one still loading is freed when it lands)
  }
}
