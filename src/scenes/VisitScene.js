// Visiting another player's village (v0.7): their village drawn with the game's own building views, read only. Drag
// to pan, scroll / pinch to zoom, tap a building for its name, level and perks (VisitHudScene shows the card). No
// waves, no economy, nothing saved. VisitHudScene (launched on top) has the top bar: whose village it is, a switcher
// for their other villages, and Back (to the title screen, reopening that player's card).
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { TEX, MUSIC } from '../assetKeys.js';
import { gridToScreen, screenToGrid } from '../logic/iso.js';
import { footprintCenter, fpW, fpH } from '../logic/grid.js';
import { parseSave, deserializeGame } from '../logic/save.js';
import { getCapacity } from '../logic/economy.js';
import { BuildingView } from '../objects/BuildingView.js';
import { GrassTufts, drawGroundPlots, groundColor } from '../objects/Ground.js';
import { WallView } from '../objects/WallView.js';
import { requestImages } from '../assetLoader.js';
import { Button } from '../objects/Button.js';
import { COLORS, textStyle } from '../theme.js';
import { villageImageKeys } from '../assetPlan.js';
import { session } from '../net/account.js';
import { zoomLimit, dragThreshold, toView } from '../renderScale.js';
import { MapDetail } from '../objects/MapDetail.js';
import { DayNight } from '../objects/DayNight.js';
import { RangeCircle } from '../objects/RangeCircle.js';
import { stepFlockTowers } from '../logic/flock.js';
import { hasAmbience, startAmbience, stopAmbience, updateAmbience, playMusic, stopMusic, keepAudioAlive, playBuildingSelect } from '../audio.js';

