// Spells: brewed at the Fuel Station (CONFIG.fuelStation, an economy building from Village Hall 2) with research
// points, carried into a raid and cast from the hotbar (click the spell, then the map). Each brewed spell is used
// up when it's cast. Pure rules: no Phaser.
//
//   - Brewing (between waves): costs RP (CONFIG.fuelStation.spells[kind].brewCost, less with Refinery perks). The
//     Fuel Station's level opens the spell types (spells[kind].level). How many spells the village can carry is
//     its spell slots: spellSlots[Village Hall level - 1], plus perk slots (Spare Tank, Fuel Depot).
//   - Casting (during a wave): `castSpell(state, kind, x, y)` at a grid point. Lightning Strike hits at once; the
//     others leave a zone (state.activeSpells) that works every step for its duration (stepSpells).
//       Rage:         defenses in it fire fireRatePct% faster and deal damagePct% more (read by abilities.js).
//       Heal:         buildings in it heal healPctPerSec% of their health every second.
//       Freeze:       enemies in it are held in place (bosses are slowed bossSlow instead).
//       Invisibility: buildings in it (not walls) can't be targeted or hurt by enemies (enemies.js / combat.js).
//       Heat Field:   enemies in it take dps damage per second (ground and air).
//       Lightning:    the `targets` enemies with the most health in its radius take `damage` each.
//   - Strength: every Fuel Station level above 1 makes spells powerPerLevel stronger; its perk tree (RV Lab,
//     abilityConfig.js) adds power, duration, radius, cheaper brewing, refunds and extra slots. Heat Field and
//     Lightning damage also grows with the wave's enemy health multiplier (waveToughness), like the enemies do.
// Names: each spell is an item (CONFIG name, e.g. Karuba Coffee) with an effect (e.g. Rage); the ids (rage, ...)
// never change, so saves keep working.
// Brewed spells are saved with the village (state.spells, a list of kinds); zones in play are not.
import { CONFIG } from '../config.js';
import { isDefense, townHallLevel, maxHp as maxHpOf } from './buildings.js';
import { abilityFx } from './abilities.js';
import { damageEnemy, areaDamage, isBurrowedUnseen, applyVuln } from './combat.js';
import { applyStun, applySlow } from './motion.js';
import { researchPoints, spendResearchPoints, addResearchPoints, needRpReason } from './researchPoints.js';
import { distanceToFootprint } from './grid.js';
import { distance } from './iso.js';
import { MAP } from '../mapTiles.js';
import { emit, isWaveActive, nextId } from './util.js';
import { isFreeBrew } from './fuelGuide.js';

/** Every spell, in the order the Fuel Station opens them (the hotbar and the window use this order). */
export const SPELL_KINDS = ['rage', 'heal', 'freeze', 'heat', 'invisibility', 'lightning'];
/** Zone effects are refreshed every step for this long, so they end a moment after the zone does. */
const REFRESH = 0.25;
/** The most brewed spells a save may hold (more than any slot count can reach). */
const MAX_SAVED = 12;

const FS = () => CONFIG.fuelStation;

export function spellConfig(kind) {
  return FS().spells[kind];
}

/** A spell's title: the item it is (e.g. "Karuba Coffee"). */
export function spellName(kind) {
  return spellConfig(kind).name;
}

/** What it does, shown under its name (e.g. "Rage"). */
export function spellEffect(kind) {
  return spellConfig(kind).effect;
}

/** Name with the effect, for running text: "Karuba Coffee (Rage)". */
export function spellFullName(kind) {
  return `${spellName(kind)} (${spellEffect(kind)})`;
}

export function isSpellKind(kind) {
  return SPELL_KINDS.includes(kind);
}

/** The village's Fuel Station (the highest level one; ruins count, they're rebuilt free after the wave), or null. */
export function fuelStation(state) {
  let best = null;
  for (const b of state.buildings || []) if (b.type === 'fuelStation' && (!best || b.level > best.level)) best = b;
  return best;
}

/** The Fuel Station's level (0 = none). */
export function fuelLevel(state) {
  const b = fuelStation(state);
  return b ? b.level : 0;
}

/** The Fuel Station's perks (RV Lab tree), merged. */
export function spellFx(state) {
  return abilityFx(fuelStation(state));
}

/** How many spells the village can carry into a raid: by Village Hall level, plus perk slots. 0 without a station. */
export function spellSlots(state) {
  if (!fuelStation(state)) return 0;
  const th = townHallLevel(state);
  const base = FS().spellSlots[Math.max(0, Math.min(FS().spellSlots.length, th) - 1)] || 0;
  return Math.max(0, base + (spellFx(state).spellSlotsAdd || 0));
}

