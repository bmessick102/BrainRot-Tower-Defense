// The v0.6 enemies' abilities (stats in CONFIG.enemies):
//   John Pork (pork)         - inside a standing F.L.O.C.K Tower's range he stops and calls: the towers that see him
//                              and every other F.L.O.C.K within call.radius of him go silent for call.seconds
//                              (b.silencedT: no marks, reveals or auras).
//   Rahhh Skeleton (skeleton) - near a building he bashes his shield and summon.count Skeletons (bones) climb out of
//                              the ground around him; again every summon.cooldown s while fewer than summon.maxAlive
//                              of his are standing (each has summonerId = his id).
//   Brr Brr Patapim (patapim) - every quake.every s with a building or wall within quake.radius, he stomps: an
//                              earthquake that hits every building there (walls quake.wallMult x).
//   Lirili Larila (lirili)   - the same earthquake (v0.7: Brr Brr Patapim's old ability).
//   Brr Brr Patapim (patapim) - v0.7: drops a Chimpanzini Bananini (chimp) every spawn.every s while he walks in,
//                              while fewer than spawn.maxAlive of his are left (stepSpawner).
//   Frigo Camillo (frigo)    - a cold aura: defenses and the Brisket King within chillAura.radius attack slower
//                              (b.frigoSlow / hero.frigoSlow, set each step by stepSpecialEnemies).
//   Bombombini Gusini (bombo) - breathes fire: its target, plus a share on what's right next to it (breatheFire).
//   La Vaca Saturno (vaca)   - throws boulders that bounce on behind the target (fireBoulderAt / landEnemyShot).
//   Grimace Golem (grimace)  - v0.8: drops a goo puddle every goo.every tiles he walks (stepGooTrails), and a big one
//                              where he dies (combat.js); other enemies standing in goo are enraged (stepPools).
//   Big Yahu (yahu)          - calls a missile down on one building, with a warning ring first; it hits only that
//                              building (v0.7.1; it used to blast everything around it) (fireMissileAt / stepEnemyShot).
// stepEnemyAbility runs inside stepEnemy (enemies.js); stepSpecialEnemies once per step (simulate.js).
import { CONFIG } from '../config.js';
import { footprintCenter, distanceToFootprint, fpW, fpH } from './grid.js';
import { distance } from './iso.js';
import { towerRange } from './abilities.js';
import { emit, nextId } from './util.js';
import { createPool } from './combat.js';

const cfgOf = (e) => CONFIG.enemies[e.kind];

/** Can an enemy's ability hit this building? (Hidden traps and buildings under an Invisibility spell can't be.) */
function hittable(b) {
  return !b.destroyed && !CONFIG.defenses[b.type]?.trap && !(b.spellInvisT > 0);
}

/** Every building (walls included) whose footprint is within `radius` tiles of (x, y). */
export function buildingsNear(state, x, y, radius) {
  return state.buildings.filter((b) => hittable(b) && distanceToFootprint(b, x, y) <= radius);
}

/** Once per step: silenced F.L.O.C.K Towers count down; Frigo Camillo's aura slows what's near it. */
export function stepSpecialEnemies(state, dt) {
  for (const b of state.buildings) {
    if (b.stunT > 0) b.stunT = Math.max(0, b.stunT - dt); // stunned by Quandale's dash impact (read by stepDefenses, stepBeams)
    if (b.silencedT > 0) {
      b.silencedT = Math.max(0, b.silencedT - dt);
      if (!b.silencedT) emit(state, 'flockUnsilenced', { id: b.id });
    }
  }
  stepChillAuras(state);
  stepGooTrails(state);
}

/** A goo puddle (a pool of kind 'goo' that enrages enemies, no damage): his trail, or the big one where he died. */
export function dropGoo(state, x, y, goo, big = false) {
  const rage = { seconds: goo.rageSeconds, speed: goo.speedMult, damage: goo.damageMult };
  return createPool(state, x, y, { radius: big ? goo.deathRadius : goo.radius, duration: big ? goo.deathSeconds : goo.seconds, dps: 0, slow: 0, rage }, 'goo');
}

