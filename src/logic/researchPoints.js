// Research points (RP): the currency for RV Lab abilities (researching tiers and buying them on buildings).
// Earned by defeating enemies (CONFIG.enemies[kind].researchPoints each) and surviving nights
// (CONFIG.rules.researchPointsPerWave x the wave number). No cap. Saved with the village (state.researchPoints).
// Gold still builds and upgrades the RV Lab itself.
import { CONFIG } from '../config.js';
import { emit } from './util.js';

export function researchPoints(state) {
  return state.researchPoints || 0;
}

/** Add RP (and count them toward tonight's total for the wave-cleared banner). Returns the amount added. */
export function addResearchPoints(state, amount) {
  const n = Math.max(0, Math.round(amount || 0));
  if (!n) return 0;
  state.researchPoints = researchPoints(state) + n;
  if (state.wave && state.wave.phase === 'active') state.wave.rpEarned = (state.wave.rpEarned || 0) + n;
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints, added: n });
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
  return `Need ${(cost - have).toLocaleString('en-US')} more RP`;
}

/** A saved RP balance is valid: missing (older saves) or a non-negative whole number. */
export function validResearchPoints(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0);
}
