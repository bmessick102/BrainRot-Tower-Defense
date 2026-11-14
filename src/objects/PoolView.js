// A Catapult pool: a pink puddle on the ground with bubbles popping in it. Fades in on landing and
// out over its last second. Drawn just above the map, under buildings and enemies.
import Phaser from 'phaser';
import { gridToScreen, rangeEllipse } from '../logic/iso.js';
import { SFX } from '../assetKeys.js';
import { sfxVolume } from '../audio.js';

export const POOL_COLOR = 0xff4fa3;
const POOL_EDGE = 0xff9fd0;
// Pool looks by kind: the Catapult's pink oil (default), RV Lab fire patches (Mortar Incendiary, Gandolf
// burning ground, Meteor) and Mousetrap glue. Glue is quiet; oil and fire sizzle.
const POOL_STYLES = {
  default: { color: POOL_COLOR, edge: POOL_EDGE, rim: 0xffd6ec, sizzle: true },
  fire: { color: 0xff5a1a, edge: 0xffb02e, rim: 0xffe08a, sizzle: true },
  glue: { color: 0xf3e6a8, edge: 0xfff7d6, rim: 0xffffff, sizzle: false },
  crater: { color: 0x6b4a2f, edge: 0x9a7a52, rim: 0xc9a97a, sizzle: false },   // Mortar Craters
  spikes: { color: 0x7a7f88, edge: 0xc9ced6, rim: 0xeef2f6, sizzle: false },   // Mousetrap Spike Trap
  crack: { color: 0x4a3626, edge: 0x7a5a3e, rim: 0xb08a5a, sizzle: false },     // Mortar Fault Line
  star: { color: 0xffd34a, edge: 0xfff2a0, rim: 0xffffff, sizzle: false }       // Firework Star Shells
};
const POOL_DEPTH = -4200;     // above the map and selection outlines, below every building and enemy
const FADE_OUT = 1;           // seconds of fade at the end of the pool's life
const BUBBLE_EVERY = 140;     // ms between bubbles
// The sizzle loop: volume, and how many pools may sizzle at once (extra pools stay quiet).
const SIZZLE_VOLUME = 0.6;
const SIZZLE_MAX = 2;

export class PoolView {
  constructor(scene, pool) {
    this.scene = scene;
    this.id = pool.id;
    const s = gridToScreen(pool.x, pool.y);
    const { rx, ry } = rangeEllipse(pool.radius);
    this.rx = rx;
    this.ry = ry;
    const st = POOL_STYLES[pool.kind] || POOL_STYLES.default;
    this.style = st;
    this.g = scene.add.graphics().setDepth(POOL_DEPTH).setPosition(s.x, s.y);
    // Layered puddle: soft outer stain, body, brighter core, glossy rim.
    this.g.fillStyle(st.color, 0.25).fillEllipse(0, 0, rx * 2.25, ry * 2.25);
    this.g.fillStyle(st.color, pool.kind === 'glue' ? 0.45 : 0.6).fillEllipse(0, 0, rx * 2, ry * 2);
    this.g.fillStyle(st.edge, 0.5).fillEllipse(-rx * 0.15, -ry * 0.12, rx * 1.1, ry * 1.0);
    this.g.lineStyle(2.5, st.rim, 0.95).strokeEllipse(0, 0, rx * 2, ry * 2);
    if (pool.kind === 'fire') this.g.setBlendMode('ADD');
    this.g.setScale(0.3).setAlpha(0);
    scene.tweens.add({ targets: this.g, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    this.nextBubble = 0;
    this.fading = false;
    if (st.sizzle) this.startSizzle();
    else this.sound = null;
    this.sync(pool);
  }

  /** The pool's linger sound: fades in, plays while the pool lasts, fades out with it. */
  startSizzle() {
    const scene = this.scene, key = SFX.catapultPool;
    this.sound = null;
    if (!scene.cache.audio.exists(key)) return;
    if (scene.sound.getAll(key).filter((s) => s.isPlaying).length >= SIZZLE_MAX) return;
    this.sound = scene.sound.add(key, { volume: 0 });
    this.sound.play();
    this.vol = { v: 0 };
    this.volTween = scene.tweens.add({ targets: this.vol, v: SIZZLE_VOLUME, duration: 250, onUpdate: () => this.applyVolume() });
    // Paused game: pause the sizzle too. Leaving the scene (quit, game over) stops it.
    this.onPause = () => { if (this.sound && this.sound.isPlaying) this.sound.pause(); };
    this.onResume = () => { if (this.sound && this.sound.isPaused) this.sound.resume(); };
    this.onShutdown = () => this.destroy();
    scene.events.on('pause', this.onPause);
    scene.events.on('resume', this.onResume);
    scene.events.once('shutdown', this.onShutdown);
  }

  applyVolume() {
    if (this.sound && !this.sound.pendingRemove) this.sound.setVolume(sfxVolume(this.vol.v));
  }

  sync(pool) {
    const left = pool.duration - pool.age;
    if (left < FADE_OUT && !this.fading) {
      this.fading = true;
      const ms = Math.max(100, left * 1000);
      this.scene.tweens.add({ targets: this.g, alpha: 0, scale: 0.92, duration: ms });
      if (this.sound) {
        if (this.volTween) this.volTween.stop();
        this.volTween = this.scene.tweens.add({ targets: this.vol, v: 0, duration: ms, onUpdate: () => this.applyVolume() });
      }
    }
    const now = this.scene.time.now;
    if (!this.fading && now >= this.nextBubble) {
      this.nextBubble = now + BUBBLE_EVERY * Phaser.Math.FloatBetween(0.6, 1.4);
      this.bubble();
    }
  }

  /** A small pink bubble that rises a little and pops. */
  bubble() {
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2), d = Math.sqrt(Math.random()) * 0.8;
    const x = this.g.x + Math.cos(a) * this.rx * d, y = this.g.y + Math.sin(a) * this.ry * d;
    const b = this.scene.add.circle(x, y, Phaser.Math.Between(2, 4), this.style.edge, 0.9).setDepth(POOL_DEPTH + 1);
    b.setStrokeStyle(1, 0xffffff, 0.8);
    this.scene.tweens.add({
      targets: b, y: y - Phaser.Math.Between(4, 9), scale: 1.6, alpha: 0,
      duration: Phaser.Math.Between(380, 620), onComplete: () => b.destroy()
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.volTween) this.volTween.stop();
    if (this.sound) {
      this.sound.stop();
      this.sound.destroy();
      this.sound = null;
      this.scene.events.off('pause', this.onPause);
      this.scene.events.off('resume', this.onResume);
      this.scene.events.off('shutdown', this.onShutdown);
    }
    this.g.destroy();
  }
}
