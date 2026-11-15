// RV Lab ability paths: research (one pick per tier, per defense type), the tiers each building has (from
// those picks and its level), merged effects, and the effective stats a defense fights with (its own tiers
// plus any F.L.O.C.K Commander aura).
// Research: at each tier the RV Lab picks ONE option for a defense type, path A's, B's or C's (any mix:
// A1, B2, A3; picks are final). Tier N needs a tier N-1 pick; the RV Lab's level caps the tier. Kept as
// state.research[type] = ['a', 'b', 'a'] (tier 1 first).
// Every building of that type gets the picks automatically, up to the first tier its own level is too low
// for (picksForLevel in abilityConfig.js). Kept on each building as b.picks (synced by syncAbilityPicks), which
// is what combat reads.
// The trees, costs and level requirements are in src/abilityConfig.js. Research costs research points (RP).
// No Phaser, no spending here (GameState does that).
import { CONFIG } from '../config.js';
import { ABILITIES, ABILITY_COSTS, MAX_TIER, PATH_KEYS, levelReq, picksForLevel } from '../abilityConfig.js';
import { defenseRange, typeConfig, maxHp } from './buildings.js';
import { isWaveActive } from './util.js';
import { researchPoints, needRpReason } from './researchPoints.js';

export { ABILITIES, MAX_TIER, PATH_KEYS, levelReq, picksForLevel };

/** Does this building type have ability paths? (Every defense and trap.) */
export function hasAbilities(type) {
  return !!ABILITIES[type];
}

/** The defense types with ability paths, in shop order. */
export const ABILITY_TYPES = Object.keys(ABILITIES);
export { DEFENSE_ABILITY_TYPES, ECONOMY_ABILITY_TYPES } from '../abilityConfig.js';

/** One tier's data: { name, desc, fx }. `tier` is 1-based. */
export function tierInfo(type, path, tier) {
  return ABILITIES[type][path].tiers[tier - 1];
}

export function pathName(type, path) {
  return ABILITIES[type][path].name;
}

/** The tiers a building has, in tier order: picks[0] is tier 1's path ('a' / 'b' / 'c'). */
export function picksOf(b) {
  return (b && b.picks) || [];
}

/** How many tiers this building owns (0-5). */
export function tierCount(b) {
  return picksOf(b).length;
}

/** Which path the building picked at a tier (1-based), or null. */
export function pickAt(b, tier) {
  return picksOf(b)[tier - 1] || null;
}

/** How many of the building's tiers came from this path. */
export function pathTier(b, path) {
  return picksOf(b).filter((p) => p === path).length;
}

/** The tiers (1-based) the building took from this path, e.g. [1, 3]. */
export function pathTiers(b, path) {
  return picksOf(b).map((p, i) => (p === path ? i + 1 : 0)).filter(Boolean);
}

/** labGuideStep value for a finished (or skipped) RV Lab guide (see labGuide.js). */
export const LAB_GUIDE_DONE = 99;

/** The RV Lab's picks for a defense type, tier 1 first, e.g. ['a', 'b']. */
export function labPicks(state, type) {
  const v = state.research && state.research[type];
  return Array.isArray(v) ? v : [];
}

/** How many tiers the RV Lab has picked for a type (0-5). */
export function labTierCount(state, type) {
  return labPicks(state, type).length;
}

/** Is this option (type, path, tier) the RV Lab's pick at that tier? */
export function isResearched(state, type, path, tier) {
  return labPicks(state, type)[tier - 1] === path;
}

/** The tiers (1-based) the RV Lab picked from this path for a type, e.g. [1, 3]. */
export function researchedTiers(state, type, path) {
  return labPicks(state, type).map((p, i) => (p === path ? i + 1 : 0)).filter(Boolean);
}

/** How many of a type's picks came from this path. */
export function researchTier(state, type, path) {
  return researchedTiers(state, type, path).length;
}

/** Is a tier open to pick (or already picked)? Tier N opens once tier N-1 has a pick, from any path. */
export function tierUnlocked(state, type, path, tier) {
  return tier <= labTierCount(state, type) + 1;
}

/** The tier a type picks next, or null when all five are picked. */
export function nextResearchTier(state, type) {
  const n = labTierCount(state, type) + 1;
  return n <= MAX_TIER ? n : null;
}

/** Has anything at all been researched? */
export function anyResearch(state) {
  return Object.keys(state.research || {}).some((type) => labTierCount(state, type) > 0);
}

/** The RV Lab guide makes the very first research free (while the guide runs and nothing is researched yet). */
export function isResearchFree(state) {
  const step = state.labGuideStep || 0;
  return step >= 1 && step < LAB_GUIDE_DONE && !anyResearch(state);
}

export function researchCost(tier) {
  return ABILITY_COSTS.research[tier - 1];
}

/**
 * Give every building with ability paths the tiers its type's picks and its level allow (b.picks). Health
 * tiers keep the same share of health. Returns the ids of the buildings whose tiers changed.
 */
