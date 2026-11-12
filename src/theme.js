// UI colors and text styles (presentation only; no gameplay numbers here).
// Look: chunky mobile-strategy UI. Light stone windows with a dark frame and a slate header,
// glossy beveled buttons, blue "available" / grey "locked" shop cards, white text with a heavy black outline.

/** Display face (bundled in public/assets/fonts, loaded by BootScene). Falls back to heavy system fonts. */
export const FONT_FAMILY = 'Lilita One';
export const FONT = `"${FONT_FAMILY}", "Arial Black", "Segoe UI Black", sans-serif`;
/** Plain readable face for paragraphs on light panels. */
export const BODY_FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

export const COLORS = {
  // Windows
  frame: 0x1b1712,       // dark outline around windows, buttons, cards
  body: 0xefe9dc,        // light stone window body
  bodyShade: 0xdcd4c3,   // lower half of the body
  header: 0x3b434c,      // slate header band
  headerLight: 0x4d5762,
  tray: 0xcfc6b3,        // recessed area behind shop cards
  footer: 0x76bd38,      // green resource strip
  footerDark: 0x4f8f1f,
  hudPill: 0x000000,     // translucent HUD pills (wave status, hints)

  // Shop cards
  cardTop: 0x9be2ff, cardBottom: 0x2a8cd4, cardEdge: 0x0f3a5c,
  lockedTop: 0xdedede, lockedBottom: 0x8d8d8d, lockedEdge: 0x3a3a3a,
  priceStrip: 0x14202a,

  // Buttons
  button: 0xf2a227,      // orange (default)
  buttonGood: 0x6cbf2c,  // green
  buttonDanger: 0xe2442f,// red
  buttonBlue: 0x3d8fe0,
  buttonDark: 0x4a5159,  // unselected tabs
  buttonDisabled: 0x9a958c,
  badge: 0xe8322a,

  // Kept for the map and older callers
  panel: 0x1b1712,
  panelEdge: 0xffd84a,   // selection outline on the map
  panelInner: 0xdcd4c3,
  buttonHover: 0xffb83d,

  // Outlined text (on dark or busy backgrounds)
  text: '#ffffff',
  textDim: '#d9d4c8',
  textGold: '#ffd84a',
  textBad: '#ff6b5b',
  textGood: '#9bf07a',

  // Plain text on the light window body
  ink: '#3a2e22',
  inkDim: '#7a6a55',
  inkGood: '#3f8a17',
  inkBad: '#c0392b',
  inkAccent: '#b8640a',

  valid: 0x5ee05e,
  invalid: 0xff4d4d
};

/** Chunky white display text with a heavy black outline and a drop shadow. */
export function textStyle(size = 18, color = COLORS.text, extra = {}) {
  return {
    fontFamily: FONT,
    fontSize: `${size}px`,
    color,
    stroke: '#000000',
    strokeThickness: Math.max(2, Math.round(size / 5.5)),
    shadow: { offsetX: 0, offsetY: Math.max(1, Math.round(size / 12)), color: 'rgba(0,0,0,0.65)', blur: 0, stroke: true, fill: true },
    ...extra
  };
}

/** Plain dark text for paragraphs and stat labels on the light window body. */
export function bodyStyle(size = 15, color = COLORS.ink, extra = {}) {
  return { fontFamily: BODY_FONT, fontSize: `${size}px`, fontStyle: 'bold', color, ...extra };
}

/** Multiply a 0xRRGGBB color's channels by f (f < 1 darkens, f > 1 lightens, clamped). */
export function shade(hex, f) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c((hex >> 16) & 255) << 16) | (c((hex >> 8) & 255) << 8) | c(hex & 255);
}

/** Linear blend between two 0xRRGGBB colors (t = 0 gives a, 1 gives b). */
export function mix(a, b, t) {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
