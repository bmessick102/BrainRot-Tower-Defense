// The Locklair Mage (v0.12, src/logic/mage.js): the third hero, a building that never moves. Staff zap, Sanctuary Aura,
// Arcane Aegis, naps after raids, knocked out (not rubble) when destroyed, perks, saves.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { limitFor, checkBuy, checkUpgrade, levelStats, maxLevel, maxHp, HERO_TYPES, createBuilding } from '../src/logic/buildings.js';
import { ensureMage, stepMage, mageStats, checkAegis, useAegis, mageAfterWave, mageWaveStarted } from '../src/logic/mage.js';
import { stepHeroes, heroOfAltar, heroStatsFor } from '../src/logic/heroes.js';
import { damageBuilding } from '../src/logic/combat.js';
import { ensureHero } from '../src/logic/hero.js';
import { rpCap } from '../src/logic/researchPoints.js';
import { hotbarSlots } from '../src/logic/hotbar.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { footprintCenter } from '../src/logic/grid.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const M = CONFIG.mageAltar.hero;
function village(level = 10, research = {}) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 }, research }, 10);
  const altar = addBuilding(s, 'mageAltar', 10, 10, level);
  const h = ensureMage(s);
  return { s, altar, h, home: footprintCenter(altar) };
}
const wave = (s) => { s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 }; };
const run = (s, seconds, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepMage(s, dt); };
const tough = { hp: 1e7, maxHp: 1e7, speed: 0 };

describe('the Locklair Mage: his building', () => {
  it('1 allowed from Village Hall 10, a hero type; 20 levels, Level N needs Village Hall N (1-10 at Hall 10)', () => {
    expect(HERO_TYPES).toContain('mageAltar');
    expect([9, 10, 20].map((th) => limitFor('mageAltar', th))).toEqual([0, 1, 1]);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 9), 'mageAltar').ok).toBe(false);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 10), 'mageAltar').ok).toBe(true);
    expect(maxLevel('mageAltar')).toBe(20);
    expect(CONFIG.mageAltar.levels.map((l) => l.townHall)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const { s, altar } = village(9);
    s.researchPoints = 1e4;
    expect(checkUpgrade(s, altar)).toMatchObject({ ok: true, currency: 'rp' });
    altar.level = 10;
    expect(checkUpgrade(s, altar)).toMatchObject({ ok: false, reason: 'Requires VH11' });
  });

  it('every Burger price fits the Burger cap of the best RV Lab at the hall it needs; Level 1 fits the hall\'s gold', () => {
    for (let l = 2; l <= 20; l++) {
      const vh = levelStats('mageAltar', l).townHall;
      const s = makeStateWithTownHall({}, vh);
      addBuilding(s, 'rvlab', 20, 20, Math.min(5, vh - 3));
      expect(levelStats('mageAltar', l).cost).toBeLessThanOrEqual(rpCap(s));
    }
    expect(levelStats('mageAltar', 1).costCurrency).toBeUndefined();
  });

  it('his health is his building\'s; his stats grow every level', () => {
    const { altar } = village(10);
    expect(mageStats(altar).maxHp).toBe(maxHp(altar));
    for (let l = 2; l <= 20; l++) {
      const a = mageStats({ type: 'mageAltar', level: l - 1 }), b = mageStats({ type: 'mageAltar', level: l });
      expect(b.damage).toBeGreaterThan(a.damage);
      expect(b.heal).toBeGreaterThan(a.heal);
      expect(b.maxHp).toBeGreaterThan(a.maxHp);
    }
    // One range for zap, aura and Aegis (v0.12.2); both range perks grow it.
    expect(heroStatsFor(altar).auraRadius).toBe(M.attackRange);
    expect(heroStatsFor(altar).attackRange).toBe(M.attackRange);
    for (const [path, add] of [[['a', 'a'], 1.5], [['b', 'b'], 1]]) {
      const st = mageStats({ type: 'mageAltar', level: 10, picks: path });
      expect(st.attackRange).toBe(M.attackRange + add);
      expect(st.auraRadius).toBe(st.attackRange);
    }
  });
});

