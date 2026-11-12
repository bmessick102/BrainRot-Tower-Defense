// Tower of Rah: a beam tower (like Clash of Clans' Inferno Tower). It locks onto the enemy with the most
// health (current HP) in range, ground or air, and burns it with a continuous beam whose damage heats up
// the longer it stays on that one enemy: CONFIG.defenses.ra.stages ({ after: seconds, mult }). When the
// target dies, leaves range or turns invisible, the beam drops back to the first stage on a new target.
// Damage is dealt in ticks of tickInterval seconds (source 'beam').
import { CONFIG } from '../config.js';
import { isValidTarget, damageEnemy, findEnemy } from './combat.js';
import { levelStats } from './buildings.js';
import { emit } from './util.js';

/** Is this a beam tower type? */
export function isBeam(type) {
  const cfg = CONFIG.defenses[type];
  return !!(cfg && cfg.beam);
}

/** Heat stage (0-based) after locking onto one enemy for \`seconds\`, and its damage multiplier. */
export function beamStage(type, seconds) {
  const stages = CONFIG.defenses[type].stages;
  let i = 0;
  for (let k = 0; k < stages.length; k++) if (seconds >= stages[k].after) i = k;
  return { index: i, mult: stages[i].mult };
}

/** The enemy with the most health in range (ties: the first found). */
function strongestInRange(state, b) {
  let best = null;
  for (const e of state.enemies) {
    if (!isValidTarget(b, e)) continue;
    if (!best || e.hp > best.hp) best = e;
  }
  return best;
}

/** Every beam tower: keep (or pick) its target, heat up, and burn it. */
export function stepBeams(state, dt) {
  for (const b of state.buildings) {
    if (!isBeam(b.type)) continue;
    if (b.destroyed) { b.beamTargetId = null; b.beamTime = 0; continue; }
    let target = findEnemy(state, b.beamTargetId);
    if (!isValidTarget(b, target)) {
      target = strongestInRange(state, b);
      b.beamTargetId = target ? target.id : null;
      b.beamTime = 0;   // a new target starts cold
      b.beamStage = 0;
      b.beamTick = 0;
    }
    if (!target) continue;
    b.beamTime = (b.beamTime || 0) + dt;
    const stage = beamStage(b.type, b.beamTime);
    // Heating up to a hotter stage: 'beamHeatUp' (its sound).
    if (stage.index > (b.beamStage || 0)) emit(state, 'beamHeatUp', { id: b.id, stage: stage.index, targetId: target.id });
    b.beamStage = stage.index;
    const cfg = CONFIG.defenses[b.type];
    const dps = levelStats(b.type, b.level).dps;
    b.beamTick = (b.beamTick || 0) + dt;
    while (b.beamTick >= cfg.tickInterval && target.alive) {
      b.beamTick -= cfg.tickInterval;
      damageEnemy(state, target, dps * stage.mult * cfg.tickInterval, 'beam');
    }
    if (!target.alive) { b.beamTargetId = null; b.beamTime = 0; b.beamTick = 0; }
  }
}
