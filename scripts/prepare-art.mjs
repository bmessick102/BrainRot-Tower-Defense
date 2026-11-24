// Prepares Cole's art for the game. Run with: npm run prepare-art
//
// 1. Reads full-size originals from art-source/<category>/<key>.png
// 2. Trims empty transparent margins, scales to game size, writes public/assets/images/<category>/<key>.webp
//    (WebP, high quality: about a fifth of the PNG's size; v0.6.2. The old .png beside it is removed.)
// 3. Cuts each full-size village map into full-detail pieces, public/assets/map-detail/ (v0.9.3, src/mapDetail.js: loaded
//    only when zoomed in on a desktop, so they're kept out of the manifest).
// 4. Scans public/assets/images and audio and writes src/assetManifest.js so the game only loads files that exist
//    (missing files would otherwise show 404 errors in the console).
//
// PNG decoding uses Node's built-in zlib; the WebP encoding uses the `sharp` dev dependency.
// Images without transparency are skipped (with a warning) so they never show as a solid box in game.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { MAP_DETAIL, detailPieces } from '../src/mapDetail.js';

/**
 * Write a prepared picture only if its bytes changed, and then through a temp file renamed into place, so a game open on
 * the dev server never fetches a half-written file (Phaser: "Failed to process file", e.g. the map-detail pieces while a
 * run rewrote all 32 of them) and unchanged pictures keep their files untouched.
 */
function writeIfChanged(file, buf) {
  if (fs.existsSync(file)) {
    const old = fs.readFileSync(file);
    if (old.length === buf.length && old.equals(buf)) return false;
  }
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  return true;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'art-source');
const OUT_IMAGES = path.join(ROOT, 'public', 'assets', 'images');
const OUT_AUDIO = path.join(ROOT, 'public', 'assets', 'audio');
const MANIFEST = path.join(ROOT, 'src', 'assetManifest.js');

