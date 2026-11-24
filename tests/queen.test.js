import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  ensureQueen, stepQueen, queenStats, damageQueen, useEncore, checkEncore, queenAfterWave, queenWaveStarted, getQueenAltar
} from '../src/logic/queen.js';
import { ensureHero, heroStats, getAltar, bedtime } from '../src/logic/hero.js';
import { fightableHeroes, stepHeroes, heroesAfterWave, heroStatsFor, heroOfAltar } from '../src/logic/heroes.js';
import { stepEnemy } from '../src/logic/enemies.js';
import { towerFireInterval, towerDamageMult } from '../src/logic/abilities.js';
import { limitFor, checkBuy, checkUpgrade, levelStats, buildCost, HERO_TYPES, maxLevel } from '../src/logic/buildings.js';
import { rpCap } from '../src/logic/researchPoints.js';
import { hotbarSlots } from '../src/logic/hotbar.js';
import { footprintCenter } from '../src/logic/grid.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { ABILITIES } from '../src/abilityConfig.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const Q = CONFIG.queenAltar.hero;
function village(level = 1, picks = null) {
  const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 8);
  const altar = addBuilding(s, 'queenAltar', 10, 10, level);
  if (picks) altar.picks = picks;
  const h = ensureQueen(s);
  return { s, altar, h, home: footprintCenter(altar) };
}
const wave = (s) => { s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 }; };
const run = (s, seconds, dt = 0.05) => { for (let t = 0; t < seconds; t += dt) stepQueen(s, dt); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tough = { hp: 1e7, maxHp: 1e7 };
/** Fire exactly one bolt at whatever she targets, and let it land. Returns the bolt. */
function oneShot(s, h) {
  h.cooldown = 0;
  const before = (s.queenBolts || []).length;
  stepQueen(s, 0.001);
  const bolt = s.queenBolts[before];
  h.cooldown = 99; // no second bolt
  for (let t = 0; t < 2 && s.queenBolts.includes(bolt); t += 0.02) stepQueen(s, 0.02);
  return bolt;
}

describe('the Hatsune Queen: her altar', () => {
  it('1 allowed from Village Hall 8 (20 caps), a hero altar in the Defenses tab', () => {
    expect(CONFIG.limits.queenAltar).toHaveLength(20);
    expect([1, 7, 8, 15, 20].map((th) => limitFor('queenAltar', th))).toEqual([0, 0, 1, 1, 1]);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 7), 'queenAltar').ok).toBe(false);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 8), 'queenAltar').ok).toBe(true);
    expect(HERO_TYPES).toContain('queenAltar');
  });

  it('Level 1 costs gold; Levels 2-20 cost Burgers; like the Brisket King, Level N needs Village Hall N (Levels 1-8 at Hall 8)', () => {
    expect(buildCost('queenAltar')).toBe(25000);
    expect(levelStats('queenAltar', 1).costCurrency).toBeUndefined();
    expect(maxLevel('queenAltar')).toBe(20);
    for (let l = 2; l <= 20; l++) expect(levelStats('queenAltar', l).costCurrency).toBe('rp');
    expect(CONFIG.queenAltar.levels.map((l) => l.townHall)).toEqual([8, 8, 8, 8, 8, 8, 8, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 1e4, tutorialDone: true }, 8);
    const altar = addBuilding(s, 'queenAltar', 10, 10, 1);
    expect(checkUpgrade(s, altar)).toMatchObject({ ok: true, currency: 'rp', cost: 1500 });
    altar.level = 8;
    expect(checkUpgrade(s, altar)).toMatchObject({ ok: false, currency: 'rp', reason: 'Requires VH9' });
    // The same top level as the Brisket King at every hall from 8 (his Level N needs Hall N too).
    for (let th = 8; th <= CONFIG.rules.maxTownHallLevel; th++) {
      const top = (type) => CONFIG[type].levels.filter((l, i) => (l.townHall || i + 1) <= th).length;
      expect(top('queenAltar'), `VH${th}`).toBe(Math.min(th, top('altar')));
    }
  });

  it('every Burger price fits the Burger cap of the best RV Lab at the hall it needs', () => {
    for (let l = 2; l <= 20; l++) {
      const vh = levelStats('queenAltar', l).townHall;
      const s = makeStateWithTownHall({}, vh);
      addBuilding(s, 'rvlab', 20, 20, Math.min(5, vh - 3));
      expect(levelStats('queenAltar', l).cost).toBeLessThanOrEqual(rpCap(s));
    }
  });

  it('her level and stats come from the altar: ranged, less health than the Brisket King, comparable damage per second', () => {
    const { altar, h } = village(3);
    expect(h.hp).toBe(CONFIG.queenAltar.levels[2].heroHp);
    const st = queenStats(altar);
    expect(st.damage).toBe(CONFIG.queenAltar.levels[2].heroDamage);
    expect(st.attackRange).toBe(5);
    expect(st.guardRange).toBe(8);
    // Against the Brisket King at each Village Hall from 8, both at the top level that hall allows (the same level since
    // v0.11): her health about his or less (a little more only at Hall 8), damage per second within 0.7-1.3x of his.
    for (let th = 8; th <= CONFIG.rules.maxTownHallLevel; th++) {
      const q = queenStats({ type: 'queenAltar', level: th });
      const b = heroStats({ type: 'altar', level: th });
      expect(q.maxHp, `VH${th}`).toBeLessThan(b.maxHp * 1.05);
      const ratio = (q.damage / q.attackInterval) / (b.damage / b.attackInterval);
      expect(ratio, `VH${th}`).toBeGreaterThan(0.7);
      expect(ratio, `VH${th}`).toBeLessThan(1.3);
    }
  });
});

