// v0.14: Shakes (research points, `rp`, shown as Shakes): Shake Collectors, the Village Hall's trickle, the cap from the
// hall plus Shake Storages (the RV Lab no longer sets it), the counts per hall, the "biggest price fits" rule, and older
// saves over the new cap.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { checkBuy, checkUpgrade, limitFor, maxLevel, levelStats, ECONOMY_TYPES } from '../src/logic/buildings.js';
import { rpCap, addResearchPoints, spendResearchPoints, hallShakeCapacity, shakeStorageCapacity, rpText, RP_NAME } from '../src/logic/researchPoints.js';
import {
  produceShakeCollectors, collectShakes, collectorShowsIcon, collectorStockCap, produceHallShakes, hallShakeRate,
  shakeFill, shakeStorageDrainAmount
} from '../src/logic/shakes.js';
import { damageBuilding } from '../src/logic/combat.js';
import { simulate } from '../src/logic/simulate.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { villageStats } from '../src/logic/achievements.js';
import { createBuilding, footprintDims } from '../src/logic/buildings.js';
import { canPlaceRect } from '../src/logic/grid.js';
import { TUTORIAL_DONE_STEP } from '../src/logic/tutorial.js';
import { MAP } from '../src/mapTiles.js';
import { makeStateWithTownHall, addBuilding, shakeCapAt, shakePricesAt, maxShakePriceAt, topLevelAt } from './helpers.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
/** A fresh GameState at Village Hall `th` with the tutorial done (as accountsAndSaves.test.js). */
function village(th) {
  const gs = new GameState({ storage: memoryStorage(), rng: () => 0.5 });
  gs.startNew();
  gs.buildings[0].level = th;
  gs.tutorialDone = true;
  gs.tutorialStep = TUTORIAL_DONE_STEP;
  return gs;
}
/** Put a building on the first free grass spot. */
function place(state, type, level = 1) {
  const { w, h } = footprintDims(type);
  for (let row = 0; row < MAP.rows; row++) for (let col = 0; col < MAP.cols; col++) {
    if (canPlaceRect(state.buildings, col, row, w, h).ok) {
      const b = createBuilding(state, type, col, row, level);
      state.buildings.push(b);
      return b;
    }
  }
  throw new Error(`no room for ${type}`);
}
const activeWave = (s) => { s.wave = { ...s.wave, phase: 'active', number: 3 }; };

