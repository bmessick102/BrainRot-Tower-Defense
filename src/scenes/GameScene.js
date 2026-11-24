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
import { createLayoutDraft, draftBuildings, layoutChanged, isStored, storeAll, storeBuilding, hotbarGroups, checkDraftPlacement, placeInDraft, shiftLayout, wallRun, checkGroupMove, moveGroupInDraft } from '../logic/layout.js';
import { tutorialAllows } from '../logic/tutorial.js';
import { isWaveActive, isWaveInProgress, clamp } from '../logic/util.js';
import { mineShowsCoin } from '../logic/economy.js';
import { MAX_STEP } from '../logic/simulate.js';
import { stepsPerFrame } from '../logic/fastForward.js';
import { BuildingView, buildingTextureKey, buildingPictureKey, mergedSizeFactor, placeBuildingSprite } from '../objects/BuildingView.js';
import { EnemyView } from '../objects/EnemyView.js';
import { djStats, buildingsInDjRange } from '../logic/dj.js';
import { HeroView, QUEEN_VIEW } from '../objects/HeroView.js';
import { getAltar, heroStats } from '../logic/hero.js';
import { getQueenAltar, queenStats } from '../logic/queen.js';
import { WallView, placeWallTile } from '../objects/WallView.js';
import { ProjectileView } from '../objects/ProjectileView.js';
import { PoolView, POOL_COLOR } from '../objects/PoolView.js';
import { RangeCircle } from '../objects/RangeCircle.js';
import { DayNight } from '../objects/DayNight.js';
import { GridOverlay } from '../objects/GridOverlay.js';
import { GrassTufts, drawGroundPlots, groundColor } from '../objects/Ground.js';
import { Villagers } from '../objects/Villagers.js';
import { AirHum } from '../objects/AirHum.js';
import { BeamHum } from '../objects/BeamHum.js';
import { floatText, rpGainText, splashRing, fireballImpact, frostImpact, fireworkBurst, breakerExplosion, fireBreathFx } from '../objects/Effects.js';
import { TEX, SFX, MUSIC, FIRE_SFX, ENEMY_ATTACK_SFX, ENEMY_VOICE, SPELL_SFX, PROJECTILE_KEYS } from '../assetKeys.js';
import { missileWarningFx, quakeFx, ICE_BLUE } from '../objects/EnemyFx.js';
import { playSfxClip, playSfx, playSfxCapped, playSfxEndingIn, playVoiceLine, playMusic, pauseMusic, resumeMusic, stopMusic, crossfadeMusic, fadeOutMusic, hasAmbience, startAmbience, updateAmbience, stopAmbience, soundDuration, prefetchMusic, hasMusicFile, releaseMusic } from '../audio.js';
import { requestAudio, requestImages } from '../assetLoader.js';
import { villageImageKeys, reachableImageKeys } from '../assetPlan.js';
import { COLORS } from '../theme.js';
import { abilityFx, towerRange, towerMinRange } from '../logic/abilities.js';
import { chainLightningFx, arrowStormFx, meteorFx, solarFlareFx, sparklerFx, drawFireRing } from '../objects/AbilityFx.js';
import { Modal, confirmDialog } from '../objects/Modal.js';
import { SpellFx } from '../objects/SpellFx.js';
import { WaveMarkers } from '../objects/WaveMarkers.js';
import { SpawnFog } from '../objects/SpawnFog.js';
import { checkCast, checkCastSpot, spellStats } from '../logic/spells.js';
import { checkMerge } from '../logic/merge.js';
import { NetFx } from '../objects/NetFx.js';
import { WallFx } from '../objects/WallFx.js';
import { HarpoonFx } from '../objects/HarpoonFx.js';
import { ZapFx, MAGE_ZAP_COLORS } from '../objects/ZapFx.js';
import { MageFx } from '../objects/MageFx.js';
import { mageStats, inMageAura } from '../logic/mage.js';
import { zoomLimit, dragThreshold, renderScale, toView } from '../renderScale.js';
import { MapDetail } from '../objects/MapDetail.js';

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
// Great Pyramid of Rah: a beam at lance heat is drawn as a white-hot Solar Lance (white core, red body, crimson edge;
// normal blending so it reads over the bright map) from the muzzle through its target to the end of its range, with
// LANCE_PULSES bright pulses running along it. Past the target it runs at LANCE_END_LIFT px above the ground (a ground
// enemy's middle). Lance hits: one number and a small spark per enemy every LANCE_TEXT_MS, at most LANCE_SPARK_MAX
// sparks per LANCE_SPARK_MS across the map.
const LANCE = { edge: 0x9e0b1f, body: 0xff2a2a, core: 0xffffff, glow: 0xff3a3a, width: 11 };
const LANCE_PULSES = 3, LANCE_PULSE_SPEED = 0.0011, LANCE_END_LIFT = 18;
const LANCE_TEXT_MS = 450, LANCE_SPARK_MS = 250, LANCE_SPARK_MAX = 8;
const FLOCK_SCAN_MS = 2600;
const FRIGO_SOUND_MS = 3500; // Frigo Camillo's footsteps: the Freeze spell's sound every this long while one walks
const CHATTER_SECONDS = [6, 14]; // how often an enemy says its voice line while it's on the map // how often a F.L.O.C.K Tower pulses its scan ring during attacks
/** 120 -> "2:00" */

