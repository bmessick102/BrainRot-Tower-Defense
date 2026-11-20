// Draws the Brisket King (src/logic/hero.js): his pose (standing, attacking, sleeping, waking up) with a little
// bounce while he walks and a hop over walls, a health bar
// with his level, a pulsing gold ring under his feet while Brisket Feast is ready (its hotbar slot), a
// "z Z" drifting up while he sleeps, and while he naps a blue sleep bar over him (filling as he heals) with the
// time left above it. While he's asleep (a nap or knocked out) his snoring loops softly (SnoreLoop).
import { gridToScreen } from '../logic/iso.js';
import { fpW, fpH } from '../logic/grid.js';
import { heroStats, checkFeast, getAltar } from '../logic/hero.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { spriteHit } from './BuildingView.js';
import { groundDepth } from './depth.js';
import { floatText } from './Effects.js';
import { textStyle } from '../theme.js';
import { SFX, TEX } from '../assetKeys.js';
import { darkness } from './DayNight.js';
import { sfxVolume } from '../audio.js';

const KEYS = {
  stand: 'hero_brisket', attack: 'hero_brisket_attack', attack2: 'hero_brisket_attack2',
  sleep: 'hero_brisket_sleep', wake: 'hero_brisket_wake', defeated: 'hero_brisket_defeated', select: 'hero_brisket_select'
};
const HEIGHT = { stand: 72, attack: 66, attack2: 68, sleep: 70, wake: 72, defeated: 60, select: 76 }; // on-screen height of each pose
// Which way each picture faces (it's flipped to face where he's going / the enemy he's hitting). Sleeping,
// waking and defeated are never flipped.
const FACES_RIGHT = { stand: false, attack: true, attack2: true };
const NO_FLIP = new Set(['sleep', 'wake', 'defeated', 'select']);
const READY_ICON_W = 30;        // the Brisket Feast crown over him while it's ready
const TALLEST = Math.max(HEIGHT.stand, HEIGHT.attack, HEIGHT.attack2, HEIGHT.wake); // his bar sits above this
const ATTACK_POSE_MS = 340;     // the attack picture shows this long after each swing
const ZZZ_EVERY_MS = 1400;
const HOP_HEIGHT = 16;          // px he rises while hopping a wall
const STEP_BOUNCE = 3;          // px of bounce in his walk
const SELECT_POSE_MS = 1600;    // his select pose (clicked) shows this long
const RAGE_TINT = 0xff6a5a;     // red shade while Brisket Feast is active
const NIGHT_GLOW_ALPHA = 0.75;  // his warm glow once it's dark (like the enemies')
const NIGHT_GLOW_COLOR = 0xffb36b;
const SLEEP_COLOR = 0x6fa8ff;   // his bar while he naps (it fills as he heals)
// Snoring: a soft loop while he's asleep, quieter when he's off screen, faded in and out.
const SNORE_VOLUME = 0.45;
const SNORE_OFFSCREEN = 0.3;    // share of the volume when he's far off screen
const SNORE_FAR_PX = 500;       // world px outside the view where he counts as far
const SNORE_EASE_S = 0.6;       // fade time constant

/** His snoring loop (like AirHum): starts when he falls asleep, eases its volume, stops once he's awake. */
class SnoreLoop {
  constructor(scene) {
    this.scene = scene;
    this.sound = null;
    this.volume = 0;
    this.onPause = () => { if (this.sound && this.sound.isPlaying) this.sound.pause(); };
    this.onResume = () => { if (this.sound && this.sound.isPaused) this.sound.resume(); };
    scene.events.on('pause', this.onPause);
    scene.events.on('resume', this.onResume);
    scene.events.once('shutdown', () => this.destroy()); // leaving the game stops it
  }

  /** `asleep`: snore; `p`: his screen point (for the off-screen fade); `dt` in seconds. */
  update(asleep, p, dt) {
    let target = 0;
    if (asleep && p) {
      const v = this.scene.cameras.main.worldView;
      const dx = Math.max(v.x - p.x, 0, p.x - v.right), dy = Math.max(v.y - p.y, 0, p.y - v.bottom);
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / SNORE_FAR_PX);
      target = SNORE_VOLUME * (SNORE_OFFSCREEN + (1 - SNORE_OFFSCREEN) * near);
    }
    this.volume += (target - this.volume) * (1 - Math.exp(-dt / SNORE_EASE_S));
    if (target === 0 && this.volume < 0.005) this.volume = 0;
    if (this.volume > 0 && !this.sound) this.start();
    if (this.volume === 0 && this.sound) this.stop();
    if (this.sound) this.sound.setVolume(sfxVolume(this.volume));
  }

  start() {
    if (!this.scene.cache.audio.exists(SFX.heroSnore)) { this.volume = 0; return; }
    this.sound = this.scene.sound.add(SFX.heroSnore, { loop: true, volume: 0 });
    this.sound.play();
  }

  stop() {
    if (!this.sound) return;
    this.sound.stop();
    this.sound.destroy();
    this.sound = null;
  }

  destroy() {
    this.stop();
    this.scene.events.off('pause', this.onPause);
    this.scene.events.off('resume', this.onResume);
  }
}

