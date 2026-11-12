import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { gnomeRoster, gnomeTier, assignGnomes, workersPerTarget, stepGnomeRepairs, villageMode, gnomeShelters, stepGnomeMining, nearestDropoff, tripTime, gnomeMiningRate, gnomeStats } from '../src/logic/villagers.js';
import { produceMines } from '../src/logic/economy.js';
import { limitFor, maxLevel } from '../src/logic/buildings.js';
import { serializeGame, deserializeGame, validateSave } from '../src/logic/save.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

const V = CONFIG.villagers;
const DAY = { phase: 'day', t: 0 };
const play = (extra = {}, th = 1) => makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: DAY, ...extra }, th);

describe('Villager Houses and gnome workers', () => {
  it('a house has 10 levels: odd levels add a gnome (1 to 5), even levels improve them; up to 5 houses', () => {
    expect(maxLevel('house')).toBe(10);
    expect(CONFIG.house.levels.map((l) => l.gnomes)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    for (let l = 2; l <= 10; l++) {
      const better = gnomeStats(l).mine > gnomeStats(l - 1).mine && gnomeStats(l).repair > gnomeStats(l - 1).repair;
      const same = gnomeStats(l).mine === gnomeStats(l - 1).mine && gnomeStats(l).repair === gnomeStats(l - 1).repair;
      expect(l % 2 === 0 ? better : same).toBe(true);
    }
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(gnomeTier)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6]);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('house', th))).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('every gnome lives in a Villager House (the Village Hall has none of its own)', () => {
    const s = play({}, 5);
    expect(gnomeRoster(s)).toHaveLength(0);
    const h = addBuilding(s, 'house', 9, 16, 3);
    const roster = gnomeRoster(s);
    expect(roster).toHaveLength(2);
    expect(roster.every((g) => g.homeId === h.id && g.level === 3)).toBe(true);
  });

  it('by day gnomes work mines, at most 2 per mine, spread one per mine first', () => {
    const s = play();
    const m1 = addBuilding(s, 'mine', 9, 16);
    const m2 = addBuilding(s, 'mine', 13, 20);
    addBuilding(s, 'house', 13, 11, 9);        // 5 gnomes for 4 mine slots
    expect(villageMode(s)).toBe('work');
    const a = assignGnomes(s);
    const per = workersPerTarget(a, 'mine');
    expect(per.get(m1.id)).toBe(2);
    expect(per.get(m2.id)).toBe(2);
    expect([...a.values()].filter((g) => g.task === 'wander')).toHaveLength(1);
  });

  it('the mine fills its own stock at the normal rate (gnome gold is separate)', () => {
    const s = play();
    const mine = addBuilding(s, 'mine', 9, 16);
    produceMines(s, 10);
    expect(mine.stock).toBeCloseTo(CONFIG.mine.levels[0].production * 10);
  });

  it('each working gnome fills a sack with its share of the mine rate, carries it to the nearest storage, and comes back', () => {
    const s = play({ gold: 0 });
    addBuilding(s, 'house', 13, 11, 3);         // 2 gnomes
    const mine = addBuilding(s, 'mine', 9, 16);
    const storage = addBuilding(s, 'storage', 9, 20);
    expect(nearestDropoff(s, mine).id).toBe(storage.id);
    const jobs = assignGnomes(s);
    const miners = [...jobs.values()].filter((g) => g.task === 'mine');
    expect(miners).toHaveLength(2);
    const sack = gnomeMiningRate(mine, 3) * V.sackSeconds;  // level 3 house: 30% of the mine rate
    stepGnomeMining(s, V.sackSeconds, jobs);                       // sacks full: off to storage
    const w = s._gnomeWork.get(miners[0].id);
    expect(w.phase).toBe('carrying');
    expect(w.dropId).toBe(storage.id);
    expect(s.gold).toBe(0);                                       // not there yet
    stepGnomeMining(s, tripTime(mine, storage), jobs);            // arrived: gold added
    expect(s.gold).toBe(2 * Math.floor(sack));
    expect(s.events.filter((e) => e.name === 'gnomeDelivered')).toHaveLength(2);
    expect(w.phase).toBe('returning');
    expect(mine.stock || 0).toBe(0);                              // the mine's own stock is untouched
    stepGnomeMining(s, tripTime(mine, storage), jobs);
    expect(w.phase).toBe('mining');
  });

  it('a gnome sent home keeps what is in its sack', () => {
    const s = play();
    addBuilding(s, 'house', 13, 11);
    const mine = addBuilding(s, 'mine', 9, 16);
    const jobs = assignGnomes(s);
    stepGnomeMining(s, 5, jobs);
    const id = [...jobs.values()].find((g) => g.task === 'mine').id;
    const sack = s._gnomeWork.get(id).sack;
    s.clock = { phase: 'dusk', t: 1 };
    stepGnomeMining(s, 5, assignGnomes(s));
    expect(s._gnomeWork.get(id).sack).toBe(sack);
  });

  it('during an attack gnomes repair the most damaged buildings (not walls), 2% max HP / s each', () => {
    const s = play();
    addBuilding(s, 'house', 13, 11, 5);         // 3 gnomes
    const mine = addBuilding(s, 'mine', 9, 16);
    const cannon = addBuilding(s, 'cannon', 13, 20);
    s.wave.phase = 'active';
    mine.hp = 100;                              // 1/3 HP: first in line
    cannon.hp = cannon.hp - 10;                 // barely scratched
    const a = assignGnomes(s);
    expect(villageMode(s)).toBe('repair');
    const per = workersPerTarget(a, 'repair');
    expect(per.get(mine.id)).toBe(2);
    expect(per.get(cannon.id)).toBe(1);         // 3 gnomes: 2 + 1
    stepGnomeRepairs(s, 1, a);
    expect(mine.hp).toBeCloseTo(100 + 2 * gnomeStats(5).repair * CONFIG.mine.levels[0].hp);
  });

  it('gnome stats come from their house level', () => {
    const s = play();
    const mine = addBuilding(s, 'mine', 9, 16);
    expect(gnomeMiningRate(mine, 4)).toBeCloseTo(CONFIG.mine.levels[0].production * CONFIG.house.levels[3].gnomeMine);
    expect(gnomeStats(10)).toEqual({ mine: 0.52, repair: 0.0425 });
  });

  it('a level 5 gnome repairs faster than a level 1 gnome', () => {
    const heal = (level) => {
      const s = play();
      const mine = addBuilding(s, 'mine', 9, 16);
      mine.hp = 100;
      stepGnomeRepairs(s, 1, new Map([['x', { id: 'x', homeId: 'h', level, task: 'repair', targetId: mine.id, slot: 0 }]]));
      return mine.hp - 100;
    };
    expect(heal(5)).toBeCloseTo(gnomeStats(5).repair * CONFIG.mine.levels[0].hp);
    expect(heal(5)).toBeGreaterThan(heal(1));
  });

  it('nobody works in the evening before the wave (they are home)', () => {
    const s = play({ clock: { phase: 'dusk', t: 1 } });
    addBuilding(s, 'mine', 9, 16);
    addBuilding(s, 'house', 13, 11, 5);
    s.wave.phase = 'countdown';
    expect(villageMode(s)).toBe('home');
    expect([...assignGnomes(s).values()].every((g) => g.task === 'inside')).toBe(true);
  });

  it('gnomes from a destroyed house stop working and shelter in the Village Hall', () => {
    const s = play();
    addBuilding(s, 'mine', 9, 16);
    const h = addBuilding(s, 'house', 13, 11);
    h.destroyed = true; h.hp = 0;
    const mine = [...assignGnomes(s).values()].filter((g) => g.homeId === h.id);
    expect(mine.every((g) => g.task === 'displaced' && g.targetId === s.buildings[0].id)).toBe(true);
  });

  it('at night each gnome sleeps in its own house', () => {
    const s = play();
    const a = addBuilding(s, 'house', 13, 11, 3);
    const b = addBuilding(s, 'house', 6, 20, 5);
    const shelters = gnomeShelters(s);
    for (const g of gnomeRoster(s)) expect(shelters.get(g.id)).toBe(g.homeId === a.id ? a.id : b.id);
  });

  it('only gnomes whose house is destroyed go to the Village Hall', () => {
    const s = play();
    const th = s.buildings[0];
    const h1 = addBuilding(s, 'house', 13, 11);
    const h2 = addBuilding(s, 'house', 6, 20);
    h1.destroyed = true; h1.hp = 0;
    const shelters = gnomeShelters(s);
    const roster = gnomeRoster(s);
    for (const g of roster.filter((x) => x.homeId === h1.id)) expect(shelters.get(g.id)).toBe(th.id);
    for (const g of roster.filter((x) => x.homeId !== h1.id)) expect(shelters.get(g.id)).toBe(h2.id);
  });

  it('ruins are saved and come back as ruins', () => {
    const s = play();
    const h = addBuilding(s, 'house', 13, 11);
    h.destroyed = true; h.hp = 0;
    s.townHallLevel = 1;
    const saved = JSON.parse(JSON.stringify(serializeGame({ ...s, gold: 0, wavesCleared: 0, nightsAtMaxTownHall: 0 })));
    expect(validateSave(saved)).toBe(true);
    const back = deserializeGame(saved).buildings.find((b) => b.id === h.id);
    expect(back.destroyed).toBe(true);
    expect(back.hp).toBe(0);
  });
});
