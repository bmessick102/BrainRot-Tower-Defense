// The one game-state object plus a small event emitter.
// Scenes call the action methods here; each action runs the pure rules in src/logic/,
// feeds the tutorial, and autosaves. Logic emits events through state.emit(); views listen.
import { useFeast } from '../logic/hero.js';
import { useEncore } from '../logic/queen.js';
import { heroesWaveStarted, heroesAfterWave } from '../logic/heroes.js';
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { canPlaceRect } from '../logic/grid.js';
import {
  checkBuy, checkUpgrade, planSwap, checkWallUpgrade, wallLevel, createBuilding, applyLevelUp, buildCost, footprintDims, getTownHall, townHallLevel, DEFENSE_TYPES
} from '../logic/buildings.js';
import { getCapacity, spendGold, addGold, setGold, collectMine, repairBuilding } from '../logic/economy.js';
import { createIdleWave, skipCountdown, cancelCountdown, legacyDebuted } from '../logic/waves.js';
import { advanceTutorial, applyStarterBase, canSkipTutorial, TUTORIAL_DONE_STEP, TUTORIAL_NIGHT_STEP } from '../logic/tutorial.js';
import { createClock, startTutorialWave, resumeClockOnLoad, startGrace, startNextWave } from '../logic/dayNight.js';
import { simulate } from '../logic/simulate.js';
import { deserializeGame, writeGame, SAVE_KEYS } from '../logic/save.js';
import { isWaveActive } from '../logic/util.js';
import { applyLayout } from '../logic/layout.js';
import { dropTheBeat } from '../logic/dj.js';
import { tipEvent, dismissTip, hideAllTips } from '../logic/tips.js';
import { checkResearch, checkRespec, labPicks, syncAbilityPicks } from '../logic/abilities.js';
import { spendResearchPoints } from '../logic/researchPoints.js';
import { advanceLabGuide, startLabGuideIfDue, skipLabGuide } from '../logic/labGuide.js';
import { brewSpell, discardSpell, castSpell, fuelGuideEvent } from '../logic/spells.js';
import { mergeBuildings, checkMastery, syncMastery } from '../logic/merge.js';

// The Storage the game saves through. main.js sets it to the account session's storage (src/net/session.js),
// which saves into the open village; without it (tests, blocked storage) it's plain localStorage.
let gameStorage = null;
export function setGameStorage(storage) { gameStorage = storage; }

/**
 * Where the game saves (the open village, or localStorage), or null when the browser blocks storage. The
 * session's storage is pinned to the village open right now, so a game keeps saving into its own village.
 */
