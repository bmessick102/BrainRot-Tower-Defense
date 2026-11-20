import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { checkBuy, checkUpgrade, limitFor, unlockTownHall, maxLevel, levelStats, createBuilding } from '../src/logic/buildings.js';
import {
  SPELL_KINDS, spellSlots, checkBrew, brewSpell, discardSpell, brewCost, checkCast, castSpell, stepSpells, spellStats,
  spellUnlocked, validSpells, serializeSpells, deserializeSpells, spellSummary, spellName, spellEffect, spellFullName, spellSubtext
} from '../src/logic/spells.js';
import { towerFireInterval, towerDamageMult, ABILITIES } from '../src/logic/abilities.js';
import { pickTarget, ensureTarget, stepEnemy } from '../src/logic/enemies.js';
import { damageBuilding } from '../src/logic/combat.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';
import { artTier } from '../src/objects/BuildingView.js';
import { hotbarSlots } from '../src/logic/hotbar.js';

const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

/** A Village Hall `vh` village with a Fuel Station at `level`, RP to spend, and a wave on when `wave`. */
function village({ vh = 10, level = 8, rp = 5000, wave = false } = {}) {
  const s = makeStateWithTownHall({ gold: 1e6, researchPoints: rp, tutorialDone: true }, vh);
  const fs = addBuilding(s, 'fuelStation', 10, 10, level);
  if (wave) s.wave.phase = 'active';
  return { s, fs };
}
const withPicks = (s, fs, path, n) => { s.research = { fuelStation: Array(n).fill(path) }; fs.picks = Array(n).fill(path); };

describe('Fuel Station (building)', () => {
  it('is a cheap economy building from Village Hall 2, limit 1, 8 levels (a picture per 2) gated VH2 -> VH10', () => {
    expect(unlockTownHall('fuelStation')).toBe(2);
    expect(unlockTownHall('fuelStation')).toBeLessThan(unlockTownHall('catapult'));
    expect([1, 2, 10].map((th) => limitFor('fuelStation', th))).toEqual([0, 1, 1]);
    expect(levelStats('fuelStation', 1).cost).toBeLessThanOrEqual(500);
    expect(CONFIG.fuelStation.levels.slice(1).every((l) => l.costCurrency === 'rp')).toBe(true);
    expect(levelStats('fuelStation', 2).cost).toBeLessThanOrEqual(CONFIG.rules.rpCaps[0]); // payable before an RV Lab
    expect(maxLevel('fuelStation')).toBe(8);
    expect([1, 2, 3, 8].map((l) => artTier(l, 'fuelStation'))).toEqual([1, 1, 2, 4]);
    expect(CONFIG.fuelStation.levels.map((l) => l.townHall)).toEqual([2, 3, 4, 5, 6, 7, 8, 10]);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 1), 'fuelStation').ok).toBe(false);
    expect(checkBuy(makeStateWithTownHall({ gold: 1e6 }, 2), 'fuelStation').ok).toBe(true);
  });

  it('level 1 costs gold; its upgrades cost RP', () => {
    expect(levelStats('fuelStation', 1).costCurrency).toBeUndefined();
    const { s, fs } = village({ vh: 7, level: 1, rp: 10000 });
    const up = checkUpgrade(s, fs);
    expect(up).toMatchObject({ ok: true, currency: 'rp', cost: CONFIG.fuelStation.levels[1].cost });
    const gs = new GameState({ storage: noStorage });
    gs.startNew();
    gs.buildings[0].level = 7;
    gs.researchPoints = 2000;
    const st = createBuilding(gs, 'fuelStation', 10, 10, 1);
    gs.buildings.push(st);
    expect(gs.upgradeBuilding(st.id).ok).toBe(true);
    expect(st.level).toBe(2);
    expect(gs.researchPoints).toBe(2000 - CONFIG.fuelStation.levels[1].cost);
  });

  it('has a perk tree in the RV Lab (economy tab): 3 paths x 5 tiers', () => {
    expect(Object.keys(ABILITIES.fuelStation)).toEqual(['a', 'b', 'c']);
    for (const p of ['a', 'b', 'c']) expect(ABILITIES.fuelStation[p].tiers).toHaveLength(5);
  });
});