describe('Shakes: the name and the buildings', () => {
  it('raises storage room at every level and fits more than two benchmark night raids at Hall 20', () => {
    const before = [500, 700, 1000, 1300, 1700, 2100, 2600, 3000, 3400, 3800, 4200, 4800];
    for (let i = 0; i < before.length; i++) {
      expect(shakeStorageCapacity(i + 1)).toBeGreaterThan(before[i]);
      if (i) expect(shakeStorageCapacity(i + 1)).toBeGreaterThan(shakeStorageCapacity(i));
    }
    expect(shakeCapAt(20)).toBe(27_000);
    expect(shakeCapAt(20)).toBeGreaterThan(2 * 7_730); // Wave 60 night bounty, clear reward, and three-star bonus
  });

  it('players read Shakes', () => {
    expect(RP_NAME).toBe('Shakes');
    expect(rpText(1)).toBe('1 Shake');
    expect(rpText(2500)).toBe('2,500 Shakes');
  });

  it('two new economy buildings: Shake Collector (10 levels) and Shake Storage (16 levels), from Village Hall 3, for gold', () => {
    expect(ECONOMY_TYPES).toEqual(expect.arrayContaining(['shakeCollector', 'shakeStorage']));
    expect(maxLevel('shakeCollector')).toBe(10);
    expect(maxLevel('shakeStorage')).toBe(16);
    for (const t of ['shakeCollector', 'shakeStorage']) {
      expect(CONFIG[t].unlockTownHall).toBe(3);
      expect(CONFIG[t].levels.every((l) => !l.costCurrency)).toBe(true); // gold
      const s2 = makeStateWithTownHall({ gold: 1e6 }, 2);
      expect(checkBuy(s2, t)).toMatchObject({ ok: false, reason: 'Requires VH3' });
      expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 3), t).ok).toBe(true);
    }
  });

  it('counts per hall: Collectors 1 at VH3, 2 at VH6, 3 at VH10, 4 at VH14; Storages 1 at VH3, 2 at VH8 (never more)', () => {
    const at = (t) => Array.from({ length: 20 }, (_, i) => limitFor(t, i + 1));
    expect(at('shakeCollector')).toEqual([0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4]);
    expect(at('shakeStorage')).toEqual([0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
    const s = makeStateWithTownHall({ gold: 1e6 }, 7);
    addBuilding(s, 'shakeStorage', 5, 5);
    expect(checkBuy(s, 'shakeStorage')).toMatchObject({ ok: false, reason: 'Limit reached' });
    s.buildings[0].level = 8;
    expect(checkBuy(s, 'shakeStorage').ok).toBe(true);
  });

  it('each level needs the usual Village Hall (no higher than the hall)', () => {
    const s = makeStateWithTownHall({ gold: 1e6 }, 4);
    const c = addBuilding(s, 'shakeCollector', 5, 5, 4);
    expect(checkUpgrade(s, c)).toMatchObject({ ok: false, reason: 'Requires VH5', currency: 'gold' });
    c.level = 3;
    expect(checkUpgrade(s, c)).toMatchObject({ ok: true, currency: 'gold', cost: levelStats('shakeCollector', 4).cost });
  });

  it('a Collector is worth far less than a Bitcoin Mine of the same level (at 15 gold a Shake)', () => {
    for (let l = 1; l <= 10; l++) {
      const shakeValue = levelStats('shakeCollector', l).production * CONFIG.rules.burgerGoldValue;
      expect(shakeValue).toBeLessThan(levelStats('mine', l).production * 0.35);
    }
  });
});

