// Ability icons of the merged defenses (CONFIG.merges[type].abilityIcon): a round gold icon like the hero ability
// icons on the hotbar. The art is a texture (art-source/ui/<key>.png, e.g. ui_ability_sky_net); until it exists, a
// placeholder is drawn in code: a gold disc with a simple symbol (a rolling ball, a bolt, three shells, a net).
import { fitIcon } from './uiDraw.js';

const GOLD = 0xffc83a, GOLD_DARK = 0xb87d0a, INK = 0x3a2406;

/** Draw the placeholder symbol for `key` on graphics `g`, centered on (0, 0), fitting a disc of radius r. */
function drawSymbol(g, key, r) {
  g.fillStyle(INK, 1).lineStyle(Math.max(2, r * 0.14), INK, 1);
  if (key === 'ui_ability_rolling_thunder') {
    // A ball with speed streaks behind it.
    g.fillCircle(r * 0.22, 0, r * 0.42);
    g.fillStyle(0xfff0c0, 1).fillCircle(r * 0.1, -r * 0.12, r * 0.13);
    for (const dy of [-0.3, 0, 0.3]) g.lineBetween(-r * 0.72, r * dy, -r * (0.34 - Math.abs(dy) * 0.3), r * dy);
  } else if (key === 'ui_ability_ballista_bolt') {
    // A bolt flying up-right: shaft, head and fletching.
    g.lineBetween(-r * 0.55, r * 0.55, r * 0.3, -r * 0.3);
    g.fillTriangle(r * 0.62, -r * 0.62, r * 0.12, -r * 0.4, r * 0.4, -r * 0.12);
    g.lineBetween(-r * 0.55, r * 0.55, -r * 0.55, r * 0.25);
    g.lineBetween(-r * 0.55, r * 0.55, -r * 0.25, r * 0.55);
    g.lineBetween(-r * 0.42, r * 0.42, -r * 0.42, r * 0.12);
    g.lineBetween(-r * 0.42, r * 0.42, -r * 0.12, r * 0.42);
  } else if (key === 'ui_ability_triple_strike') {
    // Three shells in a triangle.
    for (const [x, y] of [[0, -0.34], [-0.38, 0.28], [0.38, 0.28]]) {
      g.fillStyle(INK, 1).fillCircle(r * x, r * y, r * 0.27);
      g.fillStyle(0xfff0c0, 1).fillCircle(r * x - r * 0.07, r * y - r * 0.07, r * 0.08);
    }
  } else {
    // A net: a circle crossed by a few lines.
    g.strokeCircle(0, 0, r * 0.55);
    for (const k of [-0.28, 0, 0.28]) {
      g.lineBetween(-r * 0.5, r * k * 1.4, r * 0.5, r * k * 1.4);
      g.lineBetween(r * k * 1.4, -r * 0.5, r * k * 1.4, r * 0.5);
    }
  }
}

/**
 * The ability icon for a merge config key at (x, y), `size` px across: the texture when it exists, else the placeholder
 * (a Container). The caller adds it to its window / container.
 */
export function abilityIcon(scene, key, x, y, size) {
  if (key && scene.textures.exists(key)) return fitIcon(scene.add.image(x, y, key), size);
  const r = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillCircle(1, 2, r);
  g.fillStyle(INK, 1).fillCircle(0, 0, r);
  g.fillStyle(GOLD_DARK, 1).fillCircle(0, 0, r - 2);
  g.fillStyle(GOLD, 1).fillCircle(0, -r * 0.05, r - 4);
  g.fillStyle(0xffffff, 0.3).fillEllipse(0, -r * 0.5, r * 1.2, r * 0.5);
  drawSymbol(g, key, r - 4);
  return scene.add.container(x, y, [g]);
}
