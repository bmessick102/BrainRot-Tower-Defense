import { describe, it, expect, beforeEach } from 'vitest';
import { Session, MAX_BASES, saveWave } from '../src/net/session.js';
import { LocalBackend } from '../src/net/localBackend.js';
import { serializeGame, loadGame, writeGame, SAVE_KEYS } from '../src/logic/save.js';
import { makeStateWithTownHall } from './helpers.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
}

/** Timers that only run when told to (so uploads happen exactly when a test says). */
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

const village = (th = 3, gold = 500) => serializeGame(makeStateWithTownHall({ gold, wavesCleared: 2, tutorialStep: 11, tutorialDone: true }, th));

describe('Session (accounts, villages, sync)', () => {
  let device, backend, timers, session;
  const make = () => new Session({ backend, storage: device, timers });

  beforeEach(async () => {
    device = memoryStorage();            // this browser's localStorage
    backend = new LocalBackend(memoryStorage()); // "the server" (its own storage)
    timers = manualTimers();
    session = make();
    await session.signUp('ann@example.com', 'secret1', 'Ann');
  });

  it('signs up into an empty account, logs out, and logs back in', async () => {
    expect(session.user.username).toBe('Ann');
    expect(session.bases).toEqual([]);
    expect(session.activeBase).toBe(null);
    await session.signOut();
    expect(session.loggedIn).toBe(false);
    await expect(session.signIn('ann@example.com', 'wrong!')).rejects.toThrow(/Wrong email or password/);
    await session.signIn('ann@example.com', 'secret1');
    expect(session.user.username).toBe('Ann');
  });

  it('with no village open, the game storage is plain device storage', () => {
    session.storage.setItem('ibtd.settings', '{"music":0.5}');
    expect(device.getItem('ibtd.settings')).toBe('{"music":0.5}');
    session.storage.setItem(SAVE_KEYS.save, 'x');
    expect(device.getItem(SAVE_KEYS.save)).toBe('x');
  });

  it('a village saves into itself, is mirrored on the device, and uploads', async () => {
    const b = await session.createBase('Home');
    expect(session.activeId).toBe(b.id);
    const state = makeStateWithTownHall({ gold: 777, wavesCleared: 1, tutorialStep: 11, tutorialDone: true }, 4);
    writeGame(session.storage, state);
    expect(device.getItem(SAVE_KEYS.save)).toBe(null);            // not the old shared slot
    expect(loadGame(session.storage).data.gold).toBe(777);
    expect(session.activeBase.townHall).toBe(4);
    expect(session.activeBase.wave).toBe(saveWave(session.activeBase.save));
    expect(JSON.parse(device.getItem(`ibtd.cloud.${b.id}`)).dirty).toBe(true);
    expect(timers.size).toBe(1);
    await timers.runAll();
    const [remote] = await backend.listBases();
    expect(remote.save.gold).toBe(777);
    expect(remote.townHall).toBe(4);
    expect(JSON.parse(device.getItem(`ibtd.cloud.${b.id}`)).dirty).toBe(false);
  });

  it('each village keeps its own save and checkpoint', async () => {
    const a = await session.createBase('A');
    session.storage.setItem(SAVE_KEYS.save, JSON.stringify(village(2, 100)));
    const b = await session.createBase('B');
    expect(session.storage.getItem(SAVE_KEYS.save)).toBe(null);
    session.storage.setItem(SAVE_KEYS.save, JSON.stringify(village(5, 900)));
    session.selectBase(a.id);
    expect(loadGame(session.storage).data.gold).toBe(100);
    session.selectBase(b.id);
    expect(loadGame(session.storage).data.gold).toBe(900);
  });

  it('a change that never reached the server is recovered from the device on the next login', async () => {
    const b = await session.createBase('Home');
    session.storage.setItem(SAVE_KEYS.save, JSON.stringify({ ...village(3, 111), savedAt: '2026-01-01T00:00:00.000Z' }));
    await timers.runAll();
    // Later change, then the tab closes before it uploads.
    session.storage.setItem(SAVE_KEYS.save, JSON.stringify({ ...village(6, 222), savedAt: '2026-01-02T00:00:00.000Z' }));
    const fresh = make();
    await fresh.restore();
    expect(fresh.baseById(b.id).save.gold).toBe(222);
    await timers.runAll();
    expect((await backend.listBases())[0].save.gold).toBe(222);
  });

  it('remembers the last played village per account', async () => {
    await session.createBase('A');
    const b = await session.createBase('B');
    const fresh = make();
    await fresh.restore();
    expect(fresh.activeId).toBe(b.id);
  });

  it('deletes a village (and its device copy); the next one becomes current', async () => {
    const a = await session.createBase('A');
    const b = await session.createBase('B');
    session.storage.setItem(SAVE_KEYS.save, JSON.stringify(village()));
    await session.deleteBase(b.id);
    expect(session.bases.map((x) => x.id)).toEqual([a.id]);
    expect(session.activeId).toBe(a.id);
    expect(device.getItem(`ibtd.cloud.${b.id}`)).toBe(null);
    expect((await backend.listBases()).length).toBe(1);
  });

  it(`allows at most ${MAX_BASES} villages`, async () => {
    for (let i = 0; i < MAX_BASES; i++) await session.createBase(`V${i}`);
    await expect(session.createBase('one too many')).rejects.toThrow(/up to 5/);
  });

  it('imports the village this browser saved before accounts, once', async () => {
    const old = village(6, 1234);
    device.setItem(SAVE_KEYS.save, JSON.stringify(old));
    device.setItem(SAVE_KEYS.checkpoint, JSON.stringify(old));
    expect(session.legacyVillage().save.gold).toBe(1234);
    const b = await session.importLegacy('My Village');
    expect(session.activeId).toBe(b.id);
    expect(loadGame(session.storage).data.gold).toBe(1234);
    expect(device.getItem(SAVE_KEYS.save)).not.toBe(null);   // the original stays on the device
    expect(session.legacyVillage()).toBe(null);              // but isn't offered again
    expect(session.stats.bestTownHall).toBe(6);
    expect(session.stats.bestWave).toBe(5);
  });

  it('stats keep their best, and earned / claimed achievements reach the server', async () => {
    await session.createBase('Home');
    session.recordWave(4);
    session.recordWave(2);
    session.bump('kills', 3);
    session.bump('nonsense', 3);
    expect(session.stats.bestWave).toBe(4);
    expect(session.activeBase.bestWave).toBe(4);
    session.earn(['wave1']);
    expect(session.unclaimed()).toEqual(['wave1']);
    expect(session.claim('wave1')).toBe(true);
    expect(session.claim('wave1')).toBe(false);              // only once
    await session.flush();
    const s = await backend.getStats();
    expect(s.bestWave).toBe(4);
    expect(s.counters).toEqual({ kills: 3 });
    const [a] = await backend.listAchievements();
    expect(a.id).toBe('wave1');
    expect(a.claimedAt).toBeTruthy();
    const board = await backend.leaderboard();
    expect(board[0]).toMatchObject({ rank: 1, username: 'Ann', bestWave: 4, isMe: true });
  });

  it('stats and claims made offline are kept on the device and sent at the next login', async () => {
    await session.createBase('Home');
    session.earn(['wave1']);
    await session.flush();
    const realSave = backend.saveStats.bind(backend), realClaim = backend.claimAchievement.bind(backend);
    backend.saveStats = async () => { throw new Error('offline'); };
    backend.claimAchievement = async () => { throw new Error('offline'); };
    session.recordWave(7);
    session.claim('wave1');
    await session.flush();
    expect(session.syncState).toBe('offline');
    backend.saveStats = realSave;
    backend.claimAchievement = realClaim;
    const fresh = make();
    await fresh.restore();
    expect(fresh.stats.bestWave).toBe(7);
    expect(fresh.unclaimed()).toEqual([]);
    await fresh.flush();
    expect((await backend.getStats()).bestWave).toBe(7);
    expect((await backend.listAchievements())[0].claimedAt).toBeTruthy();
  });

  it('accounts never see each other’s villages', async () => {
    await session.createBase('Ann’s');
    await session.signOut();
    const bob = make();
    await bob.signUp('bob@example.com', 'secret2', 'Bob');
    expect(bob.bases).toEqual([]);
    await expect(bob.signUp('ann@example.com', 'x123456', 'Ann2')).rejects.toThrow(/already has an account/);
    expect(await backend.usernameAvailable('ann')).toBe(false); // names are unique ignoring case
  });
});
