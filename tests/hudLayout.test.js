import { describe, it, expect } from 'vitest';
import {
  rectsOverlap, findOverlaps, unionRect, rectInside, clampRectInto, fitInSpan, liftClear, fitPill,
  GOLD_BAR, RP_BAR, barRect, barRight, clockRect, CLOCK, TOP_ROW_CY, PROFILE, WAVE_CX, waveSpan, SCREEN
} from '../src/logic/hudLayout.js';

describe('rect helpers', () => {
  it('overlap: touching edges do not overlap, pad widens the check', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectsOverlap(a, { x: 14, y: 0, w: 5, h: 5 }, 5)).toBe(true);
    expect(rectsOverlap(a, null)).toBe(false);
  });

  it('findOverlaps names each overlapping pair once and skips missing rects', () => {
    const r = { a: { x: 0, y: 0, w: 10, h: 10 }, b: { x: 5, y: 5, w: 10, h: 10 }, c: { x: 100, y: 0, w: 5, h: 5 }, d: null };
    expect(findOverlaps(r)).toEqual(['a/b']);
  });

  it('union, inside and clamp', () => {
    expect(unionRect({ x: 0, y: 0, w: 5, h: 5 }, null, { x: 10, y: 10, w: 5, h: 5 })).toEqual({ x: 0, y: 0, w: 15, h: 15 });
    expect(unionRect()).toBeNull();
    const area = { x: 0, y: 0, w: 100, h: 100 };
    expect(rectInside({ x: 10, y: 10, w: 10, h: 10 }, area)).toBe(true);
    expect(clampRectInto({ x: 95, y: -5, w: 10, h: 10 }, area)).toEqual({ x: 90, y: 0, w: 10, h: 10 });
    expect(clampRectInto({ x: 0, y: 0, w: 200, h: 10 }, area).x).toBe(-50); // bigger than the area: centered
  });

  it('fitInSpan centers on cx, stays inside the span, and shrinks when too wide', () => {
    expect(fitInSpan(0, 1000, 100, 500)).toEqual({ left: 450, w: 100, scale: 1 });
    expect(fitInSpan(0, 1000, 100, 20).left).toBe(0);
    expect(fitInSpan(0, 1000, 100, 990).left).toBe(900);
    const f = fitInSpan(100, 300, 400, 200);
    expect(f.left).toBe(100);
    expect(f.w).toBe(200);
    expect(f.scale).toBe(0.5);
  });

  it('liftClear moves a rect up above everything it overlaps, with a gap', () => {
    const bar = { x: 0, y: 600, w: 300, h: 80 };
    const guide = { x: 0, y: 500, w: 100, h: 50 };
    const r = { x: 50, y: 610, w: 100, h: 40 };
    const y = liftClear(r, [bar, guide, null], 8);
    expect(y).toBe(500 - 8 - 40);
    expect(findOverlaps({ r: { ...r, y }, bar, guide }, 7.9)).toEqual([]);
    expect(liftClear({ x: 400, y: 610, w: 10, h: 10 }, [bar])).toBe(610); // not in the way: stays
  });

  it('fitPill picks the longest text that fits, else shrinks the shortest', () => {
    expect(fitPill(500, [300, 150], 100)).toMatchObject({ index: 0, scale: 1, overflow: 0 });
    expect(fitPill(300, [300, 150], 100)).toMatchObject({ index: 1, scale: 1, pillW: 198, overflow: 0 });
    const tight = fitPill(250, [300, 150], 100);
    expect(tight.index).toBe(1);
    expect(tight.scale).toBeCloseTo((250 - 100 - 48) / 150);
    expect(tight.overflow).toBe(0);
    expect(fitPill(120, [300, 150], 100).overflow).toBeGreaterThan(0); // can't fit: says by how much
  });
});

describe('top row layout (1280 x 720, scaled to the window by Phaser FIT)', () => {
  it('keeps the bars, the day/night pill and the wave span apart', () => {
    const gold = barRect(GOLD_BAR), rp = barRect(RP_BAR);
    expect(rectsOverlap(gold, rp)).toBe(false);
    expect(barRight(GOLD_BAR)).toBeLessThanOrEqual(SCREEN.w - 16);
    // The day/night pill sits directly under the gold bar, right-aligned with its coin, clear of both bars.
    const clock = clockRect(150);
    expect(clock.x + clock.w).toBe(barRight(GOLD_BAR));
    expect(clock.x).toBeGreaterThanOrEqual(GOLD_BAR.x - 4);
    expect(clock.y).toBeGreaterThanOrEqual(TOP_ROW_CY + GOLD_BAR.h * 1.75 / 2); // below the coin
    expect(rectsOverlap(clock, { x: GOLD_BAR.x, y: GOLD_BAR.y, w: GOLD_BAR.w, h: GOLD_BAR.h })).toBe(false);
    expect(rectsOverlap(clock, rp)).toBe(false);
    expect(CLOCK.cy + CLOCK.h / 2).toBeLessThan(120);
  });

  it('the wave group span runs from right of the profile to left of the RP bar', () => {
    const rp = barRect(RP_BAR);
    const noProfile = waveSpan(0);
    expect(noProfile.hi).toBeLessThan(rp.x);
    expect(noProfile.lo).toBeGreaterThanOrEqual(16);
    expect(WAVE_CX).toBeGreaterThan(noProfile.lo);
    expect(WAVE_CX).toBeLessThan(noProfile.hi);
    // The widest profile pill (name shrunk to PROFILE.maxTextW, league badge, news badge) still leaves room
    // for the countdown's shortest pill ("10s") + Start Now (narrowed to 130) + Cancel (112), with gaps.
    const widest = PROFILE.x + PROFILE.maxTextW + 58 + 18 + 22;
    const s = waveSpan(widest);
    expect(s.lo).toBeGreaterThan(widest);
    expect(fitPill(s.hi - s.lo, [380, 150, 40], 10 + 130 + 10 + 112).overflow).toBe(0);
  });
});

describe('shop tabs (v0.14: five, with Heroes)', () => {
  it('never run into the page arrows, never overlap, and stay wide enough for their labels', async () => {
    const { shopTabLayout, SHOP_ARROWS_LEFT, SHOP_TAB } = await import('../src/logic/hudLayout.js');
    for (const n of [4, 5, 6]) {
      const tabs = shopTabLayout(n);
      expect(tabs).toHaveLength(n);
      const last = tabs[n - 1];
      expect(last.x + last.w).toBeLessThanOrEqual(SHOP_ARROWS_LEFT);
      for (let i = 1; i < n; i++) expect(tabs[i].x).toBeGreaterThanOrEqual(tabs[i - 1].x + tabs[i - 1].w + 8);
      expect(last.w).toBeGreaterThanOrEqual(SHOP_TAB.minW);
    }
    expect(shopTabLayout(4)[0].w).toBe(150); // four tabs keep their old width
    expect(shopTabLayout(5)[0].w).toBeGreaterThanOrEqual(125); // "Defenses" / "Economy" at 19 px are about 85 px wide
  });
});
