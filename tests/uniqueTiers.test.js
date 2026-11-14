// The building-specific tiers that replaced the repeated ones (each covers a weakness or amplifies a strength).
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { abilityFx, towerFireInterval, towerRange } from '../src/logic/abilities.js';
import { stepDefenses, stepProjectiles, stepPools, fireDefense, damageEnemy, damageBuilding, enemyIsAir, isValidTarget, createPool } from '../src/logic/combat.js';
import { stepEnemy, stepEnemies } from '../src/logic/enemies.js';
import { stepBeams } from '../src/logic/beams.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepTraps } from '../src/logic/traps.js';
import { stepSpecials, stepAbilityBuildings, stepEnemyStatus } from '../src/logic/abilityEffects.js';
import { maxHp } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = () => { const s = makeStateWithTownHall({ gold: 0 }, 10); s.wave.phase = 'active'; return s; };
const fly = (s) => { for (let i = 0; i < 100 && s.projectiles.length; i++) stepProjectiles(s, 0.05); };
const tank = (s, x, y, hp = 1e6) => addEnemy(s, 'tank', x, y, { hp, maxHp: hp });
const run = (fn, seconds, dt = 0.05) => { for (let i = 0; i < Math.round(seconds / dt); i++) fn(dt); };

describe('Cannon', () => {
  it('Powder Keg: every 4th cannonball splashes', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = ['a'];
    tank(s, 13, 17);
    const shots = [];
    for (let i = 0; i < 4; i++) { c.cooldown = 0; stepDefenses(s, 0.01); shots.push(s.projectiles[s.projectiles.length - 1].splashRadius); }
    expect(shots).toEqual([0, 0, 0, 1]);
  });

  it('Anvil Shot: knocked into a building, the enemy is stunned and hurt extra', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = ['a', 'a', 'a', 'a'];
    addBuilding(s, 'storage', 14, 16, 1); // right behind the target
    const t = tank(s, 13.9, 17);
    const p = fireDefense(s, c, t);
    fly(s);
    expect(t.held).toBeGreaterThan(0);
    expect(s.events.some((e) => e.name === 'slam')).toBe(true);
    expect(1e6 - t.hp).toBeGreaterThan(p.damage);
  });

  it('Hot Barrel speeds up on the same target; Flak Burst hits flyers; Autoloader refires after a kill', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = ['b', 'b'];
    tank(s, 13, 17);
    const base = towerFireInterval(c);
    for (let i = 0; i < 3; i++) { c.cooldown = 0; stepDefenses(s, 0.01); }
    expect(towerFireInterval(c)).toBeLessThan(base);
    const flyer = addEnemy(s, 'bomber', 10.5, 17.5, { hp: 1e6, maxHp: 1e6 });
    run((dt) => stepSpecials(s, dt), 2.1);
    expect(flyer.hp).toBeLessThan(1e6);
    // Autoloader
    const k = addBuilding(s, 'cannon', 3, 3, 10);
    k.picks = ['b', 'b', 'b', 'b'];
    const g = addEnemy(s, 'grunt', 6, 4, { hp: 1, maxHp: 1 });
    fireDefense(s, k, g);
    k.cooldown = 3;
    fly(s);
    expect(k.cooldown).toBe(0);
  });

  it('Broadside fires a fan of 5 cannonballs', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = ['b', 'b', 'b', 'b', 'b'];
    tank(s, 13, 17);
    run((dt) => stepSpecials(s, dt), 8.05);
    expect(s.projectiles.filter((p) => p.line)).toHaveLength(5);
  });
});

