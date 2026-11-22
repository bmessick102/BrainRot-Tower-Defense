// v0.6: KSI Tower, Select Row, and the five new enemies. (Village Hall 11's Bonus Slots, v0.6.1, were replaced by fixed
// caps per hall in v0.8: tests/townHalls.test.js.)
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { limitFor, DEFENSE_TYPES, BUILDING_TYPES, unlockTownHall, maxLevel } from '../src/logic/buildings.js';
import { fireDefense, stepProjectiles, stepPools, damageEnemy, chillEnemy } from '../src/logic/combat.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepEnemies, createEnemy, ENEMY_KINDS } from '../src/logic/enemies.js';
import { stepSpecialEnemies } from '../src/logic/specialEnemies.js';
import { waveComposition } from '../src/logic/waves.js';
import { enrageFactor } from '../src/logic/enrage.js';
import { createLayoutDraft, wallRun, checkGroupMove, moveGroupInDraft, draftBuildings } from '../src/logic/layout.js';
import { ABILITIES } from '../src/abilityConfig.js';
import { artTier } from '../src/objects/BuildingView.js';
import { ENEMY_DESCRIPTIONS, ENEMY_CATEGORIES, ENEMY_ORDER } from '../src/enemyText.js';
import { BUILDING_DESCRIPTIONS } from '../src/buildingText.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = (th = 10) => { const s = makeStateWithTownHall({ gold: 0 }, th); s.wave.phase = 'active'; return s; };
const fly = (s) => { for (let i = 0; i < 200 && s.projectiles.length; i++) stepProjectiles(s, 0.05); };
const run = (s, seconds, dt = 0.05) => { for (let i = 0; i < Math.round(seconds / dt); i++) { stepSpecialEnemies(s, dt); stepFlockTowers(s); stepEnemies(s, dt); stepProjectiles(s, dt); } };
const tough = (s, kind, x, y, extra = {}) => addEnemy(s, kind, x, y, { hp: 1e6, maxHp: 1e6, ...extra });

describe('KSI Tower', () => {
  const K = CONFIG.defenses.ksi;
  it('is a 10-level ground + air splash tower from Village Hall 5, a picture per 2 levels, up to 3', () => {
    expect(BUILDING_TYPES).toContain('ksi');
    expect(DEFENSE_TYPES).toContain('ksi');
    expect(unlockTownHall('ksi')).toBe(5);
    expect(maxLevel('ksi')).toBe(10);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('ksi', th))).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 3, 3]);
    expect(artTier(10, 'ksi')).toBe(5);
    expect(K.hitsGround && K.hitsAir).toBe(true);
    expect(BUILDING_DESCRIPTIONS.ksi).toBeTruthy();
    for (const p of ['a', 'b', 'c']) expect(ABILITIES.ksi[p].tiers).toHaveLength(5);
  });

  it('its splash chills every enemy hit by its level\'s slow; bosses take half; the strongest slow wins', () => {
    const s = attack();
    const b = addBuilding(s, 'ksi', 10, 10, 1);
    const g = tough(s, 'grunt', 14, 11);
    const near = tough(s, 'tank', 14.6, 11);
    const boss = tough(s, 'babycar', 14, 11.5);
    fireDefense(s, b, g);
    fly(s);
    expect(g.chillT).toBeCloseTo(K.chill.seconds);
    expect(g.slow).toBeCloseTo(K.levels[0].slow);
    expect(near.slow).toBeCloseTo(K.levels[0].slow);
    expect(boss.slow).toBeCloseTo(K.levels[0].slow * K.chill.bossShare);
    // A stronger slow already on it stays; a weaker chill doesn't replace it.
    g.slow = 0.8; g.slowTimer = 5;
    chillEnemy(g, { slow: 0.3, seconds: 1, bossShare: 0.5 });
    expect(g.slow).toBe(0.8);
  });

  it('Fully Frozen freezes enemies solid (not bosses); Frost Patch leaves an icy pool', () => {
    const s = attack();
    const b = addBuilding(s, 'ksi', 10, 10, 10);
    b.picks = ['b', 'b', 'b', 'b', 'b'];
    s.rng = () => 0; // every roll freezes
    const g = tough(s, 'grunt', 14, 11);
    const boss = tough(s, 'babycar', 14, 11.4);
    fireDefense(s, b, g);
    fly(s);
    expect(g.held).toBeGreaterThan(0);
    expect(g.frozenT).toBeGreaterThan(0);
    expect(g.vulnTimer).toBeGreaterThan(0); // Ice Shatter
    expect(boss.held || 0).toBe(0);
    const s2 = attack();
    const b2 = addBuilding(s2, 'ksi', 10, 10, 10);
    b2.picks = ['a', 'a'];
    const t = tough(s2, 'tank', 14, 11);
    fireDefense(s2, b2, t);
    fly(s2);
    expect(s2.pools.some((p) => p.kind === 'ice' && p.slow > 0)).toBe(true);
    stepPools(s2, 0.1);
  });
});

