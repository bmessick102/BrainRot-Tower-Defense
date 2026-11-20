// Keeping copies of a village from overwriting each other (QA-2 follow-up):
// 1. the same village in two tabs (tab guard), and stale writes refused by the server (revision check);
// 2. offline start when the server can't be reached, and the sync at the next login;
// 3. device copies scoped per account (shared devices; nothing leaks across a logout);
// 4. merging an unsent device copy by server revision, never by wall-clock time.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Session, OFFLINE_CHANGE, isNetworkError } from '../src/net/session.js';
import { LocalBackend } from '../src/net/localBackend.js';
import { SupabaseBackend, friendlyError } from '../src/net/supabaseBackend.js';
import { TabGuard, makeTabBus } from '../src/net/tabGuard.js';
import { networkError, isConflictError } from '../src/net/errors.js';
import { serializeGame, SAVE_KEYS } from '../src/logic/save.js';
import { makeStateWithTownHall } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }, map: m
  };
}

function manualTimers() {
  const list = new Map();
  let n = 0;
  return {
    set: (fn) => { list.set(++n, fn); return n; },
    clear: (id) => list.delete(id),
    async runAll() { const fns = [...list.values()]; list.clear(); for (const f of fns) await f(); },
    get size() { return list.size; }
  };
}

/**
 * Tabs of one browser: every bus delivers to all the others (asynchronously, as copies, like BroadcastChannel).
 * Delivery is a microtask, so a message and its answer always arrive before the guard's answer window (a real
 * timer) closes, however busy the machine is. (With setTimeout delivery a stalled event loop let the 20 ms
 * window close first, and the test failed now and then.)
 */
function browserTabs() {
  const members = new Set();
  return () => {
    const me = { fn: null };
    me.post = (m) => { const copy = JSON.parse(JSON.stringify(m)); for (const o of members) if (o !== me && o.fn) queueMicrotask(() => o.fn(copy)); };
    me.listen = (f) => { me.fn = f; };
    members.add(me);
    return me;
  };
}

const saveOf = (gold, { th = 3, cleared = 2, savedAt } = {}) => {
  const s = serializeGame(makeStateWithTownHall({ gold, wavesCleared: cleared, tutorialStep: 11, tutorialDone: true }, th));
  return savedAt ? { ...s, savedAt } : s;
};
const play = (session, gold, opts) => session.storage.setItem(SAVE_KEYS.save, JSON.stringify(saveOf(gold, opts)));
const mirror = (device, id) => JSON.parse(device.getItem(`ibtd.cloud.${id}`));

let device, server, timers;
beforeEach(() => {
  device = memoryStorage();
  server = memoryStorage();
  timers = manualTimers();
});
const tab = (extra = {}) => new Session({ backend: new LocalBackend(server), storage: device, timers, ...extra });
const remote = async (id) => {
  const be = new LocalBackend(server);
  be.userId = JSON.parse(server.getItem('ibtd.dev.db')).bases.find((b) => b.id === id).userId;
  return (await be.listBases()).find((b) => b.id === id);
};

