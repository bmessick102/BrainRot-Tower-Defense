// Leagues: a badge for each player from their furthest wave survived (the leaderboard number).
// Waves are numbered in the order they're fought and every wave is 8% bigger than the last (waveRamp), so
// these are long hauls: wave 50 has about 5x the enemies of wave 1. Below Bronze there is no league yet.

export const LEAGUES = [
  { key: 'bronze', name: 'Bronze', minWave: 5, texture: 'ui_league_bronze' },
  { key: 'silver', name: 'Silver', minWave: 20, texture: 'ui_league_silver' },
  { key: 'gold', name: 'Gold', minWave: 40, texture: 'ui_league_gold' },
  { key: 'crystal', name: 'Crystal', minWave: 70, texture: 'ui_league_crystal' },
  { key: 'champion', name: 'Champion', minWave: 110, texture: 'ui_league_champion' },
  { key: 'warlord', name: 'WarLord', minWave: 160, texture: 'ui_league_warlord' }
];

/** Bronze's badge is this share of the full size; each league up adds an even step, to WarLord at 100% (v0.7.1). */
export const LEAGUE_BADGE_MIN = 0.85;

/**
 * How much of its box each badge's picture fills: sqrt(width x height) / its longer side, measured from the art.
 * A badge is fitted by its longer side, so a squarish one (Silver) looks bigger than a tall narrow one (Champion)
 * at the same size; dividing by this evens them out, so the league grading is what the eye sees.
 */
export const LEAGUE_ART_FILL = { bronze: 0.892, silver: 0.991, gold: 0.913, crystal: 0.976, champion: 0.890, warlord: 0.967 };
const ART_FILL_REF = 0.93; // about the average: badges stay about as big as before overall

/**
 * A league badge's size (its longer side): a little bigger for each league up, like the leaderboard's gold / silver /
 * bronze medals, corrected for each picture's shape. `size` is about the top league's size.
 */
export function leagueBadgeSize(league, size) {
  const i = Math.max(0, LEAGUES.indexOf(league));
  const grade = LEAGUE_BADGE_MIN + (1 - LEAGUE_BADGE_MIN) * i / (LEAGUES.length - 1);
  const fill = (league && LEAGUE_ART_FILL[league.key]) || ART_FILL_REF;
  return Math.round(size * grade * ART_FILL_REF / fill);
}

/** The league for a furthest wave survived, or null below the first one. */
export function leagueFor(bestWave) {
  let out = null;
  for (const l of LEAGUES) if ((bestWave || 0) >= l.minWave) out = l;
  return out;
}

/** The next league up and the wave it needs, or null at the top. */
export function nextLeague(bestWave) {
  return LEAGUES.find((l) => (bestWave || 0) < l.minWave) || null;
}

/** The league reached when the furthest wave goes from `before` to `after`, if it changed (else null). */
export function promotion(before, after) {
  const a = leagueFor(before), b = leagueFor(after);
  return b && b !== a ? b : null;
}