export function syncAbilityPicks(state) {
  const changed = [];
  for (const b of state.buildings) {
    if (!hasAbilities(b.type)) continue;
    const next = picksForLevel(state.research, b.type, b.level);
    if (next.join('') === picksOf(b).join('')) continue;
    const oldMax = maxHp(b);
    b.picks = next;
    if (!b.destroyed) b.hp = Math.round((b.hp / oldMax) * maxHp(b));
    changed.push(b.id);
  }
  return changed;
}

/** The RV Lab: the highest level of a standing one (0 = none, or only ruins). */
export function labLevel(state) {
  let lvl = 0;
  for (const b of state.buildings) if (b.type === 'rvlab' && !b.destroyed) lvl = Math.max(lvl, b.level);
  return lvl;
}

// ---------- merged effects ----------
const SUMMED = /(Pct|Add)$/;
const fxCache = new Map();

/** Merge tier effects: "...Pct" / "...Add" keys add up, every other key keeps its largest value. */
export function mergeFx(list) {
  const out = {};
  for (const fx of list) {
    for (const [k, v] of Object.entries(fx)) {
      if (SUMMED.test(k)) out[k] = (out[k] || 0) + v;
      else out[k] = out[k] === undefined ? v : Math.max(out[k], v);
    }
  }
  return out;
}

/** Everything a building's owned tiers do (cached by type and tiers). */
export function abilityFx(b) {
  if (!b || !hasAbilities(b.type)) return EMPTY;
  const picks = picksOf(b);
  if (!picks.length) return EMPTY;
  const key = `${b.type}|${picks.join('')}`;
  let fx = fxCache.get(key);
  if (!fx) {
    fx = Object.freeze(mergeFx(picks.map((p, i) => tierInfo(b.type, p, i + 1).fx)));
    fxCache.set(key, fx);
  }
  return fx;
}
const EMPTY = Object.freeze({});

/** A F.L.O.C.K Commander aura on this defense (set every step by stepFlockTowers), or none. */
export function auraOf(b) {
  return (b && b._aura) || EMPTY;
}
const aura = auraOf;

/** Range in tiles: the level's range, plus the tower's own tiers, plus a Commander aura (Spotter). */
export function towerRange(b) {
  const fx = abilityFx(b);
  // b._crowdRange: Gandolf Storm Front (set each step by stepDefenses while a crowd is in range).
  return defenseRange(b.type, b.level) + (fx.rangeAdd || 0) + (b.type === 'flock' ? 0 : aura(b).rangeAdd || 0) + (b._crowdRange || 0);
}

/** Blind spot in tiles (Mortar Close Support shrinks it). */
export function towerMinRange(b) {
  return Math.max(0, (typeConfig(b.type).minRange || 0) + (abilityFx(b).minRangeAdd || 0));
}

/** Damage multiplier from the tower's own tiers and a Commander aura (Rally). */
export function towerDamageMult(b) {
  // (+ DJ Babyface's Main Stage while Drop the Beat lasts)
  return 1 + ((abilityFx(b).damagePct || 0) + (aura(b).damagePct || 0) + (b.djBoostT > 0 ? b.djDmgPct || 0 : 0)) / 100;
}

/** Seconds between shots (faster with fire-rate tiers and a Commander aura). */
export function towerFireInterval(b) {
  const cfg = typeConfig(b.type);
  const fx = abilityFx(b);
  const lastStand = b.lastStandT > 0 ? 2 : 1; // Cannon Last Stand: twice as fast while it lasts
  const pct = (fx.fireRatePct || 0) + (aura(b).fireRatePct || 0)
    + (fx.rampPct ? (b.rampStacks || 0) * fx.rampPct : 0)                 // Cannon Hot Barrel
    + (b.celebrateT > 0 ? b.celebratePct || 0 : 0)                         // a nearby Firework's Celebration
    + (fx.groundFireRatePct && b._noFlyers ? fx.groundFireRatePct : 0)     // Firework Rapid Display
    + (b.djBoostT > 0 ? b.djBoostPct || 0 : 0)                             // DJ Babyface's Drop the Beat
    + (b._heroDecree || 0);                                                // the Brisket King's Royal Decree
  return cfg.fireInterval / (1 + pct / 100) / lastStand;
}

// ---------- checks (reasons are shown on the buttons) ----------
/** Can the RV Lab pick this option now? `tier` defaults to the type's next tier. { ok, reason, cost, tier } */
export function checkResearch(state, type, path, tier = nextResearchTier(state, type)) {
  const count = labTierCount(state, type);
  if (!tier) return { ok: false, reason: 'Fully researched', cost: null, tier: null };
  if (tier <= count) {
    const took = labPicks(state, type)[tier - 1];
    return { ok: false, reason: took === path ? 'Already researched' : `Took Path ${took.toUpperCase()}`, cost: null, tier };
  }
  const cost = isResearchFree(state) ? 0 : researchCost(tier);
  if (tier > count + 1) return { ok: false, reason: `Research tier ${count + 1} first`, cost, tier };
  const lab = labLevel(state);
  if (!lab) {
    const ruin = state.buildings.some((b) => b.type === 'rvlab');
    return { ok: false, reason: ruin ? 'Rebuild the RV Lab' : 'Build an RV Lab', cost, tier };
  }
  if (tier > lab) return { ok: false, reason: `Needs RV Lab level ${tier}`, cost, tier };
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave', cost, tier };
  if (researchPoints(state) < cost) return { ok: false, reason: needRpReason(cost, researchPoints(state)), cost, tier };
  return { ok: true, reason: '', cost, tier };
}

