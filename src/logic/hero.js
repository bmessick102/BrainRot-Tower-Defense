// The Brisket King: a melee hero who guards his altar (CONFIG.altar, 1 allowed from Village Hall 4).
//   - His level is the altar's level (heroHp / heroDamage per level); his perks are the altar's RV Lab tree
//     (abilityConfig.js ABILITIES.altar, read here through abilityFx(altar)).
//   - Until he locks onto an enemy (between waves too) he roams his guard area: walks to a random open spot,
//     pauses, picks another. He walks around buildings and hops over walls (heroStep / nextWaypoint).
//   - During a wave he charges ground enemies inside his guard range (tiles from the altar's center), hits
//     the one he's chasing every attackInterval s, and goes back to roaming when the area is clear.
//     Ground enemies that come within their reach of him fight him back (enemies.js heroInReach).
//   - Knocked out during a raid, he lies where he fell ('down', no sleep) until the raid ends, then gets up on
//     his own (waking). The Second Wind perk gets him back up after a few seconds in the same raid.
//     When a wave is beaten he sleeps to heal: the share of health he lost x maxSleepSeconds. He sleeps through any wave started meanwhile,
//     then takes wakeSeconds to get up. Sleep counts down on game time and is saved on the altar.
//   - Brisket Feast: its hotbar button during a wave (once per wave; twice with Feast for Days): heals, boosts his
//     damage and speed for a few seconds, and slams the enemies around him.
// The hero lives in state.hero (not saved: rebuilt from the altar), status 'ready' | 'asleep' | 'waking' | 'down'.
import { CONFIG } from '../config.js';
import { levelStats, maxHp } from './buildings.js';
import { abilityFx } from './abilities.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { emit, isWaveActive, random } from './util.js';
import { getNav } from './pathfinding.js';
import { MAP } from '../mapTiles.js';
import { damageEnemy, enemyIsAir, isBurrowedUnseen, applySlow, applyStun } from './combat.js';
import { knockback, moveToward } from './motion.js';

const H = () => CONFIG.altar.hero;
// Roaming: how far from the altar's center he strolls (share of his guard range), how long he pauses at
// each spot (s, random in between), and how slowly he strolls (share of his speed).
const ROAM_SHARE = 0.75;
const ROAM_PAUSE = [1.5, 4];
const ROAM_SPEED = 0.6;
const PATH_EVERY = 0.35; // s between path re-plans while walking somewhere

// ---------- getting around: around buildings, over walls ----------
/** Can he stand on tile (c, r)? Not on a standing building (his own altar, walls and traps are fine). */
function openTile(nav, c, r, altarId) {
  if (c < 0 || r < 0 || c >= MAP.cols || r >= MAP.rows) return false;
  const o = nav.occ[r * MAP.cols + c];
  return !o || o.type === 'wall' || o.id === altarId;
}

/** Nothing but open tiles along the straight line from (x0, y0) to (x1, y1)? */
function clearLine(nav, x0, y0, x1, y1, altarId) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 0.25);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!openTile(nav, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t), altarId)) return false;
  }
  return true;
}

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
/** First tile center on the shortest open route from his tile to the goal's tile (BFS, no corner cutting), or null. */
function nextWaypoint(nav, h, gx, gy, altarId) {
  const C = MAP.cols, sc = Math.floor(h.x), sr = Math.floor(h.y), gc = Math.floor(gx), gr = Math.floor(gy);
  if (sc === gc && sr === gr) return null;
  const prev = new Int32Array(C * MAP.rows).fill(-1);
  const start = sr * C + sc, goal = gr * C + gc;
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    if (p === goal) break;
    const c = p % C, r = (p / C) | 0;
    for (const [dc, dr] of DIRS8) {
      const nc = c + dc, nr = r + dr, n = nr * C + nc;
      if (nc < 0 || nr < 0 || nc >= C || nr >= MAP.rows || prev[n] !== -1) continue;
      // The goal may be a blocked tile (an enemy hitting a building): step up to it.
      if (n !== goal && !openTile(nav, nc, nr, altarId)) continue;
      if (dc && dr && (!openTile(nav, c + dc, r, altarId) || !openTile(nav, c, r + dr, altarId))) continue;
      prev[n] = p;
      queue.push(n);
    }
  }
  if (prev[goal] === -1) return null;
  let p = goal;
  while (prev[p] !== start) p = prev[p];
  return { x: (p % C) + 0.5, y: ((p / C) | 0) + 0.5 };
}

