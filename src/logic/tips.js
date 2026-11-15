// First-time tips: a short note from the guide the first time each system shows up, so a new player meets
// them one at a time instead of all at once. Each tip shows once per village (saved as `tips`), only after
// the first tutorial, in the guide bubble (UIScene), with "Got it" and "No more tips". Tips that come up
// together wait in a queue. The RV Lab has its own longer guide (labGuide.js).
import { CONFIG } from '../config.js';
import { emit } from './util.js';
import { nextWaveInfo, nextWaveComposition } from './waves.js';

const pct = (v) => `${Math.round(v * 100)}%`;

/** Every tip: key (saved) and text. The event that brings each one up is in tipsForEvent. */
export const TIPS = {
  rp: () => 'Research points! The purple counter under your gold. You get them for every enemy you defeat and every wave you beat. Spend them in the RV Lab (from Village Hall 4) on new abilities for your defenses.',
  stars: () => `Wave stars: each wave is rated by how much of your village is still standing at the end (walls don't count). 3 stars pays +${pct(CONFIG.rules.waveStars.bonus[2])} gold and RP, 2 stars +${pct(CONFIG.rules.waveStars.bonus[1])}. The stars at the top show how you're doing.`,
  special: () => `A special wave is next! Every ${CONFIG.specialWaves.every}rd wave is special: the top bar names it (an Air Raid is flyers only, for example), so you can prepare. Beating one pays bonus gold.`,
  restless: () => `Night attack! In the dark, enemies are restless: they hit harder and move faster, but pay +${pct(CONFIG.rules.night.lootBonus)} gold and RP. Start waves by day for an easier fight, or at night for more loot.`,
  boss: () => `${CONFIG.enemies.babycar.name} comes next wave! This raid boss drives straight at your Village Hall and smashes through walls. Keep strong defenses near your hall, and be ready for the troops it bursts into.`,
  toilet: () => `${CONFIG.enemies.toilet.name}s come next wave! They tunnel under your walls to the nearest building and pop up to attack. Underground, only a F.L.O.C.K Tower's sight lets your defenses hit them.`,
  hero: () => 'The Brisket King guards his altar, clubbing ground enemies nearby. Click him in a wave for Brisket Feast (heal, boost, slam). He naps after waves to heal.',
  dj: () => 'DJ Babyface\'s hype is full! Click the booth during a wave to Drop the Beat: every defense in its range fires much faster for a few seconds. Defeating enemies fills it again.',
  layout: () => 'Edit mode: pick buildings up into the hotbar and place them again to rearrange your village. Nothing changes until you press Save.'
};
export const TIP_KEYS = Object.keys(TIPS);

/** Which tips an event brings up (if not seen yet). */
function tipsForEvent(state, name, data) {
  const out = [];
  if (name === 'researchPointsChanged' && (data.added || 0) > 0) out.push('rp');
  if (name === 'waveCleared') out.push('stars');
  if (name === 'restlessChanged' && data.restless) out.push('restless');
  if (name === 'editModeChanged' && data.active) out.push('layout');
  if (name === 'hypeFull') out.push('dj');
  if (name === 'buildingPlaced' && data.type === 'altar') out.push('hero');
  // What's coming next: checked whenever the next wave can change.
  if (['waveCleared', 'townHallUpgraded', 'baseReset', 'tipsChecked'].includes(name)) {
    const info = nextWaveInfo(state);
    if (info.special) out.push('special');
    if (info.babyCars) out.push('boss');
    if ((nextWaveComposition(state).toilet || 0) > 0) out.push('toilet');
  }
  return out;
}

/** Are tips on for this village? (After the first tutorial, and unless the player turned them off.) */
export function tipsActive(state) {
  return !!state.tutorialDone && !state.tipsOff;
}

/** Feed an event to the tips: queue any new tip it brings up. Returns true if one was queued. */
export function tipEvent(state, name, data = {}) {
  if (!tipsActive(state)) return false;
  const seen = state.tipsSeen || (state.tipsSeen = []);
  const queue = state.tipQueue || (state.tipQueue = []);
  let added = false;
  for (const key of tipsForEvent(state, name, data)) {
    if (seen.includes(key) || queue.includes(key)) continue;
    queue.push(key);
    added = true;
  }
  if (added) emit(state, 'tipsChanged', { tip: queue[0] });
  return added;
}

/** The tip on show right now: { key, text }, or null. */
export function currentTip(state) {
  if (!tipsActive(state) || !state.tipQueue || !state.tipQueue.length) return null;
  const key = state.tipQueue[0];
  return { key, text: TIPS[key]() };
}

/** "Got it": the current tip is seen; the next one in the queue (if any) shows. */
export function dismissTip(state) {
  const key = state.tipQueue && state.tipQueue.shift();
  if (!key) return false;
  if (!(state.tipsSeen || (state.tipsSeen = [])).includes(key)) state.tipsSeen.push(key);
  emit(state, 'tipsChanged', { tip: state.tipQueue[0] || null });
  return true;
}

/** "No more tips": every tip counts as seen. */
export function hideAllTips(state) {
  state.tipsSeen = [...TIP_KEYS];
  state.tipQueue = [];
  emit(state, 'tipsChanged', { tip: null });
}

/** Saved as a comma list of seen tips ("" when none). */
export function serializeTips(state) {
  return (state.tipsSeen || []).filter((k) => TIP_KEYS.includes(k)).join(',');
}
export function validTips(v) {
  return v === undefined || (typeof v === 'string' && v.length <= 200 && /^[a-z,]*$/.test(v));
}
export function deserializeTips(v) {
  return (v || '').split(',').filter((k) => TIP_KEYS.includes(k));
}
