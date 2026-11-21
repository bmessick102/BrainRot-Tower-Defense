// The v0.6 enemies' abilities (stats in CONFIG.enemies):
//   John Pork (pork)         - inside a standing F.L.O.C.K Tower's range he stops and calls: the towers that see him
//                              and every other F.L.O.C.K within call.radius of him go silent for call.seconds
//                              (b.silencedT: no marks, reveals or auras).
//   Rahhh Skeleton (skeleton) - bashes his shield the first time he reaches a building, then every rage.cooldown s:
//                              he and every enemy within rage.radius are enraged (e.rageT: enrage.js enrageFactor).
//   Brr Brr Patapim (patapim) - every quake.every s with a building or wall within quake.radius, he stomps: an
//                              earthquake that hits every building there (walls quake.wallMult x).
//   La Vaca Saturno (vaca)   - throws boulders that bounce on behind the target (fireBoulderAt / landEnemyShot).
//   Big Yahu (yahu)          - calls missiles down on a spot, with a warning ring first (fireMissileAt / landEnemyShot).
// stepEnemyAbility runs inside stepEnemy (enemies.js); stepSpecialEnemies once per step (simulate.js).
import { CONFIG } from '../config.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { towerRange } from './abilities.js';
import { emit, nextId } from './util.js';

const cfgOf = (e) => CONFIG.enemies[e.kind];

/** Can an enemy's ability hit this building? (Hidden traps and buildings under an Invisibility spell can't be.) */
function hittable(b) {
  return !b.destroyed && !CONFIG.defenses[b.type]?.trap && !(b.spellInvisT > 0);
}

/** Every building (walls included) whose footprint is within `radius` tiles of (x, y). */
export function buildingsNear(state, x, y, radius) {
  return state.buildings.filter((b) => hittable(b) && distanceToFootprint(b, x, y) <= radius);
}

/** Once per step: silenced F.L.O.C.K Towers count down. */
export function stepSpecialEnemies(state, dt) {
  for (const b of state.buildings) {
    if (b.silencedT > 0) {
      b.silencedT = Math.max(0, b.silencedT - dt);
      if (!b.silencedT) emit(state, 'flockUnsilenced', { id: b.id });
    }
  }
}

/** Is this F.L.O.C.K Tower silenced by John Pork's call right now? */
export function isSilenced(b) {
  return b.silencedT > 0;
}

/**
 * Timers and abilities of the special enemies, inside stepEnemy. Returns true while the enemy is busy with its
 * ability this step (calling, bashing, stomping: it stands still and doesn't attack). `rage` = enrageFactor;
 * `damageBuilding` is combat.js's (passed in, so this module needs no import loop).
 */
export function stepEnemyAbility(state, e, cfg, dt, rage, damageBuilding) {
  if (e.rageT > 0) e.rageT = Math.max(0, e.rageT - dt);
  if (e.chillT > 0) e.chillT = Math.max(0, e.chillT - dt);
  if (cfg.call) return stepCall(state, e, cfg.call, dt);
  if (cfg.rage) return stepBash(state, e, cfg.rage, dt);
  if (cfg.quake) return stepQuake(state, e, cfg.quake, dt, rage, damageBuilding);
  return false;
}

// ---------- John Pork ----------
function stepCall(state, e, call, dt) {
  if (e.callCd > 0) e.callCd = Math.max(0, e.callCd - dt);
  if (e.callT > 0) { e.callT = Math.max(0, e.callT - dt); e.attacking = false; return true; }
  if (e.callCd > 0 || e.entry) return false;
  const flocks = state.buildings.filter((b) => b.type === 'flock' && !b.destroyed);
  const sees = (b) => distance(e.x, e.y, footprintCenter(b).x, footprintCenter(b).y) <= towerRange(b);
  if (!flocks.some((b) => !isSilenced(b) && sees(b))) return false;
  // The towers that see him, and every other F.L.O.C.K within call.radius of him.
  const hit = flocks.filter((b) => sees(b) || distanceToFootprint(b, e.x, e.y) <= call.radius);
  for (const b of hit) b.silencedT = Math.max(b.silencedT || 0, call.seconds);
  e.callT = call.poseSeconds;
  e.callCd = call.cooldown;
  e.attacking = false;
  emit(state, 'porkCall', { id: e.id, x: e.x, y: e.y, radius: call.radius, ids: hit.map((b) => b.id) });
  return true;
}

// ---------- Rahhh Skeleton ----------
function stepBash(state, e, rage, dt) {
  if (e.bashCd > 0) e.bashCd = Math.max(0, e.bashCd - dt);
  if (e.bashT > 0) { e.bashT = Math.max(0, e.bashT - dt); e.attacking = false; return true; }
  // The first bash waits until he reaches a building (e.attacking from his last step); after that it's on a timer.
  if (!e.bashed ? !e.attacking : e.bashCd > 0) return false;
  bash(state, e, rage);
  return true;
}

/** The shield bash: he and every enemy within rage.radius are enraged (a fresh bash refreshes, never stacks). */
export function bash(state, e, rage = cfgOf(e).rage) {
  e.bashed = true;
  e.bashT = rage.bashSeconds;
  e.bashCd = rage.cooldown;
  e.attacking = false;
  const hit = state.enemies.filter((o) => o.alive && distance(e.x, e.y, o.x, o.y) <= rage.radius);
  for (const o of hit) o.rageT = Math.max(o.rageT || 0, rage.seconds);
  emit(state, 'skeletonBash', { id: e.id, x: e.x, y: e.y, radius: rage.radius, ids: hit.map((o) => o.id) });
}

