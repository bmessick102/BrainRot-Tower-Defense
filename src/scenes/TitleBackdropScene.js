// The animated title / loading backdrop: a layered scene drawn behind the loading bar (BootScene), the login
// screen, the title menu and How to Play. It's its own scene, listed right after PreloadScene in main.js, so it
// draws under every screen that shows it and keeps running (no restart, no second logo drop) as they change.
// PreloadScene loads TITLE_ART_KEYS before anything else, so the whole picture is up while the game loads.
// It stops itself as soon as the game (GameScene) starts.
// While the game loads, the mortar sits loaded and idle (it used to fire every few seconds, which on a slow phone
// meant several shots before anything was ready). When loading finishes (BootScene emits LOADED_EVENT and sets the
// registry flag LOADED_FLAG), it fires its one shot and he stays hovering, arms out, at the top of his arc; the
// title menu keeps that picture.
//
// Layout follows unused-assets/public/assets/images/ui/ui_title_background.png (a layout reference only; never shown):
// logo top center; the wizard, archer and a worker gnome at the left with the mortar in front of them; the enemies grouped at
// the right facing left; the crocodile plane and the balloon up top, La Vaca Saturno hovering over the heroes left of
// the logo (as the mortar's man hovers over the enemies right of it); the bottom center kept clear for the bar
// and tips. Draw order (back to front) is DEPTH below. Design size 1280x720.
import Phaser from 'phaser';
import { isLowQuality, onQualityChange } from '../quality.js';

// ---------- art (texture keys; all loaded by PreloadScene) ----------
const ART = {
  bg: 'title_bg',                  // painted landscape with no characters
  logo: 'title_logo',
  wizard: 'title_wizard',          // Gandolf, staff raised
  archer: 'title_archer',          // aiming right
  gnome: 'villager_gnome',         // the in-game worker gnome (drawn facing right)
  mortarIdle: 'bld_mortar_lv4_r',  // the in-game Level 4 mortar (right-facing), loaded with the man in the barrel
  mortarFire: 'title_mortar_fire', // the same mortar firing
  flyer: 'title_flyer',            // the man shot out of the mortar
  flyerPose: 'title_flyer_pose',   // ...arms out, hovering at the top of his last arc once loading is done
  bomber: 'enemy_bomber',          // crocodile plane
  balloon: 'enemy_balloon',
  vaca: 'enemy_vaca'               // La Vaca Saturno (v0.6), flying over the heroes
};
/** Every texture the backdrop shows; PreloadScene loads these before the loading screen appears. */
export const TITLE_ART_KEYS = [
  ...Object.values(ART),
  'enemy_grunt', 'enemy_tank', 'enemy_shark', 'enemy_toilet', 'enemy_thief', 'enemy_breaker',
  'enemy_patapim', 'enemy_pork', 'enemy_skeleton' // v0.6: Brr Brr Patapim, John Pork, Rahhh Skeleton
];
// Effect textures drawn at runtime (no files).
const FX_DOT = 'title_fx_dot';           // soft white dot: embers, sparks, smoke, dust, glows
const FX_VIGNETTE = 'title_fx_vignette'; // dark edges

const W = 1280, H = 720;
/** Game event BootScene emits (and registry flag it sets) when all the game's assets have loaded. */
export const LOADED_EVENT = 'ibtd-assets-loaded';
export const LOADED_FLAG = 'assetsLoaded';

// ---------- draw order (back to front); the loading bar and tips draw above all of it ----------
const DEPTH = { bg: 0, flyers: 10, enemies: 20, heroes: 30, mortar: 40, flyer: 45, particles: 50, vignette: 55, logo: 60 };

// ---------- background ----------
const BG_DRIFT_PX = 10;            // slow sideways drift, each way
const BG_DRIFT_MS = 9000;          // one way (yoyo)
const BG_OVERSCAN = 1.04;          // scaled up past the screen so drift and camera shake never show an edge

// ---------- logo ----------
const LOGO_X = 640, LOGO_Y = 198;  // center: the top edge sits just under the plane's band (y 7-79)
const LOGO_WIDTH = 430;
const LOGO_DROP_FROM_Y = -220;
const LOGO_DROP_DELAY_MS = 250, LOGO_DROP_MS = 1300;
const LOGO_PULSE = 1.03, LOGO_PULSE_MS = 1500;

