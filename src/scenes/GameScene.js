// Map, buildings, enemies, projectiles, camera, placement and selection.
// Draws state and routes input; every rule lives in src/logic/ (called through GameState).
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { GameState } from '../state/GameState.js';
import { loadGame } from '../logic/save.js';
import { session } from '../net/account.js';
import { AchievementTracker } from '../net/AchievementTracker.js';
import { gridToScreen, screenToGrid, rangeEllipse } from '../logic/iso.js';
import { canPlaceRect, footprintCenter, fpW, fpH, rectTiles } from '../logic/grid.js';
import { checkBuy, footprintDims, isDefense, typeConfig, planSwap, defenseRange, wallGroup } from '../logic/buildings.js';
import { tutorialAllows } from '../logic/tutorial.js';
import { isWaveActive, clamp } from '../logic/util.js';
import { mineShowsCoin } from '../logic/economy.js';
import { MAX_STEP } from '../logic/simulate.js';
import { BuildingView, buildingTextureKey, placeBuildingSprite } from '../objects/BuildingView.js';
import { EnemyView } from '../objects/EnemyView.js';
import { WallView, placeWallTile } from '../objects/WallView.js';
import { ProjectileView } from '../objects/ProjectileView.js';
import { PoolView, POOL_COLOR } from '../objects/PoolView.js';
import { RangeCircle } from '../objects/RangeCircle.js';
import { DayNight } from '../objects/DayNight.js';
import { Villagers } from '../objects/Villagers.js';
import { AirHum } from '../objects/AirHum.js';
import { BeamHum } from '../objects/BeamHum.js';
import { floatText, splashRing, fireballImpact, fireworkBurst, breakerExplosion } from '../objects/Effects.js';
import { TEX, SFX, MUSIC, FIRE_SFX, ENEMY_ATTACK_SFX, ENEMY_VOICE } from '../assetKeys.js';
import { playSfx, playSfxCapped, playSfxEndingIn, playVoiceLine, playMusic, stopMusic, crossfadeMusic, fadeOutMusic, pauseMusic, resumeMusic } from '../audio.js';
import { COLORS } from '../theme.js';

