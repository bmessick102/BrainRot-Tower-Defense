// QA (item 32 + save edge cases): several players with several villages each, switching player / village,
// offline and concurrent tabs; saves from every old version, saves without the newer optional fields,
// corrupt or tampered saves, and a full round trip through every system a save carries.
import { describe, it, expect, beforeEach } from 'vitest';
import { Session, MAX_BASES } from '../src/net/session.js';
import { LocalBackend } from '../src/net/localBackend.js';
import { SupabaseBackend } from '../src/net/supabaseBackend.js';
import { GameState, setGameStorage, getStorage } from '../src/state/GameState.js';
import { serializeGame, parseSave, validateSave, loadGame, writeGame, SAVE_KEYS, SAVE_VERSION } from '../src/logic/save.js';
import { createBuilding, footprintDims } from '../src/logic/buildings.js';
import { getCapacity } from '../src/logic/economy.js';
import { canPlaceRect } from '../src/logic/grid.js';
import { rpCap } from '../src/logic/researchPoints.js';
import { lockedPath } from '../src/logic/abilities.js';
import { getWavePlan } from '../src/logic/waves.js';
import { hideAllTips, TIP_KEYS } from '../src/logic/tips.js';
import { FUEL_GUIDE } from '../src/logic/fuelGuide.js';
import { ensureHero } from '../src/logic/hero.js';
import { TUTORIAL_DONE_STEP } from '../src/logic/tutorial.js';
import { MAP } from '../src/mapTiles.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m
  };
}

function manualTimers() {
  const list = new Map();
  let n = 0;
  return {
    set: (fn) => { list.set(++n, fn); return n; },
    clear: (id) => list.delete(id),
    async runAll() { const fns = [...list.values()]; list.clear(); for (const f of fns) await f(); },
    get size() { return list.size; }
  };
}

/** Put a building on the first free grass spot (scanning from the top left). */
function place(state, type, level = 1, orient = 'x') {
  const { w, h } = footprintDims(type, orient);
  for (let row = 0; row < MAP.rows; row++) {
    for (let col = 0; col < MAP.cols; col++) {
      if (canPlaceRect(state.buildings, col, row, w, h).ok) {
        const b = createBuilding(state, type, col, row, level, null, orient);
        state.buildings.push(b);
        return b;
      }
    }
  }
  throw new Error(`no room for ${type}`);
}

/** A fresh GameState at Village Hall `th` with the tutorial done. */
function village(th = 3, storage = null) {
  const gs = new GameState({ storage, rng: () => 0.5 });
  gs.startNew();
  gs.buildings[0].level = th;
  gs.tutorialDone = true;
  gs.tutorialStep = TUTORIAL_DONE_STEP;
  return gs;
}

const strip = (s) => ({ ...s, savedAt: null });