// ---------- heroes (left; x, y = feet, h = height on screen) ----------
const WIZARD = { x: 138, y: 568, h: 372 };
const ARCHER = { x: 332, y: 566, h: 300 };
// The worker gnome (his default picture), in the foreground at the mortar's side, as if he loads it.
const GNOME = { x: 62, y: 714, h: 235 };
// The wizard's staff orb, as a share of his picture (0..1 from its left / top edge).
const WIZARD_ORB = { u: 0.315, v: 0.095 };
const ORB_GLOW_COLOR = 0xb45cff;
const ORB_GLOW_SIZE = 70;          // px
const ORB_PULSE_MS = 900;

// ---------- enemies (right, facing left; x, y = feet, h = height on screen) ----------
// One big overlapping group in the foreground, all standing on the ground line near the bottom, kept right of
// the title menu's Start Game button (x < 820 above y 540). Each has its own layer (`depth`, 0..1, lower = further
// back; without one, taller = further back) so everyone stays visible. flip: the picture faces right, so it's mirrored
// to face the heroes. v0.6 added Brr Brr Patapim, Rahhh Skeleton and John Pork and moved the rest to make room;
// v0.6.1 took the gold Neegy out.
const ENEMIES = [
  { key: 'enemy_patapim', x: 985, y: 606, h: 330, flip: true, depth: 0.1 },  // Brr Brr Patapim (v0.6): the tree giant, at the very back
  { key: 'enemy_tank', x: 1150, y: 630, h: 300, flip: true, depth: 0.2 },    // Tripi Tropi, the fish giant, back right (v0.8: 380 -> 300)
  { key: 'enemy_grunt', x: 1238, y: 664, h: 300, flip: true, depth: 0.45 },  // Tung Tung Sahur, at the right edge
  { key: 'enemy_skeleton', x: 902, y: 650, h: 255, flip: true, depth: 0.5 }, // Rahhh Skeleton (v0.6), left, shield up
  { key: 'enemy_pork', x: 1072, y: 690, h: 262, flip: false, depth: 0.62 },  // John Pork (v0.6, faces front), middle
  { key: 'enemy_thief', x: 1178, y: 700, h: 268, flip: true, depth: 0.66 },  // Mr. Least
  { key: 'enemy_shark', x: 1130, y: 716, h: 200, flip: false, depth: 0.8 },  // Tralalero Tralala (art faces left), front
  { key: 'enemy_toilet', x: 990, y: 718, h: 190, flip: false, depth: 0.85 }, // Skibidi Toilet (faces front), front
  { key: 'enemy_breaker', x: 862, y: 718, h: 180, flip: true, depth: 0.9 }   // Frog Tire (the Wall Breaker), front left
];

// ---------- idle breathing (every hero and enemy) ----------
const BREATHE_SCALE = 1.03;        // scaleY peak
const BREATHE_MS = [1000, 1600];   // one way, picked per character
const BREATHE_DELAY_MS = [0, 1200];

// ---------- flyers ----------
const BALLOON = { x: 1222, y: 96, h: 140, bobPx: 9, bobMs: 2300, swayDeg: 2.5 };
const PLANE = {
  y: 40, h: 66,                    // a band along the very top (the mortar's man always stays below it)
  fromX: -180, toX: W + 180,       // crosses the whole screen, left to right
  crossMs: 6500,
  everyMs: [8000, 12000],          // a new pass starts this long after the last one started
  firstMs: 1800,
  tiltDeg: -5,                     // nose slightly up
  bobPx: 6
};

// La Vaca Saturno (v0.6): flies in from the left once the logo has dropped and hovers in the open sky between the
// castle tower and the logo, above the archer's bow: the enemy side's flyer over the heroes, mirroring the mortar's man
// over the enemies (about his size). x, y: her center.
const VACA = { x: 302, y: 154, h: 138, fromX: -170, inDelayMs: LOGO_DROP_DELAY_MS + 700, inMs: 1900, bobPx: 8, bobMs: 1900, swayDeg: 4 };