// A building in front of the hovered / selected one fades to this alpha when it covers more than FADE_OVERLAP of
// that building's picture.
const FADE_ALPHA = 0.35;
const FADE_OVERLAP = 0.12;
// Ground plots under buildings.
// KSI Frost Fortress: at most one "SHATTER!" tag this often (a chain can burst many enemies in a moment).
// The Locklair Mage's Arcane Aegis: at most one "blocked" ring this often (many hits land on covered buildings).
const AEGIS_SPARK_MS = 150;
const SHATTER_TAG_MS = 350;

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
    // Building pictures past Level 1 stream in (src/assetPlan.js): this village's own first (the title screen
    // usually has them in already), then everything its Village Hall can build, in the background.
    requestImages(villageImageKeys(gs.buildings), { front: true });
    requestImages(reachableImageKeys(gs.townHallLevel));

    // The map image is drawn at MAP.imageWidth x MAP.imageHeight world pixels (see mapTiles.js).
    const dayMap = this.add.image(0, 0, TEX.map).setOrigin(0, 0).setDisplaySize(MAP.imageWidth, MAP.imageHeight).setDepth(-10000);
    this.dayNight = new DayNight(this); // night map crossfade + ambient tint for world sprites
    // Full-size map pieces when zoomed in on a desktop (MapDetail.js), each just above its picture.
    this.mapDetail = new MapDetail(this, [
      { key: 'game_map_grid', image: dayMap, depth: -9999.5 },
      { key: 'game_map_grid_dawn', image: this.dayNight.dawnMap, depth: -9998.5 },
      { key: 'game_map_grid_dusk', image: this.dayNight.duskMap, depth: -9997.5 },
      { key: 'game_map_grid_night', image: this.dayNight.nightMap, depth: -9996.5 }
    ]);
    // Press G: the debug grid over the map. Dev builds only: in the game G is the Encore key (AbilityHotbar).
    this.gridOverlay = import.meta.env && import.meta.env.DEV ? new GridOverlay(this) : null;
    this.villagers = new Villagers(this, gs); // decorative gnomes: wander by day, inside at night
    this.airHum = new AirHum(this); // plane drone while Bombers fly
    this.beamHum = new BeamHum(this); // Tower of Rah beam loop while any beam burns
    this.views = { buildings: new Map(), enemies: new Map(), projectiles: new Map(), pools: new Map() };
    this.heroView = new HeroView(this); // the Brisket King
    this.queenView = new HeroView(this, QUEEN_VIEW); // the Hatsune Queen (v0.8)
    this.rangeCircle = new RangeCircle(this);
    // Fuel Station spells: the aiming ring (while a hotbar spell waits for a spot on the map) and zones in play.
    this.spellFx = new SpellFx(this, gs);
    this.netFx = new NetFx(this); // Missile Silo's nets (skyNet.js)
    this.wallFx = new WallFx(this); // Gandolf the Grand's walls (wizardWall.js)
    this.harpoonFx = new HarpoonFx(this); // Harpoon Ballista's Reel In chains (harpoon.js)
    this.zapFx = new ZapFx(this); // F.L.O.C.K Mothership's Triple Zap beams (flockZap.js)
    this.mageZapFx = new ZapFx(this, { colors: MAGE_ZAP_COLORS }); // the Locklair Mage's staff zaps (mage.js), purple
    this.mageFx = new MageFx(this); // ...and his staff glow, aura, Arcane Aegis dome, Zzz and knocked-out stars
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
    this.grassTufts = new GrassTufts(this, gs.decorSeed); // the village's grass tufts (Ground.js), hidden under buildings
    this.plotKey = '';
    this.tuftKey = '';
    this.ghost = null;
    this.placement = null;
    this.selectedId = null;
    this.editMode = false;
    this.editGfx = this.add.graphics().setDepth(-4500);
    this.press = null;
    this.resumedAt = 0;
    this.endingGame = false;
    // The scene object is reused for every game: drop what the last one (maybe another village) left behind.
    // Its graphics were destroyed with it, and a cached key would skip the first redraw.
    this.beamGfx = null; this.ringGfx = null; this.beamGlows = []; this.lanceGfx = null; this.lanceFx = null;
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
    // The wave tracks load on first play; fetch them now so the countdown and the attack start on cue.
    prefetchMusic(MUSIC.planning);
    prefetchMusic(MUSIC.attack);
    // The title music has stopped or faded by now: free its memory (it reloads for the title screen).
    this.time.delayedCall(2000, () => releaseMusic(this, MUSIC.title));
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
    if (!this.cache.audio.exists(MUSIC.planning)) {
      fadeOutMusic(this, PLANNING_FADE_MS);
      // Still loading (it streams in, src/assetPlan.js): start it, at the right point, once it's in.
      if (hasMusicFile(MUSIC.planning)) {
        requestAudio(MUSIC.planning).then((ok) => {
          if (ok && this.sys.isActive() && this.gs.wave && this.gs.wave.phase === 'countdown') this.playPlanningMusic(true);
        });
      }
      return;
    }
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
    playMusic(this, hasMusicFile(MUSIC.attack) ? MUSIC.attack : MUSIC.village); // (loads first if it isn't in yet)
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
      this.lanceGfx = this.add.graphics().setDepth(2650); // Great Pyramid of Rah: every Solar Lance (one object for all)
      this.beamGlows = [];
    }
    const g = this.beamGfx, lg = this.lanceGfx;
    g.clear();
    lg.clear();
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
    const glowAt = (p, size, tint) => {
      const glow = this.beamGlows[n] || (this.beamGlows[n] = this.add.image(0, 0, TEX.light).setBlendMode('ADD').setDepth(2651));
      glow.setVisible(true).setPosition(p.x, p.y).setTint(tint).setDisplaySize(size, size).setAlpha(0.9);
      n++;
    };
    // Solar Lance: muzzle a -> target t -> e (the line's far end, LANCE_END_LIFT above the ground), pulses running out.
    const lance = (a, t, e, flick, phase) => {
      const pts = [a, t, e], w = LANCE.width * flick;
      lg.lineStyle(w * 1.7, LANCE.edge, 0.6).strokePoints(pts, false);
      lg.lineStyle(w, LANCE.body, 0.95).strokePoints(pts, false);
      lg.lineStyle(Math.max(2, w * 0.42), LANCE.core, 1).strokePoints(pts, false);
      const l1 = Math.hypot(t.x - a.x, t.y - a.y), l2 = Math.hypot(e.x - t.x, e.y - t.y), L = l1 + l2 || 1;
      for (let i = 0; i < LANCE_PULSES; i++) {
        const d = (((time * LANCE_PULSE_SPEED + phase + i / LANCE_PULSES) % 1) * L);
        const p = d <= l1 ? { x: a.x + ((t.x - a.x) * d) / (l1 || 1), y: a.y + ((t.y - a.y) * d) / (l1 || 1) }
          : { x: t.x + ((e.x - t.x) * (d - l1)) / (l2 || 1), y: t.y + ((e.y - t.y) * (d - l1)) / (l2 || 1) };
        lg.fillStyle(LANCE.edge, 0.7).fillCircle(p.x, p.y, w * 0.95);
        lg.fillStyle(LANCE.core, 1).fillCircle(p.x, p.y, w * 0.55);
      }
      glowAt(a, w * 4.5, LANCE.glow);
      glowAt(t, w * 5.5, LANCE.glow);
      glowAt(e, w * 3, LANCE.glow);
    };
    const waveOn = isWaveActive(this.gs);
    // Diddypult Oil Moat: a pink slick around the catapult during attacks.
    for (const b of this.gs.buildings) {
      if (b.type !== 'catapult' || b.destroyed || !waveOn) continue;
      const moat = abilityFx(b).moatRadius;
      if (!moat) continue;
      const c = footprintCenter(b), sc = gridToScreen(c.x, c.y), { rx, ry } = rangeEllipse(moat, c.x, c.y);
      this.ringGfx.fillStyle(POOL_COLOR, 0.12).fillEllipse(sc.x, sc.y, rx * 2, ry * 2);
      this.ringGfx.lineStyle(2, POOL_COLOR, 0.45).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
    }
    // Frigo Camillo's cold aura: a frosty ring on the ground around each one.
    for (const e of this.gs.enemies) {
      const A = e.alive && CONFIG.enemies[e.kind].chillAura;
      if (!A) continue;
      const sc = gridToScreen(e.x, e.y), { rx, ry } = rangeEllipse(A.radius, e.x, e.y);
      const pulse = 0.85 + 0.15 * Math.sin(time * 0.004 + e.x);
      this.ringGfx.fillStyle(0x8fd8ff, 0.1 * pulse).fillEllipse(sc.x, sc.y, rx * 2, ry * 2);
      this.ringGfx.lineStyle(2, 0xbfeaff, 0.5 * pulse).strokeEllipse(sc.x, sc.y, rx * 2, ry * 2);
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
      // (a merged Great Pyramid: from its picture's eye, MERGED_MUZZLE)
      const a = bv.muzzlePoint() || { x: bv.sprite.x, y: bv.sprite.y - BEAM_MUZZLE * bv.sprite.displayHeight };
      const flick = 1 + 0.18 * Math.sin(time * 0.05 + b.col);
      // Every beam (Prism: up to 3; a Great Pyramid's hot ones as Solar Lances), then the chains from their targets (thinner).
      (b.beams || []).forEach((bm, i) => {
        const ev = this.views.enemies.get(bm.targetId);
        if (!ev || !ev.sprite) return;
        if (!bm.lance) { beam(a, bodyMid(ev), bm.stage, flick); return; }
        const end = gridToScreen(bm.lance.x2, bm.lance.y2);
        lance(a, bodyMid(ev), { x: end.x, y: end.y - LANCE_END_LIFT }, flick, i / 3 + b.col * 0.13);
      });
      for (const ch of b.beamChains || []) {
        const from = this.views.enemies.get(ch.from), to = this.views.enemies.get(ch.to);
        if (from && from.sprite && to && to.sprite) beam(bodyMid(from), bodyMid(to), ch.stage, flick, 0.6);
      }
    }
    for (let i = n; i < this.beamGlows.length; i++) this.beamGlows[i].setVisible(false);
  }

  /**
   * Frigo Camillo's footsteps: while one walks (not attacking), the Freeze spell's sound now and then (v0.7), quietly,
   * never more than one at once.
   */
  frigoSounds(delta) {
    this.frigoSoundT = (this.frigoSoundT || 0) + delta;
    if (this.frigoSoundT < FRIGO_SOUND_MS) return;
    this.frigoSoundT = 0;
    if (!isWaveActive(this.gs) || !this.gs.enemies.some((e) => e.alive && e.kind === 'frigo' && !e.attacking)) return;
    playSfxCapped(this, SPELL_SFX.freeze, 1, { volume: 0.45 });
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
      const { rx, ry } = rangeEllipse(towerRange(b), footprintCenter(b).x, footprintCenter(b).y);
      const ring = this.add.graphics().setDepth(2590).setPosition(c.x, c.y).setScale(0.1).setAlpha(0.55);
      ring.lineStyle(3, 0x4cd6ff, 1).strokeEllipse(0, 0, rx * 2, ry * 2);
      ring.fillStyle(0x4cd6ff, 0.06).fillEllipse(0, 0, rx * 2, ry * 2);
      this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 1400, ease: 'Sine.easeOut', onComplete: () => ring.destroy() });
    }
  }

  update(time, delta) {
    if (!this.endingGame) {
      // 2x / 4x wave speed: the same capped step run 2 or 4 times (src/logic/fastForward.js), never one longer step.
      const step = Math.min(delta / 1000, MAX_STEP);
      for (let i = stepsPerFrame(this.gs); i > 0; i--) this.gs.update(step);
    }
    this.dayNight.update(this.gs.clock);
    this.mapDetail.update(time);
    if (this.gridOverlay) this.gridOverlay.update(this.gs.clock);
    this.grassTufts.setTint(this.ambientTint ?? 0xffffff);
    // Day / night ambience: follows how dark it is, and steps aside for the attack music during a wave.
    updateAmbience(this.night || 0, !isWaveInProgress(this.gs) && !this.endingGame, Math.min(delta / 1000, MAX_STEP));
    this.villagers.update(Math.min(delta / 1000, MAX_STEP), time);
    this.airHum.update(this.endingGame ? [] : this.gs.enemies, delta / 1000);
    this.beamHum.update(this.endingGame ? [] : this.gs.buildings, delta / 1000);
    this.flockScan(delta);
    this.drawBeams(time);
    this.frigoSounds(delta);
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
    this.updateMergePick(time);
    this.netFx.update(time);
    this.wallFx.update(time);
    this.harpoonFx.update(time);
    this.zapFx.update(time);
    this.mageZapFx.update(time);
    this.mageFx.update(time);
    this.waveMarkers.update();
    this.spawnFog.update();
  }

  // ---------- merging (src/logic/merge.js): Merge in the panel, then tap the second copy on the map ----------
  /**
   * Start picking the copy to merge `id` with: every other max-level, unmerged copy of its type glows gold (BuildingView
   * reads scene.mergeTargets) over a pulsing gold tile, and UIScene shows "Tap another Level 10 Cannon to merge" with
   * Cancel. Tapping one opens the confirm window; Cancel, Esc or a right click stop. Returns false if it can't merge now.
   */
  beginMergePick(id) {
    const b = this.gs.getBuilding(id);
    const c = checkMerge(this.gs, b);
    if (!c.ok) return false;
    if (this.placement) this.cancelPlacement();
    this.cancelSpellAim();
    this.mergePick = { id, type: b.type };
    this.mergeTargets = new Set(c.candidates.map((o) => o.id));
    this.mergeGroundKey = '';
    this.gs.emit('mergePickChanged', { active: true, id, type: b.type });
    return true;
  }

  /** Stop picking (Cancel, Esc, a right click, a wave starting, or a partner picked). */
  cancelMergePick() {
    if (!this.mergePick) return;
    this.mergePick = null;
    this.mergeTargets = null;
    if (this.mergeGfx) this.mergeGfx.clear();
    this.gs.emit('mergePickChanged', { active: false });
  }

  /** Every frame while picking: the partners' gold tiles pulse; it ends by itself if the merge can't happen any more. */
  updateMergePick(time) {
    const pick = this.mergePick;
    if (!pick) return;
    const c = checkMerge(this.gs, this.gs.getBuilding(pick.id));
    if (!c.candidates.length || isWaveActive(this.gs) || this.editMode) { this.cancelMergePick(); return; }
    this.mergeTargets = new Set(c.candidates.map((o) => o.id));
    if (!this.mergeGfx) this.mergeGfx = this.add.graphics().setDepth(-8980); // on the ground, over the dirt plots
    const g = this.mergeGfx;
    g.clear();
    const k = 0.5 + 0.5 * Math.sin(time * 0.006);
    for (const b of c.candidates) {
      const w = fpW(b), h = fpH(b), grow = 0.12 * k;
      const pts = [gridToScreen(b.col - grow, b.row - grow), gridToScreen(b.col + w + grow, b.row - grow), gridToScreen(b.col + w + grow, b.row + h + grow), gridToScreen(b.col - grow, b.row + h + grow)];
      g.fillStyle(0xffc83a, 0.25 + 0.2 * k).fillPoints(pts, true);
      g.lineStyle(3, 0xffe9a0, 0.7 + 0.3 * k).strokePoints(pts, true);
    }
  }

  /** A tap while picking: a glowing partner opens the confirm window; anything else does nothing (Cancel is on screen). */
  mergePickClick(wx, wy) {
    const b = this.pickBuilding(wx, wy);
    if (!b || !this.mergeTargets || !this.mergeTargets.has(b.id)) { playSfx(this, SFX.invalid); return; }
    const keepId = this.mergePick.id;
    this.views.buildings.get(b.id)?.pop();
    playSfx(this, SFX.buildingSelect);
    this.cancelMergePick();
    this.scene.get('UIScene').openMergeConfirm(keepId, b.id);
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
   * moves, upgrades and its range perks. The Locklair Mage the same way (v0.12.1), in gold: every building inside his
   * aura, walls and his own building too (what Arcane Aegis covers).
   */
  updateDjHighlight() {
    const list = this.layoutList || [];
    const sel = this.selectedId ? list.find((b) => b.id === this.selectedId) : null;
    const mage = sel && sel.type === 'mageAltar';
    const affected = !sel || sel.destroyed ? []
      : sel.type === 'dj' ? buildingsInDjRange(sel, list)
        : mage ? (() => { const st = mageStats(sel); return list.filter((b) => inMageAura(sel, st, b)); })() : [];
    this.djAffected = affected.length ? new Set(affected.map((b) => b.id)) : null;
    this.affectedTint = mage ? [0xffe27a, 0xffbf3a] : null; // (BuildingView: null = DJ Babyface's purple)
    const fill = mage ? 0xffd25a : 0xb066ff, rim = mage ? 0xfff0b8 : 0xe2c2ff;
    // ...and a purple diamond on the ground under each one (clear even on dark pictures).
    const key = `${mage ? 'm' : 'd'}|` + affected.map((b) => `${b.id}:${b.col},${b.row}`).join('|');
    if (key === this.djGroundKey) return;
    this.djGroundKey = key;
    if (!this.djGroundGfx) this.djGroundGfx = this.add.graphics().setDepth(-8990); // over the dirt plots
    const g = this.djGroundGfx;
    g.clear();
    for (const b of affected) {
      const w = fpW(b), h = fpH(b);
      const pts = [gridToScreen(b.col, b.row), gridToScreen(b.col + w, b.row), gridToScreen(b.col + w, b.row + h), gridToScreen(b.col, b.row + h)];
      g.fillStyle(fill, 0.32).fillPoints(pts, true);
      g.lineStyle(2, rim, 0.9).strokePoints(pts, true);
    }
  }

  /** Ground plots and grass tufts: drawn again only when the layout (or the map's grass colour) changes. */
  updateLayoutExtras() {
    const list = this.layoutList || [];
    const color = groundColor(this.gs.clock);
    const layoutKey = list.map((b) => `${b.id}:${b.col},${b.row},${fpW(b)},${fpH(b)},${b.level},${b.destroyed ? 1 : 0}`).join('|')
      + `|${this.placement ? this.placement.id : ''}`;
    const key = `${layoutKey}|${color}`;
    if (key === this.plotKey) return;
    if (layoutKey !== this.tuftKey) { this.tuftKey = layoutKey; this.grassTufts.layout(list, this.placement ? this.placement.id : null); }
    this.plotKey = key;
    this.drawPlots(list, color);
  }

  /**
   * Solid grass under every building's and wall's tiles (v0.9.1: the map's checker doesn't show under them), in the map's
   * grass colour for the time of day, with a light rim round each building's plot (Ground.js). The building being moved
   * leaves its old spot bare.
   */
  drawPlots(list, color = groundColor(this.gs.clock)) {
    drawGroundPlots(this.plotGfx, list, color, this.placement ? this.placement.id : null);
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
      // Over an incoming-wave marker: it lights up and the hand shows (a click opens / folds its troops; v0.7.1).
      const hand = !b && !this.editMode ? this.waveMarkers.hoverAt(w.x, w.y) : this.waveMarkers.hoverAt(null, null);
      if (hand !== !!this.markerHand) { this.markerHand = hand; this.input.setDefaultCursor(hand ? 'pointer' : 'default'); }
    } else if (this.markerHand) { this.markerHand = false; this.waveMarkers.hoverAt(null, null); this.input.setDefaultCursor('default'); }
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
   * Show the perk pips (and a merged building's Mastery stars) on that label? Not in edit mode (v0.8.3), where every
   * building is labelled: there the chip is just the level badge (and the merge gear), so the village stays readable.
   */
  showPips() {
    return !this.editMode;
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
    cam.setZoom(Math.max(zoomLimit(CONFIG.camera.startZoom), this.minZoom()));
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
    return Math.max(zoomLimit(CONFIG.camera.minZoom), cam.width / this.mapSize.w, cam.height / this.mapSize.h);
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
    zoom = clamp(zoom, this.minZoom(), zoomLimit(CONFIG.camera.maxZoom));
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
        if (this.mergePick) { this.cancelMergePick(); return; } // ...or picking a building to merge with
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
      if (!pr.dragging && Phaser.Math.Distance.Between(p.x, p.y, pr.x, pr.y) >= dragThreshold(CONFIG.camera.dragThresholdPx)) pr.dragging = true;
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
      if (this.mergePick) { this.cancelMergePick(); return; } // ...or picking a building to merge with
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
    // Picking the building to merge with: only the glowing partners answer.
    if (this.mergePick) { this.mergePickClick(w.x, w.y); return; }
    // An incoming-wave marker (off the grass, by the red arrow): open or fold its list of troops (v0.7.1).
    if (!this.editMode && this.waveMarkers.toggleAt(w.x, w.y)) { playSfx(this, SFX.uiClick); return; }
    const b = this.pickBuilding(w.x, w.y);
    if (this.editMode) {
      // Edit mode: clicking a building picks it up to move; nothing else happens. With Select Row on, a wall
      // brings its whole straight run along.
      if (b) { playSfx(this, SFX.buildingSelect); if (this.rowSelect && b.type === 'wall') this.beginRowMove(b.id); else this.beginMove(b.id); }
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
    // The Hatsune Queen the same way: clicking her selects her altar with her "clicked on" line (Encore Cloak is
    // only on the hotbar).
    if (this.queenView.hitTest(w.x, w.y) && (!b || b.type === 'queenAltar')) {
      const altar = getQueenAltar(this.gs);
      if (altar) { playVoiceLine(this, [SFX.queenSelect], 'queenSelect'); this.queenView.selectPose(this.time.now); this.select(altar.id); }
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
      // Either hero's altar makes the same altar sound (her own line plays only when you click her, above).
      const isAltar = b.type === 'altar' || b.type === 'queenAltar' || b.type === 'mageAltar';
      playSfx(this, isAltar && this.cache.audio.exists(SFX.altarSelect) ? SFX.altarSelect : SFX.buildingSelect);
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
    } else if (b.type === 'queenAltar') {
      // The Hatsune Queen's guard range: she shoots enemies (ground and air) inside it.
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, queenStats(b).guardRange, 0);
    } else if (b.type === 'mageAltar') {
      // The Locklair Mage's zap range (his aura, a little smaller, shows on the ground in raids).
      const c = footprintCenter(b);
      this.rangeCircle.show(c.x, c.y, mageStats(b).attackRange, 0);
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
    this.rowSelect = false; // Select Row starts off every time
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
  pickFromHotbar(type, level, merged = false) {
    if (!this.layout) return;
    const group = hotbarGroups(this.gs, this.layout).find((g) => g.type === type && g.level === level && g.merged === !!merged);
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
      if (this.placement && (this.placement.id === b.id || (this.placement.ids && this.placement.ids.includes(b.id)))) continue;
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
    this.placement = { mode: 'move', id, fromHotbar, type: b.type, level: b.level, merged: !!b.merged, orient: d.orient, w: d.w, h: d.h, col: d.col, row: d.row, valid: !fromHotbar };
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

  /** Select Row (edit mode): on, clicking a wall picks up its whole straight run of walls. */
  setRowSelect(on) {
    if (!this.editMode) return;
    this.rowSelect = !!on;
    if (this.placement && this.placement.mode === 'row' && !on) this.cancelPlacement();
    this.gs.emit('rowSelectChanged', { active: this.rowSelect });
  }

  /** Pick up the straight run of walls through wall `id` (Select Row): they move together, keeping their shape. */
  beginRowMove(id) {
    if (!this.editMode || !this.layout || isWaveActive(this.gs)) return;
    const run = wallRun(this.gs, this.layout, id);
    if (!run) return;
    if (this.placement) this.endPlacement();
    this.select(null);
    const b = this.gs.getBuilding(id);
    this.placement = {
      mode: 'row', id, ids: run.ids, base: { col: run.col, row: run.row }, type: 'wall', level: b.level,
      orient: run.axis, w: run.w, h: run.h, col: run.col, row: run.row, valid: true
    };
    for (const wid of run.ids) this.views.buildings.get(wid)?.setAlpha(0.3);
    this.createGhost();
    this.drawEditOutlines();
    this.gs.emit('placementChanged', { active: true, type: 'wall', row: run.ids.length });
    if (this.touchMode) { this.ghostToGrid(run.col, run.row); return; }
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
    // (A merged defense being moved shows its own picture.)
    const key = pl.merged ? buildingPictureKey(this, { type: pl.type, level: pl.level, merged: true }) : buildingTextureKey(this, pl.type, pl.level);
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
    if (pl.mode === 'row' && this.layout) {
      // Select Row: every wall of the run moves by the same step; all of them must land clear and on grass.
      spot = checkGroupMove(this.gs, this.layout, pl.ids, pl.col - pl.base.col, pl.row - pl.base.row);
    } else if (pl.mode === 'move' && this.layout) {
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
      const gsp = this.ghost.sprites[0];
      placeBuildingSprite(gsp, pl.col, pl.row, pl.w, pl.type, pl.level);
      if (pl.merged) { const k = mergedSizeFactor(this, { type: pl.type, level: pl.level, merged: true }); gsp.setScale(gsp.scaleX * k, gsp.scaleY * k); }
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
      const key = o.merged ? buildingPictureKey(this, o) : buildingTextureKey(this, o.type, o.level);
      const count = o.type === 'wall' ? fpW(o) * fpH(o) : 1;
      this.swapPreview = { id, sprites: Array.from({ length: count }, () => this.add.image(0, 0, key).setOrigin(0.5, 1).setAlpha(0.6)) };
      this.views.buildings.get(id)?.setAlpha(0.3);
    }
    const { col, row } = plan.otherTo;
    if (o.type === 'wall') this.placeWallGhost(this.swapPreview.sprites, col, row, fpW(o), fpH(o), o.orient, o.level);
    else {
      const sp = this.swapPreview.sprites[0];
      placeBuildingSprite(sp, col, row, fpW(o), o.type, o.level);
      const k = mergedSizeFactor(this, o);
      if (k !== 1) sp.setScale(sp.scaleX * k, sp.scaleY * k);
    }
    for (const sp of this.swapPreview.sprites) sp.setDepth(2460).setTint(0xb8ffb8);
  }

  clearSwapPreview() {
    if (!this.swapPreview) return;
    for (const sp of this.swapPreview.sprites) sp.destroy();
    this.views.buildings.get(this.swapPreview.id)?.setAlpha(1);
    this.swapPreview = null;
  }

  /** The sound for setting a building down: the building-placed sound, except for walls (they keep `wallSound`). */
  placeSound(type, wallSound) {
    return type !== 'wall' && this.cache.audio.exists(SFX.buildingPlaced) ? SFX.buildingPlaced : wallSound;
  }

  confirmPlacement() {
    const pl = this.placement;
    if (!pl) return;
    if (!pl.valid) { playSfx(this, SFX.invalid); return; }
    if (pl.mode === 'row' && this.layout) {
      if (!moveGroupInDraft(this.gs, this.layout, pl.ids, pl.col - pl.base.col, pl.row - pl.base.row).ok) { playSfx(this, SFX.invalid); return; }
      playSfx(this, SFX.place);
      this.endPlacement();
      this.layoutUpdated();
      return;
    }
    if (pl.mode === 'move' && this.layout) {
      // Edit mode: drop it into the draft layout (the village changes on Save).
      if (!placeInDraft(this.gs, this.layout, pl.id, pl.col, pl.row, pl.orient).ok) { playSfx(this, SFX.invalid); return; }
      playSfx(this, this.placeSound(pl.type, SFX.place));
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
    // A building bought from the shop lands with the upgrade sound (v0.10.1, the user's call); a moved one with the
    // building-placed sound (walls keep theirs).
    playSfx(this, pl.mode === 'buy' ? SFX.upgrade : this.placeSound(pl.type, SFX.place));
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
    if (pl.mode === 'row') for (const id of pl.ids) this.views.buildings.get(id)?.setAlpha(1);
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

    // A new Village Hall level: fetch the pictures of the levels it opens up (src/assetPlan.js).
    on('townHallUpgraded', (d) => requestImages(reachableImageKeys(d.level)));

    on('enemyHit', (d) => {
      const v = this.views.enemies.get(d.id);
      const tick = d.source === 'pool' || d.source === 'beam' || d.source === 'lance' || d.source === 'burn' || d.source === 'ring' || d.source === 'poison' || d.source === 'bleed';
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
      if (d.source === 'lance') {
        // Great Pyramid of Rah's Solar Lance: a crimson "/s" number and a small white-red spark per enemy now and then
        // (every enemy on the line is hit 5 times a second), with a cap on sparks across the map.
        const fx = this.lanceFx || (this.lanceFx = { text: new Map(), windowAt: 0, sparks: 0 });
        if (this.time.now - (fx.text.get(d.id) || 0) <= LANCE_TEXT_MS) return;
        fx.text.set(d.id, this.time.now);
        if (fx.text.size > 200) fx.text.clear();
        const lift = v && v.sprite ? v.sprite.y - v.sprite.originY * v.sprite.displayHeight + 0.5 * v.sprite.displayHeight - s.y : -18;
        floatText(this, s.x + Phaser.Math.Between(-8, 8), s.y + lift - 10, `${Math.round(d.amount * 5)}/s`, '#ff8a9a', 12);
        if (this.time.now - fx.windowAt > LANCE_SPARK_MS) { fx.windowAt = this.time.now; fx.sparks = 0; }
        if (fx.sparks++ < LANCE_SPARK_MAX) splashRing(this, s.x, s.y + lift, 0.22, 0xffd0d0, { duration: 220, depth: 2652 });
        return;
      }
      if (d.source === 'pool' || d.source === 'burn' || d.source === 'ring' || d.source === 'poison' || d.source === 'bleed' || d.source === 'shatter') {
        // Damage over time: small numbers, no hit sound (they come every half second). Pink oil, orange fire,
        // green poison, red bleeding; KSI Frost Fortress ice shards in icy blue (their burst has its own sound).
        const color = { pool: '#ff8fc8', poison: '#8be06b', bleed: '#ff6b6b', shatter: '#bfe9ff' }[d.source] || '#ffa04a';
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
      floatText(this, s.x, s.y + lift, `${Math.round(d.amount)}`, d.source === 'armor' ? '#9fb8d6' : '#ffffff', 14); // armored: steel blue
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
    // The Hatsune Queen: her bolts (the Locklair's arrow sound), Encore Cloak, knockouts and getting back up.
    const queenAt = () => { const h = this.gs.queen; return h ? gridToScreen(h.x, h.y) : null; };
    on('queenShot', () => playSfx(this, FIRE_SFX.archer)); // the same shot sound as a Locklair Tower, never skipped
    on('queenBoltHit', (d) => {
      if (!d.crit && !d.head) return;
      const s = gridToScreen(d.x, d.y);
      floatText(this, s.x, s.y - (d.air ? 90 : 46), d.head ? 'HEADLINER!' : 'CRIT!', d.head ? '#ffb3e6' : '#7ff0e8', d.head ? 16 : 14);
    });
    on('queenEncore', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, 1.2, 0x2fc7c0, { duration: 520, depth: 2710 });
      floatText(this, s.x, s.y - 90, 'ENCORE!', '#7ff0e8', 22);
      playSfx(this, this.cache.audio.exists(SPELL_SFX.invisibility) ? SPELL_SFX.invisibility : SFX.upgrade); // she vanishes
    });
    on('queenDodge', (d) => { const s = gridToScreen(d.x, d.y); floatText(this, s.x, s.y - 70, 'Dodge!', '#d9e4ff', 14); });
    on('queenKnockedOut', () => { const s = queenAt(); if (s) floatText(this, s.x, s.y - 70, 'Knocked out! Zzz', '#d9e4ff', 18); playSfx(this, SFX.buildingDestroyed); });
    on('queenCurtainCall', (d) => { const s = gridToScreen(d.x, d.y); floatText(this, s.x, s.y - 80, 'Curtain Call!', '#9bf07a', 18); });
    on('queenReady', () => { const s = queenAt(); if (s) floatText(this, s.x, s.y - 80, 'Ready!', '#7ff0e8', 16); });
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
      } else if (d.kind === 'jug') {
        // A Diddy Trebuchet's oil jug landing (Barrel Burst): an oily splash ring and a small thud.
        splashRing(this, s.x, s.y, d.radius, POOL_COLOR, { duration: 420, depth: 2710 });
        playSfxCapped(this, SFX.catapultImpact, 2, { volume: 0.35 });
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
      } else if (d.kind === 'ksi' || d.kind === 'ksiBounce') {
        // A KSI Tower bottle bursts: a cold flash, ice shards, frost mist, snowflakes and a shockwave (frostImpact),
        // then the exact splash area as a ring, held a little longer so it reads clearly (like the Gandolf's).
        frostImpact(this, s.x, s.y, d.radius, TEX.light);
        splashRing(this, s.x, s.y, d.radius, ICE_BLUE, { duration: 600, depth: 2710 });
        playSfxCapped(this, SFX.ksiImpact, 4);
      } else if (d.kind === 'megaBurst') {
        // Rolling Thunder: the Mega Cannon's ball bursts where its roll ends.
        fireballImpact(this, s.x, s.y, d.radius * 0.8, TEX.light);
        splashRing(this, s.x, s.y, d.radius, 0xffa040, { duration: 450, depth: 2710 });
        playSfxCapped(this, SFX.mortarImpact, 3);
      } else if (d.kind === 'syncBlast') {
        // Synchronized Impact: the Triple Mortar's shells meet in one combined blast.
        fireballImpact(this, s.x, s.y, d.radius, TEX.light);
        splashRing(this, s.x, s.y, d.radius, 0xffe08a, { duration: 600, depth: 2710 });
        splashRing(this, s.x, s.y, d.radius * 0.6, 0xffffff, { duration: 420, depth: 2710 });
        this.cameras.main.shake(120, 0.003);
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
      splashRing(this, s.x, s.y, d.radius || 0.6, 0xff8a3c, d.missile ? { duration: 450, depth: 2710 } : undefined);
      // Big Yahu's missile is the Bomber's bomb, bigger: the same blast ring and sound, its whole radius, and a jolt.
      if (d.missile) { splashRing(this, s.x, s.y, d.radius * 0.5, 0xffe08a, { duration: 320, depth: 2710 }); this.cameras.main.shake(160, 0.004); }
      playSfxCapped(this, SFX.bombExplode, BOMB_IMPACT_MAX); // long rumble: a few at once is plenty
    });
    // ---------- v0.6 enemies ----------
    // Big Yahu: the red target where his missile will land, until it does.
    on('missileIncoming', (d) => { const s = gridToScreen(d.x, d.y); missileWarningFx(this, s.x, s.y, d.radius, d.delay * 1000); });
    // John Pork's call: his phone rings out over the F.L.O.C.K Towers it silences.
    on('porkCall', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0xff6b6b, { duration: 650, depth: 2710 });
      floatText(this, s.x, s.y - 70, d.ids.length ? 'RING RING!' : 'Ring ring?', '#ffd0d0', 18);
      for (const id of d.ids) {
        const v = this.views.buildings.get(id);
        if (!v) continue;
        const t = v.topCenter();
        floatText(this, t.x, t.y - 10, 'Silenced!', '#ff8a8a', 15);
        v.pop();
      }
      playSfxClip(this, SFX.porkCall, { maxAtOnce: 1, minGapMs: 800, maxSeconds: 3.5 });
    });
    // Rahhh Skeleton's summoning bash: a bone-white ring around him and a puff of dirt where each Skeleton climbs out.
    on('skeletonSummon', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, 1.2, 0xe8dcc0, { duration: 550, depth: 2710 });
      floatText(this, s.x, s.y - 70, 'RAHHH!', '#f0e2c4', 20);
      for (const t of d.troops) {
        const p = gridToScreen(t.x, t.y);
        splashRing(this, p.x, p.y, 0.35, 0x8f673d, { duration: 500, depth: 2709 });
      }
      this.cameras.main.shake(80, 0.002);
      playSfxClip(this, SFX.skeletonRage, { maxAtOnce: 2, minGapMs: 250, maxSeconds: 2.5 });
    });
    // Brr Brr Patapim's earthquake: cracks across the ground, a heavy jolt and his stomp.
    on('quake', (d) => {
      const s = gridToScreen(d.x, d.y);
      quakeFx(this, s.x, s.y, d.radius);
      floatText(this, s.x, s.y - 90, 'QUAKE!', '#e8c890', 20);
      this.cameras.main.shake(320, 0.009);
      playSfxClip(this, SFX.patapimQuake, { maxAtOnce: 2, minGapMs: 400, maxSeconds: 2.2, fadeMs: 500 });
    });
    // v0.7 enemies.
    // Bri Bri Bicus Dicus's armor breaks: steel shards, a callout and its sound.
    on('armorBroken', (d) => {
      const v = this.views.enemies.get(d.id);
      const s = v && v.sprite ? { x: v.sprite.x, y: v.sprite.y - v.sprite.displayHeight * 0.6 } : enemyPos(d);
      const shards = this.add.particles(s.x, s.y, TEX.light, {
        speed: { min: 50, max: 160 }, angle: { min: 0, max: 360 }, lifespan: { min: 300, max: 600 }, scale: { start: 0.09, end: 0 },
        alpha: { start: 1, end: 0 }, tint: [0xffffff, 0xd6e2ec, 0x9fb3c6, 0x6f8499], gravityY: 200, emitting: false
      }).setDepth(2720);
      shards.explode(18);
      this.time.delayedCall(800, () => shards.destroy());
      floatText(this, s.x, s.y - 26, 'Armor broken!', '#dfe8f0', 15);
      playSfxCapped(this, SFX.bicusArmorBreak, 3);
    });
    // Bombombini Gusini breathes fire: a stream from its beak to the target, bursts there and next to it.
    on('fireBreath', (d) => {
      const v = this.views.enemies.get(d.id);
      if (!v || !v.sprite) return;
      const beak = { x: v.sprite.x + (v.movingLeft ? -0.42 : 0.42) * v.sprite.displayWidth, y: v.sprite.y - v.sprite.displayHeight * 0.62 };
      const bv = this.views.buildings.get(d.targetId);
      const t = bv && bv.sprite ? { x: bv.sprite.x, y: bv.sprite.y - bv.sprite.displayHeight * 0.45 } : gridToScreen(d.tx, d.ty);
      const splash = (d.splash || []).map((id) => {
        const o = this.views.buildings.get(id), b = this.gs.getBuilding(id);
        if (o && o.sprite) return { x: o.sprite.x, y: o.sprite.y - Math.min(40, o.sprite.displayHeight * 0.4) };
        return b ? gridToScreen(b.col + 0.5, b.row + 0.5) : null;
      }).filter(Boolean);
      fireBreathFx(this, beak, t, splash, TEX.light);
      playSfxCapped(this, SFX.wizardFire, 2, { volume: 0.7 });
    });
    // A Chimpanzini Bananini dives into a building: a banana splat, and its death picture.
    on('enemyDive', (d) => {
      const v = this.views.enemies.get(d.id);
      if (v) v.spawnCorpse();
      const s = enemyPos(d);
      splashRing(this, s.x, s.y, 0.6, 0xffd23f, { duration: 380, depth: 2710 });
      playSfxCapped(this, SFX.enemyHitBig, ENEMY_HIT_MAX);
    });
    // Brr Brr Patapim drops a Chimpanzini: a puff of leaves.
    on('enemySpawnTroops', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, 0.7, 0x7ab84a, { duration: 420, depth: 2709 });
    });
    // La Vaca Saturno's boulder lands, then each bounce.
    on('boulderLanded', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0xb8a080, { duration: 380, depth: 2710 });
      if (!d.bounce) this.cameras.main.shake(100, 0.003);
      playSfxCapped(this, SFX.vacaImpact, 3);
    });
    // v0.8: Quandale Dingle's dash: a dust kick as he sets off; the impact: a heavy hit, a burst, a jolt, the stunned building.
    on('enemyDash', (d) => {
      const s = enemyPos(d);
      splashRing(this, s.x, s.y - 2, 0.5, 0xc9b28a, { duration: 320, depth: 2710 });
      playSfxCapped(this, SFX.quandaleDash, 2);
    });
    on('dashImpact', (d) => {
      const s = enemyPos(d), v = this.views.buildings.get(d.targetId);
      const t = v ? v.topCenter() : { x: s.x, y: s.y - 30 };
      splashRing(this, s.x, s.y - 4, 0.9, 0xffcf5a, { duration: 360, depth: 2710 });
      splashRing(this, t.x, t.y + 20, 0.6, 0xc9b28a, { duration: 420, depth: 2709 });
      floatText(this, t.x, t.y - 14, 'WHAM!', '#ffcf5a', 18);
      this.cameras.main.shake(140, 0.004);
      playSfxCapped(this, SFX.enemyHitBig, ENEMY_HIT_MAX);
    });
    on('buildingStunned', (d) => {
      const v = this.views.buildings.get(d.id);
      if (!v) return;
      const t = v.topCenter();
      floatText(this, t.x, t.y - 30, 'Stunned!', '#ffe14a', 15);
      v.pop();
    });
    // KSI Tower Fully Frozen: an enemy freezes solid.
    on('enemyFrozen', (d) => { const s = enemyPos(d); splashRing(this, s.x, s.y - 4, 0.45, 0xffffff, { duration: 360, depth: 2710 }); });
    // Melee hits: a horde swinging at once would be a wall of noise, so only a few overlap.
    on('enemyAttack', (d) => {
      const view = this.views.enemies.get(d.id);
      if (view) view.attackPose(this.time.now);
      const key = ENEMY_ATTACK_SFX[d.kind];
      if (key) playSfxCapped(this, key, ENEMY_HIT_MAX);
    });
    on('enemyJump', () => playSfxCapped(this, SFX.sharkJump, ENEMY_HIT_MAX));
    on('spellBrewed', () => playSfx(this, SFX.spellBrewed)); // the Fuel Station brews a spell
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
      systemCrash: { color: 0x4cd6ff, text: 'System Crash!' },
      blizzard: { color: ICE_BLUE, text: 'Polar Vortex!', shake: true } // KSI Tower
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
    // Merged defenses: a Ballista Bolt pins (a boss is only slowed); two copies merge into one.
    on('enemyPinned', (d) => {
      const s = at(d), v = this.views.enemies.get(d.id);
      const top = v && v.sprite ? v.sprite.y - v.sprite.displayHeight : s.y - 40;
      tag(s.x, top - 10, d.boss ? 'SLOWED' : 'PINNED!', d.boss ? '#9fd8ff' : '#ffe2a0', 16);
      splashRing(this, s.x, s.y, 0.45, 0xf5e6c0, { duration: 320, depth: 2710 });
    });
    // F.L.O.C.K Mothership: Triple Zap. A tesla-style beam of electricity, straight from the tower's emitter to each
    // enemy it zaps, crackling and following it until it fades (ZapFx), and a soft crackle. EMP Pulse: a blue ring over
    // its zap range.
    on('flockZap', (d) => {
      this.zapFx.add(d, this.time.now);
      playSfxCapped(this, SPELL_SFX.lightning, 1, { volume: 0.3 });
    });
    // The Locklair Mage (v0.12): his staff zap (a purple bolt from the crystal, his own sound, one at a time), Arcane
    // Aegis going up (a flash over his aura), and hits it stops (a small violet ring, at most every AEGIS_SPARK_MS).
    on('mageZap', (d) => {
      this.mageZapFx.add(d, this.time.now);
      playSfxCapped(this, SFX.mageAttack, 1, { volume: 0.45 });
    });
    on('mageAegis', (d) => {
      const s = gridToScreen(d.x, d.y);
      splashRing(this, s.x, s.y, d.radius, 0xffd98a, { duration: 650, depth: 2650 });
      playSfxCapped(this, SPELL_SFX.invisibility, 1, { volume: 0.5 });
    });
    on('aegisBlocked', (d) => {
      if (this.time.now - (this.lastAegisSpark || 0) < AEGIS_SPARK_MS) return;
      this.lastAegisSpark = this.time.now;
      const v = this.views.buildings.get(d.id);
      if (v && v.sprite) splashRing(this, v.sprite.x, v.sprite.y - v.sprite.displayHeight * 0.5, 0.35, 0xe0b8ff, { duration: 260, depth: 2652 });
    });
    // KSI Frost Fortress: Shatter. A chilled enemy bursts: an icy ring over the shards' reach, shards flying out, an ice
    // crack, and "SHATTER!" (at most every SHATTER_TAG_MS, so a chain through a crowd isn't a wall of text).
    // Diddy Trebuchet's Barrel Burst: the barrel breaks into wooden planks, then its oil jugs lob out to their spots and
    // land as the game does (d.delay of game time: shorter at 2x / 4x speed). Each jug's splash is a 'splash' of kind 'jug'.
    on('barrelBurst', (d) => {
      const s = at(d), speed = stepsPerFrame(this.gs) || 1;
      const g = this.add.graphics().setDepth(2712);
      const planks = [];
      for (let i = 0; i < 10; i++) planks.push({ a: (i / 10) * Math.PI * 2 + Math.random() * 0.4, len: 7 + Math.random() * 5, spin: Math.random() * Math.PI, up: 18 + Math.random() * 16 });
      const draw = (k) => { // k: 0 -> 1 as they fly out and fall
        g.clear();
        const r = 4 + k * 46, alpha = 1 - k * k;
        for (const pl of planks) {
          const x = s.x + Math.cos(pl.a) * r, y = s.y - 12 + Math.sin(pl.a) * r * 0.55 - pl.up * 4 * k * (1 - k), t = pl.spin + k * 6;
          const dx = Math.cos(t) * pl.len, dy = Math.sin(t) * pl.len * 0.5;
          g.lineStyle(4, 0x8a5426, alpha).lineBetween(x - dx, y - dy, x + dx, y + dy);
          g.lineStyle(1, 0x4a2a10, alpha).lineBetween(x - dx, y - dy + 2, x + dx, y + dy + 2);
        }
      };
      draw(0);
      this.tweens.addCounter({ from: 0, to: 1, duration: 480 / speed, ease: 'Quad.easeOut', onUpdate: (tw) => draw(tw.getValue()), onComplete: () => g.destroy() });
      playSfxCapped(this, SFX.catapultImpact, 1, { volume: 0.7 });
      const jugKey = PROJECTILE_KEYS.catapult;
      if (!this.textures.exists(jugKey)) return;
      for (const j of d.jugs) {
        const e = gridToScreen(j.x, j.y);
        const jug = this.add.image(s.x, s.y - 12, jugKey).setDepth(2005);
        jug.setScale(12 / jug.frame.width);
        this.tweens.addCounter({
          from: 0, to: 1, duration: (d.delay * 1000) / speed,
          onUpdate: (tw) => { const k = tw.getValue(); jug.setPosition(s.x + (e.x - s.x) * k, s.y - 12 + (e.y - s.y + 12) * k - 46 * 4 * k * (1 - k)); jug.rotation += 0.25; },
          onComplete: () => jug.destroy()
        });
      }
    });
    on('enemyShattered', (d) => {
      const s = at(d);
      splashRing(this, s.x, s.y - 10, d.radius, 0xbfe9ff, { duration: 360, depth: 2710 });
      const g = this.add.graphics().setDepth(2712);
      const shards = [];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + Math.random() * 0.5, len = 5 + Math.random() * 4;
        shards.push({ a, len, spin: Math.random() * Math.PI });
      }
      const draw = (k) => { // k: 0 -> 1 as they fly out
        g.clear();
        const r = 6 + k * d.radius * 34, alpha = 1 - k;
        for (const sh of shards) {
          const x = s.x + Math.cos(sh.a) * r, y = s.y - 10 + Math.sin(sh.a) * r * 0.6, t = sh.spin + k * 4;
          const p1 = { x: x + Math.cos(t) * sh.len, y: y + Math.sin(t) * sh.len }, p2 = { x: x + Math.cos(t + 2.4) * sh.len * 0.6, y: y + Math.sin(t + 2.4) * sh.len * 0.6 },
            p3 = { x: x + Math.cos(t - 2.4) * sh.len * 0.6, y: y + Math.sin(t - 2.4) * sh.len * 0.6 };
          g.fillStyle(0xe8f8ff, alpha).fillTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
          g.lineStyle(1, 0x58c6ff, alpha).strokeTriangle(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        }
      };
      draw(0);
      this.tweens.addCounter({ from: 0, to: 1, duration: 420, ease: 'Quad.easeOut', onUpdate: (tw) => draw(tw.getValue()), onComplete: () => g.destroy() });
      if (!this.lastShatterTag || this.time.now - this.lastShatterTag > SHATTER_TAG_MS) {
        this.lastShatterTag = this.time.now;
        tag(s.x, s.y - 52, 'SHATTER!', '#bfe9ff', 16);
      }
      playSfxCapped(this, SPELL_SFX.freeze, 2, { volume: 0.4 });
    });
    on('flockEmp', (d) => {
      const s = at(d);
      splashRing(this, s.x, s.y, d.radius, 0x6fc8ff, { duration: 520, depth: 2710 });
      overBuilding(d.sourceId, 'EMP!', '#9fdcff');
    });
    // Gandolf the Grand: You Shall Not Pass! A staff slam (a thump and a small shake), his line over the tower, and the
    // wall(s) rising (WallFx draws them).
    on('wallRaised', (d) => {
      overBuilding(d.sourceId, 'YOU SHALL NOT PASS!', '#cfeaff');
      for (const w of d.walls) { const s = gridToScreen((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2); splashRing(this, s.x, s.y, 0.9, 0xbfe6ff, { duration: 380, depth: 2710 }); }
      playSfxCapped(this, SFX.catapultImpact, 1);
      playVoiceLine(this, SFX.wizardVoice);
      this.cameras.main.shake(110, 0.003);
    });
    // Harpoon Ballista: Reel In. The harpoon bites with a heavy thunk and "REELED IN!" over the enemy (a boss: "SLOWED");
    // HarpoonFx draws the chain from the tower while it's dragged.
    on('harpoonHit', (d) => {
      const s = at(d), v = this.views.enemies.get(d.targetId);
      const top = v && v.sprite ? v.sprite.y - v.sprite.displayHeight : s.y - 40;
      tag(s.x, top - 10, d.boss ? 'SLOWED' : 'REELED IN!', d.boss ? '#9fd8ff' : '#ffe2a0', 16);
      playSfxCapped(this, SFX.catapultImpact, 1, { volume: 0.6 });
    });
    // Missile Silo: the net rocket goes up with a launch sound; the net bursts open with a crackle over the group.
    on('netFired', () => playSfx(this, SFX.fireworkFire));
    on('netOpened', (d) => {
      const s = at(d);
      splashRing(this, s.x, s.y - 34, d.radius, 0xffd84a, { duration: 420, depth: 2710 });
      tag(s.x, s.y - 70, 'NET!', '#ffe066', 17);
      playSfxCapped(this, SFX.fireworkImpact, 2);
    });
    on('buildingsMerged', (d) => {
      const v = this.views.buildings.get(d.id);
      if (d.removedX !== undefined) { const g = gridToScreen(d.removedX, d.removedY); splashRing(this, g.x, g.y, 1.2, 0xffe9a0, { duration: 500, depth: 2710 }); sparklerFx(this, g.x, g.y - 20, 1, TEX.light); }
      if (v) {
        const b = this.gs.getBuilding(d.id), c = footprintCenter(b), g = gridToScreen(c.x, c.y), top = v.topCenter();
        v.flash(this.time.now);
        v.growPop(9, 10);
        splashRing(this, g.x, g.y, 1.6, 0xffc83a, { duration: 700, depth: 2710 });
        splashRing(this, g.x, g.y, 1.0, 0xffffff, { duration: 500, depth: 2710 });
        sparklerFx(this, g.x, top.y + 20, 1.2, TEX.light);
        sparklerFx(this, g.x, (top.y + g.y) / 2, 1.4, TEX.light);
        tag(top.x, top.y - 12, 'MERGED!', '#ffe066', 22);
        this.cameras.main.shake(140, 0.003);
      }
      // The merge sound alone (no upgrade / ability-unlocked sounds on top).
      playSfx(this, this.cache.audio.exists(SFX.merge) ? SFX.merge : SFX.upgrade);
      this.updateSelectionVisuals();
    });
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
    on('masteryResearched', () => playSfx(this, unlockSfx)); // a Mastery tier researched in the RV Lab: the same sound as a perk
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
    on('buildingMoved', () => this.updateSelectionVisuals());
    on('baseReset', () => this.select(null));
    on('waveTriggered', (d) => {
      // The countdown: "!" badges on the attacking paths' corner markers, the countdown sound, and the planning music.
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
      this.cancelMergePick();
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

  /** The wave's "!" warning on each attacking path: a badge on that path's wave marker, out in its corner. */
  showSpawnMarkers(paths) {
    this.waveMarkers.setAlerts(paths);
  }

  clearSpawnMarkers() {
    this.waveMarkers.setAlerts([]);
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
    this.queenView.sync(gs, this.time.now);
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
    const r = renderScale(); // (the HUD works in view pixels: renderScale.js)
    return { x: t.x / r, y: t.y / r, bottom: bottom.y / r, width: (v.sprite.displayWidth * this.cameras.main.zoom) / r };
  }

  spawnMarkerScreen() {
    const p = this.waveMarkers.alertWorld();
    return p ? toView(this.worldToScreen(p.x, p.y)) : null; // (in view pixels, for the HUD)
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
