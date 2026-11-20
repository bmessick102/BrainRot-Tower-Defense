// Performance patches for Phaser, installed once from main.js.
//
// Graphics arcs: Phaser's WebGL renderer turns every arc (fillCircle, fillRoundedRect, strokeCircle ...) into
// 100 points on EVERY frame, whatever its size, then triangulates the shape (earcut) every frame too. A HUD full
// of rounded buttons and pills spent about half the frame there on a slow device. arcPoints() picks the point
// count from the radius instead (a 12 px corner gets 7 points, still well under 0.1 px off the true curve), and
// the patched Graphics.arc() stores those points as plain lines, so each arc costs a handful of points.

/** Points around a full circle of radius r: about 8 x sqrt(r), 12 to 100 (Phaser always used 100). */
export function circleSegments(r) {
  const n = Math.round(8 * Math.sqrt(Math.max(0, r)));
  return Math.max(12, Math.min(100, n));
}

/**
 * The points (flat [x0, y0, x1, y1 ...]) of an arc as Phaser's WebGL renderer draws it (same angle rules:
 * clockwise sweeps of 0..2 PI, anticlockwise 0..-2 PI, `overshoot` extends the sweep by that share), from
 * the start point to the end point, with circleSegments(radius) points per full turn.
 */
export function arcPoints(x, y, radius, startAngle, endAngle, anticlockwise = false, overshoot = 0) {
  // The same rounded corners come up again and again (every health bar, every button): their shape around the
  // center is remembered, so a redraw is just additions.
  const key = `${radius}|${startAngle}|${endAngle}|${anticlockwise ? 1 : 0}|${overshoot || 0}`;
  let rel = arcCache.get(key);
  if (!rel) {
    if (arcCache.size >= ARC_CACHE_MAX) arcCache.clear();
    rel = arcOffsets(radius, startAngle, endAngle, anticlockwise, overshoot);
    arcCache.set(key, rel);
  }
  const out = new Array(rel.length);
  for (let i = 0; i < rel.length; i += 2) { out[i] = x + rel[i]; out[i + 1] = y + rel[i + 1]; }
  return out;
}

const ARC_CACHE_MAX = 2000;
const arcCache = new Map();

function arcOffsets(radius, startAngle, endAngle, anticlockwise, overshoot) {
  const PI2 = Math.PI * 2;
  const x = 0, y = 0;
  let sweep = endAngle - startAngle;
  if (anticlockwise) {
    if (sweep < -PI2) sweep = -PI2;
    else if (sweep > 0) sweep = -PI2 + (sweep % PI2);
  } else if (sweep > PI2) sweep = PI2;
  else if (sweep < 0) sweep = PI2 + (sweep % PI2);
  const total = sweep * (1 + (overshoot || 0));
  const r = Number.isFinite(radius) ? radius : 0;
  const steps = Math.max(1, Math.ceil(circleSegments(r) * Math.abs(total) / PI2));
  const out = new Array((steps + 1) * 2);
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (total * i) / steps;
    out[i * 2] = x + Math.cos(a) * r;
    out[i * 2 + 1] = y + Math.sin(a) * r;
  }
  return out;
}

/** Share of particles emitted in low graphics quality (quality.js). */
export const LOW_PARTICLE_SHARE = 0.4;

/**
 * How many of `count` particles to emit at quality share `share`: the whole part, plus one more with the
 * leftover as its chance (so a 1-particle trail still shows `share` of its particles). `rnd` in [0, 1).
 */
export function scaledParticleCount(count, share, rnd = Math.random()) {
  if (!(count > 0)) return 0;
  if (share >= 1) return count;
  const keep = count * Math.max(0, share);
  return Math.floor(keep) + (rnd < keep % 1 ? 1 : 0);
}

// Triangulations (earcut) of filled shapes, by their points. Phaser triangulates every filled shape of every
// Graphics on every frame; most are the same shapes frame after frame (UI panels, health bars, plots).
const TRI_CACHE_MAX = 4000;
const triCache = new Map(); // hash -> { coords: Float64Array, idx: number[] }

