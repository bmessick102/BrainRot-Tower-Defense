// Endless play far past where players usually get: waves 100 to 5000 stay finite, capped and playable.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { nextWaveComposition, triggerWave, queuedCount, stepWaveSpawning, waveThemeKey } from '../src/logic/waves.js';
import { ENEMY_KINDS, spawnEnemy, createEnemy, removeDeadEnemies, babyCarBurst, babyCarBurstPack, babyCarBurstSize } from '../src/logic/enemies.js';
import { waveResearchPoints } from '../src/logic/researchPoints.js';
import { spellStats, spellConfig } from '../src/logic/spells.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall } from './helpers.js';

const CAP = CONFIG.rules.crowdCap.maxEnemies;
const notBoss = ENEMY_KINDS.filter((k) => !CONFIG.enemies[k].boss);
const HIGH = [100, 200, 500, 1000, 5000];

function stateAtWave(n, th = 10) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, wavesCleared: n - 1, clock: { phase: 'day', t: 0 } }, th);
  s.capacity = 1e9;
  return s;
}

/** Every number in an object tree (enemies, the wave...) that is NaN or +-Infinity, as "path=value". */
function nonFinite(obj, path = '', out = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return out;
  seen.add(obj);
  for (const [k, v] of Object.entries(obj)) {
    if (k === 'sinceShot' || k === 'sinceWaveCleared') continue; // Infinity on purpose ("never")
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`${path}.${k}=${v}`);
    else if (v && typeof v === 'object' && k !== 'listeners' && k !== 'storage') nonFinite(v, `${path}.${k}`, out, seen);
  }
  return out;
}

describe('very high waves', () => {
  it('each wave plan is finite and capped at the crowd limit (plain and themed waves)', () => {
    for (const base of HIGH) for (const n of [base, base + 1, base + 2]) {
      const s = stateAtWave(n);
      const comp = nextWaveComposition(s);
      for (const k of ENEMY_KINDS) {
        expect(Number.isInteger(comp[k] || 0)).toBe(true);
        expect(comp[k] || 0).toBeGreaterThanOrEqual(0);
      }
      const total = notBoss.reduce((a, k) => a + (comp[k] || 0), 0);
      expect(total).toBeLessThanOrEqual(CAP + ENEMY_KINDS.length);
      expect(Number.isFinite(comp.hpMultiplier) && comp.hpMultiplier > 1).toBe(true);
      expect(Number.isFinite(comp.pack) && comp.pack >= 1).toBe(true);
      if (waveThemeKey(10, n)) expect(comp.special).toBeTruthy();
      triggerWave(s, 0);
      expect(queuedCount(s)).toBe(total + (comp.babycar || 0));
    }
  });

  it('wave 1000 enemies have finite health, damage and pay, well inside safe numbers', () => {
    const s = stateAtWave(1000);
    triggerWave(s, 0);
    for (const k of ENEMY_KINDS) {
      const e = spawnEnemy(s, k, 'left', s.wave.hpMultiplier, s.wave.pack);
      expect(Number.isFinite(e.hp) && e.hp > 0).toBe(true);
      expect(e.maxHp).toBeLessThan(Number.MAX_SAFE_INTEGER / 1e6);
    }
    expect(Number.isFinite(waveResearchPoints(1e6))).toBe(true);
  });

  it('Heat Field and Lightning scale with the wave and stay finite', () => {
    const s = stateAtWave(1000);
    triggerWave(s, 0);
    const heat = spellStats(s, 'heat'), bolt = spellStats(s, 'lightning');
    expect(heat.dps).toBeGreaterThan(spellConfig('heat').dps * 10);
    expect(Number.isFinite(heat.dps) && Number.isFinite(bolt.damage)).toBe(true);
  });

  it("a Da Baby Car's burst is capped too: fewer, tougher troops (the same strength)", () => {
    const car = CONFIG.enemies.babycar;
    expect(babyCarBurstPack(car, 20)).toBe(1); // early waves: unchanged
    const size = babyCarBurstSize(car, 1000);
    expect(size).toBeGreaterThan(car.deathSpawn.maxCount);
    const s = stateAtWave(1000);
    const mix = babyCarBurst(s, car, 1000, { grunt: 5, tank: 1 });
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(car.deathSpawn.maxCount);
    s.wave = { ...s.wave, phase: 'active', number: 1000 };
    const boss = createEnemy(s, 'babycar', 10, 10, 50);
    boss.alive = false;
    s.enemies.push(boss);
    removeDeadEnemies(s);
    expect(s.enemies.length).toBe(car.deathSpawn.maxCount);
    const pack = babyCarBurstPack(car, 1000);
    expect(pack).toBeCloseTo(size / car.deathSpawn.maxCount, 2);
    for (const t of s.enemies) {
      expect(t.pack).toBe(pack);
      expect(t.maxHp).toBe(Math.round(CONFIG.enemies[t.kind].hp * 50 * pack));
    }
  });

  it('a whole village fights wave 1000 for a minute without NaN or runaway counts, and saves stay small', () => {
    const mem = new Map();
    const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    let seed = 3;
    const gs = new GameState({ storage, rng: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; } });
    gs.startNew();
    gs.skipTutorial();
    const th = gs.buildings.find((b) => b.type === 'townHall');
    for (let i = 0; i < 12; i++) { gs.gold = 9e12; if (!gs.upgradeBuilding(th.id).ok) break; }
    gs.wavesCleared = 999;
    gs.researchPoints = 1e6;
    gs.fuelGuide = 99;
    gs.startWave();
    gs.startWaveNow();
    let most = 0;
    for (let i = 0; i < 600 && !gs.gameOver; i++) {
      gs.update(0.1);
      most = Math.max(most, gs.enemies.length);
    }
    expect(most).toBeLessThanOrEqual(CAP + 100);
    expect(nonFinite({ enemies: gs.enemies, wave: gs.wave, buildings: gs.buildings, gold: gs.gold, rp: gs.researchPoints, projectiles: gs.projectiles })).toEqual([]);
    for (const v of mem.values()) expect(v.length).toBeLessThan(50000);
  });

  it('spawning a capped wave never stalls (every queued enemy comes)', () => {
    const s = stateAtWave(500);
    triggerWave(s, 0);
    const queued = queuedCount(s);
    for (let i = 0; i < 1e6 && queuedCount(s) > 0; i++) stepWaveSpawning(s, 0.1);
    expect(queuedCount(s)).toBe(0);
    expect(s.enemies.length).toBe(queued);
  });
});