// ---------------------------------------------------------------- saves
describe('a save carries every system and comes back the same', () => {
  it('perk path locks, RP at the cap, wall level, Fuel Station spells + guide, spear / fuel levels, hero nap, wave plan, tips', () => {
    const gs = village(10, memoryStorage());
    const lab = place(gs, 'rvlab', 5);
    place(gs, 'spear', 7);
    place(gs, 'fuelStation', 6);
    const altar = place(gs, 'altar', 6);
    place(gs, 'cannon', 8);
    const mine = place(gs, 'mine', 4);
    const dj = place(gs, 'dj', 1);
    for (let i = 0; i < 4; i++) place(gs, 'wall', 5, i % 2 ? 'y' : 'x');
    gs.wallLevel = 5;
    mine.stock = 12.5;
    dj.hype = 40;
    gs.research = { spear: ['b', 'b', 'b'], cannon: ['a', 'a'], fuelStation: ['c'] };
    gs.researchPoints = rpCap(gs); // right at the RV Lab level 5 cap
    expect(gs.researchPoints).toBeGreaterThan(0);
    gs.spells = ['rage', 'heal', 'freeze'];
    gs.fuelGuide = FUEL_GUIDE.cast;
    gs.labGuideStep = 99;
    // The Brisket King was knocked out last wave and is sleeping it off.
    const hero = ensureHero(gs);
    hero.status = 'asleep'; hero.knockedOut = true; hero.sleepT = 42.5;
    altar.heroSleep = 42.5;
    gs.wavesCleared = 37;
    gs.nightsAtMaxTownHall = 3;
    gs.clock = { phase: 'night', t: 12.34 };
    gs.gold = Math.min(1234, getCapacity(gs));
    getWavePlan(gs); // the next wave's corners
    hideAllTips(gs); // every tip seen, the Fuel Station ones (camelCase keys) too

    const saved = serializeGame(gs);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved).toMatchObject({ wallLevel: 5, spells: 'rage,heal,freeze', fuelGuide: FUEL_GUIDE.cast, labGuide: 99, researchPoints: gs.researchPoints });
    expect(saved.research).toEqual({ spear: 'bbb', cannon: 'aa', fuelStation: 'c' });
    expect(saved.buildings.find((b) => b.type === 'altar').heroSleep).toBe(42.5);
    expect(saved.wavePlan).toEqual(gs.wavePlan);

    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const back = new GameState({ storage: memoryStorage() });
    back.loadFromSave(parsed.data);
    expect(strip(serializeGame(back))).toEqual(strip(saved));
    // The parts that live outside the save object.
    expect(lockedPath(back, 'spear')).toBe('b');
    expect(back.researchPoints).toBe(rpCap(back));
    expect(back.tipsSeen.sort()).toEqual([...TIP_KEYS].sort());
    expect(back.buildings.filter((b) => b.type === 'wall').every((b) => b.level === 5)).toBe(true);
    expect(back.getBuilding(lab.id).level).toBe(5);
    const h = ensureHero(back);
    expect(h.status).toBe('asleep');
    expect(h.sleepT).toBe(42.5);
    expect(h.knockedOut).toBeFalsy(); // the knock-out itself isn't saved (saves never happen mid-wave)
  });

  it('"No more tips" (every tip, the Fuel Station ones too) still saves a loadable village', () => {
    const gs = village(2, memoryStorage());
    place(gs, 'fuelStation', 1);
    gs.tipsSeen = ['fuelBuild'];
    expect(parseSave(JSON.stringify(serializeGame(gs))).status).toBe('ok');
    hideAllTips(gs);
    expect(parseSave(JSON.stringify(serializeGame(gs))).status).toBe('ok');
  });
});

