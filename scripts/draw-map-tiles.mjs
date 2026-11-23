// Draws the game's tiles onto the village maps (v0.9.0; v0.9.2: the 52 x 52 grid and its playable tiles). Buildings snap to
// the game's grid, so the picture's tiles must be exactly the grid's (src/gridConfig.js GRID_CORNERS, the same bilinear
// fit as src/logic/iso.js). Then `npm run prepare-art` makes the game's webp copies.
//
// - The tiles are solid on every playable tile (src/mapGrass.js: whole tiles lying on the painted grass oval), equal right
//   out to the playable shape's edge (the user's call). v0.9.3: beyond it they fade out over BLEND tiles into the
//   painting's grass, rounding the stepped edge off, and only where the painting is grass, so bushes, rocks and bridges
//   are never covered. Everywhere else the painting is untouched.
// - Their colour is the painting's own grass at that spot, smoothed (a normalized blur of its grass pixels, ~1 tile wide:
//   its light and colour), 10% lighter / darker for the light and dark tiles (TILE_CONTRAST, the same on all four maps).
// The tiles are baked into the pictures; the game only shows the images.
//
// Usage: node scripts/draw-map-tiles.mjs <painted original, 6680 x 3768> <out .webp> [outWidth]
//   The originals (v0.9.2) are the user's day_ / Dawn_ / Dusk_ / night_ .webp paintings (6680 x 3768) in
//   unused-assets/root/upscaled_1795465442.zip. Results: art-source/map/game_map_grid[_dawn|_dusk|_night].webp at full size.
import sharp from 'sharp';
import { GRID_CORNERS as G, GRID_SIZE as N, SOURCE_IMAGE } from '../src/gridConfig.js';
import { GRASS_TILES } from '../src/mapGrass.js';
const [IN, OUT, OUT_W] = [process.argv[2], process.argv[3], +(process.argv[4] || 0)];
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

// The playable tiles (src/mapGrass.js): whole tiles on the painted grass. The tiles are drawn on exactly these.
const playable = (gx, gy) => { const c = Math.floor(gx), r = Math.floor(gy); return c >= 0 && r >= 0 && c < N && r < N && GRASS_TILES[r][c] === '1'; };


