import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { getCapacity, storageDrainAmount, collectMine, mineStockCap, mineProduction } from '../src/logic/economy.js';
import { gnomeRoster, tripTime } from '../src/logic/villagers.js';
import { stepEconomyPerks } from '../src/logic/econPerks.js';
import { damageBuilding, damageEnemy } from '../src/logic/combat.js';
import { towerDamageMult } from '../src/logic/abilities.js';
import { djStats, dropTheBeat, stepDj, hypeNeeded } from '../src/logic/dj.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { DEFENSE_TYPES, levelStats, maxHp } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const pick = (b, ...paths) => { b.picks = paths; return b; };
function village(vh = 6) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, gold: 0, clock: { phase: 'day', t: 0 } }, vh);
  return s;
}
const wave = (s) => { s.wave = { ...s.wave, phase: 'active', number: 5, queues: {}, paths: [], bountyEarned: 0, startBuildings: 1, lost: 1 }; };

describe('Bitcoin Mine perks', () => {
  it('Overclock: more gold, bigger stock, more at night, more per other mine', () => {
    const s = village();
    const m = addBuilding(s, 'mine', 9, 16, 4);
    const base = levelStats('mine', 4).production;
    expect(mineProduction(s, m)).toBeCloseTo(base, 6);
    pick(m, 'a');                                 // Overclocked Rig +25%
    expect(mineProduction(s, m)).toBeCloseTo(base * 1.25, 6);
    pick(m, 'a', 'a');                            // + Deep Vault
    expect(mineStockCap(m)).toBeCloseTo(levelStats('mine', 4).stockCap * 1.75, 6);
    pick(m, 'b', 'b', 'a');                       // Night Shift only (tier 3)
    expect(mineProduction(s, m)).toBeCloseTo(base, 6);
    s.clock = { phase: 'night', t: 10 };
    expect(mineProduction(s, m)).toBeCloseTo(base * 1.5, 6);
    addBuilding(s, 'mine', 13, 11, 1);
    pick(m, 'b', 'b', 'b', 'a');                  // Mining Pool: +6% per other mine
    s.clock = { phase: 'day', t: 0 };
    expect(mineProduction(s, m)).toBeCloseTo(base * 1.06, 6);
  });

  it('Automation: Auto-Collect sends gold on its own; Tip Jar pays extra; Compound Mining grows', () => {
    const s = village();
    s.gold = 0;
    const m = pick(addBuilding(s, 'mine', 9, 16, 4), 'a', 'b');
    m.stock = 100;
    for (let t = 0; t < 41; t += 1) stepEconomyPerks(s, 1);
    expect(s.gold).toBeGreaterThanOrEqual(100);
    expect(m.stock).toBeLessThan(1);
    pick(m, 'a', 'a', 'b', 'a', 'b');             // Tip Jar (3) + Compound Mining (5)
    m.stock = 100;
    const before = s.gold;
    collectMine(s, m);
    expect(s.gold - before).toBe(115);
    expect(m.compound).toBe(2);
  });

  it('Security: Hidden Stash vs Mr. Least, Panic Room when low, Bounty Vault nearby', () => {
    const s = village();
    const m = pick(addBuilding(s, 'mine', 9, 16, 4), 'c', 'c', 'c', 'c');
    const thief = addEnemy(s, 'thief', 8.5, 16.5);
    const hp = m.hp;
    damageBuilding(s, m, 100, thief);
    expect(hp - m.hp).toBeCloseTo(40, 6);         // -60%
    m.hp = maxHp(m) * 0.2;
    const low = m.hp;
    damageBuilding(s, m, 100, null);
    expect(low - m.hp).toBeCloseTo(50, 6);        // Panic Room: -50%
    pick(m, 'a', 'a', 'a', 'a', 'c');             // Bounty Vault
    m.hp = maxHp(m);
    wave(s);
    s.gold = 0;
    s.capacity = 1e6;
    const g = addEnemy(s, 'grunt', 10, 17, { hp: 1, maxHp: 1 });
    damageEnemy(s, g, 5);
    expect(s.gold).toBe(Math.round(CONFIG.enemies.grunt.bounty * 1.5));
  });
});

describe('Storage perks', () => {
  it('Capacity perks raise the cap; Compound Interest pays when a wave is beaten', () => {
    const s = village();
    const st = addBuilding(s, 'storage', 21, 15, 3);
    const cap0 = getCapacity(s);
    pick(st, 'a');
    expect(getCapacity(s) - cap0).toBeCloseTo(levelStats('storage', 3).capacity * 0.25, 6);
    pick(st, 'a', 'a');                           // + Compound Interest
    s.gold = 1000;
    wave(s);
    checkWaveCleared(s);
    expect(s.gold).toBeGreaterThan(1000);
  });

  it('Vault: Time Lock loses less, Fort Knox loses nothing above half health, Insurance pays back', () => {
    const s = village();
    const st = addBuilding(s, 'storage', 21, 15, 3);
    s.gold = 2000;
    const plain = storageDrainAmount(s, st, 100);
    pick(st, 'b');
    expect(Math.abs(storageDrainAmount(s, st, 100) - plain * 0.7)).toBeLessThanOrEqual(1);
    pick(st, 'a', 'a', 'a', 'a', 'b');            // Fort Knox
    expect(storageDrainAmount(s, st, 100)).toBe(0);
    st.hp = maxHp(st) * 0.4;
    expect(storageDrainAmount(s, st, 100)).toBeGreaterThan(0);
    pick(st, 'a', 'a', 'a', 'b');                 // Insurance
    st.hp = maxHp(st);
    wave(s);
    const g0 = s.gold;
    damageBuilding(s, st, 200, null);
    const lost = g0 - s.gold;
    expect(lost).toBeGreaterThan(0);
    checkWaveCleared(s);
    expect(s.gold).toBeGreaterThanOrEqual(g0 - lost + Math.floor(lost * 0.5) - 1);
  });

  it('Logistics: Express Lane shortens gnome trips; Gold Magnet boosts mines nearby; Central Bank pays more', () => {
    const s = village();
    const st = addBuilding(s, 'storage', 12, 16, 3);
    const m = addBuilding(s, 'mine', 9, 16, 2);
    const t0 = tripTime(m, st);
    pick(st, 'a', 'c');
    expect(tripTime(m, st)).toBeCloseTo(t0 * 0.7, 6);
    const base = mineProduction(s, m);
    pick(st, 'a', 'a', 'c');
    expect(mineProduction(s, m)).toBeCloseTo(base * 1.15, 6);
    pick(st, 'a', 'a', 'a', 'a', 'c');
    wave(s);
    s.capacity = 1e6;
    s.gold = 0;
    const g = addEnemy(s, 'tank', 30, 30, { hp: 1, maxHp: 1 });
    damageEnemy(s, g, 5);
    expect(s.gold).toBe(Math.round(CONFIG.enemies.tank.bounty * 1.1));
  });
});

