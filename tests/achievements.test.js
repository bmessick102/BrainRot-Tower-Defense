import { describe, it, expect } from 'vitest';
import {
  ACHIEVEMENTS, ACHIEVEMENT_GROUPS, COUNTERS, achievementProgress, newlyEarned, progressValues, villageStats, estimateBestWave
} from '../src/logic/achievements.js';
import { DEFENSE_TYPES, maxLevel } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

describe('achievements', () => {
  it('every achievement is well formed: unique id, known group and stat, positive goal and reward', () => {
    const ids = new Set();
    const stats = new Set(['bestTownHall', 'bestWave', 'defenseTypes', 'walls', 'maxed', ...COUNTERS]);
    for (const a of ACHIEVEMENTS) {
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
      expect(a.id.length).toBeLessThanOrEqual(40); // the database column limit
      expect(ACHIEVEMENT_GROUPS.some((g) => g.key === a.group)).toBe(true);
      expect(stats.has(a.stat)).toBe(true);
      expect(a.goal).toBeGreaterThan(0);
      expect(a.reward).toBeGreaterThan(0);
    }
    // The window shows two columns of five cards per tab.
    for (const g of ACHIEVEMENT_GROUPS) expect(ACHIEVEMENTS.filter((a) => a.group === g.key).length).toBeLessThanOrEqual(10);
  });

  it('a fresh account has earned nothing', () => {
    expect(newlyEarned(progressValues(null), [])).toEqual([]);
  });

  it('Village Hall and wave goals are met from the account stats, once each', () => {
    const v = progressValues({ bestTownHall: 5, bestWave: 5, counters: {} });
    const ids = newlyEarned(v, new Set(['hall1']));
    expect(ids).toEqual(expect.arrayContaining(['hall3', 'hall5', 'wave1', 'wave5']));
    expect(ids).not.toContain('hall1');   // already earned
    expect(ids).not.toContain('hall7');
    expect(ids).not.toContain('wave10');
  });

  it('counters drive the battle achievements; progress is capped at the goal', () => {
    const v = progressValues({ counters: { kills: 1500, balloonKills: 2, perfect: 1 } });
    const ids = newlyEarned(v, []);
    expect(ids).toEqual(expect.arrayContaining(['kills100', 'kills1000', 'flawless']));
    expect(ids).not.toContain('balloons');
    const kills = ACHIEVEMENTS.find((a) => a.id === 'kills100');
    expect(achievementProgress(kills, v)).toEqual({ value: 100, goal: 100, done: true });
    const balloons = ACHIEVEMENTS.find((a) => a.id === 'balloons');
    expect(achievementProgress(balloons, v)).toEqual({ value: 2, goal: 5, done: false });
  });

  it('village achievements read the village being played', () => {
    const s = makeStateWithTownHall({}, 10);
    let col = 2;
    for (const t of DEFENSE_TYPES) { addBuilding(s, t, col, 2, 1); col += 4; }
    for (let i = 0; i < 50; i++) s.buildings.push({ id: `w${i}`, type: 'wall', level: 1, col: i % 30, row: 30 });
    const vs = villageStats(s);
    expect(vs.defenseTypes).toBe(DEFENSE_TYPES.length);
    expect(vs.walls).toBe(50);
    expect(vs.maxed).toBe(0);
    s.buildings.find((b) => b.type === 'cannon').level = maxLevel('cannon');
    expect(villageStats(s).maxed).toBe(1);
    const ids = newlyEarned(progressValues({}, s), []);
    expect(ids).toEqual(expect.arrayContaining(['arsenal', 'walls', 'maxed']));
  });

  it('a maxed wall or Village Hall does not count for Maxed Out', () => {
    const s = makeStateWithTownHall({}, 10);
    s.buildings.push({ id: 'w1', type: 'wall', level: maxLevel('wall'), col: 1, row: 30 });
    expect(villageStats(s).maxed).toBe(0);
  });

  it('estimates the furthest wave of a village played before waves were tracked', () => {
    expect(estimateBestWave(null, 10)).toBe(0);
    expect(estimateBestWave({ townHallLevel: 4, wavesCleared: 0 }, 10)).toBe(0);
    expect(estimateBestWave({ townHallLevel: 1, wavesCleared: 1 }, 10)).toBe(1);
    expect(estimateBestWave({ townHallLevel: 6, wavesCleared: 7 }, 10)).toBe(5);
    expect(estimateBestWave({ townHallLevel: 10, wavesCleared: 12, nightsAtMaxTownHall: 0 }, 10)).toBe(9);
    expect(estimateBestWave({ townHallLevel: 10, wavesCleared: 14, nightsAtMaxTownHall: 3 }, 10)).toBe(12);
  });
});
