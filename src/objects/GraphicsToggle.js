// Settings row "Graphics: Auto | High | Low" (src/quality.js), used in the title Settings window and the pause
// menu. Low draws fewer particles, fog puffs and night glows for slow devices; Auto switches to Low by itself
// when the game keeps running slowly. Saved with the settings. Objects sit at the scene root like the
// volume sliders (pass `depth` when it's on top of other UI).
import { Button } from './Button.js';
import { COLORS, textStyle } from '../theme.js';
import { QUALITY_MODES, QUALITY_LABELS, qualityMode, setQualityMode, autoSwitchedLow } from '../quality.js';
import { saveGraphicsSetting } from '../logic/save.js';

/**
 * @param {Phaser.Scene} scene
 * @param {object} o
 * @param {number} o.x left end (lines up with the volume sliders' tracks)
 * @param {number} o.y vertical center
 * @param {number} [o.width] total width of the three buttons
 * @param {Storage|null} o.storage where settings are saved
 * @param {number} [o.depth]
 * @returns {Phaser.GameObjects.GameObject[]} everything created, for the caller to destroy
 */
export function addGraphicsToggle(scene, { x, y, width = 250, storage, depth = 0 }) {
  const gap = 8, h = 40;
  const bw = (width - gap * (QUALITY_MODES.length - 1)) / QUALITY_MODES.length;
  const name = scene.add.text(x - 18, y, 'Graphics', textStyle(20)).setOrigin(1, 0.5);
  const buttons = {};
  const draw = () => {
    for (const m of QUALITY_MODES) {
      const b = buttons[m];
      b.color = qualityMode() === m ? COLORS.buttonGood : COLORS.buttonDark;
      b.setLabel(QUALITY_LABELS[m], m === 'auto' && qualityMode() === 'auto' && autoSwitchedLow() ? 'now Low' : '');
    }
  };
  QUALITY_MODES.forEach((m, i) => {
    buttons[m] = new Button(scene, x + bw / 2 + i * (bw + gap), y, bw, h, QUALITY_LABELS[m], () => {
      setQualityMode(m);
      saveGraphicsSetting(storage, m);
      draw();
    }, { fontSize: 17, radius: 10 });
  });
  draw();
  const objs = [name, ...Object.values(buttons)];
  objs.forEach((o) => o.setDepth(depth));
  return objs;
}
