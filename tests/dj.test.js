import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { gnomeBoost, addHype, checkDropBeat, dropTheBeat, stepDj, hypeNeeded, djStats, buildingsInDjRange } from '../src/logic/dj.js';
import { DEFENSE_TYPES, limitFor, checkBuy } from '../src/logic/buildings.js';
import { towerFireInterval } from '../src/logic/abilities.js';
import { enrageFactor } from '../src/logic/enrage.js';
import { damageEnemy } from '../src/logic/combat.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const N = CONFIG.rules.night;

function village(vh = 6) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, gold: 1e6, clock: { phase: 'day', t: 0 } }, vh);
  s.capacity = 1e9;
  const dj = addBuilding(s, 'dj', 10, 10, 1);
  return { s, dj };
}

describe('DJ Babyface', () => {
  it('a 2x2 utility building, 1 allowed from Village Hall 5', () => {
    expect([1, 2, 3, 4, 5, 10].map((th) => limitFor('dj', th))).toEqual([0, 0, 0, 0, 1, 1]);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 4), 'dj').ok).toBe(false);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 5), 'dj').ok).toBe(true);
  });

  it('work playlist: gnomes at buildings in range work faster; out of range, no change', () => {
    const { s, dj } = village();
    const near = addBuilding(s, 'mine', 12, 10, 1);
    const far = addBuilding(s, 'mine', 25, 25, 1);
    expect(gnomeBoost(s, near)).toBeCloseTo(1 + djStats(dj).gnomeBoostPct / 100, 6);
    expect(gnomeBoost(s, far)).toBe(1);
    dj.destroyed = true;
    expect(gnomeBoost(s, near)).toBe(1);
  });

  it('defeated enemies fill the hype meter (a packed one counts as many); full, it says so once', () => {
    const { s, dj } = village();
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    const e = addEnemy(s, 'grunt', 3, 3, { hp: 1, maxHp: 1 });
    damageEnemy(s, e, 5);
    expect(dj.hype).toBe(1);
    const p = addEnemy(s, 'grunt', 3, 3, { hp: 1, maxHp: 1, pack: 4 });
    damageEnemy(s, p, 5);
    expect(dj.hype).toBe(5);
    addHype(s, 999);
    expect(dj.hype).toBe(hypeNeeded(dj));
    expect(s.events.filter((x) => x.name === 'hypeFull')).toHaveLength(1);
  });

  it('Drop the Beat: only with a full meter during a wave; defenses in range fire faster for a while', () => {
    const { s, dj } = village();
    const near = addBuilding(s, 'cannon', 13, 10, 5);
    const far = addBuilding(s, 'cannon', 26, 26, 5);
    expect(checkDropBeat(s, dj).ok).toBe(false); // empty
    dj.hype = hypeNeeded(dj);
    expect(checkDropBeat(s, dj).reason).toBe('Only during a wave');
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    const before = towerFireInterval(near);
    expect(dropTheBeat(s, dj, DEFENSE_TYPES).ok).toBe(true);
    expect(dj.hype).toBe(0);
    const st = djStats(dj);
    expect(towerFireInterval(near)).toBeCloseTo(before / (1 + st.beatPct / 100), 6);
    expect(towerFireInterval(far)).toBe(before);
    stepDj(s, st.beatSeconds + 0.1);
    expect(towerFireInterval(near)).toBe(before); // over
  });

  it('light show: at night, enemies in range are not restless (no damage or speed bonus)', () => {
    const { s } = village();
    s.clock = { phase: 'night', t: 10 };
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    const inRange = addEnemy(s, 'grunt', 11, 11);
    const outside = addEnemy(s, 'grunt', 28, 28);
    stepDj(s, 0.05);
    expect(inRange.calmed).toBe(true);
    expect(outside.calmed).toBe(false);
    expect(enrageFactor(s, inRange)).toEqual({ damage: 1, speed: 1 });
    expect(enrageFactor(s, outside)).toEqual({ damage: N.damage, speed: N.speed });
    s.clock = { phase: 'day', t: 10 };
    stepDj(s, 0.05);
    expect(inRange.calmed).toBe(false);
  });

  it('the meter empties when a wave is beaten, and a saved charge (older saves) loads empty (v0.11.1)', () => {
    const { s, dj } = village();
    s.wave.phase = 'active';
    dj.hype = 17;
    expect(checkWaveCleared(s)).toBe(true); // (no enemies left)
    expect(dj.hype).toBe(0);
    const gs = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    gs.startNew();
    gs.buildings[0].level = 6; gs.tutorialDone = true; gs.tutorialStep = 10;
    gs.buildings.push(...s.buildings.filter((b) => b.type === 'dj'));
    const saved = serializeGame(gs);
    expect(saved.buildings.find((b) => b.type === 'dj').hype).toBeUndefined();
    saved.buildings.find((b) => b.type === 'dj').hype = 17; // a save from before v0.11.1
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const back = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    back.loadFromSave(parsed.data);
    expect(back.buildings.find((b) => b.type === 'dj').hype).toBe(0);
  });

  it('knows which buildings it reaches (for the purple highlight): in range, not walls, not itself', () => {
    const { s, dj } = village();
    const near = addBuilding(s, 'cannon', 13, 10, 5);
    const mine = addBuilding(s, 'mine', 10, 13, 1);
    const wall = addBuilding(s, 'wall', 12, 12, 1);
    const far = addBuilding(s, 'archer', 26, 26, 5);
    const ids = buildingsInDjRange(dj, s.buildings).map((b) => b.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(wall.id);
    expect(ids).not.toContain(far.id);
    expect(ids).not.toContain(dj.id);
  });
});