describe('the Hatsune Queen in a fight', () => {
  it('shoots ground enemies from range with flying bolts', () => {
    const { s, h, home } = village();
    wave(s);
    const e = addEnemy(s, 'grunt', home.x + 4, home.y, { hp: 5000, maxHp: 5000 });
    stepQueen(s, 0.05);
    expect(s.queenBolts.length).toBe(1);            // a bolt is in the air...
    expect(e.hp).toBe(5000);                        // ...not landed yet
    run(s, 3);
    expect(e.hp).toBeLessThan(5000);
    expect(dist(h, home)).toBeLessThan(0.5);        // in range from home: she didn't walk up to it
    expect(s.events.some((ev) => ev.name === 'queenShot')).toBe(true);
  });

  it('shoots flyers too (unlike the Brisket King)', () => {
    const { s, home } = village();
    wave(s);
    const f = addEnemy(s, 'bomber', home.x, home.y + 4, { hp: 5000, maxHp: 5000 });
    run(s, 3);
    expect(f.hp).toBeLessThan(5000);
  });

  it('walks only close enough to have an enemy in range, and ignores enemies outside her guard range', () => {
    const { s, h, home } = village();
    wave(s);
    const far = addEnemy(s, 'grunt', home.x + Q.guardRange + 2, home.y);
    run(s, 2);
    expect(h.targetId).not.toBe(far.id);
    far.alive = false;
    const e = addEnemy(s, 'tank', home.x + 7.5, home.y, { ...tough });
    run(s, 6);
    expect(e.hp).toBeLessThan(tough.hp);
    expect(dist(h, e)).toBeLessThanOrEqual(5.01);
    expect(dist(h, e)).toBeGreaterThan(3.5);        // she stays back
    expect(dist(h, home)).toBeLessThanOrEqual(Q.guardRange);
  });

  it('steps back from a ground enemy that gets close, shooting as she goes, inside her guard area', () => {
    const { s, h, home } = village();
    wave(s);
    const e = addEnemy(s, 'tank', home.x + 1.2, home.y, { ...tough });
    run(s, 3);
    expect(dist(h, e)).toBeGreaterThan(Q.keepAway);
    expect(dist(h, home)).toBeLessThanOrEqual(Q.guardRange);
    expect(e.hp).toBeLessThan(tough.hp);
  });

  it('ground enemies in reach fight her; flyers never stop for her; knocked out she lies there until the raid ends', () => {
    const { s, h, home } = village();
    wave(s);
    h.cooldown = 99;
    const g = addEnemy(s, 'tank', home.x + 0.6, home.y, { ...tough });
    g.targetId = s.buildings[0].id;
    const hp = h.hp;
    for (let t = 0; t < 2.5; t += 0.05) stepEnemy(s, g, 0.05);
    expect(h.hp).toBeLessThan(hp);
    expect(s.events.some((ev) => ev.name === 'enemyAttack' && ev.data.targetId === 'queen')).toBe(true);
    damageQueen(s, 1e9);
    expect(h.status).toBe('down');
    expect(h.knockedOut).toBe(true);
    expect(checkEncore(s).reason).toBe("She's knocked out");
    run(s, 60);
    expect(h.status).toBe('down');
    s.wave.phase = 'idle'; s.enemies.length = 0;
    queenAfterWave(s);
    expect(h.status).toBe('waking');
    run(s, Q.wakeSeconds + 0.1);
    expect(h.status).toBe('ready');
    expect(h.hp).toBe(queenStats(getQueenAltar(s)).maxHp);
  });

  it('after a wave she naps off the damage, heals while asleep, sleeps through a wave, and wakes', () => {
    const { s, h, altar, home } = village();
    const st = queenStats(altar);
    queenAfterWave(s);
    expect(h.status).toBe('ready'); // unhurt: no nap
    h.hp = st.maxHp * 0.5;
    queenAfterWave(s);
    expect(h.status).toBe('asleep');
    expect(h.sleepT).toBeCloseTo(0.5 * Q.maxSleepSeconds, 5);
    expect(altar.heroSleep).toBeCloseTo(h.sleepT, 5);
    wave(s);
    const e = addEnemy(s, 'grunt', home.x + 2, home.y, { hp: 300, maxHp: 300 });
    run(s, 30);
    expect(e.hp).toBe(300);              // asleep: no shooting
    expect(fightableHeroes(s)).not.toContain(h);
    expect(h.hp).toBeGreaterThan(st.maxHp * 0.5);
    s.wave.phase = 'idle';
    run(s, 31);
    expect(h.status).toBe('waking');
    expect(h.hp).toBe(st.maxHp);
    run(s, Q.wakeSeconds + 0.1);
    expect(h.status).toBe('ready');
  });
});

