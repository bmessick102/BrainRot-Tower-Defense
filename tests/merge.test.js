// Defense merging (v0.8): eligibility, costs, the slot it frees, perks / refund / free respec, merged stats, the three
// merged abilities (Rolling Thunder, Ballista Bolt, Triple Strike), every Mastery tier, and saves.
import { describe, it, expect, afterEach } from 'vitest';
import { CONFIG } from '../src/config.js';
import { maxHp, maxLevel, levelStats, roomFor, countOwned, displayName, totalSpent } from '../src/logic/buildings.js';
import { towerRange, towerFireInterval, towerDamageMult, checkRespec } from '../src/logic/abilities.js';
import {
  checkMerge, mergeBuildings, mergeCandidates, mergePreview, checkMastery, masteryLevel, syncMastery, MERGE_TYPES, burgersSpentOnLevels
} from '../src/logic/merge.js';
import { stepDefenses, stepProjectiles, pinEnemy, damageEnemy, sideTargets } from '../src/logic/combat.js';
import { stepEnemies } from '../src/logic/enemies.js';
import { stepPools } from '../src/logic/combat.js';
import { rpCap } from '../src/logic/researchPoints.js';
import { serializeGame, parseSave, deserializeGame } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';
import { netSpots, netStats, fireNets, stepSkyNets } from '../src/logic/skyNet.js';
import { facingToward, mergedFacingKey } from '../src/logic/merge.js';

const TOP = (type) => maxLevel(type);
const village = (extra = {}) => {
  const s = makeStateWithTownHall({ gold: 400000, researchPoints: 9000, research: {}, tutorialDone: true, tutorialStep: 99, ...extra }, 10);
  addBuilding(s, 'rvlab', 21, 11, 5);
  return s;
};
const pair = (s, type) => [addBuilding(s, type, 13, 15, TOP(type)), addBuilding(s, type, 21, 15, TOP(type))];
const events = (s, name) => s.events.filter((e) => e.name === name);
const fight = (s) => { s.wave.phase = 'active'; return s; };
/** Fire once (the tower's next trigger pull), then let every shot land and roll out. */
const volley = (s, b, seconds = 3) => {
  b.cooldown = 0;
  stepDefenses(s, 0.01);
  for (let i = 0; i < seconds / 0.02; i++) stepProjectiles(s, 0.02);
};
const tough = (s, kind, x, y, extra = {}) => addEnemy(s, kind, x, y, { hp: 1e7, maxHp: 1e7, ...extra });

