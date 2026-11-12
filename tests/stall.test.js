import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { damageBuilding, fireEnemyProjectile } from '../src/logic/combat.js';
import { assignGnomes, stepGnomeRepairs, isUnderFire } from '../src/logic/villagers.js';
import { stepWaveSpawning } from '../src/logic/waves.js';
import { enrageFactor } from '../src/logic/enrage.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const E = CONFIG.rules.enrage;
const attack = (extra = {}) => {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'night', t: 0 }, ...extra });
  s.wave.phase = 'active';
  addBuilding(s, 'house', 21, 20, 5); // 3 gnomes to do the repairs
  return s;
};

describe('gnomes never repair a building under fire', () => {
  it('a hit puts the building under fire for a few seconds; gnomes only repair once it is quiet', () => {
    const s = attack();
    const mine = addBuilding(s, 'mine', 9, 16);
    damageBuilding(s, mine, 100);
    expect(isUnderFire(mine)).toBe(true);
    const hp = mine.hp;
    const jobs = assignGnomes(s);
    stepGnomeRepairs(s, 1, jobs);
    expect(mine.hp).toBe(hp); // still under fire: gnomes wait
    for (let t = 0; t < CONFIG.villagers.repairDelayAfterHit; t += 0.1) stepGnomeRepairs(s, 0.1, jobs);
    expect(isUnderFire(mine)).toBe(false);
    stepGnomeRepairs(s, 1, jobs);
    expect(mine.hp).toBeGreaterThan(hp); // quiet again: repairs resume
  });

  it('a lone ranged enemy out of every defense\'s reach still wears its target down (no stalemate)', () => {
    const s = attack();
    const mine = addBuilding(s, 'mine', 9, 16);
    const slinger = CONFIG.enemies.slinger;
    let destroyedAt = null;
    for (let t = 0, next = 0; t < 120 && destroyedAt === null; t += 0.1) {
      if (t >= next) { damageBuilding(s, mine, slinger.damage); next += slinger.attackInterval; }
      stepGnomeRepairs(s, 0.1, assignGnomes(s));
      if (mine.destroyed) destroyedAt = t;
    }
    expect(destroyedAt).not.toBeNull();
    expect(destroyedAt).toBeLessThan(CONFIG.mine.levels[0].hp / (slinger.damage / slinger.attackInterval) + 2);
  });

  it('quiet damaged buildings are repaired before ones under fire', () => {
    const s = attack();
    const shot = addBuilding(s, 'mine', 9, 16);
    const quiet = addBuilding(s, 'storage', 13, 20);
    damageBuilding(s, shot, 250);   // nearly dead, but being shot
    quiet.hp -= 50;                 // lightly damaged, quiet
    const jobs = [...assignGnomes(s).values()].filter((g) => g.task === 'repair');
    expect(jobs[0].targetId).toBe(quiet.id);
  });
});

describe('stalled waves enrage', () => {
  it('enemies are normal until `after` seconds pass with nothing left to spawn, then grow stronger up to a cap', () => {
    const s = attack();
    expect(enrageFactor(s)).toEqual({ damage: 1, speed: 1 });
    stepWaveSpawning(s, E.after - 1);
    expect(enrageFactor(s)).toEqual({ damage: 1, speed: 1 });
    expect(s.wave.enraged).toBeFalsy();
    stepWaveSpawning(s, 1 + E.ramp);           // one ramp past the threshold
    expect(enrageFactor(s)).toEqual({ damage: 2, speed: 1.5 });
    expect(s.wave.enraged).toBe(true);
    stepWaveSpawning(s, E.ramp * 20);
    expect(enrageFactor(s)).toEqual({ damage: E.maxDamage, speed: E.maxSpeed });
    expect(s.events.filter((e) => e.name === 'enemiesEnraged')).toHaveLength(1);
  });

  it('the clock only starts once the whole wave has spawned', () => {
    const s = attack();
    s.wave.paths = ['left'];
    s.wave.queues = { left: ['grunt', 'grunt'] };
    s.wave.spawnTimer = 999; // nothing spawns during this step
    stepWaveSpawning(s, E.after + 10);
    expect(enrageFactor(s)).toEqual({ damage: 1, speed: 1 });
  });

  it('enraged ranged shots hit harder', () => {
    const s = attack();
    const mine = addBuilding(s, 'mine', 9, 16);
    const e = addEnemy(s, 'slinger', 5, 16);
    stepWaveSpawning(s, E.after + E.ramp);
    expect(fireEnemyProjectile(s, e, mine).damage).toBe(CONFIG.enemies.slinger.damage * 2);
  });
});
