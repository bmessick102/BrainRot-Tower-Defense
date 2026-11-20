// Research points (RP; players see them as Burgers, see RP_NAME): the currency for RV Lab perks.
// Earned by defeating enemies (CONFIG.enemies[kind].researchPoints each) and surviving nights
// (CONFIG.rules.researchPointsPerWave x the wave number). Capped (rpCap: grows with the RV Lab's level; extra is
// lost). Saved with the village (state.researchPoints). RP pays for perks, path respecs and any building level
// with `costCurrency: 'rp'` (the RV Lab's upgrades); gold builds buildings.
import { CONFIG } from '../config.js';
import { emit } from './util.js';

// ---------- what players call it ----------
// The code, saves and config all say rp / researchPoints; every player-facing text says Burgers (0.5.0).
// tests/burgerText.test.js checks that no player-facing string says "RP" or "research points" again.
export const RP_NAME = 'Burgers';
export const RP_NAME_ONE = 'Burger';

/** "1 Burger", "1,200 Burgers" (whole numbers, with thousands commas). */
export function rpText(n) {
  const v = Math.floor(n || 0);
  return `${v.toLocaleString('en-US')} ${v === 1 ? RP_NAME_ONE : RP_NAME}`;
}

export function researchPoints(state) {
  return state.researchPoints || 0;
}

/** The highest RV Lab level in the village (ruins count, so a night's damage never shrinks the cap). */
function labLevelForCap(state) {
  let lvl = 0;
  for (const b of state.buildings || []) if (b.type === 'rvlab') lvl = Math.max(lvl, b.level);
  return lvl;
}

/** The most RP the village can hold: grows with the RV Lab's level (CONFIG.rules.rpCaps, index 0 = no lab). */
export function rpCap(state) {
  const caps = CONFIG.rules.rpCaps;
  return caps[Math.min(labLevelForCap(state), caps.length - 1)];
}

/**
 * Add RP up to the cap (and count what was kept toward tonight's total for the wave-cleared banner). RP beyond
 * the cap is lost: the 'researchPointsChanged' event says how much (`lost`). Returns the amount actually added.
 */
export function addResearchPoints(state, amount) {
  const want = Math.max(0, Math.round(amount || 0));
  if (!want) return 0;
  const room = Math.max(0, rpCap(state) - researchPoints(state));
  const n = Math.min(want, room);
  const lost = want - n;
  if (n) {
    state.researchPoints = researchPoints(state) + n;
    if (state.wave && state.wave.phase === 'active') state.wave.rpEarned = (state.wave.rpEarned || 0) + n;
  }
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints || 0, added: n, lost });
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
