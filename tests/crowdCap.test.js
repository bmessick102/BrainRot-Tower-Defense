import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { applyCrowdCap, scaledWaveComposition, waveStrength, nextWaveComposition, triggerWave, stepWaveSpawning } from '../src/logic/waves.js';
import { ENEMY_KINDS, spawnEnemy, stepEnemy, dropTroopsAt, enemyLevel } from '../src/logic/enemies.js';
import { damageEnemy, applySplash, areaPack } from '../src/logic/combat.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const CAP = CONFIG.rules.crowdCap.maxEnemies;
const count = (c) => ENEMY_KINDS.filter((k) => !CONFIG.enemies[k].boss).reduce((n, k) => n + (c[k] || 0), 0);

describe('crowd cap', () => {
  it('small waves are untouched (pack 1)', () => {
    const c = applyCrowdCap(scaledWaveComposition(5, 10));
    expect(count(c)).toBeLessThanOrEqual(CAP);
    expect(c.pack).toBe(1);
  });

  it('a huge late wave keeps its mix at about the cap, and its strength, through the pack factor', () => {
    const raw = scaledWaveComposition(10, 140);
    expect(count(raw)).toBeGreaterThan(1500);
    const c = applyCrowdCap(raw);
    expect(count(c)).toBeLessThanOrEqual(CAP + ENEMY_KINDS.length); // rounding can add a few
    expect(c.pack).toBeGreaterThan(3); // (v0.7: fewer, tougher late enemies, so a little less packing)
    // Same total health: fewer enemies, each `pack` times tougher.
    expect((waveStrength(c) * c.pack) / waveStrength(raw)).toBeCloseTo(1, 2); // within rounding of the pack factor
    for (const k of ENEMY_KINDS) if (raw[k] > 0) expect(c[k]).toBeGreaterThan(0); // every kind still comes
    expect(Math.abs((c.grunt / c.tank) / (raw.grunt / raw.tank) - 1)).toBeLessThan(0.1); // same mix (within rounding)
  });

  it('the wave carries the pack factor; packed enemies have that much more health, damage and bounty', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: 127, gold: 0 }, 10);
    s.capacity = 1e9;
    const comp = nextWaveComposition(s);
    triggerWave(s);
    expect(s.wave.pack).toBe(comp.pack);
    const pack = s.wave.pack;
    const g = spawnEnemy(s, 'grunt', 'left', s.wave.hpMultiplier, pack);
    expect(g.pack).toBe(pack);
    expect(g.maxHp).toBe(Math.round(CONFIG.enemies.grunt.hp * s.wave.hpMultiplier * pack));
    // Its hits land `pack` times harder.
    const target = addBuilding(s, 'cannon', 5, 5, 10);
    g.x = 5 - 0.3; g.y = 5.5; g.entry = null; g.targetId = target.id; g.cooldown = 0;
    const hp = target.hp;
    stepEnemy(s, g, 0.01);
    expect(hp - target.hp).toBeCloseTo(CONFIG.enemies.grunt.damage * pack, 5);
    // And it pays `pack` times the bounty.
    s.wave.phase = 'active';
    const gold = s.gold;
    damageEnemy(s, g, g.hp + 1);
    expect(s.gold - gold).toBe(Math.round(CONFIG.enemies.grunt.bounty * pack));
  });

  it('bosses are never packed; troops dropped by a packed balloon are', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10 }, 10);
    const car = spawnEnemy(s, 'babycar', 'left', 2, 5);
    expect(car.pack).toBeUndefined();
    expect(car.maxHp).toBe(CONFIG.enemies.babycar.hp * 2);
    const b = spawnEnemy(s, 'balloon', 'left', 1, 4);
    const [n] = dropTroopsAt(s, b, 'neegy', 1, 10, 10);
    expect(n.pack).toBe(4);
    expect(n.maxHp).toBe(CONFIG.enemies.neegy.hp * 4);
  });

  it('packed enemies come proportionally further apart (same strength per second)', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: 127 }, 10);
    triggerWave(s, 0); // no countdown
    const pack = s.wave.pack;
    stepWaveSpawning(s, 0.01); // goes active, first group spawns
    const first = s.enemies.length;
    stepWaveSpawning(s, CONFIG.rules.spawnInterval * pack - 0.05);
    expect(s.enemies.length).toBe(first); // not yet
    stepWaveSpawning(s, 0.1);
    expect(s.enemies.length).toBeGreaterThan(first);
  });

  it('area damage hits a packed enemy several times over (it stands for a crowd); single hits do not', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10 }, 10);
    const packed = spawnEnemy(s, 'tank', 'left', 1, 4);
    const lone = spawnEnemy(s, 'tank', 'left', 1, 1);
    const mult = 4 ** CONFIG.rules.crowdCap.areaExponent;
    expect(areaPack(packed)).toBeCloseTo(mult, 6);
    expect(areaPack(lone)).toBe(1);
    expect(mult).toBeGreaterThan(1);
    expect(mult).toBeLessThan(4); // a real crowd is spread out: a splash never caught all of it
    const hp0 = packed.hp, lone0 = lone.hp;
    lone.x = packed.x + 5; lone.y = packed.y; // apart, so each splash catches one of them
    applySplash(s, packed.x, packed.y, 0.5, 100, true, true);
    applySplash(s, lone.x, lone.y, 0.5, 100, true, true);
    expect(hp0 - packed.hp).toBeCloseTo(100 * mult, 3);
    expect(lone0 - lone.hp).toBe(100);
    // A single-target hit is just its damage.
    const hp1 = packed.hp;
    damageEnemy(s, packed, 100);
    expect(hp1 - packed.hp).toBe(100);
  });

  it("an enemy's level is how many times a basic one's health it has (packed ones included)", () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10 }, 10);
    expect(enemyLevel(spawnEnemy(s, 'grunt', 'left', 1, 1))).toBe(1);
    expect(enemyLevel(spawnEnemy(s, 'grunt', 'left', 1.3, 1))).toBe(1);
    expect(enemyLevel(spawnEnemy(s, 'tank', 'left', 3.09, 1))).toBe(3);
    expect(enemyLevel(spawnEnemy(s, 'grunt', 'left', 15.66, 4.55))).toBe(71);
    const hurt = spawnEnemy(s, 'tank', 'left', 4, 1);
    damageEnemy(s, hurt, 500);
    expect(enemyLevel(hurt)).toBe(4); // damage doesn't change it
  });
});