describe('merging: rules', () => {
  it('Cannon, Locklair Tower, Litman Mortar and Firework Launcher can merge, data-driven', () => {
    expect(MERGE_TYPES).toEqual(['cannon', 'archer', 'mortar', 'firework']);
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.mastery.tiers).toHaveLength(3);
      expect(m.mastery.costs).toHaveLength(3);
      expect(m.art.key.startsWith(`bld_${t}_merged`)).toBe(true);
      for (const k of Object.values(m.art.facings || {})) expect(k.startsWith(`bld_${t}_merged_`)).toBe(true);
    }
  });

  it('costs fit what a Village Hall 10 village can hold (Burger cap with its best RV Lab, gold capacity)', () => {
    const maxLab = CONFIG.rvlab.levels.filter((l) => (l.townHall || 0) <= 10).length;
    const burgerCap = CONFIG.rules.rpCaps[maxLab];
    const goldCap = CONFIG.townHall.levels[9].capacity + 5 * levelStats('storage', 10).capacity;
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.cost.rp).toBeLessThanOrEqual(burgerCap);
      expect(m.cost.gold).toBeLessThanOrEqual(goldCap);
      expect(m.cost.gold).toBe(levelStats(t, TOP(t)).cost); // about one top upgrade
      m.mastery.costs.forEach((c, i) => expect(c).toBeLessThanOrEqual(CONFIG.rules.rpCaps[m.mastery.labLevel[i]]));
    }
  });

  it('needs two max-level, unmerged, standing copies of the same type', () => {
    const s = village();
    const a = addBuilding(s, 'cannon', 13, 15, TOP('cannon') - 1);
    expect(checkMerge(s, a)).toMatchObject({ ok: false, reason: 'Needs Level 10', show: false });
    a.level = TOP('cannon');
    expect(checkMerge(s, a)).toMatchObject({ ok: false, reason: 'Needs another Level 10 Cannon', show: true });
    addBuilding(s, 'archer', 17, 11, TOP('archer')); // another type doesn't count
    expect(checkMerge(s, a).ok).toBe(false);
    const b = addBuilding(s, 'cannon', 21, 15, TOP('cannon'));
    b.destroyed = true;
    expect(checkMerge(s, a).ok).toBe(false);
    b.destroyed = false;
    expect(checkMerge(s, a)).toMatchObject({ ok: true, reason: '' });
    expect(mergeCandidates(s, a).map((x) => x.id)).toEqual([b.id]);
    expect(checkMerge(s, addBuilding(s, 'storage', 13, 11, 1)).show).toBe(false);
  });

  it('only between waves, and only with the gold and the Burgers', () => {
    const s = village();
    const [a, b] = pair(s, 'cannon');
    s.wave.phase = 'active';
    expect(checkMerge(s, a, b.id).reason).toBe('Not during a wave');
    s.wave.phase = 'idle';
    s.gold = 1000;
    expect(checkMerge(s, a, b.id).reason).toMatch(/more gold/);
    s.gold = 400000;
    s.researchPoints = 10;
    expect(checkMerge(s, a, b.id).reason).toMatch(/more Burgers/);
  });

  it('merging takes both costs, removes the other copy, keeps both slots (counts as 2)', () => {
    const s = village();
    const [a, b] = pair(s, 'cannon');
    const limit = CONFIG.limits.cannon[9];
    let n = 0;
    while (countOwned(s.buildings, 'cannon') < limit) addBuilding(s, 'cannon', 2 + 3 * n++, 2, 1);
    expect(roomFor(s, 'cannon')).toBe(0);
    const r = mergeBuildings(s, a.id, b.id);
    expect(r.ok).toBe(true);
    expect(s.gold).toBe(400000 - CONFIG.merges.cannon.cost.gold);
    expect(s.researchPoints).toBe(9000 - CONFIG.merges.cannon.cost.rp);
    expect(s.buildings.find((x) => x.id === b.id)).toBeUndefined();
    expect(a.merged).toBe(true);
    expect(a.hp).toBe(maxHp(a));
    expect(roomFor(s, 'cannon')).toBe(0); // the merged one counts as 2: no slot is freed
    expect(countOwned(s.buildings, 'cannon')).toBe(limit);
    expect(events(s, 'buildingsMerged')).toHaveLength(1);
    expect(displayName(a)).toBe('Mega Cannon');
    // One merge level: it can't merge again.
    const c = addBuilding(s, 'cannon', 17, 11, TOP('cannon'));
    expect(checkMerge(s, a, c.id)).toMatchObject({ ok: false, reason: 'Already merged', show: false });
    expect(mergeCandidates(s, c).map((x) => x.id)).not.toContain(a.id);
  });

  it('keeps every perk (perks are per type), gives one free respec, refunds the other copy\'s level Burgers past the cap', () => {
    const s = village({ research: { cannon: ['a', 'a', 'a'] } });
    const [a, b] = pair(s, 'cannon');
    expect(checkRespec(s, 'cannon').cost).toBeGreaterThan(0);
    mergeBuildings(s, a.id, b.id);
    expect(a.picks).toEqual(['a', 'a', 'a']);
    expect(checkRespec(s, 'cannon')).toMatchObject({ ok: true, cost: 0, free: true });
    // A merge doesn't stack free respecs.
    const [c, d] = pair(s, 'cannon');
    mergeBuildings(s, c.id, d.id);
    expect(s.freeRespecs.cannon).toBe(1);
    // A type whose levels cost Burgers (none of the three today): the removed copy's Burgers come back, past the cap.
    CONFIG.merges.altar = { ...CONFIG.merges.cannon, name: 'Test Altar' };
    try {
      const t = village({ researchPoints: 9000 });
      const [x, y] = [addBuilding(t, 'altar', 13, 15, TOP('altar')), addBuilding(t, 'altar', 21, 15, TOP('altar'))];
      const refund = burgersSpentOnLevels(y);
      expect(refund).toBeGreaterThan(10000);
      expect(mergeBuildings(t, x.id, y.id).refund).toBe(refund);
      expect(t.researchPoints).toBe(9000 - CONFIG.merges.cannon.cost.rp + refund);
      expect(t.researchPoints).toBeGreaterThan(rpCap(t));
    } finally { delete CONFIG.merges.altar; }
  });

  it('the free respec is used up by a path reset (GameState), and costs nothing', () => {
    const gs = new GameState({ storage: null });
    Object.assign(gs, village({ research: { cannon: ['a', 'a'] } }), { emit: GameState.prototype.emit, listeners: new Map() });
    const [a, b] = pair(gs, 'cannon');
    expect(gs.mergeBuilding(a.id, b.id).ok).toBe(true);
    const rp = gs.researchPoints;
    expect(gs.respecPath('cannon')).toMatchObject({ ok: true, cost: 0 });
    expect(gs.researchPoints).toBe(rp);
    expect(gs.freeRespecs.cannon).toBeUndefined();
    gs.research.cannon = ['b'];
    expect(checkRespec(gs, 'cannon').cost).toBeGreaterThan(0); // paid again
  });

});

