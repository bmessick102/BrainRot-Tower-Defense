// Test helpers: a tiny game state without Phaser.
import { createIdleWave } from '../src/logic/waves.js';
import { createBuilding } from '../src/logic/buildings.js';
import { MAP } from '../src/mapTiles.js';

/** Deterministic RNG (mulberry32). */
export function seededRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeState(overrides = {}) {
  const events = [];
  return {
    gold: 0,
    buildings: [],
    enemies: [],
    projectiles: [],
    pools: [],
    wave: createIdleWave(),
    wavesCleared: 0,
    tutorialStep: 1,
    tutorialDone: false,
    gameOver: false,
    nextId: 1,
    rng: seededRng(42),
    events,
    emit(name, data) { events.push({ name, data }); },
    ...overrides
  };
}

/** State with a town hall at the map's anchor. */
export function makeStateWithTownHall(overrides = {}, level = 1) {
  const state = makeState(overrides);
  const [c, r] = MAP.townHallAnchor;
  state.buildings.push(createBuilding(state, 'townHall', c, r, level));
  return state;
}

export function addBuilding(state, type, col, row, level = 1) {
  const b = createBuilding(state, type, col, row, level);
  state.buildings.push(b);
  return b;
}

export function addEnemy(state, kind, x, y, extra = {}) {
  const e = { id: `e${state.nextId++}`, kind, x, y, hp: 100, maxHp: 100, targetId: null, cooldown: 0, alive: true, hit: false, ...extra };
  state.enemies.push(e);
  return e;
}
