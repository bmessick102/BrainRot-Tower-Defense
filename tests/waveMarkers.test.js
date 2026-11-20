import { describe, it, expect } from 'vitest';
import {
  markerLayout, markerPlacement, markerRect, touchesGrass, grassBoxes, pathEnds, pathAngle, arrowAngle, MARKER, PER_ROW, EDGE_MARGIN,
  markerRange, anchorAt, pickAlongPath
} from '../src/logic/waveMarkers.js';
import { PATHS } from '../src/logic/waves.js';
import { MAP } from '../src/mapTiles.js';
import { CONFIG } from '../src/config.js';

const ZOOMS = [CONFIG.camera.minZoom, 0.6, 0.75, 1, 1.5, CONFIG.camera.maxZoom];

describe('wave markers (world-space wave preview)', () => {
  it('centers the disc on the anchor and lays chips out underneath it in centered, balanced rows', () => {
    for (const path of PATHS) {
      for (const kinds of [0, 1, 3, 4, 7, 9, 12]) {
        const L = markerLayout(path, kinds);
        const r = L.rect;
        expect(L.chips).toHaveLength(kinds);
        expect(L.disc).toEqual({ x: 0, y: 0 }); // the arrow disc is the anchor
        const inside = (x, y, w, h) => x >= r.x - 0.01 && y >= r.y - 0.01 && x + w <= r.x + r.w + 0.01 && y + h <= r.y + r.h + 0.01;
        expect(inside(-MARKER.disc / 2, -MARKER.disc / 2, MARKER.disc, MARKER.disc)).toBe(true);
        expect(r.x + r.w / 2).toBeCloseTo(0, 6); // the whole marker is centered under the disc
        expect(r.y).toBeCloseTo(-MARKER.disc / 2, 6); // nothing above the disc
        for (const c of L.chips) {
          expect(inside(c.x, c.y, MARKER.chipW, MARKER.chipH)).toBe(true);
          expect(c.y).toBeGreaterThanOrEqual(MARKER.disc / 2); // underneath the disc
        }
        // Rows: no more than PER_ROW each, as even as they can be, and each centered under the disc.
        const rows = new Map();
        for (const c of L.chips) rows.set(c.y, [...(rows.get(c.y) || []), c]);
        expect(rows.size).toBe(Math.ceil(kinds / PER_ROW[path]));
        const sizes = [...rows.values()].map((row) => row.length);
        if (sizes.length) {
          expect(Math.max(...sizes)).toBeLessThanOrEqual(PER_ROW[path]);
          expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
        }
        for (const row of rows.values()) {
          const left = Math.min(...row.map((c) => c.x)), right = Math.max(...row.map((c) => c.x + MARKER.chipW));
          expect((left + right) / 2).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('sits on the path at its back end (near the map edge), never on the grass, at every zoom and wave size', () => {
    expect(grassBoxes().length).toBeGreaterThan(500);
    for (const path of PATHS) {
      const { entrance, edge } = pathEnds(path);
      const len = Math.hypot(entrance.x - edge.x, entrance.y - edge.y);
      const ux = (entrance.x - edge.x) / len, uy = (entrance.y - edge.y) / len;
      for (const kinds of [1, 4, 9, 12]) {
        const L = markerLayout(path, kinds);
        for (const z of ZOOMS) {
          const p = markerPlacement(path, L, 1 / z);
          const r = markerRect(L, p.x, p.y, p.scale);
          expect(touchesGrass(r), `${path} ${kinds} kinds at zoom ${z}`).toBe(false);
          // On the map image.
          expect(r.x).toBeGreaterThanOrEqual(EDGE_MARGIN - 0.01);
          expect(r.y).toBeGreaterThanOrEqual(EDGE_MARGIN - 0.01);
          expect(r.x + r.w).toBeLessThanOrEqual(MAP.imageWidth - EDGE_MARGIN + 0.01);
          expect(r.y + r.h).toBeLessThanOrEqual(MAP.imageHeight - EDGE_MARGIN + 0.01);
          // The disc (the anchor) on the path's center line, between the map's edge and the entrance.
          const along = (p.x - edge.x) * ux + (p.y - edge.y) * uy;
          const off = Math.abs((p.x - edge.x) * uy - (p.y - edge.y) * ux);
          expect(off, `${path} at zoom ${z}`).toBeLessThan(0.01);
          expect(along).toBeGreaterThanOrEqual(0);
          expect(along).toBeLessThanOrEqual(len);
          // Nearer the map's edge end of the path than the village end. (Not the bottom path at the widest
          // zooms: its chips hang outward below the disc, so a tall marker pushes the disc up past halfway.)
          if (path !== 'bottom' || z >= 0.75) {
            const dEdge = Math.hypot(p.x - edge.x, p.y - edge.y), dIn = Math.hypot(p.x - entrance.x, p.y - entrance.y);
            expect(dEdge, `${path} at zoom ${z}`).toBeLessThan(dIn);
          }
        }
      }
    }
  });

  it('keeps the bottom path chips on the outward side, away from the grass', () => {
    const L = markerLayout('bottom', 9);
    const p = markerPlacement('bottom', L, 1);
    const { entrance } = pathEnds('bottom');
    for (const c of L.chips) expect(p.y + c.y).toBeGreaterThan(p.y); // below the disc ...
    expect(p.y).toBeGreaterThan(entrance.y); // ... which is itself below the path's entrance onto the grass
  });

  it('keeps a constant screen size at normal zooms (only shrinks if there is no room)', () => {
    for (const path of PATHS) {
      const L = markerLayout(path, 9);
      for (const z of [0.75, 1, 1.5, 2]) expect(markerPlacement(path, L, 1 / z).scale).toBeCloseTo(1 / z, 5);
    }
  });

  it('never covers a building standing anywhere on the grass', () => {
    // Any building footprint is made of grass tiles, so a rect clear of every grass tile is clear of them all.
    const tile = grassBoxes()[0];
    expect(touchesGrass(tile)).toBe(true);
    expect(touchesGrass({ x: -500, y: -500, w: 10, h: 10 })).toBe(false);
  });

  it('points its arrow along the path toward the village', () => {
    for (const path of PATHS) {
      const { entrance, edge } = pathEnds(path);
      expect(pathAngle(path)).toBeCloseTo(arrowAngle(edge, entrance), 6);
    }
    expect(Math.sin(pathAngle('top'))).toBeGreaterThan(0.9);     // down
    expect(Math.sin(pathAngle('bottom'))).toBeLessThan(-0.9);  // up
    expect(Math.cos(pathAngle('left'))).toBeGreaterThan(0.9);   // right
    expect(Math.cos(pathAngle('right'))).toBeLessThan(-0.9);   // left
  });

  it('slides in along the path (never onto the grass) to get out from under the HUD', () => {
    for (const path of PATHS) {
      const L = markerLayout(path, 6);
      const range = markerRange(path, L, 1 / 0.75);
      expect(range.dMax).toBeGreaterThanOrEqual(range.dMin);
      const id = (r) => r;
      // Nothing in the way: the back of the path.
      expect(pickAlongPath(range, L, id, [])).toBe(range.dMin);
      // The back covered (the outer quarter of the marker there, like a HUD bar along the screen's edge): the
      // first clear spot further in, still clear of the grass.
      const back = anchorAt(range, range.dMin);
      const m = markerRect(L, back.x, back.y, range.scale);
      const cover = {
        top: { x: m.x, y: m.y, w: m.w, h: m.h / 4 },
        bottom: { x: m.x, y: m.y + m.h * 0.75, w: m.w, h: m.h / 4 },
        left: { x: m.x, y: m.y, w: m.w / 4, h: m.h },
        right: { x: m.x + m.w * 0.75, y: m.y, w: m.w / 4, h: m.h }
      }[path];
      const d = pickAlongPath(range, L, id, [cover]);
      expect(d).toBeGreaterThan(range.dMin);
      expect(d).toBeLessThanOrEqual(range.dMax);
      const p = anchorAt(range, d);
      expect(touchesGrass(markerRect(L, p.x, p.y, range.scale))).toBe(false);
      // Covered everywhere: stays at the back.
      expect(pickAlongPath(range, L, id, [{ x: -1e5, y: -1e5, w: 2e5, h: 2e5 }])).toBe(range.dMin);
    }
  });

  it('ignores unknown paths', () => {
    expect(markerPlacement('nowhere', markerLayout('top', 1), 1)).toBeNull();
    expect(pathEnds('nowhere')).toBeNull();
  });
});
