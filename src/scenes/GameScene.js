// Map, buildings, enemies, projectiles, camera, placement and selection.
// Draws state and routes input; every rule lives in src/logic/ (called through GameState).
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { IS_TOUCH } from '../device.js';
import { MAP } from '../mapTiles.js';
import { GameState } from '../state/GameState.js';
import { loadGame } from '../logic/save.js';
import { session } from '../net/account.js';
import { AchievementTracker } from '../net/AchievementTracker.js';
import { gridToScreen, screenToGrid, rangeEllipse } from '../logic/iso.js';
import { canPlaceRect, footprintCenter, fpW, fpH, rectTiles } from '../logic/grid.js';
import { checkBuy, footprintDims, isDefense, typeConfig, defenseRange, wallLevel } from '../logic/buildings.js';
import { createLayoutDraft, draftBuildings, layoutChanged, isStored, storeAll, storeBuilding, hotbarGroups, checkDraftPlacement, placeInDraft, shiftLayout } from '../logic/layout.js';
import { tutorialAllows } from '../logic/tutorial.js';
import { isWaveActive, isWaveInProgress, clamp } from '../logic/util.js';
import { mineShowsCoin } from '../logic/economy.js';
import { MAX_STEP } from '../logic/simulate.js';
import { BuildingView, buildingTextureKey, placeBuildingSprite } from '../objects/BuildingView.js';
import { EnemyView } from '../objects/EnemyView.js';
import { djStats, buildingsInDjRange } from '../logic/dj.js';
import { HeroView } from '../objects/HeroView.js';
import { getAltar, heroStats } from '../logic/hero.js';
import { WallView, placeWallTile } from '../objects/WallView.js';
import { ProjectileView } from '../objects/ProjectileView.js';
import { PoolView, POOL_COLOR } from '../objects/PoolView.js';
import { RangeCircle } from '../objects/RangeCircle.js';
import { DayNight } from '../objects/DayNight.js';
import { Villagers } from '../objects/Villagers.js';
import { AirHum } from '../objects/AirHum.js';
import { BeamHum } from '../objects/BeamHum.js';
import { floatText, rpGainText, splashRing, fireballImpact, fireworkBurst, breakerExplosion } from '../objects/Effects.js';
import { TEX, SFX, MUSIC, FIRE_SFX, ENEMY_ATTACK_SFX, ENEMY_VOICE } from '../assetKeys.js';
import { playSfx, playSfxCapped, playSfxEndingIn, playVoiceLine, playMusic, pauseMusic, resumeMusic, stopMusic, crossfadeMusic, fadeOutMusic, hasAmbience, startAmbience, updateAmbience, stopAmbience, soundDuration } from '../audio.js';
import { COLORS } from '../theme.js';
import { abilityFx, towerRange, towerMinRange } from '../logic/abilities.js';
import { chainLightningFx, arrowStormFx, meteorFx, solarFlareFx, sparklerFx, drawFireRing } from '../objects/AbilityFx.js';
import { Modal, confirmDialog } from '../objects/Modal.js';
import { SpellFx } from '../objects/SpellFx.js';
import { WaveMarkers } from '../objects/WaveMarkers.js';
import { SpawnFog } from '../objects/SpawnFog.js';
import { checkCast, checkCastSpot, spellStats } from '../logic/spells.js';

const MARKER_INSET = 6;        // tiles the wave's "!" markers sit in from the entrance
const PLANNING_FADE_MS = 600; // the ambience / village music hands over to the planning track this fast
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
/** 120 -> "2:00" */

// A building in front of the hovered / selected one fades to this alpha when it covers more than FADE_OVERLAP of
// that building's picture.
const FADE_ALPHA = 0.35;
const FADE_OVERLAP = 0.12;
// Ground plots under buildings.
const PLOT_COLOR = 0x6b4a2b, PLOT_ALPHA = 0.22, PLOT_RIM = 0xf0dcae, PLOT_RIM_ALPHA = 0.28;

