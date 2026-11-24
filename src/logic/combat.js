// Tower targeting, projectiles (tower and enemy), damage, splash, and building destruction.
// RV Lab abilities hook in here: each shot carries its tower's merged ability effects (abilityFx) and they
// play out when it lands (pierce, knockback, slows, stuns, fire patches, chains, sparklers, bomblets...).
import { CONFIG } from '../config.js';
import { ABILITY_RULES } from '../abilityConfig.js';
import { typeConfig, isDefense, isSupport, maxHp, mergedConfigOf, mergeShotMult, masteryFxOf } from './buildings.js';
import { abilityFx, towerRange, towerMinRange, towerDamageMult, towerFireInterval, auraOf } from './abilities.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { addGold, setGold, storageDrainAmount } from './economy.js';
import { emit, nextId, random } from './util.js';
import { enrageFactor, nightLootMult } from './enrage.js';
import { addHype } from './dj.js';
import { knockback, applySlow, applyStun } from './motion.js';
import { addResearchPoints, killResearchPoints } from './researchPoints.js';
import { fireBoulderAt, fireMissileAt, stepEnemyShot, dropGoo } from './specialEnemies.js';
import { harpoonDue, throwHarpoons, hookEnemy } from './harpoon.js';
import { shatterFor, markShatter, queueShatter } from './shatter.js';
import { barrelFor, tarPool, burstBarrel } from './barrelBurst.js';

export { applySlow, applyStun };

// Which projectile config each defense uses (CONFIG.projectiles keys).
const DEFENSE_PROJECTILE = { cannon: 'cannon', archer: 'archer', mortar: 'mortar', wizard: 'wizard', firework: 'firework', catapult: 'catapult', spear: 'spear', ksi: 'ksi' };

// Pools (Catapult): damage is dealt in ticks of this many seconds (poolDps x POOL_TICK per tick).
export const POOL_TICK = 0.5;
// A slowed enemy stays slowed this long after stepping out of a pool.
export const SLOW_LINGER = 0.25;
// Mortar Barrage: seconds between the shells of one burst.
const BURST_GAP = 0.3;
// Mortar Cluster Shell bomblets: how far they scatter, their splash and flight time.
const BOMBLET = { spread: 1.1, splash: 0.8, flightTime: 0.45 };
// Firework Sparklers: how far from the burst they pop, and their splash.
const SPARKLER = { spread: 0.9, splash: 0.6 };
// Pierce: a cannonball that punches through keeps flying this fast (tiles per second).
const PIERCE_SPEED = 12;

export function enemyIsAir(e) {
  return CONFIG.enemies[e.kind].type === 'air' && !(e.grounded > 0); // Grounding Burst: crashed flyers are ground
}

/** Ground / air reach of a tower, including Firework Ground Show. */
export function towerHits(b) {
  const cfg = typeConfig(b.type);
  return { ground: !!cfg.hitsGround || !!abilityFx(b).groundDamage, air: !!cfg.hitsAir };
}

export function findEnemy(state, id) {
  return id ? state.enemies.find((e) => e.id === id) || null : null;
}

export function findBuilding(state, id) {
  return id ? state.buildings.find((b) => b.id === id) || null : null;
}

/** What a tower can aim at right now (worked out once per tower per step). */
function aimOf(b) {
  const hits = towerHits(b);
  const fx = abilityFx(b);
  return {
    c: footprintCenter(b), range: towerRange(b), minRange: towerMinRange(b), ground: hits.ground, air: hits.air,
    seeInvisible: !!fx.seeInvisible || !!auraOf(b).seeInvisible, // Keen Sight / a F.L.O.C.K's Overwatch
    markRange: fx.markRangeAdd || 0                                // Mortar Spotter Link
  };
}

/**
 * A Skibidi Toilet tunneling where no F.L.O.C.K Tower sees it: nothing can target or hurt it (no aiming, and
 * damageEnemy ignores it, so splash, pools, beams, burns and traps miss it too).
 */
export function isBurrowedUnseen(e) {
  return !!e && !!e.underground && !e.flockSeen;
}

function validFor(aim, e) {
  if (!e || !e.alive) return false;
  if (isBurrowedUnseen(e)) return false; // tunneling: out of reach unless a F.L.O.C.K sees it
  if (e.hidden && !aim.seeInvisible) return false; // invisible enemies can't be aimed at (splash still hits)
  if (!(enemyIsAir(e) ? aim.air : aim.ground)) return false;
  const d = distance(aim.c.x, aim.c.y, e.x, e.y);
  const reach = aim.range + (aim.markRange && e.markBonus > 0 ? aim.markRange : 0);
  return d <= reach && d >= aim.minRange;
}

/** Alive, hittable type, inside range and outside minimum range (measured from the footprint center). */
export function isValidTarget(b, e, extraRange = 0) {
  const aim = aimOf(b);
  if (extraRange) aim.range += extraRange; // (a beam holding its lock: CONFIG.defenses.ra.leash)
  return validFor(aim, e);
}

/** Every enemy this tower could shoot right now. */
export function validTargets(state, b) {
  const aim = aimOf(b);
  return state.enemies.filter((e) => validFor(aim, e));
}

/** Keep the current target while valid; otherwise the closest valid enemy (or null). */
export function chooseTarget(state, b) {
  const aim = aimOf(b);
  const current = findEnemy(state, b.targetId);
  if (validFor(aim, current)) return current;
  let best = null, bestD = Infinity;
  for (const e of state.enemies) {
    if (!validFor(aim, e)) continue;
    const d = distance(aim.c.x, aim.c.y, e.x, e.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  b.targetId = best ? best.id : null;
  return best;
}

/** The valid target with the most current HP (Headshot), or null. */
export function toughestTarget(state, b) {
  let best = null;
  for (const e of validTargets(state, b)) if (!best || e.hp > best.hp) best = e;
  return best;
}

/**
 * Create the projectile a defense fires at an enemy. opts: damageMult (Grapeshot pellets, Headshot, Finale),
 * kind (a different projectile, e.g. 'pellet'), crit (already rolled).
 */
export function fireDefense(state, b, target, opts = {}) {
  const cfg = typeConfig(b.type);
  const pcfg = CONFIG.projectiles[DEFENSE_PROJECTILE[b.type]];
  const c = footprintCenter(b);
  const lvl = cfg.levels[b.level - 1];
  const fx = abilityFx(b);
  const damage = lvl.damage * towerDamageMult(b) * (opts.damageMult ?? 1);
  if (cfg.pierce) return fireSpear(state, b, target, damage, cfg, pcfg, opts);
  const pool = cfg.pool ? catapultPool(b, cfg, lvl, fx) : null;
  const normalPool = pool ? { ...pool } : null; // (a Diddy Trebuchet's jugs keep the normal pool, even on a Big Jug)
  if (pool && opts.poolScale) pool.radius *= opts.poolScale; // Diddypult Big Jug
  const p = {
    id: nextId(state, 'p'),
    kind: opts.kind || b.type,
    owner: 'tower',
    sourceId: b.id,
    tower: b.type,
    x: c.x, y: c.y,
    startX: c.x, startY: c.y,
    targetId: target.id,
    damage,
    splashRadius: opts.splash ?? ((cfg.splashRadius || 0) + (fx.splashAdd || 0)),
    // Catapult: what the shot leaves behind where it lands.
    pool,
    // KSI Tower: the chill its splash leaves on every enemy hit (chillEnemy).
    chill: cfg.chill ? ksiChill(cfg, lvl, fx) : null,
    range: towerRange(b),  // Locklair Bullseye measures against it
    star: !!opts.star,     // Firework Star Shells
    hitsGround: towerHits(b).ground,
    hitsAir: cfg.hitsAir,
    groundMult: cfg.hitsGround ? 1 : (fx.groundDamage || 0), // Firework Ground Show
    fx,
    crit: !!opts.crit,
    source: opts.source || null,
    done: false
  };
  // Merged defenses (CONFIG.merges, merge.js): a side shell's trimmed perks (Triple Strike), a Mega Cannon's roll, a
  // Ballista Bolt's pin, the Mortar's Concussion Mastery, and the volley a shell belongs to (Synchronized Impact).
  const merge = mergedConfigOf(b);
  if (opts.fx) p.fx = opts.fx;
  if (merge) {
    p.merged = true; // (drawn bigger: ProjectileView MERGED_SCALE)
    const mfx = masteryFxOf(b);
    if (merge.roll && !opts.kind && !enemyIsAir(target)) { p.roll = rollFor(merge.roll, fx, mfx); p.mega = true; }
    if (mfx.slowOnHit) p.fx = { ...p.fx, slowOnHit: Math.max(p.fx.slowOnHit || 0, mfx.slowOnHit), slowSeconds: Math.max(p.fx.slowSeconds || 0, mfx.slowSeconds || 1) };
    if (merge.shatter && p.chill) p.shatter = shatterFor(b, p.chill); // KSI Frost Fortress: what it chills can shatter (shatter.js)
    // Diddy Trebuchet: the shot is a giant barrel that bursts into oil jugs where it lands (barrelBurst.js); its jugs hit
    // for a share of a normal barrel's hit (not a Big Jug's), and Tar Pit makes its own pool slower and longer.
    if (merge.barrelBurst && p.pool && !opts.kind) {
      p.barrel = barrelFor(b, damage / (opts.poolScale || 1), normalPool);
      p.pool = tarPool(b, p.pool);
    }
  }
  if (opts.bolt) p.bolt = opts.bolt;
  if (opts.volley) p.volley = opts.volley;
  if (pcfg.flightTime !== undefined) {
    // Mortar: arcs to where the target is right now, lands after flightTime.
    p.homing = false;
    p.targetX = target.x; p.targetY = target.y;
    p.elapsed = 0; p.flightTime = pcfg.flightTime;
    // Mortar Ranging Shot: aim where the target will be when the shell lands (at most 3 tiles ahead).
    if (fx.leadShot && (target.vx || target.vy)) {
      let lx = (target.vx || 0) * pcfg.flightTime, ly = (target.vy || 0) * pcfg.flightTime;
      const len = Math.hypot(lx, ly);
      if (len > 3) { lx *= 3 / len; ly *= 3 / len; }
      p.targetX += lx; p.targetY += ly;
    }
    if (opts.aim) { p.targetX = opts.aim.x; p.targetY = opts.aim.y; } // a Triple Strike shell spread around its target
  } else {
    p.homing = true;
    p.speed = pcfg.speed * (1 + (fx.projSpeedPct || 0) / 100); // Firework Skyrocket
  }
  state.projectiles.push(p);
  if (!opts.quiet) emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: b.id, mega: !!p.mega, bolt: !!p.bolt });
  return p;
}

