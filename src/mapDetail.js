// Full-detail map pieces (v0.9.3). The game's map pictures are 2672 px wide (one texture per time of day, all in
// graphics memory together for the crossfades, and phones can't hold more); the user's paintings are 6680 x 3768. So
// scripts/prepare-art.mjs also cuts each full-size painting into MAP_DETAIL.cols x MAP_DETAIL.rows pieces
// (public/assets/map-detail/<key>_<col>_<row>.webp, each with BLEED extra pixels on its inner sides so neighbours
// overlap and no seam shows). They aren't in the asset manifest: nothing loads them up front, and phones never do.
// src/objects/MapDetail.js loads the pieces in view when the camera is zoomed in past what the 2672 px picture can show
// sharply (desktop, High graphics), and lets them go again.

export const MAP_DETAIL = {
  cols: 4,
  rows: 2,
  sourceWidth: 6680,
  sourceHeight: 3768,
  bleed: 2,
  dir: 'assets/map-detail'
};

/** One piece's rectangle in source pixels, bleed included: { x, y, w, h }. */
export function detailPieceRect(col, row, d = MAP_DETAIL) {
  const cw = d.sourceWidth / d.cols, ch = d.sourceHeight / d.rows;
  const x0 = Math.max(0, Math.round(col * cw) - (col > 0 ? d.bleed : 0));
  const y0 = Math.max(0, Math.round(row * ch) - (row > 0 ? d.bleed : 0));
  const x1 = Math.min(d.sourceWidth, Math.round((col + 1) * cw) + (col < d.cols - 1 ? d.bleed : 0));
  const y1 = Math.min(d.sourceHeight, Math.round((row + 1) * ch) + (row < d.rows - 1 ? d.bleed : 0));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A piece's file name (no folder): game_map_grid_night_2_1.webp. */
export const detailPieceFile = (key, col, row) => `${key}_${col}_${row}.webp`;

/** Every piece of one map: [{ col, row, file, rect }]. */
export function detailPieces(key, d = MAP_DETAIL) {
  const out = [];
  for (let row = 0; row < d.rows; row++) for (let col = 0; col < d.cols; col++) out.push({ col, row, file: detailPieceFile(key, col, row), rect: detailPieceRect(col, row, d) });
  return out;
}
