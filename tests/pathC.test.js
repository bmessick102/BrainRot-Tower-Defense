import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ABILITY_RULES } from '../src/abilityConfig.js';
import { maxHp } from '../src/logic/buildings.js';
import { damageBuilding, damageEnemy, fireDefense, stepProjectiles, stepPools } from '../src/logic/combat.js';
import { stepEnemy } from '../src/logic/enemies.js';
import { stepBeams } from '../src/logic/beams.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepTraps } from '../src/logic/traps.js';
import { stepSpecials, stepStrikes, stepEnemyStatus, stepAbilityBuildings } from '../src/logic/abilityEffects.js';
import { towerFireInterval } from '../src/logic/abilities.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = () => { const s = makeStateWithTownHall({}, 10); s.wave.phase = 'active'; return s; };
const fly = (s) => { for (let i = 0; i < 100 && s.projectiles.length; i++) stepProjectiles(s, 0.05); };
const C = (n) => ['c', 'c', 'c', 'c', 'c'].slice(0, n);

describe('Path C: Cannon Fortress', () => {
  it('Thick Walls adds health; Armor Plating cuts damage taken', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    const base = maxHp(c);
    c.picks = C(2);
    expect(maxHp(c)).toBe(Math.round(base * 1.25));
    c.hp = maxHp(c);
    damageBuilding(s, c, 100);
    expect(maxHp(c) - c.hp).toBeCloseTo(85, 5);
  });

  it('Spiked Plating hits melee attackers back; Self-Repair heals during attacks', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = C(4);
    s.buildings = s.buildings.filter((b) => b.type !== 'townHall');
    const g = addEnemy(s, 'tank', 11.2, 17, { hp: 5000, maxHp: 5000, targetId: c.id });
    for (let i = 0; i < 40; i++) stepEnemy(s, g, 0.05);
    expect(g.hp).toBeLessThan(5000); // thorns
    const hurt = c.hp = Math.round(maxHp(c) / 2);
    stepAbilityBuildings(s, 1);
    expect(c.hp).toBeCloseTo(hurt + maxHp(c) * 0.02, 5);
  });

  it('Last Stand: a fatal hit leaves it at 1 HP, firing twice as fast for 5 s, once per night', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = C(5);
    c.hp = maxHp(c);
    const normal = towerFireInterval(c);
    damageBuilding(s, c, 999999);
    expect(c.destroyed).toBe(false);
    expect(c.hp).toBe(1);
    expect(towerFireInterval(c)).toBeCloseTo(normal / 2, 6);
    stepAbilityBuildings(s, ABILITY_RULES.lastStandSeconds + 0.1);
    damageBuilding(s, c, 999999);
    expect(c.destroyed).toBe(true);
  });
});

