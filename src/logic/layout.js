// Layout editor (edit mode): a draft of where every building goes, so the player can pick buildings up
// into a hotbar (one at a time or all at once) and lay the village out again, like Clash of Clans.
// The real village is untouched until applyLayout(): while buildings sit in the hotbar, storages still
// count, mines still mine and nothing becomes passable. Pure functions only (no Phaser).
//
// draft = { pos: { [id]: { col, row, orient, w, h } }, stored: [id, ...] }
//   pos     every building's draft spot (stored buildings keep their last one, unused)
//   stored  ids in the hotbar, in the order they went in
import { BUILDING_TYPES, footprintDims, planSwap } from './buildings.js';
import { canPlaceRect, isRectOnGrass, fpW, fpH } from './grid.js';

const spotOf = (b) => ({ col: b.col, row: b.row, orient: b.orient, w: fpW(b), h: fpH(b) });

/** A draft with every building where it stands now and an empty hotbar. */
export function createLayoutDraft(state) {
  const pos = {};
  for (const b of state.buildings) pos[b.id] = spotOf(b);
  return { pos, stored: [] };
}

export const isStored = (draft, id) => draft.stored.includes(id);

/** The village as the draft lays it out: copies of the placed buildings at their draft spots. */
export function draftBuildings(state, draft) {
  const out = [];
  for (const b of state.buildings) {
    if (isStored(draft, b.id)) continue;
    const p = draft.pos[b.id] || spotOf(b);
    const copy = { ...b, col: p.col, row: p.row };
    if (b.type === 'wall') { copy.orient = p.orient; copy.w = p.w; copy.h = p.h; }
    out.push(copy);
  }
  return out;
}

/** Has anything moved or been picked up since the draft was made? */
export function layoutChanged(state, draft) {
  if (draft.stored.length) return true;
  return state.buildings.some((b) => {
    const p = draft.pos[b.id];
    return p && (p.col !== b.col || p.row !== b.row || (b.type === 'wall' && p.orient !== b.orient));
  });
}

/** Put one building in the hotbar. */
export function storeBuilding(draft, id) {
  if (draft.pos[id] && !isStored(draft, id)) draft.stored.push(id);
}

/** Remove All: every building goes to the hotbar. */
export function storeAll(state, draft) {
  for (const b of state.buildings) storeBuilding(draft, b.id);
}

/**
 * Where building `id` would go if dropped at (col, row) in the draft: { ok, reason, swap }. Dropped onto
 * exactly one other placed building (not from the hotbar), the two trade places like a normal move.
 */
export function checkDraftPlacement(state, draft, id, col, row, orient = null) {
  const b = state.buildings.find((x) => x.id === id);
  if (!b) return { ok: false, reason: 'Missing', swap: null };
  const others = draftBuildings(state, draft).filter((x) => x.id !== id);
  const o = b.type === 'wall' ? (orient || draft.pos[id].orient || b.orient) : undefined;
  const { w, h } = footprintDims(b.type, o);
  const spot = canPlaceRect(others, col, row, w, h);
  if (spot.ok) return { ok: true, reason: '', swap: null };
  if (isStored(draft, id)) return { ok: false, reason: spot.reason, swap: null }; // nothing to trade with
  const mover = { ...b, ...draft.pos[id] };
  const swap = planSwap([...others, mover], mover, col, row, o);
  return swap && swap.ok ? { ok: true, reason: '', swap } : { ok: false, reason: (swap && swap.reason) || spot.reason, swap: null };
}

/** Drop building `id` at (col, row) in the draft (out of the hotbar if it was there). Returns the check. */
export function placeInDraft(state, draft, id, col, row, orient = null) {
  const check = checkDraftPlacement(state, draft, id, col, row, orient);
  if (!check.ok) return check;
  const b = state.buildings.find((x) => x.id === id);
  const o = b.type === 'wall' ? (orient || draft.pos[id].orient || b.orient) : undefined;
  const { w, h } = footprintDims(b.type, o);
  if (check.swap) {
    const other = draft.pos[check.swap.otherId];
    draft.pos[id] = { ...check.swap.to, orient: o, w, h };
    draft.pos[check.swap.otherId] = { ...other, ...check.swap.otherTo };
  } else {
    draft.pos[id] = { col, row, orient: o, w, h };
  }
  draft.stored = draft.stored.filter((x) => x !== id);
  return check;
}

/**
 * Shift the whole placed layout by (dc, dr) tiles (buildings in the hotbar stay there). Everything moves
 * together, so nothing can start overlapping; it only fails if something would leave the grass.
 */
export function shiftLayout(state, draft, dc, dr) {
  const placed = draftBuildings(state, draft);
  if (!placed.length) return { ok: false, reason: 'Nothing placed to shift' };
  if (!placed.every((b) => isRectOnGrass(b.col + dc, b.row + dr, fpW(b), fpH(b)))) {
    return { ok: false, reason: "Can't shift that way: something would leave the grass" };
  }
  for (const b of placed) {
    const p = draft.pos[b.id];
    draft.pos[b.id] = { ...p, col: p.col + dc, row: p.row + dr };
  }
  return { ok: true, reason: '' };
}

/**
 * The hotbar's cards: stored buildings grouped by type and level (in shop order, then level), each
 * { type, level, ids } with ids in the order they were stored.
 */
export function hotbarGroups(state, draft) {
  const groups = new Map();
  for (const id of draft.stored) {
    const b = state.buildings.find((x) => x.id === id);
    if (!b) continue;
    const key = `${b.type}:${b.level}`;
    if (!groups.has(key)) groups.set(key, { type: b.type, level: b.level, ids: [] });
    groups.get(key).ids.push(id);
  }
  const order = (t) => { const i = BUILDING_TYPES.indexOf(t); return i < 0 ? 99 : i; };
  return [...groups.values()].sort((a, b) => order(a.type) - order(b.type) || a.level - b.level);
}

/** Can the draft be saved? Every building placed, none overlapping or off the grass. */
export function checkLayout(state, draft) {
  if (draft.stored.length) return { ok: false, reason: `Place every building first (${draft.stored.length} left)` };
  const placed = draftBuildings(state, draft);
  for (const b of placed) {
    const spot = canPlaceRect(placed.filter((x) => x.id !== b.id), b.col, b.row, fpW(b), fpH(b));
    if (!spot.ok) return { ok: false, reason: spot.reason };
  }
  return { ok: true, reason: '' };
}

/** Move the real buildings to their draft spots. Returns { ok, reason, moved: [ids] }. */
export function applyLayout(state, draft) {
  const check = checkLayout(state, draft);
  if (!check.ok) return { ...check, moved: [] };
  const moved = [];
  for (const b of state.buildings) {
    const p = draft.pos[b.id];
    if (!p) continue;
    const changed = p.col !== b.col || p.row !== b.row || (b.type === 'wall' && p.orient !== b.orient);
    if (!changed) continue;
    b.col = p.col;
    b.row = p.row;
    if (b.type === 'wall') { b.orient = p.orient; b.w = p.w; b.h = p.h; }
    moved.push(b.id);
  }
  return { ok: true, reason: '', moved };
}
