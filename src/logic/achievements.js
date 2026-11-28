// Achievements: earned once per account (across all of its villages) and saved online. Each one pays a
// one-time gold reward, claimed from the Achievements window into the village being played.
//
// Every achievement measures one number (`stat`) against a `goal`:
// - account stats (src/net/session.js keeps them): bestTownHall, bestWave, and counters bumped by
//   AchievementTracker from game events (kills, balloonKills, ...);
// - village stats, read from the village being played (defenseTypes, walls, maxed).
// Pure functions only: no Phaser, no network.
import { DEFENSE_TYPES, maxLevel } from './buildings.js';

export const ACHIEVEMENT_GROUPS = [
  { key: 'village', label: 'Village' },
  { key: 'battle', label: 'Battle' },
  { key: 'builder', label: 'Builder' }
];

export const ACHIEVEMENTS = [
  // ---- Village: Village Hall levels and waves survived ----
  { id: 'hall1', group: 'village', name: 'Back from the Ruins', desc: 'Rebuild your Village Hall', stat: 'bestTownHall', goal: 1, reward: 100 },
  { id: 'hall3', group: 'village', name: 'Growing Village', desc: 'Upgrade a Village Hall to level 3', stat: 'bestTownHall', goal: 3, reward: 1000 },
  { id: 'hall5', group: 'village', name: 'Brainrot Town', desc: 'Upgrade a Village Hall to level 5', stat: 'bestTownHall', goal: 5, reward: 3000 },
  { id: 'hall7', group: 'village', name: 'Brainrot City', desc: 'Upgrade a Village Hall to level 7', stat: 'bestTownHall', goal: 7, reward: 8000 },
  { id: 'hall10', group: 'village', name: 'Capital of Brainrot', desc: 'Upgrade a Village Hall to level 10', stat: 'bestTownHall', goal: 10, reward: 25000 },
  // (v0.11: Village Halls 15 and 20, with the halls going to 20; in the Builder tab, since a tab shows at most 10 cards)
  { id: 'hall15', group: 'builder', name: 'Brainrot Empire', desc: 'Upgrade a Village Hall to level 15', stat: 'bestTownHall', goal: 15, reward: 60000 },
  { id: 'hall20', group: 'builder', name: 'Eternal Brainrot', desc: 'Upgrade a Village Hall to level 20', stat: 'bestTownHall', goal: 20, reward: 150000 },
  { id: 'wave1', group: 'village', name: 'First Wave', desc: 'Survive wave 1', stat: 'bestWave', goal: 1, reward: 100 },
  { id: 'wave5', group: 'village', name: 'Night Watch', desc: 'Survive wave 5', stat: 'bestWave', goal: 5, reward: 2000 },
  { id: 'wave10', group: 'village', name: 'Siege Survivor', desc: 'Survive wave 10', stat: 'bestWave', goal: 10, reward: 8000 },
  { id: 'wave20', group: 'village', name: 'Endless Night', desc: 'Survive wave 20', stat: 'bestWave', goal: 20, reward: 20000 },
  { id: 'wave50', group: 'village', name: 'Legend of the Night', desc: 'Survive wave 50', stat: 'bestWave', goal: 50, reward: 50000 },

  // ---- Battle: things your defenses do ----
  { id: 'kills100', group: 'battle', name: 'Pest Control', desc: 'Defeat 100 enemies', stat: 'kills', goal: 100, reward: 300 },
  { id: 'kills1000', group: 'battle', name: 'Brainrot Buster', desc: 'Defeat 1,000 enemies', stat: 'kills', goal: 1000, reward: 3000 },
  { id: 'kills10000', group: 'battle', name: 'Exterminator', desc: 'Defeat 10,000 enemies', stat: 'kills', goal: 10000, reward: 15000 },
  { id: 'bombers', group: 'battle', name: 'Clear Skies', desc: 'Shoot down 10 Bombardiro Crocodilos', stat: 'bomberKills', goal: 10, reward: 1500 },
  { id: 'balloons', group: 'battle', name: 'Pop Goes the Neegy', desc: 'Shoot down 5 Neegy Balloons', stat: 'balloonKills', goal: 5, reward: 3000 },
  { id: 'snap', group: 'battle', name: 'Snap!', desc: 'Catch enemies in a Mousetrap', stat: 'traps', goal: 1, reward: 200 },
  { id: 'meltdown', group: 'battle', name: 'Meltdown', desc: 'Heat a Tower of Rah beam all the way up', stat: 'rahMax', goal: 1, reward: 2000 },
  { id: 'flawless', group: 'battle', name: 'Flawless Defense', desc: 'Survive a wave without losing a building (walls don’t count)', stat: 'perfect', goal: 1, reward: 500 },
  { id: 'untouchable', group: 'battle', name: 'Untouchable', desc: 'Survive 10 waves without losing a building', stat: 'perfect', goal: 10, reward: 4000 },
  { id: 'stars100', group: 'battle', name: 'Star Collector', desc: 'Earn 100 wave stars', stat: 'stars', goal: 100, reward: 3000 },

  // ---- Builder: your villages ----
  { id: 'early', group: 'builder', name: 'Bring It On', desc: 'Start a wave within 10 s of clearing the last one, 5 times', stat: 'early', goal: 5, reward: 500 },
  { id: 'mined10k', group: 'builder', name: 'Bitcoin Rush', desc: 'Collect 10,000 Bitcoin from Bitcoin Mines', stat: 'mined', goal: 10000, reward: 1000 },
  { id: 'mined100k', group: 'builder', name: 'Bitcoin Baron', desc: 'Collect 100,000 Bitcoin from Bitcoin Mines', stat: 'mined', goal: 100000, reward: 6000 },
  { id: 'walls', group: 'builder', name: 'Great Wall', desc: 'Have 50 walls in one village', stat: 'walls', goal: 50, reward: 1500 },
  { id: 'arsenal', group: 'builder', name: 'Full Arsenal', desc: 'Have one of every defense and trap in one village', stat: 'defenseTypes', goal: DEFENSE_TYPES.length, reward: 6000 },
  { id: 'maxed', group: 'builder', name: 'Maxed Out', desc: 'Upgrade a building (not a wall) to its top level', stat: 'maxed', goal: 1, reward: 3000 },
  // (v0.14) a Shake Storage at its top level (12, from Village Hall 12)
  { id: 'shakeVault', group: 'builder', name: 'Shake Vault', desc: 'Upgrade a Shake Storage to its top level', stat: 'shakeVault', goal: 1, reward: 25000 }
];

