// Enemy creation, nearest-building targeting, movement (ground: pathfinding; air: straight), attacks,
// and separation so enemies never stack on top of each other.
import { fightableHeroes, hitHero } from './heroes.js';
import { CONFIG } from '../config.js';
import { MAP } from '../mapTiles.js';
import { closestPointOnFootprint, distanceToFootprint, footprintCenter, isInsideFootprint, fpW, fpH } from './grid.js';
import { distance } from './iso.js';
import { damageBuilding, fireEnemyProjectile, findBuilding, matchesTypes, enemyDamageVs, explode, damageEnemy, enemyWeaken } from './combat.js';
import { abilityFx } from './abilities.js';
import { getNav, distanceField, nextStep } from './pathfinding.js';
import { emit, nextId, random } from './util.js';
import { enrageFactor } from './enrage.js';
import { walkToward, moveToward } from './motion.js';
import { stepEnemyAbility, breatheFire } from './specialEnemies.js';

/** The stage wave number n fights (1 .. rules.waveStages.length, v0.9.5): its base wave, themes and most entrances. */
export function waveStage(n) {
  const starts = CONFIG.rules.waveStages;
  let stage = 1;
  for (let i = 1; i < starts.length; i++) if (n >= starts[i]) stage = i + 1;
  return stage;
}

/** A wave stage's base wave (scripted for the first ones, the last scripted one grown after that). */
function baseWaveFor(th) {
  const scripted = CONFIG.waves;
  if (th <= scripted.length) return scripted[th - 1];
  const last = scripted[scripted.length - 1];
  const grow = hallWaveGrowth(scripted.length, th);
  const out = {};
  for (const kind of ENEMY_KINDS) out[kind] = Math.round((last[kind] || 0) * grow);
  return out;
}

/**
 * How much a wave stage's base wave grows from stage `from` to `to` (which: 'count' or 'hp'): x
 * rules.endlessCountGrowth / endlessHpGrowth per stage up to stage topHallGrowth.from - 1 (11), then x
 * topHallGrowth.count / hp per stage (the old Village Halls 12-15 rates; stages by wave number since v0.9.5).
 */
export function hallWaveGrowth(from, to, which = 'count') {
  const R = CONFIG.rules, top = R.topHallGrowth;
  const early = which === 'hp' ? R.endlessHpGrowth : R.endlessCountGrowth;
  const late = top ? (which === 'hp' ? top.hp : top.count) : early;
  const split = top ? top.from - 1 : Infinity;
  const a = Math.max(0, Math.min(to, split) - from); // halls at the endless rate
  const b = Math.max(0, to - Math.max(from, split));  // halls past it, at the gentler rate
  return early ** a * late ** b;
}

// Re-exported: they live in combat.js so a Wall Breaker can blow up from any death (being shot included).
export { matchesTypes, enemyDamageVs, explode };

export const ENEMY_KINDS = ['grunt', 'slinger', 'bomber', 'tank', 'shark', 'thief', 'breaker', 'balloon', 'neegy', 'babycar', 'toilet', 'pork', 'skeleton', 'bones', 'vaca', 'yahu', 'patapim', 'lirili', 'chimp', 'bicus', 'frigo', 'bombo', 'quandale', 'grimace'];
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
/**
 * An enemy's level, shown on its health bar: how many times a basic one of its kind's health it has (the wave's
 * health multiplier, times its crowd-cap pack), rounded, at least 1. Wave 1 enemies are level 1.
 */
export function enemyLevel(e) {
  const base = enemyConfig(e.kind).hp;
  return Math.max(1, Math.round((e.maxHp || base) / base));
}