describe('Encore Cloak', () => {
  it('during a wave only, once per wave; she heals 30% and enemies lose track of her', () => {
    const { s, h, altar, home } = village();
    expect(checkEncore(s).reason).toBe('Only during a wave');
    wave(s);
    queenWaveStarted(s);
    const st = queenStats(altar);
    h.hp = 100;
    expect(useEncore(s).ok).toBe(true);
    expect(h.hp).toBeCloseTo(100 + st.maxHp * 0.3, 5);
    expect(h.cloakT).toBe(4);
    expect(checkEncore(s).ok).toBe(false);
    // Untargetable: not fightable, an enemy next to her doesn't hurt her, and direct hits miss.
    expect(fightableHeroes(s)).not.toContain(h);
    const g = addEnemy(s, 'tank', home.x + 0.5, home.y, { ...tough });
    g.targetId = s.buildings[0].id;
    const hp = h.hp;
    for (let t = 0; t < 2; t += 0.05) stepEnemy(s, g, 0.05);
    damageQueen(s, 500);
    expect(h.hp).toBe(hp);
    g.alive = false;
    run(s, 4.1);
    expect(h.cloakT).toBe(0);
    expect(fightableHeroes(s)).toContain(h);
    expect(checkEncore(s).reason).toBe('Used this wave');
    queenWaveStarted(s);
    expect(checkEncore(s).ok).toBe(true);
  });

  it('her bolts deal +150% and pierce through 2 enemies while it lasts', () => {
    const { s, h, altar, home } = village();
    wave(s);
    queenWaveStarted(s);
    const st = queenStats(altar);
    const line = [3, 3.6, 4.2, 4.8].map((dx) => addEnemy(s, 'tank', home.x + dx, home.y, { ...tough }));
    const plain = oneShot(s, h);
    expect(plain.damage).toBeCloseTo(st.damage, 5);
    expect(line.filter((e) => e.hp < tough.hp)).toHaveLength(1);
    for (const e of line) e.hp = tough.hp;
    useEncore(s);
    const bolt = oneShot(s, h);
    expect(bolt.damage).toBeCloseTo(st.damage * 2.5, 5);
    expect(line.filter((e) => e.hp < tough.hp)).toHaveLength(3); // the target + 2 pierced
    expect(line[3].hp).toBe(tough.hp);
  });
});