describe('Select Row (edit mode)', () => {
  const village = () => {
    const s = makeStateWithTownHall({}, 3);
    const [hc, hr] = [2, 2];
    const walls = [];
    for (let i = 0; i < 5; i++) walls.push(addBuilding(s, 'wall', hc + i, hr));
    addBuilding(s, 'wall', hc + 2, hr + 1); // a wall below the middle one (a column of 2 there)
    addBuilding(s, 'wall', hc + 9, hr);     // after a gap: not part of the run
    return { s, walls };
  };
  it('picks the longer straight run through the wall, stopping at gaps', () => {
    const { s, walls } = village();
    const d = createLayoutDraft(s);
    const run = wallRun(s, d, walls[2].id);
    expect(run.axis).toBe('x');
    expect(run.ids.sort()).toEqual(walls.map((w) => w.id).sort());
    expect([run.w, run.h]).toEqual([5, 1]);
  });
  it('moves the whole run together, refusing spots that are taken or off the grass', () => {
    const { s, walls } = village();
    const d = createLayoutDraft(s);
    const ids = walls.map((w) => w.id);
    expect(checkGroupMove(s, d, ids, 0, 1).ok).toBe(false); // onto the wall below the middle one
    expect(checkGroupMove(s, d, ids, -500, 0).ok).toBe(false);
    expect(moveGroupInDraft(s, d, ids, 0, 4).ok).toBe(true);
    const moved = draftBuildings(s, d).filter((b) => ids.includes(b.id));
    expect(moved.every((b, i) => b.row === walls[i].row + 4 && b.col === walls[i].col)).toBe(true);
  });
});