describe('saves from every old version load', () => {
  // Old saves only had the fields of their time: none of research, labGuide, tips, researchPoints, spells,
  // fuelGuide, wavePlan or wallLevel.
  const NEW_FIELDS = ['research', 'labGuide', 'tips', 'researchPoints', 'spells', 'fuelGuide', 'wavePlan', 'wallLevel'];
  const bare = (gs, version, extra = {}) => {
    const s = serializeGame(gs);
    for (const k of NEW_FIELDS) delete s[k];
    return { ...s, version, ...extra };
  };
  const loads = (obj) => {
    const p = parseSave(JSON.stringify(obj));
    expect(p.status).toBe('ok');
    expect(p.data.version).toBe(SAVE_VERSION);
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(p.data);
    // ...and saves again as a valid current save.
    expect(validateSave(JSON.parse(JSON.stringify(serializeGame(gs))))).toBe(true);
    return gs;
  };

  it('version 1: no clock, 3-tile walls, old tutorial steps', () => {
    const gs = village(4);
    place(gs, 'mine', 2).stock = 30;
    const seg = place(gs, 'wall', 1); // room for a 3-tile segment is checked below
    gs.buildings = gs.buildings.filter((b) => b !== seg);
    let wall = null;
    for (let row = 0; row < MAP.rows && !wall; row++) {
      for (let col = 0; col < MAP.cols && !wall; col++) {
        if (canPlaceRect(gs.buildings, col, row, 3, 1).ok) wall = { id: 'b50', type: 'wall', level: 7, col, row, orient: 'x' };
      }
    }
    const v1 = bare(gs, 1, { tutorialStep: 9, tutorialDone: false });
    delete v1.clock;
    delete v1.nightsAtMaxTownHall;
    v1.buildings.push(wall);
    const back = loads(v1);
    expect(back.clock.phase).toBe('day');
    const walls = back.buildings.filter((b) => b.type === 'wall');
    expect(walls.length).toBe(3);           // one per tile
    expect(walls.every((w) => w.level === 4)).toBe(true); // old level 7 of 10 -> ceil(7 / 2)
    expect(back.wallLevel).toBe(4);
    expect(back.tutorialStep).toBe(8);
    expect(back.spells).toEqual([]);
    expect(back.researchPoints).toBe(0);
    expect(back.wavePlan).toBe(null);
  });

  it('version 2 and 3', () => {
    const gs = village(6);
    place(gs, 'cannon', 5);
    const w = place(gs, 'wall', 1);
    w.level = 9;
    const v3 = bare(gs, 3);
    expect(loads(v3).buildings.find((b) => b.type === 'wall').level).toBe(5);
    const v2 = bare(gs, 2);
    v2.buildings = v2.buildings.filter((b) => b.type !== 'wall'); // (3-tile walls: see version 1)
    expect(loads(v2).buildings.length).toBe(2);
  });

  it('version 4: research bought per building', () => {
    const gs = village(10);
    place(gs, 'rvlab', 3);
    place(gs, 'cannon', 10);
    const v4 = bare(gs, 4, { research: { cannon: { a: [1], b: [1, 2], c: [] } }, labGuide: 3, researchPoints: 10 });
    v4.buildings.find((b) => b.type === 'cannon').picks = 'bb';
    const back = loads(v4);
    expect(back.research).toEqual({ cannon: ['b', 'b'] });
    expect(back.researchPoints).toBe(10 + 40); // A1 refunded at the old price
  });

  it('version 5: mixed paths', () => {
    const gs = village(10);
    place(gs, 'cannon', 10);
    const back = loads(bare(gs, 5, { research: { cannon: 'aab' }, researchPoints: 0 }));
    expect(back.research).toEqual({ cannon: ['a', 'a'] });
    expect(back.researchPoints).toBeGreaterThan(0);
  });

  it('version 6: spear and Fuel Station levels, no spells / guide / wave plan / wall level yet', () => {
    const gs = village(8);
    place(gs, 'spear', 4);
    place(gs, 'fuelStation', 3);
    for (let i = 0; i < 3; i++) place(gs, 'wall', i === 0 ? 2 : 3);
    const back = loads(bare(gs, 6));
    expect(back.buildings.find((b) => b.type === 'spear').level).toBe(7);
    expect(back.buildings.find((b) => b.type === 'fuelStation').level).toBe(5);
    expect(back.wallLevel).toBe(3); // the most common wall level
    expect(back.buildings.filter((b) => b.type === 'wall').every((b) => b.level === 3)).toBe(true);
    expect(back.fuelGuide).toBe(0);
  });

  it('version 7 without the optional fields', () => {
    const gs = village(5);
    place(gs, 'wall', 2);
    const back = loads(bare(gs, 7));
    expect(back.wallLevel).toBe(2);
  });
});