describe('her RV Lab tree (3 paths x 5 tiers), every tier', () => {
  it('has the agreed names', () => {
    const t = ABILITIES.queenAltar;
    expect([t.a.name, t.b.name, t.c.name]).toEqual(['Sharpshooter', 'Idol', 'Stagecraft']);
    expect(t.a.tiers.map((x) => x.name)).toEqual(['Sharp Tips', 'Long Draw', 'Critical Note', 'Piercing Bolt', 'Headliner']);
    expect(t.b.tiers.map((x) => x.name)).toEqual(['Warm-Up', 'Backup Chorus', 'Encore+', 'Fan Favorite', 'Sold Out Show']);
    expect(t.c.tiers.map((x) => x.name)).toEqual(['Stage Armor', 'Quick Step', 'Dodge Roll', 'Understudy', 'Curtain Call']);
  });

  it('Sharp Tips +25% damage; Long Draw +1.5 range', () => {
    const base = queenStats({ type: 'queenAltar', level: 5 });
    expect(queenStats({ type: 'queenAltar', level: 5, picks: ['a'] }).damage).toBeCloseTo(base.damage * 1.25, 5);
    expect(queenStats({ type: 'queenAltar', level: 5, picks: ['b', 'a'] }).attackRange).toBe(6.5);
  });

  it('Critical Note: about 20% of bolts deal double', () => {
    const { s, h, altar, home } = village(5, ['b', 'b', 'a']);
    wave(s);
    const st = queenStats(altar);
    addEnemy(s, 'tank', home.x + 3, home.y, { ...tough });
    let crits = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const b = oneShot(s, h);
      if (b.crit) { crits++; expect(b.damage).toBeCloseTo(st.damage * 2, 5); } else expect(b.damage).toBeCloseTo(st.damage, 5);
    }
    expect(crits / n).toBeGreaterThan(0.12);
    expect(crits / n).toBeLessThan(0.28);
  });

  it('Piercing Bolt: bolts go through 1 more enemy', () => {
    const { s, h, home } = village(5, ['b', 'b', 'b', 'a']);
    wave(s);
    const line = [3, 3.6, 4.2].map((dx) => addEnemy(s, 'tank', home.x + dx, home.y, { ...tough }));
    oneShot(s, h);
    expect(line.filter((e) => e.hp < tough.hp)).toHaveLength(2);
  });

  it('Headliner: every 4th bolt deals triple and marks its target (+20% damage taken for 3 s)', () => {
    const { s, h, altar, home } = village(5, ['b', 'b', 'b', 'b', 'a']);
    wave(s);
    const st = queenStats(altar);
    const e = addEnemy(s, 'tank', home.x + 3, home.y, { ...tough });
    const bolts = [1, 2, 3, 4].map(() => oneShot(s, h));
    expect(bolts.map((b) => b.head)).toEqual([false, false, false, true]);
    expect(bolts[3].damage).toBeCloseTo(st.damage * 3, 5);
    expect(e.vuln).toBeCloseTo(0.2, 5);
    expect(e.vulnTimer).toBeCloseTo(3, 1);
  });

  it('Warm-Up: defenses in her guard range fire 10% faster while she is awake', () => {
    const { s, h, home } = village(5, ['b']);
    const cannon = addBuilding(s, 'cannon', Math.floor(home.x) + 3, Math.floor(home.y), 5);
    const plain = towerFireInterval(cannon);
    stepQueen(s, 0.05);
    expect(towerFireInterval(cannon)).toBeCloseTo(plain / 1.1, 6);
    h.hp = 1; queenAfterWave(s); // asleep
    stepQueen(s, 0.05);
    expect(towerFireInterval(cannon)).toBeCloseTo(plain, 6);
  });

  it('Backup Chorus: Encore Cloak lasts 6 s', () => {
    const { s, h } = village(5, ['a', 'b']);
    wave(s); queenWaveStarted(s);
    useEncore(s);
    expect(h.cloakT).toBe(6);
  });

  it('Encore+: while Encore Cloak lasts, defenses in her guard range deal 25% more', () => {
    const { s, home } = village(5, ['a', 'a', 'b']);
    wave(s); queenWaveStarted(s);
    const cannon = addBuilding(s, 'cannon', Math.floor(home.x) + 3, Math.floor(home.y), 5);
    const plain = towerDamageMult(cannon);
    useEncore(s);
    expect(towerDamageMult(cannon)).toBeCloseTo(plain * 1.25, 6);
    run(s, 4.1);
    expect(towerDamageMult(cannon)).toBeCloseTo(plain, 6);
  });

  it('Fan Favorite: every enemy she defeats heals her 5%', () => {
    const { s, h, altar, home } = village(5, ['a', 'a', 'a', 'b']);
    wave(s);
    const st = queenStats(altar);
    h.hp = 100;
    addEnemy(s, 'grunt', home.x + 3, home.y, { hp: 1, maxHp: 1 });
    oneShot(s, h);
    expect(h.hp).toBeCloseTo(100 + st.maxHp * 0.05, 5);
  });

  it('Sold Out Show: two Encore Cloaks per wave', () => {
    const { s, h } = village(5, ['a', 'a', 'a', 'a', 'b']);
    wave(s); queenWaveStarted(s);
    expect(useEncore(s).ok).toBe(true);
    run(s, 4.1);
    expect(useEncore(s).ok).toBe(true);
    run(s, 4.1);
    expect(checkEncore(s).reason).toBe('Used this wave');
    expect(h.encoresUsed).toBe(2);
  });

  it('Stage Armor +30% health; Quick Step +30% speed; Understudy -40% sleep', () => {
    const base = queenStats({ type: 'queenAltar', level: 5 });
    expect(queenStats({ type: 'queenAltar', level: 5, picks: ['c'] }).maxHp).toBe(Math.round(base.maxHp * 1.3));
    expect(queenStats({ type: 'queenAltar', level: 5, picks: ['a', 'c'] }).speed).toBeCloseTo(base.speed * 1.3, 6);
    expect(queenStats({ type: 'queenAltar', level: 5, picks: ['a', 'a', 'a', 'c'] }).maxSleep).toBeCloseTo(base.maxSleep * 0.6, 6);
  });

  it('Dodge Roll: dodges about 25% of melee hits, never ranged ones', () => {
    const { s, h, altar } = village(10, ['a', 'a', 'c']);
    wave(s);
    const st = queenStats(altar);
    let dodged = 0;
    for (let i = 0; i < 400; i++) { h.hp = st.maxHp; damageQueen(s, 10, { melee: true }); if (h.hp === st.maxHp) dodged++; }
    expect(dodged / 400).toBeGreaterThan(0.17);
    expect(dodged / 400).toBeLessThan(0.33);
    for (let i = 0; i < 50; i++) { h.hp = st.maxHp; damageQueen(s, 10); expect(h.hp).toBe(st.maxHp - 10); }
  });

  it('Curtain Call: knocked out, she is back up after 20 s at 40% health, once per wave', () => {
    const { s, h, altar } = village(10, ['a', 'a', 'a', 'a', 'c']);
    wave(s); queenWaveStarted(s);
    damageQueen(s, 1e9);
    run(s, 19);
    expect(h.status).toBe('down');
    run(s, 1.2);
    expect(h.status).toBe('ready');
    expect(h.hp).toBeCloseTo(queenStats(altar).maxHp * 0.4, 5);
    damageQueen(s, 1e9);
    run(s, 25);
    expect(h.status).toBe('down'); // only once per wave
  });
});