export class HeroView {
  constructor(scene) {
    this.scene = scene;
    this.sprite = scene.add.image(0, 0, KEYS.stand).setOrigin(0.5, 1);
    this.ring = scene.add.graphics();
    this.hpBar = new HealthBar(scene, { width: 50, height: 12, depth: 5001, color: HP_TEAM.player, badge: true, badgeStyle: 'crown' }); // his level on a dark purple crown
    this.timer = scene.add.text(0, 0, '', textStyle(13, '#d9e4ff')).setOrigin(0.5, 1).setDepth(5001).setVisible(false);
    this.pose = null;
    this.attackUntil = 0;
    this.facingRight = false;
    this.lastX = null;
    this.zzzAt = 0;
    this.hop = 0;
    this.swing = 0; // swings alternate between his two attack pictures
    this.readyIcon = scene.textures.exists(TEX.feastReady)
      ? scene.add.image(0, 0, TEX.feastReady).setOrigin(0.5, 1).setDepth(5002).setVisible(false) : null;
    if (this.readyIcon) this.readyIcon.setScale(READY_ICON_W / this.readyIcon.frame.width);
    this.selectUntil = 0;
    this.glow = scene.add.image(0, 0, TEX.light).setBlendMode('SCREEN').setTint(NIGHT_GLOW_COLOR).setVisible(false);
    this.stars = scene.add.graphics().setDepth(5002);
    // Anger puffs while Brisket Feast is active.
    this.anger = scene.add.particles(0, 0, TEX.light, {
      lifespan: 650, frequency: 70, speedY: { min: -90, max: -40 }, speedX: { min: -35, max: 35 },
      scale: { start: 0.22, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: [0xff3b2a, 0xff7a3a], blendMode: 'ADD', emitting: false
    }).setDepth(5002);
    this.snore = new SnoreLoop(scene);
    this.lastSync = null;
  }

  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    const key = this.scene.textures.exists(KEYS[pose]) ? KEYS[pose] : KEYS.stand;
    this.sprite.setTexture(key);
    this.sprite.setScale(HEIGHT[pose] / this.sprite.frame.height);
  }

  /** A swing: show an attack picture for a moment (the two alternate, one per swing). */
  attackPose(time) {
    this.attackUntil = time + ATTACK_POSE_MS;
    this.swing = 1 - this.swing;
  }

  /** He was clicked: show his select pose for a moment. */
  selectPose(time) {
    this.selectUntil = time + SELECT_POSE_MS;
  }

