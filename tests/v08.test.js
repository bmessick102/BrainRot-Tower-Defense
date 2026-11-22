// v0.8 enemies: Quandale Dingle's dash and Grimace Golem's goo.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepEnemies } from '../src/logic/enemies.js';
import { stepBeams } from '../src/logic/beams.js';
import { stepSpecialEnemies } from '../src/logic/specialEnemies.js';
import { damageEnemy, stepProjectiles, stepPools, stepDefenses } from '../src/logic/combat.js';
import { enrageFactor } from '../src/logic/enrage.js';
import { distanceToFootprint } from '../src/logic/grid.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = (th = 11) => {
  const s = makeStateWithTownHall({ gold: 0 }, th);
  s.wave.phase = 'active';
  for (const b of s.buildings) b.hp = b.maxHp = 1e9; // (the hall never falls)
  return s;
};
const run = (s, seconds, dt = 0.05) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) { stepSpecialEnemies(s, dt); stepEnemies(s, dt); stepProjectiles(s, dt); stepPools(s, dt); }
};
const events = (s, name) => s.events.filter((e) => e.name === name);

describe('Quandale Dingle: dash', () => {
  const C = CONFIG.enemies.quandale, D = C.dash;

  it('dashes to a building a few tiles away and lands an impact hit, then punches normally', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    const q = addEnemy(s, 'quandale', 4 + 1, 4 + 2 + 3, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    const d0 = distanceToFootprint(store, q.x, q.y);
    expect(d0).toBeGreaterThan(D.minRange);
    expect(d0).toBeLessThan(D.range);
    run(s, 0.2);
    expect(events(s, 'enemyDash')).toHaveLength(1);
    // Much faster than walking there.
    run(s, (d0 / D.speed) * 1.6);
    const impact = events(s, 'dashImpact');
    expect(impact).toHaveLength(1);
    expect(1e6 - store.hp).toBeCloseTo(C.damage * D.impactMult);
    // Then normal punches.
    run(s, C.attackInterval * 2.2);
    expect(1e6 - store.hp).toBeCloseTo(C.damage * (D.impactMult + 2));
    expect(events(s, 'dashImpact')).toHaveLength(1);
  });

  it('a hold that skips his step (a Mousetrap sets e.held directly) ends the dash instead of freezing it', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    const q = addEnemy(s, 'quandale', 4 + 1, 4 + 2 + 3, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 0.2);
    expect(events(s, 'enemyDash')).toHaveLength(1);
    expect(q.dashT).toBeGreaterThan(0);
    q.held = 0.5; // (as traps.js springs a trap: no applyStun)
    run(s, 0.05);
    expect(q.dashT).toBe(0);
    run(s, 0.6);
    expect(events(s, 'dashImpact')).toHaveLength(0);
  });

  it('walks (no dash) to a building that is already close', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    addEnemy(s, 'quandale', 5, 4 + 2 + 1, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 2);
    expect(events(s, 'enemyDash')).toHaveLength(0);
    expect(1e6 - store.hp).toBeGreaterThan(0);
    expect((1e6 - store.hp) % C.damage).toBeCloseTo(0);
  });

  it('a wall in the way: no dash impact (he breaks the wall like anyone else)', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    // A closed ring of walls around the storage.
    for (let c = 3; c <= 6; c++) for (const r of [3, 6]) addBuilding(s, 'wall', c, r, 1);
    for (let r = 4; r <= 5; r++) for (const c of [3, 6]) addBuilding(s, 'wall', c, r, 1);
    for (const b of s.buildings) if (b.type === 'wall') b.hp = b.maxHp = 1e6;
    addEnemy(s, 'quandale', 5, 9.5, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 4);
    expect(events(s, 'dashImpact')).toHaveLength(0);
    expect(store.hp).toBe(1e6);
    expect(s.buildings.some((b) => b.type === 'wall' && b.hp < 1e6)).toBe(true);
  });
});

describe('Quandale Dingle: stun', () => {
  const D = CONFIG.enemies.quandale.dash;
  const stunned = (type) => {
    const s = attack();
    const b = addBuilding(s, type, 4, 4, 1);
    const e = addEnemy(s, 'grunt', b.col + 2, b.row + 3, { hp: 1e6, maxHp: 1e6 });
    return { s, b, e };
  };
  it('the dash impact stuns the building it lands on', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    addEnemy(s, 'quandale', 5, 4 + 2 + 3, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 1.5);
    expect(events(s, 'dashImpact')).toHaveLength(1);
    expect(store.stunT).toBeGreaterThan(0);
    expect(store.stunT).toBeLessThanOrEqual(D.stunSeconds);
    run(s, D.stunSeconds + 0.2);
    expect(store.stunT).toBe(0);
  });
  it('a stunned shooter does not fire, then fires again when it wears off', () => {
    const { s, b, e } = stunned('archer');
    b.stunT = 1;
    for (let i = 0; i < 10; i++) stepDefenses(s, 0.05);
    expect(s.projectiles.length).toBe(0);
    stepSpecialEnemies(s, 1);
    expect(b.stunT).toBe(0);
    stepDefenses(s, 0.05);
    expect(s.projectiles.length).toBeGreaterThan(0);
    expect(e.alive).toBe(true);
  });
  it('a stunned beam tower stops burning', () => {
    const { s, b, e } = stunned('ra');
    b.stunT = 1;
    stepBeams(s, 0.1);
    expect(e.hp).toBe(1e6);
    expect(b.beams || []).toHaveLength(0);
    b.stunT = 0;
    for (let i = 0; i < 10; i++) stepBeams(s, 0.1);
    expect(e.hp).toBeLessThan(1e6);
  });
});

describe('Grimace Golem: goo', () => {
  const G = CONFIG.enemies.grimace.goo;

  it('leaves goo puddles behind as he walks', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    addEnemy(s, 'grimace', 5, 16, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 6);
    const goo = s.pools.filter((p) => p.kind === 'goo');
    expect(goo.length).toBeGreaterThanOrEqual(2);
    expect(goo[0].radius).toBe(G.radius);
    expect(goo.every((p) => p.dps === 0)).toBe(true);
  });

  it('enrages other enemies standing in it (not himself, no stacking), and it wears off', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = store.maxHp = 1e6;
    const gr = addEnemy(s, 'grimace', 5, 16, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    const g = addEnemy(s, 'grunt', 5, 16, { hp: 1e6, maxHp: 1e6, targetId: store.id, held: 999 });
    run(s, 0.2);
    expect(g.gooT).toBeGreaterThan(0);
    expect(enrageFactor(s, g).speed).toBeCloseTo(G.speedMult);
    expect(enrageFactor(s, g).damage).toBeCloseTo(G.damageMult);
    expect(gr.gooT || 0).toBe(0);
    expect(enrageFactor(s, gr).speed).toBe(1);
    // Off the goo, it wears off after rageSeconds.
    s.pools = [];
    g.x = 30; g.y = 30;
    run(s, G.rageSeconds + 0.2);
    expect(g.gooT).toBe(0);
    expect(enrageFactor(s, g).speed).toBe(1);
  });

  it('leaves one big puddle where he dies', () => {
    const s = attack();
    const gr = addEnemy(s, 'grimace', 20, 20, { hp: 10, maxHp: 10 });
    damageEnemy(s, gr, 100);
    const big = s.pools.filter((p) => p.kind === 'goo' && p.radius === G.deathRadius);
    expect(big).toHaveLength(1);
    expect(big[0].duration).toBe(G.deathSeconds);
  });
});
