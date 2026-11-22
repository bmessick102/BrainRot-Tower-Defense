// Ability icons of the merged defenses (CONFIG.merges[type].abilityIcon): a glossy gold box like the hero ability
// slots on the hotbar (v0.8.2: it was a disc). The art is a texture (art-source/ui/<key>.png, e.g. ui_ability_sky_net)
// drawn inside the box; until it exists, a simple symbol is drawn in code (a rolling ball, a bolt, three shells, a net,
// a staff and a wall).
import { fitIcon, drawGlossy } from './uiDraw.js';

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
  } else if (key === 'ui_ability_triple_zap') {
    // Three lightning bolts fanning out from a point at the bottom.
    for (const a of [-0.55, 0, 0.55]) {
      const dx = Math.sin(a), dy = -Math.cos(a), px = -dy, py = dx, L = r * 0.75;
      const pt = (t, side) => ({ x: (dx * t + px * side) * L, y: r * 0.45 + (dy * t + py * side) * L });
      const p = [pt(0, 0), pt(0.4, 0.14), pt(0.5, -0.1), pt(1, 0)];
      g.lineStyle(Math.max(2, r * 0.13), INK, 1).beginPath().moveTo(p[0].x, p[0].y);
      for (const q of p.slice(1)) g.lineTo(q.x, q.y);
      g.strokePath();
    }
    g.fillStyle(0xfff0c0, 1).fillCircle(0, r * 0.45, r * 0.14);
  } else if (key === 'ui_ability_shall_not_pass') {
    // A staff planted in front of a wall of light: the wall's outline, then the staff with its glowing tip.
    g.lineStyle(Math.max(2, r * 0.1), INK, 1).strokeRect(-r * 0.62, -r * 0.2, r * 1.24, r * 0.62);
    for (const k of [-0.2, 0.2]) g.lineBetween(r * k, -r * 0.2, r * k, r * 0.42);
    g.lineStyle(Math.max(2, r * 0.16), INK, 1).lineBetween(-r * 0.05, r * 0.7, r * 0.12, -r * 0.62);
    g.fillStyle(0xfff0c0, 1).fillCircle(r * 0.14, -r * 0.68, r * 0.16);
    g.lineStyle(Math.max(1.5, r * 0.07), INK, 1).strokeCircle(r * 0.14, -r * 0.68, r * 0.16);
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
  const r = size / 2;
  const g = scene.add.graphics();
  drawGlossy(g, -r, -r, size, size, GOLD, { radius: Math.round(size * 0.22), lip: Math.max(3, Math.round(size * 0.07)) });
  const parts = [g];
  if (key && scene.textures.exists(key)) parts.push(fitIcon(scene.add.image(0, -2, key), size - 12)); // the art, inside the box
  else drawSymbol(g, key, r - 4);
  return scene.add.container(x, y, parts);
}