/** A Mega Cannon shot's roll: its config, made longer by Heavy Shot's pierce perks and the Heavier Ball Mastery. */
function rollFor(R, fx, mfx) {
  const extra = fx.pierce ? (fx.pierceLength || 0) * (R.pierceLengthShare || 0) : 0;
  return {
    length: R.length + (mfx.rollAdd || 0) + extra, speed: R.speed, hitRadius: R.hitRadius, burstRadius: R.burstRadius, burstDamage: R.burstDamage,
    bossSlow: R.bossSlow, burstStun: mfx.burstStun || 0, trailDps: mfx.trailDps || 0, trailSeconds: mfx.trailSeconds || 0, trailRadius: mfx.trailRadius || 0.5
  };
}

/**
 * Hold an enemy for `seconds` (a stun), or, for a boss (Da Baby Car), slow it by `bossSlow` instead: bosses are never
 * held by the merged abilities. Returns true if it was held.
 */
function holdOrSlow(e, seconds, bossSlow) {
  if (!e.alive || !(seconds > 0)) return false;
  if (CONFIG.enemies[e.kind].boss) { applySlow(e, bossSlow || 0.5, seconds); return false; }
  applyStun(e, seconds);
  return true;
}

/**
 * Locklair Citadel's Ballista Bolt: pins the enemy for `seconds` (held: no moving or attacking; a flyer hangs in the
 * air; a dashing Quandale Dingle's dash ends with no impact, see applyStun). Barbed Bolt: it takes `vuln` more damage
 * from everything while pinned. Bosses are only slowed (bossSlow). Emits 'enemyPinned'. Returns true if pinned.
 */
export function pinEnemy(state, e, { seconds, vuln = 0, bossSlow = 0.5 } = {}) {
  if (!e || !e.alive || !(seconds > 0)) return false;
  const pinned = holdOrSlow(e, seconds, bossSlow);
  if (pinned) {
    e.pinT = Math.max(e.pinT || 0, seconds);
    if (vuln) applyVuln(e, vuln, seconds);
  }
  emit(state, 'enemyPinned', { id: e.id, kind: e.kind, x: e.x, y: e.y, seconds, boss: !pinned });
  return pinned;
}

/**
 * Damage multiplier for the nth enemy (0 = the first) a piercing spear passes through: 100%, then `falloff` less for
 * each further enemy (falloff 0.25: 100 / 75 / 50 / 25%), never below 0.
 */
export function pierceMultiplier(index, falloff) {
  return Math.max(0, 1 - falloff * Math.max(0, index));
}

/**
 * Spear Thrower: a straight-line spear through the target, aimed a little ahead of a moving one. It keeps flying
 * cfg.pierce.length tiles past the target and hits up to cfg.pierce.max enemies on the way (the first at full
 * damage, each next one pierceMultiplier() less). The line stays in its target's layer: a spear thrown at a ground
 * enemy pierces ground enemies only, one thrown at a flyer pierces flyers only (it never mixes the two).
 */
function fireSpear(state, b, target, damage, cfg, pcfg, opts) {
  const c = footprintCenter(b);
  const speed = pcfg.speed;
  let tx = target.x, ty = target.y;
  if (target.vx || target.vy) {
    const lead = Math.min(distance(c.x, c.y, tx, ty) / speed, 0.6); // seconds in the air (capped: no wild leads)
    tx += (target.vx || 0) * lead; ty += (target.vy || 0) * lead;
  }
  let dx = tx - c.x, dy = ty - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) { dx = 1; dy = 0; }
  const fx = abilityFx(b); // Spear Thrower perks: more enemies pierced, a longer line, less falloff
  const air = enemyIsAir(target); // the line pierces the first target's layer only (ground or air)
  const p = fireLine(state, c.x, c.y, dx, dy, {
    kind: opts.kind || b.type, sourceId: b.id, tower: b.type, speed,
    travel: dist + cfg.pierce.length + (fx.spearLengthAdd || 0), pierce: cfg.pierce.max + (fx.spearPierceAdd || 0),
    falloff: Math.max(0, cfg.pierce.falloff + (fx.spearFalloffAdd || 0)),
    hitRadius: 0.55, damage, hitsGround: !air && !!cfg.hitsGround, hitsAir: air && !!cfg.hitsAir, fx,
    source: opts.source || 'spear'
  });
  if (opts.harpoon) p.harpoon = opts.harpoon; // Harpoon Ballista's Reel In: hooks its target when it hits it (harpoon.js)
  return p;
}

/** A KSI Tower bottle's chill: its level's slow and the type's duration, with the Blizzard / Fully Frozen perks. */
function ksiChill(cfg, lvl, fx) {
  return {
    slow: Math.min(0.9, lvl.slow + (fx.chillSlowAdd || 0)),
    seconds: cfg.chill.seconds + (fx.chillSecondsAdd || 0),
    bossShare: cfg.chill.bossShare
  };
}

/**
 * Chill an enemy (KSI Tower): slowed by `slow` for `seconds` (the strongest slow on it wins: slows never stack) and
 * drawn icy blue while it lasts (e.chillT). Bosses only take bossShare of the slow.
 */
export function chillEnemy(e, chill) {
  if (!e.alive || !chill) return;
  const boss = !!CONFIG.enemies[e.kind].boss;
  applySlow(e, chill.slow * (boss ? chill.bossShare : 1), chill.seconds);
  e.chillT = Math.max(e.chillT || 0, chill.seconds);
}

/**
 * KSI Tower Fully Frozen: frozen solid for `seconds` (held in place, the Ice Bag spell's icy look; e.frozenT is run
 * down by spells.js, so state._spellMarks keeps that going). Bosses can't be frozen. Ice Shatter: frozenVuln.
 */
export function freezeEnemy(state, e, seconds, vuln = 0) {
  if (!e.alive || CONFIG.enemies[e.kind].boss) return;
  applyStun(e, seconds);
  e.frozenT = Math.max(e.frozenT || 0, seconds);
  state._spellMarks = true;
  if (vuln) applyVuln(e, vuln, seconds);
  emit(state, 'enemyFrozen', { id: e.id, x: e.x, y: e.y });
}

/** A Catapult shot's pool with the Toxic path applied (a Diddy Trebuchet's: its damageMult too, like its impact). */
function catapultPool(b, cfg, lvl, fx) {
  const auraMult = (1 + (auraOf(b).damagePct || 0) / 100) * ((mergedConfigOf(b) || {}).damageMult || 1);
  return {
    radius: cfg.pool.radius + (fx.poolRadiusAdd || 0),
    duration: Math.max(cfg.pool.duration + (fx.poolDurationAdd || 0), fx.poolDurationMin || 0),
    slow: Math.max(cfg.pool.slow, fx.poolSlow || 0),
    dps: lvl.poolDps * (1 + (fx.poolDpsPct || 0) / 100) * auraMult,
    grow: fx.poolGrow || 0,     // Spillover
    airMult: fx.poolAir || 0    // Toxic Fumes
  };
}

/** Up to `n` targets: the main one first, then other valid enemies nearest to it; repeats when short. */
function spreadTargets(state, b, main, n) {
  const others = validTargets(state, b).filter((e) => e !== main)
    .sort((x, y) => distance(main.x, main.y, x.x, x.y) - distance(main.x, main.y, y.x, y.y));
  const out = [main];
  for (let i = 1; i < n; i++) out.push(others[i - 1] || main);
  return out;
}