describe('merged stats', () => {
  it('health, damage, fire rate and range follow the merge block, below two buildings\' worth', () => {
    for (const type of MERGE_TYPES) {
      const s = village();
      const [a, b] = pair(s, type);
      const before = { hp: maxHp(a), range: towerRange(a), interval: towerFireInterval(a), dmg: towerDamageMult(a) };
      const preview = mergePreview(s, a, b);
      mergeBuildings(s, a.id, b.id);
      const m = CONFIG.merges[type];
      expect(maxHp(a)).toBe(Math.round(before.hp * m.hpMult));
      expect(towerRange(a)).toBeCloseTo(before.range + m.rangeAdd);
      expect(towerFireInterval(a)).toBeCloseTo(before.interval * m.fireIntervalMult);
      expect(towerDamageMult(a)).toBeCloseTo(before.dmg * m.damageMult / m.fireIntervalMult); // timed specials: the DPS gain
      expect(preview.merged.hp).toBe(maxHp(a));
      expect(preview.merged.dps).toBeGreaterThan(preview.a.dps);
      expect(preview.merged.dps).toBeGreaterThan(preview.a.dps * 1.9); // about two buildings' worth
      expect(preview.merged.dps).toBeLessThan(preview.a.dps * 2.1);
    }
  });
});

describe('Mega Cannon: Rolling Thunder', () => {
  const setup = (research = {}) => {
    const s = village({ research });
    const [a, b] = pair(s, 'cannon');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    return { s, c: a };
  };
  const shot = () => levelStats('cannon', 10).damage * CONFIG.merges.cannon.damageMult;

  it('rolls on past its target and hits every ground enemy in its line for full damage, then bursts', () => {
    const { s, c } = setup();
    const cx = c.col + 1, cy = c.row + 1; // footprint center
    const target = tough(s, 'grunt', cx + 3, cy);
    const inLine = [tough(s, 'grunt', cx + 4.2, cy), tough(s, 'grunt', cx + 5.4, cy + 0.3)];
    const flyer = tough(s, 'bomber', cx + 4.8, cy);
    const off = tough(s, 'grunt', cx + 5, cy + 2);
    const pastEnd = tough(s, 'grunt', cx + 3 + CONFIG.merges.cannon.roll.length + 0.6, cy);
    volley(s, c);
    expect(1e7 - target.hp).toBeCloseTo(shot());
    for (const e of inLine) expect(1e7 - e.hp).toBeCloseTo(shot());
    expect(flyer.hp).toBe(1e7);                          // ground only
    expect(off.hp).toBe(1e7);                            // not in its path
    expect(1e7 - pastEnd.hp).toBeCloseTo(shot() * CONFIG.merges.cannon.roll.burstDamage); // only the burst at the end
    expect(events(s, 'megaRoll')).toHaveLength(1);
    expect(events(s, 'splash').some((e) => e.data.kind === 'megaBurst')).toBe(true);
  });

  it('Heavy Shot pierce perks lengthen the roll (and their knockback / stun reach everything it rolls through)', () => {
    const { s, c } = setup({ cannon: ['a', 'a', 'a', 'a', 'a'] }); // Wrecking Ball: pierceLength 5, stun 0.5
    const cx = c.col + 1, cy = c.row + 1;
    tough(s, 'grunt', cx + 3, cy);
    const far = tough(s, 'grunt', cx + 3 + CONFIG.merges.cannon.roll.length + 1.6, cy); // within 4 + 0.4 x 5 = 6 tiles
    volley(s, c);
    expect(1e7 - far.hp).toBeGreaterThanOrEqual(shot() - 1e-6);
    expect(far.held).toBeGreaterThan(0);
  });

  it('Mastery: Heavier Ball +2 tiles, Shockwave stuns the burst, Scorched Path leaves fire', () => {
    const { s, c } = setup();
    const L = CONFIG.merges.cannon.roll.length;
    s.mastery = { cannon: 1 }; syncMastery(s);
    const cx = c.col + 1, cy = c.row + 1;
    tough(s, 'grunt', cx + 3, cy);
    const far = tough(s, 'grunt', cx + 3 + L + 1.5, cy);
    volley(s, c);
    expect(1e7 - far.hp).toBeGreaterThanOrEqual(shot() - 1e-6);

    const t2 = setup(); t2.s.mastery = { cannon: 2 }; syncMastery(t2.s);
    const c2 = t2.c, x2 = c2.col + 1, y2 = c2.row + 1;
    tough(t2.s, 'grunt', x2 + 3, y2);
    const atEnd = tough(t2.s, 'grunt', x2 + 3 + L + 2 + 0.5, y2); // (tier 2 includes Heavier Ball)
    const boss = tough(t2.s, 'babycar', x2 + 3 + L + 2 + 0.7, y2 + 0.3);
    volley(t2.s, c2);
    expect(atEnd.held).toBeGreaterThan(0);
    expect(boss.held || 0).toBe(0);  // bosses: slowed, never held
    expect(boss.slow).toBeGreaterThan(0);

    const t3 = setup(); t3.s.mastery = { cannon: 3 }; syncMastery(t3.s);
    tough(t3.s, 'grunt', t3.c.col + 4, t3.c.row + 1);
    volley(t3.s, t3.c, 1);
    const fire = t3.s.pools.filter((p) => p.kind === 'fire');
    expect(fire.length).toBeGreaterThanOrEqual(L);
  });
});

