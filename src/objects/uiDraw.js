// Shared drawing for the chunky UI style: windows, glossy shapes, gradient cards, HUD pills, ribbons.
// Everything draws into a Phaser Graphics at the given coordinates; nothing here keeps state.
import { COLORS, shade, mix } from '../theme.js';

/**
 * Vertical gradient inside a rounded rect (top -> bottom). Graphics can't gradient-fill rounded shapes,
 * so this stacks rects that are rounded only at the top, each a little shorter and lighter.
 */
export function fillGradientRounded(g, x, y, w, h, r, top, bottom, steps = 14) {
  g.fillStyle(bottom, 1).fillRoundedRect(x, y, w, h, r);
  const span = h - r;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const hh = span * (1 - t) + r;
    if (hh <= r) break;
    g.fillStyle(mix(bottom, top, t), 1).fillRoundedRect(x, y, w, hh, { tl: r, tr: r, bl: 0, br: 0 });
  }
}

/**
 * A light stone window with a dark frame and drop shadow.
 * `header` (px) adds a slate band across the top for the title and tabs.
 */
export function drawWindow(g, x, y, w, h, { header = 0, radius = 18, alpha = 1, flat = false } = {}) {
  const r = radius, b = 4;
  g.fillStyle(0x000000, 0.35 * alpha).fillRoundedRect(x + 2, y + 7, w, h, r);
  g.fillStyle(COLORS.frame, alpha).fillRoundedRect(x, y, w, h, r);
  const ix = x + b, iy = y + b, iw = w - b * 2, ih = h - b * 2, ir = r - b;
  g.fillStyle(COLORS.body, alpha).fillRoundedRect(ix, iy, iw, ih, ir);
  // Lower body a shade darker, for depth.
  if (!flat) {
    // Soft gradient into a darker lower body: bottom-anchored rects, each shorter and darker.
    const span = Math.max(ir * 2, ih * 0.6), steps = 16;
    for (let i = 1; i <= steps; i++) {
      const hh = span * (1 - (i - 1) / steps);
      if (hh <= ir) break;
      g.fillStyle(mix(COLORS.body, COLORS.bodyShade, i / steps), alpha)
        .fillRoundedRect(ix, iy + ih - hh, iw, hh, { tl: 0, tr: 0, bl: ir, br: ir });
    }
  }
  if (header > 0) {
    g.fillStyle(COLORS.header, alpha).fillRoundedRect(ix, iy, iw, header, { tl: ir, tr: ir, bl: 0, br: 0 });
    g.fillStyle(COLORS.headerLight, alpha).fillRoundedRect(ix, iy, iw, header * 0.45, { tl: ir, tr: ir, bl: 0, br: 0 });
    g.fillStyle(COLORS.frame, alpha).fillRect(ix, iy + header, iw, 3);
  }
}

/**
 * A beveled, glossy shape: dark outline, colored face sitting on a darker lip, light shine on top.
 * Used by buttons, tabs, and the footer strip. `circle` draws a round version inside the w x h box.
 */
export function drawGlossy(g, x, y, w, h, color, { radius = 12, lip = 4, shadow = true, circle = false } = {}) {
  if (circle) {
    const cx = x + w / 2, cy = y + h / 2, rad = Math.min(w, h) / 2;
    if (shadow) g.fillStyle(0x000000, 0.3).fillCircle(cx + 1, cy + 3, rad);
    g.fillStyle(COLORS.frame, 1).fillCircle(cx, cy, rad);
    g.fillStyle(shade(color, 0.68), 1).fillCircle(cx, cy, rad - 2);
    g.fillStyle(color, 1).fillCircle(cx, cy - lip / 2, rad - 2 - lip / 2);
    g.fillStyle(0xffffff, 0.35).fillEllipse(cx, cy - rad * 0.4, rad * 1.1, rad * 0.6);
    return;
  }
  const r = Math.min(radius, h / 2);
  if (shadow) g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 1, y + 4, w, h, r);
  g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, h, r);
  const fx = x + 2, fy = y + 2, fw = w - 4, fh = h - 4, fr = Math.max(1, r - 2);
  g.fillStyle(shade(color, 0.68), 1).fillRoundedRect(fx, fy, fw, fh, fr);           // lip
  g.fillStyle(color, 1).fillRoundedRect(fx, fy, fw, fh - lip, fr);                  // face
  const sr = Math.max(1, fr - 2);
  g.fillStyle(0xffffff, 0.3).fillRoundedRect(fx + 3, fy + 2, fw - 6, (fh - lip) * 0.42, { tl: sr, tr: sr, bl: 3, br: 3 }); // shine
}

