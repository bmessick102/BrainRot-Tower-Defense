import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { enrageFactor, isRestless, nightLootMult } from '../src/logic/enrage.js';
import { damageEnemy } from '../src/logic/combat.js';
import { stepWaveSpawning, checkWaveCleared } from '../src/logic/waves.js';
import { waveResearchPoints } from '../src/logic/researchPoints.js';
import { makeStateWithTownHall, addEnemy } from './helpers.js';

const N = CONFIG.rules.night;
const attack = (phase, t = 0) => {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, gold: 0, researchPoints: 0, clock: { phase, t } }, 3);
  s.wave = { ...s.wave, phase: 'active', number: 4, queues: {}, paths: [], bountyEarned: 0 };
  return s;
};

describe('restless nights', () => {
  it('enemies are restless only while a wave attacks in the dark', () => {
    expect(isRestless(attack('night'))).toBe(true);
    expect(isRestless(attack('day'))).toBe(false);
    expect(isRestless(attack('dusk', 1))).toBe(false);                            // still light early in dusk
    expect(isRestless(attack('dusk', CONFIG.dayNight.duskSeconds - 1))).toBe(true); // dark by its end
    const idle = attack('night');
    idle.wave.phase = 'idle';
    expect(isRestless(idle)).toBe(false); // no wave: nobody to be restless
  });

  it('restless enemies hit harder and move faster, on top of any enrage', () => {
    expect(enrageFactor(attack('day'))).toEqual({ damage: 1, speed: 1 });
    expect(enrageFactor(attack('night'))).toEqual({ damage: N.damage, speed: N.speed });
    const s = attack('night');
    s.wave.stallTime = CONFIG.rules.enrage.after + CONFIG.rules.enrage.ramp; // enraged one step
    const f = enrageFactor(s);
    expect(f.damage).toBeCloseTo(2 * N.damage, 6);
    expect(f.speed).toBeCloseTo(1.5 * N.speed, 6);
  });

  it('kills at night pay more gold and research points', () => {
    expect(nightLootMult(attack('day'))).toBe(1);
    expect(nightLootMult(attack('night'))).toBe(1 + N.lootBonus);
    const day = attack('day'), night = attack('night');
    night.capacity = day.capacity = 1e6;
    for (const s of [day, night]) {
      const e = addEnemy(s, 'tank', 5, 5, { hp: 1, maxHp: 1 });
      damageEnemy(s, e, 10);
    }
    const bounty = CONFIG.enemies.tank.bounty, rp = CONFIG.enemies.tank.researchPoints;
    expect(day.gold).toBe(bounty);
    expect(night.gold).toBe(Math.round(bounty * (1 + N.lootBonus)));
    expect(day.researchPoints).toBe(rp);
    expect(night.researchPoints).toBe(Math.round(rp * (1 + N.lootBonus)));
  });

  it('beating a wave in the dark pays more research points too', () => {
    const s = attack('night');
    s.wave.startBuildings = 1; s.wave.lost = 1; // 1 star: no star bonus
    expect(checkWaveCleared(s)).toBe(true);
    expect(s.researchPoints).toBe(Math.round(waveResearchPoints(4) * (1 + N.lootBonus)));
  });

  it('tells the UI when the enemies turn restless and when they calm down', () => {
    const s = attack('day');
    s.wave.queues = { a: ['grunt'] };
    stepWaveSpawning(s, 0.05);
    expect(s.events.some((e) => e.name === 'restlessChanged')).toBe(false);
    s.clock = { phase: 'night', t: 0 };
    stepWaveSpawning(s, 0.05);
    expect(s.events.filter((e) => e.name === 'restlessChanged').map((e) => e.data.restless)).toEqual([true]);
    s.clock = { phase: 'day', t: 0 };
    stepWaveSpawning(s, 0.05);
    expect(s.events.filter((e) => e.name === 'restlessChanged').map((e) => e.data.restless)).toEqual([true, false]);
  });
});
