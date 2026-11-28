// First-time tips: a short note from the guide the first time each system shows up, so a new player meets
// them one at a time instead of all at once. Each tip shows once per village (saved as `tips`), only after
// the first tutorial, in the guide bubble (UIScene), with "Got it" and "No more tips". Tips that come up
// together wait in a queue. The RV Lab and the Fuel Station have their own longer guides (labGuide.js, fuelGuide.js).
import { CONFIG } from '../config.js';
import { emit } from './util.js';
import { nextWaveInfo, nextWaveComposition } from './waves.js';
import { isFuelGuideActive } from './fuelGuide.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const hallLevel = (state) => { const th = (state.buildings || []).find((b) => b.type === 'townHall'); return th ? th.level : 0; };

/** Every tip: key (saved) and text. The event that brings each one up is in tipsForEvent. */
export const TIPS = {
  rp: () => 'Shakes! The purple bar next to your Bitcoin. You get them for every enemy you defeat and every wave you beat, up to a cap set by your Village Hall and Shake Storages (extra is lost). Spend them in the RV Lab (from Village Hall 4) on perks, on hero levels and on spells.',
  // v0.14: the first time a Shake Collector can be built (Village Hall 3).
  shakeCollector: () => `Village Hall ${CONFIG.shakeCollector.unlockTownHall} unlocked the Shake Collector and the Shake Storage (Shop, Economy tab)! A Shake Collector makes Shakes over time: click it when its Shake shows, like a mine. A Shake Storage raises how many Shakes you can hold.`,
  stars: () => `Wave stars: each wave is rated by how much of your village is still standing at the end (walls don't count). 3 stars pays +${pct(CONFIG.rules.waveStars.bonus[2])} Bitcoin and Shakes, 2 stars +${pct(CONFIG.rules.waveStars.bonus[1])}. The stars at the top show how you're doing.`,
  themes: () => `Every wave has a theme now, named in the top bar (Air Raid is flyers only, for example). Swarm, Heist, Siege and the other all-in themes pay bonus Bitcoin, and every ${CONFIG.waveThemes.boss.every}th wave is a Boss Wave.`,
  restless: () => `Night attack! In the dark, enemies are restless: they hit harder and move faster, but pay +${pct(CONFIG.rules.night.lootBonus)} Bitcoin and Shakes. Start waves by day for an easier fight, or at night for more loot.`,
  boss: () => `${CONFIG.enemies.babycar.name} comes next wave! This raid boss drives straight at your Village Hall and smashes through walls. Keep strong defenses near your hall, and be ready for the troops it bursts into.`,
  toilet: () => `${CONFIG.enemies.toilet.name}s come next wave! They tunnel under your walls to the nearest building and pop up to attack. Underground, only a F.L.O.C.K Tower's sight lets your defenses hit them.`,
  pork: () => `${CONFIG.enemies.pork.name} comes next wave! When a F.L.O.C.K Tower spots him he makes a call that silences every F.L.O.C.K Tower near him for ${CONFIG.enemies.pork.call.seconds} s. Keep other defenses covering your F.L.O.C.K Towers.`,
  skeleton: () => `${CONFIG.enemies.skeleton.name} comes next wave! Near your base he summons ${CONFIG.enemies.skeleton.summon.count} Skeletons out of the ground, and more every ${CONFIG.enemies.skeleton.summon.cooldown} s. Take him out before he gets close.`,
  vaca: () => `${CONFIG.enemies.vaca.name} comes next wave! This tough flyer throws boulders that bounce on behind their target. Only defenses that hit air can stop it.`,
  yahu: () => `${CONFIG.enemies.yahu.name} comes next wave! Missiles get called down from long range: a red target shows which building each will hit. Long-range defenses stop it fastest.`,
  patapimJungle: () => `${CONFIG.enemies.patapim.name} comes next wave! As he walks in he drops a ${CONFIG.enemies.chimp.name} every ${CONFIG.enemies.patapim.spawn.every} s: they leap your walls and dive into the nearest building. Take him down early.`,
  lirili: () => `${CONFIG.enemies.lirili.name} comes next wave! Its earthquakes hit every building and wall around it, and walls take extra damage. Slow it down and hit it hard before it reaches your walls.`,
  bicus: () => `${CONFIG.enemies.bicus.name} comes next wave! While its armor holds (the steel bar over its health) it takes 30% less damage, and the armor has to be broken before it takes any real damage. Heavy hitters like Cannons and Mortars crack it fastest.`,
  frigo: () => `${CONFIG.enemies.frigo.name} comes next wave! Its cold aura makes every defense (and the Brisket King) within ${CONFIG.enemies.frigo.chillAura.radius} tiles attack ${CONFIG.enemies.frigo.chillAura.slowPct}% slower. Take it out from range.`,
  quandale: () => `${CONFIG.enemies.quandale.name} comes next wave! He dashes at a building and lands a ${CONFIG.enemies.quandale.dash.impactMult}x hit that stuns it for ${CONFIG.enemies.quandale.dash.stunSeconds} s. Walls in his way stop the dash.`,
  grimace: () => `${CONFIG.enemies.grimace.name} comes next wave! He leaves purple goo as he walks: enemies in it get ${Math.round((CONFIG.enemies.grimace.goo.speedMult - 1) * 100)}% faster and stronger. Kill them before they leave the goo, and watch the big puddle where he falls.`,
  bombo: () => `${CONFIG.enemies.bombo.name} comes next wave! This flyer breathes fire on a building, and the flames also hurt the buildings right next to it. Only defenses that hit air can stop it.`,
  hero: () => 'The Brisket King guards his altar, clubbing ground enemies nearby. In a wave, use Brisket Feast on the hotbar at the bottom (or press its number key) to heal, boost and slam. He naps after waves to heal.',
  queen: () => 'The Hatsune Queen guards her altar, shooting ground and flying enemies from range with her crossbow. In a wave, use Encore Cloak on the hotbar at the bottom (or press G): she vanishes, hits harder with piercing bolts and heals. She naps after waves to heal.',
  dj: () => 'DJ Babyface\'s hype is full! In a wave, use Drop the Beat on the hotbar at the bottom (or press its number key): every defense in its range fires much faster for a few seconds. Defeating enemies fills it again.',
  fuel: () => 'The Fuel Station (Shop, Economy tab) brews spells with Shakes: click it and press Brew. During waves, brewed spells sit on the hotbar at the bottom: click one (or press its number), then click the map to cast it. Each is used up when cast, and your Village Hall level sets how many you can carry.',
  layout: () => 'Edit mode: pick buildings up into the hotbar and place them again to rearrange your village. Nothing changes until you press Save.',
  walls: () => 'Walls all share one level. Click any wall and press Upgrade Walls to raise every wall at once (each wall costs the new level\'s price). New walls are built at your current wall level.'
};
export const TIP_KEYS = Object.keys(TIPS);
// Enemies with a "comes next wave" tip, the first time a wave brings them.
const NEW_ENEMY_TIPS = ['toilet', 'pork', 'skeleton', 'vaca', 'yahu', 'bicus', 'frigo', 'bombo', 'lirili', 'patapim', 'quandale', 'grimace'];
// (Tip keys that differ from the enemy's: Brr Brr Patapim's ability changed in v0.7, so his tip is a new one.)
const ENEMY_TIP_KEY = { patapim: 'patapimJungle' };

