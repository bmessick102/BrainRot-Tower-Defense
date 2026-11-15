import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { createBuilding, wallGroup, planWallGroupUpgrade, upgradeCost, checkUpgrade } from '../src/logic/buildings.js';
import { makeStateWithTownHall } from './helpers.js';

const wall = (s, c, r, level = 1) => { const b = createBuilding(s, 'wall', c, r, level, null, 'x'); s.buildings.push(b); return b; };

describe('wall groups (upgrade a whole stretch at once)', () => {
  it('a group is every connected wall of the same level, nearest first', () => {
    const s = makeStateWithTownHall({}, 5);
    const a = wall(s, 2, 22), b = wall(s, 3, 22), c = wall(s, 4, 22), d = wall(s, 4, 23); // an L
    wall(s, 5, 22, 2);         // touching, but a different level: not in the group
    wall(s, 9, 22);            // same level, not connected
    wall(s, 5, 23);            // same level, only connected through the level 2 wall... and d! (side by side)
    const g = wallGroup(s, a).map((w) => [w.col, w.row]);
    expect(g.slice(0, 3)).toEqual([[2, 22], [3, 22], [4, 22]]);
    expect(g).toContainEqual([4, 23]);
    expect(g).toContainEqual([5, 23]);
    expect(g).not.toContainEqual([5, 22]);
    expect(g).not.toContainEqual([9, 22]);
    expect(g[0]).toEqual([a.col, a.row]);
    void b; void c; void d;
  });

  it('destroyed walls break a group; a lone wall is a group of one', () => {
    const s = makeStateWithTownHall({}, 5);
    const ws = [wall(s, 2, 22), wall(s, 3, 22), wall(s, 4, 22)];
    ws[1].destroyed = true;
    expect(wallGroup(s, ws[0])).toHaveLength(1);
  });

  it('plans as many upgrades as the gold covers, nearest first', () => {
    const s = makeStateWithTownHall({}, 5);
    const ws = [wall(s, 2, 22), wall(s, 3, 22), wall(s, 4, 22), wall(s, 5, 22)];
    const each = upgradeCost('wall', 1);
    s.gold = each * 2 + 1;
    const plan = planWallGroupUpgrade(s, wallGroup(s, ws[0]));
    expect(plan.ids).toEqual([ws[0].id, ws[1].id]);
    expect(plan.cost).toBe(each * 2);
    expect(plan.total).toBe(4);
    s.gold = 0;
    expect(planWallGroupUpgrade(s, wallGroup(s, ws[0])).ids).toEqual([]);
  });

  it('the Village Hall level still caps wall upgrades', () => {
    const s = makeStateWithTownHall({ gold: 1000 }, 1);
    const ws = [wall(s, 2, 22), wall(s, 3, 22)];
    const plan = planWallGroupUpgrade(s, wallGroup(s, ws[0]));
    expect(plan.ids).toEqual([]);
    expect(plan.reason).toMatch(/VH2/);
    expect(CONFIG.walls.levels.length).toBe(8);
  });

  it('wall levels unlock at Village Hall 1, 2, 3, 5, 7, 8, 9 and 10', () => {
    expect(CONFIG.walls.levels.map((l) => l.townHall)).toEqual([1, 2, 3, 5, 7, 8, 9, 10]);
    const s = makeStateWithTownHall({ gold: 1e6 }, 4);
    const [w] = [wall(s, 2, 22, 3)];
    expect(checkUpgrade(s, w)).toMatchObject({ ok: false, reason: 'Requires VH5' });
    const s5 = makeStateWithTownHall({ gold: 1e6 }, 5);
    expect(checkUpgrade(s5, wall(s5, 2, 22, 3)).ok).toBe(true);
    const s9 = makeStateWithTownHall({ gold: 1e6 }, 9);
    expect(checkUpgrade(s9, wall(s9, 2, 22, 7))).toMatchObject({ ok: false, reason: 'Requires VH10' });
    const s10 = makeStateWithTownHall({ gold: 1e6 }, 10);
    expect(checkUpgrade(s10, wall(s10, 2, 22, 8))).toMatchObject({ ok: false, reason: 'Max level' });
  });
});
