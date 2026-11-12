// The one game-state object plus a small event emitter.
// Scenes call the action methods here; each action runs the pure rules in src/logic/,
// feeds the tutorial, and autosaves. Logic emits events through state.emit(); views listen.
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { canPlaceRect } from '../logic/grid.js';
import {
  checkBuy, checkUpgrade, planSwap, wallGroup, planWallGroupUpgrade, createBuilding, applyLevelUp, buildCost, footprintDims, getTownHall, townHallLevel
} from '../logic/buildings.js';
import { getCapacity, spendGold, addGold, setGold, collectMine, sellRefund, repairBuilding } from '../logic/economy.js';
import { createIdleWave } from '../logic/waves.js';
import { advanceTutorial, applyStarterBase, canSkipTutorial, TUTORIAL_DONE_STEP, TUTORIAL_NIGHT_STEP } from '../logic/tutorial.js';
import { createClock, beginDusk, resumeClockOnLoad, startGrace, callWaveEarly } from '../logic/dayNight.js';
import { simulate } from '../logic/simulate.js';
import { deserializeGame, writeGame, SAVE_KEYS } from '../logic/save.js';
import { isWaveActive } from '../logic/util.js';

// The Storage the game saves through. main.js sets it to the account session's storage (src/net/session.js),
// which saves into the open village; without it (tests, blocked storage) it's plain localStorage.
let gameStorage = null;
export function setGameStorage(storage) { gameStorage = storage; }

