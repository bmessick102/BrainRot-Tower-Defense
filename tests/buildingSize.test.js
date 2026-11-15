import { describe, it, expect } from 'vitest';
import { levelSizeFactor, artTier, LEVEL_SIZE } from '../src/objects/BuildingView.js';

describe('building size by level', () => {
  it('starts at 85.5% and reaches 99% at the top level', () => {
    expect(levelSizeFactor(1)).toBeCloseTo(0.855, 6);
    expect(levelSizeFactor(LEVEL_SIZE.maxLevel)).toBeCloseTo(0.99, 6);
  });

  it('only grows on upgrades that keep the same picture', () => {
    for (let l = 1; l < LEVEL_SIZE.maxLevel; l++) {
      const step = levelSizeFactor(l + 1) - levelSizeFactor(l);
      if (artTier(l + 1) === artTier(l)) expect(step).toBeCloseTo((LEVEL_SIZE.max - LEVEL_SIZE.min) / 5, 6); // 5 growth steps over 10 levels
      else expect(step).toBeCloseTo(0, 9);                                     // new picture: same size
    }
  });

  it('matches the 2-levels-per-picture pattern', () => {
    const sizes = Array.from({ length: 10 }, (_, i) => Math.round(levelSizeFactor(i + 1) * 100));
    expect(sizes).toEqual([86, 88, 88, 91, 91, 94, 94, 96, 96, 99]);
  });

  it('spreads the same growth over a 6-level building (the Diddypult)', () => {
    const sizes = Array.from({ length: 6 }, (_, i) => Math.round(levelSizeFactor(i + 1, 6) * 100));
    expect(sizes).toEqual([86, 90, 90, 95, 95, 99]);
  });

  it('clamps levels outside the range', () => {
    expect(levelSizeFactor(0)).toBeCloseTo(0.855, 6);
    expect(levelSizeFactor(99)).toBeCloseTo(0.99, 6);
  });
});
