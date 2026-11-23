// Graceful fail (v0.8.3): the crash window after a stopped game loop (src/objects/CrashOverlay.js), friendly server
// errors (supabaseBackend friendlyError), and the leaderboard falling back when the server's database is behind
// (paging.js isServerSetupError: "column b.best_wave_at does not exist").
import { describe, it, expect, vi } from 'vitest';
import { installCrashGuard, crashMessage, CRASH_CHECK_MS } from '../src/objects/CrashOverlay.js';
import { friendlyError, SupabaseBackend } from '../src/net/supabaseBackend.js';
import { isServerSetupError } from '../src/net/paging.js';

/** A stand-in window with timers we run by hand, and a game whose loop we move along. */
function setup({ hidden = false } = {}) {
  const listeners = {}, timers = [];
  const win = {
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: (n) => { delete listeners[n]; },
    setTimeout: (f, ms) => { timers.push({ f, ms }); }
  };
  const doc = { hidden };
  const game = { loop: { frame: 100, sleep: vi.fn(), wake: vi.fn() } };
  const show = vi.fn();
  const stop = installCrashGuard(game, { win, doc, show });
  const runTimers = () => { const t = timers.splice(0); t.forEach((x) => x.f()); return t; };
  return { listeners, timers, runTimers, doc, game, show, stop };
}

describe('crash window', () => {
  it('an error that stops the game loop brings it up; Keep Playing restarts the loop', () => {
    const t = setup();
    t.listeners.error({ error: new Error('boom') });
    expect(t.timers[0].ms).toBe(CRASH_CHECK_MS);
    t.runTimers(); // no frames since
    expect(t.show).toHaveBeenCalledTimes(1);
    const [, opts] = t.show.mock.calls[0];
    opts.onKeepPlaying();
    expect(t.game.loop.sleep).toHaveBeenCalled();
    expect(t.game.loop.wake).toHaveBeenCalled();
  });

  it('an error the game goes on from (frames keep coming) is not shown', () => {
    const t = setup();
    t.listeners.error({ error: new Error('a sound failed') });
    t.game.loop.frame += 30;
    t.runTimers();
    expect(t.show).not.toHaveBeenCalled();
  });

  it('a hidden tab (no frames anyway) waits until it is visible to decide', () => {
    const t = setup({ hidden: true });
    t.listeners.error({ error: new Error('boom') });
    t.runTimers();
    expect(t.show).not.toHaveBeenCalled();
    t.doc.hidden = false;
    t.game.loop.frame += 10; // came back and kept running
    t.runTimers();
    expect(t.show).not.toHaveBeenCalled();
  });

  it('one check at a time, and it can be turned off', () => {
    const t = setup();
    t.listeners.error({ error: new Error('a') });
    t.listeners.error({ error: new Error('b') });
    expect(t.timers).toHaveLength(1);
    t.stop();
    expect(t.listeners.error).toBeUndefined();
  });

  it('players see a plain line, never code words', () => {
    expect(crashMessage(new TypeError("Cannot read properties of null (reading 'drawImage')"))).toBe('The game hit a problem and stopped.');
    expect(crashMessage(new Error('Out of memory'))).toBe('The game hit a problem: Out of memory');
    expect(crashMessage(null)).toBe('The game hit a problem and stopped.');
  });
});

describe('friendly server errors', () => {
  it('a database that is behind the game says so in plain words', () => {
    expect(friendlyError({ code: '42703', message: 'column b.best_wave_at does not exist' }).message).toBe('This isn’t available on the server yet. Try again later.');
    expect(friendlyError({ code: 'PGRST202', message: 'Could not find the function public.x' }).message).toBe('This isn’t available on the server yet. Try again later.');
  });

  it('other database errors never show their SQL; our own messages (P0001) and auth messages still do', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(friendlyError({ code: '23505', message: 'duplicate key value violates unique constraint "x_pkey"' }).message).toBe('Something went wrong on the server. Try again in a moment.');
    expect(friendlyError({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }).message).toBe('Something went wrong on the server. Try again in a moment.');
    expect(friendlyError({ code: 'P0001', message: 'Too many requests. Wait a moment and try again.' }).message).toBe('Too many tries. Wait a minute and try again.');
    expect(friendlyError({ code: 'P0001', message: 'Village name taken' }).message).toBe('Village name taken');
    expect(friendlyError({ message: 'Invalid login credentials' }).message).toBe('Wrong email or password.');
    warn.mockRestore();
  });

  it('isServerSetupError: missing functions, columns, tables', () => {
    expect(isServerSetupError({ code: '42703', message: 'column b.best_wave_at does not exist' })).toBe(true);
    expect(isServerSetupError({ code: '42P01', message: 'relation "public.rate_limits" does not exist' })).toBe(true);
    expect(isServerSetupError({ code: 'PGRST202', message: '' })).toBe(true);
    expect(isServerSetupError({ code: 'P0001', message: 'Too many requests' })).toBe(false);
    expect(isServerSetupError({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});

describe('leaderboard on a server whose database is behind', () => {
  it('"column b.best_wave_at does not exist" falls back to the per-player board instead of failing', async () => {
    const be = new SupabaseBackend('https://example.invalid', 'anon-key');
    be.userId = 'user-a';
    const calls = [];
    be.db = { rpc: async (name, args) => {
      calls.push(name);
      if (name === 'get_village_leaderboard') return { data: null, error: { code: '42703', message: 'column b.best_wave_at does not exist' } };
      return { data: [{ rank: 1, username: 'Kebahon', best_wave: 138, best_town_hall: 11, is_me: true }, { rank: 2, username: 'Silver', best_wave: 102, best_town_hall: 11, is_me: false }], error: null };
    } };
    const page = await be.leaderboardPage(0, 10);
    expect(page.rows.map((r) => [r.pos, r.username, r.bestWave])).toEqual([[1, 'Kebahon', 138], [2, 'Silver', 102]]);
    expect(page.hasMore).toBe(false);
    expect(calls).toEqual(['get_village_leaderboard', 'get_village_leaderboard', 'get_leaderboard']);
  });
});
