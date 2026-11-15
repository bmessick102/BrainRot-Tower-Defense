// Mousetraps: hidden 1-tile traps. Enemies can't see them, so they never target them, never path around
// them and walk right over them (traps can't be damaged). The first ground enemy to step onto a set trap
// springs it: every ground enemy within its catch radius takes its damage and is held in place (can't
// move or attack) for its hold time. Flyers are never caught. A sprung trap stays sprung for the rest of
// the wave and resets when the wave is cleared.
//
// RV Lab abilities: Bear Trap (trapRadiusAdd, damagePct, holdAdd, and `rearms`: it sets itself again
// ABILITY_RULES.trapRearmSeconds after snapping, that many times per wave) and Sticky Trap (a glue pool
// where it snaps, heldVuln: caught enemies take more damage while held, and lureRadius: Cheese Bait pulls
// ground enemies that close onto the trap).
import { CONFIG } from '../config.js';
import { ABILITY_RULES } from '../abilityConfig.js';
import { levelStats } from './buildings.js';
import { abilityFx, towerDamageMult } from './abilities.js';
import { footprintCenter, isInsideFootprint } from './grid.js';
import { distance } from './iso.js';
import { damageEnemy, areaDamage, areaPack, createPool, burnEnemy, applySplash, fireLine } from './combat.js';
import { emit, isWaveActive } from './util.js';

/** Is this a trap type (hidden from enemies, sprung by walking onto it)? */
export function isTrap(type) {
  const cfg = CONFIG.defenses[type];
  return !!(cfg && cfg.trap);
}

/** Damage and hold time (s) of a trap at this level (before abilities). */
export function trapStats(type, level) {
  const l = levelStats(type, level);
  return { damage: l.damage, hold: l.hold, radius: CONFIG.defenses[type].range };
}

/** A trap building's stats with its ability tiers applied. */
export function trapStatsFor(b) {
  const base = trapStats(b.type, b.level);
  const fx = abilityFx(b);
  return { damage: base.damage * towerDamageMult(b), hold: base.hold + (fx.holdAdd || 0), radius: base.radius + (fx.trapRadiusAdd || 0) };
}

// (A Skibidi Toilet tunneling unseen passes under traps.)
const groundEnemy = (e) => e.alive && CONFIG.enemies[e.kind].type !== 'air' && !(e.landing > 0) && !(e.underground && !e.flockSeen);

/** Spring any set trap a ground enemy is standing on; re-arm traps that can; set Cheese Bait lures. */
export function stepTraps(state, dt = 0) {
  if (!isWaveActive(state)) return;
  for (const b of state.buildings) {
    if (!isTrap(b.type) || b.destroyed) continue;
    if (b.sprung) {
      // Spring Back / Auto-Reset: set again a little while after snapping.
      if (b.rearmTimer > 0) {
        b.rearmTimer -= dt;
        if (b.rearmTimer <= 0) {
          b.rearmTimer = 0;
          b.sprung = false;
          b.rearmsUsed = (b.rearmsUsed || 0) + 1;
          emit(state, 'trapRearmed', { id: b.id });
        }
      }
      continue;
    }
    const trigger = state.enemies.find((e) => groundEnemy(e) && isInsideFootprint(b, e.x, e.y));
    if (trigger) { springTrap(state, b, trigger); continue; }
    const lure = abilityFx(b).lureRadius;
    if (lure) {
      // Cheese Bait: every ground enemy this close heads straight for the trap (enemies.js walks them).
      const c = footprintCenter(b);
      for (const e of state.enemies) {
        if (!groundEnemy(e) || e.lureId || e.lureRefused === b.id || e.held > 0) continue;
        if (distance(c.x, c.y, e.x, e.y) <= lure) { e.lureId = b.id; e.lureX = c.x; e.lureY = c.y; }
      }
    }
  }
}

/** Snap a trap: damage and hold every ground enemy within its catch radius. */
export function springTrap(state, b, trigger = null) {
  const { damage, hold, radius } = trapStatsFor(b);
  const fx = abilityFx(b);
  const c = footprintCenter(b);
  b.sprung = true;
  const caught = state.enemies.filter((e) => groundEnemy(e) && distance(c.x, c.y, e.x, e.y) <= radius);
  emit(state, 'trapSprung', { id: b.id, x: c.x, y: c.y, radius, caught: caught.map((e) => e.id) });
  // Lured enemies are free again (the bait is gone).
  for (const e of state.enemies) if (e.lureId === b.id) e.lureId = null;
  for (const e of caught) {
    // Gum Up: a caught Wall Breaker is defused and falls apart (no blast; it still pays its bounty).
    if (fx.defuse && e.kind === 'breaker') {
      e.exploded = true;
      emit(state, 'defused', { id: e.id, x: e.x, y: e.y });
      damageEnemy(state, e, e.hp + 1, 'trap');
      continue;
    }
    e.held = Math.max(e.held || 0, hold + (fx.triggerHoldAdd && e === trigger ? fx.triggerHoldAdd : 0)); // Snare
    if (fx.heldVuln) { e.vuln = Math.max(e.vulnTimer > 0 ? e.vuln || 0 : 0, fx.heldVuln); e.vulnTimer = Math.max(e.vulnTimer || 0, hold); }
    areaDamage(state, e, damage * (fx.jawLock && e.hp > (e.maxHp || 0) / 2 ? 2 : 1), 'trap'); // Jaw Lock
    if (fx.bleed) burnEnemy(e, damage * fx.bleed * areaPack(e), hold); // Barbed: bleeds while held
  }
  // Spike Trap: spikes left where it snapped, and the Booby Trap blast (ground and air).
  if (fx.spikeDps) createPool(state, c.x, c.y, { radius: radius + (fx.spikeRadiusAdd || 0), duration: fx.spikeSeconds, dps: damage * fx.spikeDps, slow: 0 }, 'spikes');
  if (fx.boobyMult) applySplash(state, c.x, c.y, fx.boobyRadius, damage * fx.boobyMult, true, true, 'booby');
  // Shrapnel Spring: spikes fly out in every direction, each stopping at the first enemy it meets.
  if (fx.spikeShots) {
    for (let i = 0; i < fx.spikeShots; i++) {
      const a = (i * Math.PI * 2) / fx.spikeShots;
      fireLine(state, c.x, c.y, Math.cos(a), Math.sin(a), { kind: 'pellet', sourceId: b.id, tower: b.type, speed: 14, travel: fx.spikeShotRange, pierce: 1, damage: damage * fx.spikeShotDamage });
    }
  }
  if (fx.glueSlow) {
    createPool(state, c.x, c.y, {
      radius: ABILITY_RULES.glueRadius + (fx.glueRadiusAdd || 0), duration: fx.glueDuration, dps: 0, slow: fx.glueSlow, stick: fx.glueStick || 0
    }, 'glue');
  }
  if ((fx.rearms || 0) > (b.rearmsUsed || 0)) b.rearmTimer = ABILITY_RULES.trapRearmSeconds;
}

/** The wave is over: every trap is set again. */
export function resetTraps(state) {
  for (const b of state.buildings) {
    if (!isTrap(b.type)) continue;
    b.sprung = false;
    b.rearmTimer = 0;
    b.rearmsUsed = 0;
  }
}
