// Enemy creation, nearest-building targeting, movement (ground: pathfinding; air: straight), attacks,
// and separation so enemies never stack on top of each other.
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { closestPointOnFootprint, distanceToFootprint, footprintCenter, isInsideFootprint, fpW, fpH } from './grid.js';
import { distance } from './iso.js';
import { damageBuilding, fireEnemyProjectile, findBuilding, matchesTypes, enemyDamageVs, explode, damageEnemy, enemyWeaken } from './combat.js';
import { abilityFx } from './abilities.js';
import { getNav, distanceField, nextStep } from './pathfinding.js';
import { emit, nextId, random } from './util.js';
import { enrageFactor } from './enrage.js';
import { walkToward } from './motion.js';

// Re-exported: they live in combat.js so a Wall Breaker can blow up from any death (being shot included).
export { matchesTypes, enemyDamageVs, explode };

export const ENEMY_KINDS = ['grunt', 'slinger', 'bomber', 'tank', 'shark', 'thief', 'breaker', 'balloon', 'neegy'];
// A Neegy dropped by a balloon floats down for this long (no moving or attacking) before it lands.
export const LANDING_SECONDS = 0.7;

/** Enemies that leap over walls instead of going around or breaking them. */
export function jumpsWalls(kind) {
  return !!CONFIG.enemies[kind].jumpsWalls;
}

// Charter §7 values that are not in the balance sheet yet. TODO(design): move to the sheet's Global tab.
export const SPAWN_JITTER = 2;         // random offset from the spawn point, tiles (enemies arrive spread out)
// Ground troops funnel from that spread down to this much as they reach the path entrance.
export const ENTRY_SPREAD = 0.75;
export const BUMP_PADDING = 0.3;       // ground enemies switch target when they walk this close into another building
const ARRIVE_EPSILON = 0.05;           // "close enough" for flyers hovering over a footprint center
const MELEE_REACH = 0.5;               // how close a melee enemy must be to hit (also used to break walls)
// Separation: overlapping enemies are pushed apart a share of the overlap each step (smooth, no jitter).
const SEPARATION_STRENGTH = 0.5;
// Enemies already attacking may be nudged this far past their range by the crowd without stopping.
const CROWD_SLACK = 0.3;
const MAX_PUSH = 0.25;                 // tiles per step, so a big pile spreads out over a few frames
const ENTRY_REACHED = 0.3;             // close enough to the path entrance to start pathfinding
// How far inside a defense's range a ranged enemy attacking that defense stops (see attackRangeVs).
const OUTRANGE_MARGIN = 0.25;

export function enemyConfig(kind) {
  return CONFIG.enemies[kind];
}

/**
 * How close an enemy must get to `target` to attack it. Normally its attackRange, but a ranged enemy
 * attacking a defense that can shoot it never outranges that defense: enemy reach is measured from
 * the footprint's edge and tower range from its center, so it stops where even the worst case (a
 * footprint corner, plus crowd nudging) is still OUTRANGE_MARGIN inside the tower's range.
 */
export function attackRangeVs(cfg, target) {
  const range = cfg.attackRange;
  if (range <= MELEE_REACH || cfg.type === 'air' || !target) return range;
  const def = CONFIG.defenses[target.type];
  if (!def || !def.hitsGround) return range;
  const half = Math.max(fpW(target), fpH(target)) / 2;
  const safe = def.range - half * Math.SQRT2 - CROWD_SLACK - OUTRANGE_MARGIN;
  return Math.max(MELEE_REACH, Math.min(range, safe));
}

export function isAirKind(kind) {
  return CONFIG.enemies[kind].type === 'air';
}

