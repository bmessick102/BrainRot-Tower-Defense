// The Tower of Rah beam sound: ONE shared loop that plays while any Tower of Rah is burning an enemy,
// a little louder at each heat stage and fainter while every firing tower is off screen. Volume eases
// toward its target so beams starting, stopping or switching targets never cause a jump.
import { gridToScreen } from '../logic/iso.js';
import { footprintCenter } from '../logic/grid.js';
import { SFX } from '../assetKeys.js';
import { sfxVolume } from '../audio.js';

const STAGE_VOLUME = [0.3, 0.38, 0.48]; // by the hottest firing tower's heat stage
const EXTRA_TOWER = 1.15;               // a second firing tower adds a little
const OFFSCREEN = 0.35;                 // share of the volume when every firing tower is far off screen
const FAR_PX = 500;
const EASE_S = 0.2;

export class BeamHum {
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

  /** Call once per frame with the building list and the frame time in seconds. */
  update(buildings, dt) {
    let count = 0, stage = 0, near = 0;
    const view = this.scene.cameras.main.worldView;
    for (const b of buildings) {
      if (b.type !== 'ra' || b.destroyed || !b.beamTargetId) continue;
      count++;
      stage = Math.max(stage, b.beamStage || 0);
      const c = footprintCenter(b), p = gridToScreen(c.x, c.y);
      const dx = Math.max(view.x - p.x, 0, p.x - view.right), dy = Math.max(view.y - p.y, 0, p.y - view.bottom);
      near = Math.max(near, Math.max(0, 1 - Math.hypot(dx, dy) / FAR_PX));
    }
    const target = count === 0 ? 0
      : STAGE_VOLUME[Math.min(stage, STAGE_VOLUME.length - 1)] * (count > 1 ? EXTRA_TOWER : 1) * (OFFSCREEN + (1 - OFFSCREEN) * near);
    this.volume += (target - this.volume) * (1 - Math.exp(-dt / EASE_S));
    if (target === 0 && this.volume < 0.005) this.volume = 0;
    if (this.volume > 0 && !this.sound) this.start();
    if (this.volume === 0 && this.sound) this.stop();
    if (this.sound) this.sound.setVolume(sfxVolume(this.volume));
  }

  start() {
    const scene = this.scene, key = SFX.raBeam;
    if (!scene.cache.audio.exists(key)) { this.volume = 0; return; }
    this.sound = scene.sound.add(key, { loop: true, volume: 0 });
    const dur = this.sound.duration || 0;
    this.sound.play({ seek: dur > 4 ? Math.random() * (dur - 2) : 0 }); // vary where the long loop starts
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
