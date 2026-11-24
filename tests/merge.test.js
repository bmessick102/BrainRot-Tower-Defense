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
import { makeStateWithTownHall, addBuilding, addEnemy, shakeCapAt } from './helpers.js';
import { netSpots, netStats, fireNets, stepSkyNets } from '../src/logic/skyNet.js';
import { wallStats, wallLines, raiseWalls, stepWizardWalls, distToSegment } from '../src/logic/wizardWall.js';
import { zapStats, zapTargets, zap, empPulse, stepFlockZaps } from '../src/logic/flockZap.js';
import { harpoonStats, harpoonTargets, hookEnemy, stepHarpoons } from '../src/logic/harpoon.js';
import { shatterStats, markShatter, stepShatters } from '../src/logic/shatter.js';
import { barrelStats, jugSpots, stepJugs } from '../src/logic/barrelBurst.js';
import { lanceStats, lanceLine } from '../src/logic/solarLance.js';
import { stepBeams } from '../src/logic/beams.js';
import { simulate } from '../src/logic/simulate.js';
import { stepFlockTowers } from '../src/logic/flock.js';
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
  it('Cannon, Locklair Tower, Litman Mortar, Firework Launcher, Gandolf Tower, F.L.O.C.K Tower, Spear Thrower, KSI Tower, Diddypult and Tower of Rah can merge, data-driven', () => {
    expect(MERGE_TYPES).toEqual(['cannon', 'archer', 'mortar', 'firework', 'wizard', 'flock', 'spear', 'ksi', 'catapult', 'ra']);
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.mastery.tiers).toHaveLength(3);
      expect(m.mastery.costs).toHaveLength(3);
      expect(m.art.key.startsWith(`bld_${t}_merged`)).toBe(true);
      for (const k of Object.values(m.art.facings || {})) expect(k.startsWith(`bld_${t}_merged_`)).toBe(true);
    }
  });

  it('costs fit what a Village Hall 10 village can hold (Shake cap with two top Shake Storages, gold capacity)', () => {
    const burgerCap = shakeCapAt(10); // (merging needs a top-level defense: Village Hall 10)
    const goldCap = CONFIG.townHall.levels[9].capacity + 5 * levelStats('storage', 10).capacity;
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.cost.rp).toBeLessThanOrEqual(burgerCap);
      expect(m.cost.gold).toBeLessThanOrEqual(goldCap);
      expect(m.cost.gold).toBe(levelStats(t, TOP(t)).cost); // about one top upgrade
      m.mastery.costs.forEach((c) => expect(c).toBeLessThanOrEqual(burgerCap));
    }
  });

  it('preview (the greyed Merge before max level): a standing, unmerged mergeable type below its top level only', () => {
    const s = village();
    const low = addBuilding(s, 'cannon', 13, 15, 3);
    expect(checkMerge(s, low)).toMatchObject({ show: false, preview: true, reason: `Needs Level ${TOP('cannon')}` });
    expect(checkMerge(s, addBuilding(s, 'ksi', 17, 11, 1)).preview).toBe(true);
    expect(checkMerge(s, addBuilding(s, 'mine', 2, 2, 1)).preview).toBe(false);        // not a mergeable type
    expect(checkMerge(s, addBuilding(s, 'wall', 2, 8, 1)).preview).toBe(false);        // walls never merge
    const ruin = addBuilding(s, 'cannon', 5, 5, 3); ruin.destroyed = true;
    expect(checkMerge(s, ruin).preview).toBe(false);                                   // destroyed: Rebuild shows
    const [a, b] = pair(s, 'cannon');
    expect(checkMerge(s, a)).toMatchObject({ show: true, preview: false });            // max level: the real Merge
    mergeBuildings(s, a.id, b.id);
    expect(checkMerge(s, a)).toMatchObject({ show: false, preview: false });           // merged
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

  it('only between waves, and only with the gold and the Shakes', () => {
    const s = village();
    const [a, b] = pair(s, 'cannon');
    s.wave.phase = 'active';
    expect(checkMerge(s, a, b.id).reason).toBe('Not during a wave');
    s.wave.phase = 'idle';
    s.gold = 1000;
    expect(checkMerge(s, a, b.id).reason).toMatch(/more gold/);
    s.gold = 400000;
    s.researchPoints = 10;
    expect(checkMerge(s, a, b.id).reason).toMatch(/more Shakes/);
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

  it('keeps every perk (perks are per type), refunds the other copy\'s level Shakes past the cap', () => {
    const s = village({ research: { cannon: ['a', 'a', 'a'] } });
    const [a, b] = pair(s, 'cannon');
    mergeBuildings(s, a.id, b.id);
    expect(a.picks).toEqual(['a', 'a', 'a']);
    // A type whose levels cost Shakes (none of the three today): the removed copy's Shakes come back, past the cap.
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

  it('gives no free path reset (v0.8.3): a reset after merging costs its normal price', () => {
    const gs = new GameState({ storage: null });
    Object.assign(gs, village({ research: { cannon: ['a', 'a'] } }), { emit: GameState.prototype.emit, listeners: new Map() });
    const price = checkRespec(gs, 'cannon').cost;
    expect(price).toBeGreaterThan(0);
    const [a, b] = pair(gs, 'cannon');
    expect(gs.mergeBuilding(a.id, b.id).ok).toBe(true);
    expect(gs.freeRespecs).toBeUndefined();
    const check = checkRespec(gs, 'cannon');
    expect(check).toMatchObject({ ok: true, cost: price });
    expect(check.free).toBeUndefined();
    const rp = gs.researchPoints;
    expect(gs.respecPath('cannon')).toMatchObject({ ok: true, cost: price });
    expect(gs.researchPoints).toBe(rp - price);
    expect(gs.research.cannon).toBeUndefined();
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
      if (m.zap) { expect(preview.a.damage).toBe(0); expect(preview.merged.dps).toBe(m.zap.damage * m.zap.targets / m.zap.every); continue; } // the Mothership: zaps are new
      if (!CONFIG.defenses[type].beam) expect(towerFireInterval(a)).toBeCloseTo(before.interval * m.fireIntervalMult); // (a beam has no shots)
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
  it('tiers in order, Shakes each, gated by RV Lab level, not part of the path lock', () => {
    const s = village({ research: { cannon: ['b'] } });
    const lab = s.buildings.find((b) => b.type === 'rvlab');
    // No merged Cannon yet: the RV Lab shows the column greyed out and nothing can be researched.
    expect(checkMastery(s, 'cannon')).toMatchObject({ ok: false, reason: `Needs a ${CONFIG.merges.cannon.name}: merge two at Level 10`, tier: 1 });
    const [ca, cb] = pair(s, 'cannon');
    mergeBuildings(s, ca.id, cb.id);
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

  it('GameState: researching spends Shakes and every merged building of the type gets it', () => {
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

  it('merged buildings and Mastery round-trip (no free respecs saved)', () => {
    const s = placed();
    const [a, b] = s.buildings.filter((x) => x.type === 'archer');
    mergeBuildings(s, a.id, b.id);
    s.mastery = { archer: 2 };
    syncMastery(s);
    const saved = serializeGame(s);
    expect(saved.buildings.find((x) => x.id === a.id).merged).toBe(true);
    expect(saved.mastery).toEqual({ archer: 2 });
    expect(saved).not.toHaveProperty('freeRespecs');
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const data = deserializeGame(parsed.data);
    const m = data.buildings.find((x) => x.id === a.id);
    expect(m).toMatchObject({ merged: true, mastery: 2 });
    expect(m.hp).toBe(maxHp(m));
    expect(m.hp).toBe(Math.round(levelStats('archer', 10).hp * CONFIG.merges.archer.hpMult));
    expect(data.mastery).toEqual({ archer: 2 });
    expect(data).not.toHaveProperty('freeRespecs');
    expect(serializeGame({ ...s, ...data }).buildings).toEqual(saved.buildings);
  });

  it('a v0.8.0-0.8.2 save with a waiting free reset (freeRespecs) still loads; the free reset is dropped', () => {
    const s = placed();
    const [a, b] = s.buildings.filter((x) => x.type === 'archer');
    mergeBuildings(s, a.id, b.id);
    const old = { ...serializeGame(s), freeRespecs: ['archer'] };
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.status).toBe('ok');
    expect(deserializeGame(parsed.data)).not.toHaveProperty('freeRespecs');
    const gs = new GameState({ storage: null });
    gs.loadFromSave(parsed.data);
    expect(gs.buildings.find((x) => x.id === a.id).merged).toBe(true);
    expect(gs.freeRespecs).toBeUndefined();
    expect(checkRespec(gs, 'archer').cost).toBeGreaterThan(0); // the normal price
    expect(serializeGame(gs)).not.toHaveProperty('freeRespecs');
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
    expect(bad((o) => { o.mastery = { mousetrap: 1 }; })).toBe('invalid');       // (the Mousetrap doesn't merge)
    expect(bad((o) => { o.freeRespecs = ['mousetrap']; })).toBe('invalid');
    expect(bad((o) => { o.buildings.find((x) => x.type === 'archer').merged = true; })).toBe('ok');
  });
});

describe('Gandolf the Grand: You Shall Not Pass', () => {
  const W = CONFIG.merges.wizard.wall;
  const setup = (mastery = 0) => {
    const s = village();
    const [a, b] = pair(s, 'wizard');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { wizard: mastery }; syncMastery(s); }
    return { s, g: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };
  const run = (s, seconds) => { for (let i = 0; i < seconds / 0.05; i++) stepWizardWalls(s, 0.05); };

  it('the wall stands square to the crowd’s way, in front of it, and never closer to the tower than minFromTower', () => {
    const st = { length: 3, ahead: 1, minFromTower: 1.5, count: 1 };
    const [w] = wallLines({ x: 5, y: 0 }, { x: 0, y: 0 }, st);
    expect(w.x1).toBeCloseTo(4); expect(w.x2).toBeCloseTo(4);       // 1 tile in front of the crowd, toward the tower
    expect(Math.abs(w.y2 - w.y1)).toBeCloseTo(3);                     // 3 tiles long, across the way
    const [near] = wallLines({ x: 2, y: 0 }, { x: 0, y: 0 }, st);
    expect(near.x1).toBeCloseTo(2 - 0.5);                             // only 0.5 ahead: stays 1.5 from the tower
    const two = wallLines({ x: 5, y: 0 }, { x: 0, y: 0 }, { ...st, count: 2 });
    expect(two).toHaveLength(2);
    expect(two[1].x1).toBeCloseTo(6);                                 // Double Cast: the second closes in behind the crowd
    expect(distToSegment(4, 5, 4, -1.5, 4, 1.5)).toBeCloseTo(3.5);
    // A crowd walking past (heading up, not at the tower): the wall goes across its way, 1 tile ahead of it.
    const [walk] = wallLines({ x: 5, y: 0 }, { x: 0, y: 0 }, st, { x: 0, y: 2 });
    expect(walk.y1).toBeCloseTo(1); expect(walk.y2).toBeCloseTo(1);
    expect(Math.abs(walk.x2 - walk.x1)).toBeCloseTo(3);
  });

  it('every 10 s, with a ground enemy in range, a wall rises and holds ground troops touching it for 3 s', () => {
    const { s, g, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 3.5, cy);
    run(s, W.every - 0.1);
    expect(s.barriers || []).toHaveLength(0);
    run(s, 0.2);
    expect(s.barriers).toHaveLength(1);
    expect(events(s, 'wallRaised')).toHaveLength(1);
    const w = s.barriers[0];
    // Walk the grunt onto the wall: it's held there while the wall stands.
    const m = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
    e.x = m.x; e.y = m.y;
    run(s, 0.1);
    expect(e.held).toBeGreaterThan(0);
    expect(w.held).toContain(e.id);
    run(s, W.seconds);
    expect(s.barriers).toHaveLength(0);
    expect(g.wallT).toBeGreaterThan(0);
  });

  it('flyers pass over it, bosses are only slowed, and nothing is raised with only flyers in range', () => {
    const { s, g, cx, cy } = setup();
    tough(s, 'bomber', cx + 3, cy);
    expect(raiseWalls(s, g)).toHaveLength(0);
    const grunt = tough(s, 'grunt', cx + 3.5, cy + 0.5);
    const [w] = raiseWalls(s, g);
    const m = { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 };
    const flyer = tough(s, 'bomber', m.x, m.y), car = tough(s, 'babycar', m.x, m.y);
    grunt.x = m.x; grunt.y = m.y;
    run(s, 0.1);
    expect(flyer.held || 0).toBe(0);
    expect(car.held || 0).toBe(0);
    expect(car.slow).toBe(W.bossSlow);
    expect(grunt.held).toBeGreaterThan(0);
  });

  it('Mastery: Wider Wall, Searing Ward (held enemies burn), Double Cast (two walls)', () => {
    const base = wallStats(setup().g);
    const { s, g, cx, cy } = setup(3);
    const st = wallStats(g);
    expect(st.length).toBe(base.length + 1.5);
    expect(st.seconds).toBe(base.seconds + 1);
    expect(st.count).toBe(2);
    expect(st.burnDps).toBeGreaterThan(0);
    const e = tough(s, 'grunt', cx + 3.5, cy);
    const walls = raiseWalls(s, g);
    expect(walls).toHaveLength(2);
    const w = walls[0];
    e.x = (w.x1 + w.x2) / 2; e.y = (w.y1 + w.y2) / 2;
    const hp = e.hp;
    run(s, 1);
    expect(e.hp).toBeLessThan(hp);
  });

  it('walls are cleared when the wave ends and never saved', () => {
    const { s, g, cx, cy } = setup();
    tough(s, 'grunt', cx + 3.5, cy);
    raiseWalls(s, g);
    expect(s.barriers).toHaveLength(1);
    const save = serializeGame(s);
    expect(JSON.stringify(save)).not.toContain('barriers');
  });
});

describe('F.L.O.C.K Mothership: Triple Zap', () => {
  const Z = CONFIG.merges.flock.zap;
  const setup = (mastery = 0) => {
    const s = village();
    const [a, b] = pair(s, 'flock');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { flock: mastery }; syncMastery(s); }
    return { s, f: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };

  it('every second it zaps the 3 closest enemies in zap range at once (ground and air), not ones farther out', () => {
    const { s, f, cx, cy } = setup();
    const near = [tough(s, 'grunt', cx + 1, cy), tough(s, 'bomber', cx, cy + 2), tough(s, 'grunt', cx - 2.5, cy), tough(s, 'grunt', cx + 3.5, cy + 3)];
    const far = tough(s, 'grunt', cx + Z.range + 1.5, cy);
    const picked = zapTargets(s, f);
    expect(picked).toHaveLength(3);
    expect(picked).toEqual(near.slice(0, 3));
    expect(picked).not.toContain(far);
    const hp = near.map((e) => e.hp);
    for (let i = 0; i < Z.every / 0.05 + 1; i++) stepFlockZaps(s, 0.05);
    expect(events(s, 'flockZap')).toHaveLength(1);
    near.slice(0, 3).forEach((e, i) => expect(e.hp).toBeLessThan(hp[i]));
    expect(near[3].hp).toBe(hp[3]);
  });

  it('its own mark makes the zaps hit harder, and it marks a little stronger than a Level 10 F.L.O.C.K', () => {
    const { s, f, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 1, cy);
    stepFlockTowers(s);
    expect(e.markBonus).toBeGreaterThan(0);
    const plain = village();
    const lone = addBuilding(plain, 'flock', 13, 15, TOP('flock'));
    const e2 = tough(plain, 'grunt', lone.col + 1.5, lone.row + 0.5);
    stepFlockTowers(plain);
    expect(e.markBonus).toBeCloseTo(e2.markBonus + CONFIG.merges.flock.markAdd / 100);
    const before = e.hp;
    zap(s, f);
    expect(before - e.hp).toBeCloseTo(Z.damage * (1 + e.markBonus));
  });

  it('no zaps while silenced by John Pork or stunned; a plain F.L.O.C.K Tower never zaps', () => {
    const { s, f, cx, cy } = setup();
    tough(s, 'grunt', cx + 1, cy);
    f.silencedT = 5;
    for (let i = 0; i < 40; i++) stepFlockZaps(s, 0.05);
    expect(events(s, 'flockZap')).toHaveLength(0);
    const plain = village();
    const lone = addBuilding(plain, 'flock', 13, 15, TOP('flock'));
    fight(plain);
    tough(plain, 'grunt', lone.col + 1, lone.row);
    expect(zapStats(lone)).toBeNull();
    for (let i = 0; i < 40; i++) stepFlockZaps(plain, 0.05);
    expect(events(plain, 'flockZap')).toHaveLength(0);
  });

  it('Mastery: Fourth Bolt, Overcharge (more damage under half health), EMP Pulse (stuns, bosses slowed)', () => {
    const { s, f, cx, cy } = setup(3);
    const st = zapStats(f);
    expect(st.targets).toBe(4);
    expect(st.lowMult).toBe(1.5);
    const hurt = tough(s, 'grunt', cx + 1, cy, { hp: 100, maxHp: 1e7 });
    const car = tough(s, 'babycar', cx - 1, cy);
    expect(zapTargets(s, f)).toHaveLength(2);
    expect(empPulse(s, f)).toBe(2);
    expect(hurt.held).toBeGreaterThan(0);
    expect(car.held || 0).toBe(0);
    expect(car.slow).toBe(Z.bossSlow);
  });
});

describe('KSI Frost Fortress: Shatter', () => {
  const S = CONFIG.merges.ksi.shatter;
  const setup = (mastery = 0) => {
    const s = village();
    const [a, b] = pair(s, 'ksi');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { ksi: mastery }; syncMastery(s); }
    return { s, t: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };
  const bottle = () => levelStats('ksi', 10).damage * CONFIG.merges.ksi.damageMult;
  const burst = (s) => stepShatters(s, 0.01);

  it('its bottles mark what they chill; one that dies still chilled bursts, hitting enemies within 1.5 tiles for a bottle', () => {
    const { s, t, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 4, cy);
    volley(s, t, 1.5);
    expect(e.chillT).toBeGreaterThan(0);
    expect(e.shatterT).toBeGreaterThan(0);
    expect(e.shatter).toMatchObject({ sourceId: t.id, radius: S.radius });
    const near = tough(s, 'grunt', e.x + 1.2, e.y), flyer = tough(s, 'bomber', e.x, e.y - 1), far = tough(s, 'grunt', e.x + 2.5, e.y);
    damageEnemy(s, e, 1e9); // killed by anything
    expect(s.shatters).toHaveLength(1);
    burst(s);
    expect(events(s, 'enemyShattered')).toHaveLength(1);
    expect(1e7 - near.hp).toBeCloseTo(bottle());
    expect(1e7 - flyer.hp).toBeCloseTo(bottle()); // ground and air
    expect(far.hp).toBe(1e7);
    expect(s.shatters).toHaveLength(0);
  });

  it('no burst once the chill has run out, and a plain KSI Tower\'s chill never shatters', () => {
    const { s, t, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 4, cy);
    volley(s, t, 1.5);
    stepShatters(s, e.shatterT + 0.1);
    damageEnemy(s, e, 1e9);
    burst(s);
    expect(events(s, 'enemyShattered')).toHaveLength(0);
    const plain = fight(village());
    const k = addBuilding(plain, 'ksi', 13, 15, TOP('ksi'));
    const e2 = tough(plain, 'grunt', k.col + 5, k.row + 1);
    volley(plain, k, 1.5);
    expect(e2.chillT).toBeGreaterThan(0);
    expect(e2.shatterT || 0).toBe(0);
    expect(shatterStats(k)).toBeNull();
  });

  it('a shard kill on another chilled enemy shatters it too, one step later (a chain)', () => {
    const { s, t } = setup();
    const sh = { sourceId: t.id, radius: S.radius, damage: bottle(), chill: null };
    const chain = [0, 1.2, 2.4, 3.6].map((dx) => addEnemy(s, 'grunt', 6 + dx, 6, { hp: 10, maxHp: 10 }));
    chain.forEach((e) => markShatter(e, sh, 3));
    damageEnemy(s, chain[0], 100);
    for (let i = 0; i < 5; i++) burst(s);
    expect(events(s, 'enemyShattered').map((ev) => ev.data.fromId)).toEqual(chain.map((e) => e.id));
    expect(chain.every((e) => !e.alive)).toBe(true);
  });

  it('Mastery: Bigger Burst (+0.5 tile), Sharp Shards (150%), Splinter (shards chill and mark what they hit)', () => {
    const { s, t } = setup(3);
    const st = shatterStats(t);
    expect(st.radius).toBe(S.radius + 0.5);
    expect(st.damage).toBeCloseTo(bottle() * 1.5);
    expect(st.chill).toBe(true);
    const e = tough(s, 'grunt', t.col + 5, t.row + 1);
    volley(s, t, 1.5);
    const reach = tough(s, 'grunt', e.x + 1.9, e.y); // inside 2 tiles, outside 1.5
    damageEnemy(s, e, 1e9);
    burst(s);
    expect(1e7 - reach.hp).toBeCloseTo(bottle() * 1.5);
    expect(reach.chillT).toBeGreaterThan(0);  // Splinter
    expect(reach.shatterT).toBeGreaterThan(0);
  });

  it('nothing Shatter-related is saved, and bursts waiting are cleared when the wave ends', () => {
    const { s, t, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 4, cy);
    volley(s, t, 1.5);
    damageEnemy(s, e, 1e9);
    expect(s.shatters).toHaveLength(1);
    expect(JSON.stringify(serializeGame(s))).not.toMatch(/shatter/i);
  });
});

describe('Harpoon Ballista: Reel In', () => {
  const H = CONFIG.merges.spear.harpoon;
  const setup = (mastery = 0) => {
    const s = village();
    const [a, b] = pair(s, 'spear');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { spear: mastery }; syncMastery(s); }
    return { s, t: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };
  const hook = (s, t, e, hit = 0) => hookEnemy(s, { ...harpoonStats(t), sourceId: t.id }, e, hit);
  const reel = (s, seconds = 1) => { for (let i = 0; i < seconds / 0.05; i++) stepHarpoons(s, 0.05); };

  it('every 3rd throw harpoons the toughest enemy in range (not its usual, closest target) for a merged spear\'s damage', () => {
    const { s, t, cx, cy } = setup();
    const near = tough(s, 'grunt', cx + 2.5, cy, { hp: 1e5, maxHp: 1e5 });
    const big = tough(s, 'grunt', cx, cy - 4);
    expect(harpoonTargets(s, t)).toEqual([big]);
    for (let i = 0; i < H.every - 1; i++) volley(s, t, 1);
    expect(events(s, 'harpoonHit')).toHaveLength(0);
    expect(big.hp).toBe(1e7);
    volley(s, t, 1);
    const hits = events(s, 'harpoonHit');
    expect(hits).toHaveLength(1);
    expect(hits[0].data).toMatchObject({ sourceId: t.id, targetId: big.id, boss: false });
    expect(1e7 - big.hp).toBeCloseTo(levelStats('spear', 10).damage * CONFIG.merges.spear.damageMult);
    expect(big.reelT).toBeGreaterThan(0);
    expect(near.reelT || 0).toBe(0);
  });

  it('a ground enemy is dragged back about 3 tiles, the opposite way it was walking, and held meanwhile', () => {
    const { s, t } = setup();
    const e = tough(s, 'grunt', 7.5, 6.5, { vx: 1, vy: 0 });
    expect(hook(s, t, e)).toBe(true);
    expect(e.held).toBeCloseTo(H.pullSeconds);
    reel(s, 1);
    expect(e.x).toBeCloseTo(7.5 - H.pull, 1);
    expect(e.y).toBeCloseTo(6.5);
    expect(e.reelT).toBe(0);
    // Standing still: away from the tower.
    const c = { x: t.col + t.size / 2, y: t.row + t.size / 2 };
    const still = tough(s, 'grunt', c.x - 4, c.y);
    hook(s, t, still);
    reel(s, 1);
    expect(still.x).toBeCloseTo(c.x - 4 - H.pull, 1);
  });

  it('walls stop the drag', () => {
    const { s, t } = setup();
    addBuilding(s, 'wall', 4, 6, 1);
    const e = tough(s, 'grunt', 6.5, 6.5, { vx: 1, vy: 0 });
    hook(s, t, e);
    reel(s, 1);
    expect(e.x).toBeGreaterThanOrEqual(5);
    expect(e.x).toBeLessThan(5.2);
    expect(e.reelT).toBe(0);
  });

  it('a flyer is dragged too (over walls)', () => {
    const { s, t } = setup();
    addBuilding(s, 'wall', 6, 7, 1);
    const e = tough(s, 'bomber', 6.5, 5.5, { vx: 0, vy: -2 });
    hook(s, t, e);
    reel(s, 1);
    expect(e.x).toBeCloseTo(6.5);
    expect(e.y).toBeCloseTo(5.5 + H.pull, 1);
  });

  it('bosses are only slowed, never dragged', () => {
    const { s, t } = setup();
    const car = tough(s, 'babycar', 6.5, 6.5, { vx: 1, vy: 0 });
    expect(hook(s, t, car)).toBe(false);
    reel(s, 1);
    expect([car.x, car.y]).toEqual([6.5, 6.5]);
    expect(car.held || 0).toBe(0);
    expect(car.slow).toBe(H.bossSlow);
    expect(car.slowTimer).toBe(H.bossSlowSeconds);
    expect(events(s, 'harpoonHit')[0].data.boss).toBe(true);
  });

  it('a harpoon ends a dashing Quandale Dingle\'s dash with no impact', () => {
    const { s, t } = setup();
    for (const b of s.buildings) b.hp = 1e9;
    const store = addBuilding(s, 'storage', 4, 4, 1); store.hp = 1e6;
    const q = tough(s, 'quandale', 5, 9, { targetId: store.id });
    for (let i = 0; i < 4 && !events(s, 'enemyDash').length; i++) stepEnemies(s, 0.05);
    expect(q.dashT).toBeGreaterThan(0);
    hook(s, t, q);
    expect(q.dashT).toBe(0);
    for (let i = 0; i < 8; i++) { stepEnemies(s, 0.05); stepHarpoons(s, 0.05); }
    expect(events(s, 'dashImpact')).toHaveLength(0);
    expect(store.hp).toBe(1e6);
  });

  it('Mastery: Longer Chain (+2 tiles), Dragnet (25% of the hit to enemies it\'s dragged through, once each), Double Hook', () => {
    const { s, t, cx, cy } = setup(3);
    const st = harpoonStats(t);
    expect(st).toMatchObject({ pull: H.pull + 2, dragShare: 0.25, hooks: 2 });
    // Longer Chain + Dragnet: dragged 5 tiles, through an enemy on the way.
    const e = tough(s, 'grunt', 9.5, 6.5, { vx: 1, vy: 0 });
    const inWay = tough(s, 'grunt', 7.5, 6.6);
    hook(s, t, e, 1000);
    reel(s, 1.5);
    expect(e.x).toBeCloseTo(9.5 - st.pull, 1);
    expect(1e7 - inWay.hp).toBeCloseTo(250);
    // Double Hook: the two toughest enemies in range are harpooned at once.
    s.enemies = [];
    const weak = tough(s, 'grunt', cx + 2.5, cy, { hp: 1e5, maxHp: 1e5 });
    const a = tough(s, 'grunt', cx, cy - 4), b = tough(s, 'grunt', cx - 4, cy, { hp: 5e6, maxHp: 5e6 });
    s.events.length = 0;
    t.harpoonCount = H.every - 1;
    volley(s, t, 1);
    expect(events(s, 'harpoonHit').map((h) => h.data.targetId).sort()).toEqual([a.id, b.id].sort());
    expect(weak.reelT || 0).toBe(0);
  });

  it('nothing harpoon-related is saved', () => {
    const { s, t, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 3, cy, { vx: 1, vy: 0 });
    t.harpoonCount = 2;
    hook(s, t, e, 500);
    const json = JSON.stringify(serializeGame(s));
    expect(json).not.toMatch(/reel|harpoon/i);
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
      ['ui_ability_ballista_bolt', 'ui_ability_barrel_burst', 'ui_ability_reel_in', 'ui_ability_rolling_thunder', 'ui_ability_shall_not_pass', 'ui_ability_shatter', 'ui_ability_sky_net', 'ui_ability_solar_lance', 'ui_ability_triple_strike', 'ui_ability_triple_zap']);
    expect(CONFIG.merges.wizard).toMatchObject({ name: 'Gandolf the Grand', ability: 'You Shall Not Pass' });
  });

  it('health is twice a max-level copy and damage per second about twice (two buildings\' worth)', () => {
    for (const t of MERGE_TYPES) {
      const m = CONFIG.merges[t];
      expect(m.hpMult).toBe(2);
      if (m.zap) continue; // the F.L.O.C.K Mothership: a support tower whose zaps are new (no damage to double)
      const dps = (m.triple ? m.triple.shells * m.triple.shellMult : m.damageMult) / (m.fireIntervalMult || 1);
      expect(dps).toBeGreaterThanOrEqual(1.99);
      expect(dps).toBeLessThanOrEqual(2.05);
    }
  });
});

describe('Diddy Trebuchet: Barrel Burst', () => {
  const B = CONFIG.merges.catapult.barrelBurst;
  const setup = (research = {}, mastery = 0) => {
    const s = village({ research });
    const [a, b] = pair(s, 'catapult');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { catapult: mastery }; syncMastery(s); }
    return { s, t: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };
  const barrel = () => levelStats('catapult', 5).damage * CONFIG.merges.catapult.damageMult;
  const poolDps = () => levelStats('catapult', 5).poolDps * CONFIG.merges.catapult.damageMult;
  // Fire one barrel at an enemy 10 tiles away (past the 6-tile blind spot) and let it land.
  const shootAt = (s, t, cx, cy) => { const e = tough(s, 'grunt', cx + 10, cy); volley(s, t, 2); return e; };

  it('two Level 5 Diddypults merge into the Diddy Trebuchet; a Level 4 one only shows the greyed Merge', () => {
    const s = village();
    const low = addBuilding(s, 'catapult', 5, 5, 4);
    expect(checkMerge(s, low)).toMatchObject({ show: false, preview: true, reason: 'Needs Level 5' });
    const [a, b] = pair(s, 'catapult');
    expect(checkMerge(s, a)).toMatchObject({ show: true });
    mergeBuildings(s, a.id, b.id);
    expect(a.merged).toBe(true);
    expect(displayName(a)).toBe('Diddy Trebuchet');
    expect(maxHp(a)).toBe(levelStats('catapult', 5).hp * 2);
  });

  it('a barrel bursts where it lands: 4 jugs 2 tiles out on the diagonals, landing 0.4 s later for 50% and a 1-tile pool each', () => {
    const { s, t, cx, cy } = setup();
    const target = shootAt(s, t, cx, cy);
    const [ix, iy] = [target.x, target.y];
    expect(1e7 - target.hp).toBeCloseTo(barrel());
    expect(events(s, 'barrelBurst')).toHaveLength(1);
    expect(s.jugs).toHaveLength(4);
    const d = B.distance / Math.SQRT2;
    const want = [[d, d], [-d, d], [-d, -d], [d, -d]].map(([dx, dy]) => [ix + dx, iy + dy]);
    for (const [wx, wy] of want) expect(s.jugs.some((j) => Math.hypot(j.x - wx, j.y - wy) < 1e-6)).toBe(true);
    const atJug = want.map(([x, y]) => tough(s, 'grunt', x, y));
    const pools = () => s.pools.filter((q) => q.kind === 'catapult');
    expect(pools()).toHaveLength(1);
    stepJugs(s, B.delay - 0.05);
    expect(s.jugs).toHaveLength(4);                       // not yet
    stepJugs(s, 0.06);
    expect(s.jugs).toHaveLength(0);
    for (const e of atJug) expect(1e7 - e.hp).toBeCloseTo(barrel() * B.mult);
    expect(pools()).toHaveLength(5);                      // the barrel's own + one per jug
    expect(pools().filter((q) => q.radius === B.poolRadius)).toHaveLength(4);
    expect(new Set(pools().map((q) => q.group)).size).toBe(1);
    expect(pools().every((q) => q.dps === poolDps())).toBe(true); // x2 like the impact
    expect(events(s, 'jugLanded')).toHaveLength(4);
  });

  it("an enemy standing in several of its pools takes one pool's damage per tick", () => {
    const { s, t, cx, cy } = setup();
    const target = shootAt(s, t, cx, cy);
    const [ix, iy] = [target.x, target.y];
    target.x += 40; // out of the way
    stepJugs(s, B.delay + 0.01);
    const both = tough(s, 'grunt', ix + 0.9, iy + 0.9); // in the barrel's pool and a jug's
    const one = tough(s, 'grunt', ix - 1.2, iy);        // in the barrel's pool only
    for (let i = 0; i < 20; i++) stepPools(s, 0.05);
    expect(1e7 - both.hp).toBeCloseTo(1e7 - one.hp);
    expect(1e7 - one.hp).toBeCloseTo(poolDps(), 0);
  });

  it('Mastery: More Jugs (6), Wide Spray (3 tiles, 1.25-tile pools), Tar Pit (its own pool slows 60% for 10 s)', () => {
    const { s, t, cx, cy } = setup({}, 3);
    expect(barrelStats(t)).toMatchObject({ jugs: 6, distance: 3, poolRadius: 1.25, tarSlow: 0.6, tarSeconds: 10 });
    const target = shootAt(s, t, cx, cy);
    expect(s.jugs).toHaveLength(6);
    for (const j of s.jugs) expect(Math.hypot(j.x - target.x, j.y - target.y)).toBeCloseTo(3);
    const main = s.pools.find((q) => q.kind === 'catapult');
    expect(main).toMatchObject({ slow: 0.6, duration: 10 });
    stepJugs(s, B.delay + 0.01);
    const jugPools = s.pools.filter((q) => q.kind === 'catapult' && q !== main);
    expect(jugPools).toHaveLength(6);
    expect(jugPools.every((q) => q.radius === 1.25 && q.duration === CONFIG.defenses.catapult.pool.duration && q.slow === CONFIG.defenses.catapult.pool.slow)).toBe(true);
    // 6 evenly spread jugs, the first on a diagonal
    expect(jugSpots(20, 20, 6, 3).map((p) => Math.round(Math.atan2(p.y - 20, p.x - 20) * 180 / Math.PI))).toEqual([45, 105, 165, -135, -75, -15]);
  });

  it('Boulder shots roll with no burst, and Hangover / Concussion come only from the barrel, never the jugs', () => {
    const boulder = setup({ catapult: ['b', 'b', 'b', 'b', 'b'] });
    boulder.t.shots = 3;                                 // the next shot is the 4th: a boulder
    shootAt(boulder.s, boulder.t, boulder.cx, boulder.cy);
    expect(events(boulder.s, 'barrelBurst')).toHaveLength(0);
    expect(boulder.s.jugs || []).toHaveLength(0);
    const { s, t, cx, cy } = setup({ catapult: ['c', 'c', 'c'] }); // Long Arm, Hangover, Concussion
    const target = shootAt(s, t, cx, cy);
    expect(target.wanderT).toBeGreaterThan(0);
    expect(target.held).toBeGreaterThan(0);
    const d = B.distance / Math.SQRT2;
    const atJug = tough(s, 'grunt', target.x + d, target.y + d);
    stepJugs(s, B.delay + 0.01);
    expect(1e7 - atJug.hp).toBeCloseTo(barrel() * B.mult);
    expect(atJug.wanderT || 0).toBe(0);
    expect(atJug.held || 0).toBe(0);
  });

  it('Big Jug doubles only the barrel; Splash Zone makes jugs landing in its pool hit harder', () => {
    const { s, t, cx, cy } = setup({ catapult: ['b', 'b', 'b'] }); // Splash Zone, Oil Moat, Big Jug
    t.shots = 2;                                         // the next shot is the 3rd: a big jug
    const target = shootAt(s, t, cx, cy);
    const main = s.pools.find((q) => q.kind === 'catapult');
    expect(main.radius).toBeCloseTo(CONFIG.defenses.catapult.pool.radius * 2);
    expect(s.jugs.every((j) => j.damage === barrel() * B.mult && j.pool.radius === B.poolRadius)).toBe(true);
    // A jug spot inside the big pool: that enemy is in a pool when its jug lands (Splash Zone: x2).
    const d = B.distance / Math.SQRT2;
    const inPool = tough(s, 'grunt', target.x + d, target.y + d);
    stepPools(s, 0.05);
    stepJugs(s, B.delay + 0.01);
    expect(1e7 - inPool.hp).toBeGreaterThanOrEqual(barrel() * B.mult * 2 - 1e-6);
  });

  it('runs in the simulation like any merged ability: barrels burst and jug pools land in a real step loop', () => {
    const { s, t, cx, cy } = setup();
    const e = tough(s, 'grunt', cx + 10, cy);
    e.speed = 0; e.held = 99; // stand still
    t.cooldown = 0;
    for (let i = 0; i < 60; i++) simulate(s, 0.05);   // 3 s: fire, 1.8 s lob, 0.4 s jugs
    expect(events(s, 'barrelBurst').length).toBeGreaterThanOrEqual(1);
    expect(events(s, 'jugLanded').length).toBeGreaterThanOrEqual(4);
    expect(s.pools.filter((q) => q.kind === 'catapult').length).toBeGreaterThanOrEqual(5);
    expect(serializeGame(s).jugs).toBeUndefined(); // jugs in the air aren't saved
  });
});

describe('Great Pyramid of Rah: Solar Lance', () => {
  const L = CONFIG.merges.ra.lance;
  const TICK = CONFIG.defenses.ra.tickInterval;
  const setup = (research = {}, mastery = 0) => {
    const s = village({ research });
    const [a, b] = pair(s, 'ra');
    mergeBuildings(s, a.id, b.id);
    fight(s);
    if (mastery) { s.mastery = { ra: mastery }; syncMastery(s); }
    return { s, t: a, cx: a.col + a.size / 2, cy: a.row + a.size / 2 };
  };
  const burn = (s, seconds, dt = 0.05) => { for (let i = 0; i < Math.round(seconds / dt); i++) stepBeams(s, dt); };
  const loss = (e, before) => before - e.hp;
  // The beam's target (toughest in range) 3 tiles out on +x; weaker enemies on the line (past it, and a flyer before
  // it), one 0.7 tiles off the line.
  const scene = (s, cx, cy) => ({
    target: tough(s, 'grunt', cx + 3, cy),
    onLine: tough(s, 'grunt', cx + 5.5, cy + 0.3, { hp: 1e6, maxHp: 1e6 }),
    flyer: tough(s, 'bomber', cx + 1.5, cy - 0.2, { hp: 1e6, maxHp: 1e6 }),
    offLine: tough(s, 'grunt', cx + 4.5, cy + 0.7, { hp: 1e6, maxHp: 1e6 })
  });

  it('two Level 8 Towers of Rah merge into the Great Pyramid of Rah; a Level 7 one only shows the greyed Merge', () => {
    const s = village();
    const low = addBuilding(s, 'ra', 5, 5, 7);
    expect(TOP('ra')).toBe(8);
    expect(checkMerge(s, low)).toMatchObject({ show: false, preview: true, reason: 'Needs Level 8' });
    const [a, b] = pair(s, 'ra');
    expect(checkMerge(s, a)).toMatchObject({ show: true, ok: true });
    mergeBuildings(s, a.id, b.id);
    expect(a.merged).toBe(true);
    expect(displayName(a)).toBe('Great Pyramid of Rah');
    expect(maxHp(a)).toBe(levelStats('ra', 8).hp * 2);
    expect(towerRange(a)).toBeCloseTo(CONFIG.defenses.ra.range + 0.5);
    expect(towerDamageMult(a)).toBeCloseTo(2); // the beam's dps x2
    // The merge window shows the beam's damage per second (it has no shots): 70/s -> 140/s.
    const pv = mergePreview(s, a, a);
    expect(pv.merged).toMatchObject({ perSecond: true });
    expect(pv.merged.damage).toBeCloseTo(levelStats('ra', 8).dps * 2);
  });

  it('no lance below top heat; at top heat enemies on the line (ground and air) take 50% of the beam tick, off the line nothing', () => {
    const { s, t, cx, cy } = setup();
    const e = scene(s, cx, cy);
    burn(s, 4.9);
    expect(t.beams[0].targetId).toBe(e.target.id);
    expect(t.beams[0].lance).toBeNull();
    expect(e.onLine.hp).toBe(1e6);
    expect(e.flyer.hp).toBe(1e6);
    burn(s, 0.5); // past 5 s: x8, the lance stage
    expect(t.beams[0].stage).toBe(L.stage);
    expect(t.beams[0].lance).toMatchObject({ x1: cx, y1: cy });
    expect(Math.hypot(t.beams[0].lance.x2 - cx, t.beams[0].lance.y2 - cy)).toBeCloseTo(towerRange(t)); // out to its range
    const before = [e.target.hp, e.onLine.hp, e.flyer.hp];
    burn(s, TICK * 5);
    const tick = loss(e.target, before[0]);
    expect(tick).toBeCloseTo(levelStats('ra', 8).dps * 2 * 8 * TICK * 5);
    expect(loss(e.onLine, before[1])).toBeCloseTo(tick * L.mult);
    expect(loss(e.flyer, before[2])).toBeCloseTo(tick * L.mult);
    expect(e.offLine.hp).toBe(1e6); // 0.7 tiles off the line: beyond halfWidth 0.5
    expect(events(s, 'enemyHit').some((ev) => ev.data.source === 'lance')).toBe(true);
  });

  it('the lance includes Hotter Peak (x10) and ends when the beam switches targets (it starts cold)', () => {
    const { s, t, cx, cy } = setup({ ra: ['c', 'c', 'c', 'c'] }); // Hot Start ... Hotter Peak
    const e = scene(s, cx, cy);
    burn(s, 3.5); // Hot Start: x3 at once, top heat 3 s later
    const before = [e.target.hp, e.onLine.hp];
    burn(s, TICK * 5);
    expect(loss(e.target, before[0])).toBeCloseTo(levelStats('ra', 8).dps * 2 * 10 * TICK * 5);
    expect(loss(e.onLine, before[1])).toBeCloseTo(loss(e.target, before[0]) * L.mult);
    damageEnemy(s, e.target, 1e9);
    burn(s, 0.05);
    expect(t.beams[0].targetId).not.toBe(e.target.id);
    expect(t.beams[0].lance).toBeNull(); // the new target starts back at x3 (Hot Start), below the lance stage
  });

  it('Prism: every beam at top heat lances on its own, and two lances crossing an enemy hit it once per tick', () => {
    const { s, t, cx, cy } = setup({ ra: ['b', 'b', 'b', 'b', 'b'] }); // ... Prism (3 beams)
    const t1 = tough(s, 'grunt', cx + 4, cy), t2 = tough(s, 'grunt', cx + 4, cy + 0.6), t3 = tough(s, 'grunt', cx - 4, cy);
    // On both of the first two lances, more than 2.5 tiles from every target (so no chain reaches it).
    const shared = tough(s, 'grunt', cx + 1, cy + 0.1, { hp: 1e6, maxHp: 1e6 });
    burn(s, 5.2);
    expect(t.beams).toHaveLength(3);
    expect(t.beams.every((bm) => bm.lance)).toBe(true);
    expect(t.beamChains).toHaveLength(0);
    const before = [t3.hp, shared.hp];
    burn(s, TICK * 10);
    expect(loss(shared, before[1])).toBeCloseTo(loss(t3, before[0]) * L.mult); // once per tick, not twice
    expect([t1, t2].every((x) => x.hp < 1e7)).toBe(true);
  });

  it('chained beams never lance', () => {
    const { s, t, cx, cy } = setup({ ra: ['b', 'b'] }); // Split Beam: 1 chain, 40%
    const target = tough(s, 'grunt', cx + 3, cy);
    const chained = tough(s, 'grunt', cx + 4.5, cy + 1.5, { hp: 1e6, maxHp: 1e6 });
    const behind = tough(s, 'grunt', cx + 5.4, cy + 2.4, { hp: 1e6, maxHp: 1e6 }); // past the chain, along it
    burn(s, 5.2);
    expect(t.beamChains).toEqual([{ from: target.id, to: chained.id, stage: 0 }]);
    const before = chained.hp;
    burn(s, TICK * 5);
    expect(loss(chained, before)).toBeCloseTo(levelStats('ra', 8).dps * 2 * 0.4 * TICK * 5); // its chain only
    expect(behind.hp).toBe(1e6);
  });

  it("lance kills never set off Supernova, Cauterize or Afterburn (only the beam's own target does)", () => {
    const { s, cx, cy } = setup({ ra: ['c', 'c', 'c', 'c', 'c'] }); // Hot Start, Afterburn, Cauterize, Hotter Peak, Supernova
    const target = tough(s, 'grunt', cx + 3, cy);
    burn(s, 3.2);
    const victim = addEnemy(s, 'grunt', cx + 5, cy, { hp: 50, maxHp: 50 });
    const near = tough(s, 'grunt', cx + 5, cy + 1.5, { hp: 1e6, maxHp: 1e6 }); // within Supernova's 2 tiles of the victim, off the lance
    burn(s, TICK * 2);
    expect(victim.alive).toBe(false);
    expect(near.hp).toBe(1e6);
    const novas = () => events(s, 'splash').filter((ev) => ev.data.kind === 'supernova');
    expect(novas()).toHaveLength(0);
    expect(events(s, 'cauterize')).toHaveLength(0);
    expect(victim.burnTimer || 0).toBe(0);
    expect(target.alive).toBe(true);
    // The beam's own target still sets them off.
    const bystander = tough(s, 'grunt', cx + 3, cy - 1.5, { hp: 1e6, maxHp: 1e6 }); // 1.5 tiles from the target, off the lance
    damageEnemy(s, target, target.hp - 1);
    burn(s, TICK * 2);
    expect(events(s, 'cauterize')).toHaveLength(1);
    expect(novas()).toHaveLength(1);
    expect(bystander.hp).toBeLessThan(1e6);
  });

  it('Mastery: Early Lance (from x3), Wide Lance (1 tile either side, 75%), Blinding Light (30% slow, bosses 15%)', () => {
    let { s, t, cx, cy } = setup({}, 1);
    expect(lanceStats(t)).toMatchObject({ stage: 1, halfWidth: L.halfWidth, mult: L.mult, slow: 0 });
    let e = scene(s, cx, cy);
    burn(s, 2.1); // x3
    expect(t.beams[0].lance).not.toBeNull();
    let before = [e.target.hp, e.onLine.hp];
    burn(s, TICK * 5);
    expect(loss(e.onLine, before[1])).toBeCloseTo(loss(e.target, before[0]) * L.mult);

    ({ s, t, cx, cy } = setup({}, 2));
    expect(lanceStats(t)).toMatchObject({ stage: 1, halfWidth: 1, mult: 0.75 });
    e = scene(s, cx, cy);
    burn(s, 2.1);
    before = [e.target.hp, e.offLine.hp];
    burn(s, TICK * 5);
    expect(loss(e.offLine, before[1])).toBeCloseTo(loss(e.target, before[0]) * 0.75); // 0.7 tiles off: inside 1 now

    ({ s, t, cx, cy } = setup({}, 3));
    expect(lanceStats(t).slow).toBe(0.3);
    e = scene(s, cx, cy);
    const boss = tough(s, 'babycar', cx + 6, cy, { hp: 1e6, maxHp: 1e6 });
    burn(s, 1.9);
    expect(e.onLine.slowTimer || 0).toBe(0); // not lancing yet
    burn(s, 0.2);
    expect(e.onLine.slow).toBeCloseTo(0.3);
    expect(e.target.slow).toBeCloseTo(0.3);
    expect(boss.slow).toBeCloseTo(0.15);
    expect(e.onLine.slowTimer).toBeLessThanOrEqual(L.slowLinger);
    expect(e.offLine.slow).toBeCloseTo(0.3); // 0.7 tiles off: inside Wide Lance's 1 tile
    const far = tough(s, 'grunt', cx + 4, cy + 2, { hp: 1e6, maxHp: 1e6 });
    burn(s, 0.05);
    expect(far.slowTimer || 0).toBe(0);
    expect(lanceLine(t, e.target)).toMatchObject({ x1: cx, y1: cy });
  });

  it('runs the same in the simulation as stepping the beams directly (simulate.js shares beams.js)', () => {
    const run = (step) => {
      const { s, cx, cy } = setup();
      const e = scene(s, cx, cy);
      for (const x of s.enemies) { x.speed = 0; x.held = 99; }
      for (let i = 0; i < 140; i++) step(s, 0.05); // 7 s: heats up, then lances
      return [e.target, e.onLine, e.flyer, e.offLine].map((x) => x.maxHp - x.hp);
    };
    const direct = run((s, dt) => stepBeams(s, dt));
    const sim = run((s, dt) => simulate(s, dt));
    expect(direct[1]).toBeGreaterThan(0);
    sim.forEach((v, i) => expect(v).toBeCloseTo(direct[i], 3));
  });
});