/**
 * Shop-style showcase card: dark frame, blue (or grey when locked) gradient face, top shine,
 * a soft spotlight, and a light diamond tile centered at (x + w/2, tileY) for the subject to stand on.
 */
export function drawShowcaseCard(g, x, y, w, h, { locked = false, tileY, tileW = Math.min(64, w * 0.32) } = {}) {
  g.fillStyle(0x000000, 0.3).fillRoundedRect(x + 1, y + 4, w, h, 12);
  g.fillStyle(locked ? COLORS.lockedEdge : COLORS.cardEdge, 1).fillRoundedRect(x, y, w, h, 12);
  fillGradientRounded(g, x + 3, y + 3, w - 6, h - 6, 10,
    locked ? COLORS.lockedTop : COLORS.cardTop, locked ? COLORS.lockedBottom : COLORS.cardBottom);
  g.fillStyle(0xffffff, 0.18).fillRoundedRect(x + 6, y + 5, w - 12, 18, { tl: 8, tr: 8, bl: 4, br: 4 });
  const cx = x + w / 2;
  const glowHeight = Math.min(120, h * 0.6);
  g.fillStyle(0xffffff, 0.12).fillEllipse(cx, tileY - glowHeight / 4, w * 0.85, glowHeight);
  g.fillStyle(0xffffff, 0.14).fillEllipse(cx, tileY - glowHeight / 6, w * 0.6, glowHeight * 2 / 3);
  const th = tileW / 2;
  const diamond = [{ x: cx, y: tileY - th }, { x: cx + tileW, y: tileY }, { x: cx, y: tileY + th }, { x: cx - tileW, y: tileY }];
  g.fillStyle(0xffffff, 0.22).fillPoints(diamond, true);
  g.lineStyle(2, 0xffffff, 0.45).strokePoints(diamond, true);
}

/** Dark rounded strip near a card's bottom (holds a price or bounty). */
export function drawCardStrip(g, x, y, w, h = 30) {
  g.fillStyle(COLORS.priceStrip, 0.72).fillRoundedRect(x, y, w, h, 8);
}

/** Rounded stat bar on the light window body: dark trough, colored fill with a shine. */
export function drawStatBar(g, x, y, w, frac, color, h = 12) {
  const f = Math.max(0, Math.min(1, frac));
  g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, h, h / 2);
  g.fillStyle(0x2c261f, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 4, (h - 4) / 2);
  if (f <= 0) return;
  const iw = Math.max(h - 4, (w - 4) * f);
  g.fillStyle(color, 1).fillRoundedRect(x + 2, y + 2, iw, h - 4, (h - 4) / 2);
  g.fillStyle(0xffffff, 0.35).fillRect(x + 6, y + 3, Math.max(0, iw - 8), 2);
}

/** Comparison meter: the lighter segment shows the projected gain, or the amount lost when it decreases. */
export function drawStatComparison(g, x, y, w, current, next, max, color, h = 12) {
  const scale = Math.max(max || 0, current, next) || 1;
  drawStatBar(g, x, y, w, Math.max(current, next) / scale, mix(color, 0xffffff, 0.55), h);
  const lower = Math.min(current, next);
  if (lower > 0) {
    const inner = h - 4;
    const fill = Math.max(inner, (w - 4) * lower / scale);
    g.fillStyle(color, 1).fillRoundedRect(x + 2, y + 2, fill, inner, inner / 2);
  }
}

/** Small glossy tag pill. Returns its width so callers can lay tags out in a row. */
export function drawTag(scene, container, x, y, text, color, style) {
  const label = scene.add.text(0, 0, text, style).setOrigin(0.5);
  const w = Math.round(label.width + 22), h = 26;
  const g = scene.add.graphics();
  drawGlossy(g, x, y, w, h, color, { radius: 8, lip: 3, shadow: false });
  label.setPosition(x + w / 2, y + h / 2 - 2);
  container.add([g, label]);
  return w;
}

