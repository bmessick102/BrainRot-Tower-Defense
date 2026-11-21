// First-time tips: a short note from the guide the first time each system shows up, so a new player meets
// them one at a time instead of all at once. Each tip shows once per village (saved as `tips`), only after
// the first tutorial, in the guide bubble (UIScene), with "Got it" and "No more tips". Tips that come up
// together wait in a queue. The RV Lab has its own longer guide (labGuide.js).
import { CONFIG } from '../config.js';
import { emit } from './util.js';
import { nextWaveInfo, nextWaveComposition } from './waves.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const hallLevel = (state) => { const th = (state.buildings || []).find((b) => b.type === 'townHall'); return th ? th.level : 0; };

/** Every tip: key (saved) and text. The event that brings each one up is in tipsForEvent. */
export const TIPS = {
  rp: () => 'Burgers! The burger bar next to your gold. You get them for every enemy you defeat and every wave you beat, up to a cap that grows with your RV Lab level (extra is lost). Spend them in the RV Lab (from Village Hall 4) on perks: your first pick for a building type locks all of that type to one path, whatever their level.',
  stars: () => `Wave stars: each wave is rated by how much of your village is still standing at the end (walls don't count). 3 stars pays +${pct(CONFIG.rules.waveStars.bonus[2])} gold and Burgers, 2 stars +${pct(CONFIG.rules.waveStars.bonus[1])}. The stars at the top show how you're doing.`,
  special: () => `A special wave is next! Every ${CONFIG.specialWaves.every}rd wave is special: the top bar names it (an Air Raid is flyers only, for example), so you can prepare. Beating one pays bonus gold.`,
  restless: () => `Night attack! In the dark, enemies are restless: they hit harder and move faster, but pay +${pct(CONFIG.rules.night.lootBonus)} gold and Burgers. Start waves by day for an easier fight, or at night for more loot.`,
  boss: () => `${CONFIG.enemies.babycar.name} comes next wave! This raid boss drives straight at your Village Hall and smashes through walls. Keep strong defenses near your hall, and be ready for the troops it bursts into.`,
  toilet: () => `${CONFIG.enemies.toilet.name}s come next wave! They tunnel under your walls to the nearest building and pop up to attack. Underground, only a F.L.O.C.K Tower's sight lets your defenses hit them.`,
  pork: () => `${CONFIG.enemies.pork.name} comes next wave! When a F.L.O.C.K Tower spots him he makes a call that silences every F.L.O.C.K Tower near him for ${CONFIG.enemies.pork.call.seconds} s. Keep other defenses covering your F.L.O.C.K Towers.`,
  skeleton: () => `${CONFIG.enemies.skeleton.name} comes next wave! His shield bash enrages every enemy around him (+${CONFIG.enemies.skeleton.rage.damagePct}% damage, +${CONFIG.enemies.skeleton.rage.speedPct}% speed). Take him out before he reaches your base.`,
  vaca: () => `${CONFIG.enemies.vaca.name} comes next wave! This tough flyer throws boulders that bounce on behind their target. Only defenses that hit air can stop it.`,
  yahu: () => `${CONFIG.enemies.yahu.name} comes next wave! Missiles get called down from long range: a red target shows where each will land. Spread your buildings out.`,
  patapim: () => `${CONFIG.enemies.patapim.name} comes next wave! His earthquakes hit every building and wall around him. Slow him down and hit him hard before he reaches your walls.`,
  hero: () => 'The Brisket King guards his altar, clubbing ground enemies nearby. In a wave, use Brisket Feast on the hotbar at the bottom (or press its number key) to heal, boost and slam. He naps after waves to heal.',
  dj: () => 'DJ Babyface\'s hype is full! In a wave, use Drop the Beat on the hotbar at the bottom (or press its number key): every defense in its range fires much faster for a few seconds. Defeating enemies fills it again.',
  fuel: () => 'The Fuel Station (Shop, Economy tab) brews spells with Burgers: click it and press Brew. During waves, brewed spells sit on the hotbar at the bottom: click one (or press its number), then click the map to cast it. Each is used up when cast, and your Village Hall level sets how many you can carry.',
  // The Fuel Station guide (spells.js fuelGuide), one tip per step.
  fuelBuild: () => 'Village Hall 2 unlocked the Fuel Station! It brews spells you can cast in a wave. Build it from the Shop (Economy tab): your first spell is on the house.',
  fuelBrew: () => 'Your Fuel Station is up! Click it and press Brew, then brew a Karuba Coffee (Rage): the first one is free. It makes your defenses fire faster and hit harder for a few seconds.',
  fuelCast: () => 'Your Karuba Coffee (Rage) is ready. In the next wave it waits on the hotbar at the bottom (its slot pulses): click it (or press its number), then click the map near your defenses to cast it.',
  layout: () => 'Edit mode: pick buildings up into the hotbar and place them again to rearrange your village. Nothing changes until you press Save.',
  walls: () => 'Walls all share one level. Click any wall and press Upgrade Walls to raise every wall at once (each wall costs the new level\'s price). New walls are built at your current wall level.'
};
export const TIP_KEYS = Object.keys(TIPS);
// Enemies with a "comes next wave" tip, the first time a wave brings them.
const NEW_ENEMY_TIPS = ['toilet', 'pork', 'skeleton', 'vaca', 'yahu', 'patapim'];