export function createEnemy(state, kind, spawnX, spawnY, hpMultiplier = 1) {
  const cfg = enemyConfig(kind);
  // Uniform point in a disc of radius SPAWN_JITTER: never more than 0.75 tiles away on either axis.
  const angle = random(state) * Math.PI * 2;
  const radius = Math.sqrt(random(state)) * SPAWN_JITTER;
  const hp = Math.round(cfg.hp * hpMultiplier);
  const armor = cfg.armor ? Math.round(cfg.armor * hpMultiplier) : 0; // Bri Bri Bicus Dicus: broken before health
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
    ...(armor ? { armor, maxArmor: armor } : {}),
    ...(cfg.invisibleUntilJump ? { hidden: true } : {}),
    ...(cfg.burrows ? { underground: true } : {}), // Skibidi Toilet: starts out tunneling
    ...(cfg.drops ? { dropTimer: null } : {})
  };
}

/** An invisible enemy (Mr. Least) shows itself: defenses can target it from now on. */
export function revealEnemy(state, e) {
  if (!e.hidden) return;
  e.hidden = false;
  emit(state, 'enemyRevealed', { id: e.id, kind: e.kind, x: e.x, y: e.y });
}

/**
 * Spawn an enemy at a named path ('top' | 'right' | 'bottom' | 'left') and add it to state. `pack` (crowd
 * cap, waves.js applyCrowdCap) multiplies its health, damage, gold and RP; bosses are never packed.
 */
export function spawnEnemy(state, kind, path, hpMultiplier = 1, pack = 1) {
  if (enemyConfig(kind).boss) pack = 1;
  // Enemies appear at the map edge where the dirt path runs off-screen. Ground troops first march down
  // the path to its entrance (e.entry), then pathfind to their target; flyers head straight in.
  const [sx, sy] = (MAP.edgeSpawnPoints || MAP.spawnPoints)[path];
  const e = createEnemy(state, kind, sx, sy, hpMultiplier * pack);
  if (pack > 1) e.pack = pack;
  if (MAP.edgeSpawnPoints && !isAirKind(kind) && !enemyConfig(kind).ramsToHall && !enemyConfig(kind).burrows) { // the Da Baby Car drives and the Toilet tunnels straight in
    // Through the path's bends (MAP.spawnRoutes) to its entrance on the grass.
    const points = [...((MAP.spawnRoutes && MAP.spawnRoutes[path]) || []), MAP.spawnPoints[path]];
    // Keep a bit of the spawn spread so the column stays loose, but narrow it to fit the dirt path.
    const k = ENTRY_SPREAD / SPAWN_JITTER;
    const route = points.map(([px, py]) => ({ x: px + (e.x - sx) * k, y: py + (e.y - sy) * k }));
    e.entry = route.shift();
    e.route = route;
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
    if (b.spellInvisT > 0) continue;             // nor buildings under an Invisibility spell (spells.js)
    if (b.type === 'wall' && !(onlyTypes && onlyTypes.includes('wall'))) continue;
    if (onlyTypes && !matchesTypes(b, onlyTypes)) continue;
    const d = distanceToFootprint(b, x, y);
    if (d < bestD) { best = b; bestD = d; }
  }
  return best;
}

/**
 * Nearest building this enemy wants: for picky enemies (config `prefers`, e.g. Mr. Least)
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

/** Keep the current target unless it was destroyed (or turned invisible by a spell); then pick the next one. */
export function ensureTarget(state, e) {
  const current = findBuilding(state, e.targetId);
  if (current && !current.destroyed && !(current.spellInvisT > 0)) return current;
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
      revealEnemy(state, e); // the first wall jump gives an invisible Mr. Least away
    }
  }
  return distanceToFootprint(target, e.x, e.y) <= range + EPS ? target : null;
}

/**
 * Quandale Dingle (cfg.dash, v0.8). Walking, he starts a dash when the building he's going for is dash.minRange to
 * dash.range tiles away, his dash is ready (dash.cooldown) and his route doesn't need breaking a wall (e.breakingId,
 * set by stepGround). Dashing, he moves along his normal route at dash.speed; reaching the building he lands an
 * impact hit (dash.impactMult x his damage) and goes on punching normally. A wall in the way, or running past
 * dash.maxSeconds, ends the dash with no impact. Returns what stepGround returns (the building to attack, or null).
 */