describe('Locklair', () => {
  it('Ricochet: a kill bounces the arrow to the next enemy', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = ['a'];
    const g = addEnemy(s, 'grunt', 13, 17, { hp: 1, maxHp: 1 });
    const next = tank(s, 14, 17);
    fireDefense(s, a, g);
    fly(s);
    expect(next.hp).toBeLessThan(1e6);
  });

  it('Tank Buster adds a share of current health; Bullseye hits far targets harder; Ambush doubles the first arrow', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = ['a', 'a', 'a'];
    const t = tank(s, 12, 17, 1000);
    const p = fireDefense(s, a, t);
    fly(s);
    expect(1000 - t.hp).toBeCloseTo(p.damage + 40, 5);
    const b = addBuilding(s, 'archer', 3, 3, 10);
    b.picks = ['b'];
    const far = tank(s, 4 + towerRange(b) - 0.5, 4), near = tank(s, 5, 4);
    const p1 = fireDefense(s, b, far); fly(s);
    const p2 = fireDefense(s, b, near); fly(s);
    expect(1e6 - far.hp).toBeCloseTo(p1.damage * 1.4, 5);
    expect(1e6 - near.hp).toBeCloseTo(p2.damage, 5);
    const c = addBuilding(s, 'archer', 20, 3, 10);
    c.picks = ['b', 'b', 'b', 'b'];
    const e = tank(s, 22, 4);
    for (let i = 0; i < 2; i++) { c.cooldown = 0; stepDefenses(s, 0.01); }
    const mine = s.projectiles.filter((x) => x.sourceId === c.id);
    expect(mine[0].damage).toBeCloseTo(mine[1].damage * 2, 5);
    expect(e.alive).toBe(true);
  });

  it('Festering: poison burns hotter the longer it lasts', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = ['c', 'c', 'c'];
    const t = tank(s, 12, 17);
    fireDefense(s, a, t); fly(s);
    const hp0 = t.hp;
    stepEnemyStatus(s, 1);
    const first = hp0 - t.hp;
    stepEnemyStatus(s, 1);
    const second = hp0 - first - t.hp;
    expect(second).toBeGreaterThan(first);
  });
});

describe('Litman Mortar', () => {
  it('Ranging Shot leads moving targets; Dead Center and Heavy Ordnance hit harder', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = ['a', 'a', 'a'];
    const t = tank(s, 16, 17);
    t.vx = 1; t.vy = 0;
    const p = fireDefense(s, m, t);
    expect(p.targetX).toBeCloseTo(16 + CONFIG.projectiles.mortar.flightTime, 5);
    t.x = p.targetX; // it walks into the landing spot
    fly(s);
    // Tank right at the center: +60% (Dead Center) +75% (Heavy Ordnance).
    expect(1e6 - t.hp).toBeCloseTo(p.damage * 2.35, 3);
  });

  it('Ready Rack loads shells while idle and fires them when an enemy arrives; Spotter Link reaches marked enemies', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = ['b'];
    run((dt) => stepDefenses(s, dt), towerFireInterval(m) * 2 + 0.1);
    expect(m.rack).toBe(2);
    tank(s, 16, 17);
    run((dt) => stepDefenses(s, dt), 0.8);
    expect(s.projectiles.length).toBe(3);
    const n = addBuilding(s, 'mortar', 3, 3, 10);
    n.picks = ['b', 'b', 'b', 'b'];
    const far = tank(s, 4 + towerRange(n) + 2, 4);
    expect(isValidTarget(n, far)).toBe(false);
    far.markBonus = 0.15;
    expect(isValidTarget(n, far)).toBe(true);
  });

  it('Ground Zero: enemies killed by a blast burst', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = ['c', 'c', 'c', 'c'];
    const g = addEnemy(s, 'grunt', 16, 17, { hp: 1, maxHp: 1 });
    const near = tank(s, 16.9, 17);
    fireDefense(s, m, g);
    fly(s);
    expect(s.events.some((e) => e.name === 'splash' && e.data.kind === 'groundZero')).toBe(true);
    expect(near.hp).toBeLessThan(1e6);
  });
});

describe('Gandolf', () => {
  it('Kindling hits burning enemies harder; Phoenix Ash spreads fire from kills', () => {
    const s = attack();
    const w = addBuilding(s, 'wizard', 9, 16, 10);
    w.picks = ['a'];
    const t = tank(s, 12, 17);
    t.burnTime = 2; t.burnDps = 0;
    const p = fireDefense(s, w, t); fly(s);
    expect(1e6 - t.hp).toBeCloseTo(p.damage * 1.5, 5);
    createPool(s, 5, 5, { radius: 1, duration: 3, dps: 1000, slow: 0, ash: true }, 'fire');
    const g = addEnemy(s, 'grunt', 5, 5, { hp: 10, maxHp: 10 });
    stepPools(s, 0.5);
    expect(g.alive).toBe(false);
    expect(s.pools.filter((x) => x.kind === 'fire')).toHaveLength(2);
  });

  it('Storm Front reaches further into a crowd; Mana Surge hits hard after resting; Blink sends enemies back', () => {
    const s = attack();
    const w = addBuilding(s, 'wizard', 9, 16, 10);
    w.picks = ['b'];
    const base = towerRange(w);
    for (let i = 0; i < 4; i++) tank(s, 11, 17 + i * 0.3);
    stepDefenses(s, 0.01);
    expect(towerRange(w)).toBeCloseTo(base + 1.5, 5);
    const z = addBuilding(s, 'wizard', 3, 3, 10);
    z.picks = ['c'];
    const t = tank(s, 5, 4);
    z.cooldown = 0; stepDefenses(s, 0.01);
    const mine = s.projectiles.filter((p) => p.sourceId === z.id);
    expect(mine[0].damage).toBeCloseTo(CONFIG.defenses.wizard.levels[9].damage * 3, 5);
    expect(t.alive).toBe(true);
    const bl = addBuilding(s, 'wizard', 20, 20, 10);
    bl.picks = ['c', 'c'];
    const g = tank(s, 22.3, 21);
    stepAbilityBuildings(s, 0.05);
    expect(g.x).toBeGreaterThan(23.5);
  });
});