describe('both heroes at once', () => {
  function both() {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 8);
    const altar = addBuilding(s, 'altar', 6, 14, 5);
    const qAltar = addBuilding(s, 'queenAltar', 10, 10, 3);
    stepHeroes(s, 0.05);
    return { s, altar, qAltar };
  }

  it('each hero lives on its own (state.hero and state.queen) and both fight', () => {
    const { s, altar, qAltar } = both();
    expect(s.hero.altarId).toBe(altar.id);
    expect(s.queen.altarId).toBe(qAltar.id);
    expect(heroOfAltar(s, altar)).toBe(s.hero);
    expect(heroOfAltar(s, qAltar)).toBe(s.queen);
    expect(heroStatsFor(qAltar).attackRange).toBe(5);
    expect(heroStatsFor(altar).guardRange).toBe(heroStats(altar).guardRange);
    expect(fightableHeroes(s)).toEqual([s.hero, s.queen]);
    wave(s);
    const q = footprintCenter(qAltar);
    const e = addEnemy(s, 'tank', q.x + 0.5, q.y, { ...tough });
    e.targetId = s.buildings[0].id;
    s.queen.cooldown = 99;
    const qhp = s.queen.hp, bhp = s.hero.hp;
    for (let t = 0; t < 2; t += 0.05) stepEnemy(s, e, 0.05);
    expect(s.queen.hp).toBeLessThan(qhp); // it fights the nearer hero
    expect(s.hero.hp).toBe(bhp);
  });

  it('the hotbar has Brisket Feast and Encore Cloak, side by side', () => {
    const { s } = both();
    wave(s);
    const slots = hotbarSlots(s);
    expect(slots.slice(0, 2).map((x) => x.id)).toEqual(['feast', 'encore']);
    expect(slots[1].ready).toBe(true);
  });

  it('after a wave each naps on its own altar', () => {
    const { s, altar, qAltar } = both();
    s.hero.hp = 1; s.queen.hp = 1;
    heroesAfterWave(s);
    expect(s.hero.status).toBe('asleep');
    expect(s.queen.status).toBe('asleep');
    expect(altar.heroSleep).toBeGreaterThan(0);
    expect(qAltar.heroSleep).toBeGreaterThan(0);
  });
});

