// HUD layout math (pure, no Phaser): rectangle overlap checks, fitting a box into a free span, lifting a box
// clear of others, and the fixed geometry of the top row. UIScene places its HUD with these, and
// tests/hudLayout.test.js checks that the fixed pieces never overlap.
//
// The game always lays out at 1280 x 720 (Phaser.Scale.FIT scales the whole canvas to the window), so these
// coordinates hold at every window size; a small window just draws everything smaller.
//
// rect = { x, y, w, h } (top-left corner, screen px)

export const SCREEN = { w: 1280, h: 720 };

/** Do rects a and b overlap (closer than `pad` px counts as overlapping)? Touching edges don't overlap. */
export function rectsOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  return a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
}

/** Every overlapping pair in { name: rect } (null / undefined rects skipped): ['a/b', ...]. */
export function findOverlaps(rects, pad = 0) {
  const names = Object.keys(rects).filter((k) => rects[k]);
  const out = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      if (rectsOverlap(rects[names[i]], rects[names[j]], pad)) out.push(`${names[i]}/${names[j]}`);
    }
  }
  return out;
}

/** The smallest rect holding all of them (nulls skipped), or null. */
export function unionRect(...rects) {
  const list = rects.filter(Boolean);
  if (!list.length) return null;
  const x = Math.min(...list.map((r) => r.x)), y = Math.min(...list.map((r) => r.y));
  return { x, y, w: Math.max(...list.map((r) => r.x + r.w)) - x, h: Math.max(...list.map((r) => r.y + r.h)) - y };
}

/** Is rect r entirely inside area? */
export function rectInside(r, area) {
  return r.x >= area.x && r.y >= area.y && r.x + r.w <= area.x + area.w && r.y + r.h <= area.y + area.h;
}

/** Move rect r (keeping its size) the least distance that puts it inside area (or centered, when it's bigger). */
export function clampRectInto(r, area) {
  const axis = (p, s, lo, size) => (s >= size ? lo + (size - s) / 2 : Math.max(lo, Math.min(lo + size - s, p)));
  return { ...r, x: axis(r.x, r.w, area.x, area.w), y: axis(r.y, r.h, area.y, area.h) };
}

/**
 * A box `w` wide wants to be centred on `cx`, inside the free span [lo, hi]: returns { left, w, scale } where
 * w is shrunk to the span if needed (scale = how much the content must shrink) and left keeps it inside.
 */
export function fitInSpan(lo, hi, w, cx) {
  const width = Math.max(0, Math.min(w, hi - lo));
  const left = Math.max(lo, Math.min(hi - width, cx - width / 2));
  return { left, w: width, scale: w > 0 ? width / w : 1 };
}

/**
 * Lift rect r straight up until it overlaps none of `obstacles` (with `gap` px between): each obstacle it
 * overlaps pushes it to just above that obstacle, repeated until it's clear. Returns the new y.
 */
export function liftClear(r, obstacles, gap = 8) {
  let y = r.y;
  const list = obstacles.filter(Boolean);
  for (let guard = 0; guard < 10; guard++) {
    const hit = list.find((o) => rectsOverlap({ ...r, y }, o, gap - 0.001));
    if (!hit) break;
    y = hit.y - gap - r.h;
  }
  return y;
}

// ---------- the top row ----------
// Profile (left), the wave pill + Start Wave / Cancel (left of center), the RP bar, the gold bar (right),
// with the day/night pill directly under the gold bar. Every piece is centered on TOP_ROW_CY.
export const TOP_ROW_CY = 40;
export const topRowY = (h) => TOP_ROW_CY - h / 2;
export const BAR_H = 36;
export const BAR_ICON_R = Math.round(BAR_H * 1.75) / 2; // ResourceBar: the icon is 1.75 x the bar height
export const GOLD_BAR = { x: SCREEN.w - 18 - 32 - 270, y: topRowY(BAR_H), w: 270, h: BAR_H };
export const RP_BAR = { x: GOLD_BAR.x - 16 - 32 - 190, y: topRowY(BAR_H), w: 190, h: BAR_H };
/** Right edge of a bar's icon (it overhangs the bar's right end). */
export const barRight = (bar) => bar.x + bar.w + BAR_ICON_R;
/** What a resource bar covers on screen, "Max" label above and icon included (as ResourceBar.bounds()). */
export const barRect = (bar) => ({ x: bar.x - 4, y: bar.y - 22, w: bar.w + BAR_ICON_R + 8, h: Math.max(bar.h + 26, BAR_ICON_R * 2 + 4) });
export const PROFILE = { x: 14, h: 50, maxTextW: 170 }; // a long username shrinks to maxTextW
export const WAVE_CX = 484;              // where the wave pill + buttons would like to be centered
export const ROW_GAP = 12;               // space kept between neighbours in the top row
/** The day/night pill: right-aligned under the gold bar's icon, clear of the bar's icon. */
export const CLOCK = { right: barRight(GOLD_BAR), cy: TOP_ROW_CY + BAR_ICON_R + 4 + 14, h: 28 };
export const clockRect = (w) => ({ x: CLOCK.right - w, y: CLOCK.cy - CLOCK.h / 2, w, h: CLOCK.h });
/**
 * The wave pill's text: the first variant (longest first) whose pill (text + pad) fits beside the buttons
 * (`buttonsW`, gaps included) in `avail` px; else the last (shortest) one shrunk to fit, not below minScale.
 * Returns { index, scale, pillW, overflow } (overflow > 0: px the group is still too wide by).
 */
export function fitPill(avail, textWidths, buttonsW, pad = 48, minScale = 0.55) {
  for (let i = 0; i < textWidths.length; i++) {
    if (textWidths[i] + pad + buttonsW <= avail) return { index: i, scale: 1, pillW: textWidths[i] + pad, overflow: 0 };
  }
  const index = textWidths.length - 1, tw = textWidths[index];
  const scale = tw > 0 ? Math.max(minScale, Math.min(1, (avail - buttonsW - pad) / tw)) : 1;
  const pillW = tw * scale + pad;
  return { index, scale, pillW, overflow: Math.max(0, pillW + buttonsW - avail) };
}

/** Free span for the wave group: right of the profile pill (if any), left of the RP bar. */
export function waveSpan(profileRight = 0) {
  return { lo: Math.max(16, profileRight + ROW_GAP), hi: barRect(RP_BAR).x - ROW_GAP };
}

// ---------- the shop's category tabs ----------
// The shop panel (UIScene, 1100 wide) has its "Build" title on the left, then the tab buttons, then the page arrows
// (left edge at SHOP_ARROWS_LEFT) and the close button. Tabs share the span between the title and the arrows: as wide
// as SHOP_TAB.maxW, narrower when more tabs need the room (v0.14: five, with Heroes), so they never run into the arrows.
export const SHOP_TAB = { x0: 150, maxW: 150, minW: 100, gap: 12, h: 40 };
export const SHOP_ARROWS_LEFT = 862; // the "previous page" arrow: 884 - 44 / 2
/** Each tab's { x (left), w } for `n` tabs, left to right, ending at least ROW_GAP before the page arrows. */
export function shopTabLayout(n) {
  const span = SHOP_ARROWS_LEFT - ROW_GAP - SHOP_TAB.x0;
  const w = Math.max(SHOP_TAB.minW, Math.min(SHOP_TAB.maxW, Math.floor((span - SHOP_TAB.gap * (n - 1)) / Math.max(1, n))));
  return Array.from({ length: n }, (_, i) => ({ x: SHOP_TAB.x0 + i * (w + SHOP_TAB.gap), w }));
}
