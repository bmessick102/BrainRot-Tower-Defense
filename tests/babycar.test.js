import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createEnemy, stepEnemy, removeDeadEnemies, babyCarBurst } from '../src/logic/enemies.js';
import { damageEnemy } from '../src/logic/combat.js';
import { babyCarCount, nextWaveComposition, buildSpawnQueues } from '../src/logic/waves.js';
import { maxHp } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const CAR = CONFIG.enemies.babycar;
const B = CONFIG.rules.babyCar;

/** A village at Village Hall th with a Da Baby Car on the hall's row, `x` tiles in, driving at it. */
function scene(th = 7, x = 4) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, th);
  s.wave = { ...s.wave, phase: 'active', number: 12, queues: {}, paths: [], bountyEarned: 0 };
  const hall = s.buildings[0];
  const y = hall.row + hall.size / 2;
  const car = createEnemy(s, 'babycar', x, y, 1);
  car.x = x; car.y = y; // no spawn jitter
  car.targetId = hall.id;
  s.enemies.push(car);
  return { s, hall, car, y };
}
const drive = (s, car, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) { stepEnemy(s, car, dt); if (!car.alive) break; } };

describe('Da Baby Car (raid boss)', () => {
  it('is a big ground boss: about 6 Tanks of health, a big bounty', () => {
    expect(CAR.boss).toBe(true);
    expect(CAR.type).toBe('ground');
    expect(CAR.hp).toBe(CONFIG.enemies.tank.hp * 6);
    expect(CAR.bounty).toBe(150);
    expect(CAR.researchPoints).toBe(40); // v0.5 rebalance (was 25)
  });

  it('comes in every 2nd normal wave from Village Hall 6 (2 cars from Village Hall 9), never in special waves', () => {
    expect(babyCarCount(5, 2)).toBe(0);
    expect(babyCarCount(B.fromTownHall, 2)).toBe(1);
    expect(babyCarCount(B.fromTownHall, 3)).toBe(0);
    expect(babyCarCount(9, 4)).toBe(2);
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: 3 }, 7); // next: wave 4
    expect(nextWaveComposition(s).babycar).toBe(1);
    s.wavesCleared = 5; // wave 6: a special wave (every 3rd)
    expect(nextWaveComposition(s).special).toBeTruthy();
    expect(nextWaveComposition(s).babycar || 0).toBe(0);
    // It leads its path's queue.
    const q = buildSpawnQueues({ babycar: 1, grunt: 3, tank: 1 }, ['left']);
    expect(q.left[0]).toBe('babycar');
  });

  it('drives in a straight line at the Village Hall (no dirt-path march, no detours)', () => {
    const { s, car, y } = scene();
    drive(s, car, 3);
    expect(car.y).toBeCloseTo(y, 5);   // stayed on the line
    expect(car.x).toBeGreaterThan(4 + CAR.speed * 2.5);
    expect(car.entry || null).toBe(null);
  });

  it('smashes a wall in one hit and rams through other buildings (ramDamage, a short stall), each once', () => {
    const { s, car, y } = scene(7, 2);
    const row = Math.floor(y);
    const wall = addBuilding(s, 'wall', 5, row, 7);
    const cannon = addBuilding(s, 'cannon', 9, row, 5);
    const cannonHp = cannon.hp;
    drive(s, car, 18);
    expect(wall.destroyed).toBe(true);           // even a top-level wall
    expect(cannon.hp).toBe(Math.max(0, cannonHp - CAR.ramDamage));
    expect(car.rammed).toEqual([wall.id, cannon.id]);
    expect(s.events.filter((e) => e.name === 'babyCarRam').map((e) => e.data.wall)).toEqual([true, false]);
    expect(car.x).toBeGreaterThan(10);           // it plowed on through
  });

  it('batters the Village Hall once it reaches it', () => {
    const { s, hall, car } = scene(7, 0);
    car.x = hall.col - 0.4; // right at the hall
    const hp = hall.hp;
    drive(s, car, CAR.attackInterval + 0.1);
    expect(car.attacking).toBe(true);
    expect(hall.hp).toBeLessThan(hp);
    expect(hp - hall.hp).toBeCloseTo(CAR.damage * 2, 5); // a hit at once, another after attackInterval
    expect(maxHp(hall)).toBeGreaterThan(hall.hp);
  });

  it('bursts into a mix of the wave\'s ground troops when destroyed, more in later waves', () => {
    const { s, car } = scene(7);
    s.wave.number = 20;
    s.capacity = 1e6;
    const gold = s.gold;
    damageEnemy(s, car, car.hp + 1);
    expect(car.alive).toBe(false);
    expect(s.gold).toBeGreaterThan(gold); // its bounty
    removeDeadEnemies(s);
    const burst = s.events.find((e) => e.name === 'babyCarBurst');
    const expected = CAR.deathSpawn.base + Math.floor((20 - CAR.deathSpawn.fromWave) / CAR.deathSpawn.perWaves);
    expect(burst.data.troops).toHaveLength(expected);
    const troops = s.enemies.filter((e) => burst.data.troops.includes(e.id));
    expect(troops.every((t) => CONFIG.enemies[t.kind].type !== 'air' && t.kind !== 'babycar' && t.kind !== 'neegy')).toBe(true);
    removeDeadEnemies(s); // only once
    expect(s.events.filter((e) => e.name === 'babyCarBurst')).toHaveLength(1);
  });

  it('the burst only uses ground troops the base wave has (Grunts if none)', () => {
    const s = makeStateWithTownHall({}, 1);
    const mix = babyCarBurst(s, CAR, 10, { grunt: 0, tank: 4, bomber: 9 });
    expect(Object.keys(mix)).toEqual(['tank']);
    expect(mix.tank).toBe(CAR.deathSpawn.base);
    expect(babyCarBurst(s, CAR, 10, { bomber: 3 })).toEqual({ grunt: CAR.deathSpawn.base });
  });
});
