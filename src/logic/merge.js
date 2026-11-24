// Defense merging (v0.8, user 2026-11-22). Two max-level copies of a type in CONFIG.merges combine into ONE merged
// building (b.merged) at the selected copy's spot; the other copy is removed (no rubble). The merged building counts as
// 2 toward the type's limit (countOwned in buildings.js: merging frees no slot), can't merge again, and fights with its merge block's stats (maxHp,
// towerRange, towerDamageMult / mergeShotMult, towerFireInterval read them) plus its own ability (combat.js:
// Rolling Thunder, Ballista Bolt, Triple Strike).
//
// Cost: Shakes AND gold (cost.rp, cost.gold), between waves only.
// Perks: RV Lab perks belong to the building TYPE (research[type], abilities.js), so both copies already have the same
// tiers and the merged building keeps them all; nothing per building is lost. Shakes spent on the removed copy's own
// levels (a level with costCurrency 'rp'; none for the Cannon, Locklair Tower or Mortar) are refunded, allowed past the
// Shake cap. Merging gives no free path reset (v0.8.3; before that each merge left one, state.freeRespecs): a reset
// always costs its normal price.
// Mastery: a 3-tier track per mergeable type (state.mastery[type] = tiers researched), researched in the RV Lab with
// Shakes, gated by RV Lab level; it only changes the merged ability and isn't part of the one-path lock. Every merged
// building of the type has it (b.mastery, kept in step by syncMastery, read by masteryFxOf in buildings.js).
// No Phaser here; GameState.mergeBuilding / researchMastery call these and save.
import { CONFIG } from '../config.js';
import {
  mergeConfig, mergedConfigOf, maxLevel, maxHp, typeConfig, levelStats, buildingName, displayName, needGoldReason, masteryFxOf
} from './buildings.js';
import { towerRange, towerFireInterval, towerDamageMult, labLevel } from './abilities.js';
import { researchPoints, needRpReason } from './researchPoints.js';
import { isWaveActive, emit } from './util.js';
import { distance } from './iso.js';
import { footprintCenter } from './grid.js';

/** The types that can merge (CONFIG.merges keys), in config order. */
/** A type's name for "another Level 5 Diddypult": without a leading "The" (The Diddypult). */
export const plainName = (type) => buildingName(type).replace(/^The /, '');
export const MERGE_TYPES = Object.keys(CONFIG.merges || {});

export function isMergeable(type) {
  return !!mergeConfig(type);
}

export function isMerged(b) {
  return !!mergedConfigOf(b);
}

/** Merge price: { gold, rp }. */
export function mergeCost(type) {
  const m = mergeConfig(type);
  return m ? { gold: m.cost.gold || 0, rp: m.cost.rp || 0 } : null;
}

/** Could this building ever take part in a merge (right type, top level, not merged, standing)? */
function eligible(b) {
  return !!b && isMergeable(b.type) && !b.merged && !b.destroyed && b.level >= maxLevel(b.type);
}

/** The other copies `b` can merge with: same type, top level, not merged, standing. Nearest first. */
export function mergeCandidates(state, b) {
  if (!b) return [];
  const c = footprintCenter(b);
  return state.buildings.filter((o) => o.id !== b.id && o.type === b.type && eligible(o))
    .sort((x, y) => { const a = footprintCenter(x), d = footprintCenter(y); return distance(c.x, c.y, a.x, a.y) - distance(c.x, c.y, d.x, d.y); });
}

/**
 * Can `b` merge now (with `otherId`, or with any candidate when left out)? { ok, reason, cost, candidates, show }.
 * `show`: whether the panel shows a Merge button at all (a mergeable type at its top level, not merged yet).
 * Reasons are what the greyed button says: "Needs another Level 10 Cannon", "Not during a wave", the missing gold / Shakes.
 */
export function checkMerge(state, b, otherId = null) {
  const m = b && mergeConfig(b.type);
  if (!m) return { ok: false, reason: "Can't merge", show: false, preview: false, candidates: [] };
  const cost = mergeCost(b.type);
  const top = maxLevel(b.type);
  // show: the real Merge button (max level, in the Upgrade button's place). preview (v0.8.12): a mergeable type that's
  // still below its top level (standing, not merged): the panel shows a greyed Merge beside Upgrade, so players see
  // which buildings can merge and what to aim for.
  const base = { cost, candidates: [], show: !b.merged && b.level >= top, preview: !b.merged && !b.destroyed && b.level < top };
  if (b.merged) return { ...base, ok: false, reason: 'Already merged' };
  if (b.level < top) return { ...base, ok: false, reason: `Needs Level ${top}` };
  if (b.destroyed) return { ...base, ok: false, reason: 'Destroyed' };
  const candidates = mergeCandidates(state, b);
  const out = { ...base, candidates };
  if (!candidates.length) return { ...out, ok: false, reason: `Needs another Level ${top} ${plainName(b.type)}` };
  if (otherId && !candidates.some((o) => o.id === otherId)) return { ...out, ok: false, reason: `Pick another Level ${top} ${plainName(b.type)}` };
  if (isWaveActive(state)) return { ...out, ok: false, reason: 'Not during a wave' };
  if (state.gold < cost.gold) return { ...out, ok: false, reason: needGoldReason(cost.gold, Math.floor(state.gold)) };
  if (researchPoints(state) < cost.rp) return { ...out, ok: false, reason: needRpReason(cost.rp, researchPoints(state)) };
  return { ...out, ok: true, reason: '' };
}