/** Translucent dark pill for HUD text over the map (wave status, hints). */
export function drawHudPill(g, x, y, w, h) {
  const r = h / 2;
  g.fillStyle(COLORS.hudPill, 0.55).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(2, 0x000000, 0.7).strokeRoundedRect(x, y, w, h, r);
  g.fillStyle(0xffffff, 0.08).fillRoundedRect(x + 4, y + 3, w - 8, h * 0.4, { tl: r - 3, tr: r - 3, bl: 2, br: 2 });
}

/** Orange ribbon banner with folded tails, centered on cx. */
export function drawRibbon(g, cx, y, w, h, color = COLORS.button) {
  const x = cx - w / 2, tail = 26, drop = 10, dark = shade(color, 0.62);
  // Tails sit behind the body, a little lower, with a V notch cut into the outer end.
  for (const side of [-1, 1]) {
    const inner = side < 0 ? x + 20 : x + w - 20;
    const outer = side < 0 ? x - tail : x + w + tail;
    const notch = outer - side * 12;
    const top = y + drop, bot = y + h + drop, mid = (top + bot) / 2;
    const pts = [{ x: inner, y: top }, { x: outer, y: top }, { x: notch, y: mid }, { x: outer, y: bot }, { x: inner, y: bot }];
    g.fillStyle(dark, 1).fillPoints(pts, true);
    g.lineStyle(3, COLORS.frame, 1).strokePoints(pts, true);
  }
  drawGlossy(g, x, y, w, h, color, { radius: 10, lip: 5 });
}

/** Red notification badge with a white rim. Returns nothing; draw the count text on top yourself. */
export function drawBadge(g, cx, cy, r = 12) {
  g.fillStyle(0x000000, 0.35).fillCircle(cx + 1, cy + 2, r + 2);
  g.fillStyle(0xffffff, 1).fillCircle(cx, cy, r + 2);
  g.fillStyle(COLORS.badge, 1).fillCircle(cx, cy, r);
  g.fillStyle(0xffffff, 0.3).fillEllipse(cx, cy - r * 0.45, r * 1.2, r * 0.6);
}

/** Bold triangle arrow (white with a dark outline) centered on cx, cy; dir -1 points left, 1 right. */
export function drawArrow(g, cx, cy, size, dir) {
  const s = size / 2, nudge = dir * s * 0.15; // shift right/left so the triangle looks centered
  const pts = [{ x: cx + nudge + dir * s, y: cy }, { x: cx + nudge - dir * s * 0.7, y: cy - s }, { x: cx + nudge - dir * s * 0.7, y: cy + s }];
  g.lineStyle(5, COLORS.frame, 1).strokePoints(pts, true);
  g.fillStyle(0xffffff, 1).fillPoints(pts, true);
}

/**
 * A bold arrow with a shaft (white, dark outline) centered on cx, cy, pointing at screen angle `ang`.
 * (A plain triangle turned to the map's shallow diagonals just reads as up / down.)
 */
export function drawAngledArrow(g, cx, cy, size, ang) {
  const L = size / 2, hl = L * 0.95, hw = L * 0.8, sw = L * 0.3;
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const at = (u, v) => ({ x: cx + ux * u - uy * v, y: cy + uy * u + ux * v });
  const pts = [at(L, 0), at(L - hl, hw), at(L - hl, sw), at(-L, sw), at(-L, -sw), at(L - hl, -sw), at(L - hl, -hw)];
  g.lineStyle(4, COLORS.frame, 1).strokePoints(pts, true);
  g.fillStyle(0xffffff, 1).fillPoints(pts, true);
}

/** Bold "X" icon (white with a dark outline) centered on cx, cy. */
export function drawCross(g, cx, cy, size) {
  const s = size / 2;
  g.lineStyle(Math.max(6, size * 0.42), COLORS.frame, 1);
  g.lineBetween(cx - s, cy - s, cx + s, cy + s).lineBetween(cx - s, cy + s, cx + s, cy - s);
  g.lineStyle(Math.max(3, size * 0.24), 0xffffff, 1);
  g.lineBetween(cx - s, cy - s, cx + s, cy + s).lineBetween(cx - s, cy + s, cx + s, cy - s);
}

/**
 * An eye (v0.7, "view this player's village"): a white eye with a blue iris and a glint, on a dark outline.
 */
