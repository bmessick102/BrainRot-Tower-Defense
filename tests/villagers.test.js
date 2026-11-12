import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { villagersShouldBeOut, VILLAGER_SETTINGS, gnomeHeading, pickWanderSpot } from '../src/objects/Villagers.js';
import { makeStateWithTownHall, seededRng } from './helpers.js';

const DAY = CONFIG.dayNight.daySeconds;
const LEAD = VILLAGER_SETTINGS.homeLeadSeconds;
const play = (clock, th = 1) => makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock }, th);

describe('gnome villagers', () => {
  it('are out during the day and head home shortly before dusk', () => {
    expect(villagersShouldBeOut(play({ phase: 'day', t: 0 }))).toBe(true);
    expect(villagersShouldBeOut(play({ phase: 'day', t: DAY - LEAD - 1 }))).toBe(true);
    expect(villagersShouldBeOut(play({ phase: 'day', t: DAY - LEAD + 1 }))).toBe(false);
  });

  it('stay inside through dusk and night, and come out at dawn', () => {
    expect(villagersShouldBeOut(play({ phase: 'dusk', t: 5 }))).toBe(false);
    expect(villagersShouldBeOut(play({ phase: 'night', t: 0 }))).toBe(false);
    expect(villagersShouldBeOut(play({ phase: 'dawn', t: 1 }))).toBe(true);
  });

  it('are always out while the tutorial keeps it daytime', () => {
    const s = makeStateWithTownHall({ tutorialStep: 4, clock: { phase: 'day', t: DAY - 1 } });
    expect(villagersShouldBeOut(s)).toBe(true);
  });


  it('spread out across the village instead of bunching up at the hall', () => {
    const rng = seededRng(7);
    const center = { x: 18.5, y: 16.5 };
    const n = 6;
    const spots = [];
    for (let i = 0; i < n; i++) {
      const spot = pickWanderSpot(center, gnomeHeading(i, n, 0.3), spots, () => true, rng);
      spots.push(spot);
    }
    for (const p of spots) expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeGreaterThanOrEqual(VILLAGER_SETTINGS.minWander - 1e-9);
    let closest = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) closest = Math.min(closest, Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y));
    expect(closest).toBeGreaterThan(3); // no two gnomes end up next to each other
  });

  it('each gnome keeps to its own direction from the hall', () => {
    const rng = seededRng(3);
    const center = { x: 0, y: 0 };
    for (let k = 0; k < 20; k++) {
      const p = pickWanderSpot(center, 0, [], () => true, rng); // heading 0 = toward +x
      expect(Math.abs(Math.atan2(p.y, p.x))).toBeLessThanOrEqual(VILLAGER_SETTINGS.sectorHalfWidth + 1e-9);
    }
  });
});