describe('corrupt or tampered saves are rejected without throwing', () => {
  const good = () => {
    const gs = village(5);
    place(gs, 'fuelStation', 3);
    place(gs, 'wall', 3);
    gs.wallLevel = 3;
    getWavePlan(gs);
    return JSON.parse(JSON.stringify(serializeGame(gs)));
  };
  const bad = (patch) => {
    const s = good();
    patch(s);
    expect(validateSave(s)).toBe(false);
    expect(parseSave(JSON.stringify(s)).status).toBe('invalid');
  };

  it('the untouched save is fine', () => { expect(validateSave(good())).toBe(true); });
  it('wall level', () => {
    for (const v of [0, 9, 6, 2.5, '3', null]) bad((s) => { s.wallLevel = v; }); // 6: above Village Hall 5
  });
  it('spells', () => {
    for (const v of ['rage,nuke', 5, 'rage,'.repeat(60), ['rage']]) bad((s) => { s.spells = v; });
  });
  it('Fuel Station guide', () => { for (const v of [7, -1, '2', 2.5]) bad((s) => { s.fuelGuide = v; }); });
  it('wave plan', () => {
    // (An entrance the map doesn't have, e.g. 'north' or v0.9.1's dropped 'left', isn't tampering: the plan is made again; save.test.js.)
    for (const v of ['top', { number: 0, paths: ['top'] }, { number: 3, paths: [] }, { number: 3 }, { number: 1.5, paths: ['top'] }]) {
      bad((s) => { s.wavePlan = v; });
    }
  });
  it('research: unknown type, bad picks, and mixed paths (locked since version 6)', () => {
    for (const v of [{ nope: 'a' }, { cannon: 'abcabc' }, { cannon: 'ab' }, { cannon: 'd' }, { cannon: 3 }, []]) bad((s) => { s.research = v; });
  });
  it('RP, tips, hype, hero nap, ruins', () => {
    bad((s) => { s.researchPoints = -5; });
    bad((s) => { s.researchPoints = 1.5; });
    bad((s) => { s.tips = 'fuel-build'; });
    bad((s) => { s.buildings[1].heroSleep = 10; }); // not an altar
    bad((s) => { s.buildings[1].hype = 10; });      // not the DJ
    bad((s) => { s.buildings[0].destroyed = true; }); // the hall is never a ruin in a save
  });
  it('structure', () => {
    for (const text of ['', 'null', '[]', '"x"', '{', '{"version":7}', JSON.stringify({ ...good(), version: 99 }), JSON.stringify({ ...good(), buildings: {} })]) {
      expect(() => parseSave(text)).not.toThrow();
      expect(parseSave(text).status).not.toBe('ok');
    }
  });
});

