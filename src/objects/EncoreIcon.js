// The Hatsune Queen's Encore Cloak icon (no art file): a teal glossy disc with a white pair of music notes on a dark
// outline, drawn once with Phaser graphics into a texture (like SpellIcons' fallbacks). Used by her hotbar slot, the
// Hero tab's ability card and the icon that bobs over her while it's ready. Also a small white music note texture for
// the notes that float around her while she's cloaked.
import { drawGlossy } from './uiDraw.js';
import { COLORS } from '../theme.js';

export const ENCORE_ICON = 'ui_encore_ready';
export const NOTE_TEX = 'fx_music_note';
export const ENCORE_COLOR = 0x2fc7c0;   // her teal
const SIZE = 64;

/** Two beamed eighth notes centered near (cx, cy), `k` = scale; `grow` px wider (the outline pass). */
function drawNotes(g, cx, cy, k, grow, color) {
  const headW = 13 * k + grow, headH = 10 * k + grow, stemW = 3.5 * k + grow;
  const lx = cx - 9 * k, rx = cx + 11 * k, by = cy + 11 * k, ry = cy + 8 * k, top = cy - 13 * k;
  g.fillStyle(color, 1);
  g.fillEllipse(lx, by, headW, headH);
  g.fillEllipse(rx, ry, headW, headH);
  // Stems up from the right side of each head, joined by a slanted beam.
  g.fillRect(lx + 4.5 * k - stemW / 2, top + 2 * k - grow / 2, stemW, by - top - 2 * k + grow / 2);
  g.fillRect(rx + 4.5 * k - stemW / 2, top - 3 * k - grow / 2, stemW, ry - top + 3 * k + grow / 2);
  const bh = 6 * k + grow;
  g.fillPoints([
    { x: lx + 4.5 * k - stemW / 2, y: top + 2 * k - grow / 2 }, { x: rx + 4.5 * k + stemW / 2, y: top - 3 * k - grow / 2 },
    { x: rx + 4.5 * k + stemW / 2, y: top - 3 * k - grow / 2 + bh }, { x: lx + 4.5 * k - stemW / 2, y: top + 2 * k - grow / 2 + bh }
  ], true);
}

/** Make the Encore Cloak icon and the music note textures once (safe to call every time). */
export function ensureEncoreTextures(scene) {
  if (!scene.textures.exists(ENCORE_ICON)) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    drawGlossy(g, 2, 2, SIZE - 4, SIZE - 4, ENCORE_COLOR, { circle: true, lip: 4, shadow: false });
    drawNotes(g, SIZE / 2 - 1, SIZE / 2 - 2, 1.05, 5, COLORS.frame);
    drawNotes(g, SIZE / 2 - 1, SIZE / 2 - 2, 1.05, 0, 0xffffff);
    g.generateTexture(ENCORE_ICON, SIZE, SIZE);
    g.destroy();
  }
  if (!scene.textures.exists(NOTE_TEX)) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    drawNotes(g, 16, 16, 0.6, 3, 0x1d6f6b);
    drawNotes(g, 16, 16, 0.6, 0, 0xffffff);
    g.generateTexture(NOTE_TEX, 32, 32);
    g.destroy();
  }
  return ENCORE_ICON;
}
