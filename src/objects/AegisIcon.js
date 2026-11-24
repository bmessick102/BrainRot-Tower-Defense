// The Locklair Mage's Arcane Aegis icon (v0.12). The real picture goes in art-source/ui/ui_aegis_ready.png (prepare-art
// loads it under AEGIS_ICON); until it exists a stand-in is drawn once with Phaser graphics into the same key: a violet
// glossy disc with a white shield and a glowing magenta crystal on it. Used by his hotbar slot and his Hero tab card.
import { drawGlossy } from './uiDraw.js';
import { COLORS } from '../theme.js';

export const AEGIS_ICON = 'ui_aegis_ready';
export const AEGIS_COLOR = 0x9b4dff; // his violet
const SIZE = 64;

/** A heater shield centered on (cx, cy), `k` = scale, `grow` px wider (the outline pass). */
function shield(g, cx, cy, k, grow, color) {
  const w = 30 * k + grow, top = cy - 17 * k - grow / 2, mid = cy + 4 * k, bottom = cy + 20 * k + grow / 2;
  g.fillStyle(color, 1).fillPoints([
    { x: cx - w / 2, y: top }, { x: cx + w / 2, y: top }, { x: cx + w / 2, y: mid },
    { x: cx, y: bottom }, { x: cx - w / 2, y: mid }
  ], true);
}

/** Make the Arcane Aegis icon once if its picture isn't loaded (safe to call every time). Returns its key. */
export function ensureAegisTexture(scene) {
  if (scene.textures.exists(AEGIS_ICON)) return AEGIS_ICON;
  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  drawGlossy(g, 2, 2, SIZE - 4, SIZE - 4, AEGIS_COLOR, { circle: true, lip: 4, shadow: false });
  shield(g, SIZE / 2, SIZE / 2, 1, 6, COLORS.frame);
  shield(g, SIZE / 2, SIZE / 2, 1, 0, 0xffffff);
  g.fillStyle(0xff4fd8, 1).fillPoints([{ x: 32, y: 21 }, { x: 38, y: 31 }, { x: 32, y: 42 }, { x: 26, y: 31 }], true);
  g.fillStyle(0xffd0f5, 1).fillPoints([{ x: 32, y: 24 }, { x: 35, y: 30 }, { x: 32, y: 33 }, { x: 29, y: 30 }], true);
  g.generateTexture(AEGIS_ICON, SIZE, SIZE);
  g.destroy();
  return AEGIS_ICON;
}