/** A new enemy near a spawn point (grid coords). HP is scaled by the wave's multiplier. */
export function createEnemy(state, kind, spawnX, spawnY, hpMultiplier = 1) {
  const cfg = enemyConfig(kind);
  // Uniform point in a disc of radius SPAWN_JITTER: never more than 0.75 tiles away on either axis.
  const angle = random(state) * Math.PI * 2;
  const radius = Math.sqrt(random(state)) * SPAWN_JITTER;
  const hp = Math.round(cfg.hp * hpMultiplier);
  return {
    id: nextId(state, 'e'),
    kind,
    x: spawnX + Math.cos(angle) * radius,
    y: spawnY + Math.sin(angle) * radius,
    hp,
    maxHp: hp,
    targetId: null,
    cooldown: 0,
    alive: true,
    hit: false,
    attacking: false,
    ...(cfg.invisibleUntilJump ? { hidden: true } : {}),
    ...(cfg.drops ? { dropTimer: null } : {})
  };
}

/** An invisible enemy (Money Stealer) shows itself: defenses can target it from now on. */
export function revealEnemy(state, e) {
  if (!e.hidden) return;
  e.hidden = false;
  emit(state, 'enemyRevealed', { id: e.id, kind: e.kind, x: e.x, y: e.y });
}

/** Spawn an enemy at a named path ('top' | 'right' | 'bottom' | 'left') and add it to state. */
export function spawnEnemy(state, kind, path, hpMultiplier = 1) {
  // Enemies appear at the map edge where the dirt path runs off-screen. Ground troops first march down
  // the path to its entrance (e.entry), then pathfind to their target; flyers head straight in.
  const [sx, sy] = (MAP.edgeSpawnPoints || MAP.spawnPoints)[path];
  const e = createEnemy(state, kind, sx, sy, hpMultiplier);
  if (MAP.edgeSpawnPoints && !isAirKind(kind)) {
    const [ex, ey] = MAP.spawnPoints[path];
    // Keep a bit of the spawn spread so the column stays loose, but narrow it to fit the dirt path.
    const k = ENTRY_SPREAD / SPAWN_JITTER;
    e.entry = { x: ex + (e.x - sx) * k, y: ey + (e.y - sy) * k };
  }
  e.targetId = (enemyConfig(kind).drops ? balloonStop(state, e, enemyConfig(kind)) : pickTarget(state, e))?.id ?? null;
  state.enemies.push(e);
  emit(state, 'enemySpawned', { id: e.id, kind, path });
  return e;
}

/**
 * Nearest non-destroyed building by distance to its footprint. Ties go to the first in the list.
 * Walls are never a target: enemies only attack them to get through.
 */