// ---------------------------------------------------------------- accounts
describe('several players, several villages each', () => {
  let device, server, timers;
  const tab = () => new Session({ backend: new LocalBackend(server), storage: device, timers });
  const saveOf = (th, gold) => {
    const gs = village(th);
    gs.gold = Math.min(gold, getCapacity(gs));
    return serializeGame(gs);
  };

  beforeEach(() => {
    device = memoryStorage();
    server = memoryStorage();
    timers = manualTimers();
  });

  it("never see or overwrite each other's villages; each has their own limit", async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    const a1 = await ann.createBase('Ann 1');
    writeGame(ann.storage, village(3));
    const a2 = await ann.createBase('Ann 2');
    writeGame(ann.storage, village(4));
    await timers.runAll();
    await ann.signOut();

    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    expect(bob.bases).toEqual([]);
    expect(bob.activeBase).toBe(null);
    expect(bob.storage.getItem(SAVE_KEYS.save)).toBe(null); // not Ann's open village
    // Bob can't write to Ann's villages, even knowing their ids.
    await expect(bob.backend.updateBase(a1.id, { save: saveOf(9, 1) })).rejects.toThrow(/no longer exists/);
    await bob.backend.deleteBase(a2.id);
    for (let i = 0; i < MAX_BASES; i++) await bob.createBase(`Bob ${i}`);
    await expect(bob.createBase('six')).rejects.toThrow(/up to 5/);
    await bob.signOut();

    await ann.signIn('ann@example.com', 'secret123');
    expect(ann.bases.map((b) => b.name)).toEqual(['Ann 1', 'Ann 2']);
    expect(ann.baseById(a1.id).save.townHallLevel).toBe(3);
    expect(ann.baseById(a2.id).save.townHallLevel).toBe(4);
  });

  it('logging out mid-upload, then another player logging in: no upload lands in the wrong account', async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    const a = await ann.createBase('Home');
    writeGame(ann.storage, village(5));         // upload pending
    expect(timers.size).toBeGreaterThan(0);
    await ann.signUp('bob@example.com', 'secret456', 'Bob'); // straight into another account (no log out)
    expect(timers.size).toBe(0);               // Ann's pending upload was dropped with her account...
    expect(ann.bases).toEqual([]);
    expect(ann.stats.bestWave).toBe(0);
    expect(ann.achievements.size).toBe(0);
    await ann.signOut();
    const again = tab();
    await again.signIn('ann@example.com', 'secret123');
    expect(again.baseById(a.id).save.townHallLevel).toBe(5); // ...but recovered from the device copy
  });

  it('a game keeps saving into the village it started in, whatever the session does next', async () => {
    const s = tab();
    setGameStorage(s.storage);
    try {
      await s.signUp('ann@example.com', 'secret123', 'Ann');
      const a = await s.createBase('A');
      const gsA = village(3, getStorage());     // the game started in A
      gsA.save();
      const b = await s.createBase('B');        // the player opens B (e.g. another tab of the title screen)
      gsA.gold = 99;
      gsA.save();
      expect(s.baseById(a.id).save.gold).toBe(99);
      expect(s.baseById(b.id).save).toBe(null);  // B untouched
      // Logged out while the game still runs: never the device's old shared slot.
      await s.signOut();
      gsA.gold = 77;
      gsA.save();
      expect(device.getItem(SAVE_KEYS.save)).toBe(null);
      const back = tab();
      await back.signIn('ann@example.com', 'secret123');
      expect(back.baseById(a.id).save.gold).toBe(77); // picked up from the device copy
    } finally {
      setGameStorage(null);
    }
  });

  it('switching village starts a clean game: nothing from the last one carries over', async () => {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    await s.createBase('Rich');
    const rich = village(10, s.pinnedStorage());
    place(rich, 'rvlab', 5);
    place(rich, 'fuelStation', 4);
    rich.researchPoints = 500;
    rich.research = { cannon: ['a'] };
    rich.spells = ['rage'];
    rich.fuelGuide = FUEL_GUIDE.done;
    rich.labGuideStep = 99;
    hideAllTips(rich);
    getWavePlan(rich);
    rich.hallIncomeCarry = 3; rich.sinceWaveCleared = 4; rich._gardenGold = 0.5;
    rich.save();
    const nb = await s.createBase('Fresh');
    expect(loadGame(s.pinnedStorage()).status).toBe('none');
    const fresh = new GameState({ storage: s.pinnedStorage() });
    fresh.startNew();
    expect(fresh).toMatchObject({ researchPoints: 0, research: {}, spells: [], fuelGuide: 0, labGuideStep: 0, tipsSeen: [], wavePlan: null, wallLevel: 1, wavesCleared: 0, hero: null, hallIncomeCarry: 0, _gardenGold: 0 });
    expect(fresh.sinceWaveCleared).toBe(undefined);
    fresh.save();
    expect(s.baseById(nb.id).save.researchPoints).toBe(0);
    // Reusing one GameState is just as clean.
    rich.startNew();
    expect(rich).toMatchObject({ researchPoints: 0, spells: [], fuelGuide: 0, wavePlan: null, hallIncomeCarry: 0, sinceWaveCleared: undefined });
  });

  it('concurrent tabs on the same village: a stale upload is refused (not "last one wins"), and its copy is kept as a backup', async () => {
    const one = tab(), two = tab();
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await one.createBase('Home');
    await two.signIn('ann@example.com', 'secret123');
    expect(two.activeId).toBe(b.id);
    one.storage.setItem(SAVE_KEYS.save, JSON.stringify({ ...saveOf(3, 100), savedAt: '2026-11-20T10:00:00.000Z' }));
    two.storage.setItem(SAVE_KEYS.save, JSON.stringify({ ...saveOf(3, 200), savedAt: '2026-11-20T10:00:05.000Z' })); // a later clock decides nothing
    await timers.runAll();
    expect(one.lock).toBe(null);
    expect(two.lock).toMatchObject({ reason: 'conflict', baseId: b.id });
    const third = tab();
    await third.signIn('ann@example.com', 'secret123');
    expect(third.baseById(b.id).save.gold).toBe(100); // the first upload stays
    const kept = third.deviceVillages().find((v) => v.baseId === b.id);
    expect(kept.save.gold).toBe(200);                 // the refused copy is recoverable
  });

  it('offline: progress waits on the device and goes up at the next login', async () => {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await s.createBase('Home');
    const real = s.backend.updateBase.bind(s.backend);
    s.backend.updateBase = async () => { throw new Error('Failed to fetch'); };
    s.storage.setItem(SAVE_KEYS.save, JSON.stringify(saveOf(4, 321)));
    await timers.runAll();
    expect(s.syncState).toBe('offline');
    expect(JSON.parse(device.getItem(`ibtd.cloud.${b.id}`)).dirty).toBe(true);
    s.backend.updateBase = real;
    const later = tab();
    await later.restore();
    await timers.runAll();
    expect((await later.backend.listBases())[0].save.gold).toBe(321);
  });

  it('offline play without a server uses the browser slot; that village can be brought into a new account', async () => {
    const offline = new Session({ backend: null, storage: device, timers });
    writeGame(offline.storage, village(4));
    expect(device.getItem(SAVE_KEYS.save)).not.toBe(null);
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    expect(s.legacyVillage().save.townHallLevel).toBe(4);
    await s.importLegacy('From offline');
    expect(loadGame(s.storage).data.townHallLevel).toBe(4);
  });

  it('an old-version village on the device imports as a current save', async () => {
    const gs = village(3);
    place(gs, 'spear', 2);
    const v6 = { ...serializeGame(gs), version: 6 };
    delete v6.spells; delete v6.wallLevel; delete v6.fuelGuide; delete v6.wavePlan;
    device.setItem(SAVE_KEYS.save, JSON.stringify(v6));
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    await s.importLegacy('Old');
    const p = loadGame(s.storage);
    expect(p.data.version).toBe(SAVE_VERSION);
    expect(p.data.buildings.find((b) => b.type === 'spear').level).toBe(3);
  });

  it("a save the game can't read is kept on the device before a fresh start replaces it", async () => {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await s.createBase('Home');
    const broken = { ...saveOf(6, 600), tips: 'bad-tip!' };
    await s.backend.updateBase(b.id, { save: broken });
    await s.signOut();
    await s.signIn('ann@example.com', 'secret123');
    expect(loadGame(s.storage).status).toBe('invalid');
    writeGame(s.storage, village(1)); // START GAME: "save could not be loaded · starts over"
    const kept = JSON.parse(device.getItem(`ibtd.unreadable.${b.id}`));
    expect(kept.save.gold).toBe(broken.gold);
    expect(s.deviceVillages().some((v) => v.key.startsWith('unreadable:'))).toBe(false); // still unreadable
    // After an update that reads it again, Villages offers it to import (to this account only).
    device.setItem(`ibtd.unreadable.${b.id}`, JSON.stringify({ ...kept, save: { ...kept.save, tips: '' } }));
    expect(s.deviceVillages().find((v) => v.key.startsWith('unreadable:')).save.townHallLevel).toBe(6);
    await s.signOut();
    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    expect(bob.deviceVillages().some((v) => v.key.startsWith('unreadable:'))).toBe(false);
  });

  it('the leaderboard has one row per village (a player can have several), best wave first, earlier wins ties', async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    const a1 = await ann.createBase('A1');
    ann.recordWave(12);
    await ann.createBase('A2');
    ann.recordWave(5);
    await ann.flush();
    await ann.flush();
    await ann.signOut();
    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    await bob.createBase('B');
    bob.recordWave(8);
    await bob.flush();
    const board = await bob.backend.leaderboard(10);
    expect(board.map((r) => [r.rank, r.username, r.villageName, r.bestWave, r.isMe]))
      .toEqual([[1, 'Ann', 'A1', 12, false], [2, 'Bob', 'B', 8, true], [3, 'Ann', 'A2', 5, false]]);
    // A deleted village leaves the board.
    await bob.signOut();
    await ann.signIn('ann@example.com', 'secret123');
    await ann.deleteBase(a1.id);
    expect((await ann.backend.leaderboard(10)).map((r) => [r.username, r.villageName])).toEqual([['Bob', 'B'], ['Ann', 'A2']]);
  });

  it('the leaderboard adds your best village when none of yours is in the top list', async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    for (const [n, w] of [['A1', 3], ['A2', 2]]) { await ann.createBase(n); ann.recordWave(w); }
    await ann.flush();
    await ann.signOut();
    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    for (const [n, w] of [['B1', 20], ['B2', 19]]) { await bob.createBase(n); bob.recordWave(w); }
    await bob.flush();
    const rows = await bob.backend.leaderboard(2);
    expect(rows.map((r) => r.villageName)).toEqual(['B1', 'B2']);
    await bob.signOut();
    await ann.signIn('ann@example.com', 'secret123');
    const mine = (await ann.backend.leaderboard(2)).filter((r) => r.isMe);
    expect(mine.map((r) => [r.villageName, r.rank])).toEqual([['A1', 3]]); // only her best one, not A2
  });

  it('the browser-only backend refuses everything without a login, like the server rules', async () => {
    const be = new LocalBackend(server);
    for (const call of [() => be.listBases(), () => be.getStats(), () => be.saveStats({ bestWave: 1, bestTownHall: 1, counters: {} }), () => be.listAchievements(), () => be.earnAchievements([{ id: 'wave1' }]), () => be.claimAchievement('wave1'), () => be.deleteBase('x')]) {
      await expect(call()).rejects.toThrow(/Log in again/);
    }
  });
});