describe('the Locklair Mage in a raid', () => {
  it('zaps the nearest enemy in range (ground or air), one target, for his damage, every attackInterval s', () => {
    const { s, altar, h, home } = village();
    wave(s);
    const far = addEnemy(s, 'grunt', home.x + M.attackRange + 1, home.y, { ...tough });
    const flyer = addEnemy(s, 'bomber', home.x + 3, home.y, { ...tough });
    const ground = addEnemy(s, 'grunt', home.x, home.y + 4, { ...tough });
    stepMage(s, 0.01);
    expect(1e7 - flyer.hp).toBeCloseTo(mageStats(altar).damage);
    expect(ground.hp).toBe(1e7); // one target at a time
    expect(far.hp).toBe(1e7);    // out of range
    expect(s.events.filter((e) => e.name === 'mageZap')).toHaveLength(1);
    run(s, M.attackInterval * 2 + 0.05);
    expect(s.events.filter((e) => e.name === 'mageZap')).toHaveLength(3);
    expect(h.attacking).toBe(true);
  });

  it('Sanctuary Aura heals buildings and heroes inside it (not his own building, not outside it)', () => {
    const { s, altar, home } = village();
    wave(s);
    const near = addBuilding(s, 'cannon', 13, 10, 5), far = addBuilding(s, 'cannon', 30, 30, 5);
    const king = addBuilding(s, 'altar', 7, 10, 5);
    const hero = ensureHero(s);
    hero.x = home.x - 2; hero.y = home.y;
    near.hp = 100; far.hp = 100; altar.hp = 100; hero.hp = 100;
    run(s, 2.02); // (4 heal ticks of healTick 0.5 s)
    const heal = mageStats(altar).heal;
    expect(near.hp).toBeCloseTo(100 + heal * 2);
    expect(hero.hp).toBeCloseTo(100 + heal * 2);
    expect(far.hp).toBe(100);
    expect(altar.hp).toBe(100);
    expect(king.hp).toBe(maxHp(king)); // (a building already at full health stays there)
  });

  it('Arcane Aegis: during a raid, once per wave; buildings in his aura (his own too) take no damage while it lasts', () => {
    const { s, altar, h } = village();
    expect(checkAegis(s)).toMatchObject({ ok: false, reason: 'Only during a wave' });
    wave(s);
    const near = addBuilding(s, 'cannon', 13, 10, 5), far = addBuilding(s, 'cannon', 30, 30, 5);
    expect(useAegis(s).ok).toBe(true);
    expect(checkAegis(s)).toMatchObject({ ok: false, reason: 'Active now' });
    const before = [near.hp, far.hp, altar.hp];
    damageBuilding(s, near, 200); damageBuilding(s, far, 200); damageBuilding(s, altar, 200);
    expect([near.hp, far.hp, altar.hp]).toEqual([before[0], before[1] - 200, before[2]]);
    run(s, M.aegis.seconds + 0.1);
    damageBuilding(s, near, 200);
    expect(near.hp).toBe(before[0] - 200);       // over
    expect(checkAegis(s)).toMatchObject({ ok: false, reason: 'Used this wave' });
    mageWaveStarted(s);
    expect(checkAegis(s).ok).toBe(true);           // back next wave
    expect(h.aegisUsed).toBe(0);
    expect(hotbarSlots(s).find((x) => x.type === 'aegis')).toMatchObject({ name: 'Arcane Aegis', ready: true });
  });

  it('destroyed in a raid he\'s knocked out (no zaps, no aura); after it he\'s rebuilt and takes the full nap', () => {
    const { s, altar, h, home } = village();
    wave(s);
    const e = addEnemy(s, 'grunt', home.x + 2, home.y, { ...tough });
    damageBuilding(s, altar, 1e9);
    expect(altar.destroyed).toBe(true);
    stepMage(s, 0.05);
    expect(h.status).toBe('down');
    run(s, 3);
    expect(e.hp).toBe(1e7);
    expect(checkAegis(s)).toMatchObject({ ok: false, reason: "He's knocked out" });
    // The raid ends: everything is rebuilt free (waves.js), then he naps the full nap.
    altar.destroyed = false; altar.hp = maxHp(altar);
    mageAfterWave(s);
    expect(h.status).toBe('asleep');
    expect(h.sleepT).toBeCloseTo(mageStats(altar).maxSleep);
    expect(altar.heroSleep).toBeCloseTo(h.sleepT);
  });

  it('naps after every raid (at least minSleep, longer the lower his health got); asleep he doesn\'t zap; then wakes', () => {
    const { s, altar, h, home } = village();
    wave(s);
    altar.hp = maxHp(altar) * 0.25;
    stepMage(s, 0.05);
    altar.hp = maxHp(altar);
    mageAfterWave(s);
    expect(h.sleepT).toBeCloseTo(0.75 * M.maxSleepSeconds);
    // An unhurt raid: the short nap.
    const v = village();
    wave(v.s);
    stepMage(v.s, 0.05);
    mageAfterWave(v.s);
    expect(v.h.sleepT).toBeCloseTo(M.minSleepSeconds);
    // Asleep in a raid: no zaps.
    const e = addEnemy(v.s, 'grunt', v.home.x + 2, v.home.y, { ...tough });
    run(v.s, 2);
    expect(e.hp).toBe(1e7);
    run(v.s, M.minSleepSeconds + M.wakeSeconds + 0.2);
    expect(v.h.status).toBe('ready');
    stepMage(v.s, 0.05);
    expect(e.hp).toBeLessThan(1e7);
  });

  it('his nap is saved on his building and comes back on load; the heroes step him', () => {
    const gs = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    gs.startNew();
    gs.buildings[0].level = 10; gs.tutorialDone = true; gs.tutorialStep = 10;
    const altar = createBuilding(gs, 'mageAltar', 10, 10, 10);
    gs.buildings.push(altar);
    ensureMage(gs);
    altar.heroSleep = 33;
    const p = parseSave(JSON.stringify(serializeGame(gs)));
    expect(p.status).toBe('ok');
    const back = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    back.loadFromSave(p.data);
    const b2 = back.buildings.find((b) => b.type === 'mageAltar');
    expect(b2.heroSleep).toBe(33);
    stepHeroes(back, 0.5);
    expect(back.mage).toMatchObject({ status: 'asleep' });
    expect(heroOfAltar(back, b2)).toBe(back.mage);
  });
});