describe('spell names (items, with their effect under the name)', () => {
  it('each spell is named after its item; ids stay the same; the hotbar shows the item and "Effect: what it does"', () => {
    const names = Object.fromEntries(SPELL_KINDS.map((k) => [k, [spellName(k), spellEffect(k)]]));
    expect(names).toEqual({
      rage: ['Karuba Coffee', 'Rage'], heal: ['Donut', 'Heal'], freeze: ['Ice Bag', 'Freeze'],
      heat: ['Spicy Tornado', 'Heat Field'], invisibility: ['Chocolate Milk', 'Invisibility'], lightning: ['Energy Drink', 'Lightning Strike']
    });
    expect(spellFullName('rage')).toBe('Karuba Coffee (Rage)');
    const { s } = village();
    expect(spellSubtext(s, 'rage')).toMatch(/^Rage: defenses in a /);
    expect(brewSpell(s, 'rage').ok).toBe(true);
    s.wave.phase = 'active';
    const slot = hotbarSlots(s).find((x) => x.kind === 'rage');
    expect(slot.name).toBe('Karuba Coffee');
    expect(slot.desc).toMatch(/^Rage: /);
  });
});

describe('spell slots and brewing', () => {
  it('only Rage at Fuel Station level 1; Rage brews for 30-50 RP', () => {
    const { s } = village({ vh: 2, level: 1 });
    expect(SPELL_KINDS.filter((k) => spellUnlocked(s, k))).toEqual(['rage']);
    expect(brewCost(s, 'rage')).toBeGreaterThanOrEqual(30);
    expect(brewCost(s, 'rage')).toBeLessThanOrEqual(50);
    for (const k of SPELL_KINDS.slice(1)) expect(CONFIG.fuelStation.spells[k].level).toBeGreaterThan(1);
  });

  it('slots grow with the Village Hall (none without a station), and Refinery adds more', () => {
    expect(spellSlots(makeStateWithTownHall({}, 10))).toBe(0);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((vh) => spellSlots(village({ vh }).s))).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    const { s, fs } = village({ vh: 6 });
    withPicks(s, fs, 'c', 5); // Spare Tank + Fuel Depot
    expect(spellSlots(s)).toBe(5);
  });

  it('the station level opens spells (6 spells over 8 levels)', () => {
    const lv = (k) => CONFIG.fuelStation.spells[k].level;
    expect(SPELL_KINDS.map(lv)).toEqual([1, 2, 3, 4, 5, 7]);
    const { s } = village({ level: 3 });
    expect(SPELL_KINDS.filter((k) => spellUnlocked(s, k))).toEqual(['rage', 'heal', 'freeze']);
    expect(checkBrew(s, 'lightning')).toMatchObject({ ok: false, reason: 'Needs Fuel Station level 7' });
  });

  it('brewing costs RP, fills a slot, and stops when the slots are full or in a wave', () => {
    const { s } = village({ vh: 4, rp: 1000 });
    expect(brewSpell(s, 'rage').ok).toBe(true);
    expect(s.researchPoints).toBe(1000 - CONFIG.fuelStation.spells.rage.brewCost);
    expect(brewSpell(s, 'heal').ok).toBe(true);
    expect(s.spells).toEqual(['rage', 'heal']);
    expect(checkBrew(s, 'freeze')).toMatchObject({ ok: false, reason: 'Spell slots full (2)' });
    expect(discardSpell(s, 'rage').ok).toBe(true);
    expect(s.spells).toEqual(['heal']);
    s.wave.phase = 'active';
    expect(checkBrew(s, 'freeze')).toMatchObject({ ok: false, reason: 'Not during a wave' });
    s.wave.phase = 'idle';
    s.researchPoints = 10;
    expect(checkBrew(s, 'freeze').ok).toBe(false);
    expect(checkBrew(s, 'freeze').reason).toMatch(/more Burgers/);
  });

  it('Refinery perks make brewing cheaper', () => {
    const { s, fs } = village();
    const base = CONFIG.fuelStation.spells.heal.brewCost;
    withPicks(s, fs, 'c', 1);
    expect(brewCost(s, 'heal')).toBe(Math.round(base * 0.85));
    withPicks(s, fs, 'c', 5);
    expect(brewCost(s, 'heal')).toBe(Math.round(base * 0.5));
  });
});

