// Ability effects that run on their own clock rather than on a shot landing:
//   - specials that charge up and go off when there's something to hit: Locklair Arrow Storm, Gandolf Meteor,
//     Firework Finale (a salvo of rockets),
//   - strikes: an Arrow Storm or Meteor called down on a spot hits ABILITY_RULES.strikeDelay seconds later,
//   - Path C specials: Locklair Toxic Cloud, Mortar Earthquake, Gandolf Time Warp, Firework Starfall,
//     F.L.O.C.K System Crash (Diddypult Oil Barrage reuses the salvo),
//   - enemy status timers: burning / bleeding, poison, vulnerability (Hex, Spotlight, Tenderizer), Melt Armor,
//   - building effects: Cannon Self-Repair and the Last Stand timer.
// Tower of Rah's Fire Ring / Solar Flare live in beams.js; per-shot effects in combat.js.
import { ABILITY_RULES } from '../abilityConfig.js';
import { levelStats, maxHp } from './buildings.js';
import { abilityFx, towerDamageMult, towerRange } from './abilities.js';
import { applySplash, areaDamage, areaPack, createPool, damageEnemy, fireDefense, isShooter, validTargets, createStrike, poisonEnemy, applySlow, applyStun, enemyIsAir, fireLine } from './combat.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { knockback } from './motion.js';
import { typeConfig } from './buildings.js';
import { distance } from './iso.js';
import { emit, isWaveActive, nextId, random } from './util.js';

/** The valid target with the most other enemies within `radius` of it (ties: most HP), or null. */
export function crowdTarget(state, b, radius) {
  const list = validTargets(state, b);
  let best = null, bestN = -1;
  for (const e of list) {
    let n = 0;
    for (const o of state.enemies) if (o !== e && o.alive && distance(e.x, e.y, o.x, o.y) <= radius) n++;
    if (n > bestN || (n === bestN && e.hp > best.hp)) { best = e; bestN = n; }
  }
  return best;
}

// (createStrike lives in combat.js, so a landing shell can call down an Aftershock.)
export { createStrike };

/** Count strikes down; each one that lands splashes its area (and a Meteor leaves a fire field). */
export function stepStrikes(state, dt) {
  if (!state.strikes || !state.strikes.length) return;
  for (const s of state.strikes) {
    s.t -= dt;
    if (s.t > 0 || s.done) continue;
    s.done = true;
    applySplash(state, s.x, s.y, s.radius, s.damage, s.hitsGround ?? true, s.hitsAir ?? true, s.kind, { source: s.kind });
    if (s.pool) createPool(state, s.x, s.y, s.pool, 'fire');
    if (state.gameOver) return;
  }
  state.strikes = state.strikes.filter((s) => !s.done);
}

/** Specials charge while a wave is on (paused when the tower is down) and fire when there's a target. */
function charge(b, key, every, dt) {
  b[key] = Math.min(every, (b[key] || 0) + dt);
  return b[key] >= every;
}

/** Every enemy within `range` of a tower's center that `pick` accepts. */
function inRange(state, b, range, pick = () => true) {
  const c = footprintCenter(b);
  return state.enemies.filter((e) => e.alive && pick(e) && distance(c.x, c.y, e.x, e.y) <= range);
}

/** A special that hits everyone in range at once went off: the view draws a ring of `kind` around the tower. */
function areaFx(state, b, kind, radius) {
  const c = footprintCenter(b);
  emit(state, 'areaSpecial', { id: b.id, kind, x: c.x, y: c.y, radius });
}

/** F.L.O.C.K System Crash (the F.L.O.C.K never shoots, so it has its own clock). */
function stepSupportSpecials(state, b, dt) {
  const fx = abilityFx(b);
  // Override: the toughest enemy in range is hacked and turns on its friends for a while.
  if (fx.overrideEvery && charge(b, 'overrideT', fx.overrideEvery, dt)) {
    const pick = inRange(state, b, towerRange(b), (e) => !(e.hackedT > 0)).sort((x, y) => y.hp - x.hp)[0];
    if (pick) {
      b.overrideT = 0;
      pick.hackedT = fx.overrideSeconds;
      emit(state, 'hacked', { id: pick.id, x: pick.x, y: pick.y });
    }
  }
  if (!fx.crashEvery || !charge(b, 'crashT', fx.crashEvery, dt)) return;
  const range = towerRange(b);
  const hit = inRange(state, b, range);
  if (!hit.length) return;
  b.crashT = 0;
  for (const e of hit) applyStun(e, fx.crashStun);
  areaFx(state, b, 'systemCrash', range);
}