/** Spells brewed and waiting (a list of kinds). */
export function brewedSpells(state) {
  return Array.isArray(state.spells) ? state.spells : [];
}

export function spellCount(state, kind) {
  return brewedSpells(state).filter((k) => k === kind).length;
}

/** Does the Fuel Station's level open this spell? */
export function spellUnlocked(state, kind) {
  return fuelLevel(state) >= spellConfig(kind).level;
}

/** RP to brew one (Refinery perks make it cheaper; never below 1). The guide's first Rage is free (0). */
export function brewCost(state, kind) {
  if (isFreeBrew(state, kind)) return 0;
  const pct = spellFx(state).brewCostPct || 0;
  return Math.max(1, Math.round(spellConfig(kind).brewCost * (1 + pct / 100)));
}

/**
 * A spell's numbers as it would be cast now: radius (tiles), duration (s, 0 for Lightning) and its effect, with the
 * Fuel Station's level and perks applied. Works without a station too (base numbers), for the help pages.
 */
export function spellStats(state, kind) {
  const c = spellConfig(kind);
  const fx = state ? spellFx(state) : {};
  const lvl = state ? Math.max(1, fuelLevel(state)) : 1;
  const power = (1 + FS().powerPerLevel * (lvl - 1)) * (1 + (fx.spellPowerPct || 0) / 100);
  const r2 = (v) => Math.round(v * 100) / 100;
  const out = {
    kind,
    name: c.name,
    effect: c.effect,
    radius: r2(c.radius * (1 + (fx.spellRadiusPct || 0) / 100)),
    duration: c.duration ? r2(c.duration * (1 + (fx.spellDurationPct || 0) / 100)) : 0,
    power: r2(power)
  };
  if (kind === 'rage') { out.fireRatePct = Math.round(c.fireRatePct * power); out.damagePct = Math.round(c.damagePct * power); }
  if (kind === 'heal') out.healPctPerSec = r2(c.healPctPerSec * power);
  if (kind === 'freeze') { out.bossSlow = c.bossSlow; out.vuln = fx.freezeVuln || 0; }
  // Damage spells grow with the wave's enemy health (its hpMultiplier), so they stay useful in late endless waves.
  const toughness = waveToughness(state);
  if (kind === 'heat') { out.dps = Math.round(c.dps * power * toughness); out.slow = fx.heatSlow || 0; }
  if (kind === 'lightning') { out.damage = Math.round(c.damage * power * toughness); out.targets = c.targets + (fx.lightningTargetsAdd || 0); }
  return out;
}

/** The running (or counting-down) wave's enemy health multiplier, at least 1; 1 between waves. */
export function waveToughness(state) {
  const w = state && state.wave;
  return w && w.phase !== 'idle' && w.hpMultiplier > 1 ? w.hpMultiplier : 1;
}

/** One line on what a spell does with its current numbers (hotbar tooltip, Fuel Station window). See spellSubtext. */
export function spellSummary(state, kind) {
  const s = spellStats(state, kind);
  const r = `${s.radius}-tile radius`;
  switch (kind) {
    case 'rage': return `Defenses in a ${r} fire ${s.fireRatePct}% faster and deal ${s.damagePct}% more damage for ${s.duration} s.`;
    case 'heal': return `Buildings in a ${r} heal ${s.healPctPerSec}% of their health every second for ${s.duration} s.`;
    case 'freeze': return `Enemies in a ${r} are frozen in place for ${s.duration} s${s.vuln ? ` and take ${Math.round(s.vuln * 100)}% more damage` : ''} (bosses are slowed instead).`;
    case 'invisibility': return `Buildings in a ${r} (not walls) can't be targeted or hurt by enemies for ${s.duration} s.`;
    case 'heat': return `Enemies in a ${r} take ${s.dps} damage per second for ${s.duration} s${s.slow ? ` and are slowed ${Math.round(s.slow * 100)}%` : ''}. Hits harder in tougher waves.`;
    case 'lightning': return `Strikes the ${s.targets} enemies with the most health in a ${r} for ${s.damage} damage each. Hits harder in tougher waves.`;
    default: return '';
  }
}

/** The line under a spell's name: its effect, then what it does ("Rage: defenses in a 4-tile radius fire ..."). */
export function spellSubtext(state, kind) {
  const sum = spellSummary(state, kind);
  return `${spellEffect(kind)}: ${sum.charAt(0).toLowerCase()}${sum.slice(1)}`;
}