/** Grimace Golem's trail: every goo.every tiles he has walked since his last puddle, a new one where he stands. */
function stepGooTrails(state) {
  if (state.gameOver) return;
  for (const e of state.enemies) {
    const goo = e.alive && cfgOf(e).goo;
    if (!goo) continue;
    if (e.gooX === undefined) { e.gooX = e.x; e.gooY = e.y; dropGoo(state, e.x, e.y, goo); continue; }
    if (distance(e.x, e.y, e.gooX, e.gooY) >= goo.every) { e.gooX = e.x; e.gooY = e.y; dropGoo(state, e.x, e.y, goo); }
  }
}

/**
 * Frigo Camillo: every building within chillAura.radius tiles of one (and the Brisket King) gets b.frigoSlow =
 * that aura's slowPct (the strongest aura wins), read by towerFireInterval, the Tower of Rah's beam and the hero.
 */
export function stepChillAuras(state) {
  const frigos = state.enemies.filter((e) => e.alive && cfgOf(e).chillAura);
  for (const b of state.buildings) {
    let slow = 0;
    if (!b.destroyed) {
      for (const f of frigos) {
        const A = cfgOf(f).chillAura;
        if (A.slowPct > slow && distanceToFootprint(b, f.x, f.y) <= A.radius) slow = A.slowPct;
      }
    }
    b.frigoSlow = slow;
  }
  for (const h of [state.hero, state.queen]) { // both heroes (the Hatsune Queen reloads slower too)
    if (!h) continue;
    let slow = 0;
    for (const f of frigos) {
      const A = cfgOf(f).chillAura;
      if (A.slowPct > slow && distance(h.x, h.y, f.x, f.y) <= A.radius) slow = A.slowPct;
    }
    h.frigoSlow = slow;
  }
}

/** The attack-speed share left under a Frigo Camillo's aura (1 = not slowed). */
export function chillFactor(slowPct) {
  return 1 - Math.max(0, Math.min(90, slowPct || 0)) / 100;
}

/** Is this F.L.O.C.K Tower silenced by John Pork's call right now? */
export function isSilenced(b) {
  return b.silencedT > 0;
}

/**
 * Timers and abilities of the special enemies, inside stepEnemy. Returns true while the enemy is busy with its
 * ability this step (calling, summoning, stomping: it stands still and doesn't attack). `rage` = enrageFactor;
 * `damageBuilding` is combat.js's and `dropTroopsAt` enemies.js's (passed in, so this module needs no import loop).
 */
