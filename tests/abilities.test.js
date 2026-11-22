import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ABILITIES, ABILITY_COSTS } from '../src/abilityConfig.js';
import {
  mergeFx, abilityFx, tierUnlocked, canResearchSomething, canResearchFor, checkResearch, checkRespec, respecCost, lockedPath, labPicks, labLevel, labTierCount, syncAbilityPicks, towerFireInterval, towerMinRange, ABILITY_TYPES, DEFENSE_ABILITY_TYPES, ECONOMY_ABILITY_TYPES
} from '../src/logic/abilities.js';
import { DEFENSE_TYPES, checkUpgrade, maxLevel, limitFor, footprintDims, createBuilding, maxHp } from '../src/logic/buildings.js';
import { stepDefenses, stepProjectiles, stepPools, isValidTarget, fireDefense, applySplash } from '../src/logic/combat.js';
import { stepBeams } from '../src/logic/beams.js';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepTraps, springTrap } from '../src/logic/traps.js';
import { stepSpecials } from '../src/logic/abilityEffects.js';
import { serializeGame, parseSave, validateSave, SAVE_VERSION } from '../src/logic/save.js';
import { rpCap, addResearchPoints } from '../src/logic/researchPoints.js';
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
  it('every defense and economy building has three paths (A, B, C) of five tiers, each with a name, text and effects', () => {
    expect([...DEFENSE_ABILITY_TYPES].sort()).toEqual([...DEFENSE_TYPES, 'altar', 'queenAltar'].sort()); // (+ the heroes' altars)
    expect([...ECONOMY_ABILITY_TYPES].sort()).toEqual(['dj', 'fuelStation', 'house', 'mine', 'storage']);
    expect([...ABILITY_TYPES].sort()).toEqual([...DEFENSE_ABILITY_TYPES, ...ECONOMY_ABILITY_TYPES].sort());
    // Every tier name is unique across the whole game (no repeats).
    const names = ABILITY_TYPES.flatMap((t) => ['a', 'b', 'c'].flatMap((p) => ABILITIES[t][p].tiers.map((x) => x.name)));
    expect(new Set(names).size).toBe(names.length);
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
    const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 1e6 }, 4);
    const lab = addBuilding(s, 'rvlab', 5, 5, 1);
    expect(checkUpgrade(s, lab).reason).toBe('Requires VH5');
    s.buildings[0].level = 5;
    expect(checkUpgrade(s, lab)).toMatchObject({ ok: true, currency: 'rp', cost: CONFIG.rvlab.levels[1].cost });
  });

  it('costCurrency: "rp" levels are paid in RP, not gold', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    const lab = createBuilding(gs, 'rvlab', 12, 24, 1);
    gs.buildings.push(lab);
    gs.gold = 50000; gs.researchPoints = 100;
    const cost = CONFIG.rvlab.levels[1].cost;
    expect(checkUpgrade(gs, lab)).toMatchObject({ ok: false, currency: 'rp', reason: `Need ${cost - 100} more Burgers` });
    gs.researchPoints = cost + 7;
    expect(gs.upgradeBuilding(lab.id).ok).toBe(true);
    expect(lab.level).toBe(2);
    expect(gs.researchPoints).toBe(7);
    expect(gs.gold).toBe(50000);
    expect(checkUpgrade(gs, createBuilding(gs, 'cannon', 2, 2, 1)).currency).toBe('gold');
  });

  it('RP is capped by RV Lab level: extra RP is lost and reported', () => {
    const s = makeStateWithTownHall({ researchPoints: 0 }, 10);
    const caps = CONFIG.rules.rpCaps;
    expect(rpCap(s)).toBe(caps[0]);
    const lost = [];
    s.events = s.events || {};
    s.emit = (name, d) => { if (name === 'researchPointsChanged') lost.push(d.lost); };
    expect(addResearchPoints(s, caps[0] + 50)).toBe(caps[0]);
    expect(s.researchPoints).toBe(caps[0]);
    expect(lost.at(-1)).toBe(50);
    expect(addResearchPoints(s, 10)).toBe(0);
    addBuilding(s, 'rvlab', 5, 5, 3);
    expect(rpCap(s)).toBe(caps[3]);
    expect(addResearchPoints(s, 10)).toBe(10);
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
    expect(checkResearch(s, 'cannon', 'a').reason).toBe(`Need ${ABILITY_COSTS.research[0] - 10} more Burgers`);
    s.researchPoints = ABILITY_COSTS.research[0];
    expect(checkResearch(s, 'cannon', 'a').ok).toBe(true);
  });

  it('path lock: the first pick commits the type to that path; only its tiers open after', () => {
    const s = makeStateWithTownHall({ researchPoints: 1e6 }, 10);
    addBuilding(s, 'rvlab', 5, 5, 5);
    expect(checkResearch(s, 'cannon', 'b', 2).reason).toBe('Research tier 1 first');
    expect(lockedPath(s, 'cannon')).toBe(null);
    s.research = { cannon: ['a'] };
    expect(lockedPath(s, 'cannon')).toBe('a');
    expect(checkResearch(s, 'cannon', 'a', 1).reason).toBe('Already researched');
    expect(checkResearch(s, 'cannon', 'b', 1).reason).toBe('Took Path A');
    expect(checkResearch(s, 'cannon', 'b')).toMatchObject({ ok: false, reason: 'Locked to Path A', tier: 2 });
    expect(checkResearch(s, 'cannon', 'c').reason).toBe('Locked to Path A');
    expect(tierUnlocked(s, 'cannon', 'b', 2)).toBe(false);
    expect(tierUnlocked(s, 'cannon', 'a', 2)).toBe(true);
    expect(checkResearch(s, 'cannon', 'a')).toMatchObject({ ok: true, tier: 2 });
    expect(tierUnlocked(s, 'cannon', 'a', 3)).toBe(false);
    s.research = { cannon: ['a', 'a', 'a', 'a', 'a'] };
    expect(checkResearch(s, 'cannon', 'a').reason).toBe('Fully researched');
    expect(labTierCount(s, 'cannon')).toBe(5);
    // Other types are free to pick any path.
    expect(checkResearch(s, 'archer', 'c')).toMatchObject({ ok: true, tier: 1 });
  });

  it('paid respec clears a type\'s path for RP with no refund of the old picks', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    gs.labGuideStep = 99;
    gs.buildings.push(createBuilding(gs, 'rvlab', 12, 24, 5));
    const c = createBuilding(gs, 'cannon', 9, 16, 1);
    gs.buildings.push(c);
    gs.researchPoints = 1000;
    expect(checkRespec(gs, 'cannon')).toMatchObject({ ok: false, reason: 'Nothing to reset' });
    gs.researchAbility('cannon', 'a'); gs.researchAbility('cannon', 'a');
    const cost = Math.round((ABILITY_COSTS.research[0] + ABILITY_COSTS.research[1]) * CONFIG.rules.respecShare);
    expect(respecCost(gs, 'cannon')).toBe(cost);
    gs.researchPoints = cost - 1;
    expect(gs.respecPath('cannon').ok).toBe(false);
    gs.researchPoints = cost + 5;
    expect(gs.respecPath('cannon').ok).toBe(true);
    expect(gs.researchPoints).toBe(5);                 // paid, nothing back
    expect(labPicks(gs, 'cannon')).toEqual([]);
    expect(c.picks).toEqual([]);
    gs.researchPoints = 1000;
    expect(gs.researchAbility('cannon', 'c').ok).toBe(true); // free to take another path now
    expect(c.picks).toEqual(['c']);
    gs.wave.phase = 'active';
    expect(checkRespec(gs, 'cannon').reason).toBe('Not during a wave');
  });

  it('perks ignore the building level: a level 1 building has every researched tier', () => {
    const gs = new GameState({ storage: memoryStorage() });
    gs.startNew();
    gs.buildings[0].level = 10;
    gs.tutorialDone = true;
    gs.labGuideStep = 99;
    gs.buildings.push(createBuilding(gs, 'rvlab', 12, 24, 5));
    const c = createBuilding(gs, 'cannon', 9, 16, 1);
    gs.buildings.push(c);
    gs.researchPoints = 1e6;
    for (let i = 0; i < 3; i++) gs.researchAbility('cannon', 'b');
    expect(c.picks).toEqual(['b', 'b', 'b']);
    expect(createBuilding(gs, 'cannon', 2, 2, 1).picks).toEqual(['b', 'b', 'b']);
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

  it('a pick goes onto every building of that type at once, whatever its level', () => {
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
    expect(gs.researchAbility('cannon', 'b').ok).toBe(false);  // locked to Path A
    expect(gs.researchAbility('cannon', 'a').ok).toBe(true);   // A2
    for (const c of [c1, c2, c3]) expect(c.picks).toEqual(['a', 'a']); // every level has both tiers
    expect(applied[0].sort()).toEqual([c1.id, c2.id, c3.id].sort());
    expect(applied[1].sort()).toEqual([c1.id, c2.id, c3.id].sort());
    // Research is the only price: RP, once. No gold.
    expect(rp0 - gs.researchPoints).toBe(ABILITY_COSTS.research[0] + ABILITY_COSTS.research[1]);
    expect(gs.gold).toBe(gold0);
    // A new cannon has them too.
    expect(createBuilding(gs, 'cannon', 2, 2, 1).picks).toEqual(['a', 'a']);
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
    for (const p of ['c', 'c', 'c']) gs.researchAbility('cannon', p);
    const saved = serializeGame(gs);
    expect(saved.research).toEqual({ cannon: 'ccc' });
    expect(saved.buildings.find((b) => b.id === c.id).picks).toBeUndefined();
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const gs2 = new GameState({ storage: memoryStorage() });
    gs2.loadFromSave(parsed.data);
    expect(gs2.research).toEqual({ cannon: ['c', 'c', 'c'] });
    expect(gs2.getBuilding(c.id).picks).toEqual(['c', 'c', 'c']);
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

  it('version 5 saves: mixed paths keep the path with the most picks, the extra RP is refunded; Diddypult level clamps to 5', () => {
    const s = makeStateWithTownHall({ gold: 100, tutorialDone: true, tutorialStep: 11, researchPoints: 5 }, 10);
    addBuilding(s, 'cannon', 9, 16, 10);
    addBuilding(s, 'catapult', 12, 20, 5);
    const old = { ...serializeGame(s), version: 5 };
    old.research = { cannon: 'aba', archer: 'bc', wizard: 'cc' };   // cannon: A wins (2 picks); archer: tie, first (B) wins
    old.buildings.find((b) => b.type === 'catapult').level = 6;
    const parsed = parseSave(JSON.stringify(old));
    expect(parsed.status).toBe('ok');
    expect(parsed.data.version).toBe(SAVE_VERSION);
    expect(parsed.data.research).toEqual({ cannon: 'aa', archer: 'b', wizard: 'cc' });
    const r = ABILITY_COSTS.research;
    // cannon paid r1+r2+r3, keeps tiers 1-2 (r1+r2): refund r3. archer paid r1+r2, keeps tier 1: refund r2.
    expect(parsed.data.researchPoints).toBe(5 + r[2] + r[1]);
    expect(parsed.data.buildings.find((b) => b.type === 'catapult').level).toBe(5);
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

  it('Locklair Double Arrow shoots two enemies at once; Keen Sight sees an invisible Mr. Least', () => {
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

  it('Mortar Barrage fires 2 shells; Close Support shrinks the blind spot', () => {
    const s = attack();
    const m = addBuilding(s, 'mortar', 9, 16, 10);
    m.picks = ['a', 'a', 'a', 'a', 'b'];
    expect(towerMinRange(m)).toBe(1.5);
    addEnemy(s, 'tank', 16, 17, { hp: 1e6, maxHp: 1e6 });
    for (let i = 0; i < 20; i++) stepDefenses(s, 0.05);
    expect(s.projectiles.length).toBe(2); // v0.5 rebalance (was 3)
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
    const cat = addBuilding(s, 'catapult', 3, 3, 5);
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
