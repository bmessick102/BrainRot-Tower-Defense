// Tutorial step state machine: rebuild the hall -> mine -> storage -> cannon -> first wave -> town hall tip.
// tutorialStep holds the step number (1..9); 10 with tutorialDone = true means finished.
import { MAP } from '../mapTiles.js';
import { createBuilding, buildCost, upgradeCost } from './buildings.js';
import { emit } from './util.js';

export const TUTORIAL_DONE_STEP = 10;

// Charter §11 starter base (anchor tiles). The town hall uses MAP.townHallAnchor; the rest sit around it
// (a mine 4 tiles left, a storage 4 right, a cannon 4 up: the same layout as ever, wherever the hall is).
const [HALL_COL, HALL_ROW] = MAP.townHallAnchor;
export const STARTER_BASE = [
  { type: 'mine', col: HALL_COL - 4, row: HALL_ROW },
  { type: 'storage', col: HALL_COL + 4, row: HALL_ROW },
  { type: 'cannon', col: HALL_COL, row: HALL_ROW - 4 }
];

const NONE = { shop: false, cards: [], select: [], collect: false, upgrade: [], move: false, repair: false };
const ALL = { shop: true, cards: 'all', select: 'all', collect: true, upgrade: 'all', move: true, repair: true };

/**
 * advanceOn: the event that completes the step. match: payload fields that must match.
 * goldGate(): gold needed before the step's purchase is enabled (read from config).
 * focus: what the guide highlights (resolved by the UI).
 */
export const TUTORIAL_STEPS = [
  null, // steps are 1-based
  {
    text: 'This is your Village Hall, but it lies in ruins! Click it and rebuild it to Level 1.',
    advanceOn: 'townHallUpgraded', match: { level: 1 }, focus: 'building:townHall',
    allow: { ...NONE, select: ['townHall'], upgrade: ['townHall'] }
  },
  { text: 'Open the shop.', advanceOn: 'shopOpened', focus: 'shopButton', allow: { ...NONE, shop: true } },
  { text: 'Buy a Bitcoin Mine.', advanceOn: 'placementStarted', match: { type: 'mine' }, focus: 'card:mine', allow: { ...NONE, shop: true, cards: ['mine'] } },
  { text: 'Place it anywhere green.', advanceOn: 'buildingPlaced', match: { type: 'mine' }, backOn: 'placementCancelled', backTo: 3, focus: null, allow: NONE },
  { text: 'Mines fill with gold. Click it when the coin appears.', advanceOn: 'mineCollected', focus: 'building:mine', allow: { ...NONE, select: ['mine'], collect: true } },
  {
    text: 'Gold needs somewhere to live. Buy a Storage.', advanceOn: 'buildingPlaced', match: { type: 'storage' },
    goldGate: () => buildCost('storage'), buyType: 'storage',
    allow: { ...NONE, select: ['mine'], collect: true, shop: true, cards: ['storage'] }
  },
  {
    text: 'Defend your base. Buy a Cannon.', advanceOn: 'buildingPlaced', match: { type: 'cannon' },
    goldGate: () => buildCost('cannon'), buyType: 'cannon',
    allow: { ...NONE, select: ['mine'], collect: true, shop: true, cards: ['cannon'] }
  },
  // Reaching this step sends wave 1 right away (GameState) and starts the day/night clock.
  {
    text: 'Here they come, defend your base! Enemies are coming from the flashing path.',
    advanceOn: 'waveStarted', focus: 'spawnMarker', allow: { ...NONE, select: ['mine'], collect: true }
  },
  {
    text: `You beat the wave! From now on, press Start Wave when you're ready, day or night. Every wave is tougher than the last, and upgrading your Village Hall unlocks more buildings but brings bigger attacks.`,
    advanceOn: 'next', showNext: true, hiddenUntilWavesCleared: 1, allow: ALL
  }
];

/** The step with the first wave; the day/night clock starts running here. */
export const TUTORIAL_NIGHT_STEP = 8;

