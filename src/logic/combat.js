// Tower targeting, projectiles (tower and enemy), damage, splash, and building destruction.
import { CONFIG } from '../config.js';
import { typeConfig, isDefense, isSupport, maxHp } from './buildings.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { addGold, setGold, storageDrainAmount } from './economy.js';
import { emit, nextId } from './util.js';
import { enrageFactor } from './enrage.js';

// Which projectile config each defense uses (CONFIG.projectiles keys).
const DEFENSE_PROJECTILE = { cannon: 'cannon', archer: 'archer', mortar: 'mortar', wizard: 'wizard', firework: 'firework', catapult: 'catapult' };

// Pools (Catapult): damage is dealt in ticks of this many seconds (poolDps x POOL_TICK per tick).
export const POOL_TICK = 0.5;
// A slowed enemy stays slowed this long after stepping out of a pool.
export const SLOW_LINGER = 0.25;

export function enemyIsAir(e) {
  return CONFIG.enemies[e.kind].type === 'air';
}

/** Can a defense of this config hit this enemy at all (ground/air)? */
export function canHit(defCfg, e) {
  return enemyIsAir(e) ? defCfg.hitsAir : defCfg.hitsGround;
}

export function findEnemy(state, id) {
  return id ? state.enemies.find((e) => e.id === id) || null : null;
}

export function findBuilding(state, id) {
  return id ? state.buildings.find((b) => b.id === id) || null : null;
}

/** Alive, hittable type, inside range and outside minimum range (measured from the footprint center). */
export function isValidTarget(b, e) {
  if (!e || !e.alive || e.hidden) return false; // invisible enemies can't be aimed at (splash still hits)
  const cfg = typeConfig(b.type);
  if (!canHit(cfg, e)) return false;
  const c = footprintCenter(b);
  const d = distance(c.x, c.y, e.x, e.y);
  return d <= cfg.range && d >= cfg.minRange;
}

/** Keep the current target while valid; otherwise the closest valid enemy (or null). */
export function chooseTarget(state, b) {
  const current = findEnemy(state, b.targetId);
  if (isValidTarget(b, current)) return current;
  const c = footprintCenter(b);
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (!isValidTarget(b, e)) continue;
    const d = distance(c.x, c.y, e.x, e.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  b.targetId = best ? best.id : null;
  return best;
}

/** Create the projectile a defense fires at an enemy. */
export function fireDefense(state, b, target) {
  const cfg = typeConfig(b.type);
  const pcfg = CONFIG.projectiles[DEFENSE_PROJECTILE[b.type]];
  const c = footprintCenter(b);
  const lvl = cfg.levels[b.level - 1];
  const p = {
    id: nextId(state, 'p'),
    kind: b.type,
    owner: 'tower',
    sourceId: b.id,
    x: c.x, y: c.y,
    startX: c.x, startY: c.y,
    targetId: target.id,
    damage: lvl.damage,
    splashRadius: cfg.splashRadius,
    // Catapult: what the shot leaves behind where it lands.
    pool: cfg.pool ? { ...cfg.pool, dps: lvl.poolDps } : null,
    hitsGround: cfg.hitsGround,
    hitsAir: cfg.hitsAir,
    done: false
  };
  if (pcfg.flightTime !== undefined) {
    // Mortar: arcs to where the target is right now, lands after flightTime.
    p.homing = false;
    p.targetX = target.x; p.targetY = target.y;
    p.elapsed = 0; p.flightTime = pcfg.flightTime;
  } else {
    p.homing = true;
    p.speed = pcfg.speed;
  }
  state.projectiles.push(p);
  emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: b.id });
  return p;
}

/** Count down cooldowns, pick targets, fire. Destroyed defenses never fire. */
export function stepDefenses(state, dt) {
  for (const b of state.buildings) {
    if (!isDefense(b.type) || b.destroyed || isSupport(b.type) || typeConfig(b.type).trap || typeConfig(b.type).beam) continue; // support towers, traps and beams don't shoot projectiles
    b.cooldown = Math.max(0, (b.cooldown || 0) - dt);
    const target = chooseTarget(state, b);
    if (target && b.cooldown <= 0) {
      fireDefense(state, b, target);
      b.cooldown = typeConfig(b.type).fireInterval;
    }
  }
}

