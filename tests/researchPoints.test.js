import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { damageEnemy } from '../src/logic/combat.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { explode } from '../src/logic/combat.js';
import { validateSave, serializeGame } from '../src/logic/save.js';
import { makeStateWithTownHall, addEnemy } from './helpers.js';

describe('research points', () => {
  it('every enemy kind gives research points when defeated (tougher ones more)', () => {
    for (const kind of Object.keys(CONFIG.enemies)) expect(CONFIG.enemies[kind].researchPoints).toBeGreaterThan(0);
    expect(CONFIG.enemies.tank.researchPoints).toBeGreaterThan(CONFIG.enemies.grunt.researchPoints);
    const s = makeStateWithTownHall({}, 3);
    s.wave.phase = 'active';
    const tank = addEnemy(s, 'tank', 5, 5, { hp: 10, maxHp: 10 });
    damageEnemy(s, tank, 50);
    expect(s.researchPoints).toBe(CONFIG.enemies.tank.researchPoints);
    expect(s.events.find((e) => e.name === 'enemyKilled').data.rp).toBe(CONFIG.enemies.tank.researchPoints);
  });

  it('a Wall Breaker blowing itself up gives nothing (it wasn\'t defeated)', () => {
    const s = makeStateWithTownHall({}, 3);
    const b = addEnemy(s, 'breaker', 5, 5);
    explode(s, b, CONFIG.enemies.breaker);
    expect(s.researchPoints || 0).toBe(0);
  });

  it('surviving a night gives researchPointsPerWave x the wave number, on top of the kills', () => {
    const s = makeStateWithTownHall({}, 3);
    s.wave = { ...s.wave, phase: 'active', number: 4, queues: {}, paths: [], bountyEarned: 0 };
    const g = addEnemy(s, 'grunt', 5, 5, { hp: 1, maxHp: 1 });
    damageEnemy(s, g, 5);
    expect(checkWaveCleared(s)).toBe(true);
    const night = CONFIG.rules.researchPointsPerWave * 4;
    expect(s.researchPoints).toBe(CONFIG.enemies.grunt.researchPoints + night);
    expect(s.events.find((e) => e.name === 'waveCleared').data.rp).toBe(CONFIG.enemies.grunt.researchPoints + night);
  });

  it('is saved with the village; older saves without it load with 0, and bad values are rejected', () => {
    const s = makeStateWithTownHall({ gold: 100, tutorialDone: true, tutorialStep: 10, researchPoints: 37 }, 3);
    const obj = serializeGame(s);
    expect(obj.researchPoints).toBe(37);
    expect(validateSave(obj)).toBe(true);
    delete obj.researchPoints;
    expect(validateSave(obj)).toBe(true);
    for (const bad of [-1, 1.5, '5']) expect(validateSave({ ...obj, researchPoints: bad })).toBe(false);
  });
});