export function stepSpecials(state, dt) {
  if (!isWaveActive(state)) return;
  for (const b of state.buildings) {
    if (b.destroyed) continue;
    if (b.type === 'flock') { stepSupportSpecials(state, b, dt); continue; }
    if (!isShooter(b)) continue;
    const fx = abilityFx(b);
    if (!fx.stormEvery && !fx.meteorEvery && !fx.salvoEvery && !fx.cloudEvery && !fx.quakeEvery && !fx.warpEvery && !fx.starfallEvery
      && !fx.flakEvery && !fx.broadsideEvery && !fx.volleyEvery && !fx.decoyEvery && !fx.showEvery && !fx.floodEvery) continue;
    stepTowerSpecials(state, b, fx, dt);
    if (state.gameOver) return;
    if (!fx.stormEvery && !fx.meteorEvery && !fx.salvoEvery && !fx.cloudEvery && !fx.quakeEvery && !fx.warpEvery && !fx.starfallEvery) continue;
    const dmg = levelStats(b.type, b.level).damage * towerDamageMult(b);
    if (fx.stormEvery && charge(b, 'stormT', fx.stormEvery, dt)) {
      const t = crowdTarget(state, b, fx.stormRadius);
      if (t) {
        b.stormT = 0;
        createStrike(state, { kind: 'arrowStorm', sourceId: b.id, x: t.x, y: t.y, radius: fx.stormRadius, damage: dmg * fx.stormMult });
      }
    }
    if (fx.meteorEvery && charge(b, 'meteorT', fx.meteorEvery, dt)) {
      const t = crowdTarget(state, b, fx.meteorRadius);
      if (t) {
        b.meteorT = 0;
        const burn = fx.burnDps || 0.3;
        createStrike(state, {
          kind: 'meteor', sourceId: b.id, x: t.x, y: t.y, radius: fx.meteorRadius, damage: dmg * fx.meteorMult,
          pool: { radius: fx.meteorRadius, duration: 5, dps: dmg * burn, slow: fx.burnSlow || 0 }
        });
      }
    }
    if (fx.salvoEvery && charge(b, 'salvoT', fx.salvoEvery, dt)) {
      const targets = validTargets(state, b);
      if (targets.length) {
        b.salvoT = 0;
        for (let i = 0; i < fx.salvoCount; i++) fireDefense(state, b, targets[Math.floor(random(state) * targets.length)]);
        emit(state, 'salvo', { id: b.id, count: fx.salvoCount });
      }
    }
    // Locklair Toxic Cloud: poisons everything it could shoot.
    if (fx.cloudEvery && charge(b, 'cloudT', fx.cloudEvery, dt)) {
      const targets = validTargets(state, b);
      if (targets.length) {
        b.cloudT = 0;
        for (const e of targets) poisonEnemy(e, dmg * fx.poisonDps * areaPack(e), fx.poisonSeconds || 3, fx.poisonSlow || 0, fx.poisonSpread || 0);
        areaFx(state, b, 'toxicCloud', towerRange(b));
      }
    }
    // Mortar Earthquake: every ground enemy in range is stunned and hit hard.
    if (fx.quakeEvery && charge(b, 'quakeT', fx.quakeEvery, dt)) {
      const range = towerRange(b);
      const hit = inRange(state, b, range, (e) => !enemyIsAir(e));
      if (hit.length) {
        b.quakeT = 0;
        areaFx(state, b, 'earthquake', range);
        for (const e of hit) { applyStun(e, fx.quakeStun); areaDamage(state, e, dmg * fx.quakeMult, 'quake'); }
        if (state.gameOver) return;
      }
    }
    // Gandolf Time Warp: everything in range slows down.
    if (fx.warpEvery && charge(b, 'warpT', fx.warpEvery, dt)) {
      const range = towerRange(b);
      const hit = inRange(state, b, range);
      if (hit.length) {
        b.warpT = 0;
        for (const e of hit) applySlow(e, fx.warpSlow, fx.warpSeconds);
        areaFx(state, b, 'timeWarp', range);
      }
    }
    // Firework Starfall: every flyer in range is hit.
    if (fx.starfallEvery && charge(b, 'starfallT', fx.starfallEvery, dt)) {
      const range = towerRange(b);
      const hit = inRange(state, b, range, (e) => enemyIsAir(e));
      if (hit.length) {
        b.starfallT = 0;
        areaFx(state, b, 'starfall', range);
        for (const e of hit) areaDamage(state, e, dmg * fx.starfallMult, 'starfall');
        if (state.gameOver) return;
      }
    }
  }
}