/** One trigger pull: every shot this tower sends this time (multi-shot, crits, Grapeshot, Headshot, Boulder). */
function shoot(state, b, target) {
  const fx = abilityFx(b);
  b.shots = (b.shots || 0) + 1;
  const every = (n) => n && b.shots % n === 0;
  const merge = mergedConfigOf(b);
  let mult = mergeShotMult(b); // a merged defense's shots hit harder (Mega Cannon 3.2x in all, with towerDamageMult)
  if (fx.surgeIdle && (b.sinceShot ?? Infinity) >= fx.surgeIdle) mult *= fx.surgeMult;            // Gandolf Mana Surge
  b.sinceShot = 0;
  if (fx.firstShotMult && b.lastShotTarget !== target.id) mult *= fx.firstShotMult;            // Locklair Ambush
  if (fx.rampPct) b.rampStacks = b.lastShotTarget === target.id ? Math.min((b.rampStacks || 0) + 1, fx.rampMax / fx.rampPct) : 0; // Hot Barrel
  b.lastShotTarget = target.id;
  if (fx.stealPct) mult *= 1 + Math.min(fx.stealMax, (b.stealStacks || 0) * fx.stealPct) / 100; // Gandolf Spellsteal
  const extra = {};
  if (every(fx.kegEvery)) extra.splash = fx.kegSplash;                                          // Cannon Powder Keg
  if (every(fx.jugEvery)) { mult *= fx.jugMult; extra.poolScale = fx.jugMult; }                  // Diddypult Big Jug
  if (every(fx.starEvery)) extra.star = true;                                                    // Firework Star Shells
  // Catapult Boulder: every Nth shot rolls a boulder instead.
  if (every(fx.boulderEvery)) { fireBoulder(state, b, target, fx); return; }
  // Locklair Citadel's Ballista Bolt: every Nth shot (Quick Crank: sooner) is a bolt that pins its target. The other
  // arrows of a multi-shot still fly, and a Headshot due on this shot comes too.
  if (merge && merge.bolt) {
    const mfx = masteryFxOf(b), B = merge.bolt;
    b.boltCount = (b.boltCount || 0) + 1;
    if (b.boltCount >= (mfx.boltEvery || B.every)) {
      b.boltCount = 0;
      const bolt = { seconds: mfx.pinSeconds || B.pinSeconds, vuln: mfx.pinVuln || 0, bossSlow: B.bossSlow, skewer: mfx.skewer ? B.skewerLength : 0 };
      fireDefense(state, b, target, { ...extra, damageMult: mult * B.mult, bolt, source: 'bolt' });
      for (const t of spreadTargets(state, b, target, Math.max(1, fx.multiShot || 1)).slice(1)) fireDefense(state, b, t, { ...extra, damageMult: mult });
      if (every(fx.headshotEvery)) fireDefense(state, b, toughestTarget(state, b) || target, { ...extra, damageMult: mult * fx.headshotMult, source: 'headshot' });
      return;
    }
  }
  // Harpoon Ballista's Reel In (harpoon.js): every Nth throw is a harpoon at the toughest enemy in range (Double Hook:
  // the two toughest), which drags it back when it hits.
  if (merge && merge.harpoon && harpoonDue(b)) { throwHarpoons(state, b, mult, extra); return; }
  // Locklair Headshot: every Nth arrow goes to the toughest enemy for a big multiplier.
  if (every(fx.headshotEvery)) {
    const t = toughestTarget(state, b) || target;
    fireDefense(state, b, t, { ...extra, damageMult: mult * fx.headshotMult, source: 'headshot' });
    return;
  }
  if (merge && merge.triple) fireTriple(state, b, target, extra, mult, merge.triple); // Litman Triple Mortar: Triple Strike
  else {
    for (const t of spreadTargets(state, b, target, Math.max(1, fx.multiShot || 1))) {
      const crit = fx.critChance && random(state) < fx.critChance;
      fireDefense(state, b, t, crit ? { ...extra, damageMult: mult * fx.critMult, crit: true, source: 'crit' } : { ...extra, damageMult: mult });
    }
  }
  // Cannon Grapeshot: every Nth shot also sprays pellets at other enemies.
  if (fx.grapeEvery && b.shots % fx.grapeEvery === 0) {
    const pellets = spreadTargets(state, b, target, 1 + fx.grapePellets).slice(1);
    for (const t of pellets) fireDefense(state, b, t, { damageMult: fx.grapeDamage * mergeShotMult(b), kind: 'pellet' });
  }
  // Mortar Barrage: more shells follow this one.
  if (fx.burst > 1) { b.burstLeft = fx.burst - 1; b.burstTimer = BURST_GAP; }
}

/**
 * Litman Triple Mortar's Triple Strike: `T.shells` shells at once, each T.shellMult of a shell's damage. The main one
 * lands on the target with every perk; the others go to the next enemies in range (sideTargets) with the heavy
 * once-per-shot perks left out (T.sideShellDrops: Cluster Shell, Seismic Charge, Fault Line, Aftershock, Craters, fire
 * patches), else T.spread tiles to either side of the target. Synchronized Impact (Mastery): the volley is tracked so a
 * combined blast can go off when they land (volleyLanded).
 */
function fireTriple(state, b, target, extra, mult, T) {
  const fx = abilityFx(b), mfx = masteryFxOf(b);
  const sideFx = {};
  for (const [k, v] of Object.entries(fx)) if (!T.sideShellDrops.includes(k)) sideFx[k] = v;
  const volley = mfx.syncRadius ? { left: T.shells, landed: [], radius: mfx.syncRadius, mult: mfx.syncDamage, stun: mfx.syncStun, damage: 0 } : null;
  const opts = { damageMult: mult * T.shellMult, volley };
  const main = fireDefense(state, b, target, { ...extra, ...opts });
  if (volley) volley.damage = main.damage;
  const picks = sideTargets(state, b, target, T.shells - 1, T.spreadApart);
  const c = footprintCenter(b);
  const away = Math.atan2(main.targetY - c.y, main.targetX - c.x);
  let spare = 0;
  for (let i = 0; i < T.shells - 1; i++) {
    const e = picks[i];
    if (e) { fireDefense(state, b, e, { ...opts, fx: sideFx, quiet: true }); continue; }
    // Not enough targets: land beside the main shell, alternating sides across the line of fire (a wider volley).
    const a = away + (spare % 2 === 0 ? Math.PI / 2 : -Math.PI / 2), r = T.spread * (1 + Math.floor(spare / 2) * 0.5);
    spare++;
    fireDefense(state, b, target, { ...opts, fx: sideFx, quiet: true, aim: { x: main.targetX + Math.cos(a) * r, y: main.targetY + Math.sin(a) * r } });
  }
}

/**
 * Up to `n` enemies for Triple Strike's other shells: valid targets other than the main one, those not already under a
 * shell first, then those at least `apart` tiles from where the shells so far will land, then the nearest to the target.
 */
export function sideTargets(state, b, main, n, apart = 1) {
  const busy = new Set(state.projectiles.filter((p) => !p.done && p.owner === 'tower' && p.targetId).map((p) => p.targetId));
  const out = [], spots = [{ x: main.x, y: main.y }];
  const pool = validTargets(state, b).filter((e) => e !== main);
  for (let k = 0; k < n; k++) {
    let best = null, bestKey = null;
    for (const e of pool) {
      if (out.includes(e)) continue;
      const dmin = Math.min(...spots.map((s) => distance(s.x, s.y, e.x, e.y)));
      const key = [busy.has(e.id) ? 1 : 0, dmin >= apart ? 0 : 1, distance(main.x, main.y, e.x, e.y)];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && (key[1] < bestKey[1] || (key[1] === bestKey[1] && key[2] < bestKey[2])))) { best = e; bestKey = key; }
    }
    if (!best) break;
    out.push(best);
    spots.push({ x: best.x, y: best.y });
  }
  return out;
}

/**
 * A Triple Strike shell landed. Once the whole volley is down, Synchronized Impact: if 2+ shells landed within the
 * Mastery's radius of each other, one combined blast at their middle (syncDamage x a shell's damage, ground only) that
 * holds what it hits (bosses slowed).
 */
function volleyLanded(state, p) {
  const v = p.volley;
  v.landed.push({ x: p.targetX, y: p.targetY });
  if (--v.left > 0) return;
  const near = v.landed.filter((s, i) => v.landed.some((o, j) => j !== i && distance(s.x, s.y, o.x, o.y) <= v.radius));
  if (near.length < 2) return;
  const x = near.reduce((a, s) => a + s.x, 0) / near.length, y = near.reduce((a, s) => a + s.y, 0) / near.length;
  const hit = applySplash(state, x, y, p.splashRadius || 1.5, v.damage * v.mult, true, false, 'syncBlast');
  for (const e of hit) holdOrSlow(e, v.stun, 0.5);
}

/** Is this a tower that shoots projectiles (not a support tower, trap or beam)? */
export function isShooter(b) {
  if (!isDefense(b.type) || isSupport(b.type)) return false;
  const cfg = typeConfig(b.type);
  return !cfg.trap && !cfg.beam;
}

