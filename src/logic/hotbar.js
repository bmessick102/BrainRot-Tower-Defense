// The ability hotbar (bottom middle of the HUD, UIScene): every ability the player triggers by hand, in one row.
// Slot order: the Brisket King's Brisket Feast, the Hatsune Queen's Encore Cloak, the Locklair Mage's Arcane Aegis, DJ Babyface's Drop the Beat (one per booth), then the brewed Fuel
// Station spells (one slot per spell type, with how many are brewed). Number keys 1-9 trigger the slots. Clicking
// the hero or the DJ booth on the map never triggers anything: these slots are the only way. Pure: no Phaser.
import { fuelGuidePulses } from './fuelGuide.js';
import { checkFeast, getAltar, heroStats } from './hero.js';
import { checkEncore, getQueenAltar, queenStats } from './queen.js';
import { checkAegis, getMageAltar, mageStats } from './mage.js';
import { checkDropBeat, hypeFill, hypeNeeded, djStats } from './dj.js';
import { SPELL_KINDS, spellCount, checkCast, spellName, spellSubtext } from './spells.js';
import { CONFIG } from '../config.js';

function heroAbilityReason(hero, check) {
  if (hero.status === 'asleep') return `Recovering · ${Math.ceil(hero.sleepT)}s left`;
  if (hero.status === 'waking') return 'Waking up';
  return check.reason;
}

/**
 * The hotbar's slots right now. Each: { id, type: 'feast' | 'encore' | 'aegis' | 'beat' | 'spell', name, ready, reason, meter (0..1 or
 * null), count (or null), kind (spell kind), buildingId (DJ booth), desc, guide (pulse it: the guide's first Karuba Coffee) }. `ready` = pressing it now does
 * something (a spell slot then starts aiming).
 */
export function hotbarSlots(state) {
  const slots = [];
  const altar = getAltar(state);
  if (altar && state.hero) {
    const st = heroStats(altar);
    const used = state.hero.feastsUsed || 0;
    const left = Math.max(0, st.feastCharges - used);
    const c = checkFeast(state);
    const F = CONFIG.altar.hero.feast;
    slots.push({
      id: 'feast', type: 'feast', name: 'Brisket Feast', ready: c.ok, reason: heroAbilityReason(state.hero, c),
      meter: st.feastCharges ? left / st.feastCharges : 0, count: st.feastCharges > 1 ? left : null,
        desc: `The Brisket King heals ${st.feastHealPct}%, rages for ${F.boostSeconds} s and slams the enemies around him. ${st.feastCharges} per wave.`
    });
  }
  const qAltar = getQueenAltar(state);
  if (qAltar && state.queen) {
    const st = queenStats(qAltar);
    const used = state.queen.encoresUsed || 0;
    const left = Math.max(0, st.encoreCharges - used);
    const c = checkEncore(state);
    const E = CONFIG.queenAltar.hero.encore;
    slots.push({
      id: 'encore', type: 'encore', name: 'Encore Cloak', ready: c.ok, reason: heroAbilityReason(state.queen, c),
      meter: st.encoreCharges ? left / st.encoreCharges : 0, count: st.encoreCharges > 1 ? left : null,
      desc: `The Hatsune Queen vanishes for ${st.encoreSeconds} s: enemies lose track of her, her bolts deal +${E.damagePct}% and pierce ${E.pierce} enemies, and she heals ${E.healPct}%. ${st.encoreCharges} per wave.`
    });
  }
  const mAltar = getMageAltar(state);
  if (mAltar && state.mage) {
    const st = mageStats(mAltar);
    const used = state.mage.aegisUsed || 0;
    const left = Math.max(0, st.aegisCharges - used);
    const c = checkAegis(state);
    slots.push({
      id: 'aegis', type: 'aegis', name: 'Arcane Aegis', ready: c.ok, reason: heroAbilityReason(state.mage, c),
      meter: st.aegisCharges ? left / st.aegisCharges : 0, count: st.aegisCharges > 1 ? left : null,
      desc: `Every building inside the Locklair Mage's aura (${st.auraRadius} tiles) can't be damaged for ${st.aegisSeconds} s. ${st.aegisCharges} per wave.`
    });
  }
  for (const b of state.buildings) {
    if (b.type !== 'dj') continue;
    const c = checkDropBeat(state, b);
    const s = djStats(b);
    slots.push({
      id: `beat:${b.id}`, type: 'beat', name: 'Drop the Beat', buildingId: b.id, ready: c.ok,
      reason: b.destroyed ? 'Booth destroyed' : c.reason, meter: b.destroyed ? 0 : hypeFill(b), count: null,
      desc: `Defenses near DJ Babyface fire ${s.beatPct}% faster for ${s.beatSeconds} s. Defeating enemies fills the hype meter (${hypeNeeded(b)}).`
    });
  }
  for (const kind of SPELL_KINDS) {
    const n = spellCount(state, kind);
    if (!n) continue;
    const c = checkCast(state, kind);
    slots.push({
      id: `spell:${kind}`, type: 'spell', kind, name: spellName(kind), ready: c.ok, reason: c.reason,
      guide: kind === 'rage' && fuelGuidePulses(state), // the Fuel Station guide's free Karuba Coffee (Rage): its slot pulses until cast
      meter: null, count: n, desc: `${spellSubtext(state, kind)} Click it, then click the map.`
    });
  }
  return slots;
}

/** The slot a number key (1-9) triggers, or null. */
export function slotForKey(slots, key) {
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1 || n > 9) return null;
  return slots[n - 1] || null;
}