/**
 * The specials that make each tower's path its own: Cannon Flak Burst and Broadside, Locklair Volley Lock,
 * Firework Decoy Flare and Grand Display, Diddypult Oil Tanker.
 */
function stepTowerSpecials(state, b, fx, dt) {
  const c = footprintCenter(b);
  const dmg = typeConfig(b.type).levels[b.level - 1].damage * towerDamageMult(b);
  // Cannon Flak Burst: a flyer close by gets an air burst (cannons can't normally hit flyers).
  if (fx.flakEvery && charge(b, 'flakT', fx.flakEvery, dt)) {
    const flyer = inRange(state, b, fx.flakRange, (e) => enemyIsAir(e)).sort((x, y) => distance(c.x, c.y, x.x, x.y) - distance(c.x, c.y, y.x, y.y))[0];
    if (flyer) {
      b.flakT = 0;
      emit(state, 'flak', { id: b.id, x: flyer.x, y: flyer.y });
      damageEnemy(state, flyer, dmg, 'flak');
      if (state.gameOver) return;
    }
  }
  // Cannon Broadside: a fan of cannonballs toward its target, each punching through 2 enemies.
  if (fx.broadsideEvery && charge(b, 'broadsideT', fx.broadsideEvery, dt)) {
    const t = validTargets(state, b)[0];
    if (t) {
      b.broadsideT = 0;
      const a0 = Math.atan2(t.y - c.y, t.x - c.x), n = fx.broadsideCount, spread = Math.PI / 3;
      for (let i = 0; i < n; i++) {
        const a = a0 - spread / 2 + (spread * i) / Math.max(1, n - 1);
        fireLine(state, c.x, c.y, Math.cos(a), Math.sin(a), { kind: 'cannon', sourceId: b.id, tower: b.type, speed: 12, travel: towerRange(b) + 1, pierce: 2, damage: dmg });
      }
      emit(state, 'broadside', { id: b.id });
    }
  }
  // Locklair Volley Lock: an arrow at every enemy in range at once.
  if (fx.volleyEvery && charge(b, 'volleyT', fx.volleyEvery, dt)) {
    const targets = validTargets(state, b).slice(0, 20);
    if (targets.length) {
      b.volleyT = 0;
      for (const t of targets) fireDefense(state, b, t);
      emit(state, 'volleyLock', { id: b.id, count: targets.length });
    }
  }
  // Firework Decoy Flare: flyers in range chase a decoy away from your buildings for a while.
  if (fx.decoyEvery && charge(b, 'decoyT', fx.decoyEvery, dt)) {
    const flyers = inRange(state, b, towerRange(b), (e) => enemyIsAir(e));
    if (flyers.length) {
      b.decoyT = 0;
      for (const e of flyers) {
        const dx = e.x - c.x, dy = e.y - c.y, len = Math.hypot(dx, dy) || 1;
        e.decoyT = fx.decoySeconds;
        e.decoyX = c.x + (dx / len) * (towerRange(b) + 3);
        e.decoyY = c.y + (dy / len) * (towerRange(b) + 3);
      }
      emit(state, 'decoyFlare', { id: b.id, x: c.x, y: c.y, radius: towerRange(b) });
    }
  }
  // Firework Grand Display: every flyer on the whole map is hit.
  if (fx.showEvery && charge(b, 'showT', fx.showEvery, dt)) {
    const flyers = state.enemies.filter((e) => e.alive && enemyIsAir(e));
    if (flyers.length) {
      b.showT = 0;
      emit(state, 'grandDisplay', { id: b.id, points: flyers.map((e) => ({ x: e.x, y: e.y })) });
      for (const e of flyers) areaDamage(state, e, dmg * fx.showMult, 'show');
      if (state.gameOver) return;
    }
  }
  // Diddypult Oil Tanker: a pool under every ground enemy in range at once.
  if (fx.floodEvery && charge(b, 'floodT', fx.floodEvery, dt)) {
    const ground = validTargets(state, b).filter((e) => !enemyIsAir(e)).slice(0, 12);
    if (ground.length) {
      b.floodT = 0;
      const cfg = typeConfig(b.type), lvl = cfg.levels[b.level - 1];
      for (const e of ground) createPool(state, e.x, e.y, { radius: cfg.pool.radius, duration: cfg.pool.duration, dps: lvl.poolDps, slow: cfg.pool.slow }, 'catapult');
      emit(state, 'oilTanker', { id: b.id });
    }
  }
}

