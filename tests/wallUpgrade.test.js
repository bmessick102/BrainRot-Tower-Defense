// Walls upgrade all at once ("Upgrade Walls"): one village-wide wall level, new walls start at it.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  createBuilding, checkUpgrade, checkWallUpgrade, wallLevel, commonWallLevel, wallBuildCost, buildCost, checkBuy,
  upgradeCost, totalSpent, limitFor, maxLevel
} from '../src/logic/buildings.js';
import { serializeGame, parseSave, deserializeGame, validateSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A GameState at Village Hall `vh` (tutorial done) with `n` walls at level 1 in a row. */
function village(vh, n = 0, gold = 0) {
  const gs = new GameState({ storage: memoryStorage() });
  gs.startNew();
  gs.buildings[0].level = vh;
  gs.tutorialDone = true;
  for (let i = 0; i < n; i++) gs.buildings.push(createBuilding(gs, 'wall', 4 + i, 22, 1, null, 'x'));
  gs.gold = gold;
  return gs;
}
const walls = (s) => s.buildings.filter((b) => b.type === 'wall');
const prices = () => CONFIG.walls.levels.map((l) => l.cost);

describe('wall prices', () => {
  it('are cheap per level, and wall HP is unchanged', () => {
    expect(prices()).toEqual([10, 20, 40, 80, 150, 300, 500, 800]);
    expect(CONFIG.walls.levels.map((l) => l.hp)).toEqual([400, 550, 800, 1150, 1600, 2200, 2980, 3800]);
  });

  it('a full set of walls upgrades to a newly unlocked level for well under the gold that hall can hold', () => {
    for (let level = 2; level <= maxLevel('wall'); level++) {
      const vh = CONFIG.walls.levels[level - 1].townHall;
      const full = limitFor('wall', vh) * upgradeCost('wall', level - 1);
      const s = CONFIG.storage.levels[vh - 1].capacity;
      const capacity = CONFIG.townHall.levels[vh - 1].capacity + limitFor('storage', vh) * s;
      expect(full).toBeLessThanOrEqual(capacity * 0.5);
    }
    // The top level for all 132 walls at Village Hall 10.
    expect(limitFor('wall', 10) * upgradeCost('wall', 7)).toBe(105600);
  });
});

describe('Upgrade Walls (every wall at once)', () => {
  it('costs walls placed x the next level price, and raises every wall', () => {
    const gs = village(3, 5, 1000);
    const check = checkWallUpgrade(gs);
    expect(check).toMatchObject({ ok: true, count: 5, level: 2, each: prices()[1], cost: 5 * prices()[1], currency: 'gold' });
    const events = [];
    gs.on('wallsUpgraded', (d) => events.push(d));
    expect(gs.upgradeWalls()).toMatchObject({ ok: true, level: 2, count: 5, cost: 5 * prices()[1] });
    expect(gs.gold).toBe(1000 - 5 * prices()[1]);
    expect(gs.wallLevel).toBe(2);
    expect(walls(gs).every((w) => w.level === 2 && w.hp === CONFIG.walls.levels[1].hp)).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].ids).toHaveLength(5);
  });

  it('a wall\'s Upgrade (upgradeBuilding / checkUpgrade) is Upgrade Walls', () => {
    const gs = village(3, 3, 1000);
    const w = walls(gs)[0];
    expect(checkUpgrade(gs, w)).toEqual(checkWallUpgrade(gs));
    expect(gs.upgradeBuilding(w.id).ok).toBe(true);
    expect(walls(gs).map((b) => b.level)).toEqual([2, 2, 2]);
  });

  it('is all or nothing: short on gold, no wall is upgraded', () => {
    const gs = village(3, 5, 5 * prices()[1] - 1);
    expect(gs.upgradeWalls()).toMatchObject({ ok: false, reason: 'Need 1 more gold' });
    expect(walls(gs).every((w) => w.level === 1)).toBe(true);
    expect(gs.wallLevel).toBe(1);
  });

  it('is gated by the Village Hall (levels unlock at VH 1, 2, 3, 5, 7, 8, 9, 10)', () => {
    expect(CONFIG.walls.levels.map((l) => l.townHall)).toEqual([1, 2, 3, 5, 7, 8, 9, 10]);
    expect(checkWallUpgrade(village(1, 2, 1e6))).toMatchObject({ ok: false, reason: 'Requires VH2' });
    const vh4 = village(4, 2, 1e6);
    vh4.wallLevel = 3;
    expect(checkWallUpgrade(vh4)).toMatchObject({ ok: false, reason: 'Requires VH5' });
    const vh5 = village(5, 2, 1e6);
    vh5.wallLevel = 3;
    expect(checkWallUpgrade(vh5)).toMatchObject({ ok: true, level: 4 });
    const vh9 = village(9, 2, 1e6);
    vh9.wallLevel = 7;
    expect(checkWallUpgrade(vh9)).toMatchObject({ ok: false, reason: 'Requires VH10' });
    const vh10 = village(10, 2, 1e6);
    vh10.wallLevel = 8;
    expect(checkWallUpgrade(vh10)).toMatchObject({ ok: false, reason: 'Max level', cost: null });
  });

  it('not during a wave, and not with no walls', () => {
    const gs = village(5, 2, 1e6);
    gs.wave.phase = 'active';
    expect(checkWallUpgrade(gs).reason).toBe('Not during a wave');
    expect(checkWallUpgrade(village(5, 0, 1e6)).reason).toBe('No walls yet');
  });

  it('there are no per-wall or wall-group upgrades any more', async () => {
    const mod = await import('../src/logic/buildings.js');
    expect(mod.wallGroup).toBeUndefined();
    expect(mod.planWallGroupUpgrade).toBeUndefined();
    expect(new GameState({ storage: memoryStorage() }).upgradeWallGroup).toBeUndefined();
  });
});