// Output width in pixels per key pattern (`fit: 'box'`: the longer side instead). Buildings are 2x their 192/256 px in-game width so they stay sharp at 2x zoom.
const TARGETS = [
  { match: /^bld_townHall_/, width: 512, trim: true, needsAlpha: true },
  // Wall pillars (one per 2 levels): one shared crop box so every level keeps the same scale and baseline.
  { match: /^bld_wall_lv[0-9]+$/, width: 256, trim: 'group', needsAlpha: true },
  // Destroyed-wall rubble (wood for levels 1-2, stone for 3-10): flat piles, drawn about a tile wide.
  { match: /^bld_wall_rubble_/, width: 256, trim: true, needsAlpha: true },
  { match: /^bld_wall_/, width: 128, trim: true, needsAlpha: true },
  // Cannon and Catapult tiers are drawn on one shared canvas, each bulkier than the last. Cropping them all with
  // the same box (instead of each to its own edges) keeps one scale and one ground point, so the
  // upgrades really look bigger in game.
  // Cannon: each level in 4 facings (_dl/_dr/_ul/_ur, plus the plain one = down-left for the shop), one shared box
  // so it never jumps as it turns or levels up.
  { match: /^bld_cannon_lv[0-9]+(_(dl|dr|ul|ur))?$/, width: 384, trim: 'group', needsAlpha: true },
  // Storage: each picture in 3 fills (_fill1..3, by how full your gold is; the plain one = full, for the shop), one box.
  { match: /^bld_storage_lv[0-9]+(_fill[0-9])?$/, width: 384, trim: 'group', needsAlpha: true },
  // Shake Storage (v0.14): the same, 6 pictures x 3 fills, cut from the user's sheets by scripts/cut-sheets.mjs onto one canvas.
  { match: /^bld_shakeStorage_lv[0-9]+(_fill[0-9])?$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_catapult_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true },
  // Spear Thrower: 5 levels x 4 facings (_dl/_dr/_ul/_ur, plus the plain one = down-left for the shop), one shared box.
  { match: /^bld_spear_lv[0-9]+(_(dl|dr|ul|ur))?$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_house_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_flock_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_mousetrap_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_ra_lv[0-9]+$/, width: 384, trim: true, needsAlpha: true },
  { match: /^bld_mageAltar_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true }, // v0.12: the Locklair Mage (hero and pedestal in one picture), 5 pictures, one shared box
  { match: /^bld_dj_lv[0-9]+$/, width: 384, trim: true, needsAlpha: true },
  // Fuel Station: 4 levels drawn on one canvas, one shared box (so each level keeps its scale and ground point).
  { match: /^bld_fuelStation_lv[0-9]+$/, width: 384, trim: 'group', needsAlpha: true },
  // Merged defenses (v0.8, CONFIG.merges[type].art.key): one picture each (bld_archer_merged, bld_mortar_merged), drawn
  // like the max-level picture. A merged Cannon may come in the 4 facings (_dl/_dr/_ul/_ur, one shared box) or as one.
  { match: /^bld_cannon_merged(_(dl|dr|ul|ur))?$/, width: 384, trim: 'group', needsAlpha: true },
  // The Harpoon Ballista (v0.8.5): 4 facings like the Spear Thrower's, one shared box of their own.
  { match: /^bld_spear_merged_(dl|dr|ul|ur)$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_[A-Za-z]+_merged$/, width: 384, trim: true, needsAlpha: true },
  // The merged Firework Launcher aims left or right: both pictures share one box (same scale, the base doesn't jump).
  { match: /^bld_firework_merged_(left|right)$/, width: 384, trim: 'group', needsAlpha: true },
  { match: /^bld_/, width: 384, trim: true, needsAlpha: true },
  { match: /^hero_/, width: 192, trim: true, needsAlpha: true },          // the Brisket King's poses
  { match: /^enemy_babycar$/, width: 256, trim: true, needsAlpha: true }, // the Baby Car raid boss is drawn bigger
  // The fish giant's walking picture is also the biggest figure on the title screen (TitleBackdropScene), so it's
  // exported at twice the usual width to stay sharp there; in game it's scaled to the same height as before.
  { match: /^enemy_tank$/, width: 320, trim: true, needsAlpha: true },
  // v0.6 heavies, drawn bigger in game (and Brr Brr Patapim / La Vaca Saturno also stand on the title screen).
  { match: /^enemy_(patapim|vaca|lirili|bombo|grimace)(_[a-z]+)?$/, width: 256, trim: true, needsAlpha: true },
  { match: /^enemy_/, width: 160, trim: true, needsAlpha: true },
  // The gnome's working pose (busy at a building: mining, repairing, building). Wider than the standing gnome (an arm
  // out), so it's exported wider to keep the same detail; the game sizes both to the same height.
  { match: /^villager_gnome_work$/, width: 200, trim: true, needsAlpha: true },
  { match: /^villager_/, width: 128, trim: true, needsAlpha: true },
  // Ground decoration (art-source/decor): the grass tuft scattered over the field (v0.9.1, src/objects/Ground.js).
  { match: /^deco_/, width: 128, trim: true, needsAlpha: true },
  { match: /^proj_(slinger|bomb)$/, width: 48, trim: true, needsAlpha: true },
  { match: /^proj_cannon$/, width: 48, trim: true, needsAlpha: true },
  { match: /^proj_mortar$/, width: 64, trim: true, needsAlpha: true },
  // KSI Tower's bottle (tall: fit by its longer side) and La Vaca Saturno's boulder.
  { match: /^proj_ksi$/, width: 72, fit: 'box', trim: true, needsAlpha: true },
  { match: /^proj_vaca$/, width: 72, trim: true, needsAlpha: true },
  { match: /^proj_(arrow|wizard|spear)$/, width: 96, trim: true, needsAlpha: true },
  { match: /^ui_coin$/, width: 96, trim: true, needsAlpha: true },
  { match: /^ui_shake$/, width: 128, fit: 'box', trim: true, needsAlpha: true }, // v0.14: the Grimace Shake (research points, shown as Shakes; a tall cup, so fit by its height)
  { match: /^ui_research_ready$/, width: 128, trim: true, needsAlpha: true }, // book over the RV Lab: research ready
  { match: /^ui_beat_ready$/, width: 128, trim: true, needsAlpha: true },     // over DJ Babyface: Drop the Beat ready
  { match: /^ui_aegis_ready$/, width: 192, trim: true, needsAlpha: true },    // v0.12: the Locklair Mage's Arcane Aegis (AegisIcon.js draws a stand-in until it exists)
  { match: /^ui_merge_gear$/, width: 128, trim: true, needsAlpha: true },     // v0.8: the badge over merged defenses
  { match: /^ui_ability_[a-z_]+$/, width: 192, fit: 'box', trim: true, needsAlpha: true }, // v0.8.5: merged ability icons (MergeIcons.js)
  { match: /^ui_armor_shield$/, width: 64, fit: 'box', trim: true, needsAlpha: true },     // v0.8.5: the shield by an armored enemy's health bar
  { match: /^ui_feast_ready$/, width: 192, trim: true, needsAlpha: true },    // the Brisket Feast HUD button / ready icon
  { match: /^ui_encore_ready$/, width: 192, trim: true, needsAlpha: true },   // v0.8.2: the Hatsune Queen's Encore Cloak icon (a cloak)
  { match: /^ui_hero_crown$/, width: 128, trim: true, needsAlpha: true },     // the hero level crown beside his health bar
  { match: /^guide_portrait$/, width: 256, trim: true, needsAlpha: true },
  { match: /^ui_(shop|settings|edit_layout)_button$/, width: 160, trim: true, needsAlpha: true },
  { match: /^ui_start_button$/, width: 480, trim: true, needsAlpha: true },
  { match: /^ui_league_[a-z]+$/, width: 160, trim: true, needsAlpha: true }, // leaderboard league badges
  { match: /^ui_medal_[123]$/, width: 96, trim: true, needsAlpha: true }, // leaderboard 1st / 2nd / 3rd place medals (v0.7)
  { match: /^ui_achievement$/, width: 160, trim: true, needsAlpha: true }, // achievement cards, header and unlock toast
  // Fuel Station spell icons (art-source/spells): hotbar, Fuel Station window, How to Play and the cast on the map.
  // Some are tall (a carton, a can), so they fit a 256 px box by their longer side instead of by width.
  { match: /^ui_spell_[a-z]+$/, width: 256, fit: 'box', trim: true, needsAlpha: true },
  // Animated title / loading screen (art-source/title, see src/objects/TitleBackdrop.js). PreloadScene loads these
  // before anything else, so they're sized close to how big they show on the 1280x720 screen to keep that first load small.
  { match: /^title_bg$/, width: 1280, trim: false, needsAlpha: false },
  // The village map, one picture per time of day (art-source/map/<key>.webp, the full-size 6680 x 3768 tiled paintings;
  // drawn at MAP.imageWidth x imageHeight). Shipped 2672 wide: many phones can't use a texture over 4096 px, and the four
  // maps stay in graphics memory together for the day / night crossfade (at full size that's ~400 MB).
  { match: /^game_map_grid(_[a-z]+)?$/, width: 2672, trim: false, needsAlpha: false },    // the painted landscape with no characters
  { match: /^title_logo$/, width: 560, trim: true, needsAlpha: true },
  { match: /^title_(wizard|archer)$/, width: 420, fit: 'box', trim: true, needsAlpha: true },
  { match: /^title_mortar_fire$/, width: 340, trim: true, needsAlpha: true }, // the mortar firing (idle is bld_mortar_lv4_r)
  { match: /^title_flyer$/, width: 220, fit: 'box', trim: true, needsAlpha: true }, // the man shot out of the mortar
  { match: /^title_flyer_pose$/, width: 260, fit: 'box', trim: true, needsAlpha: true } // ...arms out, hovering once loading is done
];