describe('Supabase backend guards (mocked, no network)', () => {
  /** A stand-in for the supabase query builder that records each call and answers `result`. */
  function fakeDb(result) {
    const calls = [];
    const q = new Proxy({}, {
      get(_, name) {
        if (name === 'then') return (ok) => ok(result);
        return (...args) => { calls.push([name, ...args]); return q; };
      }
    });
    return { calls, from: (t) => { calls.push(['from', t]); return q; } };
  }
  const make = () => {
    const be = new SupabaseBackend('https://example.invalid', 'anon-key');
    be.userId = 'user-a';
    return be;
  };

  it('the village leaderboard maps the server rows, and falls back to one row per player before the migration', async () => {
    const be = make();
    const rows = [{ rank: 1, username: 'Ann', village_name: 'Home', best_wave: 9, town_hall: 4, is_me: true }, { rank: 2, username: 'Bob', village_name: null, best_wave: 7, town_hall: 3, is_me: false }];
    const calls = [];
    be.db = { rpc: async (name) => { calls.push(name); return { data: rows, error: null }; } };
    expect(await be.leaderboard(10)).toEqual([
      { rank: 1, username: 'Ann', villageName: 'Home', bestWave: 9, bestTownHall: 4, isMe: true, baseId: null },
      { rank: 2, username: 'Bob', villageName: null, bestWave: 7, bestTownHall: 3, isMe: false, baseId: null }]);
    be.db = { rpc: async (name) => {
      calls.push(name);
      return name === 'get_village_leaderboard'
        ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_village_leaderboard' } }
        : { data: [{ rank: 1, username: 'Ann', best_wave: 9, best_town_hall: 4, is_me: true }], error: null };
    } };
    expect(await be.leaderboard(10)).toEqual([{ rank: 1, username: 'Ann', villageName: null, bestWave: 9, bestTownHall: 4, isMe: true }]);
    expect(calls.slice(-2)).toEqual(['get_village_leaderboard', 'get_leaderboard']);
    be.db = { rpc: async () => ({ data: null, error: { code: '42501', message: 'permission denied' } }) };
    await expect(be.leaderboard(10)).rejects.toThrow();
  });

  it('a village update that changed no row (deleted elsewhere, or another login) fails, so it stays unsent', async () => {
    const be = make();
    be.db = fakeDb({ data: [], error: null });
    await expect(be.updateBase('b1', { name: 'x' })).rejects.toThrow(/no longer exists/);
    be.db = fakeDb({ data: [{ id: 'b1' }], error: null });
    await be.updateBase('b1', { name: 'x' });
    expect(be.db.calls).toContainEqual(['eq', 'user_id', 'user-a']);
  });

  it('new villages name their owner; nothing is sent once the login changed', async () => {
    const be = make();
    be.db = fakeDb({ data: { id: 'b1', name: 'x' }, error: null });
    await be.createBase({ name: 'x' });
    expect(be.db.calls.find((c) => c[0] === 'insert')[1].user_id).toBe('user-a');
    let changed = null;
    be.onUserChanged = (d) => { changed = d; };
    expect(be.authChanged('TOKEN_REFRESHED', { user: { id: 'user-a' } })).toBe(false);
    expect(be.authChanged('SIGNED_IN', { user: { id: 'user-b' } })).toBe(true); // another tab logged in as someone else
    await new Promise((r) => setTimeout(r, 5));
    expect(changed).toEqual({ from: 'user-a', to: 'user-b' });
    await expect(be.createBase({ name: 'y' })).rejects.toThrow(/Log in again/);
    await expect(be.updateBase('b1', { name: 'y' })).rejects.toThrow(/Log in again/);
  });

  it('one device at a time (v0.15.4): off and silent before the migration, enforced after it', async () => {
    const be = make();
    // Before the migration: the functions aren't there, so the game claims nothing and saves exactly as before.
    const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.claim_session' } };
    be.db = { rpc: async () => missing };
    expect(await be.claimSession('device-1234')).toBe(false);
    expect(await be.sessionActive('device-1234')).toBe(true);
    be.db = fakeDb({ data: [{ id: 'b1', updated_at: 't1' }], error: null });
    await be.updateBase('b1', { name: 'x' });
    expect(be.db.calls.find((c) => c[0] === 'update')[1]).toEqual({ name: 'x' }); // no device id sent
    // After it: the device id goes with each save, and a refusal reads as "opened on another device".
    const rpcs = [];
    be.db = { rpc: async (name, args) => { rpcs.push([name, args]); return { data: name === 'session_active' ? false : null, error: null }; } };
    expect(await be.claimSession('device-1234')).toBe(true);
    expect(await be.sessionActive('device-1234')).toBe(false);
    expect(rpcs).toEqual([['claim_session', { p_session: 'device-1234' }], ['session_active', { p_session: 'device-1234' }]]);
    be.db = fakeDb({ data: [{ id: 'b1', updated_at: 't2' }], error: null });
    await be.updateBase('b1', { name: 'y' }, { session: 'device-1234' });
    expect(be.db.calls.find((c) => c[0] === 'update')[1]).toEqual({ name: 'y', session_id: 'device-1234' });
    be.db = fakeDb({ data: null, error: { code: 'P0001', message: 'IBTD_SESSION_REPLACED: this account was opened on another device.' } });
    await expect(be.updateBase('b1', { name: 'z' }, { session: 'device-1234' })).rejects.toMatchObject({ sessionReplaced: true });
  });
});