/** The counters AchievementTracker bumps (all start at 0). */
export const COUNTERS = ['kills', 'bomberKills', 'balloonKills', 'traps', 'rahMax', 'perfect', 'early', 'mined', 'stars'];

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

/** Numbers read from the village being played (null state: all 0). */
export function villageStats(state) {
  const out = { defenseTypes: 0, walls: 0, maxed: 0, shakeVault: 0 };
  if (!state || !Array.isArray(state.buildings)) return out;
  const types = new Set();
  for (const b of state.buildings) {
    if (b.type === 'wall') { out.walls++; continue; }
    if (DEFENSE_TYPES.includes(b.type)) types.add(b.type);
    if (b.type !== 'townHall' && b.level >= maxLevel(b.type)) out.maxed = 1;
    if (b.type === 'shakeStorage' && b.level >= maxLevel(b.type)) out.shakeVault = 1;
  }
  out.defenseTypes = types.size;
  return out;
}

/**
 * Every number the achievements measure, from the account's stats ({ bestTownHall, bestWave, counters })
 * and the village being played (optional).
 */
export function progressValues(stats, state = null) {
  const s = stats || {};
  const c = s.counters || {};
  const out = { bestTownHall: s.bestTownHall || 0, bestWave: s.bestWave || 0, ...villageStats(state) };
  for (const k of COUNTERS) out[k] = Number.isFinite(c[k]) ? c[k] : 0;
  return out;
}

/** Preserve each counter's high-water mark across devices without mixing villages. */
export function mergeVillageCounters(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const [baseId, counters] of Object.entries(incoming || {})) {
    const row = { ...merged[baseId] };
    for (const key of COUNTERS) {
      if (Number.isFinite(counters?.[key])) row[key] = Math.max(row[key] || 0, counters[key]);
    }
    if (Object.keys(row).length) merged[baseId] = row;
  }
  return merged;
}

/** How far along an achievement is: { value (capped at the goal), goal, done }. */
export function achievementProgress(a, values) {
  const value = Math.min(values[a.stat] || 0, a.goal);
  return { value, goal: a.goal, done: value >= a.goal };
}

/** Achievements whose goal is met but that aren't in `earned` (a Set or array of ids) yet. */
export function newlyEarned(values, earned) {
  const have = earned instanceof Set ? earned : new Set(earned || []);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && achievementProgress(a, values).done).map((a) => a.id);
}

/**
 * The furthest wave a village has survived, for villages that were played before waves were tracked
 * (e.g. one imported from this device). Waves are numbered in the order they're fought, so it's simply
 * the number of waves cleared.
 */
export function estimateBestWave(save) {
  return (save && save.wavesCleared) || 0;
}
