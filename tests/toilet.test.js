import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createEnemy, stepEnemy, spawnEnemy } from '../src/logic/enemies.js';
import { damageEnemy, isBurrowedUnseen, applySplash, stepDefenses } from '../src/logic/combat.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepTraps } from '../src/logic/traps.js';
import { waveComposition } from '../src/logic/waves.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const T = CONFIG.enemies.toilet;

/** A village with a target building and a Skibidi Toilet tunneling at it from (x, y). */
function scene(x = 2, y = 16.5) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 6);
  s.wave = { ...s.wave, phase: 'active', number: 8, queues: {}, paths: [], bountyEarned: 0 };
  const e = createEnemy(s, 'toilet', x, y, 1);
  e.x = x; e.y = y;
  s.enemies.push(e);
  return { s, e };
}
const run = (s, e, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) stepEnemy(s, e, dt); };

describe('Skibidi Toilet (burrower)', () => {
  it('joins the waves from Village Hall 5 and grows with the hall', () => {
    expect(waveComposition(4).toilet).toBe(0);
    expect(waveComposition(5).toilet).toBe(T.baseCount);
    expect(waveComposition(10).toilet).toBeGreaterThan(T.baseCount);
  });

  it('starts underground and tunnels straight in from the map edge (no dirt-path march)', () => {
    const s = makeStateWithTownHall({}, 6);
    const e = spawnEnemy(s, 'toilet', 'right', 1);
    expect(e.underground).toBe(true);
    expect(e.entry || null).toBe(null);
  });

  it('underground and unseen it can\'t be aimed at, damaged, splashed or trapped', () => {
    const { s, e } = scene(9, 16.5);
    expect(isBurrowedUnseen(e)).toBe(true);
    const hp = e.hp;
    damageEnemy(s, e, 50);
    applySplash(s, e.x, e.y, 2, 50, true, true);
    expect(e.hp).toBe(hp);
    // A cannon right next to it can't shoot it.
    const cannon = addBuilding(s, 'cannon', 10, 15, 5);
    stepDefenses(s, 2);
    expect(cannon.targetId == null || cannon.targetId !== e.id).toBe(true);
    // A Mousetrap under it doesn't snap.
    const trap = addBuilding(s, 'mousetrap', Math.floor(e.x), Math.floor(e.y), 3);
    stepTraps(s, 0.1);
    expect(trap.sprung || false).toBe(false);
  });

  it('a F.L.O.C.K Tower that sees it makes it targetable and hittable even underground', () => {
    const { s, e } = scene(9, 16.5);
    addBuilding(s, 'flock', 8, 14, 3);
    stepFlockTowers(s);
    expect(e.flockSeen).toBe(true);
    expect(isBurrowedUnseen(e)).toBe(false);
    const hp = e.hp;
    damageEnemy(s, e, 50);
    expect(e.hp).toBeLessThan(hp);
  });

  it('tunnels under walls to the nearest building, surfaces, attacks, then burrows on to the next', () => {
    const { s, e } = scene(2, 16.5);
    const row = 16;
    const wall = addBuilding(s, 'wall', 5, row, 8);
    const mine = addBuilding(s, 'mine', 8, row, 1); // nearest building, behind the wall
    e.targetId = mine.id;
    run(s, e, 8);
    expect(wall.destroyed).toBe(false); // went under it
    expect(e.underground).toBe(false);  // surfaced at the mine
    expect(s.events.some((x) => x.name === 'enemySurfaced')).toBe(true);
    expect(mine.hp).toBeLessThan(CONFIG.mine.levels[0].hp); // and attacking it
    expect(damageEnemy(s, e, 1) === undefined && e.hp < e.maxHp).toBe(true); // surfaced: hittable
    mine.hp = 0; mine.destroyed = true;
    run(s, e, 0.2);
    expect(e.underground).toBe(true);   // dove back down for the next one
    expect(s.events.some((x) => x.name === 'enemyBurrowed')).toBe(true);
  });
});
