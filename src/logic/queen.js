// The Hatsune Queen (v0.8): the second hero, a crossbow sniper who guards her altar (CONFIG.queenAltar, 1 allowed from
// Village Hall 8). Both heroes can be out at once: the Brisket King lives in state.hero (hero.js), she lives in
// state.queen. Like his, her hero object is not saved: it's rebuilt from her altar (only her nap, `heroSleep` on the
// altar, is saved). heroes.js steps both and is what the rest of the game asks ("which heroes can enemies fight?").
//   - Her level is the altar's level (heroHp / heroDamage per level); her perks are the altar's RV Lab tree
//     (abilityConfig.js 'queenAltar', read here through queenStats).
//   - With nothing to shoot she strolls near her altar (half the area he roams: she stays back).
//   - During a wave she picks the nearest enemy inside her guard range (8 tiles from the altar's center), ground
//     AND air, walks just close enough to have it in her attack range (5 tiles) and shoots a bolt every
//     attackInterval s. A ground enemy closer than keepAway tiles makes her step back from it (never out of her
//     guard area), shooting as she goes. Bolts fly (state.queenBolts, drawn by HeroView) and can pierce.
//   - Ground enemies that come within their reach of her fight her (enemies.js fightHero, through heroes.js).
//     Flyers never stop for a hero: they keep going for buildings, so she can shoot them safely.
//   - Knocked out in a raid she lies where she fell until the raid ends (Curtain Call: back up after 20 s, once a
//     wave). After a wave she naps to heal (the share of health she lost x maxSleepSeconds), then wakes.
//   - Encore Cloak: from the hotbar during a wave (once per wave; twice with Sold Out Show): she vanishes in a burst
//     of music notes for a few seconds. Enemies lose track of her (they stop attacking her and can't pick her), her
//     bolts deal +150% and pierce 2 more enemies, and she heals 30% of her health.
// Status: 'ready' | 'asleep' | 'waking' | 'down', like the Brisket King's.
import { CONFIG } from '../config.js';
import { levelStats } from './buildings.js';
import { abilityFx } from './abilities.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { emit, isWaveActive, random, nextId } from './util.js';
import { damageEnemy, enemyIsAir, isBurrowedUnseen, applyVuln } from './combat.js';
import { heroStep, roam, syncHeroMaxHp, bedtime, restAtNight, wakeFromRest } from './hero.js';

export const QUEEN_TYPE = 'queenAltar';
const Q = () => CONFIG.queenAltar.hero;
const ROAM_AREA = 0.5;      // she strolls within this share of the Brisket King's roaming area (stays near her altar)
const BACK_STEP = 1.5;      // tiles she aims to back away from a ground enemy that's too close
const PIERCE_TRAVEL = 3;    // tiles a piercing bolt flies on past each enemy it goes through
const PIERCE_HIT_RADIUS = 0.45;

/** Her altar (standing or not), or null. */
export function getQueenAltar(state) {
  return state.buildings.find((b) => b.type === QUEEN_TYPE) || null;
}

/** Her numbers at her altar's level, with her perks. */
export function queenStats(altar) {
  const l = levelStats(QUEEN_TYPE, altar.level);
  const fx = abilityFx(altar);
  const H = Q();
  return {
    maxHp: Math.round(l.heroHp * (1 + (fx.queenHpPct || 0) / 100)),
    damage: l.heroDamage * (1 + (fx.queenDamagePct || 0) / 100),
    attackInterval: H.attackInterval,
    speed: H.speed * (1 + (fx.queenSpeedPct || 0) / 100),
    attackRange: H.attackRange + (fx.queenRangeAdd || 0),
    guardRange: H.guardRange,
    maxSleep: H.maxSleepSeconds * (1 - (fx.queenSleepFasterPct || 0) / 100),
    pierce: fx.queenPierce || 0,
    critChance: fx.queenCrit || 0,
    critMult: fx.queenCritMult || 1,
    encoreSeconds: H.encore.seconds + (fx.encoreSecondsAdd || 0),
    encoreCharges: Math.max(1, fx.encoreCharges || 1),
    fx
  };
}

