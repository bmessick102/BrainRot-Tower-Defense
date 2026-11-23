// Draws the game's 40 x 40 tiles onto the village maps (v0.9.0). The painted grass's checker doesn't follow a regular
// grid, so buildings (which snap to the game's grid) never lined up with it. This replaces the grass inside the diamond
// with a light / dark checker on the game's exact grid (src/gridConfig.js GRID_CORNERS, the same bilinear fit as
// src/logic/iso.js). Then `npm run prepare-art` makes the game's webp copies.
//
// Everything new takes its colour from the painting itself, so nothing looks pasted on:
// - The grass colour at every spot is the painting's own grass there, smoothed (a normalized blur of its grass pixels,
//   ~1 tile wide: its light and colour, without its painted checker). The tiles are that colour a little lighter and
//   darker (the map's own checker contrast); "plain grass" is that colour as it is.
// - The field's border: rounded corners, the tiles fading into plain grass over the outer tile along a wavy line, and
//   around each path's mouth a rounded fade. The painted dirt itself is never redrawn.
// - The new grass blends into the painting just OUTSIDE the field, where its grass is smooth (inside, its old checker
//   would show through).
// - Whatever is painted over the grass near the edge (bushes, stones, pillars, dirt) stays, with its exact outline: a
//   soft per-pixel "not grass" score, only near solid shapes (so stray specks of shadow are painted over).
// - Around each path's mouth the grass wears into the painted dirt (and its shadow) along a wavy, soft line a little
//   inside the field, so the dirt doesn't end in the old grass edge's straight line. Grey stone (pillars) is left alone.
//   What counts as dirt or shadow is read from the day painting for every map, so all four stay the same shape.
// Only the picture changes: every tile can still be built on.
//
// Usage: node scripts/draw-map-tiles.mjs <painted original, 6688 x 3764> <out .png|.webp> [outWidth] [day original]
//   Pass the day original for dawn, dusk and night (see above; the day map uses itself).
//   The originals are the user's "Day Map 2.webp", "Dawn Map 2.webp", "Dusk Map 2.webp", "night map 2.webp".
//   Full-size results: art-source/map/full-size/<key>.webp; the game's sources: art-source/map/<key>.png at 3344 wide.
import sharp from 'sharp';
import { GRID_CORNERS as G, GRID_SIZE as N, SOURCE_IMAGE, PATHS } from '../src/gridConfig.js';
const [IN, OUT, OUT_W, DAY] = [process.argv[2], process.argv[3], +(process.argv[4] || 0), process.argv[5]];
const AX = G.top.x, AY = G.top.y, BX = G.right.x - AX, BY = G.right.y - AY, CX = G.left.x - AX, CY = G.left.y - AY;
const DX = G.bottom.x - G.right.x - G.left.x + AX, DY = G.bottom.y - G.right.y - G.left.y + AY;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const BxD = cross(BX, BY, DX, DY), BxC = cross(BX, BY, CX, CY);
// Image px -> grid (x, y), same solve as logic/iso.js screenToGrid.
function toGrid(sx, sy, out) {
  const qx = sx - AX, qy = sy - AY;
  const u0 = (qx * CY - qy * CX) / BxC;
  const a2 = BxD, a1 = BxC - cross(qx, qy, DX, DY), a0 = -cross(qx, qy, CX, CY);
  let u;
  if (Math.abs(a2) < 1e-9) u = -a0 / a1;
  else { const r = Math.sqrt(Math.max(0, a1 * a1 - 4 * a2 * a0)); const r1 = (-a1 + r) / (2 * a2), r2 = (-a1 - r) / (2 * a2); u = Math.abs(r1 - u0) <= Math.abs(r2 - u0) ? r1 : r2; }
  const wx = CX + DX * u, wy = CY + DY * u;
  const v = ((qx - BX * u) * wx + (qy - BY * u) * wy) / (wx * wx + wy * wy);
  out[0] = u * N; out[1] = v * N;
}
const toImage = (gx, gy) => { const u = gx / N, v = gy / N; return [AX + BX * u + CX * v + DX * u * v, AY + BY * u + CY * v + DY * u * v]; };
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// Smooth value noise (a little painterly texture, and the border's wobble).
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const s = (t) => t * t * (3 - 2 * t), a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}
const rgb2hsv = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, mx ? d / mx : 0, mx / 255]; };
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const fieldEdge = (x, y) => Math.min(x, y, N - x, N - y); // tiles inside the field (negative outside)