/** Damage one enemy; on death add its bounty (up to capacity). `source` tags the hit for the view (e.g. 'pool'). */
export function damageEnemy(state, e, amount, source = null) {
  if (!e.alive) return;
  amount *= 1 + (e.markBonus || 0); // marked by a F.L.O.C.K Tower: takes extra damage from everything
  e.hp -= amount;
  e.hit = true;
  emit(state, 'enemyHit', { id: e.id, amount, x: e.x, y: e.y, source });
  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    const added = addGold(state, CONFIG.enemies[e.kind].bounty);
    if (state.wave) state.wave.bountyEarned = (state.wave.bountyEarned || 0) + added;
    emit(state, 'enemyKilled', { id: e.id, kind: e.kind, x: e.x, y: e.y, bounty: added });
    // Wall Breakers blow up however they die (shot down included), hitting everything around them.
    const cfg = CONFIG.enemies[e.kind];
    if (cfg.explodes && !e.exploded) explode(state, e, cfg);
  }
}

// ---------- enemy damage to buildings ----------
/** Does a building match a list of types? The token 'defense' matches every defense. */
export function matchesTypes(b, types) {
  if (types.includes(b.type) || (types.includes('defense') && isDefense(b.type))) return true;
  // 'airDefense': defenses that can shoot flyers (support towers excluded).
  return types.includes('airDefense') && isDefense(b.type) && !isSupport(b.type) && !!typeConfig(b.type).hitsAir;
}

/** One hit from this enemy on this building: picky enemies hit their favorites harder and the rest softer. */
export function enemyDamageVs(cfg, building) {
  if (!cfg.prefers) return cfg.damage;
  const k = matchesTypes(building, cfg.prefers) ? (cfg.preferredDamageMultiplier ?? 1) : (cfg.otherDamageMultiplier ?? 1);
  return Math.round(cfg.damage * k * 10) / 10;
}

/**
 * Wall Breaker blast at the breaker's position: every standing building and wall within blastRadius
 * takes its damage (x60 for walls), and the breaker is gone. Runs when it reaches its target, or when
 * it's killed anywhere else (a bounty is paid only in that case: it was shot).
 */
export function explode(state, e, cfg) {
  const hit = state.buildings.filter((b) => !b.destroyed && !CONFIG.defenses[b.type]?.trap && distanceToFootprint(b, e.x, e.y) <= cfg.blastRadius);
  e.alive = false;
  e.hp = 0;
  e.exploded = true;
  emit(state, 'enemyExploded', { id: e.id, kind: e.kind, x: e.x, y: e.y, radius: cfg.blastRadius, hit: hit.map((b) => b.id) });
  for (const b of hit) {
    damageBuilding(state, b, enemyDamageVs(cfg, b));
    if (state.gameOver) return;
  }
}

/** Full damage to every enemy within radius that the shot is allowed to hit. `kind` = the tower that fired. */
export function applySplash(state, x, y, radius, damage, hitsGround, hitsAir, kind = null) {
  const hit = [];
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const allowed = enemyIsAir(e) ? hitsAir : hitsGround;
    if (allowed && distance(x, y, e.x, e.y) <= radius) hit.push(e);
  }
  for (const e of hit) damageEnemy(state, e, damage);
  emit(state, 'splash', { x, y, radius, kind });
  return hit;
}

/**
 * Damage a building. Storage also drains gold. At 0 HP the building is destroyed;
 * a destroyed town hall ends the game.
 */
export function damageBuilding(state, b, amount) {
  if (b.destroyed || state.gameOver) return;
  if (CONFIG.defenses[b.type]?.trap) return; // hidden traps can't be hit
  const dmg = Math.min(amount, b.hp);
  if (b.type === 'storage') {
    const lost = storageDrainAmount(state, b, dmg);
    if (lost > 0) {
      setGold(state, state.gold - lost);
      emit(state, 'storageDrained', { id: b.id, amount: lost });
    }
  }
  b.hp -= dmg;
  b.underFire = CONFIG.villagers.repairDelayAfterHit; // gnomes hold off repairing it for a moment
  emit(state, 'buildingDamaged', { id: b.id, amount: dmg, hp: b.hp, maxHp: maxHp(b) });
  if (b.hp <= 0) {
    b.hp = 0;
    b.destroyed = true;
    if (isDefense(b.type)) b.targetId = null;
    emit(state, 'buildingDestroyed', { id: b.id, type: b.type });
    if (b.type === 'townHall') {
      state.gameOver = true;
      emit(state, 'gameOver', { wave: state.wave ? state.wave.number : 0 });
    }
  }
}

/** Create an enemy's projectile: a Slinger shot (flies) or a Bomber bomb (drops). */
export function fireEnemyProjectile(state, e, building) {
  const cfg = CONFIG.enemies[e.kind];
  const p = {
    id: nextId(state, 'p'),
    owner: 'enemy',
    sourceId: e.id,
    x: e.x, y: e.y,
    startX: e.x, startY: e.y,
    targetId: building.id,
    damage: cfg.damage * enrageFactor(state).damage,
    done: false
  };
  if (cfg.type === 'air') {
    p.kind = 'bomb';
    p.homing = false;
    p.elapsed = 0;
    p.flightTime = CONFIG.projectiles.bomber.dropTime;
  } else {
    p.kind = 'slinger';
    p.homing = true;
    p.speed = CONFIG.projectiles.slinger.speed;
  }
  state.projectiles.push(p);
  emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: e.id });
  return p;
}

