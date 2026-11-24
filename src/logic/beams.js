// Tower of Rah: a beam tower (like Clash of Clans' Inferno Tower). It locks onto the enemy with the most
// health (current HP) in range, ground or air, and burns it with a continuous beam whose damage heats up
// the longer it stays on that one enemy: CONFIG.defenses.ra.stages ({ after: seconds, mult }). When the
// target dies, leaves range (by more than `leash` tiles: a locked beam holds on a little past its range) or turns
// invisible, the beam drops back to the first stage on a new target.
// Damage is dealt in ticks of tickInterval seconds (source 'beam').
//
// RV Lab abilities (src/abilityConfig.js):
//   Sun Ring: heats up faster (heatPct), a Fire Ring that burns everything near the tower (ringRadius,
//     ringDps x the beam's base damage per second, ringSlow), and a Solar Flare pulse (flareEvery, flareMult).
//   Prism: each beam chains to `chains` more enemies near its target for chainPct of its damage (with the
//     heat bonus once chainHeat is owned), and `beams` separate beams each lock onto their own enemy.
// Each tower keeps b.beams = [{ targetId, time, stage, tick, lance }] and, for the view, b.beamChains =
// [{ from, to, stage }] (enemy ids). b.beamTargetId / b.beamStage mirror the first beam.
// Great Pyramid of Rah (merged): a beam hot enough becomes a Solar Lance (solarLance.js): beam.lance is its line in
// tiles ({ x1, y1, x2, y2 }, for the view too) or null; chains never lance.
import { CONFIG } from '../config.js';
import { ABILITY_RULES } from '../abilityConfig.js';
import { isValidTarget, damageEnemy, areaDamage, findEnemy, applySlow, applySplash, burnEnemy } from './combat.js';
import { levelStats, maxHp } from './buildings.js';
import { abilityFx, towerDamageMult } from './abilities.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { emit, isWaveActive } from './util.js';
import { lanceStats, lanceLine, lanceEnemies, blindEnemies, lanceHit, pruneLanceHits } from './solarLance.js';

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

/** The enemy with the most health in range, skipping `exclude` ids (ties: the first found). */
function strongestInRange(state, b, exclude) {
  let best = null;
  const tough = (e) => e.hp + (e.armor || 0); // (armor counts: Bri Bri Bicus Dicus)
  for (const e of state.enemies) {
    if (exclude.has(e.id) || !isValidTarget(b, e)) continue;
    if (!best || tough(e) > tough(best)) best = e;
  }
  return best;
}

/** Enemies near `from` for a chain (nearest first), skipping `exclude` ids. */
function chainTargets(state, from, count, exclude) {
  return state.enemies
    .filter((e) => e.alive && !e.hidden && !exclude.has(e.id) && distance(from.x, from.y, e.x, e.y) <= ABILITY_RULES.beamChainRange)
    .sort((x, y) => distance(from.x, from.y, x.x, x.y) - distance(from.x, from.y, y.x, y.y))
    .slice(0, count);
}

