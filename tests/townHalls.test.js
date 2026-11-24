// v0.8: Village Halls 12-15 and fixed caps per hall (they replaced Village Hall 11's Bonus Slots). A village that
// built past a cap with Bonus Slots keeps every building; it just can't build more of that type until it's under the cap.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  BUILDING_TYPES, DEFENSE_TYPES, limitFor, checkBuy, checkUpgrade, roomFor, overCap, buildableCount, hallUnlocks, maxLevel,
  upgradeCost, createBuilding, footprintDims, countOwned
} from '../src/logic/buildings.js';
import { canPlaceRect } from '../src/logic/grid.js';
import { serializeGame, validateSave } from '../src/logic/save.js';
import { waveComposition, scaledWaveComposition, waveStrength, themesAt, debutKindsAt, nextWaveComposition } from '../src/logic/waves.js';
import { ENEMY_KINDS, hallWaveGrowth } from '../src/logic/enemies.js';
import { GameState } from '../src/state/GameState.js';
import { MAP } from '../src/mapTiles.js';
import { makeStateWithTownHall } from './helpers.js';

const MAX = 15;
const halls = Array.from({ length: MAX }, (_, i) => i + 1);

/** Put `n` buildings of `type` on free grass around the Village Hall (each with a tile of space around it). */
function place(s, type, n, level = 1) {
  const [hc, hr] = MAP.townHallAnchor;
  const { w, h } = footprintDims(type);
  for (let i = 0; i < n; i++) {
    let done = false;
    for (let rad = 2; rad < 40 && !done; rad++) {
      for (let dc = -rad; dc <= rad && !done; dc++) for (let dr = -rad; dr <= rad && !done; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        const c = hc + 1 + dc * 2, r = hr + 1 + dr * 2;
        if (canPlaceRect(s.buildings, c - 1, r - 1, w + 2, h + 2).ok) { s.buildings.push(createBuilding(s, type, c, r, level)); done = true; }
      }
    }
    if (!done) throw new Error(`no room for ${type}`);
  }
}

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('Village Halls 1-15: caps', () => {
  it('Village Hall 15 is the top level; every per-hall table has 15 entries', () => {
    expect(CONFIG.rules.maxTownHallLevel).toBe(MAX);
    expect(maxLevel('townHall')).toBe(MAX);
    expect(CONFIG.townHall.levels).toHaveLength(MAX);
    expect(upgradeCost('townHall', MAX)).toBeNull();
    for (const t of BUILDING_TYPES) expect(CONFIG.limits[t]).toHaveLength(MAX);
    expect(CONFIG.fuelStation.spellSlots).toHaveLength(MAX);
    expect(CONFIG.rules.bonusSlots).toBeUndefined(); // (Bonus Slots are gone)
    const s = makeStateWithTownHall({ gold: 1e9 }, MAX);
    expect(checkUpgrade(s, s.buildings[0])).toMatchObject({ ok: false, reason: 'Max level' });
  });

  it('the caps per hall (Village Halls 10-15) are exactly the agreed ones', () => {
    // [VH10, VH11, VH12, VH13, VH14, VH15]
    const expected = {
      ra: [2, 3, 4, 4, 5, 6],
      wizard: [4, 5, 6, 6, 6, 6],
      catapult: [1, 2, 2, 3, 3, 4],
      ksi: [3, 4, 4, 5, 5, 6],
      cannon: [6, 7, 8, 9, 10, 11], // (v0.10.1: one more Cannon and Locklair Tower per hall after 10)
      archer: [5, 6, 7, 8, 9, 10],
      mortar: [5, 5, 6, 6, 7, 8],
      spear: [3, 4, 4, 4, 5, 6],
      flock: [3, 3, 4, 4, 5, 6],
      firework: [3, 3, 4, 4, 4, 4],
      mousetrap: [5, 5, 5, 6, 6, 6],
      mine: [6, 7, 7, 7, 7, 8],
      storage: [5, 6, 6, 7, 7, 8],
      house: [5, 6, 6, 6, 6, 7],
      wall: [132, 144, 156, 168, 180, 192],
      townHall: [1, 1, 1, 1, 1, 1], rvlab: [1, 1, 1, 1, 1, 1], dj: [1, 1, 1, 1, 1, 1], fuelStation: [1, 1, 1, 1, 1, 1], altar: [1, 1, 1, 1, 1, 1],
      queenAltar: [1, 1, 1, 1, 1, 1] // the Hatsune Queen (from VH8)
    };
    expect(Object.keys(expected).sort()).toEqual([...BUILDING_TYPES].sort());
    for (const [t, caps] of Object.entries(expected)) expect([10, 11, 12, 13, 14, 15].map((th) => limitFor(t, th)), t).toEqual(caps);
  });

  it('what each new hall adds (hallUnlocks: the Village Hall panel lists it)', () => {
    const adds = (th) => Object.fromEntries(hallUnlocks(th).map((u) => [u.type, u.add]));
    expect(adds(11)).toEqual({ cannon: 1, archer: 1, wizard: 1, spear: 1, ksi: 1, ra: 1, catapult: 1, mine: 1, storage: 1, house: 1, wall: 12 });
    expect(adds(12)).toEqual({ cannon: 1, archer: 1, mortar: 1, wizard: 1, firework: 1, flock: 1, ra: 1, wall: 12 });
    expect(adds(13)).toEqual({ cannon: 1, archer: 1, ksi: 1, mousetrap: 1, catapult: 1, storage: 1, wall: 12 });
    expect(adds(14)).toEqual({ cannon: 1, archer: 1, mortar: 1, spear: 1, flock: 1, ra: 1, wall: 12 });
    expect(adds(15)).toEqual({ cannon: 1, archer: 1, mortar: 1, spear: 1, ksi: 1, flock: 1, ra: 1, catapult: 1, mine: 1, storage: 1, house: 1, wall: 12 });
    expect(hallUnlocks(16)).toEqual([]);
    expect(hallUnlocks(1)).toEqual([]);
    // Defenses first (shop order), walls last.
    expect(hallUnlocks(11).map((u) => u.type)).toEqual(['cannon', 'archer', 'wizard', 'spear', 'ksi', 'ra', 'catapult', 'mine', 'storage', 'house', 'wall']);
  });

  it('caps never go down from one hall to the next', () => {
    for (const t of BUILDING_TYPES) for (let th = 2; th <= MAX; th++) expect(limitFor(t, th), `${t} VH${th}`).toBeGreaterThanOrEqual(limitFor(t, th - 1));
  });

  it('Village Halls 11-15 add 5 to 8 defenses each (v0.10.1); every mergeable defense ends even at Village Hall 15', () => {
    const defenses = (th) => DEFENSE_TYPES.reduce((n, t) => n + limitFor(t, th), 0);
    expect(defenses(10)).toBe(40);
    expect([11, 12, 13, 14, 15].map(defenses)).toEqual([47, 54, 59, 65, 73]);
    // (Cannon and Locklair Tower grow by one every hall, the user's call; every other mergeable defense ends even.)
    for (const t of DEFENSE_TYPES) if (CONFIG.merges[t] && t !== 'cannon' && t !== 'archer') expect(limitFor(t, 15) % 2, t).toBe(0);
  });

  it('the shop allows each type up to its cap at Village Hall 13, then "Limit reached"', () => {
    const s = makeStateWithTownHall({ gold: 1e9, tutorialDone: true }, 13);
    place(s, 'ra', 3);
    expect(roomFor(s, 'ra')).toBe(1);
    expect(checkBuy(s, 'ra').ok).toBe(true);
    place(s, 'ra', 1);
    expect(checkBuy(s, 'ra')).toEqual({ ok: false, reason: 'Limit reached' });
    expect(roomFor(s, 'ra')).toBe(0);
  });
});

