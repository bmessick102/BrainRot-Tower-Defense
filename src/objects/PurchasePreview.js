// Shared layout for the "confirm a purchase" windows (Upgrade, Village Hall upgrade, Merge), in the look of the
// mobile-strategy upgrade dialog: the building's name over its picture standing on a grass tile, a yellow tag at the
// picture's foot ("Level 5 -> 6"), stat bars with an icon each on the right ("Damage: 116 +29" written on the bar),
// a list of plain facts under them (Range, Damage type, Targets), and the price button at the bottom. When something
// is missing (a Village Hall level, gold, a merge partner) the bottom becomes a red "Note!" band beside a grey button.
// Every function draws into a Modal (m.add) at coordinates relative to the window's top-left corner. The building
// info panel (UIScene, v0.15.4) draws with the same functions into its own container, through an { x, y, add } stand-in
// for the Modal, so the two look the same: drawShowcaseTile, drawStatBars and drawFacts take its sizes as options.
import { Button } from './Button.js';
import { fitIcon, fitWidth, fillGradientRounded } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle, mix } from '../theme.js';
import { TEX, statIconKey } from '../assetKeys.js';

export const PREVIEW_W = 980, PREVIEW_H = 650;
const LEFT = { x: 30, w: 300 };
const RIGHT_X = 370;
export const FOOTER_H = 92;
const BAR_STEP = 54, BAR_H = 30;
const FACT_H = 34;
const GREEN = 0x5fbf22, GREEN_GAIN = mix(0x5fbf22, 0xffffff, 0.55);
const FACT_LABEL = '#2d5f9a';
// The grass tile picture (art-source/ui/ui_showcase_tile.png), measured on the trimmed art: the center of its top face
// (share of width / height), the top face's width (share of the picture's), and the flattening to the 2:1 ground.
const TILE_TOP = { x: 0.497, y: 0.47 }, TILE_FACE_W = 0.968, TILE_FLATTEN = 0.82;
const NAME_CLEAR = 112; // a picture's top stays below this (from the window's top): under the name
const TILE_HW = 138;    // the window's grass tile: half its width (other sizes scale everything on it by hw / TILE_HW)
const GREEN_LOST = 0x2f6a12; // a damaged building's lost health on its bar (the info panel, v0.15.4)

const fmtNumber = (n) => Number(Number(n).toFixed(2)).toLocaleString('en-US');

/**
 * The building picture standing on the grass tile (with a soft light behind it), the tile's top face centered on
 * (cx, tileY) and `hw` half as wide (the window's TILE_HW; the info panel's is smaller and everything scales with it).
 * `picture`: { key, tint, footing (BuildingView.showcaseFooting: a hero's altar, stood on the tile like in the village) };
 * `box`: the [width, height] other pictures are fitted to; `topY`: no picture rises above it. Draws into `g` and
 * m.add; returns the picture image.
 */