describe('casting spells', () => {
  it('only during a wave, and each brewed spell is used up', () => {
    const { s } = village();
    s.spells = ['rage'];
    expect(checkCast(s, 'rage')).toMatchObject({ ok: false, reason: 'Only during a wave' });
    s.wave.phase = 'active';
    expect(checkCast(s, 'heal')).toMatchObject({ ok: false, reason: 'None brewed' });
    expect(castSpell(s, 'rage', 12, 12).ok).toBe(true);
    expect(s.spells).toEqual([]);
    expect(castSpell(s, 'rage', 12, 12).ok).toBe(false);
  });

  it('Rage: defenses in the circle fire faster and hit harder until it ends', () => {
    const { s } = village({ wave: true });
    const near = addBuilding(s, 'cannon', 20, 20, 1), far = addBuilding(s, 'cannon', 40, 40, 1);
    const base = towerFireInterval(near);
    s.spells = ['rage'];
    castSpell(s, 'rage', 21, 21);
    stepSpells(s, 0.1);
    const st = spellStats(s, 'rage');
    expect(towerFireInterval(near)).toBeCloseTo(base / (1 + st.fireRatePct / 100));
    expect(towerDamageMult(near)).toBeCloseTo(1 + st.damagePct / 100);
    expect(towerFireInterval(far)).toBeCloseTo(base);
    for (let t = 0; t < st.duration + 1; t += 0.1) stepSpells(s, 0.1);
    expect(s.activeSpells).toHaveLength(0);
    expect(towerFireInterval(near)).toBeCloseTo(base);
  });

  it('Heal: buildings in the circle get health back over time (ruins stay down)', () => {
    const { s } = village({ wave: true });
    const hurt = addBuilding(s, 'cannon', 20, 20, 1);
    hurt.hp = 100;
    const ruin = addBuilding(s, 'archer', 22, 20, 1);
    ruin.destroyed = true; ruin.hp = 0;
    s.spells = ['heal'];
    castSpell(s, 'heal', 21, 21);
    for (let i = 0; i < 10; i++) stepSpells(s, 0.1);
    const pct = spellStats(s, 'heal').healPctPerSec;
    expect(hurt.hp).toBeCloseTo(100 + levelStats('cannon', 1).hp * pct / 100, 0); // one second of healing
    expect(ruin.hp).toBe(0);
  });

  it('Freeze: enemies in it are held (they do not move); a boss is only slowed', () => {
    const { s } = village({ wave: true });
    const e = addEnemy(s, 'grunt', 30, 30, { hp: 75, maxHp: 75 });
    const boss = addEnemy(s, 'babycar', 30.5, 30, { hp: 5000, maxHp: 5000 });
    s.spells = ['freeze'];
    castSpell(s, 'freeze', 30, 30);
    stepSpells(s, 0.05);
    expect(e.held).toBeGreaterThan(0);
    expect(e.frozenT).toBeGreaterThan(0);
    expect(boss.held || 0).toBe(0);
    expect(boss.slow).toBe(CONFIG.fuelStation.spells.freeze.bossSlow);
    const x = e.x, y = e.y;
    stepEnemy(s, e, 0.1);
    expect([e.x, e.y]).toEqual([x, y]);
  });

  it('Invisibility: enemies drop the building as a target and cannot hurt it', () => {
    const { s } = village({ wave: true });
    const home = addBuilding(s, 'cannon', 30, 30, 1);
    const e = addEnemy(s, 'grunt', 29, 29);
    e.targetId = home.id;
    s.spells = ['invisibility'];
    castSpell(s, 'invisibility', 31, 31);
    expect(pickTarget(s, e).id).not.toBe(home.id);
    expect(ensureTarget(s, e).id).not.toBe(home.id);
    const hp = home.hp;
    damageBuilding(s, home, 500, e);
    expect(home.hp).toBe(hp);
    for (let t = 0; t < 8; t += 0.1) stepSpells(s, 0.1);
    damageBuilding(s, home, 50, e);
    expect(home.hp).toBe(hp - 50);
  });

  it('Heat Field: enemies standing in it take damage every second', () => {
    const { s } = village({ wave: true });
    const e = addEnemy(s, 'tank', 30, 30, { hp: 900, maxHp: 900 });
    const out = addEnemy(s, 'tank', 40, 40, { hp: 900, maxHp: 900 });
    s.spells = ['heat'];
    castSpell(s, 'heat', 30, 30);
    for (let i = 0; i < 10; i++) stepSpells(s, 0.1);
    expect(e.hp).toBeCloseTo(900 - spellStats(s, 'heat').dps, 0);
    expect(out.hp).toBe(900);
  });

  it('Lightning Strike: the enemies with the most health in the circle take heavy damage', () => {
    const { s } = village({ wave: true });
    const hp = [300, 2000, 1500, 1000, 900];
    const es = hp.map((h, i) => addEnemy(s, 'tank', 30 + i * 0.3, 30, { hp: h, maxHp: h }));
    const outside = addEnemy(s, 'tank', 45, 45, { hp: 5000, maxHp: 5000 });
    s.spells = ['lightning'];
    const r = castSpell(s, 'lightning', 30.5, 30);
    expect(r.ok).toBe(true);
    const dmg = spellStats(s, 'lightning').damage;
    expect(es.map((e) => e.hp)).toEqual([300, 2000 - dmg, 1500 - dmg, 1000 - dmg, 900]);
    expect(outside.hp).toBe(5000);
    expect(s.activeSpells || []).toHaveLength(0);
  });

  it('perks: stronger, longer, bigger, more lightning targets, RP back on a cast', () => {
    const { s, fs } = village({ level: 1 });
    const base = spellStats(s, 'lightning');
    withPicks(s, fs, 'a', 5);
    const a = spellStats(s, 'lightning');
    expect(a.damage).toBe(Math.round(CONFIG.fuelStation.spells.lightning.damage * 1.8));
    expect(a.targets).toBe(base.targets + 2);
    expect(spellStats(s, 'rage').duration).toBeCloseTo(CONFIG.fuelStation.spells.rage.duration * 1.5);
    withPicks(s, fs, 'b', 5);
    expect(spellStats(s, 'heat').radius).toBeCloseTo(CONFIG.fuelStation.spells.heat.radius * 1.8);
    expect(spellStats(s, 'heat').slow).toBe(0.3);
    withPicks(s, fs, 'c', 3);
    addBuilding(s, 'rvlab', 30, 10, 5); // (room under the RP cap for the refund)
    s.researchPoints = 100;
    s.wave.phase = 'active';
    s.spells = ['heal'];
    const rp = s.researchPoints;
    castSpell(s, 'heal', 20, 20);
    expect(s.researchPoints).toBe(rp + Math.round(brewCost(s, 'heal') * 0.25));
  });

  it('Heat Field and Lightning grow with the wave\'s enemy health; the other spells do not', () => {
    const { s } = village({ wave: true });
    const calm = { heat: spellStats(s, 'heat').dps, lightning: spellStats(s, 'lightning').damage, rage: spellStats(s, 'rage').damagePct };
    s.wave.hpMultiplier = 3;
    expect(spellStats(s, 'heat').dps).toBeCloseTo(calm.heat * 3, -1);
    expect(spellStats(s, 'lightning').damage).toBeCloseTo(calm.lightning * 3, -1);
    expect(spellStats(s, 'rage').damagePct).toBe(calm.rage);
    s.wave.phase = 'idle'; // between waves: the base numbers
    expect(spellStats(s, 'lightning').damage).toBe(calm.lightning);
  });

  it('every Fuel Station level above 1 makes spells stronger', () => {
    const one = spellStats(village({ level: 1 }).s, 'heat').dps;
    const top = spellStats(village({ level: 8 }).s, 'heat').dps;
    expect(top).toBe(Math.round(CONFIG.fuelStation.spells.heat.dps * (1 + 7 * CONFIG.fuelStation.powerPerLevel)));
    expect(top).toBeGreaterThan(one);
    for (const k of SPELL_KINDS) expect(spellSummary(village().s, k).length).toBeGreaterThan(20);
  });
});