export function stepEnemyAbility(state, e, cfg, dt, rage, damageBuilding, dropTroopsAt) {
  if (e.chillT > 0) e.chillT = Math.max(0, e.chillT - dt);
  if (cfg.spawn) stepSpawner(state, e, cfg.spawn, dt, dropTroopsAt); // (he keeps walking)
  if (cfg.call) return stepCall(state, e, cfg.call, dt);
  if (cfg.summon) return stepSummon(state, e, cfg.summon, dt, dropTroopsAt);
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
/** How many of the Skeletons this Rahhh Skeleton raised are still standing. */
export function livingSummons(state, e) {
  return state.enemies.reduce((n, o) => n + (o.alive && o.summonerId === e.id ? 1 : 0), 0);
}

function stepSummon(state, e, summon, dt, dropTroopsAt) {
  if (e.summonCd > 0) e.summonCd = Math.max(0, e.summonCd - dt);
  if (e.bashT > 0) { e.bashT = Math.max(0, e.bashT - dt); e.attacking = false; return true; }
  if (e.summonCd > 0 || e.entry) return false;
  // Only near your base: within summon.range tiles of the building he's going for.
  const target = e.targetId && state.buildings.find((b) => b.id === e.targetId);
  if (!target || target.destroyed || distanceToFootprint(target, e.x, e.y) > summon.range) return false;
  if (livingSummons(state, e) >= summon.maxAlive) return false;
  summonSkeletons(state, e, summon, dropTroopsAt);
  return true;
}

/**
 * The shield bash: Skeletons climb out of the ground around him (summon.count, or fewer so no more than
 * summon.maxAlive of his stand at once), and the cooldown starts. Returns the new Skeletons.
 */
export function summonSkeletons(state, e, summon, dropTroopsAt) {
  e.bashT = summon.poseSeconds;
  e.summonCd = summon.cooldown;
  e.attacking = false;
  const n = Math.max(0, Math.min(summon.count, summon.maxAlive - livingSummons(state, e)));
  const raised = dropTroopsAt(state, e, summon.kind, n, e.x, e.y, { landing: summon.riseSeconds });
  for (const t of raised) { t.summonerId = e.id; t.rising = true; }
  emit(state, 'skeletonSummon', { id: e.id, x: e.x, y: e.y, troops: raised.map((t) => ({ id: t.id, x: t.x, y: t.y })) });
  return raised;
}

// ---------- Brr Brr Patapim (v0.7) ----------
/**
 * While he walks in (not attacking, and past the path in from the map edge), a Chimpanzini Bananini every
 * spawn.every s, as long as fewer than spawn.maxAlive of his are left. They hop out right beside him.
 */
function stepSpawner(state, e, spawn, dt, dropTroopsAt) {
  if (e.entry || e.attacking) return;
  e.spawnT = (e.spawnT || 0) + dt;
  if (e.spawnT < spawn.every) return;
  e.spawnT = 0;
  const n = Math.min(spawn.count, spawn.maxAlive - livingSummons(state, e));
  if (n <= 0) return;
  const out = dropTroopsAt(state, e, spawn.kind, n, e.x, e.y, { landing: 0.25 });
  for (const t of out) t.summonerId = e.id;
  emit(state, 'enemySpawnTroops', { id: e.id, x: e.x, y: e.y, troops: out.map((t) => t.id) });
}

// ---------- Bombombini Gusini (v0.7) ----------
/**
 * Fire breath: `damage` to the target, and breath.splashPct% of it to every building and wall within
 * breath.splashRadius tiles of the target's footprint (the ones right next to it).
 */
export function breatheFire(state, e, target, damage, damageBuilding) {
  const B = cfgOf(e).breath;
  const c = footprintCenter(target);
  const half = (target.size || 1) / 2;
  const near = state.buildings.filter((o) => o !== target && hittable(o) && distanceToFootprint(o, c.x, c.y) <= half + B.splashRadius);
  emit(state, 'fireBreath', { id: e.id, x: e.x, y: e.y, targetId: target.id, tx: c.x, ty: c.y, splash: near.map((o) => o.id) });
  damageBuilding(state, target, damage, e);
  for (const o of near) {
    if (state.gameOver) return;
    damageBuilding(state, o, damage * (B.splashPct / 100), e);
  }
}

// ---------- Lirili Larila (and Brr Brr Patapim before v0.7): the earthquake ----------
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

/**
 * Big Yahu's missile: aimed at one building now, it lands projectiles.missile.fallTime s later and hits only that
 * building (an airstrike on a single target). The warning ring is drawn around that building's footprint.
 */
export function fireMissileAt(state, e, building, damage) {
  const c = footprintCenter(building);
  const ring = Math.max(fpW(building), fpH(building)) / 2 + 0.2; // (just around the building it's aimed at)
  const p = {
    id: nextId(state, 'p'), kind: 'missile', owner: 'enemy', sourceId: e.id, x: c.x, y: c.y, startX: c.x, startY: c.y,
    targetId: building.id, targetX: c.x, targetY: c.y, homing: false, elapsed: 0,
    flightTime: CONFIG.projectiles.missile.fallTime, damage, radius: ring, done: false
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
    // Only the building it was aimed at (if it's still standing and can be hit: not under an Invisibility spell).
    p.done = true;
    const b = state.buildings.find((o) => o.id === p.targetId);
    emit(state, 'bombExploded', { x: p.targetX, y: p.targetY, targetId: p.targetId, radius: p.radius, missile: true });
    if (b && hittable(b)) damageBuilding(state, b, p.damage, source);
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