// ---------------------------------------------------------------- 1. two tabs, stale writes
describe('the same village in two tabs', () => {
  let n = 0;
  const newTab = (net) => tab({ guard: new TabGuard({ bus: net(), tabId: `tab-${++n}`, ackMs: 20, releaseMs: 1000 }) });

  it('opening it in a second tab tells the first, which stops saving; the second starts from everything the first saved', async () => {
    const net = browserTabs();
    const one = newTab(net), two = newTab(net);
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await one.createBase('Home');
    expect(await one.openBase(b.id)).toBe(true);
    play(one, 100);
    await timers.runAll();            // uploaded
    play(one, 150);                   // ...and a newer change, still unsent when the second tab opens it
    await two.signIn('ann@example.com', 'secret123');
    expect(two.baseById(b.id).save.gold).toBe(100);  // logging in never takes the first tab's copy
    expect(mirror(device, b.id).save.gold).toBe(150); // ...nor touches it
    expect(await two.openBase(b.id)).toBe(true);
    expect(one.lock).toMatchObject({ reason: 'tab', baseId: b.id, name: 'Home' });
    expect(two.lock).toBe(null);
    expect(two.activeBase.save.gold).toBe(150);       // the first tab's unsent change came along
    // The first tab's game keeps running behind the notice: nothing it saves lands anywhere.
    play(one, 999);
    expect(mirror(device, b.id).save.gold).toBe(150);
    play(two, 200);
    await timers.runAll();
    expect(two.lock).toBe(null);                      // no conflict for the tab that took over
    expect((await remote(b.id)).save.gold).toBe(200);
  });

  it('a save still uploading in the old tab finishes before the new tab reads the village', async () => {
    const net = browserTabs();
    const one = newTab(net), two = newTab(net);
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await one.createBase('Home');
    await one.openBase(b.id);
    play(one, 300);
    const uploading = one.uploadBase(one.baseById(b.id)); // in flight while the other tab opens the village
    await two.signIn('ann@example.com', 'secret123');
    await two.openBase(b.id);
    await uploading;
    expect(two.activeBase.save.gold).toBe(300);
    expect(two.activeBase.dirty).toBe(false);          // same as the server: nothing to merge
    play(two, 301);
    await timers.runAll();
    expect(two.lock).toBe(null);
    expect((await remote(b.id)).save.gold).toBe(301);
  });

  it('two tabs opening it at the same moment: the later one keeps it', async () => {
    const net = browserTabs();
    const one = newTab(net), two = newTab(net);
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await one.createBase('Home');
    await two.signIn('ann@example.com', 'secret123');
    // A clock that ticks on every read, so the second claim is always the later one (no real sleep to race the
    // guard's answer window).
    let clock = Date.now();
    const now = vi.spyOn(Date, 'now').mockImplementation(() => ++clock);
    try {
      const [r1, r2] = await Promise.all([one.openBase(b.id), two.openBase(b.id)]);
      expect([r1, r2]).toEqual([false, true]);
    } finally {
      now.mockRestore();
    }
    expect(one.lock).toMatchObject({ reason: 'tab' });
    expect(two.lock).toBe(null);
  });

  it("another account's tab, or another village, is left alone", async () => {
    const net = browserTabs();
    const one = newTab(net), two = newTab(net);
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const a = await one.createBase('A');
    const c = await one.createBase('C');
    await one.openBase(a.id);
    await two.signIn('ann@example.com', 'secret123');
    await two.openBase(c.id);
    expect(one.lock).toBe(null);
  });

  it('without BroadcastChannel, tabs talk through localStorage events', () => {
    const listeners = [];
    const win = (ls) => ({ localStorage: ls, addEventListener: (type, fn) => listeners.push([ls, fn]) });
    const ls1 = memoryStorage(), ls2 = memoryStorage();
    const bus1 = makeTabBus(win(ls1)), bus2 = makeTabBus(win(ls2));
    const got = [];
    bus2.listen((m) => got.push(m));
    bus1.listen(() => got.push('echo'));
    bus1.post({ t: 'claim', baseId: 'x' });
    // The browser fires 'storage' in the other tabs only.
    const [key, value] = [...ls1.map.entries()][0];
    for (const [ls, fn] of listeners) if (ls !== ls1) fn({ key, newValue: value });
    expect(got).toEqual([expect.objectContaining({ t: 'claim', baseId: 'x' })]);
    expect(makeTabBus(null)).toBe(null);
  });
});