describe('Shake Collectors: production and collecting', () => {
  it('fills its stock at its rate up to the cap, not while destroyed', () => {
    const s = makeStateWithTownHall({}, 5);
    const c = addBuilding(s, 'shakeCollector', 5, 5, 3);
    produceShakeCollectors(s, 100);
    expect(c.stock).toBeCloseTo(levelStats('shakeCollector', 3).production * 100, 6);
    produceShakeCollectors(s, 1e6);
    expect(c.stock).toBe(collectorStockCap(c));
    c.stock = 0; c.destroyed = true;
    produceShakeCollectors(s, 1000);
    expect(c.stock).toBe(0);
  });

  it('shows its Shake from the mine coin threshold, and a click collects into the balance', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 5);
    const c = addBuilding(s, 'shakeCollector', 5, 5, 1);
    c.stock = collectorStockCap(c) * CONFIG.rules.mineCoinIconThreshold - 1;
    expect(collectorShowsIcon(c)).toBe(false);
    c.stock = 40.7;
    expect(collectorShowsIcon(c)).toBe(true);
    expect(collectShakes(s, c)).toEqual({ collected: 40, full: false });
    expect(s.researchPoints).toBe(40);
    expect(c.stock).toBeCloseTo(0.7, 6);
    expect(s.events.some((e) => e.name === 'shakesCollected' && e.data.amount === 40)).toBe(true);
  });

  it('is locked during a wave (it keeps filling), and only collects up to the room under the cap', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 5);
    const c = addBuilding(s, 'shakeCollector', 5, 5, 5);
    c.stock = 100;
    activeWave(s);
    expect(collectShakes(s, c)).toMatchObject({ collected: 0, waveActive: true });
    produceShakeCollectors(s, 10);
    expect(c.stock).toBeGreaterThan(100);
    s.wave.phase = 'idle';
    c.stock = 100;
    s.researchPoints = rpCap(s) - 30;
    expect(collectShakes(s, c).collected).toBe(30);
    expect(c.stock).toBe(70);
    expect(collectShakes(s, c)).toEqual({ collected: 0, full: true });
  });

  it('GameState.collect works for a Collector and says why when it can\'t', () => {
    const gs = village(5);
    const c = place(gs, 'shakeCollector', 2);
    c.stock = 50;
    gs.researchPoints = 0;
    expect(gs.collect(c.id)).toMatchObject({ ok: true, collected: 50 });
    c.stock = 50;
    gs.researchPoints = rpCap(gs);
    expect(gs.collect(c.id)).toMatchObject({ ok: false, reason: 'Shakes full' });
  });

  it.each(['mine', 'shakeCollector'])('collects %s once, saves the transfer, and keeps partial stock', (type) => {
    const gs = village(5);
    const b = place(gs, type);
    const shakes = type === 'shakeCollector';
    if (shakes) gs.researchPoints = rpCap(gs) - 3;
    else gs.gold = gs.capacity - 3;
    b.stock = 9.5;
    expect(gs.collectionStatus(b.id)).toEqual({ shakes, amount: 3, reason: '' });
    expect(gs.collect(b.id)).toMatchObject({ ok: true, collected: 3 });
    expect(gs.collectionStatus(b.id)).toEqual({ shakes, amount: 0, reason: 'Storage full' });
    for (let i = 0; i < 5; i++) expect(gs.collect(b.id).ok).toBe(false);
    expect(gs.collect('another-village-id').ok).toBe(false);
    expect(b.stock).toBe(6.5);
    const saved = parseSave(gs.storage.getItem('ibtd.save'));
    expect(saved.status).toBe('ok');
    expect(saved.data.buildings.find((x) => x.id === b.id).stock).toBe(6.5);
    expect(shakes ? saved.data.researchPoints : saved.data.gold).toBe(shakes ? rpCap(gs) : gs.capacity);
    activeWave(gs);
    expect(gs.collectionStatus(b.id).reason).toBe('Not during a wave');
    expect(gs.collect(b.id).ok).toBe(false);
  });

  it('its stock is saved and comes back (clamped to its cap)', () => {
    const gs = village(5);
    const c = place(gs, 'shakeCollector', 2);
    c.stock = 33.333;
    const saved = serializeGame(gs);
    expect(saved.buildings.find((b) => b.type === 'shakeCollector').stock).toBe(33.33);
    const p = parseSave(JSON.stringify(saved));
    expect(p.status).toBe('ok');
    const back = new GameState({ storage: memoryStorage() });
    back.loadFromSave(p.data);
    expect(back.buildings.find((b) => b.type === 'shakeCollector').stock).toBe(33.33);
    // A stock on a building that has none is a broken save.
    saved.buildings.find((b) => b.type === 'townHall').stock = 5;
    expect(parseSave(JSON.stringify(saved)).status).not.toBe('ok');
  });
});

describe('the Village Hall makes a trickle of Shakes (like its gold)', () => {
  it('pays its rate in batches straight into the balance, day and night; nothing from the ruin', () => {
    expect(hallShakeRate(0)).toBe(0);
    expect(hallShakeRate(1) * 60).toBeCloseTo(1, 6);
    expect(hallShakeRate(20) * 60).toBeCloseTo(10.5, 6);
    const s = makeStateWithTownHall({ researchPoints: 0 }, 5);
    produceHallShakes(s, 600);
    expect(s.researchPoints).toBe(Math.floor(hallShakeRate(5) * 600));
    expect(s.events.filter((e) => e.name === 'hallShakes').length).toBe(s.researchPoints);
    const ruin = makeStateWithTownHall({ researchPoints: 0 }, 0);
    produceHallShakes(ruin, 600);
    expect(ruin.researchPoints).toBe(0);
  });

  it('runs in the simulation, and stops at the cap (no "lost" notes)', () => {
    const s = makeStateWithTownHall({ researchPoints: 0, clock: { phase: 'day', t: 0 } }, 3);
    for (let i = 0; i < 605; i++) simulate(s, 0.1); // a minute (and a bit) at Village Hall 3: 2 Shakes
    expect(s.researchPoints).toBe(2);
    s.researchPoints = rpCap(s);
    const before = s.events.length;
    for (let i = 0; i < 1200; i++) simulate(s, 0.1);
    expect(s.researchPoints).toBe(rpCap(s));
    expect(s.events.slice(before).some((e) => e.name === 'researchPointsChanged' && e.data.lost > 0)).toBe(false);
  });
});