describe('the Fuel Station guide (a free first Rage)', () => {
  const fresh = (vh) => {
    const gs = new GameState({ storage: noStorage });
    gs.startNew();
    gs.buildings[0].level = vh; gs.tutorialDone = true; gs.tutorialStep = 10;
    return gs;
  };
  const tips = (gs) => [...(gs.tipQueue || [])];

  it('starts at Village Hall 2: build it, brew a free Rage, then cast it (its hotbar slot pulses)', () => {
    const gs = fresh(1);
    expect(gs.fuelGuide).toBe(0);
    gs.buildings[0].level = 2;
    gs.emit('townHallUpgraded', { level: 2 });
    expect(gs.fuelGuide).toBe(1);
    expect(tips(gs)).toContain('fuelBuild');
    const st = createBuilding(gs, 'fuelStation', 13, 15, 1);
    gs.buildings.push(st);
    gs.emit('buildingPlaced', { id: st.id, type: 'fuelStation' });
    expect(gs.fuelGuide).toBe(2);
    expect(tips(gs)).toContain('fuelBrew');
    expect(tips(gs)).not.toContain('fuel');
    expect(brewCost(gs, 'rage')).toBe(0);
    gs.researchPoints = 0;
    expect(gs.brewSpell('rage').ok).toBe(true); // free
    expect(gs.fuelGuide).toBe(3);
    expect(tips(gs)).toContain('fuelCast');
    expect(brewCost(gs, 'rage')).toBe(CONFIG.fuelStation.spells.rage.brewCost); // only the first is free
    gs.wave.phase = 'active';
    expect(hotbarSlots(gs).find((x) => x.kind === 'rage').guide).toBe(true);
    expect(gs.castSpell('rage', 20, 20).ok).toBe(true);
    expect(gs.fuelGuide).toBe(99);
  });

  it('Village Hall 1 gets no Fuel Station tips; a village already past VH2 gets the plain tip (no guide)', () => {
    const one = fresh(1);
    one.emit('tipsChecked', {});
    expect(tips(one).filter((k) => k.startsWith('fuel'))).toEqual([]);
    const old = fresh(5);
    old.emit('tipsChecked', {});
    expect(old.fuelGuide).toBe(0);
    expect(tips(old)).toContain('fuel');
    expect(tips(old)).not.toContain('fuelBuild');
    old.emit('townHallUpgraded', { level: 6 });
    expect(old.fuelGuide).toBe(0);
  });

  it('the guide step is saved', () => {
    const gs = fresh(2);
    gs.fuelGuide = 3;
    const p = parseSave(JSON.stringify(serializeGame(gs)));
    expect(p.status).toBe('ok');
    const back = new GameState({ storage: noStorage });
    back.loadFromSave(p.data);
    expect(back.fuelGuide).toBe(3);
    expect(parseSave(JSON.stringify({ ...serializeGame(gs), fuelGuide: 7 })).status).toBe('invalid');
  });
});

