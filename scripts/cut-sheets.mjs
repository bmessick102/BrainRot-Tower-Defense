// Cuts 3-frame storage sprite sheets into the fill pictures the game uses. Run with: node scripts/cut-sheets.mjs
// (then npm run prepare-art).
//
// A sheet is three equal frames side by side: left = lowest fill, middle = half, right = fullest. Each becomes
// art-source/buildings/bld_<type>_lv<N>_fill1 / _fill2 / _fill3.png, plus the plain bld_<type>_lv<N>.png (the full one,
// for the shop and info panel), the same scheme the Bitcoin Storage uses (BuildingView picks _fill1-3 by how full the
// village is). Every picture lands on one shared canvas so prepare-art can crop them all with one box (`trim: 'group'`):
//   - the three frames of a level are lined up on their base: the same bottom row, and the middle of their lowest rows
//     (the plinth, which doesn't change with the fill) on the canvas's center line, so switching fills never jumps;
//   - each level is scaled to its own height (`heights`, growing level by level), so a higher level stands taller.
// Nothing is clipped: the script stops if a frame's art touches its frame edge (it would run into the next frame) or
// doesn't fit the canvas.
//
// Sheets are read from the project root, where the art drops land (they aren't committed; the cut pictures are).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'art-source', 'buildings');

// Shake Storage, eight pictures (one per two levels), each sheet 2172 x 724 (three 724 x 724 frames).
const JOBS = [
  {
    type: 'shakeStorage',
    canvas: { w: 740, h: 740, bottom: 726 }, // bottom: the row the art stands on
    // Visible height of each picture on the canvas (level 1 first): every one ~3.5% taller than the one before.
    heights: [600, 622, 644, 666, 688, 710, 714, 720],
    sheets: [
      'Shake Storage L1 Spritesheet.png',
      'Shake Storage L3 Spritesheet.png',
      'Shake Storage L3 Spritesheet.png',
      'Shake Storage Level 4 Spritesheat.png',
      'Shake Storage L5 Spritesheet.png',
      'Shake Storage L6 Spritesheet.png',
      'Shake Storage L7 spritesheet image.png',
      'Shake Storage L8 spritesheet image.png'
    ]
  }
];

const ALPHA = 40;      // a pixel counts as art from this alpha up (as prepare-art's trim)
const BASE_BAND = 0.1; // the lowest 10% of a frame's art rows: its plinth, used to line the fills up

/** Visible box of one frame of a raw RGBA sheet, and the middle of its lowest rows (the base). */
function measure(data, W, x0f, fw, H) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, edge = 0;
  for (let y = 0; y < H; y++) for (let x = x0f; x < x0f + fw; x++) {
    if (data[(y * W + x) * 4 + 3] < ALPHA) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (x === x0f || x === x0f + fw - 1 || y === 0 || y === H - 1) edge++;
  }
  if (x1 < 0) throw new Error('empty frame');
  const bandTop = Math.round(y1 - (y1 - y0) * BASE_BAND);
  let bx0 = Infinity, bx1 = -1;
  for (let y = bandTop; y <= y1; y++) for (let x = x0f; x < x0f + fw; x++) {
    if (data[(y * W + x) * 4 + 3] < ALPHA) continue;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
  }
  return { x0: x0 - x0f, x1: x1 - x0f, y0, y1, baseMid: (bx0 + bx1) / 2 - x0f, edge };
}

let wrote = 0;
for (const job of JOBS) {
  for (const [i, file] of job.sheets.entries()) {
    const level = i + 1;
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) { console.warn(`  skip   ${file} (not in the project root)`); continue; }
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, fw = Math.floor(W / 3);
    if (W !== fw * 3) console.warn(`  WARN   ${file}: ${W} px wide doesn't split into 3 equal frames (using ${fw})`);
    const frames = [0, 1, 2].map((k) => ({ k, ...measure(data, W, k * fw, fw, H) }));
    for (const f of frames) if (f.edge) throw new Error(`${file} frame ${f.k + 1}: art touches the frame edge (${f.edge} px): it would be clipped`);
    // One scale for the level (its tallest frame to the level's height), so the three fills stay the same size.
    const tallest = Math.max(...frames.map((f) => f.y1 - f.y0 + 1));
    const scale = job.heights[i] / tallest;
    const { w: CW, h: CH, bottom } = job.canvas;
    // Line the fills up on their base (each frame shifted so its base middle lands where the full frame's does), then
    // center the level's art as a whole (its box across all three fills) on the canvas: art with a tap or spikes on
    // one side stays centered the way prepare-art centers every building, and the three fills never jump.
    const ref = frames[2];
    const shift = (f) => ref.baseMid - f.baseMid;
    const artL = Math.min(...frames.map((f) => f.x0 + shift(f))), artR = Math.max(...frames.map((f) => f.x1 + 1 + shift(f)));
    const mid = (artL + artR) / 2; // in frame pixels, the full frame's coordinates
    for (const f of frames) {
      const fwS = Math.round(fw * scale), fhS = Math.round(H * scale);
      const frame = await sharp(src).extract({ left: f.k * fw, top: 0, width: fw, height: H })
        .resize(fwS, fhS, { kernel: 'lanczos3' }).png().toBuffer();
      // The level's middle on the canvas center line, each frame's lowest art row on `bottom`.
      const left = Math.round(CW / 2 + (shift(f) - mid) * scale), top = Math.round(bottom - (f.y1 + 1) * scale);
      const box = { l: left + f.x0 * scale, r: left + (f.x1 + 1) * scale, t: top + f.y0 * scale };
      if (box.l < 0 || box.r > CW || box.t < 0) throw new Error(`${file} frame ${f.k + 1}: doesn't fit the ${CW} x ${CH} canvas`);
      // The frame's transparent margin may hang past the canvas: crop it to what lands inside.
      const cl = Math.max(0, -left), ct = Math.max(0, -top);
      const cw = Math.min(fwS - cl, CW - Math.max(0, left)), ch = Math.min(fhS - ct, CH - Math.max(0, top));
      const piece = await sharp(frame).extract({ left: cl, top: ct, width: cw, height: ch }).toBuffer();
      const out = await sharp({ create: { width: CW, height: CH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).png().toBuffer();
      const names = [`bld_${job.type}_lv${level}_fill${f.k + 1}.png`, ...(f.k === 2 ? [`bld_${job.type}_lv${level}.png`] : [])];
      for (const n of names) { fs.writeFileSync(path.join(OUT, n), out); wrote++; }
      console.log(`  ok     ${job.type} lv${level} fill${f.k + 1}  art ${Math.round(box.r - box.l)} x ${Math.round(bottom - box.t)} px, x ${Math.round(box.l)}-${Math.round(box.r)}, base row ${bottom}`);
    }
  }
}
console.log(`\n${wrote} pictures written to art-source/buildings. Run npm run prepare-art next.`);