describe('Locklair Citadel: Ballista Bolt', () => {
  const setup = (mastery = 0) => {
    const s = village();
    const [a, b] = pair(s, 'archer');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { archer: mastery }; syncMastery(s); }
    return { s, t: a };
  };

  it('every 5th shot is a 4x bolt that pins its target', () => {
    const { s, t } = setup();
    const e = tough(s, 'grunt', t.col + 4, t.row + 1);
    for (let i = 0; i < 4; i++) volley(s, t, 1);
    expect(events(s, 'enemyPinned')).toHaveLength(0);
    const hp = e.hp;
    volley(s, t, 1);
    expect(events(s, 'enemyPinned')).toHaveLength(1);
    const arrow = levelStats('archer', 10).damage * CONFIG.merges.archer.damageMult;
    expect(hp - e.hp).toBeCloseTo(arrow * CONFIG.merges.archer.bolt.mult);
    expect(e.held).toBeCloseTo(CONFIG.merges.archer.bolt.pinSeconds, 1);
  });

  it('Quick Crank: a bolt every 4th shot', () => {
    const { s, t } = setup(1);
    tough(s, 'grunt', t.col + 4, t.row + 1);
    for (let i = 0; i < 4; i++) volley(s, t, 1);
    expect(events(s, 'enemyPinned')).toHaveLength(1);
  });

  it('a pinned flyer hangs in the air (no moving or attacking) for the pin, then flies on', () => {
    const s = fight(village());
    const e = tough(s, 'bomber', 4, 4);
    expect(pinEnemy(s, e, { seconds: 1 })).toBe(true);
    for (let i = 0; i < 18; i++) stepEnemies(s, 0.05);
    expect([e.x, e.y]).toEqual([4, 4]);
    expect(e.attacking).toBe(false);
    for (let i = 0; i < 10; i++) stepEnemies(s, 0.05);
    expect(e.x !== 4 || e.y !== 4).toBe(true);
  });

  it('bosses are only slowed, never pinned', () => {
    const s = fight(village());
    const car = tough(s, 'babycar', 4, 4);
    expect(pinEnemy(s, car, { seconds: 1, bossSlow: 0.5 })).toBe(false);
    expect(car.held || 0).toBe(0);
    expect(car.slow).toBe(0.5);
  });

  it('a pin stops Quandale Dingle\'s dash with no impact', () => {
    const s = fight(village());
    for (const b of s.buildings) b.hp = 1e9;
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = 1e6;
    const q = tough(s, 'quandale', 5, 9, { targetId: store.id });
    for (let i = 0; i < 4 && !events(s, 'enemyDash').length; i++) stepEnemies(s, 0.05);
    expect(events(s, 'enemyDash')).toHaveLength(1);
    expect(q.dashT).toBeGreaterThan(0);
    pinEnemy(s, q, { seconds: 1 });
    expect(q.dashT).toBe(0);
    const at = [q.x, q.y];
    for (let i = 0; i < 18; i++) stepEnemies(s, 0.05);
    expect([q.x, q.y]).toEqual(at);
    expect(events(s, 'dashImpact')).toHaveLength(0);
    expect(store.hp).toBe(1e6);
  });

  it('Barbed Bolt: 1.5 s pins, and pinned enemies take 20% more from everything', () => {
    const { s, t } = setup(2);
    const e = tough(s, 'grunt', t.col + 4, t.row + 1);
    for (let i = 0; i < 4; i++) volley(s, t, 1); // Quick Crank comes with tier 2
    expect(e.held).toBeCloseTo(1.5, 1);
    const hp = e.hp;
    damageEnemy(s, e, 100);
    expect(hp - e.hp).toBeCloseTo(120);
  });

  it('Skewer: the bolt passes through and pins one more enemy behind its target', () => {
    const { s, t } = setup(3);
    const cx = t.col + 1, cy = t.row + 1;
    const first = tough(s, 'grunt', cx + 3, cy);
    const behind = tough(s, 'grunt', cx + 4.5, cy);
    for (let i = 0; i < 4; i++) volley(s, t, 1);
    expect(first.held).toBeGreaterThan(0);
    expect(behind.held).toBeGreaterThan(0);
    expect(events(s, 'enemyPinned')).toHaveLength(2);
  });
});