/** Which tips an event brings up (if not seen yet). */
function tipsForEvent(state, name, data) {
  const out = [];
  if (name === 'researchPointsChanged' && (data.added || 0) > 0) out.push('rp');
  if (name === 'waveCleared') out.push('stars');
  if (name === 'restlessChanged' && data.restless) out.push('restless');
  if (name === 'editModeChanged' && data.active) out.push('layout');
  if (name === 'hypeFull') out.push('dj');
  if (name === 'buildingPlaced' && data.type === 'altar') out.push('hero');
  // The Fuel Station: its guide's steps (it starts at Village Hall 2), or the plain tip for villages past that.
  const guide = state.fuelGuide || 0; // 1 build, 2 brew the free Karuba Coffee (Rage), 3 cast it (spells.js FUEL_GUIDE)
  if (name === 'fuelGuideChanged' || name === 'tipsChecked') {
    const tip = { 1: 'fuelBuild', 2: 'fuelBrew', 3: 'fuelCast' }[guide];
    if (tip) out.push(tip);
  }
  if (name === 'buildingPlaced' && data.type === 'fuelStation' && guide !== 2) out.push('fuel');
  if (name === 'tipsChecked' && !guide && hallLevel(state) >= CONFIG.fuelStation.unlockTownHall
    && !(state.buildings || []).some((b) => b.type === 'fuelStation')) out.push('fuel');
  if (name === 'buildingPlaced' && data.type === 'wall') out.push('walls');
  // What's coming next: checked whenever the next wave can change.
  if (['waveCleared', 'townHallUpgraded', 'baseReset', 'tipsChecked'].includes(name)) {
    const info = nextWaveInfo(state);
    if (info.special) out.push('special');
    if (info.babyCars) out.push('boss');
    const comp = nextWaveComposition(state);
    for (const k of NEW_ENEMY_TIPS) if ((comp[k] || 0) > 0) out.push(k);
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
// Tip keys are camelCase ("fuelBuild"): letters and digits, any case. The length cap leaves room for every key.
const TIPS_RE = /^[A-Za-z0-9,]*$/;
export function validTips(v) {
  return v === undefined || (typeof v === 'string' && v.length <= Math.max(400, TIP_KEYS.join(',').length * 2) && TIPS_RE.test(v));
}
export function deserializeTips(v) {
  return (v || '').split(',').filter((k) => TIP_KEYS.includes(k));
}
