// Research points (RP; players see them as Shakes since v0.14, Burgers v0.5-v0.13, see RP_NAME): the currency for RV Lab
// perks, hero levels, merges and spells. Earned by defeating enemies (CONFIG.enemies[kind].researchPoints each),
// surviving nights (CONFIG.rules.researchPointsPerWave x the wave number), Shake Collectors and the Village Hall's own
// trickle (shakes.js). Capped (rpCap: the Village Hall's Shake store plus every Shake Storage; extra is lost). Saved
// with the village (state.researchPoints). RP pays for perks, path respecs and any building level with
// `costCurrency: 'rp'` (the RV Lab's upgrades); gold builds buildings.
import { CONFIG } from '../config.js';
import { emit } from './util.js';
import { abilityFx } from './abilities.js';

// ---------- what players call it ----------
// The code, saves and config all say rp / researchPoints; every player-facing text says Shakes (v0.14; Burgers before).
// tests/burgerText.test.js checks that no player-facing string says "RP", "research points" or "Burger" again.
export const RP_NAME = 'Shakes';
export const RP_NAME_ONE = 'Shake';

/** "1 Shake", "1,200 Shakes" (whole numbers, with thousands commas). */
export function rpText(n) {
  const v = Math.floor(n || 0);
  return `${v.toLocaleString('en-US')} ${v === 1 ? RP_NAME_ONE : RP_NAME}`;
}

export function researchPoints(state) {
  return state.researchPoints || 0;
}

/** The Village Hall's own Shake store at a level (its ruin, level 0, holds the ruin's). */
export function hallShakeCapacity(level) {
  const row = level >= 1 ? CONFIG.townHall.levels[Math.min(level, CONFIG.townHall.levels.length) - 1] : CONFIG.townHall.ruin;
  return (row && row.shakeCapacity) || 0;
}

/** What one Shake Storage holds at a level (CONFIG.shakeStorage). */
export function shakeStorageCapacity(level, building) {
  const L = CONFIG.shakeStorage.levels;
  const base = L[Math.max(1, Math.min(level, L.length)) - 1].capacity;
  return Math.round(base * (1 + (building ? abilityFx(building).capacityPct || 0 : 0) / 100));
}

/**
 * The most RP (Shakes) the village can hold (v0.14): the Village Hall's own store plus every Shake Storage's capacity.
 * Destroyed ones count (as gold's getCapacity), so a night's damage never shrinks the cap. The RV Lab plays no part
 * (it did v0.5-v0.13).
 */
export function rpCap(state) {
  let cap = 0;
  for (const b of state.buildings || []) {
    if (b.type === 'townHall') cap += hallShakeCapacity(b.level);
    else if (b.type === 'shakeStorage') cap += shakeStorageCapacity(b.level, b);
  }
  return cap;
}

/** Room left under the cap (0 when full, or when an older save's balance is over it). */
export function rpRoom(state) {
  return Math.max(0, rpCap(state) - researchPoints(state));
}

/**
 * Add RP up to the cap (and count what was kept toward tonight's total for the wave-cleared banner). RP beyond
 * the cap is lost: the 'researchPointsChanged' event says how much (`lost`). A balance already over the cap (an
 * older save, made when the RV Lab set it) is never cut: it just takes nothing more until it's spent below the cap.
 * `source` (optional) rides on the event: 'hall' (the Village Hall's trickle) and 'collector' (a Shake Collector) don't
 * count toward the wave's total (so not toward its star bonus either). Returns the amount actually added.
 */
export function addResearchPoints(state, amount, source = null) {
  const want = Math.max(0, Math.round(amount || 0));
  if (!want) return 0;
  const n = Math.min(want, rpRoom(state));
  const lost = want - n;
  if (n) {
    state.researchPoints = researchPoints(state) + n;
    const income = source === 'hall' || source === 'collector';
    if (!income && state.wave && state.wave.phase === 'active') state.wave.rpEarned = (state.wave.rpEarned || 0) + n;
  }
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints || 0, added: n, lost, ...(source ? { source } : {}) });
  return n;
}

/** Spend RP if there are enough. Returns true on success. */
export function spendResearchPoints(state, amount) {
  if (researchPoints(state) < amount) return false;
  state.researchPoints = researchPoints(state) - amount;
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints, added: -amount });
  return true;
}

/** RP for defeating one enemy of this kind. */
export function killResearchPoints(kind) {
  return CONFIG.enemies[kind].researchPoints || 0;
}

/** RP for surviving the night of wave `n`. */
export function waveResearchPoints(n) {
  return (CONFIG.rules.researchPointsPerWave || 0) * Math.max(0, n || 0);
}

export function needRpReason(cost, have) {
  const n = Math.max(0, Math.floor(cost - have));
  return `Need ${n.toLocaleString('en-US')} more ${n === 1 ? RP_NAME_ONE : RP_NAME}`;
}

/** A saved RP balance is valid: missing (older saves) or a non-negative whole number. */
export function validResearchPoints(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0);
}
