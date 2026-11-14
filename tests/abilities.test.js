import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ABILITIES, ABILITY_COSTS } from '../src/abilityConfig.js';
import {
  mergeFx, abilityFx, pathTier, tierUnlocked, canResearchSomething, canResearchFor, checkResearch, labLevel, labTierCount, syncAbilityPicks, towerRange, towerFireInterval, towerMinRange, ABILITY_TYPES
} from '../src/logic/abilities.js';
import { DEFENSE_TYPES, checkUpgrade, maxLevel, limitFor, footprintDims, createBuilding, maxHp } from '../src/logic/buildings.js';
import { stepDefenses, stepProjectiles, stepPools, isValidTarget, fireDefense, applySplash } from '../src/logic/combat.js';
import { stepBeams } from '../src/logic/beams.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepTraps, springTrap } from '../src/logic/traps.js';
import { stepSpecials, stepStrikes } from '../src/logic/abilityEffects.js';
import { sellRefund } from '../src/logic/economy.js';
import { serializeGame, parseSave, validateSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = (vh = 10) => { const s = makeStateWithTownHall({ gold: 1e7 }, vh); s.wave.phase = 'active'; return s; };
/** Run the projectile loop until every shot has landed (or 5 s). */
const fly = (s) => { for (let i = 0; i < 100 && s.projectiles.length; i++) stepProjectiles(s, 0.05); };

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

describe('ability trees', () => {
  it('every defense has three paths (A, B, C) of five tiers, each with a name, text and effects', () => {
    expect(ABILITY_TYPES.sort()).toEqual([...DEFENSE_TYPES].sort());
    for (const type of ABILITY_TYPES) {
      for (const p of ['a', 'b', 'c']) {
        expect(ABILITIES[type][p].name).toBeTruthy();
        expect(ABILITIES[type][p].tiers).toHaveLength(5);
        for (const t of ABILITIES[type][p].tiers) {
          expect(t.name).toBeTruthy();
          expect(t.desc.length).toBeGreaterThan(5);
          expect(Object.keys(t.fx).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('merges tiers: Pct / Add keys add up, the rest keep the biggest value', () => {
    expect(mergeFx([{ damagePct: 15, pierce: 1 }, { damagePct: 25, pierce: 3 }, { pierce: 2, rangeAdd: 1 }]))
      .toEqual({ damagePct: 40, pierce: 3, rangeAdd: 1 });
  });

  it('mixing paths: A1 then B2 gives Powder Keg and Flak Burst, and nothing from A2 or B1', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    c.picks = ['a', 'b'];
    const fx = abilityFx(c);
    expect(fx.kegEvery).toBe(4);
    expect(fx.flakEvery).toBe(2);
    expect(fx.pierce).toBeUndefined();
    expect(fx.rampPct).toBeUndefined();
    expect(towerFireInterval(c)).toBe(CONFIG.defenses.cannon.fireInterval);
  });

  it('every tier works on its own, even without the tier before it on its path', () => {
    const s = attack();
    const w = addBuilding(s, 'wizard', 9, 16, 10);
    w.picks = ['a', 'a', 'b']; // Forked Lightning without Chain Lightning
    expect(abilityFx(w)).toMatchObject({ chainCount: 4, chainRange: 2, chainDamage: 0.6 });
    const r = addBuilding(s, 'ra', 12, 16, 8);
    r.picks = ['b', 'b', 'b', 'a']; // Ring of Fire without a Fire Ring tier
    expect(abilityFx(r)).toMatchObject({ ringRadius: 2, ringRamp: 0.1 });
  });
});

describe('RV Lab', () => {
  it('is a 2x2, 5-level building: 1 allowed from VH4, level N needs Village Hall N+3', () => {
    expect(footprintDims('rvlab')).toEqual({ w: 2, h: 2 });
    expect(maxLevel('rvlab')).toBe(5);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('rvlab', th))).toEqual([0, 0, 0, 1, 1, 1, 1, 1, 1, 1]);
    const s = makeStateWithTownHall({ gold: 1e6 }, 4);
    const lab = addBuilding(s, 'rvlab', 5, 5, 1);
    expect(checkUpgrade(s, lab).reason).toBe('Requires VH5');
    s.buildings[0].level = 5;
    expect(checkUpgrade(s, lab).ok).toBe(true);
  });

  it('research needs a standing RV Lab whose level covers the tier, and happens by day', () => {
    const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 1e6 }, 10);
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Build an RV Lab');
    const lab = addBuilding(s, 'rvlab', 5, 5, 1);
    expect(labLevel(s)).toBe(1);
    expect(checkResearch(s, 'cannon', 'a')).toMatchObject({ ok: true, tier: 1, cost: ABILITY_COSTS.research[0] });
    s.research = { cannon: ['a'] };
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Needs RV Lab level 2');
    lab.level = 2;
    expect(checkResearch(s, 'cannon', 'a').ok).toBe(true);
    s.wave.phase = 'active';
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Not during a wave');
    s.wave.phase = 'idle';
    lab.destroyed = true;
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Rebuild the RV Lab');
  });

  it('research costs research points, about twice the old research price', () => {
    expect(ABILITY_COSTS.research).toEqual([80, 240, 600, 1400, 3000]);
    const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 10 }, 10);
    addBuilding(s, 'rvlab', 5, 5, 1);
    expect(checkResearch(s, 'cannon', 'a').reason).toBe(`Need ${ABILITY_COSTS.research[0] - 10} more RP`);
    s.researchPoints = ABILITY_COSTS.research[0];
    expect(checkResearch(s, 'cannon', 'a').ok).toBe(true);
  });

  it('one pick per tier, any mix: taking A1 closes B1 and C1; tier 2 opens on every path', () => {
    const s = makeStateWithTownHall({ researchPoints: 1e6 }, 10);
    addBuilding(s, 'rvlab', 5, 5, 5);
    expect(checkResearch(s, 'cannon', 'b', 2).reason).toBe('Research tier 1 first');
    s.research = { cannon: ['a'] };
    expect(checkResearch(s, 'cannon', 'a', 1).reason).toBe('Already researched');
    expect(checkResearch(s, 'cannon', 'b', 1).reason).toBe('Took Path A');
    expect(checkResearch(s, 'cannon', 'c', 1).reason).toBe('Took Path A');
    for (const p of ['a', 'b', 'c']) {
      expect(tierUnlocked(s, 'cannon', p, 2)).toBe(true);
      expect(checkResearch(s, 'cannon', p)).toMatchObject({ ok: true, tier: 2 });
    }
    expect(tierUnlocked(s, 'cannon', 'a', 3)).toBe(false);
    s.research = { cannon: ['a', 'b', 'a', 'c', 'b'] };
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Fully researched');
    expect(labTierCount(s, 'cannon')).toBe(5);
  });

  it('the RV Lab book shows only when there is research to do that you can afford', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 10);
    expect(canResearchSomething(s)).toBe(false);          // no lab
    addBuilding(s, 'rvlab', 5, 5, 1);
    expect(canResearchSomething(s)).toBe(false);          // can't afford anything
    s.researchPoints = ABILITY_COSTS.research[0];
    expect(canResearchSomething(s)).toBe(true);
    expect(canResearchFor(s, 'cannon')).toBe(true);
    s.wave.phase = 'active';
    expect(canResearchSomething(s)).toBe(false);          // not during a wave
  });

  it('a pick goes onto every building of that type whose level is high enough; lower ones get it on upgrade', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    gs.labGuideStep = 99; // (no free first research from the RV Lab guide here)
    gs.buildings.push(createBuilding(gs, 'rvlab', 12, 24, 5), createBuilding(gs, 'storage', 5, 22, 10), createBuilding(gs, 'storage', 8, 22, 10));
    const c1 = createBuilding(gs, 'cannon', 9, 16, 4);
    const c2 = createBuilding(gs, 'cannon', 12, 20, 2);
    const c3 = createBuilding(gs, 'cannon', 15, 20, 1);
    gs.buildings.push(c1, c2, c3);
    gs.gold = 100000;
    gs.researchPoints = 10000;
    const gold0 = gs.gold, rp0 = gs.researchPoints;
    const applied = [];
    gs.on('abilitiesApplied', (d) => applied.push(d.ids));
    expect(gs.researchAbility('cannon', 'a').ok).toBe(true);   // A1
    expect(gs.researchAbility('cannon', 'b').ok).toBe(true);   // B2
    expect(c1.picks).toEqual(['a', 'b']);                       // level 4: tiers 1-2
    expect(c2.picks).toEqual(['a']);                            // level 2: tier 1
    expect(c3.picks).toEqual([]);                               // level 1: none yet
    expect(applied[0].sort()).toEqual([c1.id, c2.id].sort());
    expect(applied[1]).toEqual([c1.id]);
    // Research is the only price: RP, once. No gold.
    expect(rp0 - gs.researchPoints).toBe(ABILITY_COSTS.research[0] + ABILITY_COSTS.research[1]);
    expect(gs.gold).toBe(gold0);
    // Upgrading the level 1 cannon to 2 brings it tier 1.
    expect(gs.upgradeBuilding(c3.id).ok).toBe(true);
    expect(c3.picks).toEqual(['a']);
    // A new cannon at level 1 has none; one placed by createBuilding at level 4 has tiers 1-2.
    expect(createBuilding(gs, 'cannon', 2, 2, 4).picks).toEqual(['a', 'b']);
    // Selling refunds gold for levels only.
    expect(sellRefund(c1)).toBe(Math.round((150 + 300 + 600 + 1200) * CONFIG.rules.sellRefund));
    // Other types aren't touched.
    expect(abilityFx(gs.buildings.find((b) => b.type === 'storage'))).toEqual({});
  });

  it('health tiers keep the same share of health when a pick applies', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    gs.labGuideStep = 99;
    gs.buildings.push(createBuilding(gs, 'rvlab', 12, 24, 5));
    const c = createBuilding(gs, 'cannon', 9, 16, 4);
    gs.buildings.push(c);
    c.hp = Math.round(c.hp / 2);
    gs.researchPoints = 1e6;
    const before = c.hp;
    expect(gs.researchAbility('cannon', 'c').ok).toBe(true); // Thick Walls: more health
    expect(c.hp).toBeGreaterThan(before);
    expect(c.hp / maxHp(c)).toBeCloseTo(0.5, 2);
    expect(syncAbilityPicks(gs)).toEqual([]); // already in sync
  });

  it('saves keep the picks per type; buildings get theirs back on load', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    gs.labGuideStep = 99;
    gs.buildings.push(createBuilding(gs, 'rvlab', 12, 24, 5));
    const c = createBuilding(gs, 'cannon', 9, 16, 6);
    gs.buildings.push(c);
    gs.researchPoints = 1e6;
    for (const p of ['a', 'c', 'a']) gs.researchAbility('cannon', p);
    const saved = serializeGame(gs);
    expect(saved.research).toEqual({ cannon: 'aca' });
    expect(saved.buildings.find((b) => b.id === c.id).picks).toBeUndefined();
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const gs2 = new GameState({ storage: memoryStorage() });
    gs2.loadFromSave(parsed.data);
    expect(gs2.research).toEqual({ cannon: ['a', 'c', 'a'] });
    expect(gs2.getBuilding(c.id).picks).toEqual(['a', 'c', 'a']);
    for (const bad of [{ cannon: 'abd' }, { cannon: 'aaaaaa' }, { cannon: '' }, { townHall: 'a' }, { cannon: ['a'] }]) {
      expect(validateSave({ ...saved, research: bad })).toBe(false);
    }
  });

  it('version 4 saves: each tier keeps the option most buildings bought; the rest of the research is refunded', () => {
    const s = makeStateWithTownHall({ gold: 100, tutorialDone: true, tutorialStep: 11, researchPoints: 5 }, 10);
    addBuilding(s, 'rvlab', 12, 24, 5);
    addBuilding(s, 'cannon', 9, 16, 10);
    addBuilding(s, 'cannon', 12, 20, 10);
    addBuilding(s, 'cannon', 15, 20, 10);
    addBuilding(s, 'archer', 5, 22, 10);
    const old = { ...serializeGame(s), version: 4, labGuide: 5 };
    // Old research: cannon A1 A2 B1 B2 C1 researched; archer [A count, B count] = [2, 0].
    old.research = { cannon: { a: [1, 2], b: [1, 2], c: [1] }, archer: [2, 0] };
    const cannons = old.buildings.filter((b) => b.type === 'cannon');
    cannons[0].picks = 'ab'; cannons[1].picks = 'bb'; cannons[2].picks = 'b';
    old.buildings.find((b) => b.type === 'archer').paths = [1, 0];
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.status).toBe('ok');
    expect(parsed.data.research).toEqual({ cannon: 'bb', archer: 'aa' });
    // Refunded at the old prices: A1, A2 and C1 for the cannon.
    expect(parsed.data.researchPoints).toBe(5 + 40 + 120 + 40);
    expect(parsed.data.labGuide).toBe(99); // past the removed "buy" steps: finished
    expect(parsed.data.buildings.every((b) => b.picks === undefined && b.paths === undefined)).toBe(true);
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(parsed.data);
    expect(gs.buildings.filter((b) => b.type === 'cannon').map((b) => b.picks.join(''))).toEqual(['bb', 'bb', 'bb']);
  });

  it('old saves with no research still load', () => {
    const s = makeStateWithTownHall({ gold: 100, tutorialDone: true, tutorialStep: 11 }, 3);
    addBuilding(s, 'cannon', 9, 16, 2);
    const obj = serializeGame(s);
    delete obj.research;
    expect(validateSave(obj)).toBe(true);
    const gs = new GameState({ storage: memoryStorage() });
    gs.loadFromSave(parseSave(JSON.stringify(obj)).data);
    expect(gs.buildings.find((b) => b.type === 'cannon').picks).toEqual([]);
  });
});