/** Nearest standing building. Walls are skipped unless `onlyTypes` asks for them (the Wall Breaker). */
export function findNearestBuilding(state, x, y, onlyTypes = null, exclude = null) {
  let best = null, bestD = Infinity;
  for (const b of state.buildings) {
    if (b.destroyed || (exclude && exclude.includes(b.id))) continue;
    if (CONFIG.defenses[b.type]?.trap) continue; // hidden traps: enemies can't see them
    if (b.type === 'wall' && !(onlyTypes && onlyTypes.includes('wall'))) continue;
    if (onlyTypes && !matchesTypes(b, onlyTypes)) continue;
    const d = distanceToFootprint(b, x, y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/**
 * Nearest building this enemy wants: for picky enemies (config `prefers`, e.g. the Money Stealer)
 * the nearest standing building of those types, and only when none are left, the nearest of any.
 */
export function pickTarget(state, e) {
  const cfg = enemyConfig(e.kind);
  for (const tier of [cfg.prefers, cfg.thenPrefers]) {
    const t = tier && findNearestBuilding(state, e.x, e.y, tier);
    if (t) return t;
  }
  return findNearestBuilding(state, e.x, e.y);
}

/** Keep the current target unless it was destroyed; then pick the next one. */
export function ensureTarget(state, e) {
  const current = findBuilding(state, e.targetId);
  if (current && !current.destroyed) return current;
  const next = pickTarget(state, e);
  e.targetId = next ? next.id : null;
  return next;
}

/** Ground enemy walked into another standing building? Returns that building or null. (Fallback when off the nav grid.) */
export function findBumpedBuilding(state, e) {
  for (const b of state.buildings) {
    if (b.destroyed || b.id === e.targetId || b.type === 'wall' || CONFIG.defenses[b.type]?.trap) continue;
    if (isInsideFootprint(b, e.x, e.y, BUMP_PADDING)) return b;
  }
  return null;
}

/** Move (x, y) of an enemy up to `step` toward a point; returns the remaining distance. */
function moveToward(e, tx, ty, step) {
  const d = distance(e.x, e.y, tx, ty);
  if (d <= step) { e.x = tx; e.y = ty; return 0; }
  e.x += ((tx - e.x) / d) * step;
  e.y += ((ty - e.y) / d) * step;
  return d - step;
}

/** Old straight-line walk (used only when an enemy is off the nav grid or has no route). */
function walkStraight(state, e, target, range, step) {
  const p = closestPointOnFootprint(target, e.x, e.y);
  const d = distance(e.x, e.y, p.x, p.y);
  if (d > range) {
    moveToward(e, p.x, p.y, Math.min(step, d - range));
    const bumped = findBumpedBuilding(state, e);
    if (bumped) { e.targetId = bumped.id; return bumped; }
  }
  return target;
}

const EPS = 1e-9;

/**
 * Ground movement with pathfinding. Returns the building to attack this step (the target, or a
 * wall/building blocking the route), or null while still walking.
 */
function stepGround(state, e, target, cfg, step, nav) {
  const range = attackRangeVs(cfg, target);
  const slack = e.attacking ? CROWD_SLACK : 0;
  if (distanceToFootprint(target, e.x, e.y) <= range + slack + EPS) return target;
  const reach = Math.max(range, MELEE_REACH);
  const jump = jumpsWalls(e.kind);
  const next = nextStep(nav, distanceField(nav, target, reach, jump), e.x, e.y, jump);
  e.breakingId = null;
  if (!next) {
    const t = walkStraight(state, e, target, range, step);
    // A bumped building may be a defense, so check it with its own range.
    return distanceToFootprint(t, e.x, e.y) <= (t === target ? range : attackRangeVs(cfg, t)) + EPS ? t : null;
  }
  if (next.goal) {
    // In reach of the target's tiles: close the last bit in a straight line.
    const p = closestPointOnFootprint(target, e.x, e.y);
    const d = distance(e.x, e.y, p.x, p.y);
    moveToward(e, p.x, p.y, Math.min(step, Math.max(0, d - range)));
    return distanceToFootprint(target, e.x, e.y) <= range + EPS ? target : null;
  }
  const blocker = next.blocker && !next.blocker.destroyed && next.blocker !== target ? next.blocker : null;
  if (blocker) {
    // A wall (or building) is the cheapest way through: walk up to it and break it.
    e.breakingId = blocker.id;
    const bReach = Math.max(attackRangeVs(cfg, blocker), MELEE_REACH);
    if (distanceToFootprint(blocker, e.x, e.y) <= bReach + slack + EPS) return blocker;
    const p = closestPointOnFootprint(blocker, e.x, e.y);
    const d = distance(e.x, e.y, p.x, p.y);
    moveToward(e, p.x, p.y, Math.min(step, Math.max(0, d - bReach)));
    return distanceToFootprint(blocker, e.x, e.y) <= bReach + EPS ? blocker : null;
  }
  moveToward(e, next.tx, next.ty, step);
  if (jump) {
    const was = !!e.overWall;
    e.overWall = isOverWall(nav, e.x, e.y); // the view arcs it up while it's over a wall
    if (e.overWall && !was) {
      emit(state, 'enemyJump', { id: e.id, kind: e.kind, x: e.x, y: e.y });
      revealEnemy(state, e); // the first wall jump gives an invisible goblin away
    }
  }
  return distanceToFootprint(target, e.x, e.y) <= range + EPS ? target : null;
}

/** Move one enemy toward its target and attack when in range. */
export function stepEnemy(state, e, dt, nav = null) {
  if (!e.alive) return;
  const cfg = enemyConfig(e.kind);
  e.cooldown = Math.max(0, e.cooldown - dt);
  // Slowed (a Catapult pool): stepPools refreshes slowTimer while the enemy stands in one.
  const slowed = e.slowTimer > 0 ? 1 - (e.slow || 0) : 1;
  e.slowTimer = Math.max(0, (e.slowTimer || 0) - dt);
  const rage = enrageFactor(state); // a stalled wave's enemies get faster and hit harder
  const step = cfg.speed * slowed * rage.speed * dt;
  // Firework Grounding Burst: a flyer knocked out of the sky lies stunned until it takes off again.
  if (e.grounded > 0) { e.grounded = Math.max(0, e.grounded - dt); e.attacking = false; return; }
  // F.L.O.C.K Override: hacked, it fights the enemies next to it instead of your base.
  if (e.hackedT > 0) { stepHacked(state, e, cfg, dt); return; }
  // Firework Decoy Flare: flyers chase the decoy instead of their target.
  if (e.decoyT > 0 && cfg.type === 'air') {
    e.decoyT = Math.max(0, e.decoyT - dt);
    moveToward(e, e.decoyX, e.decoyY, step);
    e.attacking = false;
    return;
  }
  // Balloons pick their own stops (and drift off when there are none left), so they go first.
  if (cfg.drops) {
    if (e.held > 0) { e.held = Math.max(0, e.held - dt); e.attacking = false; return; } // stunned (Firework Dazzle)
    stepBalloon(state, e, cfg, step, dt);
    return;
  }
  const target = ensureTarget(state, e);
  if (!target) { e.attacking = false; return; }
  let attackTarget = null;

  // A dropped Neegy is still floating down.
  if (e.landing > 0) { e.landing = Math.max(0, e.landing - dt); e.attacking = false; return; }
  // Caught in a Mousetrap: held in place, can't move or attack.
  if (e.held > 0) { e.held = Math.max(0, e.held - dt); e.attacking = false; return; }
  // Cheese Bait (a Mousetrap ability): lured straight onto the trap until it snaps. A building or wall in
  // the way breaks the spell for that trap.
  if (e.lureId) {
    const trap = findBuilding(state, e.lureId);
    if (!trap || trap.destroyed || trap.sprung) e.lureId = null;
    else if (walkToward(state, e, e.lureX, e.lureY, step)) { e.entry = null; e.attacking = false; return; }
    else { e.lureRefused = e.lureId; e.lureId = null; }
  }

  // Diddypult Hangover: staggering around aimlessly.
  if (e.wanderT > 0 && cfg.type !== 'air') {
    e.wanderT = Math.max(0, e.wanderT - dt);
    if (!e.wanderTo || distance(e.x, e.y, e.wanderTo.x, e.wanderTo.y) < 0.1) {
      const a = random(state) * Math.PI * 2;
      e.wanderTo = { x: e.x + Math.cos(a) * 1.5, y: e.y + Math.sin(a) * 1.5 };
    }
    if (!walkToward(state, e, e.wanderTo.x, e.wanderTo.y, step * 0.7)) e.wanderTo = null;
    e.attacking = false;
    return;
  }

  if (e.entry && cfg.type !== 'air') {
    // Still marching in along the dirt path from the map edge.
    if (moveToward(e, e.entry.x, e.entry.y, step) <= ENTRY_REACHED) e.entry = null;
    e.attacking = false;
    return;
  }

  if (cfg.type === 'air') {
    // Fly straight over everything (walls included) to the footprint center and hover there.
    const c = footprintCenter(target);
    // Home on the center; neighbors push a group apart, so anywhere over the target counts as in range.
    moveToward(e, c.x, c.y, step);
    if (distance(e.x, e.y, c.x, c.y) <= Math.max(cfg.attackRange, ARRIVE_EPSILON) || distanceToFootprint(target, e.x, e.y) <= ARRIVE_EPSILON) attackTarget = target;
  } else {
    attackTarget = stepGround(state, e, target, cfg, step, nav || getNav(state));
  }

  e.attacking = !!attackTarget;
  // Firework Showstopper: too dazzled to attack (it still walks). Frequency Jam: no bombs.
  const disarmed = e.disarmT > 0 || (e.airJammed && cfg.type === 'air');
  if (attackTarget && e.cooldown <= 0 && !disarmed) {
    e.cooldown = cfg.attackInterval;
    if (cfg.explodes) { explode(state, e, cfg); return; }
    revealEnemy(state, e); // so does its first hit (a base with no walls in its way)
    if (cfg.type === 'ground') {
      // Jammed / melted enemies hit softer; Spiked Plating hits back.
      const dealt = enemyDamageVs(cfg, attackTarget) * rage.damage * (1 - enemyWeaken(e));
      damageBuilding(state, attackTarget, dealt, e);
      const thorns = abilityFx(attackTarget).thorns;
      if (thorns && e.alive && !attackTarget.destroyed) damageEnemy(state, e, dealt * thorns, 'thorns');
    }
    else fireEnemyProjectile(state, e, attackTarget);
    emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: attackTarget.id });
  }
}

/** F.L.O.C.K Override: a hacked enemy stays put and hits the nearest other enemy within 2 tiles. */
function stepHacked(state, e, cfg, dt) {
  e.hackedT = Math.max(0, e.hackedT - dt);
  e.attacking = false;
  let foe = null, best = Infinity;
  for (const o of state.enemies) {
    if (o === e || !o.alive || o.hackedT > 0) continue;
    const d = distance(e.x, e.y, o.x, o.y);
    if (d <= 2 && d < best) { foe = o; best = d; }
  }
  if (!foe || e.cooldown > 0) return;
  e.cooldown = cfg.attackInterval;
  e.attacking = true;
  damageEnemy(state, foe, Math.max(20, cfg.damage * 2), 'hacked');
  emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: null });
}