describe('Village Hall upgrades: cost, health, capacity', () => {
  const L = CONFIG.townHall.levels;
  const topStorage = CONFIG.storage.levels[CONFIG.storage.levels.length - 1].capacity;
  // The most gold a village can hold at a hall (every storage it may build at its top level, plus the hall).
  const maxGold = (th) => limitFor('storage', th) * topStorage + L[th - 1].capacity;

  it('every level costs more, holds more and is tougher than the one before', () => {
    for (let th = 2; th <= MAX; th++) {
      expect(L[th - 1].upgradeCost).toBeGreaterThan(L[th - 2].upgradeCost);
      expect(L[th - 1].hp).toBeGreaterThan(L[th - 2].hp);
      expect(L[th - 1].capacity).toBeGreaterThan(L[th - 2].capacity);
    }
    expect(L.slice(10).map((l) => l.upgradeCost)).toEqual([250000, 300000, 340000, 380000, 410000]);
    expect(L.slice(10).map((l) => l.hp)).toEqual([11180, 13975, 17469, 21836, 27295]);
    expect(L.slice(10).map((l) => l.capacity)).toEqual([5000, 5500, 6000, 6500, 7000]);
  });

  it('each upgrade fits in the gold the hall before it can hold (Village Halls 11-15)', () => {
    for (let th = 11; th <= MAX; th++) expect(L[th - 1].upgradeCost, `VH${th}`).toBeLessThanOrEqual(maxGold(th - 1));
  });
});