describe('saves', () => {
  const store = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  function gameAt(hall) {
    const gs = new GameState({ storage: store() });
    gs.startNew();
    gs.buildings[0].level = hall; gs.tutorialDone = true; gs.tutorialStep = 10;
    return gs;
  }

  it('an old save with only the Brisket King loads unchanged (no Queen, his nap kept)', () => {
    const gs = gameAt(6);
    gs.buildings.push(addBuilding(makeStateWithTownHall({}, 6), 'altar', 10, 10, 4));
    const saved = serializeGame(gs);
    const alt = saved.buildings.find((b) => b.type === 'altar');
    alt.heroSleep = 42.5;
    const json = JSON.stringify(saved);
    expect(json).not.toContain('queen');
    const back = new GameState({ storage: store() });
    back.loadFromSave(parseSave(json).data);
    expect(ensureHero(back).status).toBe('asleep');
    expect(ensureHero(back).sleepT).toBe(42.5);
    expect(ensureQueen(back)).toBeNull();
    expect(getAltar(back).level).toBe(4);
    expect(serializeGame(back).buildings.find((b) => b.type === 'altar')).toEqual(alt);
  });

  it('round-trips both heroes: each altar keeps its own nap', () => {
    const gs = gameAt(8);
    const tmp = makeStateWithTownHall({}, 8);
    gs.buildings.push(addBuilding(tmp, 'altar', 6, 14, 5), addBuilding(tmp, 'queenAltar', 10, 10, 2));
    ensureHero(gs).hp = 1;
    ensureQueen(gs).hp = 1;
    heroesAfterWave(gs);
    const saved = serializeGame(gs);
    const qs = saved.buildings.find((b) => b.type === 'queenAltar');
    const bs = saved.buildings.find((b) => b.type === 'altar');
    expect(qs.heroSleep).toBeGreaterThan(100);
    expect(bs.heroSleep).toBeGreaterThan(100);
    const back = new GameState({ storage: store() });
    back.loadFromSave(parseSave(JSON.stringify(saved)).data);
    expect(ensureQueen(back).status).toBe('asleep');
    expect(ensureQueen(back).sleepT).toBeCloseTo(qs.heroSleep, 5);
    expect(ensureHero(back).status).toBe('asleep');
    expect(getQueenAltar(back).level).toBe(2);
    back.buildings = back.buildings.filter((b) => b.type !== 'queenAltar');
    expect(ensureQueen(back)).toBeNull(); // she leaves with her altar
    expect(ensureHero(back)).not.toBeNull();
  });

  it('a nap on a building that is not a hero altar is rejected', () => {
    const gs = gameAt(8);
    const saved = serializeGame(gs);
    saved.buildings[0].heroSleep = 10;
    expect(parseSave(JSON.stringify(saved)).status).toBe('invalid');
  });
});

