import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { BUILDING_TYPES, typeConfig, maxLevel, levelStats, buildCost, upgradeCost } from '../src/logic/buildings.js';

// The most gold a village can hold at Village Hall `vh`: the hall's own capacity plus every Storage it may
// build, each at its highest level (buildings can't go above the Village Hall's level).
function maxGold(vh) {
  const storageLevel = Math.min(vh, CONFIG.storage.levels.length);
  return CONFIG.townHall.levels[vh - 1].capacity + CONFIG.limits.storage[vh - 1] * CONFIG.storage.levels[storageLevel - 1].capacity;
}

/** The lowest Village Hall at which a building can reach `level` (bought at 1, upgraded after). */
function firstHallFor(type, level) {
  if (type === 'townHall') return Math.max(1, level - 1); // the hall upgrades itself from the level below
  return Math.max(level, typeConfig(type).unlockTownHall || 1, levelStats(type, level).townHall || 0);
}

describe('building costs fit in storage', () => {
  it('every building and upgrade costs no more than the gold you can hold when it opens up', () => {
    const tooExpensive = [];
    for (const type of BUILDING_TYPES) {
      for (let level = 1; level <= maxLevel(type); level++) {
        const cost = level === 1 ? (type === 'townHall' ? null : buildCost(type)) : upgradeCost(type, level - 1);
        if (cost == null) continue;
        const vh = firstHallFor(type, level);
        if (vh > CONFIG.rules.maxTownHallLevel) continue;
        if (cost > maxGold(vh)) tooExpensive.push(`${type} Lv${level}: ${cost} > ${maxGold(vh)} at VH${vh}`);
      }
    }
    expect(tooExpensive).toEqual([]);
  });

  it('max storable gold only grows with the Village Hall', () => {
    for (let vh = 2; vh <= CONFIG.rules.maxTownHallLevel; vh++) expect(maxGold(vh)).toBeGreaterThan(maxGold(vh - 1));
  });
});