describe('Firework Launcher', () => {
  it('Grounding Burst knocks flyers down where ground-only defenses can hit them', () => {
    const s = attack();
    const f = addBuilding(s, 'firework', 9, 16, 10);
    f.picks = ['a', 'a', 'a', 'a'];
    const b = addEnemy(s, 'bomber', 12, 17, { hp: 1e6, maxHp: 1e6 });
    fireDefense(s, f, b); fly(s);
    expect(enemyIsAir(b)).toBe(false);
    const cannon = addBuilding(s, 'cannon', 12, 12, 10);
    expect(isValidTarget(cannon, b)).toBe(true);
  });

  it('Showstopper: dazzled enemies keep walking but can\'t attack; Counter-Flare fires back', () => {
    const s = attack();
    const f = addBuilding(s, 'firework', 9, 16, 10);
    f.picks = ['b', 'b', 'b', 'b', 'b'];
    const g = addEnemy(s, 'grunt', 12, 17, { hp: 1e6, maxHp: 1e6 });
    fireDefense(s, f, g); fly(s);
    expect(g.disarmT).toBeGreaterThan(0);
    const c = addBuilding(s, 'firework', 3, 3, 10);
    c.picks = ['a', 'c'];
    const bomber = addEnemy(s, 'bomber', 4, 4);
    damageBuilding(s, c, 10, bomber);
    expect(s.projectiles.some((p) => p.sourceId === c.id && p.targetId === bomber.id)).toBe(true);
  });

  it('Celebration: a flyer kill speeds up defenses nearby; Grand Display hits flyers anywhere', () => {
    const s = attack();
    const f = addBuilding(s, 'firework', 9, 16, 10);
    f.picks = ['c', 'c', 'c', 'c'];
    const archer = addBuilding(s, 'archer', 11, 16, 10);
    const base = towerFireInterval(archer);
    const b = addEnemy(s, 'bomber', 12, 17, { hp: 1, maxHp: 1 });
    fireDefense(s, f, b); fly(s);
    expect(towerFireInterval(archer)).toBeLessThan(base);
    f.picks = ['c', 'c', 'c', 'c', 'c'];
    const faraway = addEnemy(s, 'bomber', 28, 2, { hp: 1e6, maxHp: 1e6 });
    run((dt) => stepSpecials(s, dt), 15.1);
    expect(faraway.hp).toBeLessThan(1e6);
  });
});

describe('Mousetrap', () => {
  it('Jaw Lock doubles damage on healthy enemies; Snare holds the trigger longer; Shrapnel Spring fires spikes', () => {
    const s = attack();
    const t = addBuilding(s, 'mousetrap', 9, 16, 10);
    t.picks = ['a', 'a', 'c']; // Wide Jaws, Jaw Lock, Shrapnel Spring
    tank(s, 9.5, 16.5, 1e6);
    const other = tank(s, 10.3, 16.8, 1e6);
    stepTraps(s, 0.05);
    const dmg = CONFIG.defenses.mousetrap.levels[9].damage;
    expect(1e6 - other.hp).toBeCloseTo(dmg * 2, 5);
    expect(s.projectiles.filter((p) => p.line)).toHaveLength(6);
    const n = addBuilding(s, 'mousetrap', 3, 3, 10);
    n.picks = ['c', 'c']; // Spikes, Snare
    const trig = tank(s, 3.5, 3.5, 1e6);
    const by = tank(s, 4.2, 3.8, 1e6);
    stepTraps(s, 0.05);
    expect(trig.held).toBeCloseTo(by.held + 3, 5);
  });
});

