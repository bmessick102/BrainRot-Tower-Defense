import { describe, it, expect } from 'vitest';
import { planSwap, createBuilding } from '../src/logic/buildings.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

describe('edit mode swap (planSwap)', () => {
  it('dropping a building onto a same-size one swaps their exact spots', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 16);
    const cannon = addBuilding(s, 'cannon', 12, 20);
    const plan = planSwap(s.buildings, mine, 13, 20); // overlaps the cannon by one column
    expect(plan.ok).toBe(true);
    expect(plan.otherId).toBe(cannon.id);
    expect(plan.to).toEqual({ col: 12, row: 20 });
    expect(plan.otherTo).toEqual({ col: 9, row: 16 });
  });

  it('only swaps when the drop covers exactly one building', () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 9, 16);
    addBuilding(s, 'cannon', 12, 20);
    addBuilding(s, 'archer', 14, 20);
    expect(planSwap(s.buildings, mine, 5, 24)).toBeNull();   // empty grass: a normal move
    expect(planSwap(s.buildings, mine, 13, 20)).toBeNull();  // straddles two buildings
  });

  it('different sizes trade places centered on each other', () => {
    const s = makeStateWithTownHall();               // 3x3 Village Hall at (19, 19)
    const th = s.buildings[0];
    const mine = addBuilding(s, 'mine', 12, 20);
    const plan = planSwap(s.buildings, mine, 19, 20);
    expect(plan.ok).toBe(true);
    expect(plan.otherId).toBe(th.id);
    expect(plan.to).toEqual({ col: 20, row: 20 });   // 2x2 centered (rounded) in the hall's spot
    expect(plan.otherTo).toEqual({ col: 12, row: 20 }); // 3x3 centered (rounded) on the mine's spot
  });

  it("is refused when the other building wouldn't fit in the old spot", () => {
    const s = makeStateWithTownHall();
    const mine = addBuilding(s, 'mine', 12, 20);
    addBuilding(s, 'cannon', 14, 20);                // right next to the mine: no room for a 3x3 there
    const plan = planSwap(s.buildings, mine, 19, 20);
    expect(plan.ok).toBe(false);
  });

  it('walls can swap too', () => {
    const s = makeStateWithTownHall();
    const w = createBuilding(s, 'wall', 6, 20, 3, null, 'x');
    s.buildings.push(w);
    const mine = addBuilding(s, 'mine', 10, 16);
    const plan = planSwap(s.buildings, w, 10, 16, 'x');
    expect(plan.ok).toBe(true);
    expect(plan.otherTo).toEqual({ col: 6, row: 20 }); // the 2x2 mine centered (rounded) on the 1-tile wall's spot
  });
});