/** Count down cooldowns, pick targets, fire. Destroyed defenses never fire. */
export function stepDefenses(state, dt) {
  for (const b of state.buildings) {
    if (b.destroyed || !isShooter(b)) continue;
    if (b.stunT > 0) continue; // stunned by Quandale's dash impact: no firing (the cooldown and bursts wait)
    b.cooldown = Math.max(0, (b.cooldown || 0) - dt);
    b.sinceShot = (b.sinceShot ?? Infinity) + dt;
    const fx = abilityFx(b);
    if (fx.crowdRangeAdd || fx.groundFireRatePct) {
      const c = footprintCenter(b);
      b._crowdRange = 0;
      const base = towerRange(b);
      const near = state.enemies.filter((e) => e.alive && distance(c.x, c.y, e.x, e.y) <= base);
      if (fx.crowdRangeAdd && near.length >= fx.crowdCount) b._crowdRange = fx.crowdRangeAdd;  // Gandolf Storm Front
      b._noFlyers = !near.some((e) => enemyIsAir(e));                                         // Firework Rapid Display
    }
    const target = chooseTarget(state, b);
    // Mortar Ready Rack: load shells while idle; fire them all as soon as something shows up.
    if (fx.rackMax) {
      if (!target) {
        b.rackT = (b.rackT || 0) + dt;
        if (b.rackT >= towerFireInterval(b)) { b.rackT = 0; b.rack = Math.min(fx.rackMax, (b.rack || 0) + 1); }
      } else if (b.rack > 0) {
        b.burstLeft = (b.burstLeft || 0) + b.rack;
        b.burstTimer = Math.min(b.burstTimer > 0 ? b.burstTimer : BURST_GAP, BURST_GAP);
        b.rack = 0;
        b.rackT = 0;
      }
    }
    // Mortar Barrage: the rest of the burst, a moment apart.
    if (b.burstLeft > 0) {
      b.burstTimer -= dt;
      if (b.burstTimer <= 0) {
        if (target) fireDefense(state, b, target);
        b.burstLeft--;
        b.burstTimer = BURST_GAP;
      }
    }
    if (target && b.cooldown <= 0) {
      shoot(state, b, target);
      b.cooldown = towerFireInterval(b);
    }
  }
}

/** How much less damage an enemy deals: F.L.O.C.K Jammer (e.weaken) or Tower of Rah Melt Armor (e.melt). */
export function enemyWeaken(e) {
  return Math.max(e.weaken || 0, e.meltTimer > 0 ? e.melt || 0 : 0);
}

/** Hex / Spotlight / Tenderizer: the enemy takes `v` more damage from everything for `seconds`. */
export function applyVuln(e, v, seconds) {
  if (!e.alive || !(v > 0)) return;
  e.vuln = Math.max(e.vulnTimer > 0 ? e.vuln || 0 : 0, v);
  e.vulnTimer = Math.max(e.vulnTimer || 0, seconds);
}

/**
 * Area damage on a packed enemy (crowd cap, waves.js applyCrowdCap): it stands for `pack` enemies, so area hits
 * (splash, pools, traps, area abilities, and poison / burn spread by them) count several times over, as they'd
 * have hit part of the crowd: pack ** crowdCap.areaExponent times (areaDamage()). Not the whole pack: a real
 * crowd is spread out (packed enemies come `pack` times further apart), so a splash only ever caught some of it.
 * The exponent is tuned so a capped wave takes about as much damage as the uncapped one did. 1 for everyone else;
 * single-target hits stay as they are.
 */
export function areaPack(e) {
  return e.pack > 1 ? e.pack ** CONFIG.rules.crowdCap.areaExponent : 1;
}

/** Damage from something that hits an area: counts once for every enemy a packed enemy stands for. */
export function areaDamage(state, e, amount, source = null) {
  damageEnemy(state, e, amount * areaPack(e), source);
}

/**
 * Locklair Venom: poison `dps` for `seconds` (the stronger poison wins). `slow` slows it while poisoned;
 * `spread` (tiles): when it dies poisoned, the poison jumps to every enemy that close.
 */
export function poisonEnemy(e, dps, seconds, slow = 0, spread = 0, ramp = 0) {
  if (!e.alive || !(dps > 0)) return;
  if (!(e.poisonTime > 0)) e.poisonAge = 0; // a fresh poison starts its Festering ramp over
  e.poisonRamp = Math.max(e.poisonTime > 0 ? e.poisonRamp || 0 : 0, ramp);
  e.poisonDps = Math.max(e.poisonTime > 0 ? e.poisonDps || 0 : 0, dps);
  e.poisonTime = Math.max(e.poisonTime || 0, seconds);
  e.poisonSeconds = seconds;
  e.poisonSlow = Math.max(e.poisonSlow || 0, slow);
  e.poisonSpread = Math.max(e.poisonSpread || 0, spread);
}

/** A hit that lands a moment later on a spot (Arrow Storm, Meteor, Aftershock). `t` defaults to strikeDelay. */
export function createStrike(state, strike) {
  if (!state.strikes) state.strikes = [];
  const s = { id: nextId(state, 'st'), t: ABILITY_RULES.strikeDelay, ...strike };
  state.strikes.push(s);
  emit(state, 'strikeIncoming', { id: s.id, kind: s.kind, x: s.x, y: s.y, radius: s.radius, delay: s.t });
  return s;
}

/** Gold bounty multiplier from economy perks: Central Bank (any Storage) and Bounty Vault (a Mine within reach). */
function economyBountyMult(state, e) {
  let bank = 0, vault = 0;
  for (const b of state.buildings) {
    if (b.destroyed || (b.type !== 'storage' && b.type !== 'mine')) continue;
    const fx = abilityFx(b);
    if (fx.bountyPct) bank = Math.max(bank, fx.bountyPct);
    if (fx.nearBountyPct && distanceToFootprint(b, e.x, e.y) <= fx.nearRadius) vault = Math.max(vault, fx.nearBountyPct);
  }
  return 1 + (bank + vault) / 100;
}

/** Damage one enemy; on death add its bounty (up to capacity). `source` tags the hit for the view (e.g. 'pool'). */
export function damageEnemy(state, e, amount, source = null) {
  if (!e.alive) return;
  if (isBurrowedUnseen(e)) return; // underground, unseen: nothing reaches it
  // Marked by a F.L.O.C.K Tower: takes extra damage from everything. Held by a Tenderizer trap: more still.
  // F.L.O.C.K Weak Point Scan: the mark counts double on an enemy under its health threshold.
  const mark = (e.markBonus || 0) * (e.markExecute && e.hp / (e.maxHp || e.hp || 1) < e.markExecute ? 2 : 1);
  amount *= 1 + mark + (e.vulnTimer > 0 ? e.vuln || 0 : 0);
  // F.L.O.C.K Exposed: a marked enemy sometimes takes double.
  if (e.exposedChance && random(state) < e.exposedChance) { amount *= e.exposedMult || 2; if (!source) source = 'crit'; }
  // Bri Bri Bicus Dicus: while its armor holds, every hit goes into the armor. The hit that breaks it does no
  // health damage at all: whatever was left over is lost (user, v0.7). Only later hits reach its health.
  // While it holds, the armor also cuts the damage (CONFIG armorReduction); that reduced amount is what the armor
  // loses and what the damage number shows. Once broken there is no reduction.
  let toHp = amount;
  if (e.armor > 0) {
    amount *= 1 - (CONFIG.enemies[e.kind]?.armorReduction || 0);
    if (!source) source = 'armor'; // the damage number reads as armored (steel blue)
    e.armor -= amount;
    toHp = 0;
    if (e.armor <= 0) { e.armor = 0; emit(state, 'armorBroken', { id: e.id, kind: e.kind, x: e.x, y: e.y }); }
  }
  e.hp -= toHp;
  e.hit = true;
  emit(state, 'enemyHit', { id: e.id, amount, x: e.x, y: e.y, source });
  if (e.hp <= 0) {
    e.hp = 0;
    e.alive = false;
    queueShatter(state, e); // KSI Frost Fortress: chilled by it -> bursts into ice shards (shatter.js)
    const loot = nightLootMult(state) * (e.pack || 1); // restless nights pay more; a packed enemy pays for all it stands for
    const goldPerk = economyBountyMult(state, e); // Central Bank (Storage), Bounty Vault (Mine near it)
    addHype(state, e.pack || 1); // DJ Babyface's meter
    const added = addGold(state, Math.round(CONFIG.enemies[e.kind].bounty * loot * goldPerk));
    if (state.wave) state.wave.bountyEarned = (state.wave.bountyEarned || 0) + added;
    // F.L.O.C.K Bounty Hunter (marked enemies pay more gold) and Data Leech (+RP in range).
    const extraGold = e.markBounty > 0 ? addGold(state, Math.round(CONFIG.enemies[e.kind].bounty * e.markBounty)) : 0;
    if (extraGold && state.wave) state.wave.bountyEarned += extraGold;
    const rp = addResearchPoints(state, Math.round((killResearchPoints(e.kind) + (e.leechRp || 0)) * loot)); // research points for the RV Lab
    emit(state, 'enemyKilled', { id: e.id, kind: e.kind, x: e.x, y: e.y, bounty: added + extraGold, rp });
    // Wall Breakers blow up however they die (shot down included), hitting everything around them.
    const cfg = CONFIG.enemies[e.kind];
    if (cfg.explodes && !e.exploded) explode(state, e, cfg);
    // Grimace Golem: one big puddle of goo where he falls (v0.8).
    if (cfg.goo && !state.gameOver) dropGoo(state, e.x, e.y, cfg.goo, true);
    // Spreading Plague: a poisoned enemy passes its poison on to everyone close by.
    if (e.poisonTime > 0 && e.poisonSpread > 0) {
      for (const o of state.enemies) {
        // Spread to an area: per enemy it stood for, times the enemies each one it reaches stands for.
        if (o !== e && o.alive && distance(e.x, e.y, o.x, o.y) <= e.poisonSpread) poisonEnemy(o, (e.poisonDps / areaPack(e)) * areaPack(o), e.poisonSeconds || 3, e.poisonSlow, e.poisonSpread);
      }
      emit(state, 'poisonSpread', { x: e.x, y: e.y, radius: e.poisonSpread });
    }
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
    damageBuilding(state, b, enemyDamageVs(cfg, b) * (e.pack || 1)); // a packed Wall Breaker blasts for several
    if (state.gameOver) return;
  }
}