describe('F.L.O.C.K Tower', () => {
  it('Weak Point Scan, Drone Tail, Bounty Hunter, Overwatch, Data Leech and Frequency Jam', () => {
    const s = attack();
    const f = addBuilding(s, 'flock', 9, 16, 10);
    f.picks = ['a', 'a', 'a', 'b'];
    const e = tank(s, 9.5, 16.5, 100);
    stepFlockTowers(s);
    const mark = e.markBonus;
    e.hp = 20; // under 30%
    damageEnemy(s, e, 10);
    expect(20 - e.hp).toBeCloseTo(10 * (1 + mark * 2), 5);
    e.x = 25; e.y = 25; // leaves range: the mark lingers
    stepFlockTowers(s);
    expect(e.markBonus).toBe(mark);
    // Overwatch: a cannon near a F.L.O.C.K with it sees invisible enemies.
    const o = addBuilding(s, 'flock', 20, 20, 10);
    o.picks = ['a', 'b'];
    const c = addBuilding(s, 'cannon', 11, 16, 10);
    o.col = 12; o.row = 15; // right beside the cannon
    stepFlockTowers(s);
    const ghost = addEnemy(s, 'thief', 12.5, 17, { hidden: true });
    expect(isValidTarget(c, ghost)).toBe(true);
    // Data Leech + Frequency Jam
    const h = addBuilding(s, 'flock', 3, 3, 10);
    h.picks = ['c', 'c', 'c'];
    const g = addEnemy(s, 'grunt', 3.5, 3.5, { hp: 1, maxHp: 1 });
    const bal = addEnemy(s, 'balloon', 4, 4);
    stepFlockTowers(s);
    expect(bal.airJammed).toBe(true);
    const rp0 = s.researchPoints || 0;
    damageEnemy(s, g, 5);
    expect(s.researchPoints - rp0).toBe(CONFIG.enemies.grunt.researchPoints + 1);
  });
});

describe('The Diddypult', () => {
  it('Splash Zone hits pooled enemies harder; Pressure Cap pulls enemies in; Hangover makes them wander', () => {
    const s = attack();
    const cat = addBuilding(s, 'catapult', 3, 3, 6);
    cat.picks = ['b', 'b', 'b', 'b'];
    const t = tank(s, 14, 4);
    t.inPoolT = 0.3;
    const side = tank(s, 15.5, 4);
    const p = fireDefense(s, cat, t);
    for (let i = 0; i < 60; i++) stepProjectiles(s, 0.05);
    expect(1e6 - t.hp).toBeGreaterThanOrEqual(p.damage * 2 - 1e-6);
    expect(side.x).toBeLessThan(15.5);
    const h = addBuilding(s, 'catapult', 20, 20, 6);
    h.picks = ['c', 'c'];
    const g = tank(s, 20, 9);
    fireDefense(s, h, g);
    for (let i = 0; i < 60; i++) stepProjectiles(s, 0.05);
    expect(g.wanderT).toBeGreaterThan(0);
  });

  it('Spillover grows a pool on kills; Toxic Fumes hurt flyers; Oil Moat slows enemies around it', () => {
    const s = attack();
    const pool = createPool(s, 5, 5, { radius: 1.5, duration: 9, dps: 1000, slow: 0, grow: 0.25, airMult: 0.5 }, 'catapult');
    addEnemy(s, 'grunt', 5, 5, { hp: 1, maxHp: 1 });
    const b = addEnemy(s, 'bomber', 5.5, 5, { hp: 1e6, maxHp: 1e6 });
    stepPools(s, 0.5);
    expect(pool.radius).toBe(1.75);
    expect(1e6 - b.hp).toBeCloseTo(1000 * 0.5 * 0.5, 3);
    const cat = addBuilding(s, 'catapult', 20, 20, 6);
    cat.picks = ['a', 'b'];
    const g = tank(s, 22, 21);
    stepAbilityBuildings(s, 0.05);
    expect(g.slow).toBe(0.4);
  });
});

describe('Tower of Rah', () => {
  it('Heat Memory keeps the heat on a new target; Cauterize heals buildings on a kill', () => {
    const s = attack();
    const r = addBuilding(s, 'ra', 9, 16, 8);
    r.picks = ['b'];
    const a = tank(s, 12, 17, 1e9);
    run((dt) => stepBeams(s, dt), 6);
    expect(r.beams[0].stage).toBe(2);
    a.alive = false;
    tank(s, 12, 18, 1e9);
    stepBeams(s, 0.05);
    stepBeams(s, 0.05);
    expect(r.beams[0].stage).toBe(2); // kept its heat
    const h = addBuilding(s, 'ra', 3, 3, 8);
    h.picks = ['c', 'c', 'c'];
    const mine = addBuilding(s, 'mine', 5, 3, 1);
    mine.hp = 10;
    addEnemy(s, 'grunt', 5, 5, { hp: 1, maxHp: 1 });
    run((dt) => stepBeams(s, dt), 0.5);
    expect(mine.hp).toBeGreaterThan(10);
    expect(mine.hp).toBeLessThanOrEqual(maxHp(mine));
  });
});