export function drawEye(g, cx, cy, size) {
  const w = size, h = size * 0.6;
  g.fillStyle(COLORS.frame, 1).fillEllipse(cx, cy, w + 6, h + 6);
  g.fillStyle(0xffffff, 1).fillEllipse(cx, cy, w, h);
  const r = h * 0.44;
  g.fillStyle(COLORS.frame, 1).fillCircle(cx, cy, r + 2);
  g.fillStyle(0x3d8bdc, 1).fillCircle(cx, cy, r);
  g.fillStyle(0x0f1720, 1).fillCircle(cx, cy, r * 0.48);
  g.fillStyle(0xffffff, 1).fillCircle(cx - r * 0.3, cy - r * 0.32, Math.max(1.5, r * 0.22));
}

/**
 * Full screen icon: four corner brackets pointing out (or in, when `exit`), white on a dark outline.
 */
export function drawFullscreenIcon(g, cx, cy, size, exit = false) {
  const s = size / 2, arm = size * 0.36;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [w, color] of [[Math.max(6, size * 0.3), COLORS.frame], [Math.max(3, size * 0.16), 0xffffff]]) {
    g.lineStyle(w, color, 1);
    for (const [dx, dy] of corners) {
      // The bracket's corner sits at the box corner (enter) or pulled in toward the middle (exit).
      const x = cx + dx * (exit ? s * 0.3 : s), y = cy + dy * (exit ? s * 0.3 : s);
      const ax = exit ? dx * arm : -dx * arm, ay = exit ? dy * arm : -dy * arm;
      g.beginPath().moveTo(x + ax, y).lineTo(x, y).lineTo(x, y + ay).strokePath();
    }
  }
}

// ---------- fitting things into a box (these set the object's scale) ----------
/** Shrink a text (or any object with a width) to at most maxW px wide; one that fits keeps its scale. */
export function fitWidth(obj, maxW) {
  if (obj.width > maxW) obj.setScale(maxW / obj.width);
  return obj;
}

/** Scale an image to fit a w x h box (square by default), keeping its proportions (art isn't all square). */
export function fitIcon(img, w, h = w) {
  return img.setScale(Math.min(w / img.frame.width, h / img.frame.height));
}

// Hero portraits: the head (crown included) out of the standing picture, in its pixels. The Brisket King's
// (hero_brisket) on a gold chip, the Hatsune Queen's (hero_queen, v0.8) on a teal one.
const HERO_FACES = {
  brisket: { key: 'hero_brisket', x: 44, y: 0, w: 100, h: 96, chip: 0xe0a82e, back: 0x3a2412 },
  queen: { key: 'hero_queen', x: 61, y: 0, w: 70, h: 64, chip: 0x2fc7c0, back: 0x123a3a },
  mage: { key: 'bld_mageAltar_lv1', x: 150, y: 48, w: 76, h: 70, chip: 0x9b4dff, back: 0x2a1240 } // (his face on his Level 1 statue, v0.12)
};

/** Which hero an altar type holds ('brisket' for 'altar', 'queen' for 'queenAltar', 'mage' for 'mageAltar'). */
export const heroKindOf = (type) => (type === 'queenAltar' ? 'queen' : type === 'mageAltar' ? 'mage' : 'brisket');

/**
 * A hero's badge, shown wherever its altar is (shop card and info, How to Play, building info, RV Lab list): a
 * glossy chip with the hero's portrait, centered on (x, y), `size` px square. `kind`: 'brisket' (default) or
 * 'queen'. Returns a container (empty if the art isn't loaded) for the caller to add to its layer.
 */
export function addHeroBadge(scene, x, y, size = 40, kind = 'brisket') {
  const c = scene.add.container(x, y);
  const f = HERO_FACES[kind] || HERO_FACES.brisket;
  if (!scene.textures.exists(f.key)) return c;
  const g = scene.add.graphics();
  drawGlossy(g, -size / 2, -size / 2, size, size, f.chip, { radius: Math.round(size * 0.28), lip: 3 });
  g.fillStyle(f.back, 1).fillRoundedRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 11, Math.round(size * 0.2));
  const img = scene.add.image(0, 0, f.key).setOrigin(0, 0);
  const inner = size - 10;
  const scale = Math.min(inner / f.w, inner / f.h);
  img.setCrop(f.x, f.y, f.w, f.h).setScale(scale);
  img.setPosition(-(f.x + f.w / 2) * scale, -(f.y + f.h / 2) * scale - 2);
  c.add([g, img]);
  return c;
}