function stepTowerProjectile(state, p, dt) {
  if (p.homing) {
    const target = findEnemy(state, p.targetId);
    if (!target || !target.alive) { p.done = true; p.fizzled = true; return; } // target died: no damage
    const d = distance(p.x, p.y, target.x, target.y);
    const step = p.speed * dt;
    if (d <= step) {
      p.x = target.x; p.y = target.y; p.done = true;
      if (p.splashRadius > 0) applySplash(state, p.x, p.y, p.splashRadius, p.damage, p.hitsGround, p.hitsAir, p.kind);
      else damageEnemy(state, target, p.damage);
    } else {
      p.x += ((target.x - p.x) / d) * step;
      p.y += ((target.y - p.y) / d) * step;
    }
  } else {
    p.elapsed += dt;
    const t = Math.min(1, p.elapsed / p.flightTime);
    p.progress = t;
    p.x = p.startX + (p.targetX - p.startX) * t;
    p.y = p.startY + (p.targetY - p.startY) * t;
    if (t >= 1) {
      p.done = true;
      applySplash(state, p.targetX, p.targetY, p.splashRadius, p.damage, p.hitsGround, p.hitsAir, p.kind);
      if (p.pool) createPool(state, p.targetX, p.targetY, p.pool, p.kind);
    }
  }
}

/** A lingering damage pool on the ground (Catapult). Hurts and slows ground enemies standing in it. */
export function createPool(state, x, y, { radius, duration, dps, slow }, kind = null) {
  if (!state.pools) state.pools = [];
  const pool = { id: nextId(state, 'pool'), kind, x, y, radius, duration, dps, slow, age: 0, tick: 0 };
  state.pools.push(pool);
  emit(state, 'poolCreated', { id: pool.id, x, y, radius, kind });
  return pool;
}

/**
 * Age pools; every POOL_TICK each pool damages the ground enemies inside it (overlapping pools
 * stack their damage). Anyone inside is slowed by the strongest pool they're in (slows don't stack).
 */
export function stepPools(state, dt) {
  if (!state.pools || !state.pools.length) return;
  for (const pool of state.pools) {
    pool.age += dt;
    pool.tick += dt;
    const ticks = Math.floor((pool.tick + 1e-9) / POOL_TICK); // tolerance: 10 x 0.05 s must count as 0.5 s
    pool.tick -= ticks * POOL_TICK;
    for (const e of state.enemies) {
      if (!e.alive || enemyIsAir(e) || distance(pool.x, pool.y, e.x, e.y) > pool.radius) continue;
      e.slow = Math.max(e.slowTimer > 0 ? e.slow || 0 : 0, pool.slow);
      e.slowTimer = SLOW_LINGER;
      if (ticks > 0) damageEnemy(state, e, pool.dps * POOL_TICK * ticks, 'pool');
      if (state.gameOver) return;
    }
  }
  state.pools = state.pools.filter((p) => p.age < p.duration);
}

function stepEnemyProjectile(state, p, dt) {
  const b = findBuilding(state, p.targetId);
  if (!b || b.destroyed) { p.done = true; p.fizzled = true; return; }
  if (p.homing) {
    const c = footprintCenter(b);
    const d = distance(p.x, p.y, c.x, c.y);
    const step = p.speed * dt;
    if (d <= step) {
      p.x = c.x; p.y = c.y; p.done = true;
      damageBuilding(state, b, p.damage);
    } else {
      p.x += ((c.x - p.x) / d) * step;
      p.y += ((c.y - p.y) / d) * step;
    }
  } else {
    p.elapsed += dt;
    p.progress = Math.min(1, p.elapsed / p.flightTime);
    if (p.elapsed >= p.flightTime) {
      p.done = true;
      emit(state, 'bombExploded', { x: p.x, y: p.y, targetId: b.id });
      damageBuilding(state, b, p.damage);
    }
  }
}

/** Move every projectile; resolve hits; drop finished ones. */
export function stepProjectiles(state, dt) {
  for (const p of state.projectiles) {
    if (p.done) continue;
    if (p.owner === 'tower') stepTowerProjectile(state, p, dt);
    else stepEnemyProjectile(state, p, dt);
    if (state.gameOver) break;
  }
  state.projectiles = state.projectiles.filter((p) => !p.done);
}