/**
 * The balloon's target: its current one while it stands, else the nearest air defense, else the nearest
 * defense, else the nearest building of any kind (walls excepted). Null when nothing is left.
 */
function balloonStop(state, e, cfg) {
  const current = findBuilding(state, e.targetId);
  if (current && !current.destroyed) return current;
  const next = findNearestBuilding(state, e.x, e.y, ['airDefense']) || findNearestBuilding(state, e.x, e.y, ['defense'])
    || findNearestBuilding(state, e.x, e.y);
  e.targetId = next ? next.id : null;
  e.dropTimer = null; // a new target: hover a moment before the first drop
  return next;
}

/**
 * Neegy Balloon: fly to its target (defenses first), hover dropHover s, then drop perDrop Neegies every
 * dropInterval s until that target is destroyed, then on to the next. With nothing left it drifts off and pops.
 */
function stepBalloon(state, e, cfg, step, dt) {
  e.attacking = false;
  if (e.leaving) {
    // Drift away from the Village Hall, then pop.
    const th = state.buildings.find((b) => b.type === 'townHall');
    const c = th ? footprintCenter(th) : { x: MAP.cols / 2, y: MAP.rows / 2 };
    const dx = e.x - c.x, dy = e.y - c.y, d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * step; e.y += (dy / d) * step;
    e.leaveT -= dt;
    if (e.leaveT <= 0) {
      e.alive = false; e.hp = 0; e.popped = true;
      emit(state, 'balloonPopped', { id: e.id, kind: e.kind, x: e.x, y: e.y });
    }
    return;
  }
  const target = balloonStop(state, e, cfg);
  if (!target) { startLeaving(e, cfg); return; }
  const c = footprintCenter(target);
  moveToward(e, c.x, c.y, step);
  if (distance(e.x, e.y, c.x, c.y) > Math.max(0.3, ARRIVE_EPSILON)) return;
  if (e.dropTimer === null) e.dropTimer = cfg.dropHover; // just arrived
  e.dropTimer -= dt;
  if (e.dropTimer > 0) return;
  if (e.airJammed) return; // F.L.O.C.K Frequency Jam: no troops while it's in range
  const dropped = dropTroops(state, e, cfg.drops, cfg.perDrop, target);
  e.dropTimer = cfg.dropInterval;
  emit(state, 'balloonDrop', { id: e.id, x: e.x, y: e.y, targetId: target.id, troops: dropped.map((t) => t.id) });
}