/** Cannon Self-Repair (heals during attacks) and the Last Stand timer. */
export function stepAbilityBuildings(state, dt) {
  const attack = isWaveActive(state);
  for (const b of state.buildings) {
    if (b.lastStandT > 0) b.lastStandT = Math.max(0, b.lastStandT - dt);
    if (b.counterT > 0) b.counterT = Math.max(0, b.counterT - dt);     // Counter-Flare cooldown
    if (b.celebrateT > 0) b.celebrateT = Math.max(0, b.celebrateT - dt); // a Firework's Celebration
    if (attack && !b.destroyed && b.picks && b.picks.length) stepTowerAura(state, b, abilityFx(b), dt);
    if (!attack || b.destroyed || !b.picks || !b.picks.length) continue;
    const regen = abilityFx(b).regen;
    if (!regen) continue;
    const max = maxHp(b);
    if (b.hp < max) b.hp = Math.min(max, b.hp + max * regen * dt);
  }
}

/** Diddypult Oil Moat (slows ground enemies around it) and Gandolf Blink (sends enemies that reach it back). */
function stepTowerAura(state, b, fx, dt) {
  if (fx.moatRadius) {
    const c = footprintCenter(b);
    for (const e of state.enemies) {
      if (e.alive && !enemyIsAir(e) && distance(c.x, c.y, e.x, e.y) <= fx.moatRadius) applySlow(e, fx.moatSlow, 0.3);
    }
  }
  if (fx.blinkDist) {
    const c = footprintCenter(b);
    for (const e of state.enemies) {
      if (!e.alive || e.blinked || enemyIsAir(e) || distanceToFootprint(b, e.x, e.y) > fx.blinkRange) continue;
      e.blinked = true;
      const from = { x: e.x, y: e.y };
      knockback(state, e, e.x - c.x, e.y - c.y, fx.blinkDist);
      e.entry = null;
      emit(state, 'blink', { id: e.id, from, to: { x: e.x, y: e.y } });
    }
  }
}

/** Burning and poisoned enemies take damage in ticks; vulnerability and Melt Armor wear off. */
export function stepEnemyStatus(state, dt) {
  const tick = ABILITY_RULES.burnTick;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e.vulnTimer > 0) e.vulnTimer = Math.max(0, e.vulnTimer - dt);
    if (e.meltTimer > 0) e.meltTimer = Math.max(0, e.meltTimer - dt);
    for (const k of ['disarmT', 'inPoolT', 'inFireT', 'markLingerT']) if (e[k] > 0) e[k] = Math.max(0, e[k] - dt);
    if (e.poisonTime > 0) {
      const t = Math.min(dt, e.poisonTime);
      e.poisonTime -= t;
      e.poisonAge = (e.poisonAge || 0) + t; // Festering: poison burns hotter the longer it lasts
      if (e.poisonSlow) applySlow(e, e.poisonSlow, tick); // Crippling
      e.poisonTick = (e.poisonTick || 0) + t;
      while (e.poisonTick >= tick - 1e-9 && e.alive) {
        e.poisonTick -= tick;
        damageEnemy(state, e, e.poisonDps * tick * (1 + (e.poisonRamp || 0) * (e.poisonAge || 0)), 'poison');
        if (state.gameOver) return;
      }
      if (e.poisonTime <= 0) { e.poisonSlow = 0; e.poisonSpread = 0; }
    }
    if (e.burnTime > 0) {
      const t = Math.min(dt, e.burnTime);
      e.burnTime -= t;
      e.burnTick = (e.burnTick || 0) + t;
      while (e.burnTick >= tick - 1e-9 && e.alive) {
        e.burnTick -= tick;
        damageEnemy(state, e, e.burnDps * tick, 'burn');
        if (state.gameOver) return;
      }
    }
  }
}

/** Tower types whose specials are on a timer (for the view's charge-up hints). */
export function hasSpecial(b) {
  const fx = abilityFx(b);
  return !!(fx.stormEvery || fx.meteorEvery || fx.salvoEvery || fx.flareEvery || fx.cloudEvery || fx.quakeEvery || fx.warpEvery || fx.starfallEvery || fx.crashEvery);
}

