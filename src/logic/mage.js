// The Locklair Mage (v0.12): the third hero, unlocked at Village Hall 10 (CONFIG.mageAltar). He never moves: the hero and
// his pedestal are one building ('mageAltar'), and that building's health is his. His hero object (state.mage) is not
// saved; it's rebuilt from the building, which saves only his nap (`heroSleep`), like the other two heroes' altars.
// heroes.js steps him with the others.
//   - Staff zap: every attackInterval s he zaps the nearest enemy within attackRange tiles of his building (ground or
//     air, not hidden, not tunneling unseen) for his damage, a single target (Chain Spark: plus nearby enemies).
//   - Sanctuary Aura (passive): while he's awake in a wave, every building inside auraRadius tiles (not his own) and
//     every hero standing in it (the Brisket King, the Hatsune Queen) heals `heal` HP per second (in healTick steps).
//   - Arcane Aegis (the hotbar, once per wave; twice with Twin Aegis): for aegis.seconds every building inside his aura,
//     his own too, can't be damaged (combat.js damageBuilding reads b._mageAegis). Warding Light (a perk): buildings in
//     his aura take less damage while he's awake (b._mageWard).
//   - Naps after every raid: at least minSleepSeconds, more the lower his health got in it (the lowest share x
//     maxSleepSeconds; knocked out: the full nap). Asleep he doesn't zap, heal or cast; if a raid starts he sleeps on.
//   - Knocked out: when his building is destroyed in a raid. It stays standing on its tile (BuildingView draws the statue,
//     not rubble, with knocked-out stars); enemies ignore it like any destroyed building. Rebuilt in the raid he gets up;
//     after the raid it's rebuilt free and he naps. Undying (a perk): back up once a raid after a while.
// Status: 'ready' | 'asleep' | 'waking' | 'down', like the other heroes; `resting` while ready at night between raids.
import { heroAbilityLevelValue } from './heroAbilityLevels.js';
import { CONFIG } from '../config.js';
import { levelStats, maxHp } from './buildings.js';
import { abilityFx } from './abilities.js';
import { footprintCenter, distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { emit, isWaveActive } from './util.js';
import { damageEnemy, isBurrowedUnseen } from './combat.js';
import { bedtime } from './hero.js';

export const MAGE_TYPE = 'mageAltar';
const M = () => CONFIG.mageAltar.hero;
const CHAIN_RANGE = 2.5; // tiles a Chain Spark jumps from the zap's target

/** His building (standing or not), or null. */
export function getMageAltar(state) {
  return state.buildings.find((b) => b.type === MAGE_TYPE) || null;
}

/** His numbers at his building's level, with his perks (abilityConfig.js 'mageAltar'). His health is maxHp(building). */
export function mageStats(altar) {
  const l = levelStats(MAGE_TYPE, altar.level);
  const fx = abilityFx(altar);
  const H = M();
  const sleepK = 1 - (fx.mageSleepFasterPct || 0) / 100;
  return {
    maxHp: maxHp(altar),
    damage: l.heroDamage * (1 + (fx.mageDamagePct || 0) / 100),
    attackInterval: H.attackInterval / (1 + (fx.mageFasterPct || 0) / 100),
    // One range for his zap, Sanctuary Aura and Arcane Aegis (v0.12.2; the aura was 4.5 tiles); both range perks grow it.
    attackRange: H.attackRange + (fx.mageRangeAdd || 0) + (fx.auraRadiusAdd || 0),
    auraRadius: H.attackRange + (fx.mageRangeAdd || 0) + (fx.auraRadiusAdd || 0),
    heal: l.heal * (1 + (fx.mageHealPct || 0) / 100),
    chain: fx.mageChain || 0,
    chainPct: fx.mageChainPct || 0,
    overchargeEvery: fx.mageOverchargeEvery || 0,
    overchargeMult: fx.mageOverchargeMult || 1,
    ward: fx.mageWard || 0,
    aegisSeconds: heroAbilityLevelValue('mageAltar', altar.level) + (fx.aegisSecondsAdd || 0),
    aegisCharges: Math.max(1, fx.aegisCharges || 1),
    aegisHeal: fx.aegisHealPct || 0,
    maxSleep: H.maxSleepSeconds * sleepK,
    minSleep: H.minSleepSeconds * sleepK,
    reviveSeconds: fx.mageReviveSeconds || 0,
    reviveHpPct: fx.mageReviveHpPct || 0,
    fx
  };
}

/** Make sure state.mage matches his building: created when it's built, gone when it's removed. */
export function ensureMage(state) {
  const altar = getMageAltar(state);
  if (!altar) {
    if (state.mage) { state.mage = null; clearMarks(state); }
    return null;
  }
  let h = state.mage;
  if (!h || h.altarId !== altar.id) {
    const sleep = altar.heroSleep || 0; // saved nap (seconds left)
    h = state.mage = {
      kind: 'mage', altarId: altar.id, status: sleep > 0 ? 'asleep' : 'ready', sleepT: sleep, sleepTotal: Math.max(sleep, 1),
      wakeT: 0, cooldown: 0, targetId: null, zaps: 0, aegisT: 0, aegisUsed: 0, healT: 0, worstShare: 1, resting: false,
      downT: 0, revived: false, attacking: false
    };
  }
  return h;
}

/** Is he up and able to fight? */
export function mageAwake(state) {
  return !!state.mage && state.mage.status === 'ready' && !state.mage.resting;
}

/** Buildings inside his aura (standing ones), measured to their footprints from his building's center. */
export function inMageAura(altar, st, o) {
  const c = footprintCenter(altar);
  return !o.destroyed && distanceToFootprint(o, c.x, c.y) <= st.auraRadius;
}

/** Arcane Aegis and Warding Light marks on the buildings in his aura (read by combat.js damageBuilding). */
function markBuildings(state, h, st, altar) {
  const awake = h.status === 'ready';
  for (const b of state.buildings) {
    const near = inMageAura(altar, st, b);
    b._mageAegis = near && h.aegisT > 0;
    b._mageWard = near && awake && st.ward ? st.ward : 0;
  }
}

function clearMarks(state) {
  for (const b of state.buildings) { if (b._mageAegis) b._mageAegis = false; if (b._mageWard) b._mageWard = 0; }
}

function wakeUp(state, h) {
  h.status = 'waking'; h.knockedOut = false; h.wakeT = M().wakeSeconds;
  emit(state, 'mageWaking', {});
}

function recoverFromKnockout(state, h) {
  if (h.sleepT > 0) {
    h.status = 'asleep';
    h.knockedOut = false;
  } else wakeUp(state, h);
}

/** Enemies he can zap: alive, seen, out of the ground, inside his attack range (from his building's center). */
function validFoe(e, home, range) {
  return e.alive && !e.hidden && !isBurrowedUnseen(e) && !(e.landing > 0) && distance(home.x, home.y, e.x, e.y) <= range;
}

/** One step of the Locklair Mage (simulate.js, through heroes.js). */
export function stepMage(state, dt, recoveryDt = dt) {
  const h = ensureMage(state);
  if (!h) return;
  const altar = getMageAltar(state);
  const st = mageStats(altar);
  const wave = isWaveActive(state);
  if (h.sleepT > 0) {
    h.sleepT = Math.max(0, h.sleepT - recoveryDt);
    altar.heroSleep = h.sleepT;
  }
  if (h.aegisT > 0) { h.aegisT = Math.max(0, h.aegisT - dt); if (h.aegisT === 0) emit(state, 'mageAegisEnd', { id: altar.id }); }
  // His building destroyed in a raid: knocked out (the statue stays, with stars).
  if (altar.destroyed && h.status !== 'down') {
    h.status = 'down'; h.knockedOut = true; h.downT = 0; h.targetId = null; h.attacking = false; h.resting = false;
    h.worstShare = 0;
    emit(state, 'mageKnockedOut', { id: altar.id });
  }
  markBuildings(state, h, st, altar);
  if (h.status === 'down') {
    h.downT += dt;
    if (!altar.destroyed) { recoverFromKnockout(state, h); return; }
    if (wave && st.reviveSeconds && !h.revived && h.downT >= st.reviveSeconds) { // Undying
      h.revived = true;
      altar.destroyed = false;
      altar.hp = Math.max(1, Math.round(st.maxHp * st.reviveHpPct));
      if (state._nav) state._nav = null; // it stands again: routes are worked out again
      h.status = h.sleepT > 0 ? 'asleep' : 'ready'; h.knockedOut = false;
      emit(state, 'mageRevived', { id: altar.id });
    }
    return;
  }
  if (h.status === 'asleep') {
    if (h.sleepT <= 0) wakeUp(state, h);
    return;
  }
  if (h.status === 'waking') {
    h.wakeT = Math.max(0, h.wakeT - dt);
    if (h.wakeT <= 0) { h.status = 'ready'; emit(state, 'mageReady', {}); }
    return;
  }
  // Ready. At night between raids he dozes on his pedestal (and wakes for a raid or the morning).
  h.resting = bedtime(state);
  if (h.resting || !wave) { h.targetId = null; h.attacking = false; h.healT = 0; return; }
  h.worstShare = Math.min(h.worstShare, altar.hp / Math.max(1, st.maxHp));
  stepAura(state, h, st, altar, dt);
  if (state.gameOver) return;
  // Zap: keep the same enemy while it's valid; else the nearest one in range.
  const home = footprintCenter(altar);
  h.cooldown = Math.max(0, h.cooldown - dt * (1 - Math.max(0, Math.min(90, altar.frigoSlow || 0)) / 100));
  let target = h.targetId ? state.enemies.find((e) => e.id === h.targetId) : null;
  if (!target || !validFoe(target, home, st.attackRange)) {
    target = null;
    let best = Infinity;
    for (const e of state.enemies) {
      if (!validFoe(e, home, st.attackRange)) continue;
      const d = distance(home.x, home.y, e.x, e.y);
      if (d < best) { best = d; target = e; }
    }
    h.targetId = target ? target.id : null;
  }
  h.attacking = !!target;
  if (!target || h.cooldown > 0 || altar.stunT > 0) return; // (stunned by Quandale's dash: no zaps)
  h.cooldown = st.attackInterval;
  zap(state, h, st, altar, target);
}

/** Sanctuary Aura: heal the buildings (not his own) and heroes inside it, in healTick steps. */
function stepAura(state, h, st, altar, dt) {
  const tick = M().healTick;
  h.healT += dt;
  if (h.healT < tick) return;
  const steps = Math.floor(h.healT / tick);
  h.healT -= steps * tick;
  const amount = st.heal * tick * steps;
  const c = footprintCenter(altar);
  let healed = 0;
  for (const b of state.buildings) {
    if (b === altar || !inMageAura(altar, st, b)) continue;
    const max = maxHp(b);
    if (b.hp >= max) continue;
    b.hp = Math.min(max, b.hp + amount);
    healed++;
  }
  for (const hero of [state.hero, state.queen]) {
    if (!hero || hero.status !== 'ready' || !(hero.hpMax > 0) || hero.hp >= hero.hpMax) continue;
    if (distance(c.x, c.y, hero.x, hero.y) > st.auraRadius) continue;
    hero.hp = Math.min(hero.hpMax, hero.hp + amount);
    healed++;
  }
  if (healed) emit(state, 'mageHeal', { id: altar.id, count: healed });
}

/** One zap from his staff at `target` (Arcane Overload: every Nth hits harder; Chain Spark: jumps to nearby enemies). */
function zap(state, h, st, altar, target) {
  h.zaps++;
  const over = st.overchargeEvery > 0 && h.zaps % st.overchargeEvery === 0;
  const dmg = st.damage * (over ? st.overchargeMult : 1);
  const hits = [{ id: target.id, x: target.x, y: target.y }];
  const chained = [];
  if (st.chain) {
    const near = state.enemies
      .filter((e) => e !== target && e.alive && !e.hidden && !isBurrowedUnseen(e) && distance(target.x, target.y, e.x, e.y) <= CHAIN_RANGE)
      .sort((a, b) => distance(target.x, target.y, a.x, a.y) - distance(target.x, target.y, b.x, b.y))
      .slice(0, st.chain);
    for (const e of near) { chained.push(e); hits.push({ id: e.id, x: e.x, y: e.y, chain: true }); }
  }
  emit(state, 'mageZap', { sourceId: altar.id, hits, over });
  damageEnemy(state, target, dmg, over ? 'crit' : 'hero');
  for (const e of chained) { if (state.gameOver) return; if (e.alive) damageEnemy(state, e, dmg * st.chainPct, 'hero'); }
}

/** Can the player cast Arcane Aegis now? { ok, reason } */
export function checkAegis(state) {
  const h = state.mage;
  if (!h) return { ok: false, reason: 'No Locklair Mage' };
  if (!isWaveActive(state)) return { ok: false, reason: 'Only during a wave' };
  if (h.status === 'down') return { ok: false, reason: "He's knocked out" };
  if (h.status !== 'ready') return { ok: false, reason: "He's asleep" };
  if (h.aegisT > 0) return { ok: false, reason: 'Active now' };
  const st = mageStats(getMageAltar(state));
  if (h.aegisUsed >= st.aegisCharges) return { ok: false, reason: 'Used this wave' };
  return { ok: true, reason: '' };
}

/** Arcane Aegis: the buildings in his aura can't be damaged for a few seconds (Aegis Surge: and heal at once). */
export function useAegis(state) {
  const check = checkAegis(state);
  if (!check.ok) return check;
  const h = state.mage;
  const altar = getMageAltar(state);
  const st = mageStats(altar);
  h.aegisUsed++;
  h.aegisT = st.aegisSeconds;
  if (st.aegisHeal) {
    for (const b of state.buildings) {
      if (!inMageAura(altar, st, b)) continue;
      const max = maxHp(b);
      b.hp = Math.min(max, b.hp + max * st.aegisHeal);
    }
  }
  markBuildings(state, h, st, altar); // it holds from this very step
  const c = footprintCenter(altar);
  emit(state, 'mageAegis', { id: altar.id, x: c.x, y: c.y, radius: st.auraRadius, seconds: st.aegisSeconds });
  return { ok: true, reason: '' };
}

/** A wave starts: Arcane Aegis and Undying come back; his lowest health this raid starts over. */
export function mageWaveStarted(state) {
  const h = ensureMage(state);
  if (!h) return;
  h.aegisUsed = 0;
  h.revived = false;
  h.worstShare = 1;
}

/**
 * The wave is beaten: he naps, at least minSleep, more the lower his health got (knocked out: the full nap). His
 * building was already rebuilt and repaired by then (waves.js checkWaveCleared), so it's the lowest share he hit.
 */
export function mageAfterWave(state) {
  const h = ensureMage(state);
  if (!h) return;
  const altar = getMageAltar(state);
  const st = mageStats(altar);
  h.aegisT = 0;
  markBuildings(state, h, st, altar);
  // (worstShare is 0 once he's been knocked out this raid, even if his building was rebuilt and he went back to sleep.)
  const lost = h.status === 'down' ? 1 : 1 - Math.max(0, Math.min(1, h.worstShare));
  // Slept through the raid untouched: he just finishes the nap he was taking.
  if (h.sleepT > 0 && lost <= 0) { h.status = 'asleep'; h.knockedOut = false; return; }
  h.status = 'asleep'; h.knockedOut = false; h.resting = false; h.targetId = null; h.attacking = false;
  // Hurt or knocked out: the nap this raid earns, or what was left of the old one if that's longer.
  h.sleepT = h.sleepTotal = Math.max(h.sleepT || 0, st.minSleep, lost * st.maxSleep, 0.1);
  h.worstShare = 1;
  altar.heroSleep = h.sleepT;
  emit(state, 'mageSleeping', { seconds: h.sleepT });
}
