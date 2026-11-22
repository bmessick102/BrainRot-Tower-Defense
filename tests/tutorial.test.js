import { describe, it, expect } from 'vitest';
import { MAP } from '../src/mapTiles.js';
import { CONFIG } from '../src/config.js';
import {
  TUTORIAL_STEPS, TUTORIAL_DONE_STEP, TUTORIAL_NIGHT_STEP, STARTER_BASE, advanceTutorial, applyStarterBase, tutorialPermissions,
  tutorialAllows, canSkipTutorial, isGuideVisible
} from '../src/logic/tutorial.js';
import { canPlaceAt } from '../src/logic/grid.js';
import { buildCost } from '../src/logic/buildings.js';
import { makeStateWithTownHall } from './helpers.js';

// [event, payload] that completes each step (1-based index).
const COMPLETES = [
  null,
  ['townHallUpgraded', { level: 1 }],
  ['shopOpened', {}],
  ['placementStarted', { type: 'mine' }],
  ['buildingPlaced', { type: 'mine' }],
  ['mineCollected', {}],
  ['buildingPlaced', { type: 'storage' }],
  ['buildingPlaced', { type: 'cannon' }],
  ['waveStarted', {}],
  ['next', {}]
];

const ALL_EVENTS = [
  ['next', {}], ['shopOpened', {}], ['placementStarted', { type: 'mine' }], ['placementStarted', { type: 'cannon' }],
  ['buildingPlaced', { type: 'mine' }], ['buildingPlaced', { type: 'storage' }], ['buildingPlaced', { type: 'cannon' }],
  ['mineCollected', {}], ['townHallUpgraded', {}], ['townHallUpgraded', { level: 2 }], ['waveStarted', {}], ['waveCleared', {}]
];

describe('tutorial.js', () => {
  it('has 9 steps, with night introduced after the cannon', () => {
    expect(TUTORIAL_STEPS.filter(Boolean)).toHaveLength(9);
    expect(TUTORIAL_NIGHT_STEP).toBe(8);
    expect(TUTORIAL_STEPS[TUTORIAL_NIGHT_STEP].advanceOn).toBe('waveStarted');
  });

  it('each step advances only on its own event', () => {
    const state = makeStateWithTownHall({ gold: 0 });
    for (let step = 1; step <= 9; step++) {
      expect(state.tutorialStep).toBe(step);
      if (step === 9) state.wavesCleared = 1; // the last step shows after the first night is survived
      const [goodEvent, goodPayload] = COMPLETES[step];
      for (const [ev, payload] of ALL_EVENTS) {
        if (ev === goodEvent && JSON.stringify(payload) === JSON.stringify(goodPayload)) continue;
        if (step === 4 && ev === 'placementCancelled') continue;
        advanceTutorial(state, ev, payload);
        expect(state.tutorialStep).toBe(step);
      }
      expect(advanceTutorial(state, goodEvent, goodPayload)).toBe(true);
    }
    expect(state.tutorialStep).toBe(TUTORIAL_DONE_STEP);
    expect(state.tutorialDone).toBe(true);
  });

  it('cancelling placement on step 4 goes back to "Buy a Bitcoin Mine"', () => {
    const state = makeStateWithTownHall({ tutorialStep: 4 });
    advanceTutorial(state, 'placementCancelled');
    expect(state.tutorialStep).toBe(3);
  });

  it("the last step's Next is ignored until the first night is survived", () => {
    const state = makeStateWithTownHall({ tutorialStep: 9 });
    expect(isGuideVisible(state)).toBe(false);
    expect(advanceTutorial(state, 'next')).toBe(false);
    state.wavesCleared = 1;
    expect(advanceTutorial(state, 'next')).toBe(true);
  });

  it('gold-gated steps enable their card only once there is enough gold', () => {
    const state = makeStateWithTownHall({ tutorialStep: 6, gold: buildCost('storage') - 1 });
    expect(tutorialAllows(state, 'card', 'storage')).toBe(false);
    expect(tutorialAllows(state, 'collect')).toBe(true);
    state.gold = buildCost('storage');
    expect(tutorialAllows(state, 'card', 'storage')).toBe(true);
    expect(tutorialAllows(state, 'card', 'cannon')).toBe(false);
  });

  it('only the mine card is enabled on step 3', () => {
    const state = makeStateWithTownHall({ tutorialStep: 3, gold: 150 });
    const p = tutorialPermissions(state);
    expect(p.cards).toEqual(['mine']);
    expect(p.move).toBe(false);
  });

  it('skip after rebuilding the hall keeps it and the gold', () => {
    const state = makeStateWithTownHall({ gold: 150, tutorialStep: 2 });
    expect(canSkipTutorial(state)).toBe(true);
    applyStarterBase(state);
    expect(state.buildings[0].level).toBe(1);
    expect(state.gold).toBe(150);
    expect(canSkipTutorial(makeStateWithTownHall({ tutorialStep: 3 }))).toBe(false);
  });

  it('skip produces the starter base', () => {
    const state = makeStateWithTownHall({ gold: 150 }, 0);
    expect(canSkipTutorial(state)).toBe(true);
    applyStarterBase(state);
    expect(state.gold).toBe(CONFIG.townHall.levels[0].upgradeCost); // just enough to rebuild the hall
    expect(state.tutorialDone).toBe(true);
    expect(state.buildings.map((b) => [b.type, b.col, b.row, b.level])).toEqual([
      ['townHall', ...MAP.townHallAnchor, 0], // skippers start with the ruined hall too
      ...STARTER_BASE.map((s) => [s.type, s.col, s.row, 1])
    ]);
    expect(STARTER_BASE.map((s) => [s.col, s.row])).toEqual([[13, 15], [21, 15], [17, 11]]);
    // every starter building sits on grass without overlapping
    state.buildings.forEach((b) => {
      const others = state.buildings.filter((o) => o !== b);
      expect(canPlaceAt(others, b.col, b.row, b.size).ok).toBe(true);
    });
    expect(tutorialAllows(state, 'move')).toBe(true);
  });
});