/** Make sure state.queen matches her altar: created when one is built, gone when it's removed. */
export function ensureQueen(state) {
  const altar = getQueenAltar(state);
  if (!altar) {
    if (state.queen) { state.queen = null; clearAuras(state); }
    return null;
  }
  let h = state.queen;
  if (!h || h.altarId !== altar.id) {
    const st = queenStats(altar);
    const c = footprintCenter(altar);
    const sleep = altar.heroSleep || 0; // saved nap (seconds left)
    h = state.queen = {
      kind: 'queen', altarId: altar.id, x: c.x, y: c.y, hp: sleep > 0 ? Math.round(st.maxHp * 0.5) : st.maxHp, hpMax: st.maxHp,
      status: sleep > 0 ? 'asleep' : 'ready', sleepT: sleep, sleepTotal: Math.max(sleep, 1), wakeT: 0,
      targetId: null, cooldown: 0, attacking: false, moving: false, shots: 0, cloakT: 0, encoresUsed: 0, downT: 0, revived: false
    };
  }
  if (!state.queenBolts) state.queenBolts = [];
  return h;
}

/** Is she up and able to fight? */
export function queenAwake(state) {
  return !!state.queen && state.queen.status === 'ready';
}

/** Can enemies see and attack her? Awake and not hidden by Encore Cloak. */
export function queenTargetable(h) {
  return !!h && h.status === 'ready' && !(h.cloakT > 0);
}

/** Enemies she can shoot: alive enemies she can see (ground or air) inside her guard range. */
function validFoe(e, home, guard) {
  return e.alive && !e.hidden && !isBurrowedUnseen(e) && !(e.landing > 0) && distance(home.x, home.y, e.x, e.y) <= guard;
}

/** Warm-Up and Encore+ marks on the defenses (read by towerFireInterval / towerDamageMult in abilities.js). */
function markDefenses(state, h, st, home) {
  const fx = st.fx;
  const awake = h.status === 'ready';
  for (const b of state.buildings) {
    const near = awake && !b.destroyed && b.type !== QUEEN_TYPE && distanceToFootprint(b, home.x, home.y) <= st.guardRange;
    b._queenWarmup = near && fx.queenWarmupPct ? fx.queenWarmupPct : 0;
    b._queenEncore = near && fx.encoreDefensePct && h.cloakT > 0 ? fx.encoreDefensePct : 0;
  }
}

function clearAuras(state) {
  for (const b of state.buildings) { if (b._queenWarmup) b._queenWarmup = 0; if (b._queenEncore) b._queenEncore = 0; }
  state.queenBolts = [];
}

function wakeUp(state, h) {
  h.status = 'waking'; h.knockedOut = false; h.wakeT = Q().wakeSeconds;
  emit(state, 'queenWaking', {});
}