/** Walk toward (tx, ty): straight when the way is open, else around buildings (walls are hopped). */
function heroStep(state, h, tx, ty, step, altarId) {
  const nav = getNav(state);
  if (clearLine(nav, h.x, h.y, tx, ty, altarId)) { h.waypoint = null; moveToward(h, tx, ty, step); }
  else {
    h.planT = (h.planT || 0) - step; // (re-plan now and then, as the target moves)
    if (!h.waypoint || h.planT <= 0 || Math.hypot(h.x - h.waypoint.x, h.y - h.waypoint.y) < 0.05) {
      h.waypoint = nextWaypoint(nav, h, tx, ty, altarId);
      h.planT = PATH_EVERY * H().speed;
    }
    if (h.waypoint) moveToward(h, h.waypoint.x, h.waypoint.y, step);
    else moveToward(h, tx, ty, step);
  }
  // Over a wall: he hops it (the view lifts him; 'heroJump' as he goes up).
  const o = nav.occ[Math.floor(h.y) * MAP.cols + Math.floor(h.x)];
  const over = !!o && o.type === 'wall';
  if (over && !h.overWall) emit(state, 'heroJump', { x: h.x, y: h.y });
  h.overWall = over;
}

/** A random open spot in his guard area to stroll to (not on a wall or a building); his altar if none. */
function pickRoamSpot(state, h, home, guard, altarId) {
  const nav = getNav(state);
  const reach = Math.max(1, guard * ROAM_SHARE);
  for (let i = 0; i < 16; i++) {
    const a = random(state) * Math.PI * 2, r = Math.sqrt(random(state)) * reach;
    const x = home.x + Math.cos(a) * r, y = home.y + Math.sin(a) * r;
    const c = Math.floor(x), row = Math.floor(y);
    if (!openTile(nav, c, row, altarId)) continue;
    const o = nav.occ[row * MAP.cols + c];
    if (o && o.type === 'wall') continue; // never stops on a wall
    return { x: c + 0.5, y: row + 0.5 };
  }
  return { x: home.x, y: home.y };
}

/** Roaming: walk to a spot, pause there a while, pick the next one. */
function roam(state, h, home, st, dt, altarId) {
  h.attacking = false;
  if (h.roamPause > 0) { h.roamPause = Math.max(0, h.roamPause - dt); h.moving = false; return; }
  if (!h.roamTo) h.roamTo = pickRoamSpot(state, h, home, st.guardRange, altarId);
  const step = st.speed * ROAM_SPEED * dt;
  heroStep(state, h, h.roamTo.x, h.roamTo.y, step, altarId);
  h.moving = true;
  if (Math.hypot(h.x - h.roamTo.x, h.y - h.roamTo.y) < 0.05) {
    h.roamTo = null;
    h.moving = false;
    h.roamPause = ROAM_PAUSE[0] + random(state) * (ROAM_PAUSE[1] - ROAM_PAUSE[0]);
  }
}

/** The (first) standing-or-not altar in the village, or null. */
export function getAltar(state) {
  return state.buildings.find((b) => b.type === 'altar') || null;
}

/** The hero's numbers at his altar's level, with his perks. */
export function heroStats(altar) {
  const l = levelStats('altar', altar.level);
  const fx = abilityFx(altar);
  return {
    maxHp: Math.round(l.heroHp * (1 + (fx.heroHpPct || 0) / 100)),
    damage: l.heroDamage * (1 + (fx.heroDamagePct || 0) / 100),
    attackInterval: H().attackInterval / (1 + (fx.heroAttackSpeedPct || 0) / 100),
    speed: H().speed,
    attackRange: H().attackRange,
    guardRange: H().guardRange + (fx.guardRangeAdd || 0),
    maxSleep: H().maxSleepSeconds * (1 - (fx.heroSleepFasterPct || 0) / 100),
    feastCharges: Math.max(1, fx.feastCharges || 1),
    fx
  };
}