describe('Villager House perks', () => {
  it('Bunk Beds / Gnome Union add gnomes', () => {
    const s = village();
    const h = addBuilding(s, 'house', 13, 11, 3);
    const n = gnomeRoster(s).length;
    pick(h, 'a', 'a');
    expect(gnomeRoster(s).length).toBe(n + 1);
  });

  it('Village Life: Vegetable Garden makes gold; Gnome Militia pelts enemies nearby in waves', () => {
    const s = village();
    const h = pick(addBuilding(s, 'house', 13, 11, 4), 'a', 'c');
    s.gold = 0;
    for (let i = 0; i < 10; i++) stepEconomyPerks(s, 1);
    expect(s.gold).toBe(10);
    pick(h, 'a', 'a', 'c');                       // Gnome Militia
    wave(s);
    const e = addEnemy(s, 'grunt', 14, 12);
    const hp = e.hp;
    stepEconomyPerks(s, 1);
    expect(hp - e.hp).toBeCloseTo(6, 6);
  });
});

describe('DJ Babyface perks', () => {
  it('Hype: fewer kills needed, Encore, Festival; Main Stage adds damage', () => {
    const s = village();
    const dj = addBuilding(s, 'dj', 10, 10, 1);
    const need = hypeNeeded(dj);
    pick(dj, 'a');
    expect(hypeNeeded(dj)).toBe(Math.round(need * 0.75));
    pick(dj, 'a', 'a', 'a', 'a', 'a');
    expect(djStats(dj).beatPct).toBe(levelStats('dj', 1).beatPct + 50);
    pick(dj, 'b', 'a', 'b', 'b', 'c');            // Encore (2) + Main Stage (5)
    const cannon = addBuilding(s, 'cannon', 12, 10, 5);
    wave(s);
    dj.hype = hypeNeeded(dj);
    dropTheBeat(s, dj, DEFENSE_TYPES);
    expect(dj.hype).toBe(Math.floor(hypeNeeded(dj) * 0.3));
    expect(towerDamageMult(cannon)).toBeCloseTo(1.3, 6);
  });

  it('Bass: the drop stuns and hurts enemies in range; Auto-DJ drops by itself', () => {
    const s = village();
    const dj = pick(addBuilding(s, 'dj', 10, 10, 2), 'b', 'b');
    wave(s);
    const e = addEnemy(s, 'tank', 11, 11);
    dj.hype = hypeNeeded(dj);
    dropTheBeat(s, dj, DEFENSE_TYPES);
    expect(e.stunTimer > 0 || e.stunned > 0 || e.held > 0 || e.stun > 0).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
    pick(dj, 'a', 'a', 'a', 'a');                 // Auto-DJ (with Encore at tier 2)
    dj.hype = hypeNeeded(dj);
    const drops = s.events.filter((x) => x.name === 'beatDropped').length;
    stepDj(s, 0.05, DEFENSE_TYPES);
    expect(s.events.filter((x) => x.name === 'beatDropped').length).toBe(drops + 1);
    expect(dj.hype).toBe(Math.floor(hypeNeeded(dj) * 0.3));
  });
});

describe('every economy perk together', () => {
  it('a full wave runs with each economy building on each path, without errors', async () => {
    const { simulate } = await import('../src/logic/simulate.js');
    const { triggerWave } = await import('../src/logic/waves.js');
    for (const p of ['a', 'b', 'c']) {
      const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, gold: 500, wavesCleared: 7, clock: { phase: 'night', t: 5 } }, 9);
      s.capacity = 1e6;
      s.buildings[0].hp = 1e9;
      const all = [p, p, p, p, p];
      for (const [type, c, r, lvl] of [['mine', 9, 16, 10], ['storage', 21, 15, 9], ['house', 13, 11, 9], ['dj', 6, 20, 5], ['cannon', 12, 20, 9], ['wall', 4, 22, 3]]) {
        const b = addBuilding(s, type, c, r, lvl);
        if (type !== 'cannon' && type !== 'wall') b.picks = all;
      }
      triggerWave(s);
      for (let t = 0; t < 60 && !s.gameOver; t += 1 / 30) { simulate(s, 1 / 30); s.events.length = 0; }
      expect(s.gameOver).toBe(false);
      expect(Number.isFinite(s.gold)).toBe(true);
    }
  }, 30000); // three minutes of simulated waves
});