/** One step of the Hatsune Queen (simulate.js, through heroes.js). */
export function stepQueen(state, dt, recoveryDt = dt) {
  const h = ensureQueen(state);
  if (!h) return;
  const altar = getQueenAltar(state);
  const st = queenStats(altar);
  stepBolts(state, dt, st); // bolts in the air keep flying whatever happens to her
  syncHeroMaxHp(h, st.maxHp); // (altar level-up / health perk: the bar keeps its share)
  if (h.hp > st.maxHp) h.hp = st.maxHp;
  // Near a Frigo Camillo she reloads slower (its cold aura, specialEnemies.js).
  h.cooldown = Math.max(0, h.cooldown - dt * (1 - Math.max(0, Math.min(90, h.frigoSlow || 0)) / 100));
  if (h.cloakT > 0) { h.cloakT = Math.max(0, h.cloakT - dt); if (h.cloakT === 0) emit(state, 'queenEncoreEnd', { x: h.x, y: h.y }); }
  const home = footprintCenter(altar);
  markDefenses(state, h, st, home);
  if (h.status === 'asleep') {
    // Heals evenly while she sleeps, so she's at full health as she wakes.
    h.hp += (st.maxHp - h.hp) * Math.min(1, recoveryDt / Math.max(recoveryDt, h.sleepT));
    h.sleepT = Math.max(0, h.sleepT - recoveryDt);
    altar.heroSleep = h.sleepT;
    if (h.sleepT <= 0) {
      h.hp = st.maxHp; altar.heroSleep = 0;
      if (bedtime(state)) { h.status = 'ready'; h.knockedOut = false; h.resting = true; } // the nap ends at night: she sleeps on
      else wakeUp(state, h);
    }
    return;
  }
  if (h.status === 'down') {
    // Knocked out: stays down until the raid ends (Curtain Call: back up after a while, once per wave).
    h.downT += dt;
    h.hp = 0;
    const revive = st.fx.queenReviveSeconds;
    if (!isWaveActive(state)) { h.hp = st.maxHp; wakeUp(state, h); }
    else if (revive && !h.revived && h.downT >= revive) {
      h.hp = st.maxHp * (st.fx.queenReviveHpPct || 0.4);
      h.status = 'ready'; h.knockedOut = false; h.revived = true;
      emit(state, 'queenCurtainCall', { x: h.x, y: h.y });
    }
    return;
  }
  if (h.status === 'waking') {
    h.wakeT = Math.max(0, h.wakeT - dt);
    if (h.wakeT <= 0) { h.status = 'ready'; emit(state, 'queenReady', {}); }
    return;
  }
  if (wakeFromRest(state, h, 'queenWaking')) return; // night rest over: a raid started, or it got light
  // Keep shooting the same enemy while it's valid; else the nearest one in her guard range.
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
  if (!target) {
    if (!restAtNight(state, h, home, st, dt, altar.id)) roam(state, h, home, { ...st, guardRange: st.guardRange * ROAM_AREA }, dt, altar.id);
    return;
  }
  h.roamTo = null; h.roamPause = 0;
  const step = st.speed * dt;
  const d = distance(h.x, h.y, target.x, target.y);
  // Too close to a ground enemy (that can see her): step back from it, staying inside her guard area.
  const threat = h.cloakT > 0 ? null : closestGroundThreat(state, h, Q().keepAway);
  h.moving = false;
  if (threat) {
    const away = backAwaySpot(h, threat, home, st.guardRange);
    if (away) { heroStep(state, h, away.x, away.y, step, altar.id, st.speed); h.moving = true; }
  } else if (d > st.attackRange) {
    // Walk just close enough to have it in range (it's inside her guard range, so she stays inside it too).
    heroStep(state, h, target.x, target.y, Math.min(step, d - st.attackRange * 0.9), altar.id, st.speed);
    h.moving = true;
  }
  const inRange = distance(h.x, h.y, target.x, target.y) <= st.attackRange;
  h.attacking = inRange;
  if (!inRange || h.cooldown > 0) return;
  h.cooldown = st.attackInterval;
  shoot(state, h, st, target);
}