function stepDasher(state, e, target, cfg, step, dt, rage, nav) {
  const D = cfg.dash;
  if (e.dashCd > 0) e.dashCd = Math.max(0, e.dashCd - dt);
  if (!(e.dashT > 0)) {
    const d = distanceToFootprint(target, e.x, e.y);
    // (breakingId is null once stepGround has checked his route and found no wall to break in it)
    if (!e.attacking && e.breakingId === null && !(e.dashCd > 0) && d >= D.minRange && d <= D.range) {
      e.dashT = D.maxSeconds;
      e.dashCd = D.cooldown;
      e.dashTargetId = target.id;
      emit(state, 'enemyDash', { id: e.id, kind: e.kind, x: e.x, y: e.y, targetId: target.id });
    } else {
      return stepGround(state, e, target, cfg, step, nav);
    }
  }
  // Dashing: the same route, much faster (slows and rage still count: step is his walk step for this frame).
  e.dashT = Math.max(0, e.dashT - dt);
  const hit = stepGround(state, e, target, cfg, step * (D.speed / cfg.speed), nav);
  const endDash = () => { e.dashT = 0; e.dashTargetId = null; };
  if (hit && hit.id === e.dashTargetId && hit.type !== 'wall') {
    endDash();
    const dealt = enemyDamageVs(cfg, hit) * D.impactMult * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e));
    e.cooldown = cfg.attackInterval; // his next normal punch comes one attack later
    e.impacted = true;
    revealEnemy(state, e);
    emit(state, 'dashImpact', { id: e.id, kind: e.kind, x: e.x, y: e.y, targetId: hit.id, amount: dealt });
    damageBuilding(state, hit, dealt, e);
    if (D.stunSeconds && !hit.destroyed) { hit.stunT = Math.max(hit.stunT || 0, D.stunSeconds); emit(state, 'buildingStunned', { id: hit.id, seconds: D.stunSeconds }); }
    return hit;
  }
  if (hit || e.breakingId || target.id !== e.dashTargetId || e.dashT <= 0) endDash(); // a wall, a new target, or too long
  return hit;
}

/** Move one enemy toward its target and attack when in range. */
export function stepEnemy(state, e, dt, nav = null) {
  const dashT = e.dashT;
  stepEnemyBody(state, e, dt, nav);
  // Quandale Dingle: a step that didn't reach stepDasher (held by a Mousetrap, fighting a hero, hacked, staggering...)
  // ends his dash on the spot, with no impact, instead of freezing it (afterimages while standing) to resume later.
  if (dashT > 0 && dt > 0 && e.dashT === dashT) { e.dashT = 0; e.dashTargetId = null; }
}