// ---------- brewing ----------
/** Can one more of this spell be brewed now? { ok, reason, cost } */
export function checkBrew(state, kind) {
  if (!isSpellKind(kind)) return { ok: false, reason: 'Unknown spell', cost: null };
  const st = fuelStation(state);
  const cost = brewCost(state, kind);
  if (!st) return { ok: false, reason: 'Build a Fuel Station', cost };
  if (st.destroyed) return { ok: false, reason: 'Rebuild the Fuel Station', cost };
  const need = spellConfig(kind).level;
  if (st.level < need) return { ok: false, reason: `Needs Fuel Station level ${need}`, cost };
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave', cost };
  const slots = spellSlots(state);
  if (brewedSpells(state).length >= slots) return { ok: false, reason: `Spell slots full (${slots})`, cost };
  if (researchPoints(state) < cost) return { ok: false, reason: needRpReason(cost, researchPoints(state)), cost };
  return { ok: true, reason: '', cost };
}

/** Brew one spell: pay its RP and add it to the brewed list. */
export function brewSpell(state, kind) {
  const check = checkBrew(state, kind);
  if (!check.ok) return check;
  spendResearchPoints(state, check.cost);
  state.spells = [...brewedSpells(state), kind];
  emit(state, 'spellBrewed', { kind, cost: check.cost });
  return { ok: true, reason: '', cost: check.cost };
}

/** Pour out a brewed spell (frees its slot; no refund). Not during a wave. */
export function discardSpell(state, kind) {
  const list = brewedSpells(state);
  const i = list.lastIndexOf(kind);
  if (i < 0) return { ok: false, reason: 'None brewed' };
  if (isWaveActive(state)) return { ok: false, reason: 'Not during a wave' };
  state.spells = list.filter((_, k) => k !== i);
  emit(state, 'spellDiscarded', { kind });
  return { ok: true, reason: '' };
}

// ---------- casting ----------
/** Can this spell be cast now? (One brewed, during a wave.) */
export function checkCast(state, kind) {
  if (!isSpellKind(kind)) return { ok: false, reason: 'Unknown spell' };
  if (!spellCount(state, kind)) return { ok: false, reason: 'None brewed' };
  if (!isWaveActive(state)) return { ok: false, reason: 'Only during a wave' };
  if (state.gameOver) return { ok: false, reason: 'Game over' };
  return { ok: true, reason: '' };
}

/** Enemies a spell can reach at (x, y) within r tiles (alive, not tunneling out of sight). */
function enemiesIn(state, x, y, r) {
  return state.enemies.filter((e) => e.alive && !isBurrowedUnseen(e) && distance(e.x, e.y, x, y) <= r);
}

/** Buildings with any part inside r tiles of (x, y). */
function buildingsIn(state, x, y, r, { walls = true } = {}) {
  return state.buildings.filter((b) => !b.destroyed && (walls || b.type !== 'wall') && distanceToFootprint(b, x, y) <= r);
}

// How far past the grid's edge a spell can still land (enemies come on from spawn points up to ~8 tiles out).
const CAST_EDGE_MARGIN = 12;

/**
 * Where a spell can land (x, y): a real point, on the map or near enough to its edge to reach enemies coming on.
 * Lightning Strike also needs an enemy in its circle (it hits at once, so it would be wasted). { ok, reason }
 */
export function checkCastSpot(state, kind, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, reason: 'Pick a spot on the map' };
  const r = spellStats(state, kind).radius + CAST_EDGE_MARGIN;
  if (x < -r || y < -r || x > MAP.cols + r || y > MAP.rows + r) return { ok: false, reason: 'Pick a spot on the map' };
  if (kind === 'lightning' && !enemiesIn(state, x, y, spellStats(state, kind).radius).length) return { ok: false, reason: 'No enemies there' };
  return { ok: true, reason: '' };
}

/**
 * Cast a brewed spell at grid point (x, y): it's used up. Lightning Strike hits at once; the rest leave a zone
 * that works for its duration. Recycler (a perk) refunds part of the brew cost. Returns { ok, reason, spell }.
 * A spot it can't use (checkCastSpot) keeps the spell.
 */