function startLeaving(e, cfg) {
  e.leaving = true;
  e.leaveT = cfg.leaveSeconds;
  e.targetId = null;
}

/**
 * Drop `count` troops of `kind` from flyer e around building `target`: each lands just outside the
 * target's footprint (on open ground), with the flyer's HP scaling, floating down for LANDING_SECONDS.
 */
export function dropTroops(state, e, kind, count, target) {
  const scale = e.maxHp / enemyConfig(e.kind).hp;
  const c = footprintCenter(target);
  const reach = Math.max(fpW(target), fpH(target)) / 2 + 0.35;
  const nav = getNav(state);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = createEnemy(state, kind, c.x, c.y, scale);
    let placed = false;
    for (let tries = 0; tries < 12 && !placed; tries++) {
      const a = random(state) * Math.PI * 2;
      const x = c.x + Math.cos(a) * reach, y = c.y + Math.sin(a) * reach;
      if (walkable(nav, x, y)) { t.x = x; t.y = y; placed = true; }
    }
    if (!placed) { t.x = e.x; t.y = e.y; }
    t.landing = LANDING_SECONDS;
    t.targetId = pickTarget(state, t)?.id ?? null;
    state.enemies.push(t);
    emit(state, 'enemySpawned', { id: t.id, kind, path: null, droppedBy: e.id });
    out.push(t);
  }
  return out;
}