describe('stale writes are refused by the server', () => {
  it('a tab whose copy is behind the server is refused, keeps its copy as a backup, stops, and the backup restores', async () => {
    const one = tab(), two = tab();
    await one.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await one.createBase('Home');
    await two.signIn('ann@example.com', 'secret123');
    play(one, 100);
    await timers.runAll();
    play(two, 777, { th: 5 });  // based on the revision before one's upload
    await timers.runAll();
    expect(two.lock).toMatchObject({ reason: 'conflict', baseId: b.id });
    expect((await remote(b.id)).save.gold).toBe(100); // not overwritten
    play(two, 778);                                      // stopped for good
    await timers.runAll();
    expect((await remote(b.id)).save.gold).toBe(100);
    // Offered in Villages as a backup of that village, to this account; restoring it keeps the replaced copy too.
    const three = tab();
    await three.signIn('ann@example.com', 'secret123');
    const backup = three.deviceVillages().find((v) => v.baseId === b.id);
    expect(backup).toMatchObject({ name: 'Home' });
    expect(backup.save.gold).toBe(777);
    await three.restoreBackup(backup.key);
    await timers.runAll();
    expect((await remote(b.id)).save.gold).toBe(777);
    const left = three.deviceVillages().filter((v) => v.baseId === b.id);
    expect(left.map((v) => v.save.gold)).toEqual([100]);
  });

  it('LocalBackend: the revision moves only with the save, always forward; a stale expected revision is refused', async () => {
    const be = new LocalBackend(server);
    await be.signUp({ email: 'a@example.com', password: 'secret123', username: 'Ann' });
    const b = await be.createBase({ name: 'x' });
    const one = saveOf(1);
    const r1 = await be.updateBase(b.id, { save: one }, { expected: b.updatedAt });
    expect(r1.updatedAt > b.updatedAt).toBe(true);
    const r2 = await be.updateBase(b.id, { name: 'y' });                     // a rename isn't a new revision
    expect(r2.updatedAt).toBe(r1.updatedAt);
    const r3 = await be.updateBase(b.id, { save: one }, { expected: r1.updatedAt }); // same content
    expect(r3.updatedAt).toBe(r1.updatedAt);
    const err = await be.updateBase(b.id, { save: saveOf(2) }, { expected: b.updatedAt }).catch((e) => e);
    expect(isConflictError(err)).toBe(true);
    expect((await be.listBases())[0].save.gold).toBe(1);
  });

  describe('SupabaseBackend (mocked, no network)', () => {
    /** Answers each awaited query with the next result; records the calls. */
    function fakeDb(results) {
      const calls = [];
      const q = new Proxy({}, {
        get(_, name) {
          if (name === 'then') return (ok) => ok(results.shift());
          return (...args) => { calls.push([name, ...args]); return q; };
        }
      });
      return { calls, from: (t) => { calls.push(['from', t]); return q; } };
    }
    const make = () => { const be = new SupabaseBackend('https://example.invalid', 'anon-key'); be.userId = 'user-a'; return be; };

    it('saves only on top of the expected revision and returns the new one', async () => {
      const be = make();
      be.db = fakeDb([{ data: [{ id: 'b1', updated_at: 'r2' }], error: null }]);
      expect(await be.updateBase('b1', { save: { gold: 1 } }, { expected: 'r1' })).toEqual({ updatedAt: 'r2' });
      expect(be.db.calls).toContainEqual(['eq', 'updated_at', 'r1']);
      expect(be.db.calls).toContainEqual(['eq', 'user_id', 'user-a']);
      expect(be.db.calls.find((c) => c[0] === 'update')[1].updated_at).toBeTruthy(); // (until the migration's trigger stamps it)
    });

    it('a stale revision is a conflict; a missing village is not', async () => {
      const be = make();
      be.db = fakeDb([{ data: [], error: null }, { data: { id: 'b1', updated_at: 'r9' }, error: null }]);
      const e = await be.updateBase('b1', { save: {} }, { expected: 'r1' }).catch((x) => x);
      expect(isConflictError(e)).toBe(true);
      expect(e.serverRev).toBe('r9');
      be.db = fakeDb([{ data: [], error: null }, { data: null, error: null }]);
      await expect(be.updateBase('b1', { save: {} }, { expected: 'r1' })).rejects.toThrow(/no longer exists/);
    });

    it('a rename sends no revision', async () => {
      const be = make();
      be.db = fakeDb([{ data: [{ id: 'b1', updated_at: 'r1' }], error: null }]);
      await be.updateBase('b1', { name: 'New' });
      const upd = be.db.calls.find((c) => c[0] === 'update')[1];
      expect(upd).toEqual({ name: 'New' });
      expect(be.db.calls.some((c) => c[0] === 'eq' && c[1] === 'updated_at')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------- 2. offline start
describe('offline start when the server is unreachable', () => {
  /** A backend whose every call fails the way a dropped connection does. */
  const unreachable = () => {
    const be = new LocalBackend(server);
    be.calls = [];
    for (const k of ['currentUser', 'signIn', 'signUp', 'listBases', 'getStats', 'listAchievements', 'updateBase', 'createBase', 'deleteBase', 'saveStats', 'earnAchievements', 'claimAchievement', 'leaderboard']) {
      be[k] = async () => { be.calls.push(k); throw networkError(); };
    }
    return be;
  };

  async function annWithVillage() {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await s.createBase('Home');
    play(s, 100);
    s.earn(['wave1']);
    await s.flush();
    return { s, b };
  }

  it('plays the last account’s device copies; nothing is sent; it syncs at the next login', async () => {
    const { b } = await annWithVillage();
    const offTimers = manualTimers();
    const off = new Session({ backend: unreachable(), storage: device, timers: offTimers });
    const err = await off.restore().catch((e) => e);
    expect(isNetworkError(err)).toBe(true);
    expect(off.offlineAccount()).toMatchObject({ username: 'Ann' });
    expect(off.startOffline()).toBe(true);
    expect(off.offline).toBe(true);
    expect(off.loggedIn).toBe(true);
    expect(off.activeBase.save.gold).toBe(100);
    expect(await off.openBase(b.id)).toBe(true);
    play(off, 250);
    off.recordWave(3);
    off.earn(['wave3']);
    expect(offTimers.size).toBe(0);                    // no uploads queued
    expect(await off.flush()).toBe(false);             // "saved on this device"
    expect(mirror(device, b.id)).toMatchObject({ dirty: true });
    // No reward claims and no village changes offline.
    expect(off.unclaimed()).toEqual(expect.arrayContaining(['wave1', 'wave3']));
    expect(off.claim('wave1')).toBe(false);
    await expect(off.createBase('New')).rejects.toThrow(OFFLINE_CHANGE);
    await expect(off.renameBase(b.id, 'X')).rejects.toThrow(OFFLINE_CHANGE);
    await expect(off.deleteBase(b.id)).rejects.toThrow(OFFLINE_CHANGE);
    expect(off.backend.calls).toEqual(['currentUser']); // nothing was sent
    expect((await remote(b.id)).save.gold).toBe(100);
    // Back online: the same account logs in; the offline progress is a fast-forward and goes up.
    const on = tab();
    await on.signIn('ann@example.com', 'secret123');
    expect(on.baseById(b.id).save.gold).toBe(250);
    await on.flush();
    expect((await remote(b.id)).save.gold).toBe(250);
    expect((await on.backend.listAchievements()).map((a) => a.id).sort()).toEqual(['wave1', 'wave3']);
    expect(on.claim('wave3')).toBe(true);               // claims open up once synced
  });

  it('if the server copy changed meanwhile (another device), the server keeps it and the offline copy becomes a backup', async () => {
    const { b } = await annWithVillage();
    const off = new Session({ backend: unreachable(), storage: device, timers });
    off.startOffline();
    await off.openBase(b.id);
    play(off, 250);
    // Another device saves the village while this one is offline.
    const other = new Session({ backend: new LocalBackend(server), storage: memoryStorage(), timers });
    await other.signIn('ann@example.com', 'secret123');
    play(other, 900);
    await other.flush();
    const on = tab();
    await on.signIn('ann@example.com', 'secret123');
    expect(on.baseById(b.id).save.gold).toBe(900);
    expect(on.deviceVillages().find((v) => v.baseId === b.id).save.gold).toBe(250);
  });

  it('after Log Out, offline play no longer opens that account, and its email is forgotten', async () => {
    const { s } = await annWithVillage();
    device.setItem('ibtd.lastEmail', 'ann@example.com');
    await s.signOut();
    const off = new Session({ backend: unreachable(), storage: device, timers });
    expect(off.offlineAccount()).toBe(null);
    expect(off.startOffline()).toBe(false);             // offline play falls back to the browser's own save slot
    expect(device.getItem('ibtd.lastEmail')).toBe(null);
  });

  it('a village never copied to this device is not offered offline (it would overwrite the real one)', async () => {
    const { s, b } = await annWithVillage();
    const c = await s.createBase('Second');
    device.removeItem(`ibtd.cloud.${c.id}`);
    const off = new Session({ backend: unreachable(), storage: device, timers });
    off.startOffline();
    expect(off.bases.map((x) => x.id)).toEqual([b.id]);
  });

  it('Supabase errors: no connection or a server error read as "unreachable"; a saved login is not dropped for it', async () => {
    expect(friendlyError({ message: 'TypeError: Failed to fetch' }).network).toBe(true);
    expect(friendlyError({ message: 'upstream', status: 503 }).network).toBe(true);
    expect(friendlyError({ message: 'Invalid login credentials', status: 400 }).network).toBeFalsy();
    const be = new SupabaseBackend('https://example.invalid', 'anon-key');
    be.db = { auth: { getSession: async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' } }) } };
    await expect(be.currentUser()).rejects.toSatisfy(isNetworkError);
    be.db = { auth: { getSession: async () => ({ data: { session: null }, error: null }) } };
    expect(await be.currentUser()).toBe(null);
  });
});

// ---------------------------------------------------------------- 3. per-account device copies
describe('a shared device: device copies belong to one account', () => {
  it("another account never sees (or touches) Ann's unsent copy; Ann gets it at her next login", async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await ann.createBase('Home');
    ann.backend.updateBase = async () => { throw networkError(); }; // the upload never gets through
    play(ann, 444);
    await timers.runAll();
    await ann.signOut();
    const before = device.getItem(`ibtd.cloud.${b.id}`);
    expect(JSON.parse(before)).toMatchObject({ uid: expect.any(String), dirty: true });

    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    expect(bob.deviceVillages()).toEqual([]);             // not "Copy kept from another account"
    expect(bob.bases).toEqual([]);
    expect(bob.storage.getItem(SAVE_KEYS.save)).toBe(null);
    expect(bob.offlineAccount()).toMatchObject({ username: 'Bob' });
    await bob.createBase('Bob 1');
    play(bob, 5);
    await timers.runAll();
    await bob.signOut();
    expect(device.getItem(`ibtd.cloud.${b.id}`)).toBe(before); // untouched

    const back = tab();
    await back.signIn('ann@example.com', 'secret123');
    expect(back.baseById(b.id).save.gold).toBe(444);
    await back.flush();
    expect((await remote(b.id)).save.gold).toBe(444);
    expect(back.deviceVillages().some((v) => /Bob/.test(v.source))).toBe(false);
  });

  it('copies from before accounts were tagged, and the dev server’s own accounts, are not offered as another account’s villages', async () => {
    const s = new Session({ backend: new LocalBackend(device), storage: device, timers }); // the dev server: its accounts live on this device
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    device.setItem('ibtd.cloud.someone-elses', JSON.stringify({ save: saveOf(50), checkpoint: null, dirty: true }));
    await s.signOut();
    const bob = new Session({ backend: new LocalBackend(device), storage: device, timers });
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    expect(bob.deviceVillages()).toEqual([]);
  });

  it("an account's own unsent copy of a village deleted on another device is offered back to that account only", async () => {
    const ann = tab();
    await ann.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await ann.createBase('Home');
    ann.backend.updateBase = async () => { throw networkError(); };
    play(ann, 321);
    await timers.runAll();
    await ann.signOut();
    // Deleted from another device.
    const other = new Session({ backend: new LocalBackend(server), storage: memoryStorage(), timers });
    await other.signIn('ann@example.com', 'secret123');
    await other.deleteBase(b.id);
    const back = tab();
    await back.signIn('ann@example.com', 'secret123');
    expect(back.deviceVillages().map((v) => [v.key, v.save.gold])).toEqual([[`mirror:${b.id}`, 321]]);
    await back.signOut();
    const bob = tab();
    await bob.signUp('bob@example.com', 'secret456', 'Bob');
    expect(bob.deviceVillages()).toEqual([]);
  });
});

// ---------------------------------------------------------------- 4. merging without clocks
describe('an unsent device copy merges by server revision, not by clock', () => {
  async function setup() {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    const b = await s.createBase('Home');
    play(s, 100);
    await timers.runAll();
    return { s, b };
  }
  /** Leave an unsent change on the device (the tab closes before it uploads). */
  const unsent = (s, gold, savedAt) => { play(s, gold, { savedAt }); };
  /** Another device saves the village (the server moves to a new revision). */
  const elsewhere = async (gold, savedAt) => {
    const o = new Session({ backend: new LocalBackend(server), storage: memoryStorage(), timers });
    await o.signIn('ann@example.com', 'secret123');
    play(o, gold, { savedAt });
    await o.flush();
  };

  it('device clock far behind, but based on the current revision: the device copy wins (fast-forward)', async () => {
    const { s, b } = await setup();
    unsent(s, 222, '1999-01-01T00:00:00.000Z');
    const fresh = tab();
    await fresh.restore();
    expect(fresh.baseById(b.id).save.gold).toBe(222);
    expect(fresh.deviceVillages()).toEqual([]);
  });

  it('device clock far ahead, but the server moved on: the server copy stays, the device copy is a backup', async () => {
    const { s, b } = await setup();
    unsent(s, 222, '2099-01-01T00:00:00.000Z');
    await elsewhere(900, '2000-01-01T00:00:00.000Z');
    const fresh = tab();
    await fresh.restore();
    expect(fresh.baseById(b.id).save.gold).toBe(900);
    await timers.runAll();
    expect((await remote(b.id)).save.gold).toBe(900);
    const kept = fresh.deviceVillages().filter((v) => v.baseId === b.id);
    expect(kept.map((v) => v.save.gold)).toEqual([222]);
    expect(mirror(device, b.id)).toMatchObject({ dirty: false }); // the device copy now follows the server
  });

  it('the device copy records the revision it is based on and how many edits it holds', async () => {
    const { s, b } = await setup();
    const rev = s.baseById(b.id).serverRev;
    play(s, 1); play(s, 2); play(s, 3);
    expect(mirror(device, b.id)).toMatchObject({ base: rev, edits: 3, dirty: true });
    await timers.runAll();
    expect(mirror(device, b.id)).toMatchObject({ base: s.baseById(b.id).serverRev, edits: 0, dirty: false });
    expect(s.baseById(b.id).serverRev).not.toBe(rev);
  });

  it('copies from before revisions were kept: they win only if the server has nothing', async () => {
    const s = tab();
    await s.signUp('ann@example.com', 'secret123', 'Ann');
    const empty = await s.createBase('Empty');
    const full = await s.createBase('Full');
    s.selectBase(full.id);
    play(s, 100);
    await timers.runAll();
    await s.signOut();
    device.setItem(`ibtd.cloud.${empty.id}`, JSON.stringify({ save: saveOf(10), checkpoint: null, bestWave: 0, dirty: true }));
    device.setItem(`ibtd.cloud.${full.id}`, JSON.stringify({ save: saveOf(20), checkpoint: null, bestWave: 0, dirty: true }));
    const fresh = tab();
    await fresh.signIn('ann@example.com', 'secret123');
    expect(fresh.baseById(empty.id).save.gold).toBe(10);
    expect(fresh.baseById(full.id).save.gold).toBe(100);
    expect(fresh.deviceVillages().find((v) => v.baseId === full.id).save.gold).toBe(20);
  });
});