describe('spells in saves', () => {
  it('version 6 saves: Spear Thrower and Fuel Station level L becomes 2L - 1 (same picture), capped by the Village Hall', () => {
    const gs = new GameState({ storage: noStorage });
    gs.startNew();
    gs.buildings[0].level = 7; gs.tutorialDone = true; gs.tutorialStep = 10;
    gs.buildings.push(createBuilding(gs, 'fuelStation', 13, 15, 3), createBuilding(gs, 'spear', 17, 11, 2), createBuilding(gs, 'spear', 21, 15, 5));
    const old = { ...serializeGame(gs), version: 6 };
    const p = parseSave(JSON.stringify(old));
    expect(p.status).toBe('ok');
    const lv = (type) => p.data.buildings.filter((b) => b.type === type).map((b) => b.level);
    expect(lv('fuelStation')).toEqual([5]);
    expect(lv('spear')).toEqual([3, 7]); // 2 -> 3, 5 -> 9 capped at Village Hall 7
  });

  it('brewed spells are saved and loaded; older saves without them still load', () => {
    const gs = new GameState({ storage: noStorage });
    gs.startNew();
    gs.buildings[0].level = 8; gs.tutorialDone = true; gs.tutorialStep = 10;
    gs.buildings.push(createBuilding(gs, 'fuelStation', 13, 15, 2));
    gs.spells = ['rage', 'freeze', 'rage'];
    const saved = serializeGame(gs);
    expect(saved.spells).toBe('rage,freeze,rage');
    const parsed = parseSave(JSON.stringify(saved));
    expect(parsed.status).toBe('ok');
    const back = new GameState({ storage: noStorage });
    back.loadFromSave(parsed.data);
    expect(back.spells).toEqual(['rage', 'freeze', 'rage']);
    const old = { ...saved };
    delete old.spells;
    const p2 = parseSave(JSON.stringify(old));
    expect(p2.status).toBe('ok');
    const b2 = new GameState({ storage: noStorage });
    b2.loadFromSave(p2.data);
    expect(b2.spells).toEqual([]);
    expect(parseSave(JSON.stringify({ ...saved, spells: 'rage,nuke' })).status).toBe('invalid');
  });

  it('validates the saved list', () => {
    expect(validSpells(undefined)).toBe(true);
    expect(validSpells('')).toBe(true);
    expect(validSpells('heal,lightning')).toBe(true);
    expect(validSpells('heal,,lightning')).toBe(false);
    expect(validSpells(['heal'])).toBe(false);
    expect(deserializeSpells('heal,heat')).toEqual(['heal', 'heat']);
    expect(serializeSpells({ spells: ['heat'] })).toBe('heat');
  });

  it('brewing through GameState saves the village', () => {
    const writes = [];
    const gs = new GameState({ storage: { getItem: () => null, setItem: (k, v) => writes.push(k), removeItem: () => {} } });
    gs.startNew();
    gs.buildings[0].level = 6; gs.tutorialDone = true;
    gs.researchPoints = 500;
    gs.buildings.push(createBuilding(gs, 'fuelStation', 13, 15, 1));
    expect(gs.brewSpell('rage').ok).toBe(true);
    expect(writes.length).toBeGreaterThan(0);
    expect(gs.spells).toEqual(['rage']);
  });
});
