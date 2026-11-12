import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepBeams, beamStage, isBeam } from '../src/logic/beams.js';
import { stepDefenses } from '../src/logic/combat.js';
import { maxLevel, limitFor } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const R = CONFIG.defenses.ra;
const setup = () => { const s = makeStateWithTownHall({}, 6); s.wave.phase = 'active'; const t = addBuilding(s, 'ra', 9, 16); return { s, t }; };
const big = (s, kind, x, y, hp) => addEnemy(s, kind, x, y, { hp, maxHp: hp });

describe('Tower of Rah', () => {
  it('is an 8-level beam tower unlocking at Village Hall 6 (2 allowed from VH9)', () => {
    expect(isBeam('ra')).toBe(true);
    expect(maxLevel('ra')).toBe(8);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((th) => limitFor('ra', th))).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 2, 2]);
  });

  it('locks onto the enemy with the most health in range, ground or air', () => {
    const { s, t } = setup();
    big(s, 'grunt', 11, 17, 100);
    const balloon = big(s, 'balloon', 12, 18, 900);
    big(s, 'tank', 30, 30, 5000);                    // out of range
    stepBeams(s, 0.01);
    expect(t.beamTargetId).toBe(balloon.id);
  });

  it('heats up the longer it stays on one enemy: x1, then x3 after 2 s, x8 after 5 s', () => {
    expect([0, 1.9, 2, 4.9, 5, 9].map((sec) => beamStage('ra', sec).mult)).toEqual([1, 1, 3, 3, 8, 8]);
    const { s } = setup();
    const e = big(s, 'tank', 11, 17, 1e6);
    const dps = R.levels[0].dps;
    stepBeams(s, 1);
    expect(1e6 - e.hp).toBeCloseTo(dps * 1, 5);
    const hp = e.hp;
    for (let i = 0; i < 40; i++) stepBeams(s, 0.1);      // now at 5 s
    stepBeams(s, 1);                                     // a full second at x8
    expect(hp - e.hp).toBeGreaterThan(dps * 8 * 1);       // includes the x3 stretch before it
  });

  it('announces each heat-up (x3, then x8) once, and again after a new target', () => {
    const { s } = setup();
    const a = big(s, 'tank', 11, 17, 1e6);
    for (let i = 0; i < 70; i++) stepBeams(s, 0.1);
    const ups = () => s.events.filter((e) => e.name === 'beamHeatUp').map((e) => e.data.stage);
    expect(ups()).toEqual([1, 2]);
    a.alive = false;
    big(s, 'tank', 11, 18, 1e6);
    for (let i = 0; i < 30; i++) stepBeams(s, 0.1);
    expect(ups()).toEqual([1, 2, 1]);
  });

  it('starts cold again on a new target, and keeps its lock while the target lives', () => {
    const { s, t } = setup();
    const a = big(s, 'tank', 11, 17, 1e6);
    stepBeams(s, 3);
    expect(t.beamStage).toBe(1);
    big(s, 'tank', 11, 18, 2e6);                         // a tougher enemy walks in: the lock holds
    stepBeams(s, 0.2);
    expect(t.beamTargetId).toBe(a.id);
    a.alive = false;
    stepBeams(s, 0.2);
    expect(t.beamTime).toBeLessThan(1);
    expect(t.beamStage).toBe(0);
  });

  it('never fires projectiles, ignores invisible enemies, and does nothing when destroyed', () => {
    const { s, t } = setup();
    big(s, 'thief', 11, 17, 500).hidden = true;
    stepDefenses(s, 5);
    stepBeams(s, 1);
    expect(s.projectiles).toHaveLength(0);
    expect(t.beamTargetId).toBe(null);
    const e = big(s, 'grunt', 11, 17, 500);
    t.destroyed = true;
    stepBeams(s, 1);
    expect(e.hp).toBe(500);
  });
});
