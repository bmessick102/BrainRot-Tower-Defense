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
