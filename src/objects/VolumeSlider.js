// A labelled 0-100% slider (label on the left, glossy knob, percent on the right). Used for the
// Music and Effects volumes in Settings and the pause menu. Objects are added at the scene root
// (drag math uses screen x), so pass `depth` when it sits on top of other UI.
import Phaser from 'phaser';
import { drawGlossy } from './uiDraw.js';
import { COLORS, textStyle } from '../theme.js';

/**
 * @param {Phaser.Scene} scene
 * @param {object} o
 * @param {number} o.x left end of the track
 * @param {number} o.y vertical center
 * @param {number} [o.width] track length
 * @param {string} o.label
 * @param {() => number} o.get current value 0-1
 * @param {(v: number) => void} o.set called with the new value 0-1 (apply + save)
 * @param {number} [o.depth]
 * @returns {Phaser.GameObjects.GameObject[]} everything created, for the caller to destroy
 */
export function addVolumeSlider(scene, { x, y, width = 200, label, get, set, depth = 0 }) {
  const th = 16;
  const name = scene.add.text(x - 18, y, label, textStyle(20)).setOrigin(1, 0.5);
  const track = scene.add.graphics();
  track.fillStyle(COLORS.frame, 1).fillRoundedRect(x - 2, y - th / 2 - 2, width + 4, th + 4, th / 2 + 2);
  track.fillStyle(0x2c261f, 1).fillRoundedRect(x, y - th / 2, width, th, th / 2);
  const fill = scene.add.graphics();
  const hit = scene.add.zone(x - 10, y - 18, width + 20, 36).setOrigin(0).setInteractive({ useHandCursor: true });
  const knob = scene.add.container(0, y).setSize(34, 34).setInteractive({ useHandCursor: true, draggable: true });
  const knobGfx = scene.add.graphics();
  drawGlossy(knobGfx, -16, -16, 32, 32, 0xffffff, { circle: true, lip: 3 });
  knob.add(knobGfx);
  const pct = scene.add.text(x + width + 18, y, '', textStyle(20)).setOrigin(0, 0.5);

  const draw = (v) => {
    knob.x = x + v * width;
    fill.clear().fillStyle(COLORS.buttonGood, 1).fillRoundedRect(x, y - th / 2, Math.max(th, v * width), th, th / 2);
    fill.fillStyle(0xffffff, 0.3).fillRect(x + 6, y - th / 2 + 3, Math.max(0, v * width - 12), 3);
    pct.setText(`${Math.round(v * 100)}%`);
  };
  const apply = (v) => {
    v = Math.round(Phaser.Math.Clamp(v, 0, 1) * 100) / 100;
    set(v);
    draw(v);
  };
  knob.on('drag', (p, dragX) => apply((dragX - x) / width));
  hit.on('pointerdown', (p) => apply((p.x - x) / width));
  draw(get());

  const objs = [name, track, fill, hit, knob, pct];
  objs.forEach((o) => o.setDepth(o === knob ? depth + 1 : depth));
  return objs;
}