export function drawShowcaseTile(scene, m, g, { cx, tileY, hw = TILE_HW, picture, box = [260, 186], topY = -Infinity }) {
  const k = hw / TILE_HW;
  // Light behind the building.
  g.fillStyle(0xffffff, 0.22).fillEllipse(cx, tileY - 60 * k, 290 * k, 180 * k);
  g.fillStyle(0xffffff, 0.22).fillEllipse(cx, tileY - 50 * k, 200 * k, 120 * k);
  // The grass tile: a shadow, then the tile picture (TEX.showcaseTile), or a drawn one (darker sides, then the top).
  const hh = hw / 2 + 1, side = 12 * k;
  const hasTile = scene.textures.exists(TEX.showcaseTile);
  g.fillStyle(0x000000, 0.18).fillEllipse(cx, tileY + (hasTile ? hh + 14 * k : hh + 2 * k), hw * 1.7, 26 * k); // (under the picture's soil sides)
  if (hasTile) {
    // The tile picture's top face is centered at TILE_TOP of the trimmed picture and spans TILE_FACE_W of its width;
    // it's a little steeper (about 1.6:1) than the game's 2:1 ground, so it's flattened to match the buildings.
    const tile = m.add(scene.add.image(cx, tileY, TEX.showcaseTile));
    const s = (hw * 2) / (tile.frame.width * TILE_FACE_W);
    tile.setOrigin(TILE_TOP.x, TILE_TOP.y).setScale(s, s * TILE_FLATTEN);
  } else {
    const top = [{ x: cx, y: tileY - hh }, { x: cx + hw, y: tileY }, { x: cx, y: tileY + hh }, { x: cx - hw, y: tileY }];
    g.fillStyle(0x4d8a22, 1).fillPoints([{ x: cx - hw, y: tileY }, { x: cx, y: tileY + hh }, { x: cx + hw, y: tileY },
      { x: cx + hw, y: tileY + side }, { x: cx, y: tileY + hh + side }, { x: cx - hw, y: tileY + side }], true);
    g.fillStyle(0x7cc13a, 1).fillPoints(top, true);
    g.fillStyle(0x93d44c, 1).fillPoints([{ x: cx, y: tileY - hh + 8 * k }, { x: cx + hw - 16 * k, y: tileY }, { x: cx, y: tileY + hh - 8 * k }, { x: cx - hw + 16 * k, y: tileY }], true);
    g.lineStyle(2, 0x3d6f1a, 1).strokePoints(top, true);
  }
  const image = m.add(scene.add.image(cx, tileY + 30 * k, picture.key).setOrigin(0.5, 1));
  if (picture.footing) {
    // A hero's altar (v0.15.4): its ground point on the tile's center and its width the village's share of the tile,
    // never taller than the room under topY. (Fitted to the box and stood on its bottom edge, an altar, whose pad
    // meets the ground 21-45% up its picture, was drawn too big and stood behind the tile's center.)
    const { ground, width } = picture.footing, f = image.frame;
    const s = Math.min((hw * 2 * width) / f.width, (tileY - topY) / (f.height * (1 - ground)));
    image.setScale(s).setPosition(cx, tileY + f.height * s * ground);
  } else {
    fitIcon(image, box[0], box[1]);
    if (image.y - image.displayHeight < topY) fitIcon(image, box[0], image.y - topY);
  }
  if (picture.tint) image.setTint(picture.tint);
  return image;
}

/**
 * The left column: the name, the picture on a grass tile (with a soft light behind it) and the yellow tag.
 * `picture`: { key, tint, badge (texture key drawn top-right), footing (BuildingView.showcaseFooting: a hero's altar,
 * stood on the tile like in the village) }; `tag`: { small, big }. Returns the picture image.
 */
export function drawShowcase(scene, m, g, { name, picture, tag }) {
  const cx = m.x + LEFT.x + LEFT.w / 2, tileY = m.y + 276;
  const image = drawShowcaseTile(scene, m, g, { cx, tileY, picture, topY: m.y + NAME_CLEAR });
  // The name after the picture, so a tall building never covers it.
  fitWidth(m.add(scene.add.text(cx, m.y + 92, name, textStyle(28)).setOrigin(0.5)), LEFT.w);
  if (picture.badge && scene.textures.exists(picture.badge)) m.add(fitIcon(scene.add.image(cx + 122, m.y + 138, picture.badge), 40));
  // The yellow tag over the tile's lower-left edge: its own graphics, added after the tile so the tile stays behind it.
  const tx = m.x + LEFT.x - 2, ty = m.y + 330, tw = 190, th = 70;
  const tg = m.add(scene.add.graphics());
  tg.fillStyle(0x000000, 0.25).fillRoundedRect(tx + 2, ty + 4, tw, th, 12);
  tg.fillStyle(0xc99a2c, 1).fillRoundedRect(tx, ty, tw, th, 12);
  fillGradientRounded(tg, tx + 2, ty + 2, tw - 4, th - 4, 10, 0xffeaa0, 0xf6cd57);
  m.add(scene.add.text(tx + tw / 2, ty + 18, tag.small, bodyStyle(15, '#5b4520', { fontStyle: 'bold' })).setOrigin(0.5));
  fitWidth(m.add(scene.add.text(tx + tw / 2, ty + 45, tag.big, textStyle(27)).setOrigin(0.5)), tw - 16);
  return image;
}

/**
 * A small icon for a stat bar, centered on (x, y). `icon` is a stat kind (the ui_stat_<kind> picture: see statIconKey),
 * coin / shake, or any texture key. Without the picture, hp / damage / range / time are drawn into `g` and every other
 * kind gets a drawn star.
 */