export function isTutorialActive(state) {
  return !state.tutorialDone && state.tutorialStep >= 1 && state.tutorialStep < TUTORIAL_DONE_STEP;
}

export function currentStep(state) {
  return isTutorialActive(state) ? TUTORIAL_STEPS[state.tutorialStep] : null;
}

/** Gold the current step is waiting for (0 if none). */
export function goldNeeded(state) {
  const step = currentStep(state);
  return step && step.goldGate ? step.goldGate() : 0;
}

/** True while the step is waiting for the player to collect enough gold. */
export function isWaitingForGold(state) {
  return state.gold < goldNeeded(state);
}

/** Step 10 stays hidden while wave 1 is being fought. */
export function isGuideVisible(state) {
  const step = currentStep(state);
  if (!step) return false;
  if (step.hiddenUntilWavesCleared && state.wavesCleared < step.hiddenUntilWavesCleared) return false;
  return true;
}

/** What the player may do right now. Everything is allowed once the tutorial is done. */
export function tutorialPermissions(state) {
  const step = currentStep(state);
  if (!step) return ALL;
  const allow = { ...step.allow };
  if (step.goldGate && isWaitingForGold(state)) {
    // Until there's enough gold, only collecting is open.
    allow.shop = false; allow.cards = []; allow.upgrade = [];
  }
  return allow;
}

function listAllows(list, value) {
  return list === 'all' || (Array.isArray(list) && list.includes(value));
}

/** Convenience checks used by scenes. */
export function tutorialAllows(state, action, value) {
  const p = tutorialPermissions(state);
  if (action === 'card') return listAllows(p.cards, value);
  if (action === 'select') return listAllows(p.select, value);
  if (action === 'upgrade') return listAllows(p.upgrade, value);
  return !!p[action];
}

/**
 * Feed a game event to the tutorial. Advances only when the event (and payload match) is the
 * current step's advanceOn. Returns true when the step changed.
 */
export function advanceTutorial(state, event, payload = {}) {
  const step = currentStep(state);
  if (!step) return false;
  if (step.backOn && event === step.backOn) {
    state.tutorialStep = step.backTo;
    emit(state, 'tutorialChanged', { step: state.tutorialStep });
    return true;
  }
  if (event !== step.advanceOn) return false;
  if (event === 'next' && !isGuideVisible(state)) return false;
  if (step.match && !Object.entries(step.match).every(([k, v]) => payload[k] === v)) return false;
  state.tutorialStep += 1;
  if (state.tutorialStep >= TUTORIAL_DONE_STEP) {
    state.tutorialStep = TUTORIAL_DONE_STEP;
    state.tutorialDone = true;
  }
  emit(state, 'tutorialChanged', { step: state.tutorialStep, done: state.tutorialDone });
  return true;
}

/**
 * Skip: starter base at level 1, tutorial done. A hall still in ruins stays a ruin and the player gets just
 * enough gold to rebuild it (nights start once it's rebuilt); a hall already rebuilt stays level 1 and the
 * player keeps their gold.
 */
export function applyStarterBase(state) {
  const [thCol, thRow] = MAP.townHallAnchor;
  const old = state.buildings.find((b) => b.type === 'townHall');
  const rebuilt = !!old && old.level >= 1;
  state.buildings = [createBuilding(state, 'townHall', thCol, thRow, rebuilt ? 1 : 0)];
  for (const s of STARTER_BASE) state.buildings.push(createBuilding(state, s.type, s.col, s.row, 1));
  state.wallLevel = 1; // any starter walls are Level 1, the village's wall level
  if (!rebuilt) state.gold = upgradeCost('townHall', 0);
  state.tutorialStep = TUTORIAL_DONE_STEP;
  state.tutorialDone = true;
  emit(state, 'tutorialChanged', { step: state.tutorialStep, done: true });
  emit(state, 'goldChanged', { gold: state.gold });
  return state;
}

/** Only step 1 offers Skip. */
/** Skipping is offered until the player starts building: while rebuilding the hall, or just after. */
export function canSkipTutorial(state) {
  return isTutorialActive(state) && state.tutorialStep <= 2;
}