// ---------- PNG decode ----------
function decodePng(buf) {
  const SIG = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== SIG) throw new Error('not a PNG');
  let pos = 8, width, height, bitDepth, colorType, interlace, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  if (interlace) throw new Error('interlaced PNGs are not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(height * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0, b = prev[i], c = i >= channels ? prev[i - channels] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) v += paeth(a, b, c);
      out[i] = v & 255;
    }
    prev = out;
  }
  const rgba = Buffer.alloc(width * height * 4);
  const hasAlpha = colorType === 4 || colorType === 6 || !!trns;
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 6) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = px[s + 3]; }
    else if (colorType === 2) {
      rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = 255;
      if (trns && trns.readUInt16BE(0) === px[s] && trns.readUInt16BE(2) === px[s + 1] && trns.readUInt16BE(4) === px[s + 2]) rgba[d + 3] = 0;
    } else if (colorType === 3) {
      const p = px[s]; rgba[d] = palette[p * 3]; rgba[d + 1] = palette[p * 3 + 1]; rgba[d + 2] = palette[p * 3 + 2];
      rgba[d + 3] = trns && p < trns.length ? trns[p] : 255;
    } else if (colorType === 0) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = 255; }
    else if (colorType === 4) { rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 1]; }
  }
  return { width, height, data: rgba, hasAlpha };
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

// ---------- PNG encode (RGBA, adaptive filter per row) ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const cur = data.subarray(y * stride, (y + 1) * stride);
    const prev = y ? data.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let best = 0, bestSum = Infinity;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0, b = prev[i], c = i >= 4 ? prev[i - 4] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - pred) & 255;
        cand[f][i] = v; sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; }
    }
    raw[y * (stride + 1)] = best;
    cand[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------- image ops ----------
/** Bounding box of the visible pixels, or null if the image is empty. */
function visibleBox(img, alphaThreshold = 40) {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] >= alphaThreshold) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