function statIcon(scene, m, g, icon, x, y) {
  const textures = { coin: TEX.coin, shake: TEX.researchPoint };
  const key = [textures[icon], statIconKey(icon), icon].find((k) => k && scene.textures.exists(k));
  if (key) { m.add(fitIcon(scene.add.image(x, y, key), 38)); return; }
  g.lineStyle(2.5, COLORS.frame, 1);
  if (icon === 'hp') {
    g.fillStyle(0xe2454f, 1).fillCircle(x - 8, y - 4, 10).fillCircle(x + 8, y - 4, 10).fillTriangle(x - 17, y, x + 17, y, x, y + 17);
    g.fillStyle(0xffffff, 0.45).fillCircle(x - 10, y - 7, 3.5);
  } else if (icon === 'damage') {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const r = i % 2 ? 9 : 19, a = (i / 16) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    g.fillStyle(0xffb020, 1).fillPoints(pts, true).strokePoints(pts, true);
    g.fillStyle(0xfff3a0, 1).fillCircle(x, y, 7);
  } else if (icon === 'range') {
    g.fillStyle(0x58c6ff, 0.35).fillCircle(x, y, 17).strokeCircle(x, y, 17);
    g.fillStyle(0xffffff, 1).fillCircle(x, y, 7).strokeCircle(x, y, 7);
  } else if (icon === 'time') {
    g.fillStyle(0xffffff, 1).fillCircle(x, y, 16).strokeCircle(x, y, 16);
    g.lineStyle(3, COLORS.frame, 1).lineBetween(x, y, x, y - 10).lineBetween(x, y, x + 8, y + 3);
  } else {
    // 'star', and the kinds with no drawn stand-in.
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 8 : 18, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
    }
    g.fillStyle(0xffd84a, 1).fillPoints(pts, true).strokePoints(pts, true);
  }
}

/**
 * Stat bars in the right column, from the top. rows: [{ label, icon, value, next, max, unit, fmt, current }]: the bar is
 * filled to `value` with the gain to `next` lighter, out of `max`; a row with next == null shows the value alone. A row
 * with `current` (a damaged building's health, the info panel) reads "current / value" and shows what's lost darker.
 * `width` overrides the column's width, `step` the distance between bars and `font` the text size on them (text too
 * long for its bar is shrunk to fit). Returns the y under the last bar.
 */
export function drawStatBars(scene, m, g, rows, { y = 92, x = RIGHT_X, width = PREVIEW_W - RIGHT_X - 34, step = BAR_STEP, font = 16 } = {}) {
  let top = m.y + y;
  for (const row of rows) {
    const fmt = row.fmt || fmtNumber, unit = row.unit || '';
    const next = row.next ?? row.value;
    const live = row.current !== undefined && row.current !== null;
    statIcon(scene, m, g, row.icon, m.x + x + 20, top + BAR_H / 2 + 2);
    const bx = m.x + x + 50, bw = width - 50;
    const scale = Math.max(row.max || 0, row.value, next) || 1;
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(bx, top, bw, BAR_H, 9);
    g.fillStyle(0x3a332a, 1).fillRoundedRect(bx + 3, top + 3, bw - 6, BAR_H - 6, 7);
    const fill = (share, color) => {
      if (share <= 0) return;
      g.fillStyle(color, 1).fillRoundedRect(bx + 3, top + 3, Math.max(14, (bw - 6) * Math.min(1, share)), BAR_H - 6, 7);
    };
    fill(Math.max(row.value, next) / scale, GREEN_GAIN);
    if (live) {
      fill(Math.min(row.value, next) / scale, GREEN_LOST);
      fill(Math.max(0, Math.min(row.current, row.value)) / scale, GREEN);
    } else fill(Math.min(row.value, next) / scale, GREEN);
    g.fillStyle(0xffffff, 0.28).fillRect(bx + 8, top + 5, bw - 16, 3);
    const shown = live ? `${fmt(row.current)} / ${fmt(row.value)}` : `${fmt(row.value)}${unit}`;
    const text = m.add(scene.add.text(bx + 10, top + BAR_H / 2, `${row.label}: ${shown}`, textStyle(font)).setOrigin(0, 0.5));
    const delta = Math.round((next - row.value) * 1000) / 1000; // 3.3 - 3.2 is 0.0999...96 in floating point
    let gain = null;
    if (Math.abs(delta) > 1e-9) {
      const sign = delta > 0 ? '+' : '-';
      gain = m.add(scene.add.text(text.x + text.width + 4, top + BAR_H / 2, `${sign}${fmt(Math.abs(delta))}${unit}`,
        textStyle(font, delta > 0 ? COLORS.textGood : COLORS.textBad)).setOrigin(0, 0.5));
    }
    // Too long for its bar (the narrower info panel): the text and its gain shrink together.
    const room = bw - 20, need = text.width + (gain ? 4 + gain.width : 0);
    if (need > room) {
      const k = room / need;
      text.setScale(k);
      if (gain) gain.setScale(k).setX(text.x + text.displayWidth + 4 * k);
    }
    top += step;
  }
  return top - m.y;
}