// ---------- mortar (bottom left, in front of the heroes) ----------
// x, y: the bottom tip of its stone base. The firing picture is drawn so its base sits exactly on the idle one.
const MORTAR = { x: 150, y: 714, idleScale: 0.68 };
const MORTAR_IDLE_ORIGIN = { x: 0.486, y: 1 };
const MORTAR_FIRE_ORIGIN = { x: 0.456, y: 1 };
const MORTAR_FIRE_SCALE_RATIO = 1.2308;          // firing picture scale / idle picture scale (same-size base)
const MUZZLE_OFFSET = { x: 100, y: -329 };      // barrel opening, idle-picture px from the base tip
const BARREL_ANGLE_DEG = -40;                    // up-right (Phaser angles: 0 = right, negative = up)
const RECOIL = { squashX: 1.06, squashY: 0.9, dropPx: 6, hitMs: 70, springMs: 420 };
const SHAKE = { ms: 110, intensity: 0.0022 };
// The man shot out of the barrel never spins (his picture has its smoke trail painted on): he only tilts a little
// to follow his arc. FLIGHT.h: his on-screen height in flight.
const FLIGHT = { h: 130 };
const FLYER_ART_ANGLE_DEG = -40;   // the direction he's drawn flying in
const FLYER_TILT_FOLLOW = 0.2;     // share of the arc's turn he follows...
const FLYER_TILT_MAX_DEG = 14;     // ...up to this much tilt
// Loading done: one last, longer shot (about 38 degrees up, passing behind the logo), and he stays at the top of
// its arc, arms out, hovering forward of the mortar in the sky right of the logo: below the plane's band, clear
// of the logo and the Start Game button, just over the fish giant's head. The mortar keeps smoking.
const HOVER = { x: 1058, y: 202, riseMs: 1500, bobPx: 7, bobMs: 1500, swayDeg: 3 };
// The arms-out pose is drawn at the in-flight picture's body size (matched by head width, since the two pictures
// have different padding and trails), times HOVER_POP_SCALE so the swap reads as a pop, not a shrink.
const HEAD_PX = { flyer: 62, pose: 53.5 }; // head width in title_flyer.png / title_flyer_pose.png (exported px)
const HOVER_POP_SCALE = 1.08;
const LAST_SHOT_DELAY_MS = 350;    // after the mortar reloads (or right away if it's idle)
const WISPS = { everyMs: 260, lifeMs: 1700 }; // smoke curling from the barrel afterwards

// ---------- ambient particles ----------
const EMBERS = { everyMs: 320, lifeMs: [7000, 11000], riseSpeed: [14, 34], colors: [0xffb347, 0xffd27a, 0xfff1b0, 0xd9a0ff] };

// ---------- vignette ----------
const VIGNETTE_ALPHA = 0.55;       // darkest, at the corners
const VIGNETTE_INNER = 0.45;       // share of the half-diagonal left clear

const between = ([a, b]) => Phaser.Math.Between(a, b);

/**
 * A thrown arc from (x0, y0) to (x1, y1) that leaves at slope `rise` (tan of the launch angle, up = positive):
 * x moves evenly, y follows the parabola. Returns position at t = 0..1.
 */
function ballistic(x0, y0, x1, y1, rise) {
  const DX = x1 - x0;
  const c = (y1 - y0 + rise * DX) / (DX * DX);
  return (t) => { const dx = DX * t; return { x: x0 + dx, y: y0 - rise * dx + c * dx * dx }; };
}

/** Make sure the backdrop is running under the calling scene (title, login, How to Play). */
export function showTitleBackdrop(scene) {
  if (!scene.scene.isActive('TitleBackdropScene')) scene.scene.launch('TitleBackdropScene');
}

export class TitleBackdropScene extends Phaser.Scene {
  constructor() {
    super('TitleBackdropScene');
  }

  create() {
    this.makeFxTextures();
    this.buildBackground();
    this.buildFlyers();
    this.buildEnemies();
    this.buildHeroes();
    this.buildMortar();
    this.buildEmbers();
    this.buildVignette();
    this.buildLogo();
    // Low graphics quality (quality.js): the always-on ambient effects (rising embers, orb sparkles) stop.
    this.applyQuality(isLowQuality());
    const offQuality = onQualityChange((low) => this.applyQuality(low));
    this.events.once('shutdown', offQuality);
    // Loading finished (now, or before this scene started): the last shot, then the hover.
    this.done = false;
    if (this.registry.get(LOADED_FLAG)) this.onLoaded(true);
    else {
      this.game.events.on(LOADED_EVENT, this.onLoaded, this);
      this.events.once('shutdown', () => this.game.events.off(LOADED_EVENT, this.onLoaded, this));
    }
  }

