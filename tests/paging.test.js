// Paging for the leaderboard and Find Players (v0.8.3): src/net/paging.js, LocalBackend's paged calls, and the
// Supabase backend's paged calls with their fallbacks to the old server functions (mocked, no network).
import { describe, it, expect } from 'vitest';
import { boardPage, isMissingFunction, LEADERBOARD_PAGE, SEARCH_PAGE } from '../src/net/paging.js';
import { LocalBackend } from '../src/net/localBackend.js';
import { SupabaseBackend } from '../src/net/supabaseBackend.js';

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('boardPage', () => {
  const row = (pos, isMe = false) => ({ pos, rank: pos, username: `p${pos}`, isMe });

  it('cuts one page, says whether there is another, and adds your best village when it is off the page', () => {
    const rows = [row(11), row(12), row(13), row(14), row(40, true), row(55, true)];
    const p = boardPage(rows, 10, 3);
    expect(p.rows.map((r) => r.pos)).toEqual([11, 12, 13]);
    expect(p.hasMore).toBe(true);
    expect(p.mine.pos).toBe(40); // your best (lowest place), not your other village
  });

  it('no extra row: your best village is on the page; the last page has no next', () => {
    const p = boardPage([row(1), row(2, true), row(3)], 0, 3);
    expect(p.mine).toBeNull();
    expect(p.hasMore).toBe(false);
    expect(boardPage([row(21), row(22)], 20, 10)).toMatchObject({ hasMore: false, mine: null });
  });

  it('page sizes and the missing-function check', () => {
    expect([LEADERBOARD_PAGE, SEARCH_PAGE]).toEqual([10, 8]);
    expect(isMissingFunction({ code: 'PGRST202' })).toBe(true);
    expect(isMissingFunction({ message: 'Could not find the function public.search_players(...)' })).toBe(true);
    expect(isMissingFunction({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});

describe('LocalBackend paging', () => {
  /** 25 players, each with one village; player i reached wave 100 - i. Returns the backend logged in as `as`. */
  const world = async (as = 0) => {
    const be = new LocalBackend(memStorage());
    const ids = [];
    for (let i = 0; i < 25; i++) {
      await be.signUp({ email: `p${i}@example.com`, password: 'secret123', username: `Player${String(i).padStart(2, '0')}` });
      ids.push(be.userId);
      await be.createBase({ name: `Town${i}`, bestWave: 100 - i, townHall: 5 });
      await be.saveStats({ bestWave: 100 - i, bestTownHall: 5, counters: {} });
    }
    be.userId = ids[as];
    return be;
  };

  it('searchPlayers pages with offset (no repeats, no gaps)', async () => {
    const be = await world();
    const seen = [];
    for (let page = 0; page < 4; page++) {
      const rows = await be.searchPlayers({ query: 'player', limit: SEARCH_PAGE, offset: page * SEARCH_PAGE });
      seen.push(...rows.map((r) => r.username));
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe('Player00'); // furthest wave first
    expect(await be.searchPlayers({ limit: 8, offset: 24 })).toHaveLength(1);
    expect(await be.searchPlayers({ limit: 8, offset: 40 })).toHaveLength(0);
  }, 20000);

  it('leaderboardPage: places 11-20, Next while there are more, and your village under a page it is not on', async () => {
    const be = await world(22); // you're in 23rd place
    const p2 = await be.leaderboardPage(10, 10);
    expect(p2.rows.map((r) => r.pos)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(p2.rows[0]).toMatchObject({ username: 'Player10', villageName: 'Town10', bestWave: 90 });
    expect(p2.hasMore).toBe(true);
    expect(p2.mine).toMatchObject({ pos: 23, username: 'Player22', isMe: true });
    const p3 = await be.leaderboardPage(20, 10);
    expect(p3.rows.map((r) => r.pos)).toEqual([21, 22, 23, 24, 25]);
    expect(p3.hasMore).toBe(false);
    expect(p3.mine).toBeNull(); // you're on this page
  }, 20000);
});

describe('SupabaseBackend paging (mocked, no network)', () => {
  const make = (rpc) => {
    const be = new SupabaseBackend('https://example.invalid', 'anon-key');
    be.userId = 'user-a';
    const calls = [];
    be.db = { rpc: async (name, args) => { calls.push([name, args]); return rpc(name, args); } };
    return { be, calls };
  };
  const villages = (from, to, mine = null) => Array.from({ length: to - from + 1 }, (_, i) => from + i).map((pos) => ({
    rank: pos, pos, username: `p${pos}`, village_name: `v${pos}`, best_wave: 200 - pos, town_hall: 9, is_me: pos === mine
  }));

  it('leaderboardPage asks the server for one page plus one row, and maps it', async () => {
    const { be, calls } = make(() => ({ data: [...villages(11, 21), ...villages(40, 40, 40)], error: null }));
    const p = await be.leaderboardPage(10, 10);
    expect(calls).toEqual([['get_village_leaderboard', { lim: 11, off: 10 }]]);
    expect(p.rows).toHaveLength(10);
    expect(p.rows[0]).toEqual({ rank: 11, pos: 11, username: 'p11', villageName: 'v11', bestWave: 189, bestTownHall: 9, isMe: false, baseId: null });
    expect(p.hasMore).toBe(true);
    expect(p.mine).toMatchObject({ pos: 40, isMe: true });
  });

  it('before the migration, leaderboardPage cuts the page from the old top list', async () => {
    const { be, calls } = make((name, args) => (args && args.off !== undefined
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      : { data: [...villages(1, args.lim).map(({ pos, ...r }) => r), { rank: 57, username: 'me', village_name: 'mine', best_wave: 3, town_hall: 2, is_me: true }], error: null }));
    const p = await be.leaderboardPage(10, 10);
    expect(calls.map(([n, a]) => [n, a])).toEqual([['get_village_leaderboard', { lim: 11, off: 10 }], ['get_village_leaderboard', { lim: 21 }]]);
    expect(p.rows.map((r) => r.pos)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(p.hasMore).toBe(true);
    expect(p.mine).toMatchObject({ rank: 57, villageName: 'mine' });
  });

  it('searchPlayers sends `off`, and before the migration asks the old way and cuts the page', async () => {
    const players = Array.from({ length: 30 }, (_, i) => ({ username: `u${i}`, best_wave: 50 - i, best_town_hall: 4, achievements: 1, is_me: false }));
    const ok = make((name, args) => ({ data: players.slice(args.off, args.off + args.lim), error: null }));
    const rows = await ok.be.searchPlayers({ query: 'u', limit: 9, offset: 8 });
    expect(ok.calls[0][1]).toMatchObject({ q: 'u', lim: 9, off: 8 });
    expect(rows.map((r) => r.username)).toEqual(['u8', 'u9', 'u10', 'u11', 'u12', 'u13', 'u14', 'u15', 'u16']);
    const old = make((name, args) => (args.off !== undefined
      ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }
      : { data: players.slice(0, args.lim), error: null }));
    const rows2 = await old.be.searchPlayers({ query: 'u', limit: 9, offset: 8 });
    expect(old.calls[1][1]).toMatchObject({ lim: 17 });
    expect(old.calls[1][1].off).toBeUndefined();
    expect(rows2.map((r) => r.username)).toEqual(rows.map((r) => r.username));
    const bad = make(() => ({ data: null, error: { code: '42501', message: 'permission denied' } }));
    await expect(bad.be.searchPlayers({ offset: 8 })).rejects.toThrow();
  });
});

describe('ranks and numbers match the village leaderboard (v0.8.5)', () => {
  it('LocalBackend: a card ranks by the best village, every village carries its board rank, and the board row its village id', async () => {
    const be = new LocalBackend(memStorage());
    const id = {};
    await be.signUp({ email: 'k@example.com', password: 'secret123', username: 'Kebahon' });
    id.k = be.userId;
    const main = await be.createBase({ name: 'Main', bestWave: 138, townHall: 15, save: { version: 7 } });
    const alt = await be.createBase({ name: 'Alt', bestWave: 40, townHall: 3, save: { version: 7 } });
    await be.saveStats({ bestWave: 150, bestTownHall: 11, counters: {} }); // all-time 150: a village since deleted
    await be.signUp({ email: 's@example.com', password: 'secret123', username: 'Silver' });
    const silver = await be.createBase({ name: 'Silver Town', bestWave: 102, townHall: 14, save: { version: 7 } });
    await be.saveStats({ bestWave: 102, bestTownHall: 14, counters: {} });
    const board = await be.leaderboardPage(0, 10);
    expect(board.rows.map((r) => [r.rank, r.villageName, r.baseId])).toEqual([[1, 'Main', main.id], [2, 'Silver Town', silver.id], [3, 'Alt', alt.id]]);
    const card = await be.playerProfile('kebahon');
    expect(card.rank).toBe(1);                                   // the board rank of their best village
    expect([card.bestWave, card.bestTownHall]).toEqual([138, 15]); // their villages' numbers, not the deleted 150 / old 11
    expect(card.bases.map((b) => [b.name, b.rank])).toEqual([['Main', 1], ['Alt', 3]]);
    const found = await be.searchPlayers({ query: 'keb' });
    expect([found[0].bestWave, found[0].bestTownHall]).toEqual([138, 15]); // Find Players: the same numbers as the card
  });

  it('SupabaseBackend maps base_id on board rows and rank on a card\'s villages', async () => {
    const be = new SupabaseBackend('https://example.invalid', 'anon-key');
    be.userId = 'user-a';
    be.db = { rpc: async (name) => (name === 'get_village_leaderboard'
      ? { data: [{ rank: 4, pos: 4, username: 'K', village_name: 'Alt', best_wave: 40, town_hall: 3, is_me: false, base_id: 'b-alt' }], error: null }
      : { data: { username: 'K', rank: 1, best_wave: 138, best_town_hall: 15, achievements: [], bases: [{ id: 'b-main', name: 'Main', town_hall: 15, best_wave: 138, wave: 139, rank: 1 }, { id: 'b-new', name: 'New', town_hall: 1, best_wave: 0, wave: 1, rank: null }] }, error: null }) };
    const page = await be.leaderboardPage(3, 10);
    expect(page.rows[0].baseId).toBe('b-alt');
    const card = await be.playerProfile('K');
    expect(card.bases.map((b) => b.rank)).toEqual([1, null]);
  });
});