describe('hero health bar follows the altar level (queen and Brisket King)', () => {
  it('the Queen stays at full health when her altar levels up, and a hurt one keeps her share', () => {
    const { s, altar, h } = village(1);
    stepQueen(s, 0.05);
    expect(h.hp).toBe(queenStats(altar).maxHp);
    altar.level = 3;
    stepQueen(s, 0.05);
    expect(h.hp).toBe(queenStats(altar).maxHp);
    expect(h.hp / h.hpMax).toBe(1);
    h.hp = h.hpMax / 2;
    altar.level = 4;
    stepQueen(s, 0.05);
    expect(h.hp / queenStats(altar).maxHp).toBeCloseTo(0.5, 2);
  });
  it('the Brisket King too, and a health perk keeps him full', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 8);
    const altar = addBuilding(s, 'altar', 10, 10, 1);
    const h = ensureHero(s);
    altar.level = 4;
    stepHeroes(s, 0.05);
    expect(h.hp).toBe(heroStats(altar).maxHp);
  });
});

describe('night rest (v0.8.2, just for looks): heroes sleep at their altar at night and get up for a raid', () => {
  it('at night the Queen walks home and lies down; a raid (its countdown) gets her up to defend', () => {
    const { s, h, home } = village(3);
    h.x = home.x + 4; h.y = home.y + 2;
    s.clock = { phase: 'night', t: 10 };
    expect(bedtime(s)).toBe(true);
    run(s, 25);
    expect(h.resting).toBe(true);
    expect(dist(h, home)).toBeLessThan(0.06);
    expect(h.moving).toBe(false);
    const hp = h.hp;
    s.wave = { ...s.wave, phase: 'countdown' }; // a raid is coming
    expect(bedtime(s)).toBe(false);
    run(s, 0.1);
    expect(h.resting).toBe(false);
    expect(h.status).toBe('waking');
    run(s, 1);
    expect(h.status).toBe('ready');
    expect(h.hp).toBe(hp); // only for looks: no healing
  });

  it('by day the heroes never rest, and morning gets a resting hero up', () => {
    const { s, h, home } = village(3);
    s.clock = { phase: 'day', t: 10 };
    run(s, 5);
    expect(h.resting || false).toBe(false);
    s.clock = { phase: 'night', t: 10 };
    run(s, 25);
    expect(h.resting).toBe(true);
    s.clock = { phase: 'day', t: 1 };
    run(s, 2);
    expect(h.resting).toBe(false);
    expect(h.status).toBe('ready'); // (and back to roaming her guard area)
  });

  it('the Brisket King rests at his altar at night too, and a nap that ends at night just sleeps on', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'night', t: 10 } }, 8);
    const altar = addBuilding(s, 'altar', 10, 10, 3);
    const h = ensureHero(s);
    const home = footprintCenter(altar);
    h.x = home.x + 3; h.y = home.y;
    for (let t = 0; t < 25; t += 0.05) stepHeroes(s, 0.05);
    expect(h.resting).toBe(true);
    expect(Math.hypot(h.x - home.x, h.y - home.y)).toBeLessThan(0.06);
    // A healing nap that runs out at night: no wake-up, straight into night rest.
    h.resting = false; h.status = 'asleep'; h.sleepT = 0.1; h.sleepTotal = 1;
    for (let t = 0; t < 0.3; t += 0.05) stepHeroes(s, 0.05);
    expect(h.status).toBe('ready');
    expect(h.resting).toBe(true);
  });
});