const ZOOM_STEP = 1.15;
// At most this long for the village's building pictures before it is drawn anyway (the views pick the pictures up as
// they stream in, drawing the closest lower level meanwhile). Waiting longer left a blank dark screen on a slow connection.
const ART_WAIT_MS = 2500;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class VisitScene extends Phaser.Scene {
  constructor() {
    super('VisitScene');
  }

  /**
   * @param {object} data
   * @param {string} data.baseId    the village to show
   * @param {string} data.username  its owner
   * @param {Array}  data.bases     the owner's viewable villages ([{ id, name, townHall, bestWave }], best first)
   */
  init(data) {
    this.baseId = data.baseId;
    this.username = data.username;
    this.bases = data.bases || [];
    this.from = data.from || null; // the title screen window the card was opened from ('leaderboard' / 'search')
    this.gs = null;
    this.base = null;
    this.loadToken = {};
    this.audioCheckAt = 0;
    this.views = new Map();
    this.selectedId = null;
    this.press = null;
    this.pinch = null;
    this.statusMsg = '';
    this.failed = false;
    this.failUi = null;
    this.brokenViews = new Set();
  }

  create() {
    this.cameras.main.setBackgroundColor('#10140f');
    this.rangeCircle = new RangeCircle(this);
    stopMusic();
    const ambience = hasAmbience(this, MUSIC.ambientDay, MUSIC.ambientNight);
    this.events.once('shutdown', () => { this.loadToken = null; stopAmbience(); stopMusic(); });
    if (!ambience) playMusic(this, MUSIC.village);
    this.scene.launch('VisitHudScene', { visit: this });
    this.hud = this.scene.get('VisitHudScene');
    // The map shows at once (the village is drawn on it when it arrives), so the screen is never just a dark void.
    try {
      const map = this.add.image(0, 0, TEX.map).setOrigin(0, 0).setDisplaySize(MAP.imageWidth, MAP.imageHeight).setDepth(-10000);
      this.dayNight = new DayNight(this);
      this.mapDetail = new MapDetail(this, [
        { key: 'game_map_grid', image: map, depth: -9999.5 },
        { key: 'game_map_grid_dawn', image: this.dayNight.dawnMap, depth: -9998.5 },
        { key: 'game_map_grid_dusk', image: this.dayNight.duskMap, depth: -9997.5 },
        { key: 'game_map_grid_night', image: this.dayNight.nightMap, depth: -9996.5 }
      ]);
      this.setupCamera();
    } catch (e) { console.error('VisitScene: map', e); }
    this.setStatus('Loading village…');
    this.loadVillage();
  }

  /** The message in the middle of the screen (the HUD draws it; it reads statusMsg when it starts, being launched later). */
  setStatus(text) {
    this.statusMsg = text || '';
    if (this.hudReady()) this.hud.setStatus(this.statusMsg);
  }

  /**
   * Is the HUD running? It's launched in create() but only starts on the next frame, and its scene object keeps the
   * last visit's (destroyed) texts until then: talking to it before that threw and left the screen stuck.
   */
  hudReady() {
    return !!(this.hud && this.hud.sys && this.hud.sys.isActive() && this.hud.statusText);
  }

  /** Loading or drawing the village failed: say so, log it, and make sure there is a Back button. */
  fail(e, fallback = 'Couldn’t load that village.') {
    console.error('VisitScene:', e);
    this.failed = true;
    const msg = (e && e.message && !/^(Cannot|undefined|null|\w+ is not)/.test(e.message) ? e.message : '') || fallback;
    this.setStatus(`${msg}
Tap Back to return.`);
    if (this.hud && this.hud.statusText && this.hud.sys && this.hud.sys.isActive()) return; // the HUD has its own Back button
    try {
      const { width, height } = this.scale;
      this.failUi = [
        this.add.text(width / 2, height / 2, `${msg}
Tap Back to return.`, textStyle(24)).setOrigin(0.5).setAlign('center').setScrollFactor(0).setDepth(100000),
        this.add.existing(new Button(this, 74, 40, 120, 48, 'Back', () => this.leave(), { color: COLORS.buttonDanger, fontSize: 20 })).setScrollFactor(0).setDepth(100000)
      ];
    } catch (e2) { console.error('VisitScene: fallback Back', e2); }
  }

  async loadVillage() {
    const token = this.loadToken;
    try {
      const base = await session.backend.playerBase(this.baseId);
      if (token !== this.loadToken || !this.sys.isActive()) return;
      const parsed = parseSave(JSON.stringify(base.save));
      if (parsed.status !== 'ok') throw new Error('That village can’t be shown.');
      this.base = base;
      // Its building pictures first (they stream in), for at most ART_WAIT_MS.
      await Promise.race([requestImages(villageImageKeys(parsed.data.buildings), { front: true }).catch(() => false), new Promise((r) => setTimeout(r, ART_WAIT_MS))]);
      if (token !== this.loadToken || !this.sys.isActive()) return;
      this.build(deserializeGame(parsed.data)); // (validated save -> buildings with their footprints, perks...)
      startAmbience(this, MUSIC.ambientDay, MUSIC.ambientNight);
      this.setStatus('');
      if (this.hudReady()) this.hud.showVillage(base); // (else the HUD shows it when it starts)
    } catch (e) {
      if (token === this.loadToken && this.sys.isActive()) this.fail(e);
    }
  }

  /** A read-only stand-in for GameState: what the building views read (gold for the storages' fill, no enemies). */
  build(data) {
    const gs = { buildings: data.buildings, gold: data.gold || 0, researchPoints: data.researchPoints,
      clock: data.clock, enemies: [], wave: { phase: 'idle' }, research: data.research, mastery: data.mastery || {} };
    gs.capacity = getCapacity(gs);
    gs.townHall = data.buildings.find((b) => b.type === 'townHall') || null;
    gs.getBuilding = (id) => data.buildings.find((b) => b.id === id) || null;
    this.gs = gs;
    stepFlockTowers(gs);
    this.dayNight?.update(gs.clock);
    // The ground (v0.9.1, as in your own village): solid grass under every building and wall, and the village's grass tufts.
    drawGroundPlots(this.add.graphics().setDepth(-9000), data.buildings, groundColor(null));
    new GrassTufts(this, data.decorSeed).layout(data.buildings);
    for (const b of data.buildings) {
      try { this.views.set(b.id, b.type === 'wall' ? new WallView(this, b) : new BuildingView(this, b)); } catch (e) { console.error('VisitScene: could not draw', b.type, e); }
    }
    this.setupCamera();
    this.setupInput();
  }

  /** Building views ask which labels to show: only the tapped building's. */
  showLabels(id) { return id === this.selectedId; }

  update(time, delta) {
    if (this.mapDetail) this.mapDetail.update(time);
    if (time - this.audioCheckAt > 1000) { this.audioCheckAt = time; keepAudioAlive(this); }
    if (!this.gs) return;
    updateAmbience(this.night || 0, true, Math.min(delta / 1000, 0.1));
    for (const b of this.gs.buildings) {
      const v = this.views.get(b.id);
      if (!v || this.brokenViews.has(b.id)) continue;
      // One building that can't draw must not stop the whole game loop (an exception here ends it: a frozen screen).
      try { v.sync(b, time); } catch (e) { this.brokenViews.add(b.id); console.error('VisitScene: could not update', b.type, e); }
    }
  }

  // ---------- camera (the same rules as GameScene's) ----------
  minZoom() {
    const cam = this.cameras.main;
    return Math.max(zoomLimit(CONFIG.camera.minZoom), cam.width / MAP.imageWidth, cam.height / MAP.imageHeight);
  }

  setupCamera() {
    const cam = this.cameras.main;
    cam.setZoom(Math.max(zoomLimit(CONFIG.camera.startZoom), this.minZoom()));
    const th = this.gs && this.gs.townHall;
    const c = th ? footprintCenter(th) : { x: MAP.cols / 2, y: MAP.rows / 2 };
    const s = gridToScreen(c.x, c.y);
    cam.centerOn(s.x, s.y);
    this.clampCamera();
  }

  clampCamera() {
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom, viewH = cam.height / cam.zoom;
    const axis = (scroll, half, view, size) => (view >= size ? size / 2 - half : clamp(scroll, view / 2 - half, size - view / 2 - half));
    cam.scrollX = axis(cam.scrollX, cam.width / 2, viewW, MAP.imageWidth);
    cam.scrollY = axis(cam.scrollY, cam.height / 2, viewH, MAP.imageHeight);
  }

  screenToWorld(px, py) {
    const cam = this.cameras.main;
    return { x: (px - cam.width / 2) / cam.zoom + cam.width / 2 + cam.scrollX, y: (py - cam.height / 2) / cam.zoom + cam.height / 2 + cam.scrollY };
  }

  zoomKeeping(w, px, py, zoom) {
    const cam = this.cameras.main;
    zoom = clamp(zoom, this.minZoom(), zoomLimit(CONFIG.camera.maxZoom));
    cam.setZoom(zoom);
    cam.scrollX = w.x - cam.width / 2 - (px - cam.width / 2) / zoom;
    cam.scrollY = w.y - cam.height / 2 - (py - cam.height / 2) / zoom;
    this.clampCamera();
  }

  setupInput() {
    const fingers = () => [this.input.pointer1, this.input.pointer2].filter((p) => p && p.isDown);
    this.input.on('wheel', (p, over, dx, dy) => this.zoomKeeping(this.screenToWorld(p.x, p.y), p.x, p.y, this.cameras.main.zoom * (dy > 0 ? 1 / ZOOM_STEP : ZOOM_STEP)));
    this.input.on('pointerdown', (p) => {
      const f = fingers();
      if (f.length >= 2) {
        const [a, b] = f, mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        this.press = null;
        this.pinch = { dist: Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)), zoom: this.cameras.main.zoom, world: this.screenToWorld(mid.x, mid.y) };
        return;
      }
      if (this.pinch) return;
      // A press on the HUD (Back, the switcher, the building card) is the HUD's, not the map's.
      const view = toView(p.position);
      if (this.hudReady() && this.hud.covers(view.x, view.y)) { this.press = null; return; }
      this.press = { x: p.x, y: p.y, sx: this.cameras.main.scrollX, sy: this.cameras.main.scrollY, moved: false };
    });
    this.input.on('pointermove', (p) => {
      if (this.pinch) {
        const f = fingers();
        if (f.length >= 2) {
          const [a, b] = f, d = Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y));
          this.zoomKeeping(this.pinch.world, (a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.zoom * (d / this.pinch.dist));
        }
        return;
      }
      if (!this.press || !p.isDown) return;
      const dx = p.x - this.press.x, dy = p.y - this.press.y;
      if (!this.press.moved && Math.hypot(dx, dy) < dragThreshold(CONFIG.camera.dragThresholdPx)) return;
      this.press.moved = true;
      const cam = this.cameras.main;
      cam.scrollX = this.press.sx - dx / cam.zoom;
      cam.scrollY = this.press.sy - dy / cam.zoom;
      this.clampCamera();
    });
    this.input.on('pointerup', (p) => {
      if (this.pinch) { if (!fingers().length) this.pinch = null; return; }
      const press = this.press;
      this.press = null;
      if (!press || press.moved) return;
      const w = this.screenToWorld(p.x, p.y);
      const b = this.pickBuilding(w.x, w.y);
      if (b) playBuildingSelect(this, b.type);
      this.select(b);
    });
  }

  /** The building on the tile under the point, else the frontmost picture there (as GameScene). */
  pickBuilding(wx, wy) {
    const g = screenToGrid(wx, wy);
    const onTile = this.gs.buildings.find((b) => g.x >= b.col && g.x < b.col + fpW(b) && g.y >= b.row && g.y < b.row + fpH(b));
    if (onTile) return onTile;
    const views = [...this.views.values()].filter((v) => v.sprite).sort((a, b) => b.sprite.depth - a.sprite.depth);
    for (const v of views) if (v.hitTest && v.hitTest(wx, wy)) return this.gs.getBuilding(v.id);
    return null;
  }

  select(b) {
    this.selectedId = b ? b.id : null;
    this.rangeCircle.showBuilding(b);
    if (b) { const v = this.views.get(b.id); if (v && v.pop) v.pop(); }
    if (this.hudReady()) this.hud.showBuilding(b);
  }

  /** Another of the owner's villages. */
  switchTo(baseId) {
    if (baseId === this.baseId) return;
    this.scene.stop('VisitHudScene');
    this.scene.restart({ baseId, username: this.username, bases: this.bases, from: this.from });
  }

  /** Back to the title screen: the owner's card again, over the window it was opened from (closing it lands there). */
  leave() {
    this.scene.stop('VisitHudScene');
    this.scene.start('TitleScene', { reopenPlayer: this.username, reopenFrom: this.from, reopenBase: this.baseId });
  }
}
