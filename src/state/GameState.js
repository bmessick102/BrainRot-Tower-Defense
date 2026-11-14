// The one game-state object plus a small event emitter.
// Scenes call the action methods here; each action runs the pure rules in src/logic/,
// feeds the tutorial, and autosaves. Logic emits events through state.emit(); views listen.
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { canPlaceRect } from '../logic/grid.js';
import {
  checkBuy, checkUpgrade, planSwap, maxHp, wallGroup, planWallGroupUpgrade, createBuilding, applyLevelUp, buildCost, footprintDims, getTownHall, townHallLevel
} from '../logic/buildings.js';
import { getCapacity, spendGold, addGold, setGold, collectMine, sellRefund, repairBuilding } from '../logic/economy.js';
import { createIdleWave } from '../logic/waves.js';
import { advanceTutorial, applyStarterBase, canSkipTutorial, TUTORIAL_DONE_STEP, TUTORIAL_NIGHT_STEP } from '../logic/tutorial.js';
import { createClock, startTutorialWave, resumeClockOnLoad, startGrace, startNextWave } from '../logic/dayNight.js';
import { simulate } from '../logic/simulate.js';
import { deserializeGame, writeGame, SAVE_KEYS } from '../logic/save.js';
import { isWaveActive } from '../logic/util.js';
import { applyLayout } from '../logic/layout.js';
import { checkResearch, labPicks, syncAbilityPicks } from '../logic/abilities.js';
import { addResearchPoints, spendResearchPoints } from '../logic/researchPoints.js';
import { advanceLabGuide, startLabGuideIfDue, skipLabGuide } from '../logic/labGuide.js';

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
// Events that move the RV Lab guide forward (the UI emits researchOpened).
const LAB_GUIDE_EVENTS = ['buildingPlaced', 'researchOpened', 'abilityResearched'];

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
    if (LAB_GUIDE_EVENTS.includes(name)) advanceLabGuide(this, name, data || {});
    if (name === 'townHallUpgraded') startLabGuideIfDue(this); // Village Hall 4 unlocks the RV Lab
    if (name === 'labGuideChanged') this.save();
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
    this.strikes = [];           // Arrow Storm / Meteor hits on their way down
    this.research = {};          // RV Lab research: { type: ['a', 'b', ...] }, the pick at each tier
    this.labGuideStep = 0;       // RV Lab guide (labGuide.js): 0 = not started
    this.researchPoints = 0;     // RP: the currency for RV Lab abilities (researchPoints.js)
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
    this.research = data.research;
    this.labGuideStep = data.labGuideStep;
    this.researchPoints = data.researchPoints;
    this.wavesCleared = data.wavesCleared;
    this.nightsAtMaxTownHall = data.nightsAtMaxTownHall;
    this.clock = data.clock;
    this.tutorialStep = Math.min(Math.max(1, data.tutorialStep), TUTORIAL_DONE_STEP);
    this.tutorialDone = data.tutorialDone || this.tutorialStep >= TUTORIAL_DONE_STEP;
    // Saves from before the ruined hall: step 1 (rebuild the hall) is already done.
    if (!this.tutorialDone && this.tutorialStep === 1 && this.buildings.some((b) => b.type === 'townHall' && b.level >= 1)) this.tutorialStep = 2;
    this.nextId = data.nextId;
    this.gold = Math.min(data.gold, getCapacity(this));
    // Villages already at Village Hall 4+ that haven't researched anything get the RV Lab guide now.
    startLabGuideIfDue(this);
  }

  /** The RV Lab guide's Next button (its last step). */
  labGuideNext() {
    return advanceLabGuide(this, 'next');
  }

  /** The RV Lab guide's Skip button. */
  skipLabGuide() {
    return skipLabGuide(this);
  }

  /** After loading: the clock carries on from the saved time of day (a save mid-wave starts that wave again). */
  resumeClock() {
    resumeClockOnLoad(this);
  }

  /** Retry after a lost wave: back to before that wave to rebuild, then Start Wave again (saved right away). */
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

  /** Save a layout drafted in edit mode (src/logic/layout.js): every building moves to its draft spot. */
  applyLayout(draft) {
    if (isWaveActive(this)) return { ok: false, reason: 'Not during a wave' };
    const r = applyLayout(this, draft);
    if (!r.ok) return r;
    for (const id of r.moved) this.emit('buildingMoved', { id });
    this.emit('layoutSaved', { moved: r.moved.length });
    this.save();
    return r;
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
    const ids = syncAbilityPicks(this); // a level can bring the next researched tier
    this.emit('buildingUpgraded', { id, type: b.type, level: b.level });
    if (ids.length) this.emit('abilitiesApplied', { ids, type: b.type });
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

  /**
   * RV Lab: pick path `path`'s option as a defense type's next tier (one pick per tier, final). Every building
   * of that type gets it at once (as far as its level allows).
   */
  researchAbility(type, path, tier = undefined) {
    const check = tier === undefined ? checkResearch(this, type, path) : checkResearch(this, type, path, tier);
    if (!check.ok) return check;
    spendResearchPoints(this, check.cost);
    this.research[type] = [...labPicks(this, type), path];
    const ids = syncAbilityPicks(this);
    this.emit('abilityResearched', { type, path, tier: check.tier });
    if (ids.length) this.emit('abilitiesApplied', { ids, type });
    this.save();
    return { ok: true, reason: '', tier: check.tier };
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
    // The first wave: it comes right away (and the day/night clock starts running).
    if (!this.tutorialDone && this.tutorialStep === TUTORIAL_NIGHT_STEP) startTutorialWave(this);
    this.save();
  }

  /** The Start Wave button: the next wave starts now, at whatever time of day it is. */
  startWave() {
    return startNextWave(this); // the checkpoint + autosave happen on 'waveTriggered'
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