  sync(gs, time) {
    const h = gs.hero;
    const dt = this.lastSync === null ? 0 : Math.min(0.1, Math.max(0, (time - this.lastSync) / 1000));
    this.lastSync = time;
    // Snoring while he's asleep (also in edit mode, where he isn't drawn).
    this.snore.update(!!h && h.status === 'asleep', h ? gridToScreen(h.x, h.y) : null, dt);
    const show = !!h && !this.scene.editMode;
    this.sprite.setVisible(show);
    this.ring.setVisible(show);
    if (!show) { this.hpBar.draw(0, 0, 1, false); this.timer.setVisible(false); this.glow.setVisible(false); this.stars.clear(); this.anger.emitting = false; if (this.readyIcon) this.readyIcon.setVisible(false); return; }
    const altar = getAltar(gs);
    const st = heroStats(altar);
    const s = gridToScreen(h.x, h.y);
    const pose = h.status === 'down' ? 'defeated' : h.status === 'asleep' ? (h.knockedOut ? 'defeated' : 'sleep') : h.status === 'waking' ? 'wake'
      : time < this.attackUntil ? (this.swing ? 'attack2' : 'attack') : time < this.selectUntil && !h.moving ? 'select' : 'stand';
    this.setPose(pose);
    // Face where he's going (or the enemy he's hitting); each picture flips according to the way it faces.
    const target = h.targetId ? gs.enemies.find((e) => e.id === h.targetId) : null;
    if (target && h.attacking) this.facingRight = gridToScreen(target.x, target.y).x > s.x;
    else if (this.lastX !== null && Math.abs(s.x - this.lastX) > 0.05) this.facingRight = s.x > this.lastX;
    this.lastX = s.x;
    this.sprite.setFlipX(!NO_FLIP.has(pose) && this.facingRight !== !!FACES_RIGHT[pose]);
    // Breathing while asleep; a bounce in his step while walking; a hop over walls (eased).
    const bob = pose === 'sleep' || pose === 'defeated' ? Math.sin(time * 0.002) * 1.5 : h.moving ? -Math.abs(Math.sin(time * 0.012)) * STEP_BOUNCE : 0;
    this.hop += ((h.overWall ? HOP_HEIGHT : 0) - this.hop) * 0.3;
    this.sprite.setPosition(s.x, s.y + bob - this.hop);
    // Standing on his altar (a flat tile), he draws on top of it; elsewhere like any ground troop.
    const onAltar = altar && h.x >= altar.col && h.x < altar.col + fpW(altar) && h.y >= altar.row && h.y < altar.row + fpH(altar);
    const depth = onAltar ? altar.col + altar.row + 2 * fpW(altar) + 0.1 : groundDepth(gs.buildings, h.x, h.y);
    this.sprite.setDepth(depth);
    const tint = this.scene.ambientTint ?? 0xffffff;
    const raging = h.boostT > 0;
    this.sprite.setTint(raging ? mulTint(tint, RAGE_TINT) : tint); // Brisket Feast: red shade
    this.anger.setPosition(s.x, this.sprite.y - this.sprite.displayHeight * 0.8);
    this.anger.emitting = raging;
    // Night: a soft warm light around him, like the other troops.
    const dark = darkness(this.scene.night || 0);
    this.glow.setVisible(dark > 0.01);
    if (dark > 0.01) {
      const w = Math.max(64, this.sprite.displayWidth * 1.6);
      this.glow.setPosition(s.x, this.sprite.y - this.sprite.displayHeight * 0.4).setDisplaySize(w, w * 0.8)
        .setAlpha(dark * NIGHT_GLOW_ALPHA).setDepth(depth - 0.3);
    }
    // Knocked out: stars circle over his head until he gets up.
    this.stars.clear();
    if (h.status === 'down') {
      const cy = this.sprite.y - this.sprite.displayHeight - 4;
      for (let i = 0; i < 3; i++) {
        const a = time * 0.004 + (i * Math.PI * 2) / 3;
        drawStar(this.stars, s.x + Math.cos(a) * 18, cy + Math.sin(a) * 5, 5 + (Math.sin(a) > 0 ? 1.5 : 0));
      }
    }
    // Brisket Feast ready: a pulsing gold ring at his feet.
    this.ring.clear().setDepth(depth - 0.05);
    const feastReady = checkFeast(gs).ok;
    if (feastReady) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.008);
      this.ring.lineStyle(3, 0xffd34a, 0.55 + 0.4 * k).strokeEllipse(s.x, s.y, 46 + 6 * k, 20 + 3 * k);
      this.ring.fillStyle(0xffd34a, 0.12 + 0.1 * k).fillEllipse(s.x, s.y, 46 + 6 * k, 20 + 3 * k);
    }
    // His bar: green health while he's hurt and awake; blue while he naps, filling as he heals, with the
    // time left above it. Hidden when he's fine (his level is on the altar's own label).
    // It rides along with his picture (hops over walls, bounce in his step) and sits above his tallest pose, so
    // it never covers him and doesn't jump when he swings.
    const asleep = h.status === 'asleep';
    const down = h.status === 'down';
    const top = this.sprite.y - TALLEST;
    const barY = top - 13;
    this.hpBar.setColor(down ? HP_TEAM.enemy : asleep ? SLEEP_COLOR : HP_TEAM.player);
    this.hpBar.draw(s.x, barY, Math.max(0, h.hp) / st.maxHp, true, altar.level); // always shown (health, level, crown)
    if (asleep) {
      if (time >= this.zzzAt) { this.zzzAt = time + ZZZ_EVERY_MS; floatText(this.scene, s.x + 36, top + 10, 'z Z', '#d9e4ff', 15); }
      const left = Math.ceil(h.sleepT);
      this.timer.setText(`Zz ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`).setPosition(s.x + 8, barY - 3).setVisible(true);
    } else this.timer.setVisible(false);
    // Brisket Feast ready: the gold crown bobs over him (above his bar when it shows).
    if (this.readyIcon) {
      this.readyIcon.setVisible(feastReady);
      if (feastReady) {
        const barUp = this.hpBar.container.visible ? 20 : 4;
        this.readyIcon.setPosition(s.x, barY - barUp + Math.sin(time * 0.006) * 3);
      }
    }
  }

  /** Is the world point on him (a visible pixel of his picture)? */
  hitTest(wx, wy) {
    return this.sprite.visible && spriteHit(this.scene, this.sprite, wx, wy);
  }

  destroy() {
    this.sprite.destroy();
    this.ring.destroy();
    this.hpBar.destroy();
    this.timer.destroy();
    if (this.readyIcon) this.readyIcon.destroy();
    this.glow.destroy();
    this.stars.destroy();
    this.anger.destroy();
    this.snore.destroy();
  }
}

/** Multiply two 0xRRGGBB colors (a tint stays a tint). */
function mulTint(a, b) {
  const c = (sh) => Math.round((((a >> sh) & 255) * ((b >> sh) & 255)) / 255);
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

/** A little 5-point star (the knocked-out stars). */
function drawStar(g, x, y, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr });
  }
  g.fillStyle(0x5a3a00, 1).fillPoints(pts.map((p) => ({ x: p.x + (p.x - x) * 0.25, y: p.y + (p.y - y) * 0.25 })), true);
  g.fillStyle(0xffe14a, 1).fillPoints(pts, true);
}