/** Which tips an event brings up (if not seen yet). */
function tipsForEvent(state, name, data) {
  const out = [];
  if (name === 'researchPointsChanged' && (data.added || 0) > 0) out.push('rp');
  if (name === 'waveCleared') out.push('stars');
  if (name === 'restlessChanged' && data.restless) out.push('restless');
  if (name === 'editModeChanged' && data.active) out.push('layout');
  if (name === 'hypeFull') out.push('dj');
  if (name === 'buildingPlaced' && data.type === 'altar') out.push('hero');
  if (name === 'buildingPlaced' && data.type === 'queenAltar') out.push('queen');
  // The Fuel Station: the plain tip, for villages that aren't in its guide (fuelGuide.js, from Village Hall 2).
  const guide = isFuelGuideActive(state);
  if (name === 'buildingPlaced' && data.type === 'fuelStation' && !guide) out.push('fuel');
  if (name === 'tipsChecked' && !guide && !state.fuelGuide && hallLevel(state) >= CONFIG.fuelStation.unlockTownHall
    && !(state.buildings || []).some((b) => b.type === 'fuelStation')) out.push('fuel');
  if (name === 'buildingPlaced' && data.type === 'wall') out.push('walls');
  // The Shake Collector: once the hall allows one and none is built yet (checked when the hall levels up, and on load).
  if (['townHallUpgraded', 'tipsChecked'].includes(name) && hallLevel(state) >= CONFIG.shakeCollector.unlockTownHall
    && !(state.buildings || []).some((b) => b.type === 'shakeCollector')) out.push('shakeCollector');
  // What's coming next: checked whenever the next wave can change.
  if (['waveCleared', 'townHallUpgraded', 'baseReset', 'tipsChecked'].includes(name)) {
    const info = nextWaveInfo(state);
    if (info.theme) out.push('themes');
    if (info.babyCars) out.push('boss');
    const comp = nextWaveComposition(state);
    for (const k of NEW_ENEMY_TIPS) if ((comp[k] || 0) > 0) out.push(ENEMY_TIP_KEY[k] || k);
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