/** Could the RV Lab pick (and pay for) a tier for this type right now? */
export function canResearchFor(state, type) {
  return PATH_KEYS.some((p) => checkResearch(state, type, p).ok);
}

/** Is there research the player could do right now, and afford? (The research book over the RV Lab.) */
export function canResearchSomething(state) {
  if (isWaveActive(state) || !labLevel(state)) return false;
  return ABILITY_TYPES.some((type) => canResearchFor(state, type));
}

// ---------- save data ----------
/** Research as saved: { type: "aba" } (tier 1 first) for every type with any picks. */
export function serializeResearch(research) {
  const out = {};
  for (const type of ABILITY_TYPES) {
    const picks = (research && research[type]) || [];
    if (Array.isArray(picks) && picks.length) out[type] = picks.join('');
  }
  return out;
}

const PICKS_RE = new RegExp(`^[abc]{1,${MAX_TIER}}$`);

/** Is a saved research object well formed? (Missing = none, which is fine.) { type: "aba" }. */
export function validResearch(obj) {
  if (obj === undefined) return true;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  return Object.entries(obj).every(([type, v]) => hasAbilities(type) && typeof v === 'string' && PICKS_RE.test(v));
}

export function deserializeResearch(obj) {
  const out = {};
  for (const [type, v] of Object.entries(obj || {})) out[type] = v.split('');
  return out;
}

// Before the RV Lab applied its picks to every building (save version 4 and older), research was a set of
// options per path ({ a: [1, 2], b: [1], c: [] }, or [A count, B count] even earlier) and each building
// bought its own tiers (picks "aba", or [A tiers, B tiers] even earlier).
const OLD_RESEARCH_COSTS = [40, 120, 300, 700, 1500];
const validTier = (v) => Number.isInteger(v) && v >= 0 && v <= MAX_TIER;

/** The old researched tiers of a path, or null if malformed. */
function oldTiers(v, path) {
  if (Array.isArray(v)) {
    if (v.length !== 2 || !v.every(validTier)) return null;
    const n = path === 'a' ? v[0] : path === 'b' ? v[1] : 0;
    return Array.from({ length: n }, (_, i) => i + 1);
  }
  if (!v || typeof v !== 'object') return null;
  const list = v[path] || [];
  return Array.isArray(list) && list.every((t) => validTier(t) && t >= 1) ? list : null;
}

/** An old building's picks (['a', 'b']) from "ab" or [A tiers, B tiers]. */
function oldBuildingPicks(s) {
  if (typeof s.picks === 'string' && /^[abc]*$/.test(s.picks)) return s.picks.split('');
  if (Array.isArray(s.paths) && s.paths.length === 2 && s.paths.every(validTier)) {
    const [a, b] = s.paths;
    return a >= b ? Array(a).fill('a') : Array(b).fill('b');
  }
  return [];
}

/**
 * Old research + old buildings -> the one-pick-per-tier research. For each type, tier by tier: of the options
 * researched at that tier, keep the one most of its buildings bought (the first researched path when none
 * did); stop at the first tier with nothing researched. Options researched but not kept are refunded at the
 * old research prices. Returns { research: { type: "aba" }, refund }.
 */
export function convertOldResearch(oldResearch, buildings) {
  const research = {};
  let refund = 0;
  if (!oldResearch || typeof oldResearch !== 'object' || Array.isArray(oldResearch)) return { research, refund };
  for (const [type, v] of Object.entries(oldResearch)) {
    if (!hasAbilities(type)) continue;
    const tiers = Object.fromEntries(PATH_KEYS.map((p) => [p, oldTiers(v, p)]));
    if (PATH_KEYS.some((p) => !tiers[p])) continue;
    const owners = (Array.isArray(buildings) ? buildings : []).filter((s) => s && s.type === type).map(oldBuildingPicks);
    const picks = [];
    for (let t = 1; t <= MAX_TIER; t++) {
      const options = PATH_KEYS.filter((p) => tiers[p].includes(t));
      if (!options.length) break;
      const votes = (p) => owners.filter((o) => o[t - 1] === p).length;
      picks.push(options.reduce((best, p) => (votes(p) > votes(best) ? p : best), options[0]));
    }
    for (const p of PATH_KEYS) for (const t of tiers[p]) if (picks[t - 1] !== p) refund += OLD_RESEARCH_COSTS[t - 1] || 0;
    if (picks.length) research[type] = picks.join('');
  }
  return { research, refund };
}

/** Ring / pool / burn numbers that depend on a building's level (Tower of Rah's beam damage per second). */
export function baseDps(b) {
  return CONFIG.defenses[b.type].levels[b.level - 1].dps || 0;
}
