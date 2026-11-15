// Wave stars: every beaten wave is rated 1-3 stars by how much of the village came through it, and a good
// rating pays a bonus on the wave's gold and research points (CONFIG.rules.waveStars). Walls don't count:
// only the buildings standing when the wave started, and how many of them were destroyed during it (a
// building rebuilt mid-wave and destroyed again counts twice). The free rebuild after the wave still happens.
import { CONFIG } from '../config.js';

/** Buildings that count for the rating: standing, not walls. */
export function countedBuildings(state) {
  return state.buildings.filter((b) => b.type !== 'wall' && !b.destroyed).length;
}

/** Stars for a wave that started with `start` counted buildings and lost `lost` of them (3 when none). */
export function starsFor(start, lost) {
  if (!lost) return 3;
  const standing = start > 0 ? 1 - lost / start : 0;
  return standing >= CONFIG.rules.waveStars.twoStarShare ? 2 : 1;
}

/** The rating the current wave is on track for (the HUD shows it live), or null without a wave. */
export function liveStars(state) {
  const w = state.wave;
  if (!w || (w.phase !== 'active' && w.phase !== 'countdown')) return null;
  return starsFor(w.startBuildings || 0, w.lost || 0);
}

/** Bonus share of the wave's gold and RP for a rating (0, 0.2 or 0.5). */
export function starBonus(stars) {
  return CONFIG.rules.waveStars.bonus[Math.max(1, Math.min(3, stars)) - 1] || 0;
}

/** "★★☆" */
export function starText(stars) {
  return '★'.repeat(stars) + '☆'.repeat(3 - stars);
}