describe('a village over its caps (built with Bonus Slots before v0.8)', () => {
  // A Village Hall 11 village that put all 5 Bonus Slots into Towers of Rah: 2 (its old cap) + 5 = 7, cap now 3.
  function bonusVillage(th = 11) {
    const s = makeStateWithTownHall({ gold: 1e6, tutorialDone: true, tutorialStep: 99, wavesCleared: 40 }, th);
    s.capacity = 1e7;
    place(s, 'ra', 7, 8);
    place(s, 'cannon', 6, 10);
    place(s, 'storage', 6, 10);
    return s;
  }

  it('loads intact: the save is valid and every building comes back', () => {
    const save = serializeGame(bonusVillage());
    expect(validateSave(save)).toBe(true);
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(JSON.parse(JSON.stringify(save)));
    expect(countOwned(gs.buildings, 'ra')).toBe(7);
    expect(gs.buildings.filter((b) => b.type === 'ra').every((b) => b.level === 8 && !b.destroyed)).toBe(true);
    expect(gs.buildings).toHaveLength(save.buildings.length);
  });

  it("can't build another of that type until under the cap; upgrading, moving and other types still work", () => {
    const save = serializeGame(bonusVillage());
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(JSON.parse(JSON.stringify(save)));
    gs.gold = 900000;
    expect(limitFor('ra', 11)).toBe(3);
    expect(overCap(gs, 'ra')).toBe(4);
    expect(roomFor(gs, 'ra')).toBe(0);
    expect(checkBuy(gs, 'ra')).toEqual({ ok: false, reason: 'Limit reached' });
    expect(buildableCount(gs)).toBeGreaterThanOrEqual(0);
    // Other types fill their own caps (the cannon: 6 of 7).
    expect(checkBuy(gs, 'cannon').ok).toBe(true);
    // An over-cap Tower of Rah can be upgraded (to its top level 8 it already is: use a Level 7 one) and moved.
    const ra = gs.buildings.find((b) => b.type === 'ra');
    ra.level = 7;
    expect(checkUpgrade(gs, ra).ok).toBe(true);
    expect(gs.upgradeBuilding(ra.id).ok).toBe(true);
    expect(ra.level).toBe(8);
    const [hc, hr] = MAP.townHallAnchor;
    let moved = false;
    for (let dc = -14; dc <= 14 && !moved; dc++) for (let dr = -14; dr <= 14 && !moved; dr++) moved = gs.moveBuilding(ra.id, hc + dc, hr + dr).ok;
    expect(moved).toBe(true);
    expect(countOwned(gs.buildings, 'ra')).toBe(7);
    // Down to the cap still doesn't allow one more; under it does. (There's no selling since v0.8; this stands in
    // for a village that has fewer for any other reason, e.g. merging for mergeable types.)
    const drop = () => { const r = gs.buildings.find((b) => b.type === 'ra'); gs.buildings = gs.buildings.filter((b) => b !== r); };
    for (let i = 0; i < 4; i++) drop();
    expect(checkBuy(gs, 'ra').ok).toBe(false);
    drop();
    expect(checkBuy(gs, 'ra').ok).toBe(true);
  });

  it('higher halls raise the cap: still over at Village Hall 15 (6), so no more Towers of Rah there either', () => {
    const s = bonusVillage(15);
    expect(validateSave(serializeGame(s))).toBe(true);
    expect(overCap(s, 'ra')).toBe(1);
    expect(checkBuy(s, 'ra').ok).toBe(false);
    expect(overCap(s, 'cannon')).toBe(0);
  });
});

