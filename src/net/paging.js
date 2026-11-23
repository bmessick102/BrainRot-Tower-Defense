// Paging for the leaderboard and Find Players (v0.8.3). The server sends one page at a time
// (supabase: get_village_leaderboard(lim, off), search_players(..., lim, off)); the game asks for a page plus one row,
// so it knows whether there's a next page without counting everything.

export const LEADERBOARD_PAGE = 10; // villages per leaderboard page
export const SEARCH_PAGE = 8;       // players per Find Players page

/**
 * One leaderboard page from rows that carry `pos` (each village's place in board order: 1, 2, 3...), as the server
 * sends them for (limit + 1, offset): the page's villages, plus maybe the next one, plus the caller's own best village
 * wherever it is. Returns { rows, mine, hasMore }: `mine` is the caller's best village when it isn't on this page.
 */
export function boardPage(rows, offset, limit) {
  const inPage = (r) => r.pos > offset && r.pos <= offset + limit;
  const page = rows.filter(inPage).sort((a, b) => a.pos - b.pos);
  const own = rows.filter((r) => r.isMe).sort((a, b) => a.pos - b.pos);
  const best = own[0] || null; // the caller's lowest place is their best village
  return { rows: page, mine: best && !inPage(best) ? best : null, hasMore: rows.some((r) => r.pos > offset + limit) };
}

/** Is this a "the server doesn't have that function (with those arguments) yet" error? (a migration not run) */
export function isMissingFunction(error) {
  return !!error && (error.code === 'PGRST202' || /could not find the function/i.test(error.message || ''));
}