/** Shakes spent on a building's own levels (levels priced in Shakes, costCurrency 'rp'): refunded when it's merged away. */
export function burgersSpentOnLevels(b) {
  return typeConfig(b.type).levels.slice(0, b.level).reduce((sum, l) => sum + (l.costCurrency === 'rp' ? l.cost : 0), 0);
}

/**
 * Merge `otherId` into `keepId` (checkMerge must pass; this re-checks). Pays gold and Shakes, removes the other copy (no
 * rubble), makes the kept one merged at full health with its type's Mastery and refunds the other's level Shakes past the
 * cap. No free path reset (v0.8.3). Emits 'buildingsMerged'. Returns { ok, reason, refund, removedId }.
 */
export function mergeBuildings(state, keepId, otherId) {
  const keep = state.buildings.find((b) => b.id === keepId);
  const check = checkMerge(state, keep, otherId);
  if (!check.ok) return check;
  const other = state.buildings.find((b) => b.id === otherId);
  state.gold -= check.cost.gold;
  state.researchPoints = researchPoints(state) - check.cost.rp;
  const refund = burgersSpentOnLevels(other); // allowed past the Shake cap: nothing is lost
  if (refund) state.researchPoints += refund;
  state.buildings = state.buildings.filter((b) => b.id !== otherId);
  keep.merged = true;
  keep.mastery = masteryLevel(state, keep.type);
  keep.hp = maxHp(keep);
  keep.cooldown = 0;
  keep.targetId = null;
  if (state._nav) state._nav = null; // a building left the map: routes are worked out again
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints, added: refund - check.cost.rp });
  const gone = footprintCenter(other); // where the other copy stood (the view puffs it away)
  emit(state, 'buildingsMerged', { id: keep.id, removedId: otherId, type: keep.type, gold: check.cost.gold, rp: check.cost.rp, refund, removedX: gone.x, removedY: gone.y });
  return { ok: true, reason: '', refund, removedId: otherId };
}

// ---------- what the merge preview shows ----------
/**
 * A building's key fighting stats: { hp, damage, shots, interval, range, dps } (damage per shell / shot, shots per
 * volley, seconds between volleys, range in tiles, damage per second when every shot hits one enemy). Uses the same
 * functions combat does, so perks are included.
 */
export function fightStats(b) {
  const lvl = levelStats(b.type, b.level);
  const m = mergedConfigOf(b);
  // A F.L.O.C.K Mothership (flockZap.js) has no shots of its own: its zaps are its damage (`targets` at a time).
  if (m && m.zap) return { hp: maxHp(b), damage: m.zap.damage, shots: m.zap.targets, interval: m.zap.every, range: towerRange(b), dps: (m.zap.damage * m.zap.targets) / m.zap.every };
  // A beam (Tower of Rah) has no shots: its damage is per second, before heat (perSecond: the window shows "70/s").
  if (typeConfig(b.type).beam) {
    const dps = (lvl.dps || 0) * towerDamageMult(b);
    return { hp: maxHp(b), damage: dps, shots: 1, interval: 1, range: towerRange(b), dps, perSecond: true };
  }
  const shots = m && m.triple ? m.triple.shells : 1;
  const perShot = (lvl.damage || 0) * towerDamageMult(b) * (m ? m.fireIntervalMult || 1 : 1) * (m && m.triple ? m.triple.shellMult : 1);
  const interval = towerFireInterval(b);
  return { hp: maxHp(b), damage: perShot, shots, interval, range: towerRange(b), dps: (perShot * shots) / interval };
}

/** Preview for the confirm dialog: { a, b, merged } fight stats (the merged one as it would be, with today's Mastery). */
export function mergePreview(state, b, other) {
  const merged = { ...b, merged: true, mastery: masteryLevel(state, b.type), _aura: null, djBoostT: 0, spellRageT: 0, frigoSlow: 0 };
  return { a: fightStats(b), b: fightStats(other || b), merged: fightStats(merged), name: displayName(merged), config: mergeConfig(b.type) };
}

// ---------- Mastery ----------
/** Mastery tiers researched for a mergeable type (0-3). */
export function masteryLevel(state, type) {
  const v = state.mastery && state.mastery[type];
  const m = mergeConfig(type);
  return m && Number.isInteger(v) ? Math.max(0, Math.min(v, m.mastery.tiers.length)) : 0;
}

/** One Mastery tier's data { name, desc, fx, cost, labLevel } (tier is 1-based). */
export function masteryTier(type, tier) {
  const m = mergeConfig(type).mastery;
  return { ...m.tiers[tier - 1], cost: m.costs[tier - 1], labLevel: m.labLevel[tier - 1] };
}