/**
 * Plain facts across the window, one per row with a line under it: [{ label, value, gain, ink }] ("Range:" on the left,
 * "10 tiles" on the right; `gain` in green before it; `ink` colors the value) or [{ text }] for a line of its own.
 * Options for a narrower place (the info panel): `x` and `width`, `size` (the label's and value's type; the window's
 * is 19), `rowH` (a row's height) and `wrap` (a { text } row wraps onto more lines instead of shrinking to one).
 * Returns the y under them.
 */
export function drawFacts(scene, m, g, facts, y, { x: fx = 60, width = PREVIEW_W - 120, size = 19, rowH = FACT_H, wrap = false } = {}) {
  const x = m.x + fx, w = width, k = size / 19;
  let top = m.y + y;
  for (const f of facts) {
    let h = rowH;
    const mid = top + rowH / 2;
    if (f.text && wrap) {
      const t = m.add(scene.add.text(x, top + 5 * k, f.text, bodyStyle(Math.round(18 * k), COLORS.ink, { fontStyle: 'bold', wordWrap: { width: w }, lineSpacing: 2 })));
      h = Math.max(rowH, t.height + 12 * k);
    } else if (f.text) fitWidth(m.add(scene.add.text(x, mid, f.text, bodyStyle(Math.round(18 * k), COLORS.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5)), w);
    else {
      const label = m.add(scene.add.text(x, mid, `${f.label}:`, bodyStyle(size, FACT_LABEL, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      const value = m.add(scene.add.text(x + w, mid, f.value, bodyStyle(size, f.ink || COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0.5));
      const gain = f.gain ? m.add(scene.add.text(0, mid, f.gain, bodyStyle(Math.round(17 * k), COLORS.inkGood, { fontStyle: 'bold' })).setOrigin(1, 0.5)) : null;
      // The value shrinks to stay clear of the label (and of its gain, which sits before it).
      fitWidth(value, Math.max(20, w - label.width - (gain ? gain.width + 10 * k : 0) - 30 * k));
      if (gain) gain.setX(value.x - value.displayWidth - 10 * k);
    }
    g.fillStyle(COLORS.frame, 0.16).fillRect(x, top + h - 2, w, 2);
    top += h;
  }
  return top - m.y;
}

/**
 * The bottom of the window: the price button, centered when it can be bought; otherwise grey, beside a red "Note!"
 * band that lists what's missing (`notes`, whole sentences). costs: [{ currency, amount, short }].
 * Returns the button.
 */
export function drawPurchaseFooter(scene, m, g, { costs, label = '', notes = [], onConfirm, color = COLORS.buttonGood }) {
  const top = m.y + m.h - FOOTER_H - 4, mid = top + FOOTER_H / 2;
  const blocked = notes.length > 0;
  if (blocked) {
    const x = m.x + 4, w = m.w - 8;
    g.fillStyle(0xd9412f, 1).fillRoundedRect(x, top, w, FOOTER_H, { tl: 0, tr: 0, bl: 14, br: 14 });
    g.fillStyle(0xffffff, 0.12).fillRect(x, top, w, 10);
    g.fillStyle(COLORS.frame, 1).fillRect(x, top - 2, w, 3);
  } else {
    g.fillStyle(COLORS.frame, 0.16).fillRect(m.x + 30, top - 2, m.w - 60, 2);
  }
  const bx = blocked ? m.x + 230 : m.cx;
  const button = m.add(new Button(scene, bx, mid + 2, 330, 70, '', onConfirm, { color, fontSize: 26, invalidFeedback: true }));
  button.setCosts(costs, label).setEnabled(!blocked);
  if (blocked) {
    const nx = m.x + 430, nw = m.w - 430 - 30;
    m.add(scene.add.text(nx, top + 8, 'Note!', textStyle(24)));
    const text = m.add(scene.add.text(nx, top + 40, notes.join('\n'), textStyle(16, COLORS.text, { wordWrap: { width: nw }, lineSpacing: 2 })));
    if (text.height > FOOTER_H - 44) text.setScale((FOOTER_H - 44) / text.height);
  }
  return button;
}