export function stepEnemies(state, dt) {
  // One nav map per step (rebuilt only when buildings changed). A wall broken mid-step shows up next step.
  const nav = getNav(state);
  for (const e of state.enemies) {
    const px = e.x, py = e.y;
    stepEnemy(state, e, dt, nav);
    // Velocity (tiles per second), for the Mortar's Ranging Shot.
    if (dt > 0) { e.vx = (e.x - px) / dt; e.vy = (e.y - py) / dt; }
    if (state.gameOver) return;
  }
  separateEnemies(state, nav);
}

/** Can a ground enemy stand at (x, y)? Not inside a standing building (or wall, unless it jumps walls). */
function walkable(nav, x, y, jumper = false) {
  const c = Math.floor(x), r = Math.floor(y);
  if (c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows) return true; // off-grid edges (spawn points) are open
  const occ = nav.occ[r * MAP.cols + c];
  return !occ || occ.destroyed || (jumper && occ.type === 'wall');
}

/** Is (x, y) on a standing wall tile? */
export function isOverWall(nav, x, y) {
  const c = Math.floor(x), r = Math.floor(y);
  if (c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows) return false;
  const occ = nav.occ[r * MAP.cols + c];
  return !!occ && !occ.destroyed && occ.type === 'wall';
}

/**
 * Push overlapping enemies apart so they never stack (ground and air separately: flyers pass over
 * walkers). Each overlapping pair moves apart by part of the overlap; a push that would shove a
 * ground enemy into a building or wall is skipped.
 */