function crop(img, { x0, y0, x1, y1 }) {
  const { width: w, data } = img;
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1, out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) data.copy(out, y * nw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4);
  return { width: nw, height: nh, data: out };
}

function trim(img) {
  const box = visibleBox(img);
  return box ? crop(img, box) : img;
}

// Area-average downscale on premultiplied alpha (no dark halos around transparent edges).
function resize(img, targetW) {
  const { width: w, height: h, data } = img;
  if (targetW >= w) return img;
  const targetH = Math.max(1, Math.round(h * targetW / w));
  const sx = w / targetW, sy = h / targetH;
  const out = Buffer.alloc(targetW * targetH * 4);
  for (let ty = 0; ty < targetH; ty++) {
    const yA = ty * sy, yB = yA + sy;
    for (let tx = 0; tx < targetW; tx++) {
      const xA = tx * sx, xB = xA + sx;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let y = Math.floor(yA); y < Math.ceil(yB); y++) {
        const wy = Math.min(y + 1, yB) - Math.max(y, yA);
        for (let x = Math.floor(xA); x < Math.ceil(xB); x++) {
          const wx = Math.min(x + 1, xB) - Math.max(x, xA);
          const wt = wx * wy, i = (y * w + x) * 4, al = data[i + 3] / 255;
          r += data[i] * al * wt; g += data[i + 1] * al * wt; b += data[i + 2] * al * wt; a += al * wt; wsum += wt;
        }
      }
      const o = (ty * targetW + tx) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = Math.round((a / wsum) * 255);
    }
  }
  return { width: targetW, height: targetH, data: out };
}

// ---------- main ----------
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

// PNG sources everywhere; the village maps (art-source/map) are full-size WebP (v0.9.2: the user's 6680 x 3768 paintings with
// the tiles drawn on, too big to keep as PNG), decoded with sharp.
const isMapWebp = (f) => f.toLowerCase().endsWith('.webp') && path.basename(path.dirname(f)) === 'map';
const sources = walk(SRC).filter((f) => f.toLowerCase().endsWith('.png') || isMapWebp(f));
const keyOf = (f) => path.basename(f).replace(/\.(png|webp)$/i, '');
async function decodeSource(file) {
  if (!isMapWebp(file)) return decodePng(fs.readFileSync(file));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data, hasAlpha: false };
}

// Shared crop boxes for 'group' targets: the union of every matching picture's visible box.
// Pictures must share one canvas size; otherwise each is trimmed on its own.
const groupBoxes = new Map();
for (const t of TARGETS.filter((x) => x.trim === 'group')) {
  const imgs = sources.filter((f) => !isMapWebp(f) && t.match.test(keyOf(f))).map((f) => decodePng(fs.readFileSync(f)));
  if (!imgs.length) continue;
  if (imgs.some((im) => im.width !== imgs[0].width || im.height !== imgs[0].height)) {
    console.warn(`  WARN   ${t.match}: pictures differ in canvas size, trimming each on its own`);
    continue;
  }
  const boxes = imgs.map((im) => visibleBox(im)).filter(Boolean);
  groupBoxes.set(t, {
    x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)), y1: Math.max(...boxes.map((b) => b.y1))
  });
}

// WebP output: near-identical to the eye. Opaque pictures (the maps, the title landscape) drop the alpha channel.
const WEBP = { quality: 86, alphaQuality: 95, effort: 6, smartSubsample: true };
async function encodeWebp(img, opaque) {
  let s = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });
  if (opaque) s = s.removeAlpha();
  return s.webp(WEBP).toBuffer();
}

// Wall pillars (bld_wall_lvN, all cropped to one shared box): measure each pillar so the game can stand it
// on a tile center. visX0..visX1 is the pillar's visible width (its base is that wide), bottom its lowest
// row (the front corner of its base). Measured from the prepared picture, before it's encoded.
const WALL_META = path.join(ROOT, 'src', 'wallArtMeta.js');
function measurePillar(img) {
  const box = visibleBox(img, 128);
  return { width: img.width, height: img.height, visX0: box.x0, visX1: box.x1, bottom: box.y1 };
}
const wallMeta = {};