/** Make sure state.hero matches the altar: created when one is built, gone when it's sold. */
export function ensureHero(state) {
  const altar = getAltar(state);
  if (!altar) { state.hero = null; return null; }
  let h = state.hero;
  if (!h || h.altarId !== altar.id) {
    const st = heroStats(altar);
    const c = footprintCenter(altar);
    const sleep = altar.heroSleep || 0; // saved nap (seconds left)
    h = state.hero = {
      altarId: altar.id, x: c.x, y: c.y, hp: sleep > 0 ? Math.round(st.maxHp * 0.5) : st.maxHp,
      status: sleep > 0 ? 'asleep' : 'ready', sleepT: sleep, sleepTotal: Math.max(sleep, 1), wakeT: 0,
      targetId: null, cooldown: 0, attacking: false, hits: 0, boostT: 0, feastsUsed: 0, downT: 0
    };
  }
  return h;
}

/** Is the hero up and able to fight (and be fought)? */
export function heroAwake(state) {
  const h = state.hero;
  return !!h && h.status === 'ready';
}

/** Enemies he can go after: alive ground enemies he can see, inside his guard range. */
function validFoe(e, home, guard) {
  return e.alive && !enemyIsAir(e) && !e.hidden && !isBurrowedUnseen(e) && !(e.landing > 0)
    && distance(home.x, home.y, e.x, e.y) <= guard;
}

/** Carry him back to the altar to sleep `seconds` (knocked out, or after a wave). `knockedOut`: the view shows him defeated. */
function putToSleep(state, h, seconds, knockedOut = false) {
  const altar = getAltar(state);
  const c = altar ? footprintCenter(altar) : { x: h.x, y: h.y };
  h.x = c.x; h.y = c.y;
  h.targetId = null; h.attacking = false; h.boostT = 0; h.roamTo = null; h.waypoint = null; h.overWall = false; h.moving = false;
  h.status = 'asleep';
  h.knockedOut = knockedOut;
  h.sleepT = h.sleepTotal = Math.max(0.1, seconds);
}