export function separateEnemies(state, nav = getNav(state)) {
  const list = state.enemies.filter((e) => e.alive);
  const n = list.length;
  if (n < 2) return;
  const air = list.map((e) => isAirKind(e.kind));
  const rad = list.map((e) => enemyConfig(e.kind).radius ?? 0.25);
  const dx = new Float64Array(n), dy = new Float64Array(n);
  // Bucket enemies by tile (bodies are under a tile across) so each one only checks its neighbors.
  const buckets = new Map();
  const keyOf = (cx, cy) => cx * 4096 + cy;
  for (let i = 0; i < n; i++) {
    const k = keyOf(Math.floor(list[i].x), Math.floor(list[i].y));
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(i);
  }
  for (let i = 0; i < n; i++) {
    const a = list[i];
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    for (let ox2 = -1; ox2 <= 1; ox2++) for (let oy2 = -1; oy2 <= 1; oy2++) {
    const near = buckets.get(keyOf(cx + ox2, cy + oy2));
    if (!near) continue;
    for (const j of near) {
      if (j <= i || air[i] !== air[j]) continue;
      const b = list[j];
      const minD = rad[i] + rad[j];
      let ox = b.x - a.x, oy = b.y - a.y;
      if (Math.abs(ox) >= minD || Math.abs(oy) >= minD) continue;
      let d = Math.hypot(ox, oy);
      if (d >= minD) continue;
      if (d < 1e-6) { const ang = random(state) * Math.PI * 2; ox = Math.cos(ang); oy = Math.sin(ang); d = 0; } // exact overlap: random direction, full push
      else { ox /= d; oy /= d; }
      const push = ((minD - d) / 2) * SEPARATION_STRENGTH;
      dx[i] -= ox * push; dy[i] -= oy * push;
      dx[j] += ox * push; dy[j] += oy * push;
    }
    }
  }
  for (let i = 0; i < n; i++) {
    let px = dx[i], py = dy[i];
    if (!px && !py) continue;
    const len = Math.hypot(px, py);
    if (len > MAX_PUSH) { px = (px / len) * MAX_PUSH; py = (py / len) * MAX_PUSH; }
    const e = list[i];
    const nx = e.x + px, ny = e.y + py;
    if (air[i] || walkable(nav, nx, ny, jumpsWalls(e.kind))) { e.x = nx; e.y = ny; }
  }
}

export function removeDeadEnemies(state) {
  // A balloon destroyed by any means (shot, splash, pool) drops its last Neegies where it falls. (Done
  // here rather than at the moment of death, so combat.js doesn't need the spawning code.)
  for (const e of state.enemies) {
    const cfg = enemyConfig(e.kind);
    if (e.alive || !cfg.deathDrop || e.popped || e.deathDropped) continue;
    e.deathDropped = true;
    const troops = dropTroopsAt(state, e, cfg.drops, cfg.deathDrop, e.x, e.y);
    emit(state, 'balloonDrop', { id: e.id, x: e.x, y: e.y, targetId: null, troops: troops.map((t) => t.id), onDeath: true });
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}

/** Drop troops on open ground at (or near) a point, e.g. where a balloon was shot down. */
export function dropTroopsAt(state, e, kind, count, x, y) {
  const scale = e.maxHp / enemyConfig(e.kind).hp;
  const nav = getNav(state);
  const out = [];
  for (let i = 0; i < count; i++) {
    const t = createEnemy(state, kind, x, y, scale);
    let placed = false;
    for (let tries = 0; tries < 24 && !placed; tries++) {
      const r = tries === 0 ? 0 : 0.4 + (tries / 24) * 1.6, a = random(state) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (walkable(nav, px, py)) { t.x = px; t.y = py; placed = true; }
    }
    if (!placed) { t.x = x; t.y = y; }
    t.landing = LANDING_SECONDS;
    t.targetId = pickTarget(state, t)?.id ?? null;
    state.enemies.push(t);
    emit(state, 'enemySpawned', { id: t.id, kind, path: null, droppedBy: e.id });
    out.push(t);
  }
  return out;
}
