import { describe, expect, it } from 'vitest';
import { GameState } from '../src/state/GameState.js';
import { CONFIG } from '../src/config.js';
import { maxHp } from '../src/logic/buildings.js';
import { hallUpgradeUnlocks, previewUpgrade } from '../src/logic/upgradePreview.js';
import { collectorProduction, collectorStockCap, produceShakeCollectors, shakeStorageDrainAmount } from '../src/logic/shakes.js';
import { rpCap } from '../src/logic/researchPoints.js';
import { heroAbilityProgress, heroStatsFor } from '../src/logic/heroes.js';
import { masteryFxOf } from '../src/logic/merge.js';
import { deserializeGame, serializeGame } from '../src/logic/save.js';
import { createLayoutDraft, placeWallStroke, readLayoutDraft, storeBuilding, wallStrokeTiles, writeLayoutDraft } from '../src/logic/layout.js';
import { addBuilding, makeStateWithTownHall } from './helpers.js';

function village(level = 10) {
  const data = new Map();
  const gs = new GameState({
    storage: { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }
  });
  gs.startNew();
  gs.skipTutorial();
  gs.townHall.level = level;
  return gs;
}

describe('Update 5.1 purchases and collection', () => {
  it('previews all known requirements without changing state and rejects a stale confirmation', () => {
    const gs = village(3);
    const mine = addBuilding(gs, 'mine', 13, 13, 3);
    gs.gold = 0;
    expect(previewUpgrade(gs, mine)).toMatchObject({ nextLevel: 4, ok: false, notes: ['You need to upgrade your Village Hall to level 4!', expect.stringMatching(/^You need [\d,]+ more Bitcoin!$/)], short: true });
    expect(gs.gold).toBe(0);
    expect(mine.level).toBe(3);
    gs.townHall.level = 20;
    gs.gold = gs.capacity;
    const preview = previewUpgrade(gs, mine);
    const gold = gs.gold;
    expect(gs.upgradeBuilding(mine.id, preview.level).ok).toBe(true);
    expect(gs.upgradeBuilding(mine.id, preview.level).ok).toBe(false);
    expect(gs.gold).toBe(gold - preview.cost);
    expect(mine.level).toBe(4);
    expect(hallUpgradeUnlocks(3)).toContainEqual({ type: 'shakeCollector', add: 1, isNew: true });
    expect(hallUpgradeUnlocks(6)).toContainEqual({ type: 'shakeCollector', add: 1, isNew: false });
    expect(hallUpgradeUnlocks(8)).toContainEqual({ type: 'queenAltar', add: 1, isNew: true });
  });

  it.each(['mine', 'shakeCollector'])('collects all %s stock using one currency and preserves overflow', (type) => {
    const gs = village();
    gs.buildings = [gs.townHall];
    const source = addBuilding(gs, type, 9, 9);
    const other = addBuilding(gs, type, 12, 9);
    const ruined = addBuilding(gs, type, 15, 9);
    ruined.destroyed = true;
    ruined.stock = 100;
    const foreign = addBuilding(gs, type === 'mine' ? 'shakeCollector' : 'mine', 18, 9);
    foreign.stock = 100;
    source.stock = 7.5;
    other.stock = 15.25;
    gs.gold = gs.capacity - 16;
    gs.researchPoints = rpCap(gs) - 16;
    const shake = type === 'shakeCollector', untouched = shake ? gs.gold : gs.researchPoints;
    expect(gs.collectionStatus(source.id)).toEqual({ shakes: shake, amount: 0, reason: 'Wait for the ready icon' });
    expect(gs.collect(source.id).ok).toBe(false);
    expect(other.stock).toBe(15.25);
    source.stock = 12.5;
    expect(gs.collectionStatus(source.id).amount).toBe(16);
    expect(gs.collect(source.id).collected).toBe(16);
    expect(gs.collect(other.id).ok).toBe(false);
    expect(source.stock).toBe(0.5);
    expect(other.stock).toBe(11.25);
    expect(ruined.stock).toBe(100);
    expect(foreign.stock).toBe(100);
    expect(shake ? gs.gold : gs.researchPoints).toBe(untouched);
  });
});

