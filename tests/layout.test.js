import { describe, it, expect } from 'vitest';
import {
  createLayoutDraft, draftBuildings, layoutChanged, storeBuilding, storeAll, checkDraftPlacement,
  placeInDraft, hotbarGroups, checkLayout, applyLayout, isStored, shiftLayout
} from '../src/logic/layout.js';
import { getCapacity } from '../src/logic/economy.js';
import { makeStateWithTownHall, addBuilding } from './helpers.js';

// Town hall at the map anchor (cols 17-19, rows 15-17); a few buildings around it on grass.
function village() {
  const s = makeStateWithTownHall();
  const cannon = addBuilding(s, 'cannon', 10, 8);
  const mine = addBuilding(s, 'mine', 13, 15);
  const storage = addBuilding(s, 'storage', 21, 15, 2);
  const w1 = addBuilding(s, 'wall', 12, 20);
  const w2 = addBuilding(s, 'wall', 13, 20);
  return { s, cannon, mine, storage, w1, w2 };
}

describe('layout editor (edit mode drafts)', () => {
  it('starts with everything where it stands and nothing changed', () => {
    const { s } = village();
    const d = createLayoutDraft(s);
    expect(draftBuildings(s, d).map((b) => [b.id, b.col, b.row])).toEqual(s.buildings.map((b) => [b.id, b.col, b.row]));
    expect(layoutChanged(s, d)).toBe(false);
  });

  it('picking buildings up never touches the real village (storage capacity stays)', () => {
    const { s, storage } = village();
    const cap = getCapacity(s);
    const d = createLayoutDraft(s);
    storeAll(s, d);
    expect(d.stored).toHaveLength(s.buildings.length);
    expect(draftBuildings(s, d)).toHaveLength(0);
    expect(layoutChanged(s, d)).toBe(true);
    expect(s.buildings).toContain(storage);
    expect(getCapacity(s)).toBe(cap);
    storeAll(s, d); // twice is harmless
    expect(d.stored).toHaveLength(s.buildings.length);
  });

  it('groups the hotbar by type and level, in shop order', () => {
    const { s, w1, w2 } = village();
    w2.level = 2;
    const d = createLayoutDraft(s);
    storeAll(s, d);
    const groups = hotbarGroups(s, d);
    expect(groups.map((g) => `${g.type}:${g.level}x${g.ids.length}`)).toEqual(['townHall:1x1', 'mine:1x1', 'storage:2x1', 'cannon:1x1', 'wall:1x1', 'wall:2x1']);
    expect(groups.find((g) => g.type === 'wall' && g.level === 1).ids).toEqual([w1.id]);
  });

  it('places from the hotbar only on free grass, checked against the draft', () => {
    const { s, cannon, mine } = village();
    const d = createLayoutDraft(s);
    storeBuilding(d, cannon.id);
    // The mine's spot is taken in the draft; hotbar buildings never swap.
    expect(checkDraftPlacement(s, d, cannon.id, mine.col, mine.row).ok).toBe(false);
    // The mine is picked up too: its old spot is free in the draft (though not in the real village).
    storeBuilding(d, mine.id);
    expect(placeInDraft(s, d, cannon.id, mine.col, mine.row).ok).toBe(true);
    expect(isStored(d, cannon.id)).toBe(false);
    expect(d.pos[cannon.id]).toMatchObject({ col: mine.col, row: mine.row });
    expect(cannon.col).toBe(10); // the real cannon hasn't moved
  });

  it('dropping a placed building onto another swaps them in the draft', () => {
    const { s, cannon, mine } = village();
    const d = createLayoutDraft(s);
    const r = placeInDraft(s, d, cannon.id, mine.col, mine.row);
    expect(r.ok).toBe(true);
    expect(r.swap.otherId).toBe(mine.id);
    expect(d.pos[cannon.id]).toMatchObject({ col: mine.col, row: mine.row });
    expect(d.pos[mine.id]).toMatchObject({ col: 10, row: 8 });
  });

  it('saves only with an empty hotbar, then moves the real buildings', () => {
    const { s, cannon, w1 } = village();
    const d = createLayoutDraft(s);
    storeBuilding(d, cannon.id);
    storeBuilding(d, w1.id);
    expect(checkLayout(s, d)).toMatchObject({ ok: false });
    expect(applyLayout(s, d).ok).toBe(false);
    expect(placeInDraft(s, d, cannon.id, 6, 12).ok).toBe(true);
    expect(placeInDraft(s, d, w1.id, 8, 20).ok).toBe(true);
    const r = applyLayout(s, d);
    expect(r.ok).toBe(true);
    expect(r.moved.sort()).toEqual([cannon.id, w1.id].sort());
    expect([cannon.col, cannon.row]).toEqual([6, 12]);
    expect([w1.col, w1.row]).toEqual([8, 20]);
  });

  it('leaving without saving is just dropping the draft: the village is as it was', () => {
    const { s } = village();
    const before = JSON.stringify(s.buildings);
    const d = createLayoutDraft(s);
    storeAll(s, d);
    placeInDraft(s, d, s.buildings[1].id, 4, 12);
    expect(JSON.stringify(s.buildings)).toBe(before);
  });
});

describe('shifting the whole layout', () => {
  it('slides every placed building together, leaving hotbar ones alone', () => {
    const { s, cannon, mine } = village();
    const d = createLayoutDraft(s);
    storeBuilding(d, mine.id);
    const before = draftBuildings(s, d).map((b) => [b.id, b.col, b.row]);
    expect(shiftLayout(s, d, 1, -1).ok).toBe(true);
    expect(draftBuildings(s, d).map((b) => [b.id, b.col, b.row])).toEqual(before.map(([id, c, r]) => [id, c + 1, r - 1]));
    expect(isStored(d, mine.id)).toBe(true);
    expect(cannon.col).toBe(10); // the real village waits for Save
    expect(checkLayout(s, { ...d, stored: [] }).ok).toBe(true); // nothing overlaps after a shift
  });

  it('refuses a shift that would push something off the grass, and changes nothing', () => {
    const { s } = village();
    const d = createLayoutDraft(s);
    const before = JSON.stringify(d.pos);
    const r = shiftLayout(s, d, -40, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/grass/);
    expect(JSON.stringify(d.pos)).toBe(before);
  });

  it('a shifted layout saves like any other', () => {
    const { s, cannon } = village();
    const d = createLayoutDraft(s);
    shiftLayout(s, d, 0, 1);
    expect(layoutChanged(s, d)).toBe(true);
    const r = applyLayout(s, d);
    expect(r.ok).toBe(true);
    expect(r.moved).toHaveLength(s.buildings.length);
    expect([cannon.col, cannon.row]).toEqual([10, 9]);
  });
});