/** How many Mastery tiers a type has (3). */
export function masteryTierCount(type) {
  const m = mergeConfig(type);
  return m ? m.mastery.tiers.length : 0;
}

/** Does the village have a merged building of this type? */
export function hasMergedOf(state, type) {
  return state.buildings.some((b) => b.type === type && b.merged);
}

/** The message for a Mastery that waits for a merge: "Needs a Mega Cannon: merge two at Level 10". */
export const needsMergeReason = (type) => `Needs a ${mergeConfig(type).name}: merge two at Level ${maxLevel(type)}`;

/**
 * Can the RV Lab research this type's next Mastery tier (or `tier`)? { ok, reason, cost, tier }. Needs a merged
 * building of the type (v0.9.3: the RV Lab shows the column greyed out until then), the previous tier, its RV Lab
 * level, Shakes, and no wave.
 */
export function checkMastery(state, type, tier = masteryLevel(state, type) + 1) {
  const m = mergeConfig(type);
  if (!m) return { ok: false, reason: "Can't merge", cost: null, tier: null };
  const have = masteryLevel(state, type);
  if (tier > m.mastery.tiers.length || have >= m.mastery.tiers.length) return { ok: false, reason: 'Fully mastered', cost: null, tier: null };
  if (tier <= have) return { ok: false, reason: 'Already researched', cost: null, tier };
  const t = masteryTier(type, tier);
  if (tier > have + 1) return { ok: false, reason: `Research Mastery ${have + 1} first`, cost: t.cost, tier };
  if (!hasMergedOf(state, type)) return { ok: false, reason: needsMergeReason(type), cost: t.cost, tier };
  const lab = labLevel(state);
  if (!lab) {
    const ruin = state.buildings.some((b) => b.type === 'rvlab');
    return { ok: false, reason: ruin ? 'Rebuild the RV Lab' : 'Build an RV Lab', cost: t.cost, tier };
  }
  if (lab < t.labLevel) return { ok: false, reason: `Needs RV Lab level ${t.labLevel}`, cost: t.cost, tier };
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave', cost: t.cost, tier };
  if (researchPoints(state) < t.cost) return { ok: false, reason: needRpReason(t.cost, researchPoints(state)), cost: t.cost, tier };
  return { ok: true, reason: '', cost: t.cost, tier };
}

/** Give every merged building its type's Mastery (b.mastery). Returns the ids that changed. */
export function syncMastery(state) {
  const changed = [];
  for (const b of state.buildings) {
    const want = b.merged ? masteryLevel(state, b.type) : 0;
    if ((b.mastery || 0) === want) continue;
    if (want) b.mastery = want; else delete b.mastery;
    changed.push(b.id);
  }
  return changed;
}

/** The Mastery effects of a merged building (re-exported for views). */
export { masteryFxOf };

// ---------- save data ----------
/** Mastery as saved: { type: tiers } for every type with any (left out when none). */
export function serializeMastery(state) {
  const out = {};
  for (const type of MERGE_TYPES) { const n = masteryLevel(state, type); if (n) out[type] = n; }
  return out;
}

/** A saved Mastery object: missing (older saves), or { mergeable type: 1..tiers }. */
export function validMastery(obj) {
  if (obj === undefined) return true;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.entries(obj).every(([type, v]) => isMergeable(type) && Number.isInteger(v) && v >= 0 && v <= masteryTierCount(type));
}

/**
 * A saved free-reset list (saves from v0.8.0-0.8.2, when merging gave a free path reset): missing, or an array of
 * mergeable types. Still validated so a broken save stays invalid, then ignored on load (v0.8.3: no free resets).
 */
export function validFreeRespecs(v) {
  return v === undefined || (Array.isArray(v) && v.every((t) => typeof t === 'string' && isMergeable(t)));
}

// ---------- merged pictures that turn (CONFIG.merges[type].art.facings) ----------
/**
 * Which facing picture a merged building shows, toward a target `dx`, `dy` screen pixels away (y grows downward):
 * four facings ('dl' / 'dr' / 'ul' / 'ur', the Cannon's) or two ('left' / 'right', the Missile Silo's). With no target
 * (dx and dy null) it keeps `last` (or the first facing).
 */
export function facingToward(options, dx, dy, last = null) {
  const keep = last && options.includes(last) ? last : options[0];
  if (dx === null || dx === undefined) return keep;
  if (options.includes('dl')) return dy >= 0 ? (dx < 0 ? 'dl' : 'dr') : (dx < 0 ? 'ul' : 'ur');
  if (Math.abs(dx) < 2) return keep; // straight above / below: no flip-flopping
  return dx < 0 ? 'left' : 'right';
}

/** The art key of a merged type's facing picture (its plain key when it has no facings). */
export function mergedFacingKey(type, facing) {
  const art = mergeConfig(type)?.art;
  if (!art) return null;
  return (art.facings && art.facings[facing]) || art.key;
}