describe('Update 5.1 progression', () => {
  it('purchases all five mastery tiers with both currencies, verifying stale clicks and save compatibility', () => {
    const gs = village(20);
    const cannon = addBuilding(gs, 'cannon', 12, 12, 10);
    cannon.merged = true;
    addBuilding(gs, 'rvlab', 15, 10, 5);
    const { costs, goldCosts } = CONFIG.merges.cannon.mastery;
    for (let i = 0; i < 5; i++) {
      gs.gold = goldCosts[i] - 1;
      gs.researchPoints = costs[i];
      expect(gs.researchMastery('cannon', i + 1).ok).toBe(false);
      expect(gs.researchPoints).toBe(costs[i]);
      gs.gold++;
      gs.researchPoints--;
      expect(gs.researchMastery('cannon', i + 1).ok).toBe(false);
      expect(gs.gold).toBe(goldCosts[i]);
      gs.researchPoints++;
      expect(gs.researchMastery('cannon', i + 1).ok).toBe(true);
      expect([gs.gold, gs.researchPoints, cannon.mastery]).toEqual([0, 0, i + 1]);
      expect(gs.researchMastery('cannon', i + 1).ok).toBe(false);
    }
    expect(masteryFxOf(cannon)).toMatchObject({ rollAdd: 2, trailRadius: 0.75, trailSeconds: 5, trailDps: 0.3 });
    const data = deserializeGame(serializeGame(gs));
    expect(data.buildings.find((b) => b.id === cannon.id).mastery).toBe(5);
  });

  it('applies dedicated collector and storage perks to output, stock, capacity and raid losses', () => {
    const s = makeStateWithTownHall({ researchPoints: 4000 }, 16);
    const collector = addBuilding(s, 'shakeCollector', 10, 10, 10);
    const storage = addBuilding(s, 'shakeStorage', 14, 10, 16);
    collector.picks = ['a', 'a', 'a', 'a', 'a'];
    expect(collectorProduction(collector)).toBeCloseTo(0.51 * 1.85);
    produceShakeCollectors(s, 240);
    expect(collector.stock).toBeCloseTo(240 * 0.51 * 1.85);
    collector.picks = ['b', 'b', 'b', 'b', 'b'];
    expect(collectorStockCap(collector)).toBe(2296);
    const baseCap = rpCap(s);
    storage.picks = ['a', 'a', 'a', 'a', 'a'];
    expect(rpCap(s) - baseCap).toBe(7500);
    storage.picks = [];
    const lost = shakeStorageDrainAmount(s, storage, maxHp(storage));
    storage.picks = ['b', 'b', 'b', 'b', 'b'];
    expect(shakeStorageDrainAmount(s, storage, maxHp(storage))).toBeCloseTo(lost * 0.4, 0);
  });

  it.each([
    ['altar', 'feastHealPct', 40, 50],
    ['queenAltar', 'encoreSeconds', 4, 6],
    ['mageAltar', 'aegisSeconds', 4, 6]
  ])('%s upgrades its activated statistic on milestones', (type, stat, first, last) => {
    const altar = { type, level: 4 };
    expect(heroStatsFor(altar)[stat]).toBe(first);
    expect(heroAbilityProgress(altar)).toMatchObject({ nextLevel: 5, max: last });
    expect(heroStatsFor({ ...altar, level: 5 })[stat]).toBe(first + (last - first) / 4);
    expect(heroStatsFor({ ...altar, level: 20 })[stat]).toBe(last);
  });
});

describe('Update 5.1 edit draft', () => {
  it('draws an edge-connected corner, skips occupied cells, and reloads a draft without changing the village', () => {
    const gs = village();
    const walls = Array.from({ length: 7 }, (_, i) => addBuilding(gs, 'wall', 12 + i, 12));
    addBuilding(gs, 'wall', 14, 18);
    const draft = createLayoutDraft(gs);
    for (const wall of walls) storeBuilding(draft, wall.id);
    const first = wallStrokeTiles({ col: 12, row: 18 }, { col: 16, row: 18 });
    const next = wallStrokeTiles(first.at(-1), { col: 16, row: 20 });
    expect(first).toHaveLength(5);
    expect(placeWallStroke(gs, draft, walls.map((b) => b.id), [...first, ...next], 'x')).toBe(6);
    expect(draft.stored).toEqual([walls.at(-1).id]);
    expect(gs.buildings.filter((b) => b.type === 'wall' && b.row === 12)).toHaveLength(7);
    writeLayoutDraft(gs, draft);
    expect(readLayoutDraft(gs)).toEqual(draft);
    walls[0].row++;
    expect(readLayoutDraft(gs).stored).toEqual([]);
  });
});