describe('waves at Village Halls 12-15', () => {
  const strength = (c) => waveStrength(c) * c.hpMultiplier;

  it('every base wave is valid: whole counts, its entrances, a finite health multiplier', () => {
    for (const th of halls) {
      const c = waveComposition(th);
      for (const k of ENEMY_KINDS) expect(Number.isInteger(c[k] || 0) && (c[k] || 0) >= 0, `${k} VH${th}`).toBe(true);
      expect(Number.isFinite(c.hpMultiplier) && c.hpMultiplier > 0).toBe(true);
      expect(c.spawnPaths).toBe([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8][th - 1]);
    }
  });

  it('each hall is tougher than the one before, gently past Village Hall 11 (topHallGrowth)', () => {
    for (let th = 2; th <= MAX; th++) expect(strength(waveComposition(th)), `VH${th}`).toBeGreaterThan(strength(waveComposition(th - 1)));
    const G = CONFIG.rules.topHallGrowth;
    expect(G.from).toBe(12);
    for (let th = 12; th <= MAX; th++) {
      const ratio = strength(waveComposition(th)) / strength(waveComposition(th - 1));
      expect(ratio, `VH${th}`).toBeGreaterThan(1.02);
      expect(ratio, `VH${th}`).toBeLessThan(1.15); // well under the x1.35 of Village Halls 6-11
    }
    // Village Halls up to 11 are what they were (the endless formula from the scripted Village Hall 5 wave).
    expect(hallWaveGrowth(5, 11)).toBeCloseTo(CONFIG.rules.endlessCountGrowth ** 6, 10);
    expect(hallWaveGrowth(5, 11, 'hp')).toBeCloseTo(CONFIG.rules.endlessHpGrowth ** 6, 10);
    expect(hallWaveGrowth(5, 15)).toBeCloseTo(CONFIG.rules.endlessCountGrowth ** 6 * G.count ** 4, 10);
    expect(hallWaveGrowth(11, 15, 'hp')).toBeCloseTo(G.hp ** 4, 10);
    expect(waveComposition(15).hpMultiplier).toBe(Math.round(waveComposition(11).hpMultiplier * G.hp ** 4 * 100) / 100);
  });

  it('no new enemies past wave stage 11 (wave 48): same themes and debut waves; higher stages are capped at 15', () => {
    const S = CONFIG.rules.waveStages;
    for (let st = 12; st <= MAX; st++) {
      expect(themesAt(st)).toEqual(themesAt(11));
      expect(debutKindsAt(S[st - 1])).toEqual(debutKindsAt(S[10]));
    }
    expect(scaledWaveComposition(20, 1)).toEqual(scaledWaveComposition(15, 1));
  });

  it('late waves stay under the crowd cap (plain, themed and Boss Waves)', () => {
    for (const n of [1, 9, 10, 25, 50, 100, 200]) {
      const s = makeStateWithTownHall({ wavesCleared: n - 1, debuted: debutKindsAt(1000) }, 15);
      const c = nextWaveComposition(s);
      const troops = ENEMY_KINDS.filter((k) => !CONFIG.enemies[k].boss).reduce((a, k) => a + (c[k] || 0), 0);
      expect(troops).toBeLessThanOrEqual(CONFIG.rules.crowdCap.maxEnemies + 5);
      expect(Number.isFinite(c.hpMultiplier) && Number.isFinite(c.pack)).toBe(true);
    }
  });
});