describe('the Locklair Mage\'s perks', () => {
  it('Archmage: Chain Spark jumps to 1 more enemy for 50%', () => {
    const { s, altar, home } = village(10, { mageAltar: ['a', 'a', 'a'] });
    wave(s);
    const a = addEnemy(s, 'grunt', home.x + 2, home.y, { ...tough }), b = addEnemy(s, 'grunt', home.x + 3.5, home.y, { ...tough });
    stepMage(s, 0.01);
    const st = mageStats(altar);
    expect(1e7 - a.hp).toBeCloseTo(st.damage);
    expect(1e7 - b.hp).toBeCloseTo(st.damage * 0.5);
    expect(st.damage).toBeCloseTo(levelStats('mageAltar', 10).heroDamage * 1.25); // (+ Arcane Focus)
  });

  it('Sanctuary: Warding Light (15% less damage in his aura while awake) and Twin Aegis (twice per wave)', () => {
    const { s } = village(10, { mageAltar: ['b', 'b', 'b', 'b', 'b'] });
    wave(s);
    const near = addBuilding(s, 'cannon', 13, 10, 5);
    stepMage(s, 0.01);
    const hp = near.hp;
    damageBuilding(s, near, 100);
    expect(hp - near.hp).toBeCloseTo(85);
    expect(useAegis(s).ok).toBe(true);
    run(s, M.aegis.seconds + 0.1);
    expect(useAegis(s).ok).toBe(true);
    run(s, M.aegis.seconds + 0.1);
    expect(checkAegis(s).reason).toBe('Used this wave');
  });

  it('Eternity: more health, a longer Aegis, shorter naps, Aegis Surge heals, Undying brings him back once', () => {
    const { s, altar, h } = village(10, { mageAltar: ['c', 'c', 'c', 'c', 'c'] });
    const st = mageStats(altar);
    expect(st.maxHp).toBe(Math.round(levelStats('mageAltar', 10).hp * 1.3));
    expect(st.aegisSeconds).toBe(M.aegis.seconds + 2);
    expect(st.minSleep).toBeCloseTo(M.minSleepSeconds * 0.6);
    wave(s);
    const near = addBuilding(s, 'cannon', 13, 10, 5);
    near.hp = 10;
    useAegis(s);
    expect(near.hp).toBeCloseTo(10 + maxHp(near) * 0.25);
    run(s, st.aegisSeconds + 0.1);
    damageBuilding(s, altar, 1e9);
    run(s, 19);
    expect(h.status).toBe('down');
    run(s, 1.2);
    expect(h.status).toBe('ready');
    expect(altar.destroyed).toBe(false);
    expect(altar.hp).toBeCloseTo(st.maxHp * 0.4, 0);
  });
});