// ---------- Brr Brr Patapim ----------
function stepQuake(state, e, quake, dt, rage, damageBuilding) {
  e.quakeT = (e.quakeT || 0) + dt;
  if (e.stompT > 0) { e.stompT = Math.max(0, e.stompT - dt); e.attacking = false; return true; }
  if (e.quakeT < quake.every || e.entry) return false;
  const hit = buildingsNear(state, e.x, e.y, quake.radius);
  if (!hit.length) return false;
  e.quakeT = 0;
  e.stompT = quake.stompSeconds;
  e.attacking = false;
  emit(state, 'quake', { id: e.id, x: e.x, y: e.y, radius: quake.radius, hit: hit.map((b) => b.id) });
  const mult = (rage ? rage.damage : 1) * (e.pack || 1) * (1 - weakenOf(e));
  for (const b of hit) {
    damageBuilding(state, b, quake.damage * (b.type === 'wall' ? quake.wallMult : 1) * mult, e);
    if (state.gameOver) break;
  }
  return true;
}

const weakenOf = (e) => Math.max(e.weaken || 0, e.meltTimer > 0 ? e.melt || 0 : 0);

// ---------- La Vaca Saturno and Big Yahu: their shots ----------
/**
 * La Vaca Saturno's boulder at a building: a lob to its center (full damage to that building), then bounce.count
 * bounces, each bounce.step tiles further along the throw (projectiles.vaca.bounceTime each).
 */
export function fireBoulderAt(state, e, building, damage) {
  const c = footprintCenter(building);
  let dx = c.x - e.x, dy = c.y - e.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = 1; dy = 0; } else { dx /= len; dy /= len; }
  const p = {
    id: nextId(state, 'p'), kind: 'vaca', owner: 'enemy', sourceId: e.id, x: e.x, y: e.y, startX: e.x, startY: e.y,
    targetId: building.id, targetX: c.x, targetY: c.y, dirX: dx, dirY: dy, homing: false, elapsed: 0,
    flightTime: CONFIG.projectiles.vaca.flightTime, damage, bounce: 0, done: false
  };
  state.projectiles.push(p);
  emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: e.id });
  return p;
}

/** Big Yahu's missile: aimed at a building's center now, it lands projectiles.missile.fallTime s later. */
export function fireMissileAt(state, e, building, damage) {
  const c = footprintCenter(building);
  const cfg = cfgOf(e);
  const p = {
    id: nextId(state, 'p'), kind: 'missile', owner: 'enemy', sourceId: e.id, x: c.x, y: c.y, startX: c.x, startY: c.y,
    targetId: building.id, targetX: c.x, targetY: c.y, homing: false, elapsed: 0,
    flightTime: CONFIG.projectiles.missile.fallTime, damage, radius: cfg.missileRadius, done: false
  };
  state.projectiles.push(p);
  emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: e.id });
  emit(state, 'missileIncoming', { id: p.id, x: c.x, y: c.y, radius: p.radius, delay: p.flightTime });
  return p;
}

/**
 * One step of a boulder or missile (they fly to a spot, not a building, so they land even if the target falls
 * first). `damageBuilding` is passed in (combat.js) to keep this module free of an import loop.
 */
export function stepEnemyShot(state, p, dt, damageBuilding) {
  p.elapsed += dt;
  const t = Math.min(1, p.elapsed / p.flightTime);
  p.progress = t;
  p.x = p.startX + (p.targetX - p.startX) * t;
  p.y = p.startY + (p.targetY - p.startY) * t;
  if (t < 1) return;
  const source = state.enemies.find((o) => o.id === p.sourceId) || null;
  if (p.kind === 'missile') {
    p.done = true;
    const hit = buildingsNear(state, p.targetX, p.targetY, p.radius);
    emit(state, 'bombExploded', { x: p.targetX, y: p.targetY, targetId: p.targetId, radius: p.radius, missile: true });
    for (const b of hit) { damageBuilding(state, b, p.damage, source); if (state.gameOver) return; }
    return;
  }
  // La Vaca Saturno's boulder: the first landing hits its target; each bounce hits everything around it.
  const B = CONFIG.enemies.vaca.bounce;
  const mult = Math.max(0, 1 - B.falloff) ** p.bounce;
  let hit;
  if (p.bounce === 0) {
    const b = state.buildings.find((o) => o.id === p.targetId);
    hit = b && hittable(b) ? [b] : buildingsNear(state, p.targetX, p.targetY, B.radius * 0.5);
  } else hit = buildingsNear(state, p.targetX, p.targetY, B.radius);
  emit(state, 'boulderLanded', { id: p.id, x: p.targetX, y: p.targetY, radius: p.bounce ? B.radius : 0.5, bounce: p.bounce });
  for (const b of hit) { damageBuilding(state, b, p.damage * mult, source); if (state.gameOver) { p.done = true; return; } }
  if (p.bounce >= B.count) { p.done = true; return; }
  // Bounce on along the throw.
  p.bounce += 1;
  p.startX = p.targetX; p.startY = p.targetY;
  p.targetX += p.dirX * B.step; p.targetY += p.dirY * B.step;
  p.elapsed = 0;
  p.progress = 0;
  p.flightTime = CONFIG.projectiles.vaca.bounceTime;
  p.fromBlast = true; // the view: it leaves from the ground now
}