/** The nearest alive ground enemy within `radius` tiles of her (that's out in the open), or null. */
function closestGroundThreat(state, h, radius) {
  let best = null, bd = radius;
  for (const e of state.enemies) {
    if (!e.alive || enemyIsAir(e) || isBurrowedUnseen(e) || e.hidden) continue;
    const d = distance(h.x, h.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** Where to back away to from `e`: BACK_STEP tiles straight away from it, pulled back inside her guard area. */
function backAwaySpot(h, e, home, guard) {
  let dx = h.x - e.x, dy = h.y - e.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) { dx = h.x - home.x || 1; dy = h.y - home.y; }
  const l = Math.hypot(dx, dy) || 1;
  let x = h.x + (dx / l) * BACK_STEP, y = h.y + (dy / l) * BACK_STEP;
  const lim = guard * 0.9, fromHome = Math.hypot(x - home.x, y - home.y);
  if (fromHome > lim) { x = home.x + ((x - home.x) / fromHome) * lim; y = home.y + ((y - home.y) / fromHome) * lim; }
  // Cornered against the edge of her area (barely any room to move): she holds her ground.
  return Math.hypot(x - h.x, y - h.y) < 0.2 ? null : { x, y };
}

/** One bolt from her crossbow at `target`, with her perks and Encore Cloak. */
function shoot(state, h, st, target) {
  const fx = st.fx;
  const E = Q().encore;
  h.shots++;
  let damage = st.damage;
  const head = !!fx.headlinerEvery && h.shots % fx.headlinerEvery === 0;   // Headliner
  if (head) damage *= fx.headlinerMult;
  const crit = st.critChance > 0 && random(state) < st.critChance;          // Critical Note
  if (crit) damage *= st.critMult;
  const cloak = h.cloakT > 0;
  if (cloak) damage *= 1 + E.damagePct / 100;
  const bolt = {
    id: nextId(state, 'qb'), x: h.x, y: h.y, startX: h.x, startY: h.y, targetId: target.id, homing: true,
    air: enemyIsAir(target), damage, pierceLeft: st.pierce + (cloak ? E.pierce : 0), hitIds: [],
    crit, head, cloak, dirX: 0, dirY: 0, travelLeft: 0, done: false
  };
  state.queenBolts.push(bolt);
  emit(state, 'queenShot', { id: bolt.id, x: h.x, y: h.y, targetId: target.id, cloak });
}

/** Bolts in flight: homing to their target, then (piercing) straight on through the enemies behind it. */
function stepBolts(state, dt, st) {
  const bolts = state.queenBolts;
  if (!bolts || !bolts.length) return;
  const speed = Q().boltSpeed;
  for (const p of bolts) {
    if (p.done) continue;
    if (p.homing) {
      const t = state.enemies.find((e) => e.id === p.targetId);
      if (!t || !t.alive) { p.done = true; continue; } // target gone: the bolt fizzles
      const d = distance(p.x, p.y, t.x, t.y), step = speed * dt;
      if (d > step) { p.x += ((t.x - p.x) / d) * step; p.y += ((t.y - p.y) / d) * step; continue; }
      let dx = t.x - p.x, dy = t.y - p.y;
      if (Math.hypot(dx, dy) < 1e-6) { dx = t.x - p.startX; dy = t.y - p.startY; }
      const l = Math.hypot(dx, dy) || 1;
      p.x = t.x; p.y = t.y;
      boltHit(state, p, t, st);
      if (p.pierceLeft > 0 && !state.gameOver) {
        Object.assign(p, { homing: false, dirX: dx / l, dirY: dy / l, travelLeft: PIERCE_TRAVEL });
        emit(state, 'queenBoltPierced', { id: p.id });
      } else p.done = true;
    } else {
      // Piercing on: every enemy (in the first target's layer) near the line just swept, nearest first.
      const step = Math.min(speed * dt, p.travelLeft);
      const x0 = p.x, y0 = p.y;
      p.x += p.dirX * step; p.y += p.dirY * step;
      p.travelLeft -= step;
      const hits = [];
      for (const e of state.enemies) {
        if (!e.alive || p.hitIds.includes(e.id) || enemyIsAir(e) !== p.air || isBurrowedUnseen(e)) continue;
        const s = Math.max(0, Math.min(step, (e.x - x0) * p.dirX + (e.y - y0) * p.dirY));
        if (distance(x0 + p.dirX * s, y0 + p.dirY * s, e.x, e.y) <= PIERCE_HIT_RADIUS) hits.push({ e, s });
      }
      hits.sort((a, b) => a.s - b.s);
      for (const { e } of hits) {
        if (p.pierceLeft <= 0) break;
        p.pierceLeft--;
        p.travelLeft = PIERCE_TRAVEL; // it flies on past each enemy it goes through
        boltHit(state, p, e, st);
        if (state.gameOver) return;
      }
      if (p.travelLeft <= 1e-6 || p.pierceLeft <= 0) p.done = true;
    }
    if (state.gameOver) return;
  }
  state.queenBolts = bolts.filter((p) => !p.done);
}

/** A bolt lands on `e`: damage, Headliner's mark, and Fan Favorite's heal if it was a kill. */
function boltHit(state, p, e, st) {
  const fx = st.fx;
  p.hitIds.push(e.id);
  damageEnemy(state, e, p.damage, p.crit || p.head ? 'crit' : 'hero');
  if (p.head && e.alive && fx.headlinerVuln) applyVuln(e, fx.headlinerVuln, fx.headlinerSeconds || 3);
  const h = state.queen;
  if (!e.alive && fx.queenKillHeal && h && h.status === 'ready') h.hp = Math.min(st.maxHp, h.hp + st.maxHp * fx.queenKillHeal);
  emit(state, 'queenBoltHit', { id: p.id, targetId: e.id, x: e.x, y: e.y, crit: p.crit, head: p.head, air: p.air });
}

/**
 * An enemy hits her for `amount`. `melee`: from right next to her (Dodge Roll can dodge it). Hidden by Encore
 * Cloak she can't be hit at all. Knocked out, she lies where she fell until the raid ends.
 */
export function damageQueen(state, amount, { melee = false } = {}) {
  const h = state.queen;
  if (!queenTargetable(h)) return;
  const st = queenStats(getQueenAltar(state));
  if (melee && st.fx.queenDodge && random(state) < st.fx.queenDodge) { emit(state, 'queenDodge', { x: h.x, y: h.y }); return; }
  h.hp -= amount;
  emit(state, 'queenDamaged', { hp: h.hp, maxHp: st.maxHp });
  if (h.hp > 0) return;
  h.hp = 0;
  h.status = 'down'; h.knockedOut = true; h.downT = 0; h.cloakT = 0;
  h.targetId = null; h.attacking = false; h.roamTo = null; h.waypoint = null; h.overWall = false; h.moving = false;
  emit(state, 'queenKnockedOut', { x: h.x, y: h.y });
}

/** Can the player use Encore Cloak now? { ok, reason } */
export function checkEncore(state) {
  const h = state.queen;
  if (!h) return { ok: false, reason: 'No Hatsune Queen' };
  if (!isWaveActive(state)) return { ok: false, reason: 'Only during a wave' };
  if (h.status === 'down') return { ok: false, reason: "She's knocked out" };
  if (h.status !== 'ready') return { ok: false, reason: "She's asleep" };
  if (h.cloakT > 0) return { ok: false, reason: 'Active now' };
  const st = queenStats(getQueenAltar(state));
  if (h.encoresUsed >= st.encoreCharges) return { ok: false, reason: 'Used this wave' };
  return { ok: true, reason: '' };
}

/** Encore Cloak: she vanishes for a few seconds (untargetable, stronger piercing bolts) and heals. */
export function useEncore(state) {
  const check = checkEncore(state);
  if (!check.ok) return check;
  const h = state.queen;
  const st = queenStats(getQueenAltar(state));
  h.encoresUsed++;
  h.cloakT = st.encoreSeconds;
  h.hp = Math.min(st.maxHp, h.hp + st.maxHp * Q().encore.healPct / 100);
  markDefenses(state, h, st, footprintCenter(getQueenAltar(state))); // Encore+ starts at once
  emit(state, 'queenEncore', { x: h.x, y: h.y, seconds: st.encoreSeconds });
  return { ok: true, reason: '' };
}

/** A wave starts: her Encore Cloaks and Curtain Call come back. */
export function queenWaveStarted(state) {
  const h = ensureQueen(state);
  if (!h) return;
  h.encoresUsed = 0;
  h.revived = false;
}

/** The wave is beaten: she goes home and sleeps off the damage she took (none taken: no nap). */
export function queenAfterWave(state) {
  const h = ensureQueen(state);
  if (!h) return;
  state.queenBolts = [];
  h.cloakT = 0;
  const altar = getQueenAltar(state);
  const st = queenStats(altar);
  if (h.status === 'down') { h.hp = st.maxHp; wakeUp(state, h); return; } // knocked out: she just gets up (no nap)
  if (h.status !== 'ready') return;
  const lost = 1 - Math.max(0, h.hp) / st.maxHp;
  h.targetId = null; h.attacking = false;
  if (lost * st.maxSleep < 1) { h.hp = st.maxHp; return; } // unhurt: she keeps strolling
  const c = footprintCenter(altar);
  h.x = c.x; h.y = c.y;
  h.roamTo = null; h.waypoint = null; h.overWall = false; h.moving = false;
  h.status = 'asleep'; h.knockedOut = false; h.resting = false;
  h.sleepT = h.sleepTotal = Math.max(0.1, lost * st.maxSleep);
  altar.heroSleep = h.sleepT;
  emit(state, 'queenSleeping', { seconds: h.sleepT });
}