function stepEnemyBody(state, e, dt, nav) {
  if (!e.alive) return;
  const cfg = enemyConfig(e.kind);
  e.cooldown = Math.max(0, e.cooldown - dt);
  if (e.pinT > 0) e.pinT = Math.max(0, e.pinT - dt); // pinned by a Ballista Bolt: drawn while it lasts (the hold is e.held)
  // Slowed (a Catapult pool): stepPools refreshes slowTimer while the enemy stands in one.
  const slowed = e.slowTimer > 0 ? 1 - (e.slow || 0) : 1;
  e.slowTimer = Math.max(0, (e.slowTimer || 0) - dt);
  if (e.gooT > 0) e.gooT = Math.max(0, e.gooT - dt); // Grimace's goo rage wears off (enrageFactor reads it)
  const rage = enrageFactor(state, e); // a stalled wave's enemies get faster and hit harder (and restless at night)
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
  // The Da Baby Car: straight at the Village Hall, ramming through whatever's in the way.
  if (cfg.ramsToHall) { stepBabyCar(state, e, cfg, target, step, dt, rage); return; }
  // The Skibidi Toilet: tunnels to its target and pops up to attack.
  if (cfg.burrows) { stepBurrower(state, e, cfg, target, step, dt, rage); return; }
  // v0.6 abilities (specialEnemies.js): John Pork's call, Rahhh Skeleton's summons, Brr Brr Patapim's quake.
  if (stepEnemyAbility(state, e, cfg, dt, rage, damageBuilding, dropTroopsAt)) return;
  // The Brisket King in reach (or taunting it): fight him instead of going on.
  if (fightHero(state, e, cfg, step, rage)) return;
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
    if (moveToward(e, e.entry.x, e.entry.y, step) <= ENTRY_REACHED) e.entry = e.route && e.route.length ? e.route.shift() : null; // next bend, or onto the grass
    e.attacking = false;
    return;
  }

  if (cfg.type === 'air') {
    // Fly straight over everything (walls included) to the footprint center and hover there.
    const c = footprintCenter(target);
    // Home on the center; neighbors push a group apart, so anywhere over the target counts as in range.
    // A ranged flyer (La Vaca Saturno) stops attackRange tiles from the target's edge and throws from there.
    if (cfg.attackRange > MELEE_REACH && distanceToFootprint(target, e.x, e.y) <= cfg.attackRange) attackTarget = target;
    else {
      moveToward(e, c.x, c.y, step);
      if (distance(e.x, e.y, c.x, c.y) <= Math.max(cfg.attackRange, ARRIVE_EPSILON) || distanceToFootprint(target, e.x, e.y) <= ARRIVE_EPSILON) attackTarget = target;
    }
  } else if (cfg.dash) {
    // Quandale Dingle: dashes to his building and lands an impact hit (stepDasher). An impact uses up this step's attack.
    attackTarget = stepDasher(state, e, target, cfg, step, dt, rage, nav || getNav(state));
    if (e.impacted) { e.impacted = false; e.attacking = true; return; }
  } else {
    attackTarget = stepGround(state, e, target, cfg, step, nav || getNav(state));
  }

  e.attacking = !!attackTarget;
  // Firework Showstopper: too dazzled to attack (it still walks). Frequency Jam: no bombs.
  const disarmed = e.disarmT > 0 || (e.airJammed && cfg.jammable); // (Frequency Jam: Bombers only, CONFIG jammable)
  if (attackTarget && e.cooldown <= 0 && !disarmed) {
    e.cooldown = cfg.attackInterval;
    if (cfg.explodes) { explode(state, e, cfg); return; }
    revealEnemy(state, e); // so does its first hit (a base with no walls in its way)
    if (cfg.kamikaze) {
      // Chimpanzini Bananini: one hit on the building it reached, then it's gone (no bounty: nobody shot it).
      const dealt = enemyDamageVs(cfg, attackTarget) * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e));
      e.alive = false;
      e.hp = 0;
      e.dived = true;
      emit(state, 'enemyDive', { id: e.id, kind: e.kind, x: e.x, y: e.y, targetId: attackTarget.id });
      damageBuilding(state, attackTarget, dealt, e);
      return;
    }
    if (cfg.breath) {
      // Bombombini Gusini: fire on its target, and a share of it on the buildings right next to it.
      breatheFire(state, e, attackTarget, enemyDamageVs(cfg, attackTarget) * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e)), damageBuilding);
      emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: attackTarget.id });
      return;
    }
    if (cfg.type === 'ground') {
      // Jammed / melted enemies hit softer; Spiked Plating hits back.
      const dealt = enemyDamageVs(cfg, attackTarget) * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e));
      damageBuilding(state, attackTarget, dealt, e);
      const thorns = abilityFx(attackTarget).thorns;
      if (thorns && e.alive && !attackTarget.destroyed) damageEnemy(state, e, dealt * thorns, 'thorns');
    }
    else fireEnemyProjectile(state, e, attackTarget);
    emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: attackTarget.id });
  }
}

