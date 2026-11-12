import { describe, it, expect } from 'vitest';
import { BUILDING_TYPES, DEFENSE_TYPES, ECONOMY_TYPES, WALL_TYPES, createBuilding, footprintDims } from '../src/logic/buildings.js';
import { serializeGame, validateSave, deleteGame, restoreBackup, SAVE_KEYS, parseSave } from '../src/logic/save.js';
import { CONFIG } from '../src/config.js';
import { makeStateWithTownHall } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

describe('saves know every building type', () => {
  it('every shop list is part of BUILDING_TYPES', () => {
    for (const t of [...DEFENSE_TYPES, ...ECONOMY_TYPES, ...WALL_TYPES]) expect(BUILDING_TYPES).toContain(t);
    for (const t of Object.keys(CONFIG.limits)) expect(BUILDING_TYPES).toContain(t);
  });

  it('a village with one of every building type saves and loads', () => {
    const s = makeStateWithTownHall({}, 1);
    let col = 3, row = 6;
    for (const type of BUILDING_TYPES) {
      if (type === 'townHall') continue;
      if (col > 24) { col = 3; row += 3; }
      const b = createBuilding(s, type, col, row, 1, null, 'x');
      s.buildings.push(b);
      col += footprintDims(type, 'x').w + 1;
    }
    const saved = JSON.parse(JSON.stringify(serializeGame({ ...s, wavesCleared: 0, nightsAtMaxTownHall: 0 })));
    expect(validateSave(saved)).toBe(true);
  });
});

describe('New Game keeps a backup', () => {
  it('the replaced save and checkpoint can be restored', () => {
    const st = memoryStorage();
    st.setItem(SAVE_KEYS.save, '{"old":"save"}');
    st.setItem(SAVE_KEYS.checkpoint, '{"old":"checkpoint"}');
    deleteGame(st);
    expect(st.getItem(SAVE_KEYS.save)).toBeNull();
    expect(restoreBackup(st)).toBe(true);
    expect(st.getItem(SAVE_KEYS.save)).toBe('{"old":"save"}');
    expect(st.getItem(SAVE_KEYS.checkpoint)).toBe('{"old":"checkpoint"}');
  });
});