describe('new walls start at the village wall level', () => {
  it('a placed wall is at the current level and costs what one wall at that level has cost', () => {
    const gs = village(5, 2, 1e6);
    gs.upgradeWalls();
    gs.upgradeWalls();
    gs.upgradeWalls();
    expect(gs.wallLevel).toBe(4);
    expect(wallBuildCost(gs)).toBe(totalSpent('wall', 4));
    expect(buildCost('wall', gs)).toBe(10 + 20 + 40 + 80);
    expect(buildCost('wall')).toBe(10); // no state: the Level 1 price
    const before = gs.gold;
    const r = gs.placeNew('wall', 12, 22);
    expect(r.ok).toBe(true);
    const w = gs.getBuilding(r.id);
    expect(w.level).toBe(4);
    expect(w.hp).toBe(CONFIG.walls.levels[3].hp);
    expect(gs.gold).toBe(before - totalSpent('wall', 4));
  });

  it('the shop check uses that price', () => {
    const gs = village(5, 1, 0);
    gs.wallLevel = 3;
    gs.buildings.find((b) => b.type === 'wall').level = 3;
    gs.gold = totalSpent('wall', 3) - 1;
    expect(checkBuy(gs, 'wall')).toMatchObject({ ok: false, reason: 'Need 1 more gold' });
    gs.gold += 1;
    expect(checkBuy(gs, 'wall').ok).toBe(true);
  });
});

describe('saving the wall level', () => {
  const oldSave = (levels, vh = 10) => {
    const s = makeStateWithTownHall({ gold: 0, tutorialStep: 11, tutorialDone: true }, vh);
    levels.forEach((l, i) => s.buildings.push(createBuilding(s, 'wall', 4 + i, 22, l, null, 'x')));
    const saved = serializeGame(s);
    delete saved.wallLevel; // from before the village-wide wall level
    return saved;
  };

  it('is saved and loaded', () => {
    const gs = village(5, 3, 1e6);
    gs.upgradeWalls();
    const saved = serializeGame(gs);
    expect(saved.wallLevel).toBe(2);
    const gs2 = new GameState({ storage: memoryStorage() });
    gs2.loadFromSave(parseSave(JSON.stringify(saved)).data);
    expect(gs2.wallLevel).toBe(2);
    expect(walls(gs2).every((w) => w.level === 2)).toBe(true);
  });

  it('older saves take their walls\' most common level (ties: the higher), and every wall is brought to it', () => {
    const r = parseSave(JSON.stringify(oldSave([1, 3, 3, 2, 3, 5])));
    expect(r.status).toBe('ok');
    const data = deserializeGame(r.data);
    expect(data.wallLevel).toBe(3);
    expect(data.buildings.filter((b) => b.type === 'wall').map((b) => b.level)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(data.buildings.filter((b) => b.type === 'wall').every((b) => b.hp === CONFIG.walls.levels[2].hp)).toBe(true);
    expect(deserializeGame(parseSave(JSON.stringify(oldSave([2, 2, 4, 4, 1]))).data).wallLevel).toBe(4);
    expect(commonWallLevel([])).toBe(1);
    expect(deserializeGame(parseSave(JSON.stringify(oldSave([]))).data).wallLevel).toBe(1);
  });

  it('a plain state without a wall level reads it from its walls', () => {
    const s = makeStateWithTownHall({}, 10);
    [2, 2, 5].forEach((l, i) => s.buildings.push(createBuilding(s, 'wall', 4 + i, 22, l, null, 'x')));
    expect(wallLevel(s)).toBe(2);
    s.wallLevel = 5;
    expect(wallLevel(s)).toBe(5);
  });

  it('rejects a bad wall level', () => {
    const base = serializeGame(village(3, 2));
    expect(validateSave(base)).toBe(true);
    expect(validateSave({ ...base, wallLevel: 0 })).toBe(false);
    expect(validateSave({ ...base, wallLevel: 1.5 })).toBe(false);
    expect(validateSave({ ...base, wallLevel: 4 })).toBe(false); // above the Village Hall (3)
    expect(validateSave({ ...base, wallLevel: maxLevel('wall') + 1 })).toBe(false);
  });
});