await (async () => {
  const { data: src, info } = await sharp(IN).removeAlpha().raw().toBuffer({ resolveWithObject: true });
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
  const measured = [0, 1, 2].map((c) => (light[c] - dark[c]) / Math.max(1, light[c] + dark[c]));
  // The tiles: that grass TILE_CONTRAST lighter and darker on every channel, the same on all four maps (v0.9.2: the
  // paintings' grass has no checker of its own, and measuring its texture would make the tiles stronger at one time of
  // day than another).
  const TILE_CONTRAST = 0.1;
  const contrast = [TILE_CONTRAST, TILE_CONTRAST, TILE_CONTRAST];
  console.log('tile contrast', TILE_CONTRAST, '(the painting measured', measured.map((v) => v.toFixed(3)).join(' / ') + ')');
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

  // 3. Where the painting is grass, 0..1, smoothed (1/4 size, a little blurred): the tiles' blend never covers scenery.
  const Q = 4, QW = Math.ceil(W / Q), QH = Math.ceil(H / Q), gq = new Float32Array(QW * QH);
  for (let qy = 0; qy < QH; qy++) for (let qx = 0; qx < QW; qx++) {
    const x = Math.min(W - 1, qx * Q + 1), y = Math.min(H - 1, qy * Q + 1);
    toGrid(x, y, g); if (fieldEdge(g[0], g[1]) < -2) continue;
    gq[qy * QW + qx] = grassScore((y * W + x) * 3);
  }
  const gqb = boxBlur(gq, 2, QW, QH, 2);
  const grassyAt = (x, y) => { const qx = Math.min(QW - 1, (x / Q) | 0), qy = Math.min(QH - 1, (y / Q) | 0); return gqb[qy * QW + qx]; };

  // 4. How far a point is from the playable tiles, in tiles (0 on them): the distance to the nearest playable square
  //    within BLEND + 1 tiles, so the blend rounds the tiles' stepped edge off.
  const BLEND = 1.1; // tiles: how far the tiles fade out into the painting's grass
  const near = new Uint8Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (GRASS_TILES[r][c] === '1')
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < N && cc < N) near[rr * N + cc] = 1; }
  const distOut = (gx, gy) => {
    const c0 = Math.floor(gx), r0 = Math.floor(gy);
    if (c0 < 0 || r0 < 0 || c0 >= N || r0 >= N || !near[r0 * N + c0]) return 99;
    if (GRASS_TILES[r0][c0] === '1') return 0;
    let best = 99;
    for (let r = r0 - 2; r <= r0 + 2; r++) for (let c = c0 - 2; c <= c0 + 2; c++) {
      if (r < 0 || c < 0 || r >= N || c >= N || GRASS_TILES[r][c] !== '1') continue;
      const dx = Math.max(c - gx, 0, gx - (c + 1)), dy = Math.max(r - gy, 0, gy - (r + 1));
      best = Math.min(best, Math.hypot(dx, dy));
    }
    return best;
  };

  // 5. Draw the tiles: solid on every playable tile (the user's call: whole, equal tiles), then fading out over BLEND
  //    tiles into the painting's grass round them, with a gentle wobble so the edge looks natural rather than ruled,
  //    and only where the painting is grass (bushes, rocks, bridges stay as painted). 2 x 2 samples per pixel smooth
  //    the checker's lines.
  const out = Buffer.from(src);
  const SUB = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
  const col3 = [0, 0, 0];
  const [x0, x1] = [Math.floor(G.left.x) - 4, Math.ceil(G.right.x) + 4], [y0, y1] = [Math.floor(G.top.y) - 4, Math.ceil(G.bottom.y) + 4];
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
    toGrid(x + 0.5, y + 0.5, g);
    const d = distOut(g[0], g[1]);
    if (d >= BLEND + 0.3) continue;
    let m = 1;
    if (d > 0) {
      const wob = (vnoise(g[0] * 1.7, g[1] * 1.7) - 0.5) * 0.5 + (vnoise(g[0] * 5.3 + 9, g[1] * 5.3) - 0.5) * 0.18;
      m = (1 - smooth(0, BLEND, d + wob)) * smooth(0.3, 0.75, grassyAt(x, y));
      if (m <= 0.004) continue;
    }
    let lightCov = 0, tc = 0, tr = 0;
    for (const [ox, oy] of SUB) {
      toGrid(x + ox, y + oy, g);
      tc = Math.floor(g[0]); tr = Math.floor(g[1]);
      if (((tc + tr) & 1) === 0) lightCov++;
    }
    const i = (y * W + x) * 3, t = lightCov / 4;
    grassAt(x, y, col3);
    const grain = 1 + (vnoise(x / 26, y / 26) - 0.5) * 0.08 + (vnoise(x / 7, y / 7) - 0.5) * 0.045 + (hash(x, y) - 0.5) * 0.02;
    const tileJit = 1 + (hash(tc + 101, tr + 37) - 0.5) * 0.05; // each tile a touch different
    for (let c = 0; c < 3; c++) {
      const tile = col3[c] * grain * (1 + contrast[c] * (2 * t - 1)) * tileJit;
      out[i + c] = Math.max(0, Math.min(255, Math.round(src[i + c] * (1 - m) + tile * m)));
    }
  }
  let img = sharp(out, { raw: { width: W, height: H, channels: 3 } });
  if (OUT_W) img = img.resize(OUT_W);
  await (OUT.endsWith('.webp') ? img.webp({ quality: 92 }) : img.png({ compressionLevel: 9 })).toFile(OUT);
  console.log('wrote', OUT);
})();
