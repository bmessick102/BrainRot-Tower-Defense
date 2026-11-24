// v0.13: the Storage has 20 levels (was 10), 10 pictures, cheaper upgrades; older saves move every Storage up a level.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createBuilding, checkUpgrade, maxLevel, limitFor, checkBuy } from '../src/logic/buildings.js';
import { serializeGame, parseSave, migrateV8 } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { artTier } from '../src/objects/BuildingView.js';
import { artTierOf, levelArtKey } from '../src/assetPlan.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A GameState at Village Hall `vh` (tutorial done) with one Storage per entry of `levels`. */
function village(vh, levels) {
  const gs = new GameState({ storage: memoryStorage() });
  gs.startNew();
  gs.buildings[0].level = vh;
  gs.tutorialDone = true;
  levels.forEach((l, i) => gs.buildings.push(createBuilding(gs, 'storage', 4 + i * 3, 22, l)));
  return gs;
}
const storages = (s) => s.buildings.filter((b) => b.type === 'storage');
// The old (v0.12) table: what an old save's Storages were.
const OLD = [
  { cost: 100, capacity: 1000 }, { cost: 200, capacity: 2000 }, { cost: 400, capacity: 3500 }, { cost: 800, capacity: 5500 },
  { cost: 1600, capacity: 8000 }, { cost: 3200, capacity: 12000 }, { cost: 6400, capacity: 18000 },
  { cost: 12800, capacity: 27000 }, { cost: 25600, capacity: 40500 }, { cost: 51200, capacity: 61000 }
];

describe('v0.13: Storage levels 1-20', () => {
  it('has 20 levels: capacity and HP grow every level, Levels 1-10 hold what they did', () => {
    const L = CONFIG.storage.levels;
    expect(maxLevel('storage')).toBe(20);
    for (let i = 1; i < L.length; i++) {
      expect(L[i].capacity).toBeGreaterThan(L[i - 1].capacity);
      expect(L[i].hp).toBeGreaterThan(L[i - 1].hp);
    }
    for (let i = 0; i < 10; i++) expect(L[i].capacity).toBe(OLD[i].capacity);
  });

  it('upgrades cost less gold than before (the shop price stays 100)', () => {
    const L = CONFIG.storage.levels;
    expect(L[0].cost).toBe(100);
    // Upgrading to Level N (N >= 2) costs less than the old upgrade to the same level.
    for (let i = 1; i < 10; i++) expect(L[i].cost).toBeLessThan(OLD[i].cost);
    // Getting a Storage up to the old top capacity (61,000: Level 10, old and new) costs under half what it did.
    const total = (t, n) => t.slice(1, n).reduce((s, l) => s + l.cost, 0);
    expect(L[9].capacity).toBe(OLD[9].capacity);
    expect(total(L, 10)).toBeLessThan(total(OLD, 10) / 2);
  });

  it('10 pictures: a new Level 1, the old five on Levels 2-11, new ones on 12-15, which 16-20 keep', () => {
    const want = [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 9, 10, 10, 10, 10, 10, 10];
    for (let l = 1; l <= 20; l++) {
      expect(artTier(l, 'storage'), `Level ${l}`).toBe(want[l - 1]);
      expect(artTierOf(l, 'storage')).toBe(want[l - 1]);
      expect(levelArtKey('storage', l)).toBe(`bld_storage_lv${want[l - 1]}`);
    }
  });
});

describe('v0.13: older saves (version 8) move every Storage up one level', () => {
  const oldSave = (vh, levels) => ({ ...serializeGame(village(vh, levels)), version: 8 });

  it('old Level N becomes N + 1 (same picture, at least the same capacity); the save stays valid', () => {
    const p = parseSave(JSON.stringify(oldSave(9, [1, 4, 9])));
    expect(p.status).toBe('ok');
    expect(storages(p.data).map((b) => b.level)).toEqual([2, 5, 10]);
    for (const [from, to] of [[1, 2], [4, 5], [9, 10]]) {
      expect(artTier(to, 'storage')).toBe(Math.ceil(from / 2) + 1); // the old picture N, now picture N + 1
      expect(CONFIG.storage.levels[to - 1].capacity).toBeGreaterThanOrEqual(OLD[from - 1].capacity);
    }
  });

  it('a Storage at its hall\'s level goes one above it: kept, but it can\'t upgrade until the hall catches up', () => {
    const p = parseSave(JSON.stringify(oldSave(10, [10])));
    expect(p.status).toBe('ok');
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(p.data);
    gs.gold = 1e6;
    const s = storages(gs)[0];
    expect(s.level).toBe(11);
    expect(checkUpgrade(gs, s)).toMatchObject({ ok: false, reason: 'Requires VH12' });
  });

  it('only Storages move; a new save is not migrated again', () => {
    const v8 = oldSave(5, [3]);
    const migrated = migrateV8(v8);
    expect(migrated.version).toBe(9);
    expect(migrated.buildings.filter((b) => b.type !== 'storage')).toEqual(v8.buildings.filter((b) => b.type !== 'storage'));
    const again = parseSave(JSON.stringify(serializeGame(village(5, [3]))));
    expect(storages(again.data)[0].level).toBe(3);
  });

  it('two levels above the hall is still invalid (only the one-level migration room is allowed)', () => {
    const save = serializeGame(village(5, [5]));
    storages(save)[0].level = 7;
    expect(parseSave(JSON.stringify(save)).status).toBe('invalid');
    storages(save)[0].level = 6;
    expect(parseSave(JSON.stringify(save)).status).toBe('ok');
  });
});

describe('v0.13.1: at most 6 Storages from Village Hall 11', () => {
  it('the cap stops at 6, and a village that already has more keeps them (and cannot build another)', () => {
    for (let vh = 11; vh <= 20; vh++) expect(limitFor('storage', vh)).toBe(6);
    const save = serializeGame(village(19, [19, 19, 19, 19, 19, 19, 19, 19, 19]));
    const p = parseSave(JSON.stringify(save));
    expect(p.status).toBe('ok');
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(p.data);
    gs.gold = 1e6;
    expect(storages(gs)).toHaveLength(9);
    expect(checkBuy(gs, 'storage').ok).toBe(false);
  });
});
