// Leagues: a badge for each player from their furthest wave survived (the leaderboard number).
// Waves follow the Village Hall level up to 10, then count up one per night, so Crystal is about
// "survived the top Village Hall's first night" and the last two leagues are for long runs after that.
// A player who hasn't survived a wave yet has no league.

export const LEAGUES = [
  { key: 'bronze', name: 'Bronze', minWave: 1, texture: 'ui_league_bronze' },
  { key: 'silver', name: 'Silver', minWave: 4, texture: 'ui_league_silver' },
  { key: 'gold', name: 'Gold', minWave: 7, texture: 'ui_league_gold' },
  { key: 'crystal', name: 'Crystal', minWave: 10, texture: 'ui_league_crystal' },
  { key: 'champion', name: 'Champion', minWave: 15, texture: 'ui_league_champion' },
  { key: 'warlord', name: 'WarLord', minWave: 25, texture: 'ui_league_warlord' }
];

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
