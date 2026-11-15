import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { starsFor, starBonus, starText, liveStars } from '../src/logic/waveStars.js';
import { triggerWave, checkWaveCleared } from '../src/logic/waves.js';
import { damageBuilding } from '../src/logic/combat.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const W = CONFIG.rules.waveStars;

/** A village with 4 counted buildings (hall + 3) and some walls, a wave just triggered and active. */
function village() {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, gold: 0, researchPoints: 0 }, 5);
  s.capacity = 1e6;
  const cannon = addBuilding(s, 'cannon', 9, 16, 3);
  const mine = addBuilding(s, 'mine', 13, 11, 3);
  const archer = addBuilding(s, 'archer', 6, 20, 3);
  const wall = addBuilding(s, 'wall', 4, 22, 1);
  triggerWave(s);
  s.wave.phase = 'active'; s.wave.queues = {}; s.enemies = [];
  return { s, cannon, mine, archer, wall };
}

describe('wave stars', () => {
  it('3 stars when nothing is lost, 2 with at least 75% standing, else 1', () => {
    expect(starsFor(10, 0)).toBe(3);
    expect(starsFor(10, 2)).toBe(2);
    expect(starsFor(4, 1)).toBe(2);   // exactly 75%
    expect(starsFor(10, 3)).toBe(1);
    expect(starsFor(0, 0)).toBe(3);
    expect(starText(2)).toBe('★★☆');
    expect([1, 2, 3].map(starBonus)).toEqual(W.bonus);
  });

  it('counts the buildings standing at the start (not walls) and every one destroyed during the wave', () => {
    const { s, cannon, wall } = village();
    expect(s.wave.startBuildings).toBe(4);
    expect(liveStars(s)).toBe(3);
    damageBuilding(s, wall, 99999);       // walls don't count
    expect(s.wave.lost).toBe(0);
    damageBuilding(s, cannon, 99999);
    expect(s.wave.lost).toBe(1);
    expect(liveStars(s)).toBe(2);
  });

  it('a good rating pays a bonus on the wave\'s gold and RP; the free rebuild still happens', () => {
    const { s, cannon } = village();
    s.wave.bountyEarned = 100;
    s.wave.rpEarned = 0;
    expect(checkWaveCleared(s)).toBe(true);
    const d = s.events.find((e) => e.name === 'waveCleared').data;
    expect(d.stars).toBe(3);
    expect(d.starGold).toBe(Math.round(100 * W.bonus[2]));
    expect(d.starRp).toBeGreaterThan(0); // half of the wave's research points
    expect(s.gold).toBe(d.starGold);
    expect(cannon.destroyed).toBe(false);

    const b = village();
    b.s.wave.bountyEarned = 100;
    damageBuilding(b.s, b.cannon, 99999);
    damageBuilding(b.s, b.mine, 99999);   // 2 of 4 lost: 50% standing -> 1 star
    checkWaveCleared(b.s);
    const e = b.s.events.find((x) => x.name === 'waveCleared').data;
    expect(e).toMatchObject({ stars: 1, starGold: 0, starRp: 0, lost: 2 });
    expect(b.cannon.destroyed).toBe(false); // rebuilt free anyway
  });
});
