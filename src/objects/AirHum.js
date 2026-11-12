// The plane drone for flying enemies (Bombers): ONE shared loop that plays while any of them is in the
// air, hovering over a target included. It swells a little with each extra flyer and is fainter while
// they're all off screen. Volume eases toward its target so flyers arriving or dying never cause a jump.
import { gridToScreen } from '../logic/iso.js';
import { isAirKind } from '../logic/enemies.js';
import { SFX } from '../assetKeys.js';
import { sfxVolume } from '../audio.js';

const BASE_VOLUME = 0.32;    // one flyer in view: a background hum under the combat effects
const PER_EXTRA = 0.12;      // each extra flyer adds this much (as a share of BASE_VOLUME)...
const MAX_BOOST = 1.5;       // ...up to 1.5x
const OFFSCREEN = 0.35;      // share of the volume when every flyer is far off screen
const FAR_PX = 500;          // world px outside the view where a flyer is "far"
const EASE_S = 0.35;         // volume smoothing time constant

export class AirHum {
  constructor(scene) {
    this.scene = scene;
    this.sound = null;
    this.volume = 0;
    this.onPause = () => { if (this.sound && this.sound.isPlaying) this.sound.pause(); };
    this.onResume = () => { if (this.sound && this.sound.isPaused) this.sound.resume(); };
    scene.events.on('pause', this.onPause);
    scene.events.on('resume', this.onResume);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Call once per frame with the live enemy list and the frame time in seconds. */
  update(enemies, dt) {
    let count = 0, near = 0;
    const view = this.scene.cameras.main.worldView;
    for (const e of enemies) {
      if (!e.alive || !isAirKind(e.kind) || e.kind === 'balloon') continue; // balloons drift silently
      count++;
      if (near < 1) near = Math.max(near, this.nearness(gridToScreen(e.x, e.y), view));
    }
    const target = count === 0 ? 0
      : BASE_VOLUME * Math.min(MAX_BOOST, 1 + PER_EXTRA * (count - 1)) * (OFFSCREEN + (1 - OFFSCREEN) * near);
    this.volume += (target - this.volume) * (1 - Math.exp(-dt / EASE_S));
    if (target === 0 && this.volume < 0.005) this.volume = 0;

    if (this.volume > 0 && !this.sound) this.start();
    if (this.volume === 0 && this.sound) this.stop();
    if (this.sound) this.sound.setVolume(sfxVolume(this.volume));
  }

  /** 1 inside the camera view, easing down to 0 at FAR_PX outside it. */
  nearness(p, view) {
    const dx = Math.max(view.x - p.x, 0, p.x - view.right);
    const dy = Math.max(view.y - p.y, 0, p.y - view.bottom);
    return Math.max(0, 1 - Math.hypot(dx, dy) / FAR_PX);
  }

  start() {
    const scene = this.scene, key = SFX.bomberFlying;
    if (!scene.cache.audio.exists(key)) { this.volume = 0; return; }
    this.sound = scene.sound.add(key, { loop: true, volume: 0 });
    // Start somewhere random in the long recording so every air wave doesn't sound identical.
    const dur = this.sound.duration || 0;
    this.sound.play({ seek: dur > 4 ? Math.random() * (dur - 2) : 0 });
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