describe('Litman Triple Mortar: Triple Strike', () => {
  const setup = (research = {}, mastery = 0) => {
    const s = village({ research });
    const [a, b] = pair(s, 'mortar');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { mortar: mastery }; syncMastery(s); }
    return { s, m: a };
  };
  const shell = () => levelStats('mortar', 10).damage * CONFIG.merges.mortar.triple.shellMult;
  const fireOnly = (s, m) => { m.cooldown = 0; stepDefenses(s, 0.01); return s.projectiles.filter((p) => p.sourceId === m.id); };

  it('fires three shells at once: the target and the next two enemies, each 55% damage', () => {
    const { s, m } = setup();
    const cx = m.col + 1, cy = m.row + 1;
    const es = [tough(s, 'grunt', cx + 5, cy), tough(s, 'grunt', cx + 5, cy + 4), tough(s, 'grunt', cx + 8, cy - 1)];
    const shells = fireOnly(s, m);
    expect(shells).toHaveLength(3);
    expect(new Set(shells.map((p) => p.targetId)).size).toBe(3);
    for (const p of shells) expect(p.damage).toBeCloseTo(shell());
    expect(events(s, 'projectileFired')).toHaveLength(1); // one launch sound per volley
    for (let i = 0; i < 100; i++) stepProjectiles(s, 0.02);
    for (const e of es) expect(1e7 - e.hp).toBeGreaterThanOrEqual(shell() - 1e-6);
  });

  it('spreads its shells: prefers enemies not already under a shell, and apart from each other', () => {
    const { s, m } = setup();
    const cx = m.col + 1, cy = m.row + 1;
    const main = tough(s, 'grunt', cx + 5, cy);
    const huddled = tough(s, 'grunt', cx + 5.3, cy);  // right next to the main target
    const apart1 = tough(s, 'grunt', cx + 5, cy + 4);
    const apart2 = tough(s, 'grunt', cx + 7, cy - 3);
    expect(new Set(sideTargets(s, m, main, 2, CONFIG.merges.mortar.triple.spreadApart))).toEqual(new Set([apart1, apart2])); // not the huddled one
    s.projectiles.push({ owner: 'tower', targetId: apart1.id, done: false });
    expect(sideTargets(s, m, main, 2, CONFIG.merges.mortar.triple.spreadApart)[0]).toBe(apart2);
    expect(sideTargets(s, m, main, 3, 1)).toContain(huddled);
  });

  it('with one target the other shells land around it, wider', () => {
    const { s, m } = setup();
    const e = tough(s, 'grunt', m.col + 6, m.row + 1);
    const shells = fireOnly(s, m);
    expect(shells).toHaveLength(3);
    const spots = shells.map((p) => [p.targetX, p.targetY]);
    expect(spots.filter(([x, y]) => Math.hypot(x - e.x, y - e.y) < 0.01)).toHaveLength(1);
    for (const [x, y] of spots.slice(1)) expect(Math.hypot(x - e.x, y - e.y)).toBeCloseTo(CONFIG.merges.mortar.triple.spread, 1);
  });

  it('heavy perks (Cluster Shell, Earthshaker\'s bounce, cracks, aftershock) come once per volley: main shell only', () => {
    for (const research of [{ mortar: ['a', 'a', 'a', 'a', 'a'] }, { mortar: ['c', 'c', 'c'] }]) {
      const { s, m } = setup(research);
      tough(s, 'grunt', m.col + 6, m.row + 1);
      const [main, ...side] = fireOnly(s, m);
      const heavy = CONFIG.merges.mortar.triple.sideShellDrops.filter((k) => main.fx[k]);
      expect(heavy.length).toBeGreaterThan(0);
      for (const p of side) for (const k of heavy) expect(p.fx[k]).toBeUndefined();
    }
  });

  it('Mastery: Quick Reload, Concussion, Synchronized Impact', () => {
    const base = setup();
    const t1 = setup({}, 1);
    expect(towerFireInterval(t1.m)).toBeCloseTo(towerFireInterval(base.m) * 0.85);

    const t2 = setup({}, 2);
    const e2 = tough(t2.s, 'grunt', t2.m.col + 6, t2.m.row + 1);
    for (const p of fireOnly(t2.s, t2.m)) expect(p.fx.slowOnHit).toBe(0.3);
    for (let i = 0; i < 100; i++) stepProjectiles(t2.s, 0.02);
    expect(e2.slow).toBe(0.3);

    const t3 = setup({}, 3);
    const e3 = tough(t3.s, 'grunt', t3.m.col + 6, t3.m.row + 1);
    fireOnly(t3.s, t3.m);
    for (let i = 0; i < 100; i++) stepProjectiles(t3.s, 0.02);
    expect(events(t3.s, 'splash').filter((e) => e.data.kind === 'syncBlast')).toHaveLength(1);
    expect(e3.held).toBeGreaterThan(0);
  });
});