/**
 * The Da Baby Car (raid boss): drives in a straight line at the Village Hall (its target). The first time it
 * reaches any other building's tile it rams it: a wall breaks outright, anything else takes ramDamage and
 * the car stalls for ramPause s before pushing on through. At the hall it batters it every attackInterval s.
 */
function stepBabyCar(state, e, cfg, hall, step, dt, rage) {
  e.entry = null;
  if (distanceToFootprint(hall, e.x, e.y) <= cfg.attackRange) {
    e.attacking = true;
    if (e.cooldown <= 0 && !(e.disarmT > 0)) {
      e.cooldown = cfg.attackInterval;
      damageBuilding(state, hall, cfg.damage * rage.damage * (1 - enemyWeaken(e)), e);
      emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: hall.id });
    }
    return;
  }
  e.attacking = false;
  if (e.ramPause > 0) { e.ramPause = Math.max(0, e.ramPause - dt); return; } // still crunching through
  const c = footprintCenter(hall);
  moveToward(e, c.x, c.y, step);
  // Hit something new? (The building whose tile the car is on, or the one just ahead of it.)
  const col = Math.floor(e.x), row = Math.floor(e.y);
  const b = state.buildings.find((o) => !o.destroyed && o.id !== hall.id && isInsideFootprint(o, e.x, e.y));
  if (!b || (e.rammed && e.rammed.includes(b.id))) return;
  (e.rammed || (e.rammed = [])).push(b.id);
  const wall = b.type === 'wall';
  damageBuilding(state, b, wall ? b.hp + 1 : cfg.ramDamage * rage.damage, e);
  if (!wall) e.ramPause = cfg.ramPause;
  emit(state, 'babyCarRam', { id: e.id, targetId: b.id, x: e.x, y: e.y, wall, col, row });
}

/**
 * Ground enemies fight a hero (the Brisket King or the Hatsune Queen, whichever is nearest) when one is in their
 * reach (melee: next to the hero; ranged: within their range). Picky raiders (Mr. Least, Neegies...) ignore heroes
 * unless the Brisket King's Royal Taunt pulls them in, and Wall Breakers, flyers, bosses and tunnelers never stop
 * for a hero. The Queen hidden by Encore Cloak can't be picked (heroes.js fightableHeroes). Returns true if it dealt
 * with a hero this step.
 */
function fightHero(state, e, cfg, step, rage) {
  // (Chimpanzinis only go for buildings: they never stop for heroes.)
  if (cfg.type === 'air' || cfg.explodes || cfg.ramsToHall || cfg.burrows || cfg.kamikaze || e.entry || e.hackedT > 0) return false;
  const heroes = fightableHeroes(state);
  if (!heroes.length) return false;
  const melee = cfg.attackRange <= MELEE_REACH;
  const reach = melee ? MELEE_REACH + 0.3 : cfg.attackRange;
  let h = null, d = Infinity, taunted = false;
  for (const x of heroes) {
    const dx = distance(e.x, e.y, x.x, x.y);
    const altar = state.buildings.find((b) => b.id === x.altarId);
    const taunt = altar ? abilityFx(altar).heroTaunt || 0 : 0;
    const t = taunt > 0 && dx <= taunt;
    if ((cfg.prefers && !t) || (dx > reach && !t) || dx >= d) continue;
    h = x; d = dx; taunted = t;
  }
  if (!h) return false;
  if (d > reach) {
    if (!taunted) return false;
    moveToward(e, h.x, h.y, step); // Royal Taunt: drawn to him
    e.attacking = false;
    return true;
  }
  e.attacking = true;
  if (e.cooldown > 0 || e.disarmT > 0) return true;
  e.cooldown = cfg.attackInterval;
  hitHero(state, h, cfg.damage * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e)), melee);
  emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: h === state.queen ? 'queen' : 'hero' });
  return true;
}