/** Every beam tower: keep (or pick) its targets, heat up, burn them, chain, and run its Fire Ring. */
export function stepBeams(state, dt) {
  for (const b of state.buildings) {
    if (!isBeam(b.type)) continue;
    if (b.destroyed) { b.beams = []; b.beamChains = []; b.beamTargetId = null; b.beamTime = 0; continue; }
    if (b.stunT > 0) { b.beams = []; b.beamChains = []; b.beamTargetId = null; b.beamTime = 0; continue; } // stunned (Quandale)
    const fx = abilityFx(b);
    const cfg = CONFIG.defenses[b.type];
    // (Frigo Camillo's cold aura burns it slower too.)
    const dps = levelStats(b.type, b.level).dps * towerDamageMult(b) * (1 - Math.max(0, Math.min(90, b.frigoSlow || 0)) / 100);
    const heat = 1 + (fx.heatPct || 0) / 100;
    const lance = lanceStats(b); // Great Pyramid of Rah: Solar Lance (null for a plain Tower of Rah)
    if (lance) b._lanceClock = (b._lanceClock || 0) + dt;

    // Keep beams whose targets are still valid; fill free beams with the toughest enemies left.
    if (b.heatMemoryT > 0) b.heatMemoryT -= dt;
    b.beams = (b.beams || []).filter((beam) => {
      const t = findEnemy(state, beam.targetId);
      if (isValidTarget(b, t, cfg.leash || 0)) return true;
      // Heat Memory: remember the heat for a moment; Afterburn: the target it left keeps burning.
      if (fx.heatCarry) { b.heatMemory = beam.time; b.heatMemoryT = 1; }
      if (fx.afterburn && t && t.alive && beam.lastDps) burnEnemy(t, beam.lastDps * fx.afterburn, fx.afterburnSeconds);
      return false;
    });
    const taken = new Set(b.beams.map((beam) => beam.targetId));
    while (b.beams.length < (fx.beams || 1)) {
      const t = strongestInRange(state, b, taken);
      if (!t) break;
      taken.add(t.id);
      // A new target starts cold (Overheat Hot Start: already at the second stage).
      let start = fx.hotStart && cfg.stages[1] ? cfg.stages[1].after / heat : 0;
      if (fx.heatCarry && b.heatMemoryT > 0) { start = Math.max(start, b.heatMemory); b.heatMemoryT = 0; }
      b.beams.push({ targetId: t.id, time: start, stage: beamStage(b.type, start * heat).index, tick: 0 });
    }

    b.beamChains = [];
    for (const beam of b.beams) {
      const target = findEnemy(state, beam.targetId);
      beam.time += dt;
      const stage = beamStage(b.type, beam.time * heat);
      const top = cfg.stages.length - 1;
      // Overheat Hotter Peak: the top stage burns hotter.
      const mult = stage.index === top && fx.peakMult ? Math.max(stage.mult, fx.peakMult) : stage.mult;
      if (fx.scorch) applySlow(target, fx.scorch, 0.3);                                             // Scorch
      if (fx.melt) { target.melt = fx.melt; target.meltTimer = ABILITY_RULES.meltSeconds; }          // Melt Armor
      // Heating up to a hotter stage: 'beamHeatUp' (its sound).
      if (stage.index > beam.stage) emit(state, 'beamHeatUp', { id: b.id, stage: stage.index, targetId: target.id });
      beam.stage = stage.index;
      const chained = fx.chains ? chainTargets(state, target, fx.chains, taken) : [];
      for (const c of chained) b.beamChains.push({ from: target.id, to: c.id, stage: fx.chainHeat ? stage.index : 0 });
      // Solar Lance: hot enough, the beam runs on through its target to the end of the range (Prism: each beam on its own).
      beam.lance = lance && stage.index >= lance.stage ? lanceLine(b, target) : null;
      const lanced = beam.lance ? lanceEnemies(state, beam.lance, lance.halfWidth, target.id) : [];
      if (beam.lance) blindEnemies([target, ...lanced], lance); // Blinding Light (Mastery 3)
      beam.tick += dt;
      while (beam.tick >= cfg.tickInterval && target.alive) {
        beam.tick -= cfg.tickInterval;
        beam.lastDps = dps * mult;
        damageEnemy(state, target, dps * mult * cfg.tickInterval, 'beam');
        for (const c of chained) {
          if (c.alive) damageEnemy(state, c, dps * (fx.chainHeat ? mult : 1) * fx.chainPct * cfg.tickInterval, 'beam');
        }
        // (the tick's moment on the tower's clock: a tick left over from this step happened beam.tick s ago)
        if (lanced.length) lanceHit(state, b, lanced, dps * mult * cfg.tickInterval * lance.mult, b._lanceClock - beam.tick, cfg.tickInterval);
        if (state.gameOver) return;
      }
      // Cauterize: a kill heals the buildings around it.
      if (!target.alive && fx.cauterize) {
        for (const o of state.buildings) {
          if (o.destroyed || o.type === 'wall' || distanceToFootprint(o, target.x, target.y) > fx.cauterizeRadius) continue;
          o.hp = Math.min(maxHp(o), o.hp + maxHp(o) * fx.cauterize);
        }
        emit(state, 'cauterize', { x: target.x, y: target.y, radius: fx.cauterizeRadius });
      }
      // Overheat Supernova: a target killed at full heat explodes.
      if (!target.alive && fx.supernova && stage.index === top) {
        applySplash(state, target.x, target.y, fx.supernovaRadius, dps * mult * fx.supernova, true, true, 'supernova');
        if (state.gameOver) return;
      }
    }
    b.beams = b.beams.filter((beam) => findEnemy(state, beam.targetId)?.alive);
    // The view and the beam sound read the first beam.
    const first = b.beams[0];
    b.beamTargetId = first ? first.targetId : null;
    b.beamStage = b.beams.reduce((m, beam) => Math.max(m, beam.stage), 0);
    b.beamTime = first ? first.time : 0;
    if (lance) pruneLanceHits(b, cfg.tickInterval);

    stepRing(state, b, fx, dt);
    if (state.gameOver) return;
  }
}

/** Sun Ring: burn (and slow) every enemy within ringRadius of the tower; Solar Flare pulses now and then. */
function stepRing(state, b, fx, dt) {
  if (!fx.ringRadius || !isWaveActive(state)) { b.ringTick = 0; b.flareT = 0; return; }
  const c = footprintCenter(b);
  const base = levelStats(b.type, b.level).dps * towerDamageMult(b);
  const inside = state.enemies.filter((e) => e.alive && distance(c.x, c.y, e.x, e.y) <= fx.ringRadius);
  if (fx.ringSlow) for (const e of inside) applySlow(e, fx.ringSlow, ABILITY_RULES.ringTick);
  // Ring of Fire: the longer an enemy stays in the ring, the hotter it burns.
  if (fx.ringRamp) {
    const inSet = new Set(inside);
    for (const e of state.enemies) e.ringT = inSet.has(e) ? (e.ringT || 0) + dt : 0;
  }
  const ramp = (e) => (fx.ringRamp ? Math.min(fx.ringRampMax, 1 + fx.ringRamp * (e.ringT || 0)) : 1);
  b.ringTick = (b.ringTick || 0) + dt;
  while (b.ringTick >= ABILITY_RULES.ringTick) {
    b.ringTick -= ABILITY_RULES.ringTick;
    for (const e of inside) if (e.alive) areaDamage(state, e, base * fx.ringDps * ABILITY_RULES.ringTick * ramp(e), 'ring');
    if (state.gameOver) return;
  }
  if (!fx.flareEvery) return;
  // The flare charges up, and goes off as soon as something is in the ring.
  b.flareT = Math.min(fx.flareEvery, (b.flareT || 0) + dt);
  if (b.flareT < fx.flareEvery || !inside.some((e) => e.alive)) return;
  b.flareT = 0;
  emit(state, 'solarFlare', { id: b.id, x: c.x, y: c.y, radius: fx.ringRadius });
  for (const e of inside) if (e.alive) areaDamage(state, e, base * fx.flareMult, 'flare');
}
