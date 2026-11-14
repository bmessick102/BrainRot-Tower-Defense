import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { levelStats, limitFor, upgradeCost, checkUpgrade, applyLevelUp, buildableCount } from '../src/logic/buildings.js';
import { getCapacity } from '../src/logic/economy.js';
import { isClockRunning, canStartWave } from '../src/logic/dayNight.js';
import { gnomeRoster } from '../src/logic/villagers.js';
import { advanceTutorial, applyStarterBase } from '../src/logic/tutorial.js';
import { serializeGame, validateSave, deserializeGame } from '../src/logic/save.js';
import { makeStateWithTownHall } from './helpers.js';

const ruined = (extra = {}) => makeStateWithTownHall({ gold: CONFIG.startingGold, ...extra }, 0);

describe('the ruined Village Hall (level 0)', () => {
  it('has its own small stats and costs 100 to rebuild; starting gold also covers the first Mine', () => {
    expect(levelStats('townHall', 0)).toEqual(CONFIG.townHall.ruin);
    expect(upgradeCost('townHall', 0)).toBe(100);
    expect(CONFIG.startingGold).toBe(100 + CONFIG.mine.levels[0].cost);
  });

  it('nothing can be built, nobody lives there, and no nights come until it is rebuilt', () => {
    const s = ruined({ tutorialDone: true, tutorialStep: 10 });
    expect(limitFor('mine', 0)).toBe(0);
    expect(buildableCount(s)).toBe(0);
    expect(gnomeRoster(s)).toHaveLength(0);
    expect(isClockRunning(s)).toBe(false);
    expect(canStartWave(s)).toBe(false); // no Start Wave button either
    expect(getCapacity(s)).toBe(CONFIG.townHall.ruin.capacity);
  });

  it('rebuilding it to level 1 unlocks building and the clock', () => {
    const s = ruined({ tutorialDone: true, tutorialStep: 10 });
    const th = s.buildings[0];
    expect(checkUpgrade(s, th)).toMatchObject({ ok: true, cost: 100 });
    applyLevelUp(th);
    expect(th.level).toBe(1);
    expect(th.hp).toBe(CONFIG.townHall.levels[0].hp);
    expect(buildableCount(s)).toBeGreaterThan(0);
    expect(isClockRunning(s)).toBe(true);
  });

  it('tutorial step 1 is rebuilding the hall', () => {
    const s = ruined();
    expect(advanceTutorial(s, 'next')).toBe(false);
    expect(advanceTutorial(s, 'townHallUpgraded', { level: 1 })).toBe(true);
    expect(s.tutorialStep).toBe(2);
  });

  it('saves with a ruined hall (and the skip starter base beside it) are valid', () => {
    const s = ruined();
    applyStarterBase(s);
    const saved = JSON.parse(JSON.stringify(serializeGame({ ...s, wavesCleared: 0, nightsAtMaxTownHall: 0 })));
    expect(saved.townHallLevel).toBe(0);
    expect(validateSave(saved)).toBe(true);
    expect(deserializeGame(saved).buildings[0].level).toBe(0);
  });
});