describe('Mastery research', () => {
  it('tiers in order, Burgers each, gated by RV Lab level, not part of the path lock', () => {
    const s = village({ research: { cannon: ['b'] } });
    const lab = s.buildings.find((b) => b.type === 'rvlab');
    lab.level = 2;
    expect(checkMastery(s, 'cannon')).toMatchObject({ ok: false, reason: 'Needs RV Lab level 3', tier: 1 });
    lab.level = 5;
    const c = checkMastery(s, 'cannon');
    expect(c).toMatchObject({ ok: true, tier: 1, cost: CONFIG.merges.cannon.mastery.costs[0] });
    expect(checkMastery(s, 'cannon', 3).reason).toBe('Research Mastery 1 first');
    s.mastery = { cannon: 3 };
    expect(checkMastery(s, 'cannon').reason).toBe('Fully mastered');
    expect(masteryLevel(s, 'cannon')).toBe(3);
    expect(s.research.cannon).toEqual(['b']);
  });

  it('GameState: researching spends Burgers and every merged building of the type gets it', () => {
    const gs = new GameState({ storage: null });
    Object.assign(gs, village(), { emit: GameState.prototype.emit, listeners: new Map() });
    const [a, b] = pair(gs, 'archer');
    gs.mergeBuilding(a.id, b.id);
    const rp = gs.researchPoints;
    expect(gs.researchMastery('archer').ok).toBe(true);
    expect(gs.researchPoints).toBe(rp - CONFIG.merges.archer.mastery.costs[0]);
    expect(a.mastery).toBe(1);
    gs.wave.phase = 'active';
    expect(gs.researchMastery('archer').reason).toBe('Not during a wave');
  });
});