const ZOOM_STEP = 1.1;
const FIREWORK_IMPACT_MAX = 3; // copies of the 6 s firework crackle allowed at once
// Most copies of an enemy's hit / jump sound, and of the Bomber's long bomb rumble, playing at once.
const ENEMY_HIT_MAX = 4;
// The enemy-killed sound plays this much quieter than full volume.
const ELIMINATED_VOLUME = 0.6;
const BOMB_IMPACT_MAX = 3;
// Tower of Rah: the beam leaves from the head (this share of the picture's height above its base) and is
// drawn thicker and hotter at each heat stage.
const BEAM_MUZZLE = 0.84;
const BEAM_STAGES = [
  { width: 3, color: 0xff9a2a, glow: 0xff6a00 },
  { width: 5, color: 0xff4a1a, glow: 0xff2a00 },
  { width: 8, color: 0xfff0b0, glow: 0xff5a1a }
];
const FLOCK_SCAN_MS = 2600;
const CHATTER_SECONDS = [6, 14]; // how often an enemy says its voice line while it's on the map // how often a F.L.O.C.K Tower pulses its scan ring during attacks
const PLANNING_FADE_MS = 600; // village music hands over to the planning track this fast at dusk
/** 120 -> "2:00" */
const UIClock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}`;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.mode = (data && data.mode) || 'new';
  }

  create() {
    const gs = new GameState();
    if (this.mode === 'continue' || this.mode === 'retry') {
      const r = loadGame(gs.storage);
      if (r.status === 'ok') gs.loadFromSave(r.data);
      else gs.startNew();
    } else {
      gs.startNew();
    }
    this.gs = gs;
    this.registry.set('gameState', gs);

    // The map image is drawn at MAP.imageWidth x MAP.imageHeight world pixels (see mapTiles.js).
    this.add.image(0, 0, TEX.map).setOrigin(0, 0).setDisplaySize(MAP.imageWidth, MAP.imageHeight).setDepth(-10000);
    this.dayNight = new DayNight(this); // night map crossfade + ambient tint for world sprites
    this.villagers = new Villagers(this, gs); // decorative gnomes: wander by day, inside at night
    this.airHum = new AirHum(this); // plane drone while Bombers fly
    this.beamHum = new BeamHum(this); // Tower of Rah beam loop while any beam burns
    this.views = { buildings: new Map(), enemies: new Map(), projectiles: new Map(), pools: new Map() };
    this.rangeCircle = new RangeCircle(this);
    this.selectionGfx = this.add.graphics().setDepth(-5000);
    this.ghost = null;
    this.placement = null;
    this.selectedId = null;
    this.editMode = false;
    this.editGfx = this.add.graphics().setDepth(-4500);
    this.markers = [];
    this.press = null;
    this.resumedAt = 0;
    this.endingGame = false;

    this.setupCamera();
    this.setupInput();
    this.subscribe();

    // Retry after a lost night: rewound to that dusk, then a grace period of daytime to rebuild.
    if (this.mode === 'retry') {
      gs.startGrace();
      this.registry.set('pendingBanner', `Rebuild! Night returns in ${UIClock(CONFIG.dayNight.graceSeconds)}`);
    } else {
      gs.resumeClock();
    }
    this.syncViews(0);
    this.scene.launch('UIScene');
    this.playPhaseMusic();

    // The planning track is timed to the countdown, so it pauses with the game.
    this.events.on(Phaser.Scenes.Events.PAUSE, () => pauseMusic(MUSIC.planning));
    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.resumedAt = this.time.now; resumeMusic(MUSIC.planning); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gs.offContext(this));

    // Logged in with a village open: count stats, record the furthest wave and award achievements.
    if (session.loggedIn && session.activeBase) {
      this.tracker = new AchievementTracker(gs, session);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.tracker.destroy(); this.tracker = null; session.flush(); });
    }
  }

  /** Music for the current phase when the scene starts (e.g. Continue can resume mid-countdown). */
  playPhaseMusic() {
    const phase = this.gs.wave && this.gs.wave.phase;
    if (phase === 'countdown') this.playPlanningMusic(true); // also replaces the title music
    else if (phase === 'active') this.playAttackMusic();
    else playMusic(this, MUSIC.village);
  }

  /**
   * The combat planning track for the wave countdown. It's as long as the countdown and plays once, so
   * it ends as the wave hits; `resume` (Continue mid-countdown) starts it at the matching point.
   */
  playPlanningMusic(resume = false) {
    if (!this.cache.audio.exists(MUSIC.planning)) { fadeOutMusic(this, PLANNING_FADE_MS); return; }
    if (resume) {
      const left = Math.max(0, this.gs.wave.countdown);
      playMusic(this, MUSIC.planning, { loop: false, seek: CONFIG.rules.waveCountdown - left });
    } else {
      crossfadeMusic(this, MUSIC.planning, PLANNING_FADE_MS, { loop: false });
    }
  }

  /** Attack track at full volume immediately; the village track stands in if the attack file is missing. */
  playAttackMusic() {
    playMusic(this, this.cache.audio.exists(MUSIC.attack) ? MUSIC.attack : MUSIC.village);
  }

  /**
   * Now and then (every CHATTER_SECONDS, at random) one of the enemies on the map that has a voice line
   * (ENEMY_VOICE: the Sneaker Shark's "Tralalero tralala", the Grunt's "Tung tung tung sahur") says it.
   * One line at a time; the kind is picked at random among those present.
   */
  enemyChatter(delta) {
    if (this.chatterIn === undefined) this.chatterIn = Phaser.Math.FloatBetween(CHATTER_SECONDS[0], CHATTER_SECONDS[1]) * 0.5;
    this.chatterIn -= delta / 1000;
    if (this.chatterIn > 0) return;
    this.chatterIn = Phaser.Math.FloatBetween(CHATTER_SECONDS[0], CHATTER_SECONDS[1]);
    if (this.endingGame) return;
    const kinds = [...new Set(this.gs.enemies.filter((e) => e.alive && ENEMY_VOICE[e.kind]).map((e) => e.kind))];
    if (!kinds.length) return;
    // All voice lines share one "set", so two enemies never talk over each other.
    playVoiceLine(this, [ENEMY_VOICE[Phaser.Utils.Array.GetRandom(kinds)]], 'enemyVoices');
  }

  /**
   * Tower of Rah beams: from the head on top of the tower to the middle of the target's body, getting thicker
   * and hotter (orange, red, white-hot) at each heat stage, with a flickering wobble and glows at both ends.
   */
  drawBeams(time) {
    if (!this.beamGfx) {
      this.beamGfx = this.add.graphics().setDepth(2650).setBlendMode('ADD');
      this.beamGlows = [];
    }
    const g = this.beamGfx;
    g.clear();
    let n = 0;
    for (const b of this.gs.buildings) {
      if (b.type !== 'ra' || b.destroyed || !b.beamTargetId) continue;
      const bv = this.views.buildings.get(b.id), ev = this.views.enemies.get(b.beamTargetId);
      if (!bv || !ev || !bv.sprite || !ev.sprite) continue;
      const a = { x: bv.sprite.x, y: bv.sprite.y - BEAM_MUZZLE * bv.sprite.displayHeight };
      const t = { x: ev.sprite.x, y: ev.sprite.y - ev.sprite.originY * ev.sprite.displayHeight + 0.5 * ev.sprite.displayHeight };
      const st = BEAM_STAGES[b.beamStage || 0];
      const flick = 1 + 0.18 * Math.sin(time * 0.05 + b.col);
      g.lineStyle(st.width * 2.6 * flick, st.glow, 0.28).lineBetween(a.x, a.y, t.x, t.y);
      g.lineStyle(st.width * flick, st.color, 0.95).lineBetween(a.x, a.y, t.x, t.y);
      g.lineStyle(Math.max(1, st.width * 0.35), 0xffffff, 0.9).lineBetween(a.x, a.y, t.x, t.y);
      for (const [p, k] of [[a, 0.55], [t, 0.8]]) {
        const glow = this.beamGlows[n] || (this.beamGlows[n] = this.add.image(0, 0, TEX.light).setBlendMode('ADD').setDepth(2651));
        glow.setVisible(true).setPosition(p.x, p.y).setTint(st.glow).setDisplaySize(st.width * 7 * k * flick, st.width * 7 * k * flick).setAlpha(0.9);
        n++;
      }
    }
    for (let i = n; i < this.beamGlows.length; i++) this.beamGlows[i].setVisible(false);
  }

  /** During attacks each F.L.O.C.K Tower sends out a faint scan ring to the edge of its range now and then. */
  flockScan(delta) {
    if (!isWaveActive(this.gs)) { this.flockScanT = 0; return; }
    this.flockScanT = (this.flockScanT || 0) + delta;
    if (this.flockScanT < FLOCK_SCAN_MS) return;
    this.flockScanT = 0;
    for (const b of this.gs.buildings) {
      if (b.type !== 'flock' || b.destroyed) continue;
      const c = gridToScreen(footprintCenter(b).x, footprintCenter(b).y);
      const { rx, ry } = rangeEllipse(defenseRange('flock', b.level));
      const ring = this.add.graphics().setDepth(2590).setPosition(c.x, c.y).setScale(0.1).setAlpha(0.55);
      ring.lineStyle(3, 0x4cd6ff, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
      ring.fillStyle(0x4cd6ff, 0.06).fillEllipse(0, 0, rx * 2, ry * 2);
      this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    }
  }

  update(time, delta) {
    if (!this.endingGame) this.gs.update(Math.min(delta / 1000, MAX_STEP));
    this.dayNight.update(this.gs.clock);
    this.villagers.update(Math.min(delta / 1000, MAX_STEP), time);
    this.airHum.update(this.endingGame ? [] : this.gs.enemies, delta / 1000);
    this.beamHum.update(this.endingGame ? [] : this.gs.buildings, delta / 1000);
    this.flockScan(delta);
    this.drawBeams(time);
    this.enemyChatter(delta);
    // Follow the pointer every frame: a move that leaves a UI element can be consumed by UIScene.
    if (this.placement) {
      const p = this.input.activePointer;
      if (!this.lastGhostPtr || this.lastGhostPtr.x !== p.x || this.lastGhostPtr.y !== p.y || this.cameraMoved()) {
        this.updateGhost(p.x, p.y);
        this.lastGhostPtr = { x: p.x, y: p.y };
      }
    }
    this.syncViews(time);
  }

  // ---------- camera ----------
  setupCamera() {
    const cam = this.cameras.main;
    this.mapSize = { w: MAP.imageWidth, h: MAP.imageHeight };
    cam.setZoom(Math.max(CONFIG.camera.startZoom, this.minZoom()));
    const th = this.gs.townHall;
    const c = footprintCenter(th);
    const s = gridToScreen(c.x, c.y);
    cam.centerOn(s.x, s.y);
    this.clampCamera();
  }

  /**
   * Furthest zoom-out that still fills the screen with map. The config's minZoom is used when the
   * map image is big enough (2560 x 1440 for 0.5 at 1280 x 720); a smaller map raises the limit.
   */
  minZoom() {
    const cam = this.cameras.main;
    return Math.max(CONFIG.camera.minZoom, cam.width / this.mapSize.w, cam.height / this.mapSize.h);
  }

  /** Keep the whole view inside the map so its edge is never visible. */
  clampCamera() {
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom, viewH = cam.height / cam.zoom;
    // scroll = (view center) - width/2, and the view center may only go where the view stays on the map.
    const axis = (scroll, half, viewSize, mapSize) => {
      if (viewSize >= mapSize) return mapSize / 2 - half; // view bigger than map: center it
      return clamp(scroll, viewSize / 2 - half, mapSize - viewSize / 2 - half);
    };
    cam.scrollX = axis(cam.scrollX, cam.width / 2, viewW, this.mapSize.w);
    cam.scrollY = axis(cam.scrollY, cam.height / 2, viewH, this.mapSize.h);
  }

  screenToWorld(px, py) {
    const cam = this.cameras.main;
    return {
      x: (px - cam.width / 2) / cam.zoom + cam.width / 2 + cam.scrollX,
      y: (py - cam.height / 2) / cam.zoom + cam.height / 2 + cam.scrollY
    };
  }

  worldToScreen(wx, wy) {
    const cam = this.cameras.main;
    return {
      x: (wx - cam.scrollX - cam.width / 2) * cam.zoom + cam.width / 2,
      y: (wy - cam.scrollY - cam.height / 2) * cam.zoom + cam.height / 2
    };
  }

  /** Scroll wheel zoom toward the cursor. */
  zoomAt(px, py, deltaY) {
    const cam = this.cameras.main;
    const before = this.screenToWorld(px, py);
    const factor = deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const zoom = clamp(cam.zoom * factor, this.minZoom(), CONFIG.camera.maxZoom);
    cam.setZoom(zoom);
    cam.scrollX = before.x - cam.width / 2 - (px - cam.width / 2) / zoom;
    cam.scrollY = before.y - cam.height / 2 - (py - cam.height / 2) / zoom;
    this.clampCamera();
  }

  // ---------- input ----------
  setupInput() {
    const cam = this.cameras.main;
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    this.input.on('pointerdown', (p) => {
      this.press = null;
      if (this.isOverUI(p)) return;
      if (p.rightButtonDown()) {
        if (this.placement) this.cancelPlacement();
        else if (this.editMode) this.setEditMode(false);
        return;
      }
      this.press = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, dragging: false };
    });

    this.input.on('pointermove', (p) => {
      if (this.placement) this.updateGhost(p.x, p.y);
      const pr = this.press;
      if (!pr || !p.isDown) return;
      if (!pr.dragging && Phaser.Math.Distance.Between(p.x, p.y, pr.x, pr.y) >= CONFIG.camera.dragThresholdPx) pr.dragging = true;
      if (pr.dragging) {
        cam.scrollX = pr.scrollX - (p.x - pr.x) / cam.zoom;
        cam.scrollY = pr.scrollY - (p.y - pr.y) / cam.zoom;
        this.clampCamera();
      }
    });

    this.input.on('pointerup', (p) => {
      const pr = this.press;
      this.press = null;
      if (!pr || pr.dragging || p.button !== 0) return;
      this.handleClick(p.x, p.y);
    });

    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.isOverUI(p)) return;
      this.zoomAt(p.x, p.y, dy);
    });

    this.input.keyboard.on('keydown-R', () => this.rotatePlacement());
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.time.now - this.resumedAt < 250) return; // the Esc that closed the pause menu
      if (this.placement) this.cancelPlacement();
      else if (this.editMode) this.setEditMode(false);
      else this.openPause();
    });
  }

  cameraMoved() {
    const cam = this.cameras.main;
    const key = `${cam.scrollX},${cam.scrollY},${cam.zoom}`;
    const moved = key !== this.lastCamKey;
    this.lastCamKey = key;
    return moved;
  }

  isOverUI(p) {
    const ui = this.scene.get('UIScene');
    return !!ui && this.scene.isActive('UIScene') && ui.isPointerOverUI(p);
  }

  handleClick(px, py) {
    const w = this.screenToWorld(px, py);
    if (this.placement) {
      this.updateGhost(px, py);
      this.confirmPlacement();
      return;
    }
    const b = this.pickBuilding(w.x, w.y);
    if (this.editMode) {
      // Edit mode: clicking a building picks it up to move; nothing else happens.
      if (b) { playSfx(this, SFX.buildingSelect); this.beginMove(b.id); }
      return;
    }
    if (!b) { this.select(null); return; }
    // A mine showing its coin: this click just collects. Clicking it again (coin gone) opens its panel.
    // Mines: with the coin showing, a click only collects (coin sound). Otherwise (or if it couldn't
    // collect, e.g. storage full) it opens the panel with the info sound, like any building.
    const coinShowing = b.type === 'mine' && mineShowsCoin(b) && !isWaveActive(this.gs);
    let collected = false;
    if (coinShowing && tutorialAllows(this.gs, 'collect')) collected = this.gs.collect(b.id).ok;
    const canSelect = tutorialAllows(this.gs, 'select', b.type) && !collected;
    if (collected || canSelect) this.views.buildings.get(b.id)?.pop(); // click feedback
    if (canSelect) {
      playSfx(this, SFX.buildingSelect);
      if (this.selectedId !== b.id) this.select(b.id); // already selected: stays as it is (Info opens the panel)
    }
  }

  /** Frontmost building whose sprite has a visible pixel under the point, else whose footprint contains it. */
  pickBuilding(wx, wy) {
    const views = [...this.views.buildings.values()].sort((a, b) => b.sprite.depth - a.sprite.depth);
    for (const v of views) {
      if (this.placement && this.placement.id === v.id) continue;
      if (v.hitTest(wx, wy)) return this.gs.getBuilding(v.id);
    }
    const g = screenToGrid(wx, wy);
    return this.gs.buildings.find((b) => g.x >= b.col && g.x < b.col + fpW(b) && g.y >= b.row && g.y < b.row + fpH(b)) || null;
  }

  openPause() {
    if (this.gs.gameOver || this.endingGame) return;
    this.scene.pause('GameScene');
    this.scene.pause('UIScene');
    this.scene.launch('PauseScene');
  }

  // ---------- selection ----------
  select(id) {
    this.selectedId = id;
    this.groupMode = false;
    this.updateSelectionVisuals();
    this.gs.emit('selectionChanged', { id, group: false });
  }

  /** Wall panel: switch between the one selected wall and its whole connected group (same level). */
  setGroupMode(on) {
    const b = this.selectedId ? this.gs.getBuilding(this.selectedId) : null;
    this.groupMode = !!on && !!b && b.type === 'wall';
    this.updateSelectionVisuals();
    this.gs.emit('selectionChanged', { id: this.selectedId, group: this.groupMode });
  }

  updateSelectionVisuals() {
    const b = this.selectedId ? this.gs.getBuilding(this.selectedId) : null;
    this.selectionGfx.clear();
    if (!b) {
      if (!this.placement) this.rangeCircle.hide();
      return;
    }
    // Group mode outlines every wall in the selected group (worked out live, so it follows upgrades).
    const outlined = this.groupMode && b.type === 'wall' ? wallGroup(this.gs, b) : [b];
    for (const o of outlined) {
      const pts = [
        gridToScreen(o.col, o.row), gridToScreen(o.col + fpW(o), o.row),
        gridToScreen(o.col + fpW(o), o.row + fpH(o)), gridToScreen(o.col, o.row + fpH(o))
      ];
      this.selectionGfx.lineStyle(3, COLORS.panelEdge, 1).strokePoints(pts, true);
    }
    if (isDefense(b.type)) {
      const cfg = typeConfig(b.type);
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, defenseRange(b.type, b.level), cfg.minRange);
    } else {
      this.rangeCircle.hide();
    }
  }

  // ---------- edit mode (the only way to move buildings) ----------
  canEdit() {
    return !isWaveActive(this.gs) && !this.gs.gameOver && tutorialAllows(this.gs, 'move');
  }

  setEditMode(on) {
    if (on && !this.canEdit()) return;
    if (this.editMode === on) return;
    if (this.placement) this.cancelPlacement();
    this.editMode = on;
    this.select(null);
    this.drawEditOutlines();
    this.gs.emit('editModeChanged', { active: on });
  }

  /** In edit mode every building's footprint is outlined so it's clear what can be picked up. */
  drawEditOutlines() {
    const g = this.editGfx;
    g.clear();
    if (!this.editMode) return;
    for (const b of this.gs.buildings) {
      if (this.placement && this.placement.id === b.id) continue;
      const pts = [
      gridToScreen(b.col, b.row), gridToScreen(b.col + fpW(b), b.row),
      gridToScreen(b.col + fpW(b), b.row + fpH(b)), gridToScreen(b.col, b.row + fpH(b))
    ];
      g.fillStyle(0xffffff, 0.12).fillPoints(pts, true);
      g.lineStyle(2, 0xffffff, 0.8).strokePoints(pts, true);
    }
  }

  // ---------- placement / move ----------
  beginPlacement(type) {
    if (this.editMode) this.setEditMode(false);
    if (this.placement) this.endPlacement();
    this.select(null);
    const orient = type === 'wall' ? this.wallOrient || 'x' : undefined;
    this.placement = { mode: 'buy', type, level: 1, orient, ...footprintDims(type, orient), col: 0, row: 0, valid: false };
    this.createGhost();
    this.gs.tutorialEvent('placementStarted', { type });
    this.gs.emit('placementChanged', { active: true, type });
    const p = this.input.activePointer;
    this.updateGhost(p.x, p.y);
  }

  beginMove(id) {
    const b = this.gs.getBuilding(id);
    if (!b || !this.editMode || isWaveActive(this.gs)) return;
    if (this.placement) this.endPlacement();
    this.select(null);
    this.placement = { mode: 'move', id, type: b.type, level: b.level, orient: b.orient, w: fpW(b), h: fpH(b), col: b.col, row: b.row, valid: true };
    const view = this.views.buildings.get(id);
    if (view) view.setAlpha(0.3);
    this.createGhost();
    this.drawEditOutlines();
    this.gs.emit('placementChanged', { active: true, type: b.type });
    const p = this.input.activePointer;
    this.updateGhost(p.x, p.y);
  }

  createGhost() {
    const pl = this.placement;
    const key = buildingTextureKey(this, pl.type, pl.level);
    // A wall ghost is one fence picture when there's segment art, else one placeholder per tile.
    const count = pl.type === 'wall' ? pl.w * pl.h : 1;
    this.ghost = {
      // tiles draw over the ghost sprite so green/red stays readable
      tiles: this.add.graphics().setDepth(2470),
      sprites: Array.from({ length: count }, () => this.add.image(0, 0, key).setOrigin(0.5, 1).setAlpha(0.6).setDepth(2460))
    };
  }

  /** Turn a wall being placed or moved (R key or the Rotate button). */
  rotatePlacement() {
    const pl = this.placement;
    if (!pl || pl.type !== 'wall') return;
    pl.orient = pl.orient === 'x' ? 'y' : 'x';
    Object.assign(pl, footprintDims('wall', pl.orient));
    if (pl.mode === 'buy') this.wallOrient = pl.orient; // the next wall keeps this direction
    const p = this.input.activePointer;
    this.updateGhost(p.x, p.y);
    this.gs.emit('placementChanged', { active: true, type: pl.type });
  }

  updateGhost(px, py) {
    const pl = this.placement;
    if (!pl || !this.ghost) return;
    const w = this.screenToWorld(px, py);
    const g = screenToGrid(w.x, w.y);
    pl.col = Math.round(g.x - pl.w / 2);
    pl.row = Math.round(g.y - pl.h / 2);
    const spot = canPlaceRect(this.gs.buildings, pl.col, pl.row, pl.w, pl.h, pl.mode === 'move' ? pl.id : null);
    // Moving onto exactly one other building: snap onto it and preview the two trading places.
    let swap = null;
    if (pl.mode === 'move' && !spot.ok && !isWaveActive(this.gs)) {
      const plan = planSwap(this.gs.buildings, this.gs.getBuilding(pl.id), pl.col, pl.row, pl.orient);
      if (plan && plan.ok) { swap = plan; pl.col = plan.to.col; pl.row = plan.to.row; }
    }
    this.showSwapPreview(swap);
    pl.valid = (spot.ok || !!swap) && (pl.mode === 'buy' ? checkBuy(this.gs, pl.type).ok : !isWaveActive(this.gs));

    const color = pl.valid ? COLORS.valid : COLORS.invalid;
    const t = this.ghost.tiles;
    t.clear();
    for (let r = pl.row; r < pl.row + pl.h; r++) {
      for (let c = pl.col; c < pl.col + pl.w; c++) {
        const pts = [gridToScreen(c, r), gridToScreen(c + 1, r), gridToScreen(c + 1, r + 1), gridToScreen(c, r + 1)];
        t.fillStyle(color, 0.35).fillPoints(pts, true);
        t.lineStyle(1, color, 0.8).strokePoints(pts, true);
      }
    }
    if (swap) {
      const o = this.gs.getBuilding(swap.otherId);
      for (const tile of rectTiles(swap.otherTo.col, swap.otherTo.row, fpW(o), fpH(o))) {
        const pts = [gridToScreen(tile.col, tile.row), gridToScreen(tile.col + 1, tile.row), gridToScreen(tile.col + 1, tile.row + 1), gridToScreen(tile.col, tile.row + 1)];
        t.fillStyle(color, 0.35).fillPoints(pts, true);
        t.lineStyle(1, color, 0.8).strokePoints(pts, true);
      }
    }
    if (pl.type === 'wall') this.placeWallGhost(this.ghost.sprites, pl.col, pl.row, pl.w, pl.h, pl.orient, pl.level);
    else {
      placeBuildingSprite(this.ghost.sprites[0], pl.col, pl.row, pl.w, pl.type, pl.level);
    }
    for (const sp of this.ghost.sprites) sp.setDepth(2460).setTint(pl.valid ? 0xb8ffb8 : 0xff9a9a);
    if (isDefense(pl.type)) {
      const cfg = typeConfig(pl.type);
      this.rangeCircle.show(pl.col + pl.w / 2, pl.row + pl.h / 2, defenseRange(pl.type, pl.level), cfg.minRange);
    }
  }

  /**
   * While a moved building hovers over another one it can swap with, that one is dimmed and a ghost
   * of it shows where it will go (the moved building's old spot). `plan` null clears the preview.
   */
  /** Stand wall ghost sprites on a footprint: one wall (its pillar, at that level's size) per tile. */
  placeWallGhost(sprites, col, row, w, h, orient, level = 1) {
    rectTiles(col, row, w, h).forEach((t, i) => placeWallTile(sprites[i], t.col, t.row, level));
  }

  showSwapPreview(plan) {
    const id = plan ? plan.otherId : null;
    if (this.swapPreview && this.swapPreview.id !== id) this.clearSwapPreview();
    if (!plan) return;
    const o = this.gs.getBuilding(id);
    if (!this.swapPreview) {
      const key = buildingTextureKey(this, o.type, o.level);
      const count = o.type === 'wall' ? fpW(o) * fpH(o) : 1;
      this.swapPreview = { id, sprites: Array.from({ length: count }, () => this.add.image(0, 0, key).setOrigin(0.5, 1).setAlpha(0.6)) };
      this.views.buildings.get(id)?.setAlpha(0.3);
    }
    const { col, row } = plan.otherTo;
    if (o.type === 'wall') this.placeWallGhost(this.swapPreview.sprites, col, row, fpW(o), fpH(o), o.orient, o.level);
    else placeBuildingSprite(this.swapPreview.sprites[0], col, row, fpW(o), o.type, o.level);
    for (const sp of this.swapPreview.sprites) sp.setDepth(2460).setTint(0xb8ffb8);
  }

  clearSwapPreview() {
    if (!this.swapPreview) return;
    for (const sp of this.swapPreview.sprites) sp.destroy();
    this.views.buildings.get(this.swapPreview.id)?.setAlpha(1);
    this.swapPreview = null;
  }

  confirmPlacement() {
    const pl = this.placement;
    if (!pl) return;
    if (!pl.valid) { playSfx(this, SFX.invalid); return; }
    const r = pl.mode === 'buy'
      ? this.gs.placeNew(pl.type, pl.col, pl.row, pl.orient)
      : this.gs.moveBuilding(pl.id, pl.col, pl.row, pl.orient);
    if (!r.ok) { playSfx(this, SFX.invalid); return; }
    // A new building bought from the shop lands with the upgrade sound; moving one keeps the place sound.
    playSfx(this, pl.mode === 'buy' ? SFX.upgrade : SFX.place);
    this.endPlacement();
    this.syncViews(this.time.now);
    // Walls: keep laying segments in a row while you can afford them (Esc to stop).
    if (pl.mode === 'buy' && pl.type === 'wall' && checkBuy(this.gs, 'wall').ok) this.beginPlacement('wall');
  }

  cancelPlacement() {
    const pl = this.placement;
    if (!pl) return;
    this.endPlacement();
    if (pl.mode === 'buy') this.gs.tutorialEvent('placementCancelled');
  }

  endPlacement() {
    const pl = this.placement;
    if (!pl) return;
    if (pl.mode === 'move') {
      const view = this.views.buildings.get(pl.id);
      if (view) view.setAlpha(1);
    }
    this.clearSwapPreview();
    if (this.ghost) {
      this.ghost.tiles.destroy();
      for (const sp of this.ghost.sprites) sp.destroy();
      this.ghost = null;
    }
    this.placement = null;
    this.rangeCircle.hide();
    this.updateSelectionVisuals();
    this.drawEditOutlines();
    this.gs.emit('placementChanged', { active: false });
  }

  // ---------- state events -> effects ----------
  subscribe() {
    const gs = this.gs;
    const on = (name, fn) => gs.on(name, fn, this);
    const enemyPos = (d) => gridToScreen(d.x, d.y);

    on('enemyHit', (d) => {
      const v = this.views.enemies.get(d.id);
      if (v && d.source !== 'pool' && d.source !== 'beam') v.flash(this.time.now); // pool / beam ticks would keep them white
      const s = enemyPos(d);
      if (d.source === 'beam') {
        this.beamText = this.beamText || new Map();
        const last = this.beamText.get(d.id) || 0;
        if (this.time.now - last > 450) {
          this.beamText.set(d.id, this.time.now);
          const lift = v && v.sprite ? v.sprite.y - v.sprite.originY * v.sprite.displayHeight + 0.35 * v.sprite.displayHeight - s.y : -20;
          floatText(this, s.x + Phaser.Math.Between(-8, 8), s.y + lift, `${Math.round(d.amount * 5)}/s`, '#ffb36b', 13);
        }
        return;
      }
      if (d.source === 'pool') {
        // Pool ticks: small pink numbers, no hit sound (they come every half second).
        floatText(this, s.x + Phaser.Math.Between(-6, 6), s.y - 16, `${Math.round(d.amount)}`, '#ff8fc8', 12);
        return;
      }
      // Over the enemy's body (flyers float high), not on the ground beneath it.
      const lift = v && v.sprite ? v.sprite.y - v.sprite.originY * v.sprite.displayHeight + 0.35 * v.sprite.displayHeight - s.y : -20;
      floatText(this, s.x, s.y + lift, `${Math.round(d.amount)}`, '#ffffff', 14);
      playSfx(this, SFX.hit);
    });
    // Wall Breaker: a big cartoon boom the size of its radius, a jolt, and its blast sound.
    on('enemyExploded', (d) => {
      const s = enemyPos(d);
      breakerExplosion(this, s.x, s.y, d.radius, TEX.light);
      this.cameras.main.shake(240, 0.006);
      playSfxCapped(this, SFX.breakerBlast, ENEMY_HIT_MAX);
    });
    // The "deployed" call plays once per wave, when its first Wall Breaker shows up.
    on('enemySpawned', (d) => {
      if (d.kind !== 'breaker' || this.breakerAnnounced) return;
      this.breakerAnnounced = true;
      playSfx(this, SFX.breakerDeployed);
    });
    on('enemyKilled', (d) => {
      const view = this.views.enemies.get(d.id);
      if (view) view.spawnCorpse(); // its death picture, left where it fell
      playSfxCapped(this, SFX.enemyEliminated, ENEMY_HIT_MAX, { volume: ELIMINATED_VOLUME });
      if (d.bounty > 0) {
        const s = enemyPos(d);
        floatText(this, s.x, s.y - 34, `+${d.bounty}`, COLORS.textGold, 16);
      }
    });
    on('buildingDamaged', (d) => {
      const v = this.views.buildings.get(d.id);
      if (!v) return;
      v.flash(this.time.now);
      const top = v.topCenter();
      floatText(this, top.x + Phaser.Math.Between(-20, 20), top.y + 30, `${Math.round(d.amount)}`, COLORS.textBad, 15);
    });
    on('storageDrained', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y + 10, `-${d.amount}`, COLORS.textGold, 16); }
    });
    on('buildingDestroyed', (d) => {
      playSfx(this, SFX.buildingDestroyed);
      if (this.selectedId === d.id) this.updateSelectionVisuals();
    });
    on('splash', (d) => {
      const s = gridToScreen(d.x, d.y);
      if (d.kind === 'firework') {
        // Bursts up where the flyers are (they're drawn 24 px above their shadow); the ring marks the area hit.
        fireworkBurst(this, s.x, s.y - 24, d.radius, TEX.light);
        playSfxCapped(this, SFX.fireworkImpact, FIREWORK_IMPACT_MAX); // long crackle: never more than a few at once
        splashRing(this, s.x, s.y, d.radius, 0xff3b5c, { duration: 600, depth: 2710 });
      } else if (d.kind === 'wizard') {
        fireballImpact(this, s.x, s.y, d.radius, TEX.light); // flash, sparks, embers, shockwave
        // The exact area of effect, drawn above the flash and held a little longer so it reads clearly.
        splashRing(this, s.x, s.y, d.radius, 0xc054ff, { duration: 600, depth: 2710 });
        playSfx(this, SFX.wizardImpact);
      } else if (d.kind === 'catapult') {
        // The bottle bursts: a pink splash ring and droplets; the pool itself is a PoolView.
        splashRing(this, s.x, s.y, d.radius, POOL_COLOR, { duration: 450, depth: 2710 });
        pinkSplash(this, s.x, s.y);
        playSfx(this, SFX.catapultImpact);
      } else {
        splashRing(this, s.x, s.y, d.radius);
        if (d.kind === 'mortar') playSfx(this, SFX.mortarImpact);
      }
    });
    on('bombExploded', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, 0.6, 0xff8a3c);
      playSfxCapped(this, SFX.bombExplode, BOMB_IMPACT_MAX); // long rumble: a few at once is plenty
    });
    // Melee hits: a horde swinging at once would be a wall of noise, so only a few overlap.
    on('enemyAttack', (d) => {
      const view = this.views.enemies.get(d.id);
      if (view) view.attackPose(this.time.now);
      const key = ENEMY_ATTACK_SFX[d.kind];
      if (key) playSfxCapped(this, key, ENEMY_HIT_MAX);
    });
    on('enemyJump', () => playSfxCapped(this, SFX.sharkJump, ENEMY_HIT_MAX));
    // An invisible goblin gives itself away: a quick white puff where it pops into view.
    // A F.L.O.C.K Tower spots the first enemy to enter its (empty) range: its alert sound.
    on('flockSpotted', () => playSfxCapped(this, SFX.flockSpotted, 2));
    on('enemyRevealed', (d) => {
      const s = enemyPos(d);
      splashRing(this, s.x, s.y - 4, 0.45, 0xffffff, { duration: 380, depth: 2710 });
      const puff = this.add.image(s.x, s.y - 18, TEX.light).setBlendMode('ADD').setTint(0xdfe8ff).setDepth(2711).setScale(0.25);
      this.tweens.add({ targets: puff, scale: 0.55, alpha: 0, duration: 360, ease: 'Cubic.easeOut', onComplete: () => puff.destroy() });
    });
    on('projectileFired', (d) => {
      playSfx(this, FIRE_SFX[d.kind]);
      // Mortar: launch boom -> whistle through the air (ending as it lands) -> impact (on 'splash').
      if (d.kind === 'mortar') playSfxEndingIn(this, SFX.mortarTravel, CONFIG.projectiles.mortar.flightTime);
      // Gandolf says one of his lines as he throws (never over a line that's still playing).
      if (d.kind === 'wizard') playVoiceLine(this, SFX.wizardVoice);
    });
    // A gnome drops off a sack of gold at a Storage / the Village Hall.
    on('gnomeDelivered', (d) => {
      const v = this.views.buildings.get(d.dropId);
      if (!v || !d.added) return;
      const top = v.topCenter();
      floatText(this, top.x, top.y - 10, `+${d.added}`, COLORS.textGold, 18);
      playSfx(this, SFX.coinCollect, { volume: 0.45 });
    });
    // The player paid to rebuild a destroyed building (dawn's free wall rebuilds stay quiet).
    on('buildingRepaired', (d) => { if (d.paid) playSfx(this, SFX.repair); });
    // The Village Hall's own income: a small gold pop over it every few seconds (no sound, it's frequent).
    on('hallIncome', (d) => {
      const v = this.views.buildings.get(d.id);
      if (!v || !d.added) return;
      const top = v.topCenter();
      floatText(this, top.x + Phaser.Math.Between(-10, 10), top.y - 6, `+${d.added}`, COLORS.textGold, 15);
    });
    // Neegy Balloon: a puff where it lets troops go, and a pop when it's done.
    on('balloonDrop', (d) => {
      const s = enemyPos(d);
      if (d.onDeath) splashRing(this, s.x, s.y - 50, 0.7, 0xff5a3c, { duration: 420, depth: 2710 }); // shot down
      splashRing(this, s.x, s.y - 40, 0.5, 0xffe08a, { duration: 380, depth: 2710 });
    });
    on('balloonPopped', (d) => {
      const s = enemyPos(d);
      splashRing(this, s.x, s.y - 50, 0.7, 0xff5a3c, { duration: 420, depth: 2710 });
      floatText(this, s.x, s.y - 60, 'Pop!', '#ffd0c0', 16);
    });
    // A Mousetrap snaps: a burst ring the size of its catch radius, a jolt, and "SNAP!".
    on('trapSprung', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0xffc24a, { duration: 450, depth: 2710 });
      floatText(this, s.x, s.y - 30, 'SNAP!', '#ffd76a', 22);
      this.cameras.main.shake(140, 0.004);
      playSfxCapped(this, SFX.mousetrapSnap, 3);
      this.views.buildings.get(d.id)?.pop();
    });
    // A Tower of Rah beam heats up a stage (x3, then x8).
    on('beamHeatUp', () => playSfxCapped(this, SFX.raHeatUp, 2));
    on('mineCollected', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y - 20, `+${d.amount}`, COLORS.textGold, 22); }
      playSfx(this, SFX.coinCollect);
    });
    on('buildingUpgraded', (d) => {
      playSfx(this, SFX.upgrade);
      const view = d && this.views.buildings.get(d.id);
      if (view && view.growPop) view.growPop(d.level - 1, d.level); // walls just bounce (their size follows the level)
      this.updateSelectionVisuals();
    });
    on('buildingSold', (d) => {
      playSfx(this, SFX.sell);
      if (this.selectedId === d.id) this.select(null);
    });
    on('buildingMoved', () => this.updateSelectionVisuals());
    on('baseReset', () => this.select(null));
    on('waveTriggered', (d) => {
      this.showSpawnMarkers(d.paths);
      playSfx(this, SFX.waveCountdown);
      this.playPlanningMusic(); // dusk: the combat planning track plays through the countdown
    });
    on('waveStarted', () => {
      if (this.placement) this.cancelPlacement();
      this.setEditMode(false);
      playSfx(this, SFX.waveStart);
      this.playAttackMusic(); // hard cut to the attack soundtrack at full volume, no fade-in
    });
    on('waveCleared', () => {
      this.breakerAnnounced = false;
      this.clearSpawnMarkers();
      playSfx(this, SFX.waveClear);
      crossfadeMusic(this, MUSIC.village); // dawn: back to the village music
    });
    on('gameOver', (d) => this.onGameOver(d));
  }

  showSpawnMarkers(paths) {
    this.clearSpawnMarkers();
    for (const path of paths) {
      const [x, y] = MAP.spawnPoints[path];
      const s = gridToScreen(x, y);
      // A "!" warning floating over each entrance enemies will come from tonight.
      const m = this.add.image(s.x, s.y - 18, TEX.spawnMarker).setDepth(2400);
      this.tweens.add({ targets: m, scale: { from: 0.9, to: 1.12 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: m, y: m.y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.markers.push({ path, image: m });
    }
  }

  clearSpawnMarkers() {
    for (const m of this.markers) m.image.destroy();
    this.markers = [];
  }

  onGameOver(d) {
    if (this.endingGame) return;
    this.endingGame = true;
    if (this.placement) this.endPlacement();
    this.setEditMode(false);
    stopMusic();
    playSfx(this, SFX.gameOver);
    this.cameras.main.shake(400, 0.006);
    this.time.delayedCall(1400, () => {
      this.scene.stop('UIScene');
      this.scene.start('GameOverScene', { wave: d.wave });
    });
  }

  // ---------- views ----------
  syncList(list, map, make) {
    const seen = new Set();
    for (const item of list) {
      seen.add(item.id);
      let v = map.get(item.id);
      if (!v) { v = make(item); map.set(item.id, v); }
      v.sync(item, this.time.now);
    }
    for (const [id, v] of map) {
      if (!seen.has(id)) { v.destroy(); map.delete(id); }
    }
  }

  syncViews() {
    const gs = this.gs;
    this.syncList(gs.buildings, this.views.buildings, (b) => (b.type === 'wall' ? new WallView(this, b) : new BuildingView(this, b)));
    this.syncList(gs.enemies.filter((e) => e.alive), this.views.enemies, (e) => new EnemyView(this, e));
    this.syncList(gs.projectiles, this.views.projectiles, (p) => new ProjectileView(this, p));
    this.syncList(gs.pools || [], this.views.pools, (p) => new PoolView(this, p));
    if (this.placement && this.placement.mode === 'move') {
      const v = this.views.buildings.get(this.placement.id);
      if (v) v.setAlpha(0.3);
    }
  }

  /** Screen position above a building of this type (for the tutorial arrow), or null. */
  buildingScreenAnchor(type) {
    const b = this.gs.buildings.find((x) => x.type === type);
    const v = b && this.views.buildings.get(b.id);
    if (!v) return null;
    const top = v.topCenter();
    const bottom = this.worldToScreen(v.sprite.x, v.sprite.y);
    const t = this.worldToScreen(top.x, top.y);
    return { x: t.x, y: t.y, bottom: bottom.y, width: v.sprite.displayWidth * this.cameras.main.zoom };
  }

  spawnMarkerScreen() {
    const m = this.markers[0];
    return m ? this.worldToScreen(m.image.x, m.image.y) : null;
  }
}

/** Droplets of pink oil flung up from a Catapult hit. */
function pinkSplash(scene, x, y) {
  for (let i = 0; i < 10; i++) {
    const a = Phaser.Math.FloatBetween(Math.PI * 1.05, Math.PI * 1.95); // upward fan
    const v = Phaser.Math.Between(26, 56);
    const drop = scene.add.circle(x, y - 4, Phaser.Math.Between(2, 4), i % 3 ? POOL_COLOR : 0xffc2e2, 0.95).setDepth(2720);
    const peak = y - 4 + Math.sin(a) * v * 0.6;
    scene.tweens.chain({
      targets: drop,
      tweens: [
        { x: x + Math.cos(a) * v * 0.6, y: peak, duration: 180, ease: 'Quad.easeOut' },
        { x: x + Math.cos(a) * v, y: y + 6, alpha: 0, duration: 280, ease: 'Quad.easeIn' }
      ],
      onComplete: () => drop.destroy()
    });
  }
}