// The border's shape.
const CORNER_R = 3;          // rounded corners, tiles
const FADE = [0.1, 1.0];     // the tiles fade into plain grass over this band in from the (rounded) edge, tiles
const OUTSIDE_BLEND = 0.7;   // the new grass blends into the painting over this much just outside the field, tiles
const EDGE_KEEP = 1.6;       // within this many tiles of the edge, what's painted over the grass stays
// Each path's mouth (its entrance, on the field's edge) and how far round it the tiles fade, tiles. The waterfall
// corners (left, right) have no path.
const MOUTH_R = { top: 2.2, topRight: 1.6, bottom: 2.2, bottomLeft: 1.6, topLeft: 1.4, upperLeft: 1.4 };
const onEdge = (v) => (v <= 0.6 ? 0 : v >= N - 0.6 ? N : v);
const WEAR = [-0.35, 0.55]; // the dirt wears away from this far from the field's edge (+ wobble; negative: outside), over this many tiles
// The paths whose painted dirt runs onto the grass (the bridge is planks; the pillar path's dirt stops at its sign).
const WEARS = new Set(['top', 'topRight', 'bottom', 'topLeft']);
const MOUTHS = Object.entries(MOUTH_R).map(([name, r]) => ({ mx: onEdge(PATHS[name].entrance[0]), my: onEdge(PATHS[name].entrance[1]), r, wears: WEARS.has(name) }));
// Signed distance (tiles) inside the field with its corners rounded.
const roundedEdge = (x, y) => {
  const dx = Math.max(CORNER_R - Math.min(x, N - x), 0), dy = Math.max(CORNER_R - Math.min(y, N - y), 0);
  return dx > 0 && dy > 0 ? CORNER_R - Math.hypot(dx, dy) : fieldEdge(x, y);
};