describe('Path C: status effects', () => {
  it('Locklair Venom poisons over time and Spreading Plague passes it on when the target dies', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = C(4);
    const t = addEnemy(s, 'grunt', 12, 17, { hp: 1e6, maxHp: 1e6 });
    const p = fireDefense(s, a, t);
    fly(s);
    expect(t.poisonDps).toBeCloseTo(p.damage * 0.3, 5); // Lingering Venom (tier 2) is the strongest owned
    const hp = t.hp;
    stepEnemyStatus(s, 1);
    expect(t.hp).toBeLessThan(hp);
    const near = addEnemy(s, 'grunt', 12.5, 17, { hp: 1e6, maxHp: 1e6 });
    damageEnemy(s, t, 1e7);
    expect(near.poisonTime).toBeGreaterThan(0);
  });

  it('Gandolf Mana Bomb casts again after a big hit; Jammer makes enemies hit softer', () => {
    const s = attack();
    const w = addBuilding(s, 'wizard', 9, 16, 10);
    w.picks = ['c', 'c', 'c'];
    const t = addEnemy(s, 'grunt', 12, 17, { hp: 1e6, maxHp: 1e6 });
    addEnemy(s, 'grunt', 12.3, 17, { hp: 1e6, maxHp: 1e6 });
    addEnemy(s, 'grunt', 12, 17.3, { hp: 1e6, maxHp: 1e6 });
    w.cooldown = 5;
    fireDefense(s, w, t);
    fly(s);
    expect(w.cooldown).toBe(0);
    // F.L.O.C.K Jammer
    const f = addBuilding(s, 'flock', 12, 12, 10);
    f.picks = C(4);
    const e = addEnemy(s, 'grunt', 12.5, 12.5);
    stepFlockTowers(s);
    expect(e.weaken).toBe(0.25);
  });

  it('Firework Decoy Flare sends flyers chasing a decoy instead of attacking', () => {
    const s = attack();
    const f = addBuilding(s, 'firework', 9, 16, 10);
    f.picks = ['c'];
    const flyer = addEnemy(s, 'bomber', 12, 17, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 201; i++) stepSpecials(s, 0.05);
    expect(flyer.decoyT).toBeGreaterThan(0);
    const d0 = Math.hypot(flyer.decoyX - 10, flyer.decoyY - 17);
    expect(d0).toBeGreaterThan(CONFIG.defenses.firework.range); // the decoy is out past its range
  });

  it('Mortar Seismic Charge bounces, Fault Line cracks the ground, and Aftershock hits again', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = C(3);
    const t = addEnemy(s, 'tank', 16, 17, { hp: 1e6, maxHp: 1e6 });
    fireDefense(s, m, t);
    for (let i = 0; i < 26; i++) stepProjectiles(s, 0.05); // the shell lands
    expect(s.pools.filter((p) => p.kind === 'crack')).toHaveLength(3);
    expect(s.strikes.some((x) => x.kind === 'aftershock')).toBe(true);
    expect(s.projectiles.some((p) => p.bounced)).toBe(true);
    const hp = t.hp;
    for (let i = 0; i < 12; i++) stepStrikes(s, 0.05);
    expect(t.hp).toBeLessThan(hp);
  });

  it('Mousetrap Spike Trap leaves spikes; Booby Trap blasts flyers too', () => {
    const s = attack();
    const t = addBuilding(s, 'mousetrap', 9, 16, 10);
    t.picks = C(5);
    addEnemy(s, 'grunt', 9.5, 16.5, { hp: 1e6, maxHp: 1e6 });
    const flyer = addEnemy(s, 'bomber', 10.5, 17, { hp: 1e6, maxHp: 1e6 });
    stepTraps(s, 0.05);
    expect(s.pools.some((p) => p.kind === 'spikes')).toBe(true);
    expect(flyer.hp).toBeLessThan(1e6);
  });
});

describe('Path C: Tower of Rah Overheat and the timed specials', () => {
  it('Hot Start begins at the second heat stage; Supernova blasts when a full-heat target dies', () => {
    const s = attack();
    const r = addBuilding(s, 'ra', 9, 16, 8);
    r.picks = ['c'];
    addEnemy(s, 'tank', 12, 17, { hp: 1e9, maxHp: 1e9 });
    stepBeams(s, 0.05);
    expect(r.beams[0].stage).toBe(1);
    r.picks = C(5);
    const big = s.enemies[0];
    const side = addEnemy(s, 'grunt', 12.8, 17, { hp: 50000, maxHp: 50000 });
    for (let i = 0; i < 120; i++) stepBeams(s, 0.05); // reach full heat
    expect(r.beams[0].stage).toBe(CONFIG.defenses.ra.stages.length - 1);
    big.hp = 1;
    stepBeams(s, 0.25);
    expect(big.alive).toBe(false);
    expect(side.hp).toBeLessThan(50000);
  });

  it('Earthquake stuns ground enemies in range; Override turns the toughest enemy on its friends', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = C(5);
    const g = addEnemy(s, 'tank', 14, 17, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 301; i++) stepSpecials(s, 0.05);
    expect(g.held).toBeGreaterThan(0);
    expect(g.hp).toBeLessThan(1e6);
    const f = addBuilding(s, 'flock', 20, 12, 10);
    f.picks = C(5);
    const boss = addEnemy(s, 'tank', 20.5, 12.5, { hp: 5e6, maxHp: 5e6, cooldown: 0 }); // the toughest in range
    const friend = addEnemy(s, 'grunt', 21, 12.5, { hp: 1e4, maxHp: 1e4, cooldown: 0 });
    for (let i = 0; i < 301; i++) stepSpecials(s, 0.05);
    expect(boss.hackedT).toBeGreaterThan(0);
    stepEnemy(s, boss, 0.05);
    expect(friend.hp).toBeLessThan(1e4);
  });
});