describe('ability effects in a fight', () => {
  it('Cannon Piercing Shot / Battering Ram: punches through to the enemy behind and knocks it back', () => {
    const s = attack();
    const c = addBuilding(s, 'cannon', 9, 16, 10); // center (10, 17)
    c.picks = ['a', 'a', 'a'];
    const front = addEnemy(s, 'grunt', 13, 17, { hp: 5000, maxHp: 5000 });
    const back = addEnemy(s, 'grunt', 14.5, 17, { hp: 5000, maxHp: 5000 });
    fireDefense(s, c, front);
    fly(s);
    expect(front.hp).toBeLessThan(5000);
    expect(back.hp).toBeLessThan(5000);
    expect(back.x).toBeGreaterThan(14.5); // shoved away from the cannon
  });

  it('Locklair Double Arrow shoots two enemies at once; Keen Sight sees invisible goblins', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = ['a', 'a'];
    addEnemy(s, 'grunt', 12, 17);
    addEnemy(s, 'grunt', 12, 18.5);
    stepDefenses(s, 0.05);
    expect(s.projectiles).toHaveLength(2);
    expect(new Set(s.projectiles.map((p) => p.targetId)).size).toBe(2);
    const ghost = addEnemy(s, 'thief', 11, 17, { hidden: true });
    expect(isValidTarget(a, ghost)).toBe(false);
    a.picks = ['a', 'b']; // Keen Sight
    expect(isValidTarget(a, ghost)).toBe(true);
  });

  it('Mortar Barrage fires 3 shells; Close Support shrinks the blind spot', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = ['a', 'a', 'a', 'a', 'b'];
    expect(towerMinRange(m)).toBe(1.5);
    addEnemy(s, 'tank', 16, 17, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 20; i++) stepDefenses(s, 0.05);
    expect(s.projectiles.length).toBe(3);
  });

  it('Gandolf Chain Lightning arcs to enemies outside the fireball splash', () => {
    const s = attack();
    const w = addBuilding(s, 'wizard', 9, 16, 10);
    w.picks = ['a', 'b'];
    const target = addEnemy(s, 'grunt', 12, 17, { hp: 5000, maxHp: 5000 });
    const next = addEnemy(s, 'grunt', 13.6, 17, { hp: 5000, maxHp: 5000 }); // 1.6 from the target: outside splash 1
    fireDefense(s, w, target);
    fly(s);
    expect(next.hp).toBeLessThan(5000);
    expect(s.events.some((e) => e.name === 'chainLightning')).toBe(true);
  });

  it('Firework Ground Show hits ground enemies for half damage', () => {
    const s = attack();
    const f = addBuilding(s, 'firework', 9, 16, 10);
    const g = addEnemy(s, 'grunt', 12, 17, { hp: 5000, maxHp: 5000 });
    expect(isValidTarget(f, g)).toBe(false);
    f.picks = ['a', 'b'];
    expect(isValidTarget(f, g)).toBe(true);
    const p = fireDefense(s, f, g);
    fly(s);
    expect(5000 - g.hp).toBeCloseTo(p.damage * 0.5, 6);
  });

  it('Mousetrap Spring Back re-arms after 10 s; Glue Pot leaves a slowing patch; Gum Up defuses Wall Breakers', () => {
    const s = attack();
    const t = addBuilding(s, 'mousetrap', 9, 16, 10);
    t.picks = ['b', 'b', 'a']; // Glue Pot, Gum Up, Spring Back
    const e = addEnemy(s, 'tank', 9.5, 16.5, { hp: 1e6, maxHp: 1e6 });
    const breaker = addEnemy(s, 'breaker', 9.8, 16.6, { hp: 90, maxHp: 90 });
    stepTraps(s, 0.05);
    expect(t.sprung).toBe(true);
    expect(s.pools.some((p) => p.kind === 'glue' && p.slow === 0.4)).toBe(true);
    expect(breaker.alive).toBe(false);
    expect(s.events.some((ev) => ev.name === 'enemyExploded')).toBe(false); // fell apart, no blast
    e.alive = false; // (off the trap, so it doesn't snap again the moment it re-arms)
    for (let i = 0; i < 205; i++) stepTraps(s, 0.05);
    expect(t.sprung).toBe(false);
    springTrap(s, t);
    for (let i = 0; i < 205; i++) stepTraps(s, 0.05);
    expect(t.sprung).toBe(true); // only one re-arm per wave at tier 3
  });

  it('F.L.O.C.K Commander speeds up defenses in range; Exposer raises the mark bonus', () => {
    const s = attack();
    const f = addBuilding(s, 'flock', 12, 16, 10);
    const c = addBuilding(s, 'cannon', 9, 16, 10);
    const base = towerFireInterval(c);
    f.picks = ['a', 'a', 'a', 'b']; // Sharper Lenses ... then Double Time (+10% fire rate)
    const e = addEnemy(s, 'grunt', 12.5, 17);
    stepFlockTowers(s);
    expect(towerFireInterval(c)).toBeCloseTo(base / 1.1, 6);
    expect(e.markBonus).toBeCloseTo(CONFIG.defenses.flock.levels[9].markBonus / 100 + 0.05, 6);
  });

  it('Diddypult Toxic pools last longer and spread wider', () => {
    const s = attack();
    const cat = addBuilding(s, 'catapult', 3, 3, 6);
    cat.picks = ['a', 'a'];
    const e = addEnemy(s, 'grunt', 3 + 1 + 10, 4, { hp: 1e6, maxHp: 1e6 });
    const p = fireDefense(s, cat, e);
    expect(p.pool.duration).toBe(CONFIG.defenses.catapult.pool.duration + 1);
    expect(p.pool.radius).toBe(CONFIG.defenses.catapult.pool.radius + 0.5);
  });

  it('Tower of Rah Fire Ring burns enemies near the tower; Prism runs three beams', () => {
    const s = attack();
    const t = addBuilding(s, 'ra', 9, 16, 8); // center (10, 17)
    t.picks = ['a', 'a', 'a', 'a', 'b']; // Fire Ring ... then Prism
    const near = addEnemy(s, 'grunt', 11, 17, { hp: 1e6, maxHp: 1e6 });
    addEnemy(s, 'grunt', 13, 17, { hp: 2e6, maxHp: 2e6 });
    addEnemy(s, 'grunt', 13, 19, { hp: 3e6, maxHp: 3e6 });
    addEnemy(s, 'grunt', 14, 17, { hp: 4e6, maxHp: 4e6 });
    for (let i = 0; i < 20; i++) stepBeams(s, 0.05);
    expect(t.beams).toHaveLength(3);
    expect(t.beams.map((b) => b.targetId)).not.toContain(near.id); // beams go for the toughest
    expect(near.hp).toBeLessThan(1e6);                                // the ring got it
  });

  it('Locklair Volley Lock fires an arrow at every enemy in range at once', () => {
    const s = attack();
    const a = addBuilding(s, 'archer', 9, 16, 10);
    a.picks = ['a', 'a', 'a', 'a', 'a'];
    for (const dy of [0, 1, 2, -1]) addEnemy(s, 'grunt', 13, 17 + dy, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 170; i++) stepSpecials(s, 0.05);
    expect(s.projectiles.length).toBe(4);
    expect(new Set(s.projectiles.map((p) => p.targetId)).size).toBe(4);
  });

  it('splash keeps working the old way for towers with no tiers', () => {
    const s = attack();
    const e = addEnemy(s, 'grunt', 10, 10, { hp: 100, maxHp: 100 });
    applySplash(s, 10, 10, 1, 40, true, true);
    expect(e.hp).toBe(60);
    stepPools(s, 0.1);
  });
});