/** earcut(coords) (flat [x0, y0, ...]), remembered: the same points give back the same triangles without the work. */
export function cachedTriangles(coords, earcut) {
  let h = 2166136261 ^ coords.length;
  for (let i = 0; i < coords.length; i++) h = Math.imul(h ^ Math.round(coords[i] * 64), 16777619);
  const hit = triCache.get(h);
  if (hit && hit.coords.length === coords.length) {
    let same = true;
    for (let i = 0; i < coords.length; i++) if (hit.coords[i] !== coords[i]) { same = false; break; }
    if (same) return hit.idx;
  }
  const idx = earcut(coords);
  if (triCache.size >= TRI_CACHE_MAX) triCache.clear();
  triCache.set(h, { coords: Float64Array.from(coords), idx });
  return idx;
}

let installed = false;

/**
 * Patch Phaser once: Graphics arcs are stored as a radius-sized polyline (see the top of the file), and particle
 * emitters emit LOW_PARTICLE_SHARE of their particles while `isLow()` (low graphics quality) says so.
 */
export function installPhaserPerf(Phaser, isLow = () => false) {
  if (installed || !Phaser || !Phaser.GameObjects || !Phaser.GameObjects.Graphics) return false;
  installed = true;
  const G = Phaser.GameObjects.Graphics.prototype;
  G.arc = function arc(x, y, radius, startAngle, endAngle, anticlockwise = false, overshoot = 0) {
    const pts = arcPoints(x, y, radius, startAngle, endAngle, anticlockwise, overshoot);
    for (let i = 0; i < pts.length; i += 2) this.lineTo(pts[i], pts[i + 1]);
    return this;
  };
  // Filled shapes: Phaser's MultiPipeline.batchFillPath, the same but with remembered triangulations.
  const MP = Phaser.Renderer && Phaser.Renderer.WebGL && Phaser.Renderer.WebGL.Pipelines && Phaser.Renderer.WebGL.Pipelines.MultiPipeline;
  const earcut = Phaser.Geom && Phaser.Geom.Polygon && Phaser.Geom.Polygon.Earcut;
  if (MP && MP.prototype.batchFillPath && earcut) {
    MP.prototype.batchFillPath = function batchFillPath(path, currentMatrix, parentMatrix) {
      this.renderer.pipelines.set(this);
      const calcMatrix = this.calcMatrix;
      if (parentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
      const poly = this.polygonCache;
      for (let i = 0; i < path.length; i++) poly.push(path[i].x, path[i].y);
      const idx = cachedTriangles(poly, earcut);
      const tintTL = this.fillTint.TL, tintTR = this.fillTint.TR, tintBL = this.fillTint.BL;
      for (let i = 0; i < idx.length; i += 3) {
        const p0 = idx[i] * 2, p1 = idx[i + 1] * 2, p2 = idx[i + 2] * 2;
        const x0 = poly[p0], y0 = poly[p0 + 1], x1 = poly[p1], y1 = poly[p1 + 1], x2 = poly[p2], y2 = poly[p2 + 1];
        this.batchTri(null,
          calcMatrix.getX(x0, y0), calcMatrix.getY(x0, y0), calcMatrix.getX(x1, y1), calcMatrix.getY(x1, y1),
          calcMatrix.getX(x2, y2), calcMatrix.getY(x2, y2), 0, 0, 1, 1, tintTL, tintTR, tintBL, 2);
      }
      poly.length = 0;
    };
  }
  const PE = Phaser.GameObjects.Particles && Phaser.GameObjects.Particles.ParticleEmitter;
  if (PE && PE.prototype.emitParticle) {
    const emit = PE.prototype.emitParticle;
    PE.prototype.emitParticle = function emitParticle(count, x, y) {
      if (isLow()) {
        if (count === undefined) count = this.ops.quantity.onEmit();
        count = scaledParticleCount(count, LOW_PARTICLE_SHARE);
        if (count <= 0) return undefined;
      }
      return emit.call(this, count, x, y);
    };
  }
  return true;
}
