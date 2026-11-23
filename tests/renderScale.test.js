import { describe, it, expect } from 'vitest';
import { pickRenderScale, RENDER_SCALE_CAP, VIEW } from '../src/renderScale.js';
import { MAP_DETAIL, detailPieceRect, detailPieces } from '../src/mapDetail.js';

describe('sharp rendering (renderScale.js)', () => {
  it('draws at the screen\'s real pixel size, in quarter steps, capped', () => {
    expect(VIEW).toEqual({ width: 1280, height: 720 });
    expect(pickRenderScale({ width: 1280, height: 720, dpr: 1 })).toBe(1);        // the view itself
    expect(pickRenderScale({ width: 1920, height: 1080, dpr: 1 })).toBe(1.5);     // a 1080p monitor
    expect(pickRenderScale({ width: 2560, height: 1440, dpr: 1 })).toBe(2);
    expect(pickRenderScale({ width: 1920, height: 1080, dpr: 2 })).toBe(RENDER_SCALE_CAP.desktop); // 4K: capped
    expect(pickRenderScale({ width: 1440, height: 900, dpr: 1 })).toBe(1.25);     // fitted by height: 1440 x 810 shown
    expect(pickRenderScale({ width: 800, height: 600, dpr: 1 })).toBe(1);         // never below the view
  });

  it('phones are capped lower, and Low graphics always draws at 1', () => {
    expect(pickRenderScale({ width: 844, height: 390, dpr: 3, touch: true })).toBe(RENDER_SCALE_CAP.touch);
    expect(pickRenderScale({ width: 2560, height: 1440, dpr: 2, low: true })).toBe(1);
    expect(pickRenderScale({ width: 0, height: 0 })).toBe(1);
  });
});

describe('full-detail map pieces (mapDetail.js)', () => {
  it('cover the whole painting, overlapping their neighbours by the bleed', () => {
    const pieces = detailPieces('game_map_grid');
    expect(pieces).toHaveLength(MAP_DETAIL.cols * MAP_DETAIL.rows);
    expect(pieces[0].file).toBe('game_map_grid_0_0.webp');
    const a = detailPieceRect(0, 0), b = detailPieceRect(1, 0), c = detailPieceRect(0, 1);
    expect(a.x).toBe(0); expect(a.y).toBe(0);
    expect(a.x + a.w - b.x).toBe(2 * MAP_DETAIL.bleed); // overlap across the seam
    expect(a.y + a.h - c.y).toBe(2 * MAP_DETAIL.bleed);
    const last = detailPieceRect(MAP_DETAIL.cols - 1, MAP_DETAIL.rows - 1);
    expect(last.x + last.w).toBe(MAP_DETAIL.sourceWidth);
    expect(last.y + last.h).toBe(MAP_DETAIL.sourceHeight);
    for (const p of pieces) { expect(p.rect.w).toBeLessThanOrEqual(2048); expect(p.rect.h).toBeLessThanOrEqual(2048); } // fits any desktop GPU's texture limit
  });
});