let made = 0, skipped = 0;
for (const file of sources) {
  const key = keyOf(file);
  const category = path.basename(path.dirname(file));
  const target = TARGETS.find((t) => t.match.test(key));
  if (!target) { console.log(`  skip   ${key} (not used in game)`); continue; }
  const outFile = path.join(OUT_IMAGES, category, `${key}.webp`);
  const oldPng = path.join(OUT_IMAGES, category, `${key}.png`);
  let img;
  try { img = await decodeSource(file); } catch (e) { console.warn(`  ERROR  ${key}: ${e.message}`); skipped++; continue; }
  if (target.needsAlpha && !img.hasAlpha) {
    console.warn(`  WARN   ${key}: no transparency, left out (re-export as a transparent PNG)`);
    for (const f of [outFile, oldPng]) if (fs.existsSync(f)) fs.rmSync(f);
    skipped++;
    continue;
  }
  if (target.trim === 'group' && groupBoxes.has(target)) img = crop(img, groupBoxes.get(target));
  else if (target.trim) img = trim(img);
  // fit 'box': the longer side becomes `width` (a tall picture is scaled by its height).
  const outW = target.fit === 'box' && img.height > img.width ? Math.max(1, Math.round(target.width * img.width / img.height)) : target.width;
  img = resize(img, outW);
  if (/^bld_wall_lv[0-9]+$/.test(key)) wallMeta[key] = measurePillar(img);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const webp = await encodeWebp(img, !target.needsAlpha);
  writeIfChanged(outFile, webp);
  if (fs.existsSync(oldPng)) fs.rmSync(oldPng);
  console.log(`  ok     ${category}/${key}.webp  ${img.width}x${img.height}  ${Math.round(webp.length / 1024)} KB`);
  made++;
}

// Full-detail map pieces (src/mapDetail.js): straight from the full-size maps, no resizing.
const OUT_DETAIL = path.join(ROOT, 'public', ...MAP_DETAIL.dir.split('/'));
fs.mkdirSync(OUT_DETAIL, { recursive: true });
const keepDetail = new Set();
for (const file of sources.filter(isMapWebp)) {
  const key = keyOf(file);
  if (!TARGETS.find((t) => t.match.test(key))) continue;
  const meta = await sharp(file).metadata();
  if (meta.width !== MAP_DETAIL.sourceWidth || meta.height !== MAP_DETAIL.sourceHeight) {
    console.warn(`  WARN   ${key}: ${meta.width}x${meta.height}, not ${MAP_DETAIL.sourceWidth}x${MAP_DETAIL.sourceHeight}: no detail pieces`);
    continue;
  }
  let bytes = 0;
  for (const piece of detailPieces(key)) {
    const { x, y, w, h } = piece.rect;
    const buf = await sharp(file).extract({ left: x, top: y, width: w, height: h }).removeAlpha().webp(WEBP).toBuffer();
    writeIfChanged(path.join(OUT_DETAIL, piece.file), buf);
    keepDetail.add(piece.file);
    bytes += buf.length;
  }
  console.log(`  ok     map-detail/${key}_*  ${MAP_DETAIL.cols * MAP_DETAIL.rows} pieces  ${Math.round(bytes / 1024)} KB`);
}
for (const f of fs.readdirSync(OUT_DETAIL)) if (!keepDetail.has(f)) fs.rmSync(path.join(OUT_DETAIL, f));

fs.writeFileSync(WALL_META, `// AUTO-GENERATED by scripts/prepare-art.mjs (measured from the wall pillar pictures). Do not edit by hand.
// Per picture: its size, the pillar's visible width (visX0..visX1) and its lowest row (bottom), in picture
// pixels. Used by src/objects/WallView.js.
export const WALL_ART_META = ${JSON.stringify(wallMeta, null, 2)};
`);

// Manifest of every file actually present under public/assets (art-source output plus anything dropped in by hand).
const rel = (f, base) => path.relative(base, f).split(path.sep).join('/');
const images = walk(OUT_IMAGES).filter((f) => /\.(webp|png)$/i.test(f)).sort()
  .map((f) => ({ key: path.basename(f, path.extname(f)), path: `assets/images/${rel(f, OUT_IMAGES)}` }));
const audio = walk(OUT_AUDIO).filter((f) => /\.(mp3|ogg|wav)$/i.test(f)).sort()
  .map((f) => ({ key: path.basename(f, path.extname(f)), path: `assets/audio/${rel(f, OUT_AUDIO)}` }));
const fmt = (list) => list.map((a) => `  { key: '${a.key}', path: '${a.path}' }`).join(',\n');
fs.writeFileSync(MANIFEST, `// AUTO-GENERATED by scripts/prepare-art.mjs. Do not edit by hand; run \`npm run prepare-art\`.
// Every file listed here exists under public/assets/. BootScene loads these and draws placeholders for the rest.

export const IMAGE_FILES = [
${fmt(images)}
];

export const AUDIO_FILES = [
${fmt(audio)}
];
`);
console.log(`\n${made} images prepared, ${skipped} skipped. Manifest: ${images.length} images, ${audio.length} audio files.`);