/** Where the game saves (the open village, or localStorage), or null when the browser blocks storage. */
export function getStorage() {
  if (gameStorage) return gameStorage;
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

// Logic events that move the tutorial forward.
const TUTORIAL_EVENTS = ['mineCollected', 'buildingPlaced', 'townHallUpgraded', 'waveStarted'];

export class GameState {
  constructor({ storage = getStorage(), rng = Math.random } = {}) {
    this.listeners = new Map();
    this.storage = storage;
    this.rng = rng;
    this.reset();
  }

  // ---------- events ----------
  on(name, fn, ctx) {
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push({ fn, ctx });
    return this;
  }

  off(name, fn, ctx) {
    const list = this.listeners.get(name);
    if (list) this.listeners.set(name, list.filter((l) => l.fn !== fn || (ctx && l.ctx !== ctx)));
    return this;
  }

  /** Remove every listener registered with this context (a scene). */
  offContext(ctx) {
    for (const [name, list] of this.listeners) this.listeners.set(name, list.filter((l) => l.ctx !== ctx));
  }

  emit(name, data) {
    for (const l of [...(this.listeners.get(name) || [])]) l.fn.call(l.ctx, data);
    if (TUTORIAL_EVENTS.includes(name)) this.tutorialEvent(name, data || {});
    if (name === 'waveCleared') this.save();
    // Each night's wave: the checkpoint (for Retry) is the base as dusk falls.
    if (name === 'waveTriggered') { this.writeCheckpoint(); this.save(); }
  }

  // ---------- setup ----------
  reset() {
    this.gold = 0;
    this.buildings = [];
    this.enemies = [];
    this.projectiles = [];
    this.pools = [];
    this.wave = createIdleWave();
    this.wavesCleared = 0;       // nights survived
    this.nightsAtMaxTownHall = 0;
    this.clock = createClock();
    this.tutorialStep = 1;
    this.tutorialDone = false;
    this.gameOver = false;
    this.nextId = 1;
  }

  /** Fresh game: the ruined (level 0) Village Hall at its anchor, starting gold, tutorial step 1. */
  startNew() {
    this.reset();
    const [c, r] = MAP.townHallAnchor;
    this.buildings.push(createBuilding(this, 'townHall', c, r, 0));
    this.gold = Math.min(CONFIG.startingGold, getCapacity(this));
  }

  /** Load from a validated save object. */
  loadFromSave(obj) {
    this.reset();
    const data = deserializeGame(obj);
    this.buildings = data.buildings;
    this.wavesCleared = data.wavesCleared;
    this.nightsAtMaxTownHall = data.nightsAtMaxTownHall;
    this.clock = data.clock;
    this.tutorialStep = Math.min(Math.max(1, data.tutorialStep), TUTORIAL_DONE_STEP);
    this.tutorialDone = data.tutorialDone || this.tutorialStep >= TUTORIAL_DONE_STEP;
    // Saves from before the ruined hall: step 1 (rebuild the hall) is already done.
    if (!this.tutorialDone && this.tutorialStep === 1 && this.buildings.some((b) => b.type === 'townHall' && b.level >= 1)) this.tutorialStep = 2;
    this.nextId = data.nextId;
    this.gold = Math.min(data.gold, getCapacity(this));
  }

  /** A save made at dusk (during the countdown) replays that night from the start of dusk. */
  resumeClock() {
    resumeClockOnLoad(this);
  }

  /** Retry after a lost night: daytime with a grace period before night returns (saved right away). */
  startGrace() {
    startGrace(this);
    this.save();
  }

  // ---------- queries ----------
  get capacity() { return getCapacity(this); }
  get townHall() { return getTownHall(this); }
  get townHallLevel() { return townHallLevel(this); }

  getBuilding(id) {
    return this.buildings.find((b) => b.id === id) || null;
  }

  // ---------- actions (return { ok, reason }) ----------
  /** Buy and place a building. Walls take an orientation ('x' or 'y'). */
  placeNew(type, col, row, orient = 'x') {
    const buy = checkBuy(this, type);
    if (!buy.ok) return buy;
    const { w, h } = footprintDims(type, orient);
    const spot = canPlaceRect(this.buildings, col, row, w, h);
    if (!spot.ok) return spot;
    spendGold(this, buildCost(type));
    const b = createBuilding(this, type, col, row, 1, null, orient);
    this.buildings.push(b);
    this.emit('buildingPlaced', { id: b.id, type });
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    this.save();
    return { ok: true, reason: '', id: b.id };
  }

  /**
   * Move a building (edit mode). A wall can be rotated as it moves. Dropped onto exactly one other
   * building, the two swap places (see planSwap).
   */
  moveBuilding(id, col, row, orient = null) {
    const b = this.getBuilding(id);
    if (!b) return { ok: false, reason: 'Missing' };
    if (isWaveActive(this)) return { ok: false, reason: 'Not during a wave' };
    const newOrient = b.type === 'wall' ? (orient || b.orient) : undefined;
    const { w, h } = footprintDims(b.type, newOrient);
    const spot = canPlaceRect(this.buildings, col, row, w, h, b.id);
    if (!spot.ok) {
      const swap = planSwap(this.buildings, b, col, row, orient);
      if (!swap || !swap.ok) return swap || spot;
      const other = this.getBuilding(swap.otherId);
      Object.assign(b, swap.to);
      if (b.type === 'wall') { b.orient = newOrient; b.w = w; b.h = h; }
      Object.assign(other, swap.otherTo);
      this.emit('buildingMoved', { id });
      this.emit('buildingMoved', { id: other.id });
      this.emit('buildingsSwapped', { id, otherId: other.id });
      this.save();
      return { ok: true, reason: '', swappedWith: other.id };
    }
    b.col = col;
    b.row = row;
    if (b.type === 'wall') { b.orient = newOrient; b.w = w; b.h = h; }
    this.emit('buildingMoved', { id });
    this.save();
    return { ok: true, reason: '' };
  }

  checkSell(b) {
    if (!b || b.type === 'townHall') return { ok: false, reason: "Can't sell" };
    if (isWaveActive(this)) return { ok: false, reason: 'Not during a wave' };
    return { ok: true, reason: '', refund: sellRefund(b) };
  }

  sellBuilding(id) {
    const b = this.getBuilding(id);
    const check = this.checkSell(b);
    if (!check.ok) return check;
    this.buildings = this.buildings.filter((x) => x.id !== id);
    setGold(this, this.gold); // selling a storage can lower capacity
    addGold(this, check.refund);
    this.emit('buildingSold', { id, type: b.type, refund: check.refund });
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    this.save();
    return { ok: true, reason: '' };
  }

  /** Upgrade (instant). A town hall upgrade unlocks buildings and makes the following nights tougher. */
  upgradeBuilding(id) {
    const b = this.getBuilding(id);
    if (!b) return { ok: false, reason: 'Missing' };
    const check = checkUpgrade(this, b);
    if (!check.ok) return check;
    spendGold(this, check.cost);
    applyLevelUp(b);
    this.emit('buildingUpgraded', { id, type: b.type, level: b.level });
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    if (b.type === 'townHall') this.emit('townHallUpgraded', { level: b.level });
    this.save();
    return { ok: true, reason: '' };
  }

  /**
   * Upgrade the whole group of connected same-level walls around wall `id` (as many as the gold covers,
   * nearest first). One save at the end. Returns { ok, upgraded, total }.
   */
  upgradeWallGroup(id) {
    const wall = this.getBuilding(id);
    const group = wallGroup(this, wall);
    const plan = planWallGroupUpgrade(this, group);
    if (!plan.ids.length) return { ok: false, reason: plan.reason, upgraded: 0, total: plan.total };
    for (const wid of plan.ids) {
      const b = this.getBuilding(wid);
      const check = checkUpgrade(this, b);
      if (!check.ok) break;
      spendGold(this, check.cost);
      applyLevelUp(b);
      this.emit('buildingUpgraded', { id: wid, type: b.type, level: b.level, group: true });
    }
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    this.save();
    return { ok: true, reason: '', upgraded: plan.ids.length, total: plan.total };
  }

  collect(id) {
    const b = this.getBuilding(id);
    if (!b || b.type !== 'mine' || b.destroyed) return { ok: false, reason: '' };
    const r = collectMine(this, b);
    const reason = r.waveActive ? 'Not during a wave' : r.storageFull ? 'Storage full' : '';
    return { ok: r.collected > 0, reason, collected: r.collected };
  }

  repair(id) {
    const b = this.getBuilding(id);
    if (!b) return { ok: false, reason: 'Missing' };
    return { ok: repairBuilding(this, b), reason: '' };
  }

  skipTutorial() {
    if (!canSkipTutorial(this)) return false;
    applyStarterBase(this);
    this.emit('baseReset', {});
    this.save();
    return true;
  }

  /** Feed the tutorial an event (UI events like 'next', 'shopOpened', or logic events). Saves per step. */
  tutorialEvent(event, payload = {}) {
    if (!advanceTutorial(this, event, payload)) return;
    // Night is introduced: dusk falls right away and wave 1 is on its way.
    if (!this.tutorialDone && this.tutorialStep === TUTORIAL_NIGHT_STEP && this.clock.phase === 'day') beginDusk(this);
    this.save();
  }

  /** Start the next wave early for a gold bonus (day/dawn -> countdown, countdown -> wave). */
  callWaveEarly() {
    return callWaveEarly(this); // the dusk checkpoint + autosave happen on 'waveTriggered'
  }

  update(dt) {
    simulate(this, dt);
  }

  // ---------- saving ----------
  /** Autosave / manual save. Never stores mid-wave state. */
  save() {
    if (isWaveActive(this) || this.gameOver) return false;
    return writeGame(this.storage, this, SAVE_KEYS.save);
  }

  writeCheckpoint() {
    return writeGame(this.storage, this, SAVE_KEYS.checkpoint);
  }
}