describe('the v0.6 enemies', () => {
  it('are in every list an enemy needs: kinds, descriptions, How to Play categories (each exactly once)', () => {
    for (const k of ['pork', 'skeleton', 'vaca', 'yahu', 'patapim', 'lirili', 'chimp', 'bicus', 'frigo', 'bombo', 'quandale', 'grimace']) {
      expect(ENEMY_KINDS).toContain(k);
      expect(ENEMY_DESCRIPTIONS[k]).toBeTruthy();
    }
    expect([...ENEMY_ORDER].sort()).toEqual([...ENEMY_KINDS].sort());
    expect(new Set(ENEMY_ORDER).size).toBe(ENEMY_ORDER.length);
    expect(ENEMY_CATEGORIES.map((c) => c.key)).toEqual(['ground', 'air', 'tanks', 'special', 'summoned']);
  });

  it('John Pork: a F.L.O.C.K that sees him from beyond 5 tiles is still silenced by his call', () => {
    const s = attack(10);
    const t = addBuilding(s, 'flock', 10, 10, 10); // range 8.5
    addBuilding(s, 'cannon', 30, 30, 1);
    tough(s, 'pork', 10.5 + 7, 10.5);
    run(s, 0.1);
    expect(t.silencedT).toBeGreaterThan(0);
  });

  it('John Pork: seen by a F.L.O.C.K Tower, he calls and silences every F.L.O.C.K within 5 tiles (marks off), for a while', () => {
    const s = attack(5);
    const near = addBuilding(s, 'flock', 10, 10, 5);
    const near2 = addBuilding(s, 'flock', 13, 10, 5);
    const far = addBuilding(s, 'flock', 26, 10, 5);
    addBuilding(s, 'cannon', 6, 20, 1); // something to walk to
    const P = CONFIG.enemies.pork.call;
    const pork = tough(s, 'pork', 11.5, 13);
    const other = tough(s, 'grunt', 11, 11);
    stepFlockTowers(s);
    expect(other.markBonus).toBeGreaterThan(0);
    run(s, 0.1);
    expect(s.events.some((e) => e.name === 'porkCall')).toBe(true);
    expect(near.silencedT).toBeGreaterThan(0);
    expect(near2.silencedT).toBeGreaterThan(0);
    expect(far.silencedT || 0).toBe(0);
    expect(other.markBonus).toBe(0); // the towers near him are off
    expect(pork.callT).toBeGreaterThan(0); // on the phone: standing still
    run(s, P.seconds + 0.2);
    expect(near.silencedT).toBe(0);
    expect(pork.callCd).toBeGreaterThan(0); // the next call waits for the cooldown
  });

  it('Rahhh Skeleton: near a building he summons Skeletons that climb out of the ground, scaled to him', () => {
    const s = attack(6);
    const S = CONFIG.enemies.skeleton.summon;
    addBuilding(s, 'storage', 10, 10, 1);
    const sk = addEnemy(s, 'skeleton', 9.6 - S.range - 2, 10.5, { hp: 1e6, maxHp: CONFIG.enemies.skeleton.hp * 3 });
    const bones = () => s.enemies.filter((o) => o.kind === 'bones');
    run(s, 0.1);
    expect(bones()).toHaveLength(0); // too far from your base yet
    for (let i = 0; i < 200 && !bones().length; i++) run(s, 0.05);
    expect(bones()).toHaveLength(S.count);
    expect(s.events.some((e) => e.name === 'skeletonSummon')).toBe(true);
    expect(sk.bashT).toBeGreaterThan(0); // standing still, bashing his shield
    const [b] = bones();
    expect(b.summonerId).toBe(sk.id);
    expect(b.rising && b.landing > 0).toBe(true); // can't move or attack while it climbs out
    expect(b.maxHp).toBe(CONFIG.enemies.bones.hp * 3); // as tough as he is for the wave
    const x0 = b.x;
    run(s, S.riseSeconds * 0.5);
    expect(b.x).toBeCloseTo(x0, 0);
    expect(sk.summonCd).toBeGreaterThan(0);
  });

  it('Rahhh Skeleton: summons again after the cooldown, never more than maxAlive of his at once', () => {
    const s = attack(6);
    const S = CONFIG.enemies.skeleton.summon;
    const store = addBuilding(s, 'storage', 10, 10, 1);
    store.hp = store.maxHp = 1e9; // stands the whole test
    const sk = tough(s, 'skeleton', 9.6, 10.5);
    const mine = () => s.enemies.filter((o) => o.alive && o.summonerId === sk.id);
    run(s, 0.1);
    expect(mine()).toHaveLength(S.count);
    for (const o of mine()) { o.hp = 1e6; o.maxHp = 1e6; }
    run(s, S.cooldown + 0.2);
    expect(mine()).toHaveLength(Math.min(S.maxAlive, S.count * 2));
    for (const o of mine()) { o.hp = 1e6; o.maxHp = 1e6; }
    run(s, S.cooldown * 2 + 0.2);
    expect(mine()).toHaveLength(S.maxAlive); // full: no more until some fall
    for (const o of mine().slice(0, 2)) o.alive = false;
    s.enemies = s.enemies.filter((o) => o.alive);
    run(s, S.cooldown + 0.2);
    expect(mine()).toHaveLength(S.maxAlive); // tops back up to the cap, not past it
    expect(enrageFactor(s, sk).damage).toBe(1); // no more rage
  });

  it('Skeletons are never in a wave and say who raises them', () => {
    expect(CONFIG.enemies.bones.droppedBy).toBe('skeleton');
    expect(CONFIG.enemies.bones.fromTownHall).toBeUndefined();
    for (let th = 1; th <= CONFIG.rules.maxTownHallLevel; th++) expect(waveComposition(th * 3).bones || 0).toBe(0);
  });

  it('Lirili Larila (Brr Brr Patapim before v0.7): its quake hits every building and wall within its radius (walls harder)', () => {
    const s = attack(9);
    const Q = CONFIG.enemies.lirili.quake;
    const wall = addBuilding(s, 'wall', 12, 10, 8);
    const store = addBuilding(s, 'storage', 12, 12, 10);
    const farStore = addBuilding(s, 'storage', 25, 25, 1);
    const pat = tough(s, 'lirili', 11, 11);
    pat.quakeT = Q.every; // ready
    run(s, 0.05);
    expect(s.events.some((e) => e.name === 'quake')).toBe(true);
    const wallMax = CONFIG.walls.levels[7].hp, storeMax = CONFIG.storage.levels[9].hp;
    expect(wallMax - wall.hp).toBeCloseTo(Q.damage * Q.wallMult);
    expect(storeMax - store.hp).toBeCloseTo(Q.damage);
    expect(farStore.hp).toBe(CONFIG.storage.levels[0].hp);
    expect(Math.ceil(wallMax / (Q.damage * Q.wallMult))).toBe(7); // a Level 8 wall takes 7 quakes
  });

  it('La Vaca Saturno: a ranged flyer whose boulder hits its target, then bounces 3 times for 70% less each', () => {
    const s = attack(7);
    const B = CONFIG.enemies.vaca.bounce;
    const target = addBuilding(s, 'storage', 12, 10, 10);
    const behind = [];
    const v = tough(s, 'vaca', 13, 7); // north of the target, in range: the boulder flies south
    const c = { x: 13, y: 11 };
    const dir = { x: 0, y: 1 };
    for (let k = 1; k <= 3; k++) behind.push(addBuilding(s, 'wall', Math.floor(c.x + dir.x * B.step * k), Math.floor(c.y + dir.y * B.step * k + 1), 8));
    v.targetId = target.id;
    run(s, 0.1);
    expect(s.projectiles.some((p) => p.kind === 'vaca')).toBe(true); // throws from range (doesn't fly over the target)
    run(s, 3);
    const hits = s.events.filter((e) => e.name === 'boulderLanded');
    expect(hits.map((e) => e.data.bounce).slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(CONFIG.storage.levels[9].hp - target.hp).toBeGreaterThan(0);
  });

  it('Big Yahu: a red target around one building first, then the missile hits only that building (v0.7.1)', () => {
    const s = attack(8);
    const target = addBuilding(s, 'storage', 12, 10, 10);
    target.hp = target.maxHp = 1e6;
    const nextTo = addBuilding(s, 'wall', 14, 11, 8);
    const y = tough(s, 'yahu', 12, 4);
    y.targetId = target.id;
    run(s, 2);
    const warn = s.events.find((e) => e.name === 'missileIncoming');
    expect(warn).toBeTruthy();
    expect(warn.data.radius).toBeLessThan(2); // just around the storage it's aimed at
    expect(warn.data.delay).toBe(CONFIG.projectiles.missile.fallTime);
    run(s, CONFIG.projectiles.missile.fallTime + 0.2);
    expect(s.events.some((e) => e.name === 'bombExploded' && e.data.missile)).toBe(true);
    expect(target.hp).toBeLessThan(1e6);                        // the target is hit...
    expect(nextTo.hp).toBe(CONFIG.walls.levels[7].hp);           // ...and nothing next to it
  });

  it('new enemies can be damaged and killed like the rest (bounty, RP)', () => {
    const s = attack(9);
    for (const k of ['pork', 'skeleton', 'vaca', 'yahu', 'patapim']) {
      const e = createEnemy(s, k, 5, 5, 1);
      s.enemies.push(e);
      damageEnemy(s, e, 1e7);
      expect(e.alive).toBe(false);
    }
    expect(s.events.filter((e) => e.name === 'enemyKilled')).toHaveLength(5);
  });
});

describe('Patch notes', () => {
  it('describe this release (the version in package.json) and every entry has a title, text and picture', async () => {
    const { PATCH_NOTES } = await import('../src/patchNotes.js');
    const fs = await import('node:fs');
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(PATCH_NOTES.version).toBe(pkg.version);
    expect(PATCH_NOTES.entries.length).toBeGreaterThanOrEqual(10);
    for (const e of PATCH_NOTES.entries) { expect(e.title).toBeTruthy(); expect(e.text).toBeTruthy(); expect(e.icon).toBeTruthy(); }
  });
});