describe('the Shake cap: the Village Hall\'s store plus every Shake Storage', () => {
  it('the hall holds 100 x its level; each Storage adds its capacity; the RV Lab adds nothing', () => {
    expect(CONFIG.rules.rpCaps).toBeUndefined();
    for (let l = 1; l <= 20; l++) expect(hallShakeCapacity(l)).toBe(100 * l);
    const s = makeStateWithTownHall({}, 8);
    expect(rpCap(s)).toBe(800);
    addBuilding(s, 'rvlab', 30, 30, 5);
    expect(rpCap(s)).toBe(800);
    const a = addBuilding(s, 'shakeStorage', 5, 5, 4);
    const b = addBuilding(s, 'shakeStorage', 9, 5, 8);
    expect(rpCap(s)).toBe(800 + shakeStorageCapacity(4) + shakeStorageCapacity(8));
    a.destroyed = true; // ruins still count, so a raid never shrinks the cap
    expect(rpCap(s)).toBe(800 + shakeStorageCapacity(4) + shakeStorageCapacity(8));
    expect(b.level).toBe(8);
  });

  it('Shakes earned past the cap are lost and reported', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 3);
    const cap = rpCap(s);
    expect(addResearchPoints(s, cap + 50)).toBe(cap);
    expect(s.events.filter((e) => e.name === 'researchPointsChanged').at(-1).data.lost).toBe(50);
    expect(addResearchPoints(s, 10)).toBe(0);
    addBuilding(s, 'shakeStorage', 5, 5, 1);
    expect(addResearchPoints(s, 10)).toBe(10);
  });

  it('every Shake Storage shows the share of the cap the village holds (over the cap counts as full)', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 3);
    addBuilding(s, 'shakeStorage', 5, 5, 1);
    expect(shakeFill(s)).toBe(0);
    s.researchPoints = rpCap(s) / 2;
    expect(shakeFill(s)).toBe(0.5);
    s.researchPoints = rpCap(s) * 3;
    expect(shakeFill(s)).toBe(1);
  });

  it('an enemy hitting a Shake Storage spills Shakes (as a Storage spills gold); the hall\'s own store is never drained', () => {
    const s = makeStateWithTownHall({ researchPoints: 0, gold: 0 }, 5);
    const st = addBuilding(s, 'shakeStorage', 5, 5, 5);
    s.researchPoints = rpCap(s);
    const before = s.researchPoints;
    const lost = shakeStorageDrainAmount(s, st, st.hp);
    expect(lost).toBe(Math.round(CONFIG.rules.storageDrainOnDestroy * before * shakeStorageCapacity(5) / rpCap(s)));
    damageBuilding(s, st, st.hp);
    expect(st.destroyed).toBe(true);
    expect(s.researchPoints).toBe(before - lost);
    expect(s.events.some((e) => e.name === 'shakesDrained')).toBe(true);
  });

  it('Mr. Least goes for the Shake buildings too, like the gold ones', () => {
    expect(CONFIG.enemies.thief.prefers).toEqual(expect.arrayContaining(['mine', 'storage', 'shakeCollector', 'shakeStorage']));
  });
});