/**
 * Full damage to every enemy within radius that the shot is allowed to hit. `kind` = the tower that fired.
 * `groundMult` scales the damage to ground enemies (Firework Ground Show). Returns the enemies hit.
 */
export function applySplash(state, x, y, radius, damage, hitsGround, hitsAir, kind = null, { groundMult = 1, source = null, perEnemy = null } = {}) {
  const hit = [];
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const allowed = enemyIsAir(e) ? hitsAir : hitsGround;
    if (allowed && distance(x, y, e.x, e.y) <= radius) hit.push(e);
  }
  for (const e of hit) areaDamage(state, e, (enemyIsAir(e) ? damage : damage * groundMult) * (perEnemy ? perEnemy(e) : 1), source);
  emit(state, 'splash', { x, y, radius, kind });
  return hit;
}

/**
 * Damage a building. Storage also drains gold. At 0 HP the building is destroyed;
 * a destroyed town hall ends the game.
 */
export function damageBuilding(state, b, amount, attacker = null) {
  if (b.destroyed || state.gameOver) return;
  if (CONFIG.defenses[b.type]?.trap) return; // hidden traps can't be hit
  if (b.spellInvisT > 0) return;             // nor can buildings under an Invisibility spell (spells.js)
  if (b._mageAegis) { emit(state, 'aegisBlocked', { id: b.id }); return; } // the Locklair Mage's Arcane Aegis (mage.js)
  const fx = abilityFx(b);
  // Firework Counter-Flare: a free rocket back at whoever hit it (if it can hit them).
  if (fx.counterFire && attacker && attacker.alive && !(b.counterT > 0)) {
    const hits = towerHits(b);
    if (enemyIsAir(attacker) ? hits.air : hits.ground) { b.counterT = fx.counterFire; fireDefense(state, b, attacker, { source: 'counter' }); }
  }
  if (fx.armor) amount *= 1 - fx.armor; // Cannon Armor Plating
  // Economy perks: Hidden Stash (Mr. Least hits softer), Panic Room (less damage when low), Field
  // Medics (a building gnomes are repairing), Dye Pack (Mr. Least is slowed when he hits it).
  if (fx.thiefResistPct && attacker && attacker.kind === 'thief') amount *= 1 - fx.thiefResistPct / 100;
  if (fx.lowHpArmor && b.hp < maxHp(b) * 0.3) amount *= 1 - fx.lowHpArmor;
  if (b._repairArmor) amount *= 1 - b._repairArmor / 100;
  if (b._mageWard) amount *= 1 - b._mageWard; // the Locklair Mage's Warding Light (mage.js)
  if (fx.thiefSlow && attacker && attacker.kind === 'thief' && attacker.alive) applySlow(attacker, fx.thiefSlow, 4);
  let dmg = Math.min(amount, b.hp);
  // Cannon Last Stand: the hit that takes it under 30% (even a fatal one) starts it, once per night;
  // while it lasts the cannon can't drop below 1 HP.
  if (fx.lastStand && !b.lastStandUsed && b.hp - dmg < maxHp(b) * ABILITY_RULES.lastStandBelow) {
    b.lastStandUsed = true;
    b.lastStandT = ABILITY_RULES.lastStandSeconds;
    emit(state, 'lastStand', { id: b.id });
  }
  if (b.lastStandT > 0) dmg = Math.max(0, Math.min(dmg, b.hp - 1));
  if (b.type === 'storage') {
    const lost = storageDrainAmount(state, b, dmg);
    if (lost > 0) {
      setGold(state, state.gold - lost);
      // Insurance (a Storage perk): part of it comes back when the wave is beaten.
      if (fx.insurancePct && state.wave) state.wave.insured = (state.wave.insured || 0) + lost * fx.insurancePct / 100;
      emit(state, 'storageDrained', { id: b.id, amount: lost });
    }
  }
  b.hp -= dmg;
  b.underFire = CONFIG.villagers.repairDelayAfterHit; // gnomes hold off repairing it for a moment
  emit(state, 'buildingDamaged', { id: b.id, amount: dmg, hp: b.hp, maxHp: maxHp(b) });
  if (b.hp <= 0) {
    b.hp = 0;
    b.destroyed = true;
    b.compound = 0; // Compound Mining starts over
    if (isDefense(b.type)) b.targetId = null;
    // Wave stars: every building (not wall) lost during a wave lowers its rating.
    if (b.type !== 'wall' && state.wave && state.wave.phase === 'active') state.wave.lost = (state.wave.lost || 0) + 1;
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
  const dmg = cfg.damage * enrageFactor(state, e).damage * (e.pack || 1) * (1 - enemyWeaken(e));
  // La Vaca Saturno's bouncing boulder and Big Yahu's missile (specialEnemies.js).
  if (cfg.bounce) return fireBoulderAt(state, e, building, dmg);
  if (cfg.missileStrike) return fireMissileAt(state, e, building, dmg);
  const p = {
    id: nextId(state, 'p'),
    owner: 'enemy',
    sourceId: e.id,
    x: e.x, y: e.y,
    startX: e.x, startY: e.y,
    targetId: building.id,
    damage: dmg,
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

// ---------- what a tower shot does when it lands ----------
/** Direction from (fx, fy) to an enemy, or `fallback` when it's right on top. */
function dirFrom(x, y, e, fallback) {
  const dx = e.x - x, dy = e.y - y;
  return Math.hypot(dx, dy) > 1e-6 ? { x: dx, y: dy } : fallback;
}

/**
 * Per-enemy hit effects: knockback, stun, slow, air burn, air stun. `dir` is the push direction. `area`: the
 * hit was a splash, so poison / burn it leaves count for every enemy a packed one stands for (areaPack).
 */
function hitEffects(state, p, e, dir, area = false) {
  const fx = p.fx || {};
  const n = area ? areaPack(e) : 1;
  if (!e.alive) return;
  if (fx.knockback && dir) {
    const moved = knockback(state, e, dir.x, dir.y, fx.knockback);
    // Cannon Anvil Shot: slammed into a wall or building (the shove was cut short).
    if (fx.slamStun && !enemyIsAir(e) && moved < fx.knockback - 0.05) {
      applyStun(e, fx.slamStun);
      emit(state, 'slam', { id: e.id, x: e.x, y: e.y });
      damageEnemy(state, e, p.damage * fx.slamDamage, 'slam');
      if (!e.alive) return;
    }
  }
  if (fx.disarm) e.disarmT = Math.max(e.disarmT || 0, fx.disarm);                         // Firework Showstopper
  if (fx.groundFlyers && CONFIG.enemies[e.kind].type === 'air') {                        // Firework Grounding Burst
    if (!(e.grounded > 0)) emit(state, 'grounded', { id: e.id, x: e.x, y: e.y });
    e.grounded = Math.max(e.grounded || 0, fx.groundFlyers);
  }
  if (fx.hangover && !enemyIsAir(e)) { e.wanderT = Math.max(e.wanderT || 0, fx.hangover); e.wanderTo = null; } // Hangover
  if (fx.stun) applyStun(e, fx.stun);
  if (fx.stunOnHit) applyStun(e, fx.stunOnHit);
  if (fx.slowOnHit) applySlow(e, fx.slowOnHit, fx.slowSeconds || 1);
  if (enemyIsAir(e)) {
    if (fx.airStun) applyStun(e, fx.airStun);
    if (fx.airBurnDps) burnEnemy(e, p.damage * fx.airBurnDps * n, fx.airBurnSeconds);
  }
  if (fx.poisonDps) poisonEnemy(e, p.damage * fx.poisonDps * n, fx.poisonSeconds || 3, fx.poisonSlow || 0, fx.poisonSpread || 0, fx.poisonRamp || 0);
  if (fx.vulnOnHit) applyVuln(e, fx.vulnOnHit, fx.vulnSeconds || 3);
  if (fx.bleedOnHit) burnEnemy(e, p.damage * fx.bleedOnHit * n, fx.bleedSeconds || 3);
}

/** Set an enemy on fire: `dps` for `seconds` (the stronger burn wins; ticks in stepEnemyStatus). */
export function burnEnemy(e, dps, seconds) {
  if (!e.alive || !(dps > 0)) return;
  e.burnDps = Math.max(e.burnTime > 0 ? e.burnDps || 0 : 0, dps);
  e.burnTime = Math.max(e.burnTime || 0, seconds);
}

/** Splash, then everything the shot's abilities add at the spot it landed. */
function landSplash(state, p, x, y, primary) {
  const fx = p.fx || {};
  const travel = { x: x - p.startX, y: y - p.startY };
  let radius = p.splashRadius;
  // Firework Peony: an even bigger burst on a bunch of flyers.
  if (fx.crowdSplash && state.enemies.filter((e) => e.alive && enemyIsAir(e) && distance(x, y, e.x, e.y) <= radius).length >= 3) radius += fx.crowdSplash;
  // Diddypult Pressure Cap: the pop sucks ground enemies toward the splash first.
  if (fx.pull) {
    for (const e of state.enemies) {
      if (!e.alive || enemyIsAir(e)) continue;
      const d = distance(x, y, e.x, e.y);
      if (d <= fx.pullRadius && d > 0.05) knockback(state, e, x - e.x, y - e.y, Math.min(fx.pull, d));
    }
  }
  const hit = applySplash(state, x, y, radius, p.damage, p.hitsGround, p.hitsAir, p.kind,
    { groundMult: p.groundMult ?? 1, source: p.source, perEnemy: (e) => hitMult(p, e, x, y) });
  for (const e of hit) if (e.alive) hitEffects(state, p, e, dirFrom(x, y, e, travel), true);
  // KSI Tower: everything splashed is chilled, and may freeze solid (Fully Frozen).
  if (p.chill) {
    for (const e of hit) {
      if (!e.alive) continue;
      chillEnemy(e, p.chill);
      if (p.shatter) markShatter(e, p.shatter, p.chill.seconds); // KSI Frost Fortress: it shatters if it dies chilled
      if (fx.freezeChance && random(state) < fx.freezeChance) freezeEnemy(state, e, fx.freezeSeconds || 1, fx.frozenVuln || 0);
    }
    // Frost Patch / Permafrost: an icy patch where it burst.
    if (fx.iceRadius && !p.bounced) createPool(state, x, y, { radius: fx.iceRadius, duration: fx.iceSeconds || 3, dps: 0, slow: fx.iceSlow || 0.4 }, 'ice');
  }
  if (state.gameOver) return;
  for (const e of hit) if (!e.alive) onTowerKill(state, p, e);
  if (state.gameOver) return;
  // Gandolf Mana Bomb: a big enough hit lets it cast again at once.
  if (fx.multiHitReset && hit.length >= fx.multiHitReset) { const b = findBuilding(state, p.sourceId); if (b) b.cooldown = 0; }
  const main = p.kind !== 'bomblet' && !p.bounced;
  // Mortar Seismic Charge: the shell bounces on once, further along the way it was going.
  if (fx.bounce && main) {
    const len = Math.hypot(travel.x, travel.y) || 1;
    const tx = x + (travel.x / len) * fx.bounceDist, ty = y + (travel.y / len) * fx.bounceDist;
    fireBomblet(state, p, x, y, tx, ty, p.damage * fx.bounce, { bounced: true, splash: p.splashRadius, flightTime: 0.5, fx, kind: p.kind === 'ksi' ? 'ksiBounce' : 'bomblet', chill: p.chill, shatter: p.shatter });
  }
  // Mortar Fault Line: cracks in the ground running back toward the mortar.
  if (fx.crack && main) {
    const len = Math.hypot(travel.x, travel.y) || 1;
    for (const k of [0.8, 1.6, 2.4]) {
      createPool(state, x - (travel.x / len) * k, y - (travel.y / len) * k, { radius: 0.45, duration: fx.crackSeconds, dps: p.damage * fx.crack, slow: 0 }, 'crack');
    }
  }
  // Firework Star Shells: a star left hanging in the sky that burns flyers.
  if (p.star) createPool(state, x, y, { radius: 1, duration: fx.starSeconds, dps: p.damage * fx.starDps, slow: 0, air: true }, 'star');
  // Firework Fountain: a ground hit sprays sparks on past the target.
  if (fx.fountain && primary && !enemyIsAir(primary)) {
    const len = Math.hypot(travel.x, travel.y) || 1;
    applySplash(state, x + travel.x / len, y + travel.y / len, 0.8, p.damage * fx.fountain, true, false, 'fountain');
  }
  // Fire patches: Mortar Incendiary, Gandolf Scorched Earth.
  if (fx.fireRadius) createPool(state, x, y, { radius: fx.fireRadius, duration: fx.fireDuration, dps: p.damage * fx.fireDps, slow: 0 }, 'fire');
  if (fx.burnRadius) createPool(state, x, y, { radius: fx.burnRadius, duration: fx.burnDuration, dps: p.damage * fx.burnDps, slow: fx.burnSlow || 0, ash: !!fx.ashPatch }, 'fire');
  // Firework Flare: invisible enemies caught in the burst show themselves.
  if (fx.revealOnHit) {
    for (const e of state.enemies) {
      if (!e.alive || !e.hidden || distance(x, y, e.x, e.y) > p.splashRadius) continue;
      e.hidden = false;
      emit(state, 'enemyRevealed', { id: e.id, kind: e.kind, x: e.x, y: e.y });
    }
  }
  // Mortar Craters (a slowing patch) and Aftershock (a second, smaller blast a moment later).
  if (fx.craterSlow && p.kind !== 'bomblet') createPool(state, x, y, { radius: p.splashRadius, duration: fx.craterSeconds, dps: 0, slow: fx.craterSlow }, 'crater');
  if (fx.aftershock && p.kind !== 'bomblet') {
    createStrike(state, { kind: 'aftershock', x, y, radius: p.splashRadius, damage: p.damage * fx.aftershock, hitsGround: p.hitsGround, hitsAir: p.hitsAir, t: ABILITY_RULES.aftershockDelay });
  }
  // Diddypult Shatter: smaller splashes around the impact.
  if (fx.shatter) {
    const a0 = random(state) * Math.PI * 2;
    for (let i = 0; i < fx.shatter; i++) {
      const a = a0 + (i * Math.PI * 2) / fx.shatter;
      applySplash(state, x + Math.cos(a) * ABILITY_RULES.shatterSpread, y + Math.sin(a) * ABILITY_RULES.shatterSpread, ABILITY_RULES.shatterSplash,
        p.damage * fx.shatterDamage, p.hitsGround, p.hitsAir, 'shatter');
    }
  }
  // Firework Sparklers: smaller bursts around the main one.
  if (fx.sparklers) {
    const a0 = random(state) * Math.PI * 2;
    for (let i = 0; i < fx.sparklers; i++) {
      const a = a0 + (i * Math.PI * 2) / fx.sparklers;
      applySplash(state, x + Math.cos(a) * SPARKLER.spread, y + Math.sin(a) * SPARKLER.spread, SPARKLER.splash,
        p.damage * fx.sparklerDamage, p.hitsGround, p.hitsAir, 'sparkler', { groundMult: p.groundMult ?? 1 });
    }
  }
  // Mortar Cluster Shell: bomblets scatter around the blast.
  if (fx.cluster && p.kind !== 'bomblet') {
    const a0 = random(state) * Math.PI * 2;
    for (let i = 0; i < fx.cluster; i++) {
      const a = a0 + (i * Math.PI * 2) / fx.cluster;
      const d = BOMBLET.spread * (0.75 + random(state) * 0.5);
      fireBomblet(state, p, x, y, x + Math.cos(a) * d, y + Math.sin(a) * d, p.damage * fx.clusterDamage);
    }
  }
  // Gandolf Chain Lightning: arcs on from the enemy it hit.
  if (fx.chainCount) chainLightning(state, p, primary && primary.alive !== undefined ? primary : hit[0], x, y);
}

/**
 * How much harder this shot hits this enemy (conditional bonuses that make each tower's path its own):
 * Locklair Bullseye (far away), Mortar Dead Center / Heavy Ordnance, Gandolf Kindling, Diddypult Splash Zone.
 */
function hitMult(p, e, x, y) {
  const fx = p.fx || {};
  let m = 1;
  if (fx.farPct && p.range && distance(p.startX, p.startY, e.x, e.y) >= p.range * (2 / 3)) m += fx.farPct / 100;
  if (fx.centerPct && distance(x, y, e.x, e.y) <= 0.5) m += fx.centerPct / 100;
  if (fx.bigBonus && (e.kind === 'tank' || e.kind === 'breaker')) m += fx.bigBonus;
  if (fx.burningBonus && (e.burnTime > 0 || e.inFireT > 0)) m += fx.burningBonus;
  if (fx.poolBonus && e.inPoolT > 0) m += fx.poolBonus;
  if (fx.chilledBonus && e.chillT > 0) m += fx.chilledBonus;   // KSI Snowball Effect
  return m;
}

/** Locklair Tank Buster: a share of the target's current health on top (capped). */
function hitFlat(p, e) {
  const fx = p.fx || {};
  return fx.hpShred ? Math.min(fx.hpShredCap || Infinity, e.hp * fx.hpShred) : 0;
}

/**
 * A tower's shot killed `e`: Cannon Autoloader, Gandolf Spellsteal, Locklair Ricochet, Firework Celebration,
 * Mortar Ground Zero.
 */
function onTowerKill(state, p, e) {
  const fx = p.fx || {};
  const b = findBuilding(state, p.sourceId);
  if (fx.autoload && b) b.cooldown = 0;
  if (fx.stealPct && b) b.stealStacks = Math.min(fx.stealMax / fx.stealPct, (b.stealStacks || 0) + 1);
  if (fx.ricochet && (p.ricochets || 0) < 3) {
    let next = null, best = Infinity;
    for (const o of state.enemies) {
      if (!o.alive || o === e || o.hidden || !(enemyIsAir(o) ? p.hitsAir : p.hitsGround)) continue;
      const d = distance(e.x, e.y, o.x, o.y);
      if (d <= fx.ricochet && d < best) { next = o; best = d; }
    }
    if (next) {
      state.projectiles.push({
        id: nextId(state, 'p'), kind: p.kind, owner: 'tower', sourceId: p.sourceId, tower: p.tower, ricochets: (p.ricochets || 0) + 1,
        x: e.x, y: e.y, startX: e.x, startY: e.y, targetId: next.id, damage: p.damage, splashRadius: 0, pool: null,
        hitsGround: p.hitsGround, hitsAir: p.hitsAir, groundMult: p.groundMult, fx, homing: true, speed: p.speed || 16, range: p.range, done: false
      });
    }
  }
  if (fx.celebrateRange && b && CONFIG.enemies[e.kind].type === 'air') {
    const c = footprintCenter(b);
    for (const d of state.buildings) {
      if (d.destroyed || !isDefense(d.type)) continue;
      const dc = footprintCenter(d);
      if (distance(c.x, c.y, dc.x, dc.y) <= fx.celebrateRange) { d.celebrateT = fx.celebrateSeconds; d.celebratePct = fx.celebratePct; }
    }
    emit(state, 'celebrate', { id: b.id });
  }
  if (fx.deathBurst && !p.groundZero) applySplash(state, e.x, e.y, 1, p.damage * fx.deathBurst, p.hitsGround, p.hitsAir, 'groundZero');
}

/**
 * A straight-line shot from (x, y) along (dx, dy): it hits each enemy in its way once, up to `pierce` of them,
 * over `travel` tiles. Used by the Boulder, Broadside and Shrapnel Spring.
 */
export function fireLine(state, x, y, dx, dy, o) {
  const len = Math.hypot(dx, dy) || 1;
  const p = {
    id: nextId(state, 'p'), kind: o.kind, owner: 'tower', sourceId: o.sourceId || null, tower: o.tower || null,
    x, y, startX: x, startY: y, targetId: null,
    homing: false, line: true, dirX: dx / len, dirY: dy / len, speed: o.speed || 12,
    travelLeft: o.travel, pierceLeft: o.pierce ?? Infinity, hitIds: [], hitRadius: o.hitRadius ?? ABILITY_RULES.lineHitRadius,
    damage: o.damage, hitsGround: o.hitsGround ?? true, hitsAir: o.hitsAir ?? false, fx: o.fx || {}, done: false
  };
  if (o.falloff) p.falloff = o.falloff; // Spear Thrower: each enemy pierced takes this much less (pierceMultiplier)
  if (o.source) p.source = o.source;
  state.projectiles.push(p);
  if (o.sourceId) emit(state, 'projectileFired', { id: p.id, kind: p.kind, sourceId: o.sourceId });
  return p;
}

/** A Cluster Shell bomblet: a short lob from the blast to a spot nearby. */
function fireBomblet(state, parent, x, y, tx, ty, damage, o = {}) {
  const f = parent.fx || {};
  state.projectiles.push({
    id: nextId(state, 'p'), kind: o.kind || 'bomblet', owner: 'tower', sourceId: parent.sourceId || null, tower: parent.tower, fromBlast: true, chill: o.chill || null, shatter: o.shatter || null,
    x, y, startX: x, startY: y, targetId: null, targetX: tx, targetY: ty,
    homing: false, elapsed: 0, flightTime: o.flightTime ?? BOMBLET.flightTime, damage, bounced: !!o.bounced,
    splashRadius: o.splash ?? BOMBLET.splash, hitsGround: parent.hitsGround, hitsAir: parent.hitsAir, groundMult: 1,
    fx: o.fx || { slowOnHit: f.slowOnHit, slowSeconds: f.slowSeconds, stunOnHit: f.stunOnHit }, done: false
  });
}

/** Chain Lightning from `from`: each jump goes to the nearest enemy not hit yet within chainRange. */
function chainLightning(state, p, from, x, y) {
  const fx = p.fx;
  const hitIds = new Set(from ? [from.id] : []);
  let budget = fx.chainCount + (fx.chainOnKill ? 8 : 0); // Storm: extra arcs from kills, within reason
  // Each source is where an arc starts; kills (Storm) add new sources.
  const sources = [{ x: from ? from.x : x, y: from ? from.y : y, jumps: fx.chainCount }];
  while (sources.length && budget > 0) {
    const src = sources.shift();
    const points = [{ x: src.x, y: src.y }];
    let cur = src;
    for (let i = 0; i < src.jumps && budget > 0; i++) {
      let next = null, best = Infinity;
      for (const e of state.enemies) {
        if (!e.alive || hitIds.has(e.id) || !(enemyIsAir(e) ? p.hitsAir : p.hitsGround)) continue;
        const d = distance(cur.x, cur.y, e.x, e.y);
        if (d <= fx.chainRange && d < best) { next = e; best = d; }
      }
      if (!next) break;
      budget--;
      hitIds.add(next.id);
      points.push({ x: next.x, y: next.y });
      cur = { x: next.x, y: next.y };
      // Overcharge: every jump hits harder than the last.
      damageEnemy(state, next, p.damage * fx.chainDamage * (1 + (fx.chainGrow || 0) * i), 'chain');
      if (fx.chainStun) applyStun(next, fx.chainStun);
      if (fx.slowOnHit) applySlow(next, fx.slowOnHit, fx.slowSeconds || 1);
      if (fx.chainOnKill && !next.alive) sources.push({ x: next.x, y: next.y, jumps: 2 }); // Storm
      if (state.gameOver) return;
    }
    if (points.length > 1) emit(state, 'chainLightning', { points });
  }
}

/** Catapult Boulder: rolls from the tower through the target and on past it, hitting each ground enemy once. */
function fireBoulder(state, b, target, fx) {
  const c = footprintCenter(b);
  const lvl = typeConfig(b.type).levels[b.level - 1];
  return fireLine(state, c.x, c.y, target.x - c.x, target.y - c.y, {
    kind: 'boulder', sourceId: b.id, tower: b.type, speed: ABILITY_RULES.boulderSpeed, travel: towerRange(b) + ABILITY_RULES.boulderExtra,
    hitRadius: ABILITY_RULES.boulderHitRadius, damage: lvl.damage * towerDamageMult(b) * fx.boulderMult, fx: { knockback: Math.max(fx.knockback || 0, 0.75) }
  });
}

/** A shot moving in a straight line (a piercing cannonball after its first hit, a boulder). */
function stepLineProjectile(state, p, dt) {
  const step = Math.min(p.speed * dt, p.travelLeft);
  const x0 = p.x, y0 = p.y;
  p.x += p.dirX * step; p.y += p.dirY * step;
  p.travelLeft -= step;
  const r = p.hitRadius ?? ABILITY_RULES.lineHitRadius;
  // Enemies within r of the segment just swept, in the order the shot reaches them.
  const hits = [];
  for (const e of state.enemies) {
    if (!e.alive || p.hitIds.includes(e.id) || !(enemyIsAir(e) ? p.hitsAir : p.hitsGround)) continue;
    const t = Math.max(0, Math.min(step, (e.x - x0) * p.dirX + (e.y - y0) * p.dirY));
    if (distance(x0 + p.dirX * t, y0 + p.dirY * t, e.x, e.y) <= r) hits.push({ e, t });
  }
  hits.sort((a, b) => a.t - b.t);
  for (const { e } of hits) {
    if (p.pierceLeft <= 0) break;
    const mult = p.falloff ? pierceMultiplier(p.hitIds.length, p.falloff) : 1;
    p.hitIds.push(e.id);
    p.pierceLeft--;
    damageEnemy(state, e, p.damage * mult, p.source);
    if (!e.alive) onTowerKill(state, p, e);
    else hitEffects(state, p, e, { x: p.dirX, y: p.dirY });
    if (p.bolt && e.alive) pinEnemy(state, e, p.bolt); // a Skewer bolt pins the enemy behind too
    if (p.harpoon && e.alive && e.id === p.harpoon.targetId) hookEnemy(state, p.harpoon, e, p.damage * mult); // Reel In
    if (state.gameOver) return;
  }
  if (p.travelLeft <= 1e-6 || p.pierceLeft <= 0) p.done = true;
  if (p.rolling) stepRoll(state, p, step);
}

/**
 * Rolling Thunder: the Mega Cannon's ball, having hit its target, rolls on `roll.length` tiles along the ground the way it
 * was going, hitting every ground enemy near its path once (full damage, the cannon's knockback / stun perks).
 */
function startRoll(state, p, target, dir) {
  let dx = dir.x, dy = dir.y;
  if (Math.hypot(dx, dy) < 1e-6) { dx = target.x - p.startX; dy = target.y - p.startY; }
  const len = Math.hypot(dx, dy) || 1, R = p.roll;
  Object.assign(p, {
    done: false, homing: false, line: true, rolling: true, dirX: dx / len, dirY: dy / len, speed: R.speed, travelLeft: R.length,
    pierceLeft: Infinity, hitIds: [target.id], hitRadius: R.hitRadius, hitsGround: true, hitsAir: false, targetId: null, rolled: 0, trailNext: 0
  });
  emit(state, 'megaRoll', { id: p.id, x: p.x, y: p.y });
}

/** Each step of a roll: Scorched Path's burning trail (a fire pool every tile), and the burst where it stops. */
function stepRoll(state, p, step) {
  const R = p.roll;
  p.rolled += step;
  if (R.trailDps && !state.gameOver) {
    while (p.rolled >= p.trailNext) {
      const back = p.rolled - p.trailNext; // the trail spot is this far behind the ball
      createPool(state, p.x - p.dirX * back, p.y - p.dirY * back, { radius: R.trailRadius, duration: R.trailSeconds, dps: p.damage * R.trailDps, slow: 0 }, 'fire');
      p.trailNext += 1;
    }
  }
  if (!p.done || state.gameOver) return;
  // The end of the roll: a small burst (ground only); Shockwave holds what it hits for a moment (bosses slowed).
  const hit = applySplash(state, p.x, p.y, R.burstRadius, p.damage * R.burstDamage, true, false, 'megaBurst');
  for (const e of hit) {
    if (!e.alive) onTowerKill(state, p, e);
    else if (R.burstStun) holdOrSlow(e, R.burstStun, R.bossSlow);
  }
}

function stepTowerProjectile(state, p, dt) {
  if (p.line) { stepLineProjectile(state, p, dt); return; }
  if (p.homing) {
    const target = findEnemy(state, p.targetId);
    if (!target || !target.alive) { p.done = true; p.fizzled = true; return; } // target died: no damage
    const d = distance(p.x, p.y, target.x, target.y);
    const step = p.speed * dt;
    if (d <= step) {
      const dir = { x: target.x - p.x, y: target.y - p.y };
      p.x = target.x; p.y = target.y; p.done = true;
      if (p.splashRadius > 0) landSplash(state, p, p.x, p.y, target);
      else {
        damageEnemy(state, target, p.damage * hitMult(p, target, target.x, target.y) + hitFlat(p, target), p.source);
        if (p.kind === 'archer') emit(state, 'arrowHit', { x: target.x, y: target.y }); // the arrow's hit sound
        if (!target.alive) onTowerKill(state, p, target);
        else hitEffects(state, p, target, Math.hypot(dir.x, dir.y) > 1e-6 ? dir : { x: target.x - p.startX, y: target.y - p.startY });
        const fx = p.fx || {};
        if (fx.chainCount) chainLightning(state, p, target, p.x, p.y);
        if (p.bolt && target.alive) pinEnemy(state, target, p.bolt); // Ballista Bolt
        // Locklair Citadel's Skewer (Mastery): the bolt flies on through and pins one more enemy behind, in its layer.
        if (p.bolt && p.bolt.skewer && !state.gameOver) {
          let dx = dir.x, dy = dir.y;
          if (Math.hypot(dx, dy) < 1e-6) { dx = target.x - p.startX; dy = target.y - p.startY; }
          const len = Math.hypot(dx, dy) || 1, air = enemyIsAir(target);
          Object.assign(p, {
            done: false, homing: false, line: true, dirX: dx / len, dirY: dy / len, speed: PIERCE_SPEED, hitsAir: air, hitsGround: !air,
            travelLeft: p.bolt.skewer, pierceLeft: 1, hitIds: [target.id], targetId: null, bolt: { ...p.bolt, skewer: 0 }
          });
          emit(state, 'projectilePierced', { id: p.id });
        }
        // Cannon Piercing Shot: keep flying straight on through the enemies behind it (a Mega Cannon rolls instead).
        else if (fx.pierce && !p.roll && !state.gameOver) {
          let dx = dir.x, dy = dir.y;
          if (Math.hypot(dx, dy) < 1e-6) { dx = target.x - p.startX; dy = target.y - p.startY; }
          const len = Math.hypot(dx, dy) || 1;
          Object.assign(p, {
            done: false, homing: false, line: true, dirX: dx / len, dirY: dy / len, speed: PIERCE_SPEED,
            travelLeft: fx.pierceLength || 2, pierceLeft: fx.pierce, hitIds: [target.id], targetId: null
          });
          emit(state, 'projectilePierced', { id: p.id });
        }
      }
      // Mega Cannon's Rolling Thunder: the ball rolls on along the ground through everything in its way.
      if (p.roll && !state.gameOver) startRoll(state, p, target, dir);
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
      landSplash(state, p, p.targetX, p.targetY, null);
      if (p.pool && !state.gameOver) createPool(state, p.targetX, p.targetY, p.barrel ? { ...p.pool, group: p.id } : p.pool, p.kind);
      if (p.barrel && !state.gameOver) burstBarrel(state, p, p.targetX, p.targetY); // Diddy Trebuchet's Barrel Burst
      if (p.volley && !state.gameOver) volleyLanded(state, p); // Triple Strike's Synchronized Impact
    }
  }
}

/**
 * A lingering pool on the ground: a Catapult's oil (kind 'catapult'), a fire patch ('fire') or Mousetrap
 * glue ('glue'). Hurts (dps) and slows the ground enemies standing in it. `stick` (glue): a Neegy that lands
 * in it is held that long, once.
 */
export function createPool(state, x, y, { radius, duration, dps, slow, stick = 0, air = false, airMult = 0, grow = 0, ash = false, rage = null, group = null }, kind = null) {
  if (!state.pools) state.pools = [];
  const pool = { id: nextId(state, 'pool'), kind, x, y, radius, duration, dps, slow, stick, air, airMult, grow, grown: 0, ash, rage, group, age: 0, tick: 0 };
  state.pools.push(pool);
  emit(state, 'poolCreated', { id: pool.id, x, y, radius, kind });
  return pool;
}

/**
 * Age pools; every POOL_TICK each pool damages the ground enemies inside it (overlapping pools
 * stack their damage, except pools of one `group`: a Diddy Trebuchet's barrel and its jugs tick together, and an enemy
 * in several of them takes one pool's damage per tick). Anyone inside is slowed by the strongest pool they're in (slows
 * don't stack).
 */
export function stepPools(state, dt) {
  if (!state.pools || !state.pools.length) return;
  const groupHits = new Set(); // "group|enemy" already hurt this tick
  for (const pool of state.pools) {
    pool.age += dt;
    pool.tick += dt;
    const ticks = Math.floor((pool.tick + 1e-9) / POOL_TICK); // tolerance: 10 x 0.05 s must count as 0.5 s
    pool.tick -= ticks * POOL_TICK;
    for (const e of state.enemies) {
      if (!e.alive || distance(pool.x, pool.y, e.x, e.y) > pool.radius) continue;
      const air = enemyIsAir(e);
      // Star Shells hang in the sky (flyers only); Toxic Fumes reach flyers at a share; the rest is ground only.
      if (pool.air ? !air : air && !(pool.airMult > 0)) continue;
      if (pool.kind === 'catapult') e.inPoolT = 0.3; // Splash Zone
      if (pool.kind === 'fire') e.inFireT = 0.3;     // Kindling
      // Grimace Golem's goo (v0.8, an enemy pool): enrages the other enemies standing in it (not Grimaces), no stacking.
      if (pool.rage && !air && !CONFIG.enemies[e.kind]?.goo) {
        if (!(e.gooT > 0)) emit(state, 'gooRage', { id: e.id, x: e.x, y: e.y });
        e.gooT = pool.rage.seconds;
        e.gooSpeed = pool.rage.speed;
        e.gooDamage = pool.rage.damage;
      }
      if (pool.slow > 0 && !air) {
        e.slow = Math.max(e.slowTimer > 0 ? e.slow || 0 : 0, pool.slow);
        e.slowTimer = Math.max(e.slowTimer || 0, SLOW_LINGER);
      }
      // Fly Paper: a Neegy floating down into the glue is stuck there for a moment (once).
      if (pool.stick && e.kind === 'neegy' && !e.stuck) { e.stuck = true; applyStun(e, pool.stick); } // held once it lands
      const grouped = pool.group !== null && pool.group !== undefined;
      if (ticks > 0 && pool.dps > 0 && grouped && groupHits.has(`${pool.group}|${e.id}`)) continue; // one of its group already did
      if (ticks > 0 && pool.dps > 0) {
        if (grouped) groupHits.add(`${pool.group}|${e.id}`);
        const share = air && !pool.air ? pool.airMult : 1;
        areaDamage(state, e, pool.dps * POOL_TICK * ticks * share, pool.kind === 'fire' ? 'burn' : pool.kind === 'spikes' || pool.kind === 'crack' ? 'bleed' : 'pool');
        if (!e.alive) {
          // Diddypult Spillover: the pool grows; Gandolf Phoenix Ash: a new patch where it fell.
          if (pool.grow && pool.grown < 1) { pool.radius += pool.grow; pool.grown += pool.grow; emit(state, 'poolGrew', { id: pool.id, radius: pool.radius }); }
          if (pool.ash) createPool(state, e.x, e.y, { radius: pool.radius, duration: 3, dps: pool.dps, slow: pool.slow, ash: true }, 'fire');
        }
      }
      if (state.gameOver) return;
    }
  }
  state.pools = state.pools.filter((p) => p.age < p.duration);
}

function stepEnemyProjectile(state, p, dt) {
  // Boulders and missiles fly to a spot: they land even if their target falls first.
  if (p.kind === 'vaca' || p.kind === 'missile') { stepEnemyShot(state, p, dt, damageBuilding); return; }
  const b = findBuilding(state, p.targetId);
  if (!b || b.destroyed) { p.done = true; p.fizzled = true; return; }
  if (p.homing) {
    const c = footprintCenter(b);
    const d = distance(p.x, p.y, c.x, c.y);
    const step = p.speed * dt;
    if (d <= step) {
      p.x = c.x; p.y = c.y; p.done = true;
      damageBuilding(state, b, p.damage, findEnemy(state, p.sourceId));
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
      damageBuilding(state, b, p.damage, findEnemy(state, p.sourceId));
    }
  }
}

/** Move every projectile; resolve hits; drop finished ones. */
export function stepProjectiles(state, dt) {
  // (Copy: a shot that lands can add new ones, e.g. Cluster Shell bomblets; they start moving next step.)
  for (const p of [...state.projectiles]) {
    if (p.done) continue;
    if (p.owner === 'tower') stepTowerProjectile(state, p, dt);
    else stepEnemyProjectile(state, p, dt);
    if (state.gameOver) break;
  }
  state.projectiles = state.projectiles.filter((p) => !p.done);
}