  update() {
    // The game started: nothing here is visible any more.
    if (this.scene.isActive('GameScene')) { this.scene.stop(); return; }
    // Keep the staff glow on the orb while the wizard breathes.
    if (this.orbGlow) {
      const w = this.wizard;
      const x = w.x + (WIZARD_ORB.u - 0.5) * w.displayWidth;
      const y = w.y - (1 - WIZARD_ORB.v) * w.displayHeight;
      this.orbGlow.setPosition(x, y);
      this.orbSparks.setPosition(x, y);
    }
  }

  has(key) { return this.textures.exists(key); }

  /** Low quality: no ambient embers or orb sparkles (the scene itself, shots and all, stays the same). */
  applyQuality(low) {
    for (const em of [this.embers, this.orbSparks]) {
      if (!em) continue;
      if (low) em.stop(); else em.start();
      em.setVisible(!low);
    }
  }

  /** A picture standing on its feet at (x, y), scaled to h px tall. */
  figure(key, x, y, h, depth) {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth);
    img.setScale(h / img.frame.height);
    return img;
  }

  makeFxTextures() {
    if (!this.has(FX_DOT)) {
      const t = this.textures.createCanvas(FX_DOT, 64, 64);
      const ctx = t.getContext();
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      t.refresh();
    }
    if (!this.has(FX_VIGNETTE)) {
      // A little bigger than the screen so a camera shake never shows its edge.
      const vw = W + 40, vh = H + 40;
      const t = this.textures.createCanvas(FX_VIGNETTE, vw, vh);
      const ctx = t.getContext();
      const r = Math.hypot(vw, vh) / 2;
      const g = ctx.createRadialGradient(vw / 2, vh / 2, r * VIGNETTE_INNER, vw / 2, vh / 2, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.6, `rgba(0,0,0,${VIGNETTE_ALPHA * 0.45})`);
      g.addColorStop(1, `rgba(0,0,0,${VIGNETTE_ALPHA})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
      t.refresh();
    }
  }

  buildBackground() {
    if (!this.has(ART.bg)) {
      this.add.rectangle(0, 0, W, H, 0x5d8fd0).setOrigin(0).setDepth(DEPTH.bg);
      return;
    }
    const bg = this.add.image(W / 2 - BG_DRIFT_PX, H / 2, ART.bg).setDepth(DEPTH.bg);
    bg.setScale(Math.max(W / bg.frame.width, H / bg.frame.height) * BG_OVERSCAN);
    this.tweens.add({ targets: bg, x: W / 2 + BG_DRIFT_PX, duration: BG_DRIFT_MS, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
  }

  buildFlyers() {
    if (this.has(ART.balloon)) {
      const b = this.add.image(BALLOON.x, BALLOON.y, ART.balloon).setDepth(DEPTH.flyers + 1).setAngle(-BALLOON.swayDeg);
      b.setScale(BALLOON.h / b.frame.height);
      this.tweens.add({ targets: b, y: BALLOON.y + BALLOON.bobPx, duration: BALLOON.bobMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
      this.tweens.add({ targets: b, angle: BALLOON.swayDeg, duration: BALLOON.bobMs * 1.7, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    }
    if (this.has(ART.vaca)) {
      const v = this.add.image(VACA.fromX, VACA.y, ART.vaca).setDepth(DEPTH.flyers + 1).setAngle(-VACA.swayDeg);
      v.setScale(VACA.h / v.frame.height);
      this.tweens.add({
        targets: v, x: VACA.x, delay: VACA.inDelayMs, duration: VACA.inMs, ease: 'Sine.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: v, y: VACA.y + VACA.bobPx, duration: VACA.bobMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
          this.tweens.add({ targets: v, angle: VACA.swayDeg, duration: VACA.bobMs * 1.6, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
        }
      });
    }
    if (this.has(ART.bomber)) {
      // The plane art faces left: mirrored, it flies left to right.
      // Behind the balloon (lower depth) as it flies past it.
      const p = this.add.image(PLANE.fromX, PLANE.y, ART.bomber).setDepth(DEPTH.flyers).setFlipX(true).setAngle(PLANE.tiltDeg);
      p.setScale(PLANE.h / p.frame.height);
      const pass = () => {
        p.setPosition(PLANE.fromX, PLANE.y);
        this.tweens.add({ targets: p, x: PLANE.toX, duration: PLANE.crossMs, ease: 'Linear' });
        this.tweens.add({ targets: p, y: PLANE.y + PLANE.bobPx, duration: PLANE.crossMs / 4, ease: 'Sine.easeInOut', yoyo: true, repeat: 1 });
        this.time.delayedCall(between(PLANE.everyMs), pass);
      };
      this.time.delayedCall(PLANE.firstMs, pass);
    }
  }

  /** Slow scaleY yoyo from the feet, each character on its own timing. */
  breathe(img) {
    const base = img.scaleY;
    this.tweens.add({
      targets: img, scaleY: base * BREATHE_SCALE, duration: between(BREATHE_MS), delay: between(BREATHE_DELAY_MS),
      ease: 'Sine.easeInOut', yoyo: true, repeat: -1
    });
  }

  buildEnemies() {
    for (const e of ENEMIES) {
      if (!this.has(e.key)) continue;
      // Taller = further back, so the shorter ones in front never hide behind them (all within the enemies layer);
      // `depth` (0..1, lower = further back) overrides that.
      const img = this.figure(e.key, e.x, e.y, e.h, DEPTH.enemies + (e.depth ?? 1 - e.h / 1000)).setFlipX(e.flip);
      this.breathe(img);
    }
  }

  buildHeroes() {
    if (this.has(ART.wizard)) {
      this.wizard = this.figure(ART.wizard, WIZARD.x, WIZARD.y, WIZARD.h, DEPTH.heroes);
      this.breathe(this.wizard);
      // Pulsing purple glow on his staff orb, with a few sparkles.
      this.orbGlow = this.add.image(0, 0, FX_DOT).setDepth(DEPTH.heroes + 0.5).setBlendMode(Phaser.BlendModes.ADD)
        .setTint(ORB_GLOW_COLOR).setDisplaySize(ORB_GLOW_SIZE, ORB_GLOW_SIZE).setAlpha(0.55);
      const s = this.orbGlow.scale;
      this.tweens.add({ targets: this.orbGlow, scale: s * 1.45, alpha: 0.95, duration: ORB_PULSE_MS, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
      this.orbSparks = this.add.particles(0, 0, FX_DOT, {
        frequency: 160, lifespan: 700, speed: { min: 10, max: 38 }, angle: { min: 0, max: 360 },
        scale: { start: 0.18, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0xd9a0ff, 0xffffff, 0xb45cff],
        blendMode: 'ADD'
      }).setDepth(DEPTH.heroes + 0.6);
      this.update();
    }
    if (this.has(ART.archer)) this.breathe(this.figure(ART.archer, ARCHER.x, ARCHER.y, ARCHER.h, DEPTH.heroes + 1));
    // The gnome stands in the foreground beside the mortar, so he's drawn just in front of it.
    if (this.has(ART.gnome)) this.breathe(this.figure(ART.gnome, GNOME.x, GNOME.y, GNOME.h, DEPTH.mortar + 1));
  }

  // ---------- mortar firing loop ----------
  buildMortar() {
    if (!this.has(ART.mortarIdle)) return;
    // One container at the base tip: scaling it squashes the mortar from the ground up.
    this.mortar = this.add.container(MORTAR.x, MORTAR.y).setDepth(DEPTH.mortar);
    this.mortarIdle = this.add.image(0, 0, ART.mortarIdle).setOrigin(MORTAR_IDLE_ORIGIN.x, MORTAR_IDLE_ORIGIN.y).setScale(MORTAR.idleScale);
    this.mortar.add(this.mortarIdle);
    if (this.has(ART.mortarFire)) {
      this.mortarFire = this.add.image(0, 0, ART.mortarFire).setOrigin(MORTAR_FIRE_ORIGIN.x, MORTAR_FIRE_ORIGIN.y)
        .setScale(MORTAR.idleScale * MORTAR_FIRE_SCALE_RATIO).setVisible(false);
      this.mortar.add(this.mortarFire);
    }
    this.muzzle = { x: MORTAR.x + MUZZLE_OFFSET.x * MORTAR.idleScale, y: MORTAR.y + MUZZLE_OFFSET.y * MORTAR.idleScale };

    const P = DEPTH.particles;
    this.flash = this.add.image(this.muzzle.x, this.muzzle.y, FX_DOT).setDepth(P).setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffd27a).setAlpha(0);
    const along = (spread) => ({ min: BARREL_ANGLE_DEG - spread, max: BARREL_ANGLE_DEG + spread });
    this.smoke = this.add.particles(0, 0, FX_DOT, {
      emitting: false, lifespan: { min: 700, max: 1100 }, speed: { min: 50, max: 170 }, angle: along(20),
      scale: { start: 0.55, end: 1.7 }, alpha: { start: 0.55, end: 0 }, tint: [0xd8d4cc, 0xb8b2a8, 0xeeeae2],
      gravityY: -30
    }).setDepth(P);
    this.sparks = this.add.particles(0, 0, FX_DOT, {
      emitting: false, lifespan: { min: 300, max: 600 }, speed: { min: 160, max: 360 }, angle: along(26),
      scale: { start: 0.22, end: 0 }, alpha: { start: 1, end: 0.2 }, tint: [0xffd27a, 0xff9a3c, 0xfff1b0],
      gravityY: 380, blendMode: 'ADD'
    }).setDepth(P + 0.1);

    if (this.has(ART.flyer)) {
      this.flyer = this.add.image(0, 0, ART.flyer).setDepth(DEPTH.flyer).setVisible(false);
      this.flyerScale = FLIGHT.h / this.flyer.frame.height;
      this.trail = this.add.particles(0, 0, FX_DOT, {
        emitting: false, frequency: 28, lifespan: 520, speed: { min: 0, max: 18 },
        scale: { start: 0.35, end: 0.9 }, alpha: { start: 0.45, end: 0 }, tint: [0xd8d4cc, 0xc4beb4]
      }).setDepth(DEPTH.flyer - 0.1);
    }
    this.wisps = this.add.particles(0, 0, FX_DOT, {
      emitting: false, frequency: WISPS.everyMs, lifespan: WISPS.lifeMs, speed: { min: 12, max: 34 },
      angle: { min: BARREL_ANGLE_DEG - 30, max: BARREL_ANGLE_DEG + 5 }, scale: { start: 0.3, end: 1.3 },
      alpha: { start: 0.35, end: 0 }, tint: [0xd8d4cc, 0xeeeae2], gravityY: -18
    }).setDepth(DEPTH.particles - 0.5);
    // v0.6: no shots while the game loads (on a slow phone that meant several shots before anything was ready):
    // the mortar sits loaded and idle until loading is done, then fires its one shot (onLoaded).
  }

  /** Loading finished: stop the firing loop and fire the last shot (instant: already done when we started). */
  onLoaded(instant = false) {
    if (this.done) return;
    this.done = true;
    if (!this.mortar) return;
    if (instant === true) { this.showHover(true); return; }
    this.time.delayedCall(LAST_SHOT_DELAY_MS, () => this.fire());
  }

  /** Its one shot (loading is done): flash, smoke, recoil, and the man flies up to hover over the scene. */
  fire() {
    const { x, y } = this.muzzle;
    if (this.mortarFire) { this.mortarIdle.setVisible(false); this.mortarFire.setVisible(true); }
    // Muzzle flash, smoke and sparks along the barrel.
    this.flash.setPosition(x, y).setScale(0.4).setAlpha(1);
    this.tweens.add({ targets: this.flash, scale: 2.4, alpha: 0, duration: 200, ease: 'Quad.easeOut' });
    this.smoke.explode(14, x, y);
    this.sparks.explode(18, x, y);
    // Recoil: squash and a small bump down, then spring back.
    this.tweens.killTweensOf(this.mortar);
    this.mortar.setScale(1).setY(MORTAR.y);
    this.tweens.chain({
      targets: this.mortar,
      tweens: [
        { scaleX: RECOIL.squashX, scaleY: RECOIL.squashY, y: MORTAR.y + RECOIL.dropPx, duration: RECOIL.hitMs, ease: 'Quad.easeOut' },
        { scaleX: 1, scaleY: 1, y: MORTAR.y, duration: RECOIL.springMs, ease: 'Back.easeOut' }
      ]
    });
    this.cameras.main.shake(SHAKE.ms, SHAKE.intensity);
    this.flyToHover(x, y);
  }

  /** Tilt that follows the arc a little (heading in radians); no spin. */
  flyerTilt(heading) {
    const max = Phaser.Math.DegToRad(FLYER_TILT_MAX_DEG);
    return Phaser.Math.Clamp((heading - Phaser.Math.DegToRad(FLYER_ART_ANGLE_DEG)) * FLYER_TILT_FOLLOW, -max, max);
  }

  /** The last shot: he flies forward along the barrel to the top of his arc, turns to the arms-out pose and hovers there. */
  flyToHover(x0, y0) {
    if (!this.flyer) { this.showHover(false); return; }
    const f = this.flyer;
    // An arc whose top is HOVER: it leaves at 2 x rise / run up (about 38 degrees here).
    const pos = ballistic(x0, y0, HOVER.x, HOVER.y, (2 * (y0 - HOVER.y)) / (HOVER.x - x0));
    f.setVisible(true).setAlpha(1).setScale(this.flyerScale * 0.6).setPosition(x0, y0).setRotation(0);
    this.trail.startFollow(f);
    this.trail.start();
    const k = { t: 0 };
    this.tweens.add({
      targets: k, t: 1, duration: HOVER.riseMs, ease: 'Linear',
      onUpdate: () => {
        const p = pos(k.t), q = pos(Math.min(1, k.t + 0.01));
        const heading = k.t < 0.99 ? Math.atan2(q.y - p.y, q.x - p.x) : 0;
        f.setPosition(p.x, p.y).setRotation(this.flyerTilt(heading)).setScale(this.flyerScale * Math.min(1, 0.6 + k.t * 1.6));
      },
      onComplete: () => { this.trail.stop(); this.trail.stopFollow(); this.showHover(false); }
    });
  }

  /** Hovering at the top of the arc, arms out, with a gentle bob; the mortar shows it has fired and smokes. */
  showHover(instant) {
    if (this.mortarFire) { this.mortarIdle.setVisible(false); this.mortarFire.setVisible(true); }
    this.wisps.setPosition(this.muzzle.x, this.muzzle.y).start();
    const key = this.has(ART.flyerPose) ? ART.flyerPose : ART.flyer;
    if (!this.has(key)) return;
    if (this.flyer) this.flyer.setVisible(false);
    const g = this.add.image(HOVER.x, HOVER.y, key).setDepth(DEPTH.flyer).setAngle(-HOVER.swayDeg);
    const flightScale = this.flyer ? this.flyerScale : FLIGHT.h / g.frame.height;
    const s = flightScale * (key === ART.flyerPose && this.flyer ? HEAD_PX.flyer / HEAD_PX.pose : 1) * HOVER_POP_SCALE;
    if (instant) g.setScale(s).setAlpha(0);
    else g.setScale(s * 0.85);
    this.tweens.add({ targets: g, scale: s, alpha: 1, duration: instant ? 600 : 260, ease: instant ? 'Sine.easeOut' : 'Back.easeOut' });
    this.tweens.add({ targets: g, y: HOVER.y - HOVER.bobPx, duration: HOVER.bobMs, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    this.tweens.add({ targets: g, angle: HOVER.swayDeg, duration: HOVER.bobMs * 1.6, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    this.hoverGuy = g;
  }

  buildEmbers() {
    this.embers = this.add.particles(0, 0, FX_DOT, {
      x: { min: 0, max: W }, y: { min: H - 20, max: H + 10 },
      frequency: EMBERS.everyMs, quantity: 1, lifespan: { min: EMBERS.lifeMs[0], max: EMBERS.lifeMs[1] },
      speedY: { min: -EMBERS.riseSpeed[1], max: -EMBERS.riseSpeed[0] }, speedX: { min: -10, max: 10 },
      scale: { start: 0.2, end: 0.05 }, alpha: { start: 0.85, end: 0 }, tint: EMBERS.colors,
      blendMode: 'ADD', advance: 6000
    }).setDepth(DEPTH.particles);
  }

  buildVignette() {
    this.add.image(W / 2, H / 2, FX_VIGNETTE).setDepth(DEPTH.vignette);
  }

  buildLogo() {
    if (!this.has(ART.logo)) return;
    const logo = this.add.image(LOGO_X, LOGO_DROP_FROM_Y, ART.logo).setDepth(DEPTH.logo);
    const s = LOGO_WIDTH / logo.frame.width;
    logo.setScale(s);
    this.tweens.add({
      targets: logo, y: LOGO_Y, delay: LOGO_DROP_DELAY_MS, duration: LOGO_DROP_MS, ease: 'Bounce.easeOut',
      onComplete: () => this.tweens.add({ targets: logo, scale: s * LOGO_PULSE, duration: LOGO_PULSE_MS, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 })
    });
  }
}