export function getStorage() {
  if (gameStorage) return typeof gameStorage.pinned === 'function' ? gameStorage.pinned() : gameStorage;
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
    if (name !== 'tipsChanged' && name !== 'fuelGuideChanged') fuelGuideEvent(this, name, data || {}); // Fuel Station guide, before its tips
    if (name !== 'tipsChanged') tipEvent(this, name, data || {}); // first-time tips (tips.js)
    if (TUTORIAL_EVENTS.includes(name)) this.tutorialEvent(name, data || {});
    if (LAB_GUIDE_EVENTS.includes(name)) advanceLabGuide(this, name, data || {});
    if (name === 'townHallUpgraded') startLabGuideIfDue(this); // Village Hall 4 unlocks the RV Lab
    if (name === 'labGuideChanged' || name === 'fuelGuideChanged') this.save();
    if (name === 'waveStarted') heroesWaveStarted(this);
    if (name === 'waveCleared') { heroesAfterWave(this); this.save(); } // the heroes nap before the save
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
    this.nets = [];              // Missile Silo nets in play (skyNet.js; not saved)
    this.barriers = [];          // Gandolf the Grand's You Shall Not Pass walls (wizardWall.js; not saved)
    this.shatters = [];          // KSI Frost Fortress's Shatter bursts waiting to go off (shatter.js; not saved)
    this.research = {};          // RV Lab research: { type: ['a', 'b', ...] }, the pick at each tier
    this.mastery = {};           // merged defenses' Mastery tiers per type ({ cannon: 2 }, merge.js), saved
    this.labGuideStep = 0;       // RV Lab guide (labGuide.js): 0 = not started
    this.hero = null;            // the Brisket King (hero.js; rebuilt from his altar, not saved)
    this.queen = null;           // the Hatsune Queen (queen.js; rebuilt from her altar, not saved)
    this.queenBolts = [];        // her bolts in flight (queen.js)
    this.tipsSeen = [];          // first-time tips already shown (tips.js), saved
    this.tipQueue = [];          // tips waiting to show (not saved: they come up again if still due)
    this.researchPoints = 0;     // RP: the currency for RV Lab abilities (researchPoints.js)
    this.spells = [];            // Fuel Station spells brewed and waiting for a raid (spells.js), saved
    this.fuelGuide = 0;          // Fuel Station guide step (spells.js FUEL_GUIDE: build, free Rage, cast it), saved
    this.activeSpells = [];      // spell zones in play during a wave (not saved)
    this.wallLevel = 1;          // every wall's level (Upgrade Walls raises them all; new walls start at it), saved
    this.wave = createIdleWave();
    this.wavePlan = null;        // the next wave's spawn corners ({ number, paths }, waves.js), saved
    this.debuted = [];           // enemies whose debut wave this village has had (waves.js themed waves), saved
    this.wavesCleared = 0;      // nights survived
    this.nightsAtMaxTownHall = 0;
    this.clock = createClock();
    this.tutorialStep = 1;
    this.tutorialDone = false;
    this.gameOver = false;
    this.nextId = 1;
    // Not saved, worked out as the game runs: nothing carries over from the village loaded before.
    this.sinceWaveCleared = undefined; // seconds since the last wave was beaten (quick starts, dayNight.js)
    this.hallIncomeCarry = 0;          // the Village Hall's gold trickle between payouts (economy.js)
    this._gardenGold = 0;              // the same for economy perks (econPerks.js)
    this._nav = null;                  // pathfinding cache (pathfinding.js)
    this._gnomes = null;               // this step's gnome jobs (simulate.js)
    this._gnomeWork = null;            // gnome gold trips (villagers.js)
    this._spellMarks = false;          // spell zones marked on enemies (spells.js)
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
    this.wallLevel = data.wallLevel; // (its walls are already brought to it)
    this.research = data.research;
    this.mastery = data.mastery || {};
    this.labGuideStep = data.labGuideStep;
    this.tipsSeen = data.tipsSeen;
    this.wavePlan = data.wavePlan || null;
    this.researchPoints = data.researchPoints;
    this.spells = data.spells || [];
    this.fuelGuide = data.fuelGuide || 0;
    this.wavesCleared = data.wavesCleared;
    this.nightsAtMaxTownHall = data.nightsAtMaxTownHall;
    // An older save already met its hall's enemies, except the ones new (or reworked) in v0.7.
    this.debuted = data.debuted || legacyDebuted(this.townHallLevel);
    this.clock = data.clock;
    this.tutorialStep = Math.min(Math.max(1, data.tutorialStep), TUTORIAL_DONE_STEP);
    this.tutorialDone = data.tutorialDone || this.tutorialStep >= TUTORIAL_DONE_STEP;
    // Saves from before the ruined hall: step 1 (rebuild the hall) is already done.
    if (!this.tutorialDone && this.tutorialStep === 1 && this.buildings.some((b) => b.type === 'townHall' && b.level >= 1)) this.tutorialStep = 2;
    this.nextId = data.nextId;
    this.gold = Math.min(data.gold, getCapacity(this));
    // Villages already at Village Hall 4+ that haven't researched anything get the RV Lab guide now.
    startLabGuideIfDue(this);
    tipEvent(this, 'tipsChecked'); // e.g. a special wave or Da Baby Car already next
  }

  /** The Brisket King's Brisket Feast (during a wave). */
  useFeast() {
    return useFeast(this);
  }

  /** The Hatsune Queen's Encore Cloak (during a wave). */
  useEncore() {
    return useEncore(this);
  }

  /** DJ Babyface: Drop the Beat (a full hype meter, during a wave). */
  dropTheBeat(id) {
    return dropTheBeat(this, this.getBuilding(id), DEFENSE_TYPES);
  }

  /** Fuel Station: brew a spell with RP (between waves). Saved. */
  brewSpell(kind) {
    const r = brewSpell(this, kind);
    if (r.ok) this.save();
    return r;
  }

  /** Fuel Station: pour out a brewed spell (no refund). Saved. */
  discardSpell(kind) {
    const r = discardSpell(this, kind);
    if (r.ok) this.save();
    return r;
  }

  /** Cast a brewed spell at grid point (x, y) during a wave (it's used up). */
  castSpell(kind, x, y) {
    return castSpell(this, kind, x, y);
  }

  /** The tip bubble's "Got it" (saved, so it won't show again in this village). */
  dismissTip() {
    if (dismissTip(this)) this.save();
  }

  /** The tip bubble's "No more tips". */
  hideAllTips() {
    hideAllTips(this);
    this.save();
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
    spendGold(this, buildCost(type, this)); // a wall costs (and starts at) the village's wall level
    const b = createBuilding(this, type, col, row, type === 'wall' ? wallLevel(this) : 1, null, orient);
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

  /** Upgrade (instant). A town hall upgrade unlocks buildings and makes the following nights tougher. */
  upgradeBuilding(id) {
    const b = this.getBuilding(id);
    if (!b) return { ok: false, reason: 'Missing' };
    if (b.type === 'wall') return this.upgradeWalls(); // walls only ever go up all together
    const check = checkUpgrade(this, b);
    if (!check.ok) return check;
    if (check.currency === 'rp') spendResearchPoints(this, check.cost); // costCurrency: 'rp' levels (the RV Lab)
    else spendGold(this, check.cost);
    applyLevelUp(b);
    const ids = syncAbilityPicks(this);
    this.emit('buildingUpgraded', { id, type: b.type, level: b.level });
    if (ids.length) this.emit('abilitiesApplied', { ids, type: b.type });
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    if (b.type === 'townHall') this.emit('townHallUpgraded', { level: b.level });
    this.save();
    return { ok: true, reason: '' };
  }

  /**
   * Upgrade Walls: every wall goes up one level at once, for walls placed x the new level's price
   * (checkWallUpgrade), and new walls start at the new level. One event ('wallsUpgraded') and one save.
   * Returns { ok, reason, level, count, cost }.
   */
  upgradeWalls() {
    const check = checkWallUpgrade(this);
    if (!check.ok) return check;
    spendGold(this, check.cost);
    this.wallLevel = check.level;
    const ids = [];
    for (const b of this.buildings) {
      if (b.type !== 'wall') continue;
      while (b.level < check.level) applyLevelUp(b); // keeps each wall's share of health
      ids.push(b.id);
    }
    this.emit('wallsUpgraded', { ids, level: check.level, count: check.count, cost: check.cost });
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    this.save();
    return { ok: true, reason: '', level: check.level, count: check.count, cost: check.cost };
  }

  /**
   * RV Lab: pick path `path`'s option as a type's next tier (the first pick locks the type to that path; a
   * paid respec frees it). Every building of that type gets it at once, whatever its level.
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

  /** RV Lab: reset a type's path for RP (no refund of its old picks); the type can then take any path. */
  respecPath(type) {
    const check = checkRespec(this, type);
    if (!check.ok) return check;
    spendResearchPoints(this, check.cost);
    delete this.research[type];
    const ids = syncAbilityPicks(this);
    this.emit('abilityRespecced', { type });
    if (ids.length) this.emit('abilitiesApplied', { ids, type });
    this.save();
    return { ok: true, reason: '', cost: check.cost };
  }

  /**
   * Merge two max-level copies of a mergeable defense (merge.js): `otherId` goes, `keepId` becomes the merged building.
   * Returns { ok, reason, refund }.
   */
  mergeBuilding(keepId, otherId) {
    const r = mergeBuildings(this, keepId, otherId);
    if (!r.ok) return r;
    this.emit('goldChanged', { gold: this.gold, capacity: this.capacity });
    this.save();
    return r;
  }

  /** RV Lab: research a merged type's next Mastery tier (merge.js). Every merged building of that type gets it. */
  researchMastery(type) {
    const check = checkMastery(this, type);
    if (!check.ok) return check;
    spendResearchPoints(this, check.cost);
    this.mastery[type] = check.tier;
    const ids = syncMastery(this);
    this.emit('masteryResearched', { type, tier: check.tier, ids });
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

  /** Cancel (during the countdown, after the tutorial): back to waiting for Start Wave. */
  cancelWave() {
    if (!this.tutorialDone || !cancelCountdown(this)) return false;
    this.save();
    return true;
  }

  /** Start Now (during the countdown, after the tutorial): the wave attacks on the next step. */
  startWaveNow() {
    if (!this.tutorialDone) return false;
    return skipCountdown(this);
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
