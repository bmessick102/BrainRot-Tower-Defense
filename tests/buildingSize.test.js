import { describe, it, expect } from 'vitest';
import { levelSizeFactor, tierSizeFactor, artTier, LEVEL_SIZE, TIER_GROWTH } from '../src/objects/BuildingView.js';
import { CONFIG } from '../src/config.js';
import { maxLevel } from '../src/logic/buildings.js';

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

// Tower of Rah (v0.10.2): every level stands bigger than the one before, up to the merged Great Pyramid of Rah. The
// pictures' own shapes need the real textures (checked with screenshots, see SPRITE_SCALE.ra); here every picture has
// the same shape, so tierSizeFactor is TIER_GROWTH.ra's growth alone.
describe('Tower of Rah sizes', () => {
  const sprite = (key) => {
    const frame = { width: 384, height: 768 };
    return { texture: { key }, frame, scene: { textures: { exists: () => true, getFrame: () => frame } } };
  };
  const size = (level) => levelSizeFactor(level, maxLevel('ra'), 'ra') * tierSizeFactor(sprite(`bld_ra_lv${artTier(level, 'ra')}`), 'ra');

  it('levelSizeFactor x tierSizeFactor grows at every level from 1 to 8', () => {
    expect(maxLevel('ra')).toBe(8);
    expect(TIER_GROWTH.ra).toBeGreaterThan(0);
    for (let l = 2; l <= 8; l++) expect(size(l)).toBeGreaterThan(size(l - 1) * 1.01);
  });

  it('the merged Great Pyramid of Rah is drawn bigger than a Level 8 Tower of Rah', () => {
    expect(CONFIG.merges.ra.art.scale).toBeGreaterThan(1);
    expect(CONFIG.merges.ra.art.standInScale).toBeGreaterThan(1);
  });
});