describe('saves', () => {
  const placed = () => {
    const s = makeStateWithTownHall({ gold: 300000, wavesCleared: 30, tutorialStep: 11, tutorialDone: true, research: { archer: ['a', 'a'] }, researchPoints: 9000 }, 10);
    addBuilding(s, 'archer', 13, 15, 10);
    addBuilding(s, 'archer', 21, 15, 10);
    addBuilding(s, 'rvlab', 17, 11, 5);
    return s;
  };

  it('merged buildings, Mastery and free respecs round-trip', () => {
    const s = placed();
    const [a, b] = s.buildings.filter((x) => x.type === 'archer');
    mergeBuildings(s, a.id, b.id);
    s.mastery = { archer: 2 };
    syncMastery(s);
    const saved = serializeGame(s);
    expect(saved.buildings.find((x) => x.id === a.id).merged).toBe(true);
    expect(saved.mastery).toEqual({ archer: 2 });
    expect(saved.freeRespecs).toEqual(['archer']);
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const data = deserializeGame(parsed.data);
    const m = data.buildings.find((x) => x.id === a.id);
    expect(m).toMatchObject({ merged: true, mastery: 2 });
    expect(m.hp).toBe(maxHp(m));
    expect(m.hp).toBe(Math.round(levelStats('archer', 10).hp * CONFIG.merges.archer.hpMult));
    expect(data.mastery).toEqual({ archer: 2 });
    expect(data.freeRespecs).toEqual({ archer: 1 });
    expect(serializeGame({ ...s, ...data }).buildings).toEqual(saved.buildings);
  });

  it('older saves load unchanged; bad merge data is rejected', () => {
    const s = placed();
    const saved = serializeGame(s);
    delete saved.mastery; delete saved.freeRespecs;
    const data = deserializeGame(parseSave(JSON.stringify(saved)).data);
    expect(data.buildings.some((x) => x.merged)).toBe(false);
    expect(data.mastery).toEqual({});
    const bad = (mut) => { const o = JSON.parse(JSON.stringify(serializeGame(s))); mut(o); return parseSave(JSON.stringify(o)).status; };
    expect(bad((o) => { o.buildings.find((x) => x.type === 'archer').level = 9; o.buildings.find((x) => x.type === 'archer').merged = true; })).toBe('invalid');
    expect(bad((o) => { o.buildings.find((x) => x.type === 'rvlab').merged = true; })).toBe('invalid');
    expect(bad((o) => { o.mastery = { archer: 4 }; })).toBe('invalid');
    expect(bad((o) => { o.mastery = { wizard: 1 }; })).toBe('invalid');
    expect(bad((o) => { o.freeRespecs = ['wizard']; })).toBe('invalid');
    expect(bad((o) => { o.buildings.find((x) => x.type === 'archer').merged = true; })).toBe('ok');
  });
});