// A level-up that reaches a new ability tier: the unlock sound starts this long before the upgrade sound ends.
const UNLOCK_OVERLAP_MS = 150;

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
    this.heroView = new HeroView(this); // the Brisket King
    this.rangeCircle = new RangeCircle(this);
    // Fuel Station spells: the aiming ring (while a hotbar spell waits for a spot on the map) and zones in play.
    this.spellFx = new SpellFx(this, gs);
    // The next wave's arrow + enemy counts at each entrance it attacks from (UIScene feeds the counts).
    this.waveMarkers = new WaveMarkers(this);
    // Fog over the back end of all four paths, where enemies come onto the map: always on, under those markers.
    this.spawnFog = new SpawnFog(this);
    this.spellAim = null;
    this.selectionGfx = this.add.graphics().setDepth(-5000);
    // The building under the pointer: outlined on its tiles, shows its labels, and anything drawn in front of
    // it fades (updateHover / updateFocusFade).
    this.hoverGfx = this.add.graphics().setDepth(-5000);
    this.hoverId = null;
    // Played by touch (the last press was a finger): no hover, the ghost of a building being placed stays put
    // until dragged, and the UI shows Place / Cancel buttons. Follows each press, for touch laptops.
    this.touchMode = IS_TOUCH;
    this.pinch = null;
    // A soft dirt plot under every building's tiles, so you can see where each one stands even where the art
    // overlaps (drawPlots). Above the map, below lights and buildings.
    this.plotGfx = this.add.graphics().setDepth(-9000);
    this.plotKey = '';
    this.ghost = null;
    this.placement = null;
    this.selectedId = null;
    this.editMode = false;
    this.editGfx = this.add.graphics().setDepth(-4500);
    this.markers = [];
    this.press = null;
    this.resumedAt = 0;
    this.endingGame = false;
    // The scene object is reused for every game: drop what the last one (maybe another village) left behind.
    // Its graphics were destroyed with it, and a cached key would skip the first redraw.
    this.beamGfx = null; this.ringGfx = null; this.beamGlows = [];
    this.djGroundGfx = null; this.djGroundKey = null; this.djAffected = null;
    this.swapPreview = null; this.layout = null; this.layoutList = null;
    this.chatterIn = undefined; this.flockScanT = 0; this.breakerAnnounced = false; this.beamText = null;

    this.setupCamera();
    this.setupInput();
    this.subscribe();

    // Retry after a lost wave: rewound to before that wave (the clock keeps the time it had then) to rebuild.
    if (this.mode === 'retry') {
      gs.startGrace();
      this.registry.set('pendingBanner', "Rebuild, then press Start Wave when you're ready");
    } else {
      gs.resumeClock();
    }
    this.syncViews(0);
    this.scene.launch('UIScene');
    this.playPhaseMusic();

    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.resumedAt = this.time.now; });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => gs.offContext(this));

    // Logged in with a village open: count stats, record the furthest wave and award achievements.
    if (session.loggedIn && session.activeBase) {
      this.tracker = new AchievementTracker(gs, session);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.tracker.destroy(); this.tracker = null; session.flush(); });
    }
  }

  /**
   * Sound for the current phase when the scene starts: the attack music during a wave; between waves the
   * day / night ambience (falls back to the village music if those files are missing).
   */
  playPhaseMusic() {
    const phase = this.gs.wave && this.gs.wave.phase;
    if (hasAmbience(this, MUSIC.ambientDay, MUSIC.ambientNight)) {
      startAmbience(this, MUSIC.ambientDay, MUSIC.ambientNight, { presence: 0 });
      if (phase === 'countdown') this.playPlanningMusic(true);
      else if (phase === 'active') this.playAttackMusic();
      else fadeOutMusic(this, 800); // the title music fades as the ambience fades in
    } else if (phase === 'countdown') this.playPlanningMusic(true);
    else if (phase === 'active') this.playAttackMusic();
    else playMusic(this, MUSIC.village);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopAmbience());
    // The planning track is timed to the countdown, so it pauses with the game.
    this.events.on(Phaser.Scenes.Events.PAUSE, () => pauseMusic(MUSIC.planning));
    this.events.on(Phaser.Scenes.Events.RESUME, () => resumeMusic(MUSIC.planning));
  }

  /**
   * The planning track for the wave countdown. It's as long as the full countdown and plays once, so it ends
   * as the wave hits: it starts at the point matching the time left (a shorter countdown, or `resume` when the
   * scene starts mid-countdown). Without the file the current music just fades out.
   */
  playPlanningMusic(resume = false) {
    if (!this.cache.audio.exists(MUSIC.planning)) { fadeOutMusic(this, PLANNING_FADE_MS); return; }
    const left = Math.max(0, this.gs.wave.countdown);
    const seek = Math.max(0, CONFIG.rules.waveCountdown - left);
    if (resume || seek > 0.5) playMusic(this, MUSIC.planning, { loop: false, seek });
    else crossfadeMusic(this, MUSIC.planning, PLANNING_FADE_MS, { loop: false });
  }

  /** Between waves: the village track (only used when the ambience files are missing). */
  playCalmMusic() {
    if (hasAmbience(this, MUSIC.ambientDay, MUSIC.ambientNight)) fadeOutMusic(this, 1500); // the ambience fades back in
    else crossfadeMusic(this, MUSIC.village);
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
      this.ringGfx = this.add.graphics().setDepth(-4150).setBlendMode('ADD'); // Fire Rings: on the ground
      this.beamGlows = [];
    }
    const g = this.beamGfx;
    g.clear();
    this.ringGfx.clear();
    let n = 0;
    const bodyMid = (ev) => ({ x: ev.sprite.x, y: ev.sprite.y - ev.sprite.originY * ev.sprite.displayHeight + 0.5 * ev.sprite.displayHeight });
    const beam = (a, t, stageIndex, flick, scale = 1) => {
      const st = BEAM_STAGES[stageIndex || 0];
      const w = st.width * scale;
      g.lineStyle(w * 2.6 * flick, st.glow, 0.28).lineBetween(a.x, a.y, t.x, t.y);
      g.lineStyle(w * flick, st.color, 0.95).lineBetween(a.x, a.y, t.x, t.y);
      g.lineStyle(Math.max(1, w * 0.35), 0xffffff, 0.9).lineBetween(a.x, a.y, t.x, t.y);
      for (const [p, k] of [[a, 0.55], [t, 0.8]]) {
        const glow = this.beamGlows[n] || (this.beamGlows[n] = this.add.image(0, 0, TEX.light).setBlendMode('ADD').setDepth(2651));
        glow.setVisible(true).setPosition(p.x, p.y).setTint(st.glow).setDisplaySize(w * 7 * k * flick, w * 7 * k * flick).setAlpha(0.9);
        n++;
      }
    };
    const waveOn = isWaveActive(this.gs);
    // Diddypult Oil Moat: a pink slick around the catapult during attacks.
    for (const b of this.gs.buildings) {
      if (b.type !== 'catapult' || b.destroyed || !waveOn) continue;
      const moat = abilityFx(b).moatRadius;
      if (!moat) continue;
      const c = footprintCenter(b), sc = gridToScreen(c.x, c.y), { rx, ry } = rangeEllipse(moat);
      this.ringGfx.fillStyle(POOL_COLOR, 0.12).fillEllipse(sc.x, sc.y, rx * 2, ry * 2);
      this.ringGfx.lineStyle(2, POOL_COLOR, 0.45).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
    }
    for (const b of this.gs.buildings) {
      if (b.type !== 'ra' || b.destroyed) continue;
      const bv = this.views.buildings.get(b.id);
      if (!bv || !bv.sprite) continue;
      // Sun Ring: a band of flame on the ground around the tower while enemies attack.
      const fx = abilityFx(b);
      if (fx.ringRadius && waveOn) {
        const c = footprintCenter(b), sc = gridToScreen(c.x, c.y);
        drawFireRing(this.ringGfx, sc.x, sc.y, fx.ringRadius, time, b.col);
      }
      const a = { x: bv.sprite.x, y: bv.sprite.y - BEAM_MUZZLE * bv.sprite.displayHeight };
      const flick = 1 + 0.18 * Math.sin(time * 0.05 + b.col);
      // Every beam (Prism: up to 3), then the chains jumping on from their targets (thinner).
      for (const bm of b.beams || []) {
        const ev = this.views.enemies.get(bm.targetId);
        if (ev && ev.sprite) beam(a, bodyMid(ev), bm.stage, flick);
      }
      for (const ch of b.beamChains || []) {
        const from = this.views.enemies.get(ch.from), to = this.views.enemies.get(ch.to);
        if (from && from.sprite && to && to.sprite) beam(bodyMid(from), bodyMid(to), ch.stage, flick, 0.6);
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
      const { rx, ry } = rangeEllipse(towerRange(b));
      const ring = this.add.graphics().setDepth(2590).setPosition(c.x, c.y).setScale(0.1).setAlpha(0.55);
      ring.lineStyle(3, 0x4cd6ff, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
      ring.fillStyle(0x4cd6ff, 0.06).fillEllipse(0, 0, rx * 2, ry * 2);
      this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    }
  }

  update(time, delta) {
    if (!this.endingGame) this.gs.update(Math.min(delta / 1000, MAX_STEP));
    this.dayNight.update(this.gs.clock);
    // Day / night ambience: follows how dark it is, and steps aside for the attack music during a wave.
    updateAmbience(this.night || 0, !isWaveInProgress(this.gs) && !this.endingGame, Math.min(delta / 1000, MAX_STEP));
    this.villagers.update(Math.min(delta / 1000, MAX_STEP), time);
    this.airHum.update(this.endingGame ? [] : this.gs.enemies, delta / 1000);
    this.beamHum.update(this.endingGame ? [] : this.gs.buildings, delta / 1000);
    this.flockScan(delta);
    this.drawBeams(time);
    this.enemyChatter(delta);
    // Follow the pointer every frame: a move that leaves a UI element can be consumed by UIScene.
    if (this.placement && !this.touchMode) {
      const p = this.input.activePointer;
      if (!this.lastGhostPtr || this.lastGhostPtr.x !== p.x || this.lastGhostPtr.y !== p.y || this.cameraMoved()) {
        this.updateGhost(p.x, p.y);
        this.lastGhostPtr = { x: p.x, y: p.y };
      }
    }
    this.syncViews(time);
    this.updateHover();
    this.updateFocusFade();
    this.updateDjHighlight();
    this.updateLayoutExtras();
    this.spellFx.update(time);
    this.updateSpellAim();
    this.waveMarkers.update();
    this.spawnFog.update();
  }

  // ---------- spells (cast from the hotbar: click the spell, then the map) ----------
  /** Start aiming a brewed spell (UIScene's hotbar): its radius ring follows the pointer until a click casts it. */
  beginSpellAim(kind) {
    if (!checkCast(this.gs, kind).ok) return false;
    if (this.placement) this.cancelPlacement();
    this.spellAim = { kind };
    this.gs.emit('spellAimChanged', { kind });
    this.updateSpellAim(true);
    return true;
  }

  /** Stop aiming (right click, Esc, the slot again, or the wave ending). */
  cancelSpellAim() {
    if (!this.spellAim) return;
    this.spellAim = null;
    this.spellFx.hideAim();
    this.gs.emit('spellAimChanged', { kind: null });
  }

  /** Every frame while aiming: the ring follows the pointer (hidden over the HUD); a spell that can't be cast ends it. */
  updateSpellAim(force = false) {
    const aim = this.spellAim;
    if (!aim) return;
    if (!checkCast(this.gs, aim.kind).ok) { this.cancelSpellAim(); return; }
    const p = this.input.activePointer;
    if (!force && !this.touchMode && this.isOverUI(p)) { this.spellFx.hideAim(); return; }
    const w = this.screenToWorld(p.x, p.y), g = screenToGrid(w.x, w.y);
    this.spellFx.showAim(aim.kind, g.x, g.y, spellStats(this.gs, aim.kind).radius);
  }

  /** Cast the aimed spell where the player clicked (screen point). */
  castAimedSpell(px, py) {
    const aim = this.spellAim;
    const w = this.screenToWorld(px, py), g = screenToGrid(w.x, w.y);
    const r = this.gs.castSpell(aim.kind, g.x, g.y);
    if (!r.ok) {
      playSfx(this, SFX.invalid);
      // A spot it can't use (off the map, Lightning with no enemies there): the spell is kept, so keep aiming.
      if (!checkCastSpot(this.gs, aim.kind, g.x, g.y).ok && checkCast(this.gs, aim.kind).ok) {
        const ui = this.scene.get('UIScene');
        if (ui && ui.showBanner) ui.showBanner(r.reason);
        return;
      }
    }
    this.cancelSpellAim();
  }

  /**
   * With DJ Babyface selected, every building in its range is tinted purple (BuildingView reads
   * scene.djAffected), so it's obvious which ones it boosts. Worked out every frame (cheap), so it follows
   * moves, upgrades and its range perks.
   */
  updateDjHighlight() {
    const list = this.layoutList || [];
    const sel = this.selectedId ? list.find((b) => b.id === this.selectedId) : null;
    const affected = sel && sel.type === 'dj' && !sel.destroyed ? buildingsInDjRange(sel, list) : [];
    this.djAffected = affected.length ? new Set(affected.map((b) => b.id)) : null;
    // ...and a purple diamond on the ground under each one (clear even on dark pictures).
    const key = affected.map((b) => `${b.id}:${b.col},${b.row}`).join('|');
    if (key === this.djGroundKey) return;
    this.djGroundKey = key;
    if (!this.djGroundGfx) this.djGroundGfx = this.add.graphics().setDepth(-8990); // over the dirt plots
    const g = this.djGroundGfx;
    g.clear();
    for (const b of affected) {
      const w = fpW(b), h = fpH(b);
      const pts = [gridToScreen(b.col, b.row), gridToScreen(b.col + w, b.row), gridToScreen(b.col + w, b.row + h), gridToScreen(b.col, b.row + h)];
      g.fillStyle(0xb066ff, 0.32).fillPoints(pts, true);
      g.lineStyle(2, 0xe2c2ff, 0.9).strokePoints(pts, true);
    }
  }

  /** Ground plots: drawn again only when the layout changes. */
  updateLayoutExtras() {
    const list = this.layoutList || [];
    const key = list.map((b) => `${b.id}:${b.col},${b.row},${fpW(b)},${fpH(b)},${b.level},${b.destroyed ? 1 : 0}`).join('|')
      + `|${this.placement ? this.placement.id : ''}`;
    if (key === this.plotKey) return;
    this.plotKey = key;
    this.drawPlots(list);
  }

  /** A dirt-colored diamond under each building (not walls), with a light rim. */
  drawPlots(list) {
    const g = this.plotGfx;
    g.clear();
    for (const b of list) {
      if (b.type === 'wall' || (this.placement && this.placement.id === b.id)) continue;
      const w = fpW(b), h = fpH(b);
      const pts = [gridToScreen(b.col, b.row), gridToScreen(b.col + w, b.row), gridToScreen(b.col + w, b.row + h), gridToScreen(b.col, b.row + h)];
      g.fillStyle(PLOT_COLOR, PLOT_ALPHA).fillPoints(pts, true);
      const inset = 0.08;
      const rim = [gridToScreen(b.col + inset, b.row + inset), gridToScreen(b.col + w - inset, b.row + inset),
        gridToScreen(b.col + w - inset, b.row + h - inset), gridToScreen(b.col + inset, b.row + h - inset)];
      g.lineStyle(2, PLOT_RIM, PLOT_RIM_ALPHA).strokePoints(rim, true);
    }
  }

  // ---------- hover, labels and fading (keep a crowded village readable) ----------
  /** The building under the pointer (tile first, like a click), re-checked when the pointer or camera moves. */
  updateHover() {
    const p = this.input.activePointer;
    const cam = this.cameras.main;
    const camKey = `${cam.scrollX},${cam.scrollY},${cam.zoom}`; // its own key: cameraMoved() belongs to the ghost
    const camMoved = camKey !== this.hoverCamKey;
    this.hoverCamKey = camKey;
    let id = null;
    if (!this.touchMode && !this.placement && !this.endingGame && !(this.press && this.press.dragging) && !this.isOverUI(p)) {
      if (this.lastHoverPtr && this.lastHoverPtr.x === p.x && this.lastHoverPtr.y === p.y && !camMoved && !this.hoverDirty) return;
      const w = this.screenToWorld(p.x, p.y);
      const b = this.pickBuilding(w.x, w.y);
      id = b ? b.id : null;
    }
    this.lastHoverPtr = { x: p.x, y: p.y };
    this.hoverDirty = false;
    if (id === this.hoverId && !camMoved) return;
    this.hoverId = id;
    this.drawHover();
  }

  /** A thin white outline on the hovered building's tiles (the selected one has its own gold outline). */
  drawHover() {
    this.hoverGfx.clear();
    const b = this.hoverId && this.hoverId !== this.selectedId ? this.layoutList?.find((x) => x.id === this.hoverId) : null;
    if (!b) return;
    const pts = [
      gridToScreen(b.col, b.row), gridToScreen(b.col + fpW(b), b.row),
      gridToScreen(b.col + fpW(b), b.row + fpH(b)), gridToScreen(b.col, b.row + fpH(b))
    ];
    this.hoverGfx.fillStyle(0xffffff, 0.12).fillPoints(pts, true);
    this.hoverGfx.lineStyle(2, 0xffffff, 0.85).strokePoints(pts, true);
  }

  /** Show a building's "Lv" badge and tier pips? Only when it's hovered or selected, or in edit mode. */
  showLabels(id) {
    return this.editMode || id === this.hoverId || id === this.selectedId;
  }

  /**
   * Buildings drawn in front of the hovered (else the selected) building, and covering a good part of it, fade
   * to see-through so it can be seen and clicked. Eased so it doesn't flicker. Walls are short: they never fade.
   */
  updateFocusFade() {
    const focusId = this.hoverId || this.selectedId;
    const focus = focusId ? this.views.buildings.get(focusId) : null;
    const fb = focus && focus.sprite ? focus.sprite.getBounds() : null;
    const fArea = fb ? Math.max(1, fb.width * fb.height) : 1;
    for (const [id, v] of this.views.buildings) {
      if (!v.setFade) continue;
      let target = 1;
      if (fb && id !== focusId && !(v instanceof WallView) && v.sprite.depth > focus.sprite.depth) {
        const ob = v.sprite.getBounds();
        const ix = Math.min(fb.right, ob.right) - Math.max(fb.x, ob.x);
        const iy = Math.min(fb.bottom, ob.bottom) - Math.max(fb.y, ob.y);
        if (ix > 0 && iy > 0 && (ix * iy) / fArea > FADE_OVERLAP) target = FADE_ALPHA;
      }
      const cur = v.fade ?? 1;
      v.setFade(Math.abs(target - cur) < 0.02 ? target : cur + (target - cur) * 0.3);
    }
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
    const factor = deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    this.zoomKeeping(this.screenToWorld(px, py), px, py, cam.zoom * factor);
  }

  /** Set the zoom (clamped) and scroll so the world point `w` sits at screen point (px, py). */
  zoomKeeping(w, px, py, zoom) {
    const cam = this.cameras.main;
    zoom = clamp(zoom, this.minZoom(), CONFIG.camera.maxZoom);
    cam.setZoom(zoom);
    cam.scrollX = w.x - cam.width / 2 - (px - cam.width / 2) / zoom;
    cam.scrollY = w.y - cam.height / 2 - (py - cam.height / 2) / zoom;
    this.clampCamera();
  }

  /** The fingers on the screen (touch pointers held down). */
  fingersDown() {
    return [this.input.pointer1, this.input.pointer2].filter((p) => p && p.isDown);
  }

  /**
   * Two fingers: pinch to zoom, and move both to pan. The map point first between the fingers stays between
   * them. Lasts until every finger is lifted, so the last finger up doesn't count as a tap or a drag.
   */
  startPinch(a, b) {
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    this.press = null;
    this.pinch = { dist: Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y)), zoom: this.cameras.main.zoom, world: this.screenToWorld(mid.x, mid.y) };
  }

  updatePinch(a, b) {
    const pi = this.pinch;
    const dist = Math.max(1, Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y));
    this.zoomKeeping(pi.world, (a.x + b.x) / 2, (a.y + b.y) / 2, pi.zoom * (dist / pi.dist));
  }

  /** Is the screen point on (or within half a tile of) the ghost being placed? Fingers are wide. */
  onGhost(px, py) {
    const pl = this.placement;
    if (!pl || !this.ghost) return false;
    const w = this.screenToWorld(px, py);
    const g = screenToGrid(w.x, w.y);
    const m = 0.5;
    return g.x >= pl.col - m && g.x < pl.col + pl.w + m && g.y >= pl.row - m && g.y < pl.row + pl.h + m;
  }

  /** The screen point at the center of the ghost's footprint (what updateGhost takes). */
  ghostScreenCenter() {
    const pl = this.placement;
    const c = gridToScreen(pl.col + pl.w / 2, pl.row + pl.h / 2);
    return this.worldToScreen(c.x, c.y);
  }

  /** Put the ghost on the tiles starting at (col, row). */
  ghostToGrid(col, row) {
    const pl = this.placement;
    if (!pl) return;
    const c = gridToScreen(col + pl.w / 2, row + pl.h / 2);
    const sc = this.worldToScreen(c.x, c.y);
    this.updateGhost(sc.x, sc.y);
  }

  /**
   * Touch: where a new building's ghost first appears: the free spot nearest the middle of the screen (a
   * little above it, clear of the bottom buttons), so it's on screen and ready to place.
   */
  startGhostForTouch() {
    const pl = this.placement;
    const cam = this.cameras.main;
    const w = this.screenToWorld(cam.width / 2, cam.height * 0.45);
    const g = screenToGrid(w.x, w.y);
    const c0 = Math.round(g.x - pl.w / 2), r0 = Math.round(g.y - pl.h / 2);
    if (pl.mode === 'buy') {
      for (let rad = 0; rad <= 12; rad++) {
        for (let dc = -rad; dc <= rad; dc++) {
          for (let dr = -rad; dr <= rad; dr++) {
            if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
            if (canPlaceRect(this.gs.buildings, c0 + dc, r0 + dr, pl.w, pl.h).ok) { this.ghostToGrid(c0 + dc, r0 + dr); return; }
          }
        }
      }
    }
    this.ghostToGrid(c0, r0);
  }

  // ---------- input ----------
  setupInput() {
    const cam = this.cameras.main;
    if (this.input.mouse) this.input.mouse.disableContextMenu();

    this.input.on('pointerdown', (p) => {
      this.press = null;
      this.setTouchMode(!!p.wasTouch);
      // A second finger: pinch zoom (whatever the first finger was doing is dropped).
      const fingers = p.wasTouch ? this.fingersDown() : [];
      if (fingers.length >= 2) { this.startPinch(fingers[0], fingers[1]); return; }
      if (this.pinch) return;
      if (this.isOverUI(p)) return;
      if (p.rightButtonDown()) {
        if (this.spellAim) { this.cancelSpellAim(); return; } // right click cancels a spell being aimed
        if (this.placement) this.cancelPlacement();
        else if (this.editMode) this.leaveEdit();
        return;
      }
      this.press = { x: p.x, y: p.y, scrollX: cam.scrollX, scrollY: cam.scrollY, dragging: false };
      // Touch: a press on the ghost drags the ghost (not the map), held where the finger grabbed it.
      if (this.touchMode && this.placement && this.onGhost(p.x, p.y)) {
        const c = this.ghostScreenCenter();
        this.press.ghost = { dx: p.x - c.x, dy: p.y - c.y };
      }
    });

    this.input.on('pointermove', (p) => {
      if (this.pinch) {
        const fingers = this.fingersDown();
        if (fingers.length >= 2) this.updatePinch(fingers[0], fingers[1]);
        return;
      }
      if (this.placement && !this.touchMode) this.updateGhost(p.x, p.y);
      const pr = this.press;
      if (!pr || !p.isDown) return;
      if (!pr.dragging && Phaser.Math.Distance.Between(p.x, p.y, pr.x, pr.y) >= CONFIG.camera.dragThresholdPx) pr.dragging = true;
      if (pr.dragging && pr.ghost && this.placement) {
        this.updateGhost(p.x - pr.ghost.dx, p.y - pr.ghost.dy);
      } else if (pr.dragging) {
        cam.scrollX = pr.scrollX - (p.x - pr.x) / cam.zoom;
        cam.scrollY = pr.scrollY - (p.y - pr.y) / cam.zoom;
        this.clampCamera();
      }
    });

    this.input.on('pointerup', (p) => {
      if (this.pinch) {
        if (!this.fingersDown().length) this.pinch = null;
        this.press = null;
        return;
      }
      const pr = this.press;
      this.press = null;
      if (!pr || pr.dragging || p.button !== 0) return;
      this.handleClick(p.x, p.y, pr);
    });

    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.isOverUI(p)) return;
      this.zoomAt(p.x, p.y, dy);
    });

    this.input.keyboard.on('keydown-R', () => this.rotatePlacement());
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.time.now - this.resumedAt < 250) return; // the Esc that closed the pause menu
      if (Modal.isOpen(this.scene.get('UIScene'))) return; // Esc closes the ability window instead
      if (this.spellAim) { this.cancelSpellAim(); return; } // Esc cancels a spell being aimed
      if (this.placement) this.cancelPlacement();
      else if (this.editMode) this.leaveEdit();
      else this.openPause();
    });
  }

  /** Switch between mouse and touch controls (the UI shows Place / Cancel buttons for touch). */
  setTouchMode(on) {
    if (on === this.touchMode) return;
    this.touchMode = on;
    if (on) { this.hoverId = null; this.drawHover(); }
    if (this.placement) this.gs.emit('placementChanged', { active: true, type: this.placement.type });
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

  handleClick(px, py, press = null) {
    const w = this.screenToWorld(px, py);
    if (this.placement && this.touchMode) {
      // Touch: tapping the ghost places it; tapping elsewhere moves it there (or the Place button, UIScene).
      if (press && press.ghost) this.confirmPlacement();
      else this.updateGhost(px, py);
      return;
    }
    if (this.placement) {
      this.updateGhost(px, py);
      this.confirmPlacement();
      return;
    }
    // Aiming a spell from the hotbar: the click casts it there.
    if (this.spellAim) { this.castAimedSpell(px, py); return; }
    const b = this.pickBuilding(w.x, w.y);
    if (this.editMode) {
      // Edit mode: clicking a building picks it up to move; nothing else happens.
      if (b) { playSfx(this, SFX.buildingSelect); this.beginMove(b.id); }
      return;
    }
    // Clicking the Brisket King or his altar only selects (Brisket Feast is the explicit button in the UI).
    const heroHit = this.heroView.hitTest(w.x, w.y);
    // Clicking the hero himself (also while he stands on his altar) selects his altar, with his own sound.
    if (heroHit && (!b || b.type === 'altar')) {
      const altar = getAltar(this.gs);
      if (altar) { playVoiceLine(this, [SFX.heroSelect], 'heroSelect'); this.heroView.selectPose(this.time.now); this.select(altar.id); }
      return;
    }
    if (!b) { this.select(null); return; }
    // A mine showing its coin: this click just collects. Clicking it again (coin gone) opens its panel.
    // Mines: with the coin showing, a click only collects (coin sound). Otherwise (or if it couldn't
    // collect, e.g. storage full) it opens the panel with the info sound, like any building.
    const coinShowing = b.type === 'mine' && mineShowsCoin(b) && !isWaveActive(this.gs);
    // RV Lab: a click opens its full info panel straight away (its Research button opens the research window).
    if (b.type === 'rvlab' && tutorialAllows(this.gs, 'select', b.type)) {
      this.views.buildings.get(b.id)?.pop();
      playSfx(this, SFX.buildingSelect);
      if (this.selectedId !== b.id) this.select(b.id);
      this.scene.get('UIScene').openInfo();
      return;
    }
    // (DJ Babyface's Drop the Beat is only on the hotbar now: clicking the booth just selects it.)
    let collected = false;
    if (coinShowing && tutorialAllows(this.gs, 'collect')) collected = this.gs.collect(b.id).ok;
    const canSelect = tutorialAllows(this.gs, 'select', b.type) && !collected;
    if (collected || canSelect) this.views.buildings.get(b.id)?.pop(); // click feedback
    if (canSelect) {
      playSfx(this, b.type === 'altar' && this.cache.audio.exists(SFX.altarSelect) ? SFX.altarSelect : SFX.buildingSelect);
      if (this.selectedId !== b.id) this.select(b.id); // already selected: stays as it is (Info opens the panel)
    }
  }

  /** Frontmost building whose sprite has a visible pixel under the point, else whose footprint contains it. */
  pickBuilding(wx, wy) {
    // The building standing on the tile under the point comes first, so a tall building in front can't steal
    // the click from the one behind it. Off every footprint (e.g. on a tall roof), the frontmost picture wins.
    const g = screenToGrid(wx, wy);
    const onTile = this.layoutBuildings().find((b) => (!this.placement || this.placement.id !== b.id)
      && g.x >= b.col && g.x < b.col + fpW(b) && g.y >= b.row && g.y < b.row + fpH(b));
    if (onTile) return this.gs.getBuilding(onTile.id) || onTile;
    const views = [...this.views.buildings.values()].sort((a, b) => b.sprite.depth - a.sprite.depth);
    for (const v of views) {
      if (this.placement && this.placement.id === v.id) continue;
      if (v.hitTest(wx, wy)) return this.gs.getBuilding(v.id);
    }
    return null;
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
    this.updateSelectionVisuals();
    this.gs.emit('selectionChanged', { id });
  }

  updateSelectionVisuals() {
    const b = this.selectedId ? this.gs.getBuilding(this.selectedId) : null;
    this.selectionGfx.clear();
    this.drawHover(); // the hover outline steps aside for the selection
    if (!b) {
      if (!this.placement) this.rangeCircle.hide();
      return;
    }
    const pts = [
      gridToScreen(b.col, b.row), gridToScreen(b.col + fpW(b), b.row),
      gridToScreen(b.col + fpW(b), b.row + fpH(b)), gridToScreen(b.col, b.row + fpH(b))
    ];
    this.selectionGfx.lineStyle(3, COLORS.panelEdge, 1).strokePoints(pts, true);
    if (b.type === 'dj') {
      // DJ Babyface: its range (work playlist, Drop the Beat, light show).
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, djStats(b).range, 0);
    } else if (b.type === 'altar') {
      // The Brisket King's guard range: he fights ground enemies inside it.
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, heroStats(b).guardRange, 0);
    } else if (isDefense(b.type)) {
      const cfg = typeConfig(b.type);
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, towerRange(b), cfg.minRange ? towerMinRange(b) : cfg.minRange); // with ability bonuses
    } else {
      this.rangeCircle.hide();
    }
  }

  // ---------- edit mode: the layout editor (the only way to move buildings; src/logic/layout.js) ----------
  // Edit mode works on a draft layout: buildings can be picked up into the hotbar (one at a time or
  // Remove All) and placed again. The village itself only changes on Save; leaving without saving
  // (after a yes) throws the draft away.
  canEdit() {
    return !isWaveActive(this.gs) && !this.gs.gameOver && tutorialAllows(this.gs, 'move');
  }

  /** Edit mode on (a fresh draft) or off. Off discards the draft: players leave through leaveEdit / saveLayout. */
  setEditMode(on) {
    if (on && !this.canEdit()) return;
    if (this.editMode === on) return;
    if (this.placement) this.cancelPlacement();
    this.editMode = on;
    this.layout = on ? createLayoutDraft(this.gs) : null;
    this.select(null);
    this.syncViews(this.time.now);
    this.drawEditOutlines();
    this.gs.emit('editModeChanged', { active: on });
  }

  /** The buildings the map shows: the draft layout while editing, else the village. */
  layoutBuildings() {
    return this.layout ? draftBuildings(this.gs, this.layout) : this.gs.buildings;
  }

  /** Leave edit mode (Cancel, Esc, right click, the Edit button). Unsaved changes ask first. */
  leaveEdit() {
    if (!this.editMode) return;
    if (this.placement) this.cancelPlacement();
    if (!layoutChanged(this.gs, this.layout)) { this.setEditMode(false); return; }
    const ui = this.scene.get('UIScene');
    if (Modal.isOpen(ui)) return;
    const left = this.layout.stored.length;
    confirmDialog(ui, {
      title: 'Leave edit mode?',
      lines: ['Leave without saving?', `${left ? `${left} building${left === 1 ? ' is' : 's are'} still in your hotbar. ` : ''}Your layout changes will be lost and everything goes back where it was.`],
      confirmLabel: 'Leave', cancelLabel: 'Keep editing',
      onConfirm: () => this.setEditMode(false)
    });
  }

  /** Save: the village takes the draft layout (every building must be placed). */
  saveLayout() {
    if (!this.layout) return { ok: false, reason: '' };
    if (this.placement) this.cancelPlacement();
    const r = this.gs.applyLayout(this.layout);
    if (!r.ok) { playSfx(this, SFX.invalid); this.gs.emit('layoutRejected', { reason: r.reason }); return r; }
    playSfx(this, SFX.place);
    this.setEditMode(false);
    return r;
  }

  /** Remove All: every building goes to the hotbar. */
  storeAllBuildings() {
    if (!this.layout) return;
    if (this.placement) this.cancelPlacement();
    storeAll(this.gs, this.layout);
    playSfx(this, SFX.sell);
    this.layoutUpdated();
  }

  /** Slide every placed building (dc, dr) tiles at once (the shift pad). */
  shiftWholeLayout(dc, dr) {
    if (!this.layout) return;
    if (this.placement) this.cancelPlacement();
    const r = shiftLayout(this.gs, this.layout, dc, dr);
    if (!r.ok) { playSfx(this, SFX.invalid); this.gs.emit('layoutRejected', { reason: r.reason }); return; }
    playSfx(this, SFX.place);
    this.layoutUpdated();
  }

  /** Put the building being carried into the hotbar. Returns true if there was one. */
  storeHeld() {
    const pl = this.placement;
    if (!this.layout || !pl || pl.mode !== 'move') return false;
    storeBuilding(this.layout, pl.id);
    this.endPlacement();
    playSfx(this, SFX.place);
    this.layoutUpdated();
    return true;
  }

  /** Take the next building of a hotbar card (type + level) to place it. */
  pickFromHotbar(type, level) {
    if (!this.layout) return;
    const group = hotbarGroups(this.gs, this.layout).find((g) => g.type === type && g.level === level);
    if (!group) return;
    playSfx(this, SFX.buildingSelect);
    this.beginMove(group.ids[0]);
  }

  /** The draft changed: redraw the map and tell the UI (hotbar, Save button). */
  layoutUpdated() {
    this.syncViews(this.time.now);
    this.drawEditOutlines();
    this.gs.emit('layoutDraftChanged', {});
  }

  /** In edit mode every building's footprint is outlined so it's clear what can be picked up. */
  drawEditOutlines() {
    const g = this.editGfx;
    g.clear();
    if (!this.editMode) return;
    for (const b of this.layoutBuildings()) {
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
    // (New walls are placed at the village's wall level.)
    this.placement = { mode: 'buy', type, level: type === 'wall' ? wallLevel(this.gs) : 1, orient, ...footprintDims(type, orient), col: 0, row: 0, valid: false };
    this.createGhost();
    this.gs.tutorialEvent('placementStarted', { type });
    this.gs.emit('placementChanged', { active: true, type });
    if (this.touchMode) { this.startGhostForTouch(); return; }
    const p = this.input.activePointer;
    this.updateGhost(p.x, p.y);
  }

  beginMove(id) {
    const b = this.gs.getBuilding(id);
    if (!b || !this.editMode || !this.layout || isWaveActive(this.gs)) return;
    if (this.placement) this.endPlacement();
    this.select(null);
    // Picked up from its draft spot, or out of the hotbar.
    const d = this.layout.pos[id];
    const fromHotbar = isStored(this.layout, id);
    this.placement = { mode: 'move', id, fromHotbar, type: b.type, level: b.level, orient: d.orient, w: d.w, h: d.h, col: d.col, row: d.row, valid: !fromHotbar };
    const view = this.views.buildings.get(id);
    if (view) view.setAlpha(0.3);
    this.createGhost();
    this.drawEditOutlines();
    this.gs.emit('placementChanged', { active: true, type: b.type });
    if (this.touchMode) {
      // Touch: the ghost starts on the building itself (or mid-screen, out of the hotbar), ready to drag.
      if (fromHotbar) this.startGhostForTouch();
      else this.ghostToGrid(d.col, d.row);
      return;
    }
    const p = this.input.activePointer;
    this.updateGhost(p.x, p.y);
  }

  /** Touch, laying walls in a row: the next segment's ghost starts right after the one just placed. */
  continueWallRow(prev) {
    if (!this.touchMode || !this.placement || this.placement.type !== 'wall') return;
    const along = prev.orient === 'y' ? { col: prev.col, row: prev.row + prev.h } : { col: prev.col + prev.w, row: prev.row };
    this.ghostToGrid(along.col, along.row);
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
    let spot, swap = null;
    if (pl.mode === 'move' && this.layout) {
      // Edit mode: checked against the draft layout. Dropped onto exactly one other building, the two
      // trade places: snap onto it and preview the swap.
      const check = checkDraftPlacement(this.gs, this.layout, pl.id, pl.col, pl.row, pl.orient);
      spot = { ok: check.ok && !check.swap };
      if (check.swap) { swap = check.swap; pl.col = swap.to.col; pl.row = swap.to.row; }
    } else {
      spot = canPlaceRect(this.gs.buildings, pl.col, pl.row, pl.w, pl.h);
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
    if (pl.mode === 'move' && this.layout) {
      // Edit mode: drop it into the draft layout (the village changes on Save).
      if (!placeInDraft(this.gs, this.layout, pl.id, pl.col, pl.row, pl.orient).ok) { playSfx(this, SFX.invalid); return; }
      playSfx(this, SFX.place);
      this.endPlacement();
      this.layoutUpdated();
      // Walls out of the hotbar: keep laying the same stack in a row until it runs out (Esc to stop).
      if (pl.fromHotbar && pl.type === 'wall') {
        this.wallOrient = pl.orient;
        this.pickFromHotbar(pl.type, pl.level);
        if (this.placement) { this.placement.orient = pl.orient; Object.assign(this.placement, footprintDims('wall', pl.orient)); this.continueWallRow(pl); }
      }
      return;
    }
    const r = pl.mode === 'buy'
      ? this.gs.placeNew(pl.type, pl.col, pl.row, pl.orient)
      : this.gs.moveBuilding(pl.id, pl.col, pl.row, pl.orient);
    if (!r.ok) { playSfx(this, SFX.invalid); return; }
    // A new building bought from the shop lands with the upgrade sound; moving one keeps the place sound.
    playSfx(this, pl.mode === 'buy' ? SFX.upgrade : SFX.place);
    this.endPlacement();
    this.syncViews(this.time.now);
    // Walls: keep laying segments in a row while you can afford them (Esc to stop).
    if (pl.mode === 'buy' && pl.type === 'wall' && checkBuy(this.gs, 'wall').ok) { this.beginPlacement('wall'); this.continueWallRow(pl); }
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
      const tick = d.source === 'pool' || d.source === 'beam' || d.source === 'burn' || d.source === 'ring' || d.source === 'poison' || d.source === 'bleed';
      if (v && !tick) v.flash(this.time.now); // pool / beam / burn ticks would keep them white
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
      if (d.source === 'pool' || d.source === 'burn' || d.source === 'ring' || d.source === 'poison' || d.source === 'bleed') {
        // Damage over time: small numbers, no hit sound (they come every half second). Pink oil, orange fire,
        // green poison, red bleeding.
        const color = { pool: '#ff8fc8', poison: '#8be06b', bleed: '#ff6b6b' }[d.source] || '#ffa04a';
        floatText(this, s.x + Phaser.Math.Between(-6, 6), s.y - 16, `${Math.round(d.amount)}`, color, 12);
        return;
      }
      if (d.source === 'crit' || d.source === 'headshot') {
        // Critical hits (Locklair, F.L.O.C.K Exposed) and Headshots: a bigger gold number with a "!".
        const liftC = v && v.sprite ? v.sprite.y - v.sprite.originY * v.sprite.displayHeight + 0.35 * v.sprite.displayHeight - s.y : -20;
        floatText(this, s.x, s.y + liftC - 6, `${Math.round(d.amount)}!`, '#ffe066', d.source === 'headshot' ? 22 : 18);
        playSfx(this, SFX.hit);
        return;
      }
      // Over the enemy's body (flyers float high), not on the ground beneath it.
      const lift = v && v.sprite ? v.sprite.y - v.sprite.originY * v.sprite.displayHeight + 0.35 * v.sprite.displayHeight - s.y : -20;
      floatText(this, s.x, s.y + lift, `${Math.round(d.amount)}`, '#ffffff', 14);
      playSfx(this, d.source === 'spear' ? SFX.spearHit : SFX.hit); // a Spear Thrower's spear has its own hit sound
    });
    // Wall Breaker: a big cartoon boom the size of its radius, a jolt, and its blast sound.
    on('enemyExploded', (d) => {
      const s = enemyPos(d);
      breakerExplosion(this, s.x, s.y, d.radius, TEX.light);
      this.cameras.main.shake(240, 0.006);
      playSfxCapped(this, SFX.breakerBlast, ENEMY_HIT_MAX);
    });
    // Da Baby Car (raid boss): a crunch and a jolt each time it rams through a building or wall.
    on('babyCarRam', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.wall ? 0.5 : 0.8, 0xffb04a, { duration: 320, depth: 2710 });
      floatText(this, s.x, s.y - 50, d.wall ? 'SMASH!' : 'CRASH!', '#ffcf5a', 18);
      this.cameras.main.shake(d.wall ? 90 : 160, d.wall ? 0.003 : 0.005);
      playSfxCapped(this, SFX.enemyHitBig, ENEMY_HIT_MAX);
    });
    // Skibidi Toilet: a puff of dirt where it pops up or dives back down.
    on('enemySurfaced', (d) => { const s = gridToScreen(d.x, d.y); splashRing(this, s.x, s.y, 0.45, 0x8f673d, { duration: 320, depth: 2710 }); });
    on('enemyBurrowed', (d) => { const s = gridToScreen(d.x, d.y); splashRing(this, s.x, s.y, 0.35, 0x6b4a2b, { duration: 260, depth: 2710 }); });
    // DJ Babyface drops the beat: a party ring over its range, a big label, and the boosted defenses pop.
    on('beatDropped', (d) => {
      const dj = this.gs.getBuilding(d.id);
      if (!dj) return;
      const c = footprintCenter(dj), s = gridToScreen(c.x, c.y);
      splashRing(this, s.x, s.y, djStats(dj).range, 0xc070ff, { duration: 700, depth: 2710 });
      splashRing(this, s.x, s.y, djStats(dj).range * 0.6, 0x4cd6ff, { duration: 500, depth: 2710 });
      const v = this.views.buildings.get(d.id);
      if (v) { const t = v.topCenter(); floatText(this, t.x, t.y - 20, 'DROP THE BEAT!', '#ffe2ff', 22); }
      for (const id of d.ids) this.views.buildings.get(id)?.pop();
      this.cameras.main.shake(180, 0.004);
      playSfx(this, this.cache.audio.exists(SFX.beatDrop) ? SFX.beatDrop : SFX.upgrade);
    });
    on('hypeFull', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const t = v.topCenter(); floatText(this, t.x, t.y - 30, 'Hype ready!', '#ffe2ff', 16); }
    });
    // The Brisket King: his swings, Brisket Feast, getting knocked out and back up.
    const heroAt = () => { const h = this.gs.hero; return h ? gridToScreen(h.x, h.y) : null; };
    on('heroHit', (d) => { this.heroView.attackPose(this.time.now); playSfxCapped(this, SFX.enemyHitBig, ENEMY_HIT_MAX); if (d.hog) { const s = gridToScreen(d.x, d.y); floatText(this, s.x, s.y - 40, 'WHOLE HOG!', '#ffb36b', 16); } });
    on('heroFeast', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0xffd34a, { duration: 520, depth: 2710 });
      floatText(this, s.x, s.y - 90, 'BRISKET FEAST!', '#ffd34a', 22);
      this.cameras.main.shake(160, 0.005);
      playSfx(this, this.cache.audio.exists(SFX.heroFeast) ? SFX.heroFeast : SFX.upgrade);
    });
    on('heroKnockedOut', () => { const s = heroAt(); if (s) floatText(this, s.x, s.y - 80, 'Knocked out! Zzz', '#d9e4ff', 18); playSfx(this, SFX.buildingDestroyed); });
    on('heroSecondWind', (d) => { const s = gridToScreen(d.x, d.y); floatText(this, s.x, s.y - 80, 'Second Wind!', '#9bf07a', 18); });
    on('heroReady', () => { const s = heroAt(); if (s) floatText(this, s.x, s.y - 80, 'Ready!', '#ffd34a', 16); });
    // ...and when it's wrecked it bursts open and its troops pour out.
    on('babyCarBurst', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, 1.4, 0xff7a3c, { duration: 520, depth: 2710 });
      floatText(this, s.x, s.y - 60, `+${d.troops.length} troops!`, '#ff9a8a', 20);
      this.cameras.main.shake(220, 0.006);
      playSfx(this, SFX.buildingDestroyed);
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
      if (d.rp > 0) {
        // Burgers (research points): a small tag with the burger icon beside the gold.
        const s = enemyPos(d);
        rpGainText(this, s.x + 26, s.y - 30, d.rp);
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
      } else if (d.kind === 'sparkler') {
        sparklerFx(this, s.x, s.y, d.radius, TEX.light);
      } else if (d.kind === 'groundZero') {
        splashRing(this, s.x, s.y, d.radius, 0xff9a3c, { duration: 380, depth: 2710 });
      } else if (d.kind === 'fountain') {
        sparklerFx(this, s.x, s.y + 20, d.radius, TEX.light);
      } else if (d.kind === 'shatter') {
        splashRing(this, s.x, s.y, d.radius, POOL_COLOR, { duration: 350, depth: 2710 });
      } else if (d.kind === 'booby' || d.kind === 'supernova') {
        // Mousetrap Booby Trap / Tower of Rah Supernova: a big fiery blast.
        fireballImpact(this, s.x, s.y, d.radius, TEX.light);
        splashRing(this, s.x, s.y, d.radius, d.kind === 'supernova' ? 0xfff0b0 : 0xff7a1a, { duration: 550, depth: 2710 });
        this.cameras.main.shake(160, 0.004);
      } else if (d.kind === 'aftershock') {
        splashRing(this, s.x, s.y, d.radius, 0xb08a5a, { duration: 450, depth: 2710 });
        playSfx(this, SFX.mortarImpact);
      } else if (d.kind === 'arrowStorm' || d.kind === 'meteor') {
        // Already drawn when they were called down (strikeIncoming).
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
    // An invisible Mr. Least gives himself away: a quick white puff where it pops into view.
    // A F.L.O.C.K Tower spots the first enemy to enter its (empty) range: its alert sound.
    on('flockSpotted', () => playSfxCapped(this, SFX.flockSpotted, 2));
    on('enemyRevealed', (d) => {
      const s = enemyPos(d);
      splashRing(this, s.x, s.y - 4, 0.45, 0xffffff, { duration: 380, depth: 2710 });
      const puff = this.add.image(s.x, s.y - 18, TEX.light).setBlendMode('ADD').setTint(0xdfe8ff).setDepth(2711).setScale(0.25);
      this.tweens.add({ targets: puff, scale: 0.55, alpha: 0, duration: 360, ease: 'Cubic.easeOut', onComplete: () => puff.destroy() });
    });
    on('projectileFired', (d) => {
      playSfx(this, d.kind === 'spear' ? SFX.spearFire[Math.floor(Math.random() * SFX.spearFire.length)] : FIRE_SFX[d.kind]);
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
    // ---------- RV Lab abilities ----------
    on('chainLightning', (d) => {
      const pts = d.points.map((p) => { const g = gridToScreen(p.x, p.y); return { x: g.x, y: g.y - 18 }; });
      chainLightningFx(this, pts, TEX.light);
    });
    on('strikeIncoming', (d) => {
      const s = gridToScreen(d.x, d.y);
      if (d.kind === 'meteor') meteorFx(this, s.x, s.y, d.radius, d.delay * 1000, TEX.light);
      else if (d.kind === 'arrowStorm') arrowStormFx(this, s.x, s.y, d.radius, d.delay * 1000);
      // (Aftershocks need no warning: they're drawn when they land.)
    });
    on('solarFlare', (d) => {
      const s = gridToScreen(d.x, d.y);
      solarFlareFx(this, s.x, s.y, d.radius, TEX.light);
      playSfxCapped(this, SFX.raHeatUp, 2);
    });
    // Path C specials that hit everything around a tower at once: a ring in their color.
    const AREA_FX = {
      toxicCloud: { color: 0x7fe07f, text: 'Toxic Cloud!' },
      earthquake: { color: 0xb08a5a, text: 'Earthquake!', shake: true },
      timeWarp: { color: 0x9fb8ff, text: 'Time Warp!' },
      starfall: { color: 0xffe066, text: 'Starfall!' },
      systemCrash: { color: 0x4cd6ff, text: 'System Crash!' }
    };
    on('areaSpecial', (d) => {
      const look = AREA_FX[d.kind];
      if (!look) return;
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, look.color, { duration: 700, depth: 2710 });
      splashRing(this, s.x, s.y, d.radius * 0.6, look.color, { duration: 500, depth: 2710 });
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y - 8, look.text, '#ffffff', 16); }
      if (look.shake) this.cameras.main.shake(260, 0.006);
    });
    // ---------- building-specific tiers ----------
    const tag = (x, y, text, color, size = 15) => floatText(this, x, y, text, color, size);
    const at = (d) => gridToScreen(d.x, d.y);
    const overBuilding = (id, text, color) => { const v = this.views.buildings.get(id); if (v) { const t = v.topCenter(); tag(t.x, t.y - 8, text, color, 16); } };
    on('slam', (d) => { const s = at(d); tag(s.x, s.y - 34, 'SLAM!', '#ffcf5a', 17); this.cameras.main.shake(90, 0.003); });
    on('flak', (d) => { const s = at(d); splashRing(this, s.x, s.y - 24, 0.6, 0xffe08a, { duration: 300, depth: 2710 }); playSfx(this, SFX.cannonFire); });
    on('broadside', (d) => { overBuilding(d.id, 'Broadside!', '#ffffff'); playSfx(this, SFX.cannonFire); });
    on('volleyLock', (d) => overBuilding(d.id, 'Volley!', '#ffffff'));
    on('decoyFlare', (d) => {
      const s = at(d);
      splashRing(this, s.x, s.y - 30, d.radius, 0xff6b5b, { duration: 700, depth: 2710 });
      overBuilding(d.id, 'Decoy!', '#ff9a8a');
    });
    on('grandDisplay', (d) => {
      for (const p of d.points.slice(0, 12)) { const s = at(p); fireworkBurst(this, s.x, s.y - 30, 0.8, TEX.light); }
      overBuilding(d.id, 'Grand Display!', '#ffe066');
      playSfxCapped(this, SFX.fireworkImpact, FIREWORK_IMPACT_MAX);
    });
    on('grounded', (d) => { const s = at(d); tag(s.x, s.y - 20, 'Grounded!', '#ffd76a'); });
    on('hacked', (d) => { const s = at(d); tag(s.x, s.y - 40, 'HACKED', '#c58cff', 16); splashRing(this, s.x, s.y, 0.6, 0xc58cff, { duration: 450, depth: 2710 }); });
    on('blink', (d) => {
      for (const p of [d.from, d.to]) { const s = at(p); splashRing(this, s.x, s.y - 10, 0.5, 0xb066ff, { duration: 380, depth: 2710 }); }
    });
    on('defused', (d) => { const s = at(d); tag(s.x, s.y - 30, 'Defused!', '#9bf07a', 16); });
    on('celebrate', (d) => overBuilding(d.id, 'Celebrate!', '#ffe066'));
    on('cauterize', (d) => { const s = at(d); splashRing(this, s.x, s.y, d.radius, 0x9bf07a, { duration: 500, depth: 2710 }); });
    on('oilTanker', (d) => overBuilding(d.id, 'Oil Tanker!', '#ff9fd0'));
    on('poisonSpread', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0x7fe07f, { duration: 450, depth: 2710 });
    });
    on('lastStand', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y - 10, 'LAST STAND!', '#ff6b5b', 20); v.pop(); }
    });
    on('trapRearmed', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y + 6, 'Re-armed', '#ffd76a', 15); }
    });
    // RV Lab research (or a level-up) gave buildings a new tier: each one pops with a label.
    on('abilitiesApplied', (d) => {
      this.updateSelectionVisuals(); // range tiers change the range circle
      // After an upgrade, the pop, label and sound wait for the upgrade sound to finish (unlockDelay).
      const show = () => {
        for (const id of d.ids.slice(0, 30)) {
          const v = this.views.buildings.get(id);
          if (v) { v.pop(); const top = v.topCenter(); floatText(this, top.x, top.y - 14, 'New ability!', '#ffe066', 18); }
        }
        playSfx(this, unlockSfx); // (once: the same sound within 40 ms is skipped, so research + applied play it once)
      };
      const wait = this.unlockDelay();
      if (wait > 0) this.time.delayedCall(wait, show); else show();
    });
    const unlockSfx = this.cache.audio.exists(SFX.abilityUnlocked) ? SFX.abilityUnlocked : SFX.upgrade;
    on('abilityResearched', () => playSfx(this, unlockSfx));
    // A level-up that reaches a new ability tier: wait until the upgrade sound has played (its length, minus a
    // small overlap UNLOCK_OVERLAP_MS), then the unlock sound. 0 when there was no upgrade just now (research).
    this.unlockDelay = () => {
      if (this.time.now - (this.lastUpgradeSfxAt ?? -1e9) > 200) return 0;
      return Math.max(0, soundDuration(this, SFX.upgrade) * 1000 - UNLOCK_OVERLAP_MS);
    };
    // A Tower of Rah beam heats up a stage (x3, then x8).
    on('beamHeatUp', () => playSfxCapped(this, SFX.raHeatUp, 2));
    on('mineCollected', (d) => {
      const v = this.views.buildings.get(d.id);
      if (v) { const top = v.topCenter(); floatText(this, top.x, top.y - 20, `+${d.amount}`, COLORS.textGold, 22); }
      playSfx(this, SFX.coinCollect);
    });
    on('buildingUpgraded', (d) => {
      playSfx(this, SFX.upgrade);
      this.lastUpgradeSfxAt = this.time.now;
      const view = d && this.views.buildings.get(d.id);
      if (view && view.growPop) view.growPop(d.level - 1, d.level); // walls just bounce (their size follows the level)
      this.updateSelectionVisuals();
    });
    // Upgrade Walls: every wall bounces, with one upgrade sound.
    on('wallsUpgraded', (d) => {
      playSfx(this, SFX.upgrade);
      this.lastUpgradeSfxAt = this.time.now;
      for (const id of d.ids) {
        const view = this.views.buildings.get(id);
        if (view && view.growPop) view.growPop(d.level - 1, d.level);
      }
      this.updateSelectionVisuals();
    });
    on('buildingSold', (d) => {
      playSfx(this, SFX.sell);
      if (this.selectedId === d.id) this.select(null);
    });
    on('buildingMoved', () => this.updateSelectionVisuals());
    on('baseReset', () => this.select(null));
    on('waveTriggered', (d) => {
      // The countdown: "!" markers over tonight's entrances, the countdown sound, and the planning music.
      this.showSpawnMarkers(d.paths);
      playSfx(this, SFX.waveCountdown);
      this.playPlanningMusic();
    });
    on('waveCancelled', () => {
      // Cancelled during the countdown: the markers go and the planning music hands back to the ambience.
      this.clearSpawnMarkers();
      this.playCalmMusic();
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
      this.playCalmMusic(); // the wave is beaten: back to the day / night ambience
    });
    on('gameOver', (d) => this.onGameOver(d));
  }

  showSpawnMarkers(paths) {
    this.clearSpawnMarkers();
    for (const path of paths) {
      // A "!" warning floating over each entrance enemies will come from, a few tiles in from the map's edge so
      // it's on screen and clear of the HUD (the top entrance sits right under the wave pill).
      const [ex, ey] = MAP.spawnPoints[path];
      const cx = MAP.cols / 2, cy = MAP.rows / 2, d = Math.hypot(cx - ex, cy - ey) || 1;
      const x = ex + ((cx - ex) / d) * MARKER_INSET, y = ey + ((cy - ey) / d) * MARKER_INSET;
      const s = gridToScreen(x, y);
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
    stopAmbience();
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
    this.layoutList = this.layoutBuildings(); // the draft layout in edit mode
    this.syncList(this.layoutList, this.views.buildings, (b) => (b.type === 'wall' ? new WallView(this, b) : new BuildingView(this, b)));
    this.syncList(gs.enemies.filter((e) => e.alive), this.views.enemies, (e) => new EnemyView(this, e));
    this.syncList(gs.projectiles, this.views.projectiles, (p) => new ProjectileView(this, p));
    this.syncList(gs.pools || [], this.views.pools, (p) => new PoolView(this, p));
    this.heroView.sync(gs, this.time.now);
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
