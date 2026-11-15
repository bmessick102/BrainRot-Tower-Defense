import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ensureHero, stepHero, heroStats, damageHero, useFeast, checkFeast, heroAfterWave, heroWaveStarted, getAltar } from '../src/logic/hero.js';
import { stepEnemy } from '../src/logic/enemies.js';
import { towerFireInterval } from '../src/logic/abilities.js';
import { limitFor, checkBuy } from '../src/logic/buildings.js';
import { footprintCenter } from '../src/logic/grid.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const HC = CONFIG.altar.hero;
function village(level = 1) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 6);
  const altar = addBuilding(s, 'altar', 10, 10, level);
  const h = ensureHero(s);
  return { s, altar, h, home: footprintCenter(altar) };
}
const wave = (s) => { s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 }; };
const run = (s, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) stepHero(s, dt); };

describe('the Brisket King', () => {
  it('his altar: 1 allowed from Village Hall 4; his level and stats come from it', () => {
    expect([3, 4, 10].map((th) => limitFor('altar', th))).toEqual([0, 1, 1]);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 4), 'altar').ok).toBe(true);
    const { altar, h } = village(3);
    expect(h.hp).toBe(CONFIG.altar.levels[2].heroHp);
    expect(heroStats(altar).damage).toBe(CONFIG.altar.levels[2].heroDamage);
  });

  it('charges ground enemies in his guard range; ignores flyers and enemies outside it', () => {
    const { s, h, home } = village();
    wave(s);
    const e = addEnemy(s, 'grunt', home.x + 3, home.y, { hp: 300, maxHp: 300 });
    run(s, 4);
    expect(e.hp).toBeLessThan(300);
    e.alive = false;
    run(s, 0.2);
    const far = addEnemy(s, 'grunt', home.x + HC.guardRange + 3, home.y);
    const flyer = addEnemy(s, 'bomber', home.x + 1, home.y);
    run(s, 3);
    expect(h.targetId === far.id || h.targetId === flyer.id).toBe(false);
  });

  it('roams his guard area when he has no enemy, pausing now and then, and never stops on a building', () => {
    const { s, h, home, altar } = village();
    const spots = new Set();
    for (let t = 0; t < 40; t += 0.1) {
      stepHero(s, 0.1);
      expect(Math.hypot(h.x - home.x, h.y - home.y)).toBeLessThanOrEqual(HC.guardRange);
      spots.add(`${Math.floor(h.x)},${Math.floor(h.y)}`);
    }
    expect(spots.size).toBeGreaterThan(3); // he moved around
    const inside = (b) => h.x >= b.col && h.x < b.col + b.size && h.y >= b.row && h.y < b.row + b.size;
    expect(s.buildings.some((b) => b !== altar && b.type !== 'wall' && !b.destroyed && inside(b) && h.roamPause > 0)).toBe(false);
  });

  it('walks around buildings and hops over walls on the way to an enemy', () => {
    const { s, h, home } = village();
    wave(s);
    const row = Math.floor(home.y);
    // A building right in his way (east), and a wall line behind it.
    const blocker = addBuilding(s, 'storage', Math.floor(home.x) + 1, row - 1, 1);
    for (let r = row - 3; r <= row + 3; r++) addBuilding(s, 'wall', Math.floor(home.x) + 4, r, 1);
    const e = addEnemy(s, 'tank', home.x + 5.5, home.y, { hp: 1e6, maxHp: 1e6 });
    let jumped = false, insideBlocker = false;
    for (let t = 0; t < 12; t += 0.05) {
      stepHero(s, 0.05);
      if (h.overWall) jumped = true;
      if (h.x >= blocker.col && h.x < blocker.col + 2 && h.y >= blocker.row && h.y < blocker.row + 2) insideBlocker = true;
    }
    expect(insideBlocker).toBe(false);          // went around the storage
    expect(jumped).toBe(true);                  // hopped the wall
    expect(e.hp).toBeLessThan(1e6);             // and got there
  });

  it('ground enemies next to him fight him; knocked out he goes home to sleep', () => {
    const { s, h, home } = village();
    wave(s);
    const g = addEnemy(s, 'tank', home.x + 0.6, home.y, { hp: 1e6, maxHp: 1e6 });
    g.targetId = s.buildings[0].id;
    const hp = h.hp;
    for (let t = 0; t < 2.5; t += 0.05) stepEnemy(s, g, 0.05);
    expect(h.hp).toBeLessThan(hp);
    damageHero(s, 1e9);
    expect(h.status).toBe('asleep');
    expect(h.sleepTotal).toBeCloseTo(HC.maxSleepSeconds, 5);
    expect(h.x).toBeCloseTo(home.x, 5);
    expect(s.events.some((e) => e.name === 'heroKnockedOut')).toBe(true);
  });

  it('after a wave he sleeps off the damage he took, heals while asleep, and wakes up', () => {
    const { s, h, altar } = village();
    const st = heroStats(altar);
    heroAfterWave(s);
    expect(h.status).toBe('ready'); // unhurt: no nap
    h.hp = st.maxHp * 0.5;
    heroAfterWave(s);
    expect(h.status).toBe('asleep');
    expect(h.sleepT).toBeCloseTo(0.5 * HC.maxSleepSeconds, 5);
    expect(altar.heroSleep).toBeCloseTo(h.sleepT, 5);
    run(s, 30);
    expect(h.hp).toBeGreaterThan(st.maxHp * 0.5);
    run(s, 31);
    expect(h.status).toBe('waking');
    expect(h.hp).toBe(st.maxHp);
    run(s, HC.wakeSeconds + 0.1);
    expect(h.status).toBe('ready');
  });

  it('asleep he sleeps through a wave: enemies ignore him and he does not fight', () => {
    const { s, h, home } = village();
    h.hp = 1; heroAfterWave(s);
    wave(s);
    const e = addEnemy(s, 'grunt', home.x + 1, home.y, { hp: 300, maxHp: 300 });
    run(s, 2);
    expect(e.hp).toBe(300);
    expect(h.status).toBe('asleep');
  });

  it('Brisket Feast: during a wave, once per wave; heals, boosts and slams', () => {
    const { s, h, home, altar } = village();
    expect(checkFeast(s).reason).toBe('Only during a wave');
    wave(s);
    heroWaveStarted(s);
    h.hp = 100;
    const e = addEnemy(s, 'tank', home.x + 0.5, home.y, { hp: 1e6, maxHp: 1e6 });
    expect(useFeast(s).ok).toBe(true);
    expect(h.hp).toBeGreaterThan(100);
    expect(h.boostT).toBe(HC.feast.boostSeconds);
    expect(e.hp).toBeLessThan(1e6);
    expect(e.held).toBeGreaterThan(0);
    expect(checkFeast(s).reason).toBe('Used this wave');
    heroWaveStarted(s);
    expect(checkFeast(s).ok).toBe(true);
    altar.picks = ['c', 'c', 'c', 'c', 'c']; // Feast for Days
    useFeast(s);
    expect(checkFeast(s).ok).toBe(true);
  });

  it('perks: Iron Stomach, Second Helping, Royal Decree', () => {
    const { s, h, altar, home } = village(10);
    altar.picks = ['a', 'b', 'a', 'b', 'b']; // Iron Stomach (4) + Second Helping (5)
    const st = heroStats(altar);
    damageHero(s, 100);
    expect(st.maxHp - h.hp).toBeCloseTo(75, 5);
    damageHero(s, 1e9);
    expect(h.status).toBe('ready');
    expect(h.hp).toBeCloseTo(st.maxHp * 0.4, 5);
    altar.picks = ['a', 'a', 'a', 'c'];      // Royal Decree (4)
    const cannon = addBuilding(s, 'cannon', Math.floor(home.x) + 2, Math.floor(home.y), 5);
    const plain = towerFireInterval(cannon);
    stepHero(s, 0.05);
    expect(towerFireInterval(cannon)).toBeCloseTo(plain / 1.15, 6);
  });

  it('his nap is saved on the altar and comes back on load; he leaves with his altar', () => {
    const gs = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    gs.startNew();
    gs.buildings[0].level = 6; gs.tutorialDone = true; gs.tutorialStep = 10;
    gs.buildings.push(addBuilding(makeStateWithTownHall({}, 6), 'altar', 10, 10, 2));
    const h = ensureHero(gs);
    h.hp = 1;
    heroAfterWave(gs);
    const saved = serializeGame(gs);
    const alt = saved.buildings.find((b) => b.type === 'altar');
    expect(alt.heroSleep).toBeGreaterThan(100);
    const back = new GameState({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
    back.loadFromSave(parseSave(JSON.stringify(saved)).data);
    expect(ensureHero(back).status).toBe('asleep');
    back.buildings = back.buildings.filter((b) => b.type !== 'altar');
    expect(ensureHero(back)).toBeNull();
    expect(getAltar(back)).toBeNull();
  });
});