describe('Missile Silo: Sky Net', () => {
  const N = CONFIG.merges.firework.net;
  const setup = (research = {}, mastery = 0) => {
    const s = village({ research });
    const [a, b] = pair(s, 'firework');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { firework: mastery }; syncMastery(s); }
    return { s, f: a, cx: a.col + 1, cy: a.row + 1 };
  };
  const open = (s, seconds) => { for (let i = 0; i < seconds / 0.05; i++) stepSkyNets(s, 0.05); };

  it('aims at the biggest group of flyers in range', () => {
    const t = (x, y) => ({ x, y });
    const lone = t(0, 0), group = [t(5, 5), t(5.5, 5.2), t(4.8, 5.6), t(5.2, 4.6)];
    const [spot] = netSpots([lone, ...group], N.radius, 1);
    expect(group).toContainEqual({ x: spot.x, y: spot.y });
    expect(spot.covered).toBe(4);
    const two = netSpots([lone, ...group], N.radius, 2);
    expect(two).toHaveLength(2);
    expect(two[1]).toMatchObject({ x: 0, y: 0, covered: 1 }); // the next net goes to a different group
  });

  it('every 6 s a net opens on the group: flyers inside are pulled toward its middle and slowed 50% for 3 s', () => {
    const { s, f, cx, cy } = setup();
    const a = tough(s, 'bomber', cx + 4, cy), b = tough(s, 'bomber', cx + 4, cy + 1.2);
    const before = Math.hypot(a.x - b.x, a.y - b.y);
    open(s, N.every - 0.1);
    expect(s.nets || []).toHaveLength(0);
    open(s, 0.2);
    expect(s.nets).toHaveLength(1);
    expect(events(s, 'netFired')).toHaveLength(1);
    open(s, N.flightTime + 1);
    expect(events(s, 'netOpened')).toHaveLength(1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(before);
    expect(a.slow).toBe(N.slow);
    expect(b.slow).toBe(N.slow);
    open(s, N.seconds);
    expect(s.nets).toHaveLength(0);
    expect(f.netT).toBeGreaterThan(0);
  });

  it('pulls at most the net pull distance, never past its middle', () => {
    const { s, cx, cy } = setup();
    const a = tough(s, 'bomber', cx + 4, cy);
    const b = tough(s, 'bomber', cx + 4, cy + 1.4);
    fireNets(s, s.buildings.find((x) => x.merged));
    const spot = { x: s.nets[0].x, y: s.nets[0].y };
    const far = [a, b].find((e) => e.x !== spot.x || e.y !== spot.y);
    const d0 = Math.hypot(far.x - spot.x, far.y - spot.y);
    open(s, N.flightTime + N.seconds + 0.1);
    const d1 = Math.hypot(far.x - spot.x, far.y - spot.y);
    expect(d0 - d1).toBeLessThanOrEqual(N.pull + 1e-6);
    expect(d1).toBeGreaterThanOrEqual(N.coreRadius - 1e-6);
  });

  it('catches ground troops only with Ground Show; bosses are slowed, never pulled', () => {
    const plain = setup();
    const g = tough(plain.s, 'grunt', plain.cx + 4, plain.cy);
    tough(plain.s, 'bomber', plain.cx + 4, plain.cy + 0.5);
    fireNets(plain.s, plain.f);
    open(plain.s, N.flightTime + 0.5);
    expect(g.slow || 0).toBe(0);

    const show = setup({ firework: ['b'] }); // Ground Show: rockets reach ground troops too
    expect(netStats(show.f).ground).toBe(true);
    const g2 = tough(show.s, 'grunt', show.cx + 4, show.cy + 1);
    const car = tough(show.s, 'babycar', show.cx + 4, show.cy);
    const at = [car.x, car.y];
    fireNets(show.s, show.f);
    open(show.s, N.flightTime + 1);
    expect(g2.slow).toBe(N.slow);
    expect(car.slow).toBe(N.slow);
    expect([car.x, car.y]).toEqual(at);
  });

  it('slows never stack: the strongest one wins', () => {
    const { s, f, cx, cy } = setup();
    const e = tough(s, 'bomber', cx + 4, cy, { slow: 0.7, slowTimer: 5 });
    fireNets(s, f);
    open(s, N.flightTime + 0.5);
    expect(e.slow).toBe(0.7);
  });

  it('Mastery: Wider Net, Tangled, Double Net', () => {
    const t1 = setup({}, 1);
    expect(netStats(t1.f).radius).toBe(N.radius + 1);

    const t2 = setup({}, 2);
    const e = tough(t2.s, 'bomber', t2.cx + 4, t2.cy);
    fireNets(t2.s, t2.f);
    open(t2.s, N.flightTime + 0.2);
    const hp = e.hp;
    damageEnemy(t2.s, e, 100);
    expect(hp - e.hp).toBeCloseTo(120);

    const t3 = setup({}, 3);
    tough(t3.s, 'bomber', t3.cx + 4, t3.cy);
    tough(t3.s, 'bomber', t3.cx - 1, t3.cy + 6);
    expect(fireNets(t3.s, t3.f)).toHaveLength(2);
  });

  it('turns its picture toward its target (left / right, keeping the last facing when idle)', () => {
    const lr = ['left', 'right'];
    expect(facingToward(lr, -30, 5, 'right')).toBe('left');
    expect(facingToward(lr, 30, -5, 'left')).toBe('right');
    expect(facingToward(lr, null, null, 'right')).toBe('right');
    expect(facingToward(lr, 1, 40, 'left')).toBe('left');
    expect(facingToward(['dl', 'dr', 'ul', 'ur'], -5, -5)).toBe('ul');
    expect(mergedFacingKey('firework', 'right')).toBe('bld_firework_merged_right');
    expect(mergedFacingKey('cannon', 'ur')).toBe('bld_cannon_merged_ur');
    expect(mergedFacingKey('archer', 'left')).toBe('bld_archer_merged');
  });
});

describe('merged balance (v0.8: counts as two buildings)', () => {
  it('the merged Firework Launcher is the Missile Silo, and every type has an ability icon key', () => {
    expect(CONFIG.merges.firework.name).toBe('Missile Silo');
    expect(CONFIG.merges.firework.ability).toBe('Sky Net');
    expect(MERGE_TYPES.map((t) => CONFIG.merges[t].abilityIcon).sort()).toEqual(
      ['ui_ability_ballista_bolt', 'ui_ability_rolling_thunder', 'ui_ability_sky_net', 'ui_ability_triple_strike']);
  });

  it('health is twice a max-level copy and damage per second about twice (two buildings\' worth)', () => {
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.hpMult).toBe(2);
      const dps = (m.triple ? m.triple.shells * m.triple.shellMult : m.damageMult) / (m.fireIntervalMult || 1);
      expect(dps).toBeGreaterThanOrEqual(1.99);
      expect(dps).toBeLessThanOrEqual(2.05);
    }
  });
});