describe('balance: the biggest Shake price open at each Village Hall fits its Shake cap', () => {
  it('Village Halls 1-20: the hall plus its allowed Shake Storages at their top level hold every Shake price there', () => {
    const misses = [];
    for (let vh = 1; vh <= CONFIG.rules.maxTownHallLevel; vh++) {
      const cap = shakeCapAt(vh);
      for (const [what, price] of shakePricesAt(vh)) if (price > cap) misses.push(`VH${vh}: ${what} ${price} > cap ${cap}`);
    }
    expect(misses).toEqual([]);
  });

  it('the helper sees the real prices (hero levels to 10,000, merges, perks, the Fuel Station) and the real cap', () => {
    expect(maxShakePriceAt(2)).toBe(CONFIG.fuelStation.spells.rage.brewCost);
    expect(maxShakePriceAt(8)).toBe(5600); // highest Tower of Rah Mastery
    expect(maxShakePriceAt(15)).toBe(10000);
    expect(shakePricesAt(10).map(([w]) => w)).toEqual(expect.arrayContaining(['merge cannon', 'perk tier 5', 'path reset', 'mageAltar Lv10']));
    // shakeCapAt matches what rpCap gives a village built that way.
    for (const vh of [3, 7, 8, 12, 20]) {
      const s = makeStateWithTownHall({}, vh);
      for (let i = 0; i < limitFor('shakeStorage', vh); i++) addBuilding(s, 'shakeStorage', 4 + i * 4, 4, topLevelAt('shakeStorage', vh));
      expect(rpCap(s)).toBe(shakeCapAt(vh));
    }
  });

  it('the cap only grows with the hall', () => {
    for (let vh = 2; vh <= 20; vh++) expect(shakeCapAt(vh)).toBeGreaterThan(shakeCapAt(vh - 1));
  });
});

describe('older saves: a balance over the new cap stays', () => {
  it('loads with every Shake, can be spent, and takes no income until it drops below the cap', () => {
    // A Village Hall 12 village from v0.13 with a Level 5 RV Lab (cap 10,000 then) and no Shake Storage yet.
    const gs = village(12);
    place(gs, 'rvlab', 5);
    gs.researchPoints = 9500;
    const p = parseSave(JSON.stringify(serializeGame(gs)));
    expect(p.status).toBe('ok');
    const back = new GameState({ storage: memoryStorage() });
    back.loadFromSave(p.data);
    expect(rpCap(back)).toBe(1200);
    expect(back.researchPoints).toBe(9500);
    expect(addResearchPoints(back, 100)).toBe(0); // income stops...
    expect(back.researchPoints).toBe(9500);       // ...but nothing is taken away
    produceHallShakes(back, 3600);
    expect(back.researchPoints).toBe(9500);
    expect(spendResearchPoints(back, 9000)).toBe(true); // still spendable
    expect(addResearchPoints(back, 100)).toBe(100);     // and once under the cap, Shakes come in again
  });
});

describe('achievement: a Shake Storage at its top level', () => {
  it('counts as Shake Vault', () => {
    const s = makeStateWithTownHall({}, 12);
    const st = addBuilding(s, 'shakeStorage', 5, 5, 11);
    expect(villageStats(s).shakeVault).toBe(0);
    st.level = 16;
    expect(villageStats(s).shakeVault).toBe(1);
  });
});

describe('pictures: they grow every level and stay inside their plot', () => {
  it('levels that keep their picture grow (2, 4, 6 ...), and the top size stays inside the plot rim', async () => {
    const { levelSizeFactor, spriteScale, TIER_GROWTH, LEVEL_SIZE } = await import('../src/objects/BuildingView.js');
    for (const [type, top] of [['shakeCollector', 10], ['shakeStorage', 12]]) {
      for (let l = 2; l <= top; l++) {
        const grew = levelSizeFactor(l, top, type) > levelSizeFactor(l - 1, top, type);
        expect(grew, `${type} Lv${l}`).toBe(l % 2 === 0); // odd levels bring a new, bigger picture instead
      }
    }
    // The Collector's pictures get squatter, so each one is sized 4% taller than the last (TIER_GROWTH); measured on the
    // prepared art its Level 10 is about 73% of the footprint wide, the Storage's Level 12 about 71%: inside the rim (92%).
    expect(TIER_GROWTH.shakeCollector).toBe(0.04);
    expect(spriteScale('shakeCollector') * LEVEL_SIZE.min).toBeLessThan(0.75 * LEVEL_SIZE.min); // Level 1 smaller than a default building
    expect(spriteScale('shakeStorage') * LEVEL_SIZE.max).toBeLessThan(0.92);
  });
});