await (async () => {
  const { data: src, info } = await sharp(IN).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ref = DAY ? await sharp(DAY).removeAlpha().raw().toBuffer() : src; // the day painting: what's dirt or shadow
  const W = info.width, H = info.height;
  if (W !== SOURCE_IMAGE.width || H !== SOURCE_IMAGE.height) throw new Error(`expected ${SOURCE_IMAGE.width} x ${SOURCE_IMAGE.height}, got ${W} x ${H}`);
  const g = [0, 0];

  // 1. The map's own grass: its checker contrast and its colour range, from the middle of the field.
  const lum = (i) => 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
  const samples = [];
  for (let gy = 6; gy <= 34; gy += 0.37) for (let gx = 6; gx <= 34; gx += 0.37) {
    const [x, y] = toImage(gx, gy);
    samples.push((Math.round(y) * W + Math.round(x)) * 3);
  }
  const ls = samples.map(lum).sort((a, b) => a - b), med = ls[ls.length >> 1];
  const light = [0, 0, 0], dark = [0, 0, 0]; let nl = 0, nd = 0;
  const hs = [], ss = [], vs = [];
  for (const i of samples) {
    const L = lum(i), t = L >= med ? light : dark;
    for (let c = 0; c < 3; c++) t[c] += src[i + c];
    if (L >= med) nl++; else nd++;
    const [h, s, v] = rgb2hsv(src[i], src[i + 1], src[i + 2]); hs.push(h); ss.push(s); vs.push(v);
  }
  for (let c = 0; c < 3; c++) { light[c] /= nl; dark[c] /= nd; }
  const contrast = [0, 1, 2].map((c) => (light[c] - dark[c]) / Math.max(1, light[c] + dark[c])); // tiles: +-this
  const pct = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(p * (b.length - 1))]; };
  const H0 = pct(hs, 0.02), H1 = pct(hs, 0.98), S0 = pct(ss, 0.02), V0 = pct(vs, 0.02), V1 = pct(vs, 0.995);
  console.log('light', light.map(Math.round), 'dark', dark.map(Math.round), 'hue', H0.toFixed(0), H1.toFixed(0), 'sat>=', S0.toFixed(2), 'val', V0.toFixed(2), V1.toFixed(2));
  // How much a pixel looks like this map's grass, 0..1 (shadowed grass counts: same hue, darker).
  const grassScore = (i) => {
    const [h, s, v] = rgb2hsv(src[i], src[i + 1], src[i + 2]);
    return smooth(H0 - 16, H0 - 8, h) * (1 - smooth(H1 + 8, H1 + 16, h)) * smooth(S0 * 0.5, S0 * 0.72, s)
      * smooth(V0 * 0.3, V0 * 0.48, v) * (1 - smooth(V1 * 1.1, V1 * 1.2, v));
  };

  // 2. The painting's own grass colour at every spot: a normalized blur of its grass pixels (1/8 size), in and just
  //    around the field. It keeps the painting's light and colour (lighter by the edges, say) but not its checker.
  const S = 8, SW = Math.ceil(W / S), SH = Math.ceil(H / S);
  const csum = [new Float32Array(SW * SH), new Float32Array(SW * SH), new Float32Array(SW * SH)], wsum = new Float32Array(SW * SH);
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    toGrid(x, y, g); if (fieldEdge(g[0], g[1]) < -3) continue;
    const i = (y * W + x) * 3, w = grassScore(i); if (w < 0.6) continue;
    const k = ((y / S) | 0) * SW + ((x / S) | 0);
    for (let c = 0; c < 3; c++) csum[c][k] += src[i + c] * w;
    wsum[k] += w;
  }
  const boxBlur = (a, r, w, h, passes = 3) => { let cur = Float32Array.from(a); const tmp = new Float32Array(a.length);
    for (let pass = 0; pass < passes; pass++) {
      for (let y = 0; y < h; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += cur[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += cur[y * w + Math.min(w - 1, x + r + 1)] - cur[y * w + Math.max(0, x - r)]; } }
      for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { cur[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
    }
    return cur; };
  const R2 = 14; // ~110 px (about a tile) at 1/8 size, 3 passes
  const cb = csum.map((a) => boxBlur(a, R2, SW, SH)), wb = boxBlur(wsum, R2, SW, SH);
  const mid = [0, 1, 2].map((c) => (light[c] + dark[c]) / 2);
  const grassAt = (x, y, out) => { // bilinear
    const fx = x / S - 0.5, fy = y / S - 0.5, x0 = Math.max(0, Math.min(SW - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(SH - 2, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const ws = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], ks = [y0 * SW + x0, y0 * SW + x0 + 1, (y0 + 1) * SW + x0, (y0 + 1) * SW + x0 + 1];
    let wt = 0; out[0] = out[1] = out[2] = 0;
    for (let j = 0; j < 4; j++) { const k = ks[j]; if (wb[k] < 1e-3) continue; wt += ws[j]; for (let c = 0; c < 3; c++) out[c] += (cb[c][k] / wb[k]) * ws[j]; }
    if (wt > 0) for (let c = 0; c < 3; c++) out[c] /= wt; else for (let c = 0; c < 3; c++) out[c] = mid[c];
  };

  // 3. What stays painted over the grass near the edge: solid not-grass shapes (half size: blur + threshold drops
  //    specks), grown a little; inside that zone each pixel keeps as much of the painting as it isn't grass.
  const HW = W >> 1, HH = H >> 1;
  const raw = new Float32Array(HW * HH);
  for (let y = 0; y < HH; y++) for (let x = 0; x < HW; x++) {
    const X = x * 2 + 1, Y = y * 2 + 1;
    toGrid(X, Y, g);
    const e = fieldEdge(g[0], g[1]);
    if (e >= EDGE_KEEP) continue;
    raw[y * HW + x] = e < -OUTSIDE_BLEND - 0.3 ? 1 : grassScore((Y * W + X) * 3) < 0.5 ? 1 : 0;
  }
  let solid = boxBlur(raw, 4, HW, HH, 1);
  for (let k = 0; k < solid.length; k++) solid[k] = solid[k] > 0.55 ? 1 : 0;
  const zone = boxBlur(solid, 4, HW, HH, 1);
  const keepAt = (x, y, i) => { const z = zone[Math.min(HH - 1, y >> 1) * HW + Math.min(HW - 1, x >> 1)]; return z > 0.01 ? Math.min(1, z * 4) * (1 - grassScore(i)) : 0; };

  // 4. Draw: in the field and just outside it. Tiles: 2 x 2 samples per pixel for smooth edges.
  const out = Buffer.from(src);
  const SUB = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const col3 = [0, 0, 0];
  for (let y = 480; y < 3120; y++) for (let x = 700; x < 5860; x++) {
    toGrid(x + 0.5, y + 0.5, g);
    const cx = g[0], cy = g[1], e = fieldEdge(cx, cy);
    if (e < -OUTSIDE_BLEND) continue;
    const i = (y * W + x) * 3;
    let m = e >= 0 ? 1 : 1 - smooth(0, OUTSIDE_BLEND, -e); // blend into the painting just outside the field
    if (e < EDGE_KEEP) m *= 1 - keepAt(x, y, i);        // what's painted over the edge stays
    // the tiles' share of light under this pixel
    let lightCov = 0;
    for (const [ox, oy] of SUB) { toGrid(x + ox, y + oy, g); if (((Math.floor(g[0]) + Math.floor(g[1])) & 1) === 0) lightCov++; }
    const t = lightCov / 4;
    // how much tile shows: the rounded, wavy border and the path mouths
    const wob = (vnoise(cx * 0.8 + 3, cy * 0.8 + 11) - 0.5) * 0.7 + (vnoise(cx * 2.1 + 5, cy * 2.1 + 1) - 0.5) * 0.35;
    let tileA = smooth(FADE[0], FADE[1], roundedEdge(cx, cy) + wob * 0.6);
    let mouth = 0; // how much this pixel is in a path's mouth
    for (const M of MOUTHS) {
      const dm = Math.hypot(cx - M.mx, cy - M.my) + wob * 0.8;
      if (dm < M.r * 1.4) tileA *= smooth(M.r * 0.7, M.r * 1.4, dm);
      if (M.wears) mouth = Math.max(mouth, 1 - smooth(M.r * 1.2, M.r * 1.8, dm));
    }
    if (mouth > 0 && m < 1 && e > -0.75) {
      // in a mouth: the grass wears into the painted dirt / shadow (not grey stone) past a wavy line along the edge
      const [hue, sat] = rgb2hsv(ref[i], ref[i + 1], ref[i + 2]);
      const earthy = 1 - smooth(130, 150, hue); // dirt (orange) and grass shadow (green), not crystals (blue) or glow
      const wear = smooth(WEAR[0] + wob * 0.7, WEAR[0] + WEAR[1] + wob * 0.7, e) * smooth(0.25, 0.4, sat) * earthy * mouth;
      if (wear > 0) m = m + (1 - m) * wear;
    }
    if (m <= 0.002) continue;
    grassAt(x, y, col3);
    const grain = 1 + (vnoise(x / 26, y / 26) - 0.5) * 0.08 + (vnoise(x / 7, y / 7) - 0.5) * 0.045 + (hash(x, y) - 0.5) * 0.02;
    const tileJit = 1 + (hash(Math.floor(cx) + 101, Math.floor(cy) + 37) - 0.5) * 0.05 * tileA; // each tile a touch different
    for (let c = 0; c < 3; c++) {
      const plain = col3[c] * grain;
      const tile = plain * (1 + contrast[c] * (2 * t - 1)) * tileJit;
      const base = plain + (tile - plain) * tileA;
      out[i + c] = Math.max(0, Math.min(255, Math.round(src[i + c] * (1 - m) + base * m)));
    }
  }
  let img = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  if (OUT_W) img = img.resize(OUT_W);
  await (OUT.endsWith('.webp') ? img.webp({ quality: 92 }) : img.png({ compressionLevel: 9 })).toFile(OUT);
  console.log('wrote', OUT);
})();
