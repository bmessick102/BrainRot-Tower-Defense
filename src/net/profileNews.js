// What's new in the Profile: the red count on the in-game profile pill (like the shop's badge).
// It counts achievement rewards waiting to be claimed, plus achievements earned and league promotions the
// player hasn't looked at yet. Opening the Profile marks the news as seen; unclaimed rewards stay counted
// until they're claimed. "Seen" is remembered per account on this device (localStorage via the session).
import { leagueFor } from '../logic/leagues.js';

const key = (s) => `ibtd.profileSeen.${s.user.id}.${s.activeId || ''}`;

function read(s) {
  try { return JSON.parse(s.lget(key(s)) || 'null'); } catch { return null; }
}

function snapshot(s) {
  const league = leagueFor(s.stats.bestWave);
  return { achievements: [...s.earnedIds()], league: league ? league.key : null };
}

/** What the player has seen. The first time on a device, everything there already counts as seen. */
function seen(s) {
  let v = read(s);
  if (!v || !Array.isArray(v.achievements)) {
    v = snapshot(s);
    s.lset(key(s), JSON.stringify(v));
  }
  return v;
}

/**
 * { count, unclaimed, newAchievements: [ids], newLeague: league | null } for the logged-in session.
 * An achievement that's both new and unclaimed counts once.
 */
export function profileNews(s) {
  if (!s || !s.loggedIn || !s.user) return { count: 0, unclaimed: 0, newAchievements: [], newLeague: null };
  const v = seen(s);
  const seenIds = new Set(v.achievements);
  const unclaimed = s.unclaimed();
  const fresh = [...s.earnedIds()].filter((id) => !seenIds.has(id));
  const items = new Set([...unclaimed, ...fresh]);
  const league = leagueFor(s.stats.bestWave);
  const newLeague = league && league.key !== v.league ? league : null;
  return { count: items.size + (newLeague ? 1 : 0), unclaimed: unclaimed.length, newAchievements: fresh, newLeague };
}

/** The player opened the Profile: the current achievements and league are now seen. */
export function markProfileSeen(s) {
  if (s && s.loggedIn && s.user) s.lset(key(s), JSON.stringify(snapshot(s)));
}