export function castSpell(state, kind, x, y) {
  const check = checkCast(state, kind);
  if (!check.ok) return check;
  const spot = checkCastSpot(state, kind, x, y);
  if (!spot.ok) return spot;
  const list = brewedSpells(state);
  const i = list.indexOf(kind);
  state.spells = list.filter((_, k) => k !== i);
  const s = spellStats(state, kind);
  const spell = { id: nextId(state, 'sp'), kind, x, y, radius: s.radius, duration: s.duration, t: s.duration, stats: s };
  const refundPct = spellFx(state).spellRefundPct || 0;
  if (refundPct) addResearchPoints(state, Math.round(brewCost(state, kind) * refundPct / 100));
  if (kind === 'lightning') {
    const hit = enemiesIn(state, x, y, s.radius).sort((a, b) => b.hp - a.hp).slice(0, s.targets);
    const points = hit.map((e) => ({ id: e.id, x: e.x, y: e.y }));
    for (const e of hit) damageEnemy(state, e, s.damage, 'lightning');
    emit(state, 'spellCast', { ...spell, targets: points });
    return { ok: true, reason: '', spell };
  }
  if (!state.activeSpells) state.activeSpells = [];
  state.activeSpells.push(spell);
  applyZone(state, spell); // works from the moment it lands
  emit(state, 'spellCast', { ...spell });
  return { ok: true, reason: '', spell };
}

/** One step of a zone's effect. */
function applyZone(state, s, dt = 0) {
  const st = s.stats;
  if (s.kind === 'rage') {
    for (const b of buildingsIn(state, s.x, s.y, s.radius, { walls: false })) {
      if (!isDefense(b.type)) continue;
      b.spellRageT = REFRESH;
      b.spellRagePct = Math.max(b.spellRagePct || 0, st.fireRatePct);
      b.spellRageDmgPct = Math.max(b.spellRageDmgPct || 0, st.damagePct);
    }
  } else if (s.kind === 'heal') {
    for (const b of buildingsIn(state, s.x, s.y, s.radius)) {
      const max = maxHpOf(b);
      if (b.hp < max) b.hp = Math.min(max, b.hp + max * st.healPctPerSec / 100 * dt);
      b.spellHealT = REFRESH;
    }
  } else if (s.kind === 'invisibility') {
    for (const b of buildingsIn(state, s.x, s.y, s.radius, { walls: false })) b.spellInvisT = REFRESH;
  } else if (s.kind === 'freeze') {
    for (const e of enemiesIn(state, s.x, s.y, s.radius)) {
      if (CONFIG.enemies[e.kind].boss) applySlow(e, st.bossSlow, REFRESH);
      else applyStun(e, REFRESH);
      e.frozenT = REFRESH;
      if (st.vuln) applyVuln(e, st.vuln, REFRESH);
    }
  } else if (s.kind === 'heat') {
    if (!(dt > 0)) return;
    for (const e of enemiesIn(state, s.x, s.y, s.radius)) {
      areaDamage(state, e, st.dps * dt, 'heat');
      if (st.slow && e.alive) applySlow(e, st.slow, REFRESH);
    }
  }
}

/** Each step: spell boosts on buildings / enemies run down, and every zone in play works and ticks down. */
export function stepSpells(state, dt) {
  const active = state.activeSpells || [];
  if (!active.length && !state._spellMarks) return;
  let marks = false; // any spell effect still running down (keeps this step going after the last zone ends)
  for (const b of state.buildings) {
    if (b.spellRageT > 0) { b.spellRageT = Math.max(0, b.spellRageT - dt); if (!b.spellRageT) { b.spellRagePct = 0; b.spellRageDmgPct = 0; } }
    if (b.spellInvisT > 0) b.spellInvisT = Math.max(0, b.spellInvisT - dt);
    if (b.spellHealT > 0) b.spellHealT = Math.max(0, b.spellHealT - dt);
    marks = marks || b.spellRageT > 0 || b.spellInvisT > 0 || b.spellHealT > 0;
  }
  for (const e of state.enemies) if (e.frozenT > 0) { e.frozenT = Math.max(0, e.frozenT - dt); marks = marks || e.frozenT > 0; }
  state._spellMarks = marks;
  for (const s of active) {
    applyZone(state, s, Math.min(dt, s.t));
    s.t -= dt;
    if (s.t <= 0) emit(state, 'spellEnded', { id: s.id, kind: s.kind });
    if (state.gameOver) break;
  }
  state.activeSpells = active.filter((s) => s.t > 0);
  if (state.activeSpells.length) state._spellMarks = true;
}

// (The Fuel Station guide, with its free first Karuba Coffee, is in fuelGuide.js.)

// ---------- save data ----------
/** Brewed spells as saved: a comma list of kinds ("" when none). */
export function serializeSpells(state) {
  return brewedSpells(state).filter(isSpellKind).join(',');
}

/** A saved spell list is valid: missing (older saves) or a comma list of known spells. */
export function validSpells(v) {
  if (v === undefined) return true;
  if (typeof v !== 'string' || v.length > 200) return false;
  if (v === '') return true;
  const list = v.split(',');
  return list.length <= MAX_SAVED && list.every(isSpellKind);
}

export function deserializeSpells(v) {
  return (v || '').split(',').filter(isSpellKind);
}