/**
 * The Skibidi Toilet (burrower): underground it tunnels in a straight line, under walls and buildings, to the
 * closest edge of its target (the nearest building). There it surfaces: surfaceSeconds to climb out, then it
 * attacks. When the target falls, ensureTarget picks the next one and it burrows again. While underground
 * nothing can target or hurt it (combat.js isBurrowedUnseen) unless a F.L.O.C.K Tower sees it.
 */
function stepBurrower(state, e, cfg, target, step, dt, rage) {
  e.entry = null;
  const range = cfg.attackRange;
  if (distanceToFootprint(target, e.x, e.y) > range + EPS) {
    if (!e.underground) {
      e.underground = true;
      e.surfaceT = 0;
      emit(state, 'enemyBurrowed', { id: e.id, x: e.x, y: e.y });
    }
    e.attacking = false;
    const p = closestPointOnFootprint(target, e.x, e.y);
    const d = distance(e.x, e.y, p.x, p.y);
    moveToward(e, p.x, p.y, Math.min(step, Math.max(0, d - range * 0.8)));
    return;
  }
  if (e.underground) {
    e.underground = false;
    e.surfaceT = cfg.surfaceSeconds;
    emit(state, 'enemySurfaced', { id: e.id, x: e.x, y: e.y });
  }
  if (e.surfaceT > 0) { e.surfaceT = Math.max(0, e.surfaceT - dt); e.attacking = false; return; } // climbing out
  e.attacking = true;
  if (e.cooldown > 0 || e.disarmT > 0) return;
  e.cooldown = cfg.attackInterval;
  const dealt = enemyDamageVs(cfg, target) * rage.damage * (e.pack || 1) * (1 - enemyWeaken(e));
  damageBuilding(state, target, dealt, e);
  const thorns = abilityFx(target).thorns;
  if (thorns && e.alive && !target.destroyed) damageEnemy(state, e, dealt * thorns, 'thorns');
  emit(state, 'enemyAttack', { id: e.id, kind: e.kind, targetId: target.id });
}

/** How many troops a Da Baby Car's burst stands for at wave n (deathSpawn.base, +1 every perWaves past fromWave). */
export function babyCarBurstSize(cfg, waveNumber) {
  const d = cfg.deathSpawn;
  return d.base + Math.floor(Math.max(0, (waveNumber || 0) - d.fromWave) / d.perWaves);
}

/**
 * Crowd cap for the burst: past deathSpawn.maxCount troops, the burst drops maxCount and each one is packed
 * (health, damage, gold and RP x this), like a capped wave (waves.js applyCrowdCap). 1 = not packed.
 */
export function babyCarBurstPack(cfg, waveNumber) {
  const max = cfg.deathSpawn.maxCount;
  const size = babyCarBurstSize(cfg, waveNumber);
  return max && size > max ? Math.round((size / max) * 100) / 100 : 1;
}

/**
 * The Da Baby Car's burst when it's destroyed: how many troops, and which. Count: babyCarBurstSize, at most
 * deathSpawn.maxCount (babyCarBurstPack makes up the rest). Kinds: the ground troops in the Village Hall's base
 * wave (no flyers, no Neegies, no more Da Baby Cars), weighted by how many of each that wave has; Grunts if it
 * has none.
 */