/** One step of the hero (simulate.js). */
export function stepHero(state, dt) {
  const h = ensureHero(state);
  if (!h) return;
  const altar = getAltar(state);
  const st = heroStats(altar);
  if (h.hp > st.maxHp) h.hp = st.maxHp;
  // Near a Frigo Camillo his swings come slower (its cold aura, specialEnemies.js).
  h.cooldown = Math.max(0, h.cooldown - dt * (1 - Math.max(0, Math.min(90, h.frigoSlow || 0)) / 100));
  if (h.boostT > 0) h.boostT = Math.max(0, h.boostT - dt);
  // Royal Decree: defenses in his guard range fire faster while he's awake (read by towerFireInterval).
  const home = footprintCenter(altar);
  for (const b of state.buildings) {
    b._heroDecree = st.fx.heroDecreePct && h.status === 'ready' && !b.destroyed && distanceToFootprint(b, home.x, home.y) <= st.guardRange
      ? st.fx.heroDecreePct : 0;
  }
  if (h.status === 'asleep') {
    // Heals evenly while he sleeps, so he's at full health as he wakes.
    h.hp += (st.maxHp - h.hp) * Math.min(1, dt / Math.max(dt, h.sleepT));
    h.sleepT = Math.max(0, h.sleepT - dt);
    altar.heroSleep = h.sleepT;
    if (h.sleepT <= 0) { h.hp = st.maxHp; h.status = 'waking'; h.knockedOut = false; h.wakeT = H().wakeSeconds; altar.heroSleep = 0; emit(state, 'heroWaking', {}); }
    return;
  }
  if (h.status === 'down') {
    // Knocked out: stays down until the raid ends (Second Wind: gets back up after a few seconds).
    h.downT += dt;
    h.hp = 0;
    const revive = st.fx.heroReviveSeconds;
    if (!isWaveActive(state)) { h.hp = st.maxHp; h.status = 'waking'; h.knockedOut = false; h.wakeT = H().wakeSeconds; emit(state, 'heroWaking', {}); }
    else if (revive && h.downT >= revive) {
      h.hp = st.maxHp * (st.fx.heroReviveHpPct || 0.4);
      h.status = 'ready'; h.knockedOut = false;
      emit(state, 'heroSecondWind', { x: h.x, y: h.y });
    }
    return;
  }
  if (h.status === 'waking') {
    h.wakeT = Math.max(0, h.wakeT - dt);
    if (h.wakeT <= 0) { h.status = 'ready'; emit(state, 'heroReady', {}); }
    return;
  }
  const boost = h.boostT > 0 ? H().feast : null;
  const step = st.speed * (1 + (boost ? boost.speedPct : 0) / 100) * dt;
  // Keep chasing the same enemy while it's valid; else the nearest one in his guard range.
  let target = h.targetId ? state.enemies.find((e) => e.id === h.targetId) : null;
  if (!target || !validFoe(target, home, st.guardRange)) {
    target = null;
    let best = Infinity;
    if (isWaveActive(state)) {
      for (const e of state.enemies) {
        if (!validFoe(e, home, st.guardRange)) continue;
        const d = distance(h.x, h.y, e.x, e.y);
        if (d < best) { best = d; target = e; }
      }
    }
    h.targetId = target ? target.id : null;
  }
  if (!target) { roam(state, h, home, st, dt, altar.id); return; }
  h.roamTo = null; h.roamPause = 0;
  const d = distance(h.x, h.y, target.x, target.y);
  if (d > st.attackRange) {
    h.attacking = false; h.moving = true;
    heroStep(state, h, target.x, target.y, Math.min(step, d - st.attackRange * 0.9), altar.id);
    return;
  }
  h.attacking = true; h.moving = false;
  if (h.cooldown > 0) return;
  h.cooldown = st.attackInterval;
  heroHit(state, h, st, target, boost);
}

/** One swing of the brisket at `target`, with his perks. */
function heroHit(state, h, st, target, boost) {
  const fx = st.fx;
  h.hits++;
  let dmg = st.damage * (1 + (boost ? boost.damagePct : 0) / 100);
  const hog = fx.wholeHogEvery && h.hits % fx.wholeHogEvery === 0;
  if (hog) dmg *= fx.wholeHogMult;
  const before = target.hp;
  damageEnemy(state, target, dmg, 'hero');
  let dealt = before - Math.max(0, target.hp);
  if (fx.heroSlow && target.alive) applySlow(target, fx.heroSlow, fx.heroSlowSeconds);
  if (hog && target.alive && fx.wholeHogKnock) {
    const dx = target.x - h.x, dy = target.y - h.y, dd = Math.hypot(dx, dy) || 1;
    knockback(state, target, dx / dd, dy / dd, fx.wholeHogKnock);
  }
  if (fx.heroSplashPct) {
    for (const e of state.enemies) {
      if (e === target || !e.alive || enemyIsAir(e) || isBurrowedUnseen(e)) continue;
      if (distance(target.x, target.y, e.x, e.y) > fx.heroSplashRadius) continue;
      const b = e.hp;
      damageEnemy(state, e, dmg * fx.heroSplashPct / 100, 'hero');
      dealt += b - Math.max(0, e.hp);
    }
  }
  if (fx.heroLifesteal) h.hp = Math.min(st.maxHp, h.hp + dealt * fx.heroLifesteal);
  emit(state, 'heroHit', { targetId: target.id, x: target.x, y: target.y, hog: !!hog });
}

