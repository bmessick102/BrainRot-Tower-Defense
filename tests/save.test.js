import { describe, it, expect } from 'vitest';
import {
  serializeGame, deserializeGame, parseSave, loadGame, writeGame, validateSave, restoreCheckpoint, deleteGame,
  loadSettings, saveSettings, SAVE_KEYS, SAVE_VERSION
} from '../src/logic/save.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m
  };
}

const brokenStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); }
};

function sampleState() {
  const state = makeStateWithTownHall({ gold: 640, wavesCleared: 2, tutorialStep: 11, tutorialDone: true }, 3);
  const mine = addBuilding(state, 'mine', 15, 19, 2);
  mine.stock = 84;
  addBuilding(state, 'storage', 23, 19, 1);
  addBuilding(state, 'cannon', 19, 15, 3);
  return state;
}

const strip = (s) => ({ ...s, savedAt: null });

describe('save.js', () => {
  it('save -> load round trip is identical', () => {
    const state = sampleState();
    const saved = serializeGame(state);
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const data = deserializeGame(parsed.data);
    const reloaded = { ...state, ...data };
    expect(strip(serializeGame(reloaded))).toEqual(strip(saved));
  });

  it('writes the charter format', () => {
    const saved = serializeGame(sampleState());
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved).toMatchObject({ gold: 640, townHallLevel: 3, wavesCleared: 2, tutorialStep: 11, tutorialDone: true });
    expect(saved.buildings[1]).toEqual({ id: 'b2', type: 'mine', level: 2, col: 15, row: 19, stock: 84 });
    expect(typeof saved.savedAt).toBe('string');
  });

  it('version 2 stores the day/night clock and nights at max Town Hall', () => {
    const state = sampleState();
    state.clock = { phase: 'dawn', t: 4.567 };
    state.nightsAtMaxTownHall = 3;
    const saved = serializeGame(state);
    expect(saved.version).toBe(SAVE_VERSION);
    expect(saved.clock).toEqual({ phase: 'dawn', t: 4.57 });
    expect(saved.nightsAtMaxTownHall).toBe(3);
    const data = deserializeGame(parseSave(JSON.stringify(saved)).data);
    expect(data.clock).toEqual({ phase: 'dawn', t: 4.57 });
    expect(data.nightsAtMaxTownHall).toBe(3);
  });

  it('version 1 saves still load, starting at morning with the tutorial steps remapped', () => {
    const v2 = serializeGame(sampleState());
    const v1 = { ...v2, version: 1 };
    delete v1.clock;
    delete v1.nightsAtMaxTownHall;
    const done = parseSave(JSON.stringify({ ...v1, tutorialStep: 11, tutorialDone: true }));
    expect(done.status).toBe('ok');
    expect(done.data).toMatchObject({ version: SAVE_VERSION, clock: { phase: 'day', t: 0 }, nightsAtMaxTownHall: 0, tutorialStep: 10, tutorialDone: true });
    // old step 9 ("enemies are coming") -> new night step 8; old 10 ("you did it") -> new 9
    expect(parseSave(JSON.stringify({ ...v1, tutorialStep: 9, tutorialDone: false })).data.tutorialStep).toBe(8);
    expect(parseSave(JSON.stringify({ ...v1, tutorialStep: 10, tutorialDone: false })).data.tutorialStep).toBe(9);
    expect(parseSave(JSON.stringify({ ...v1, tutorialStep: 4, tutorialDone: false })).data.tutorialStep).toBe(4);
  });

  it('rejects a bad clock', () => {
    const base = serializeGame(sampleState());
    expect(validateSave({ ...base, clock: { phase: 'noon', t: 0 } })).toBe(false);
    expect(validateSave({ ...base, clock: { phase: 'day', t: -30 } })).toBe(true);   // grace period longer than a day
    expect(validateSave({ ...base, clock: { phase: 'day', t: -1e6 } })).toBe(false);
    expect(validateSave({ ...base, clock: undefined })).toBe(false);
  });

  it('corrupted JSON returns "no save" without throwing', () => {
    expect(() => parseSave('{not json')).not.toThrow();
    const r = parseSave('{not json');
    expect(r.status).not.toBe('ok');
    expect(r.data).toBeNull();
  });

  it('wrong version returns "no save" without throwing', () => {
    const saved = { ...serializeGame(sampleState()), version: 99 };
    const r = parseSave(JSON.stringify(saved));
    expect(r.status).not.toBe('ok');
    expect(r.data).toBeNull();
  });

  it('version 3 saves load with walls moved to the 6-level scale, keeping their picture', () => {
    const s = makeStateWithTownHall({ gold: 0, tutorialStep: 11, tutorialDone: true }, 10);
    const levels = [1, 2, 3, 4, 7, 9, 10];
    levels.forEach((_, i) => addBuilding(s, 'wall', 4 + i, 22, 1));
    const old = { ...serializeGame(s), version: 3 };
    old.buildings.filter((b) => b.type === 'wall').forEach((b, i) => { b.level = levels[i]; }); // the old 10-level scale
    const r = parseSave(JSON.stringify(old));
    expect(r.status).toBe('ok');
    expect(r.data.version).toBe(SAVE_VERSION);
    expect(r.data.buildings.filter((b) => b.type === 'wall').map((b) => b.level)).toEqual([1, 1, 2, 2, 4, 5, 5]);
  });

  it('rejects unknown types, bad levels, overlaps, and footprints off the grass', () => {
    const base = serializeGame(sampleState());
    const mutate = (fn) => { const o = JSON.parse(JSON.stringify(base)); fn(o); return validateSave(o); };
    expect(validateSave(base)).toBe(true);
    expect(mutate((o) => { o.buildings[1].type = 'wall'; })).toBe(false);
    expect(mutate((o) => { o.buildings[1].level = 6; })).toBe(false);
    expect(mutate((o) => { o.buildings[1].level = 0; })).toBe(false);
    expect(mutate((o) => { o.buildings[1].col = 19; o.buildings[1].row = 19; })).toBe(false); // overlaps the town hall
    expect(mutate((o) => { o.buildings[1].col = 39; o.buildings[1].row = 39; })).toBe(false); // hangs off the grid
    expect(mutate((o) => { o.buildings.shift(); })).toBe(false);              // no town hall
  });

  it('a saved wave plan from an entrance the map no longer has (the left waterfall) is planned again; the save still loads', () => {
    const base = serializeGame(sampleState());
    const parsed = parseSave(JSON.stringify({ ...base, wavePlan: { number: 3, paths: ['top', 'left'] } }));
    expect(parsed.status).toBe('ok');
    expect(parsed.data.wavePlan).toBeNull();
    expect(parseSave(JSON.stringify({ ...base, wavePlan: { number: 3, paths: ['top', 'bottom'] } })).data.wavePlan).toEqual({ number: 3, paths: ['top', 'bottom'] });
  });

  it('old 32 x 31 saves (no grid field) are shifted onto the 40 x 40 grid, keeping the layout', () => {
    const base = serializeGame(sampleState());
    const old = JSON.parse(JSON.stringify(base));
    delete old.grid;
    old.buildings.forEach((b) => { b.col -= 2; b.row -= 4; }); // what the same layout looked like on the old grid
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.status).toBe('ok');
    expect(parsed.data.grid).toBe(40);
    expect(parsed.data.buildings).toEqual(base.buildings);
    // A save that already says 40 is left alone.
    expect(parseSave(JSON.stringify(base)).data.buildings).toEqual(base.buildings);
  });

  it('missing save is "none"; unavailable storage never throws', () => {
    expect(loadGame(memoryStorage()).status).toBe('none');
    expect(() => loadGame(brokenStorage)).not.toThrow();
    expect(loadGame(brokenStorage).status).toBe('none');
    expect(writeGame(brokenStorage, sampleState())).toBe(false);
    expect(loadSettings(brokenStorage).music).toBeGreaterThanOrEqual(0);
    expect(loadSettings(brokenStorage).sfx).toBeGreaterThanOrEqual(0);
  });

  it('retry copies the checkpoint into the save; new game keeps settings', () => {
    const storage = memoryStorage();
    const state = sampleState();
    writeGame(storage, state, SAVE_KEYS.checkpoint);
    state.gold = 1;
    writeGame(storage, state, SAVE_KEYS.save);
    expect(restoreCheckpoint(storage)).toBe(true);
    expect(loadGame(storage).data.gold).toBe(640);

    saveSettings(storage, { music: 0.25, sfx: 0.5 });
    deleteGame(storage);
    expect(loadGame(storage).status).toBe('none');
    expect(storage.getItem(SAVE_KEYS.checkpoint)).toBeNull();
    expect(loadSettings(storage)).toEqual({ music: 0.25, sfx: 0.5 });
  });

  it('settings from before the Music / SFX split seed both levels from the old volume', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEYS.settings, JSON.stringify({ volume: 0.4 }));
    expect(loadSettings(storage)).toEqual({ music: 0.4, sfx: 0.4 });
    storage.setItem(SAVE_KEYS.settings, JSON.stringify({ music: 2, sfx: 'loud' }));
    expect(loadSettings(storage)).toEqual({ music: 0.7, sfx: 0.7 });
  });
});
