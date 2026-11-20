// Spell icons (Fuel Station spells, src/logic/spells.js). Each spell is an item with its own picture
// (art-source/spells/ui_spell_<kind>.png: Karuba Coffee, Donut, Ice Bag, Spicy Tornado, Chocolate Milk, Energy Drink),
// used by the hotbar, the Fuel Station window, How to Play and the cast on the map (spellIconTexture). When a picture
// is missing, a fallback is drawn with Phaser graphics in the game's glossy style: a colored glossy disc with a white
// symbol on a dark outline, made once into a texture (spellIconKey(kind)). Also each spell's color.
import { drawGlossy, fitIcon } from './uiDraw.js';
import { COLORS } from '../theme.js';
import { spellArtKey } from '../assetKeys.js';

export const SPELL_COLORS = {
  rage: 0xe2442f,
  heal: 0x4cbf3a,
  freeze: 0x4fb8f0,
  invisibility: 0x9b7be8,
  heat: 0xf28a1c,
  lightning: 0x3a3f8f
};
const SIZE = 64;

/** The drawn fallback icon's texture key. */
export const spellIconKey = (kind) => `spell_icon_${kind}`;

/** A white shape on a dark outline: `draw(g)` is called twice (outline at `outline` px wider, then white). */
function outlined(g, lineW, draw) {
  g.lineStyle(lineW + 5, COLORS.frame, 1);
  draw(g, true);
  g.lineStyle(lineW, 0xffffff, 1);
  draw(g, false);
}

function poly(g, pts, fill, outline = true) {
  if (outline) { g.lineStyle(5, COLORS.frame, 1).strokePoints(pts, true); }
  g.fillStyle(fill, 1).fillPoints(pts, true);
}

const SYMBOLS = {
  // Rage: two white chevrons pointing up (a boost), with a red glint.
  rage(g, c) {
    for (const dy of [-8, 6]) {
      outlined(g, 6, (gg) => gg.beginPath().moveTo(c - 13, c + dy + 9).lineTo(c, c + dy - 3).lineTo(c + 13, c + dy + 9).strokePath());
    }
  },
  // Heal: a fat white plus.
  heal(g, c) {
    const a = 6, b = 17;
    const pts = [[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]].map(([x, y]) => ({ x: c + x, y: c + y }));
    poly(g, pts, 0xffffff);
  },
  // Freeze: a six-armed snowflake.
  freeze(g, c) {
    outlined(g, 4, (gg) => {
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 2, dx = Math.cos(a) * 18, dy = Math.sin(a) * 18;
        gg.lineBetween(c - dx, c - dy, c + dx, c + dy);
      }
      for (let k = 0; k < 6; k++) {
        const a = (k * Math.PI) / 3 + Math.PI / 2, px = c + Math.cos(a) * 11, py = c + Math.sin(a) * 11;
        for (const s of [-1, 1]) {
          const b = a + s * 0.8;
          gg.lineBetween(px, py, px + Math.cos(b) * 7, py + Math.sin(b) * 7);
        }
      }
    });
  },
  // Invisibility: an eye with a slash through it.
  invisibility(g, c) {
    const eye = [];
    for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI; eye.push({ x: c - 18 + 36 * (i / 16), y: c - Math.sin(t) * 11 }); }
    for (let i = 16; i >= 0; i--) { const t = (i / 16) * Math.PI; eye.push({ x: c - 18 + 36 * (i / 16), y: c + Math.sin(t) * 11 }); }
    poly(g, eye, 0xffffff);
    g.fillStyle(COLORS.frame, 1).fillCircle(c, c, 6);
    g.fillStyle(0x9b7be8, 1).fillCircle(c, c, 4);
    outlined(g, 4, (gg) => gg.lineBetween(c - 16, c + 16, c + 16, c - 16));
  },
  // Heat Field: a flame (yellow body, white core).
  heat(g, c) {
    const flame = (s, dy) => [
      { x: c, y: c - 20 * s + dy }, { x: c + 7 * s, y: c - 8 * s + dy }, { x: c + 13 * s, y: c + 2 * s + dy },
      { x: c + 11 * s, y: c + 12 * s + dy }, { x: c, y: c + 18 * s + dy }, { x: c - 11 * s, y: c + 12 * s + dy },
      { x: c - 13 * s, y: c + 2 * s + dy }, { x: c - 6 * s, y: c - 4 * s + dy }, { x: c - 3 * s, y: c - 12 * s + dy }
    ];
    poly(g, flame(1, 0), 0xffd84a);
    poly(g, flame(0.55, 6), 0xffffff, false);
  },
  // Lightning Strike: a yellow bolt.
  lightning(g, c) {
    const pts = [[4, -21], [-11, 3], [-1, 3], [-6, 21], [11, -5], [1, -5], [7, -21]].map(([x, y]) => ({ x: c + x, y: c + y }));
    poly(g, pts, 0xffe14a);
  }
};

/** Make the spell icon textures (once per game; textures are shared by every scene). */
export function ensureSpellIcons(scene) {
  for (const kind of Object.keys(SYMBOLS)) {
    const key = spellIconKey(kind);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    drawGlossy(g, 1, 1, SIZE - 2, SIZE - 2, SPELL_COLORS[kind], { circle: true, lip: 3, shadow: false });
    SYMBOLS[kind](g, SIZE / 2);
    g.generateTexture(key, SIZE, SIZE);
    g.destroy();
  }
}

/** The texture to show for a spell: its picture when loaded, else the drawn icon (made on first use). */
export function spellIconTexture(scene, kind) {
  const art = spellArtKey(kind);
  if (scene.textures.exists(art)) return art;
  ensureSpellIcons(scene);
  return spellIconKey(kind);
}

/** Add a spell's icon to the scene at (x, y), fitted into a size x size box. */
export function addSpellIcon(scene, x, y, kind, size) {
  return fitIcon(scene.add.image(x, y, spellIconTexture(scene, kind)), size);
}