/** An enemy hits the hero for `amount` (before his armor). Knocked out, he goes back to sleep. */
export function damageHero(state, amount) {
  const h = state.hero;
  if (!h || h.status !== 'ready') return;
  const altar = getAltar(state);
  const st = heroStats(altar);
  h.hp -= amount * (1 - (st.fx.heroArmor || 0));
  emit(state, 'heroDamaged', { hp: h.hp, maxHp: st.maxHp });
  if (h.hp > 0) return;
  h.hp = 0;
  h.status = 'down'; h.knockedOut = true; h.downT = 0;
  h.targetId = null; h.attacking = false; h.boostT = 0; h.roamTo = null; h.waypoint = null; h.overWall = false; h.moving = false;
  emit(state, 'heroKnockedOut', { x: h.x, y: h.y });
}

/** Can the player use Brisket Feast now? { ok, reason } */
export function checkFeast(state) {
  const h = state.hero;
  if (!h) return { ok: false, reason: 'No Brisket King' };
  if (!isWaveActive(state)) return { ok: false, reason: 'Only during a wave' };
  if (h.status === 'down') return { ok: false, reason: "He's knocked out" };
  if (h.status !== 'ready') return { ok: false, reason: 'He\'s asleep' };
  const st = heroStats(getAltar(state));
  if (h.feastsUsed >= st.feastCharges) return { ok: false, reason: 'Used this wave' };
  return { ok: true, reason: '' };
}

/** Brisket Feast: heal, a damage and speed boost, and a slam on the enemies around him. */
export function useFeast(state) {
  const check = checkFeast(state);
  if (!check.ok) return check;
  const h = state.hero;
  const altar = getAltar(state);
  const st = heroStats(altar);
  const F = H().feast;
  h.feastsUsed++;
  h.hp = Math.min(st.maxHp, h.hp + st.maxHp * F.healPct / 100);
  h.boostT = F.boostSeconds;
  for (const e of state.enemies) {
    if (!e.alive || enemyIsAir(e) || isBurrowedUnseen(e) || distance(h.x, h.y, e.x, e.y) > F.slamRadius) continue;
    damageEnemy(state, e, st.damage * F.slamMult, 'hero');
    if (e.alive) applyStun(e, F.stunSeconds);
  }
  if (st.fx.feastHealBuildingsPct) {                          // Royal Banquet
    const home = footprintCenter(altar);
    for (const b of state.buildings) {
      if (b.destroyed || distanceToFootprint(b, home.x, home.y) > st.guardRange) continue;
      b.hp = Math.min(maxHp(b), b.hp + maxHp(b) * st.fx.feastHealBuildingsPct / 100);
    }
  }
  emit(state, 'heroFeast', { x: h.x, y: h.y, radius: F.slamRadius });
  return { ok: true, reason: '' };
}

/** A wave starts: his Feast charges come back. */
export function heroWaveStarted(state) {
  const h = ensureHero(state);
  if (!h) return;
  h.feastsUsed = 0;
}

/** The wave is beaten: he goes home and sleeps off the damage he took (none taken: no nap). */
export function heroAfterWave(state) {
  const h = ensureHero(state);
  if (!h) return;
  if (h.status === 'down') {   // knocked out in the raid: he just gets up (no nap)
    h.hp = heroStats(getAltar(state)).maxHp; h.status = 'waking'; h.knockedOut = false; h.wakeT = H().wakeSeconds;
    emit(state, 'heroWaking', {});
    return;
  }
  if (h.status !== 'ready') return;
  const altar = getAltar(state);
  const st = heroStats(altar);
  const lost = 1 - Math.max(0, h.hp) / st.maxHp;
  h.targetId = null; h.attacking = false; h.boostT = 0;
  if (lost * st.maxSleep < 1) { h.hp = st.maxHp; return; } // unhurt: he just keeps roaming
  putToSleep(state, h, lost * st.maxSleep);
  altar.heroSleep = h.sleepT;
  emit(state, 'heroSleeping', { seconds: h.sleepT });
}

/** Saved nap on the altar: seconds left (0 / missing = awake). */
export function validHeroSleep(v) {
  return v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 3600);
}