export function babyCarBurst(state, cfg, waveNumber, baseComp) {
  const d = cfg.deathSpawn;
  const count = Math.min(babyCarBurstSize(cfg, waveNumber), d.maxCount || Infinity);
  const weights = ENEMY_KINDS
    .filter((k) => k !== 'babycar' && !CONFIG.enemies[k].droppedBy && !isAirKind(k) && (baseComp[k] || 0) > 0)
    .map((k) => [k, baseComp[k]]);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  const out = {};
  for (let i = 0; i < count; i++) {
    let kind = 'grunt';
    if (total > 0) {
      let r = random(state) * total;
      for (const [k, w] of weights) { r -= w; if (r <= 0) { kind = k; break; } }
    }
    out[kind] = (out[kind] || 0) + 1;
  }
  return out;
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
    if (e.pack > 1) t.pack = e.pack;
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
const separationScratch = new WeakMap();

export function separateEnemies(state, nav = getNav(state)) {
  let scratch = separationScratch.get(state);
  if (!scratch) {
    scratch = { list: [], air: [], rad: [], dx: [], dy: [], buckets: new Map(), used: [], spare: [] };
    separationScratch.set(state, scratch);
  }
  const { list, air, rad, dx, dy, buckets, used, spare } = scratch;
  list.length = 0;
  for (const e of state.enemies) if (e.alive) list.push(e);
  const n = list.length;
  if (n < 2) { list.length = 0; return; }
  // Layers that never push each other: on the ground, in the air, and tunneling (Skibidi Toilets).
  // Bucket enemies by tile (bodies are under a tile across) so each one only checks its neighbors.
  const keyOf = (cx, cy) => cx * 4096 + cy;
  for (let i = 0; i < n; i++) {
    const e = list[i];
    air[i] = isAirKind(e.kind) ? 1 : e.underground ? 2 : 0;
    rad[i] = enemyConfig(e.kind).radius ?? 0.25;
    dx[i] = dy[i] = 0;
    const k = keyOf(Math.floor(e.x), Math.floor(e.y));
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = spare.pop() || [];
      buckets.set(k, bucket);
      used.push(bucket);
    }
    bucket.push(i);
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
      const squared = ox * ox + oy * oy;
      if (squared >= minD * minD) continue;
      let d = Math.sqrt(squared);
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
    const squared = px * px + py * py;
    if (squared > MAX_PUSH * MAX_PUSH) {
      const scale = MAX_PUSH / Math.sqrt(squared);
      px *= scale;
      py *= scale;
    }
    const e = list[i];
    const nx = e.x + px, ny = e.y + py;
    if (air[i] || walkable(nav, nx, ny, jumpsWalls(e.kind))) { e.x = nx; e.y = ny; } // (tunnelers go anywhere)
  }
  buckets.clear();
  for (const bucket of used) { bucket.length = 0; spare.push(bucket); }
  used.length = 0;
  list.length = 0;
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
  // A Da Baby Car destroyed by any means bursts into a mix of the wave's ground troops where it stopped.
  for (const e of state.enemies) {
    const cfg = enemyConfig(e.kind);
    if (e.alive || !cfg.deathSpawn || e.deathDropped) continue;
    e.deathDropped = true;
    const w = state.wave || {};
    const mix = babyCarBurst(state, cfg, w.number || 1, burstBase(state));
    // A very late wave's burst is capped (babyCarBurstPack): fewer troops, each that much tougher.
    const pack = babyCarBurstPack(cfg, w.number || 1);
    const from = pack > 1 ? { ...e, maxHp: e.maxHp * pack, pack } : e;
    const troops = [];
    for (const [kind, n] of Object.entries(mix)) troops.push(...dropTroopsAt(state, from, kind, n, e.x, e.y, { landing: 0.25 }));
    emit(state, 'babyCarBurst', { id: e.id, x: e.x, y: e.y, troops: troops.map((t) => t.id) });
  }
  state.enemies = state.enemies.filter((e) => e.alive);
}

/** The running wave's stage's base wave composition (which ground troops a Da Baby Car can burst into). */
function burstBase(state) {
  return baseWaveFor(waveStage((state.wave && state.wave.number) || 1));
}

/** Drop troops on open ground at (or near) a point, e.g. where a balloon was shot down or a Da Baby Car burst. */
export function dropTroopsAt(state, e, kind, count, x, y, { landing = LANDING_SECONDS } = {}) {
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
    t.landing = landing;
    if (e.pack > 1) t.pack = e.pack;
    t.targetId = pickTarget(state, t)?.id ?? null;
    state.enemies.push(t);
    emit(state, 'enemySpawned', { id: t.id, kind, path: null, droppedBy: e.id });
    out.push(t);
  }
  return out;
}
