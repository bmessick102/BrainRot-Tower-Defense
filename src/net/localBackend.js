// A stand-in for the Supabase backend that keeps everything in this browser's localStorage. Only used on
// the dev server (npm run dev) while src/backendConfig.js has no Supabase keys, or with ?backend=local,
// so accounts, villages, achievements and the leaderboard can be tried without a server.
// Not secure (anyone with the browser can read it) and never used in the built game.

import { mergeVillageCounters } from '../logic/achievements.js';
import { conflictError, sessionReplacedError } from './errors.js';
import { boardPage } from './paging.js';

const DB_KEY = 'ibtd.dev.db';
const SESSION_KEY = 'ibtd.dev.session';
const DELAY_MS = 120; // feel a little like a network call
const MAX_BASES = 5;

const wait = () => new Promise((r) => setTimeout(r, DELAY_MS));
const uuid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const now = () => new Date().toISOString();

async function hash(text) {
  if (!(globalThis.crypto && crypto.subtle)) return `plain:${text}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ibtd-dev:${text}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class LocalBackend {
  constructor(storage) {
    this.kind = 'local';
    this.storage = storage;
    this.userId = null;
  }

  db() {
    try {
      const d = JSON.parse(this.storage.getItem(DB_KEY) || 'null');
      if (d && d.users) return d;
    } catch { /* start over */ }
    return { users: [], bases: [], stats: [], achievements: [] };
  }

  write(d) { this.storage.setItem(DB_KEY, JSON.stringify(d)); }

  me(d) {
    const u = d.users.find((x) => x.id === this.userId);
    if (!u) throw new Error('Your login expired. Log in again.');
    return u;
  }

  async currentUser() {
    await wait();
    const id = this.storage.getItem(SESSION_KEY);
    const u = id && this.db().users.find((x) => x.id === id);
    if (!u) return null;
    this.userId = u.id;
    return { id: u.id, email: u.email, username: u.username };
  }

  async usernameAvailable(name) {
    await wait();
    return !this.db().users.some((u) => u.username.toLowerCase() === String(name).toLowerCase());
  }

  async signUp({ email, password, username }) {
    await wait();
    const d = this.db();
    if (d.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error('That email already has an account. Log in instead.');
    if (d.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) throw new Error('That username is taken or not allowed.');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) throw new Error('Password must be at least 8 characters, with a letter and a number.');
    const u = { id: uuid(), email, username, password: await hash(password), createdAt: now(), publicBases: true };
    d.users.push(u);
    d.stats.push({ userId: u.id, bestWave: 0, bestTownHall: 0, counters: {}, reachedAt: null });
    this.write(d);
    this.storage.setItem(SESSION_KEY, u.id);
    this.userId = u.id;
    return { user: { id: u.id, email: u.email, username: u.username } };
  }

  async signIn({ email, password }) {
    await wait();
    const u = this.db().users.find((x) => x.email.toLowerCase() === String(email).toLowerCase());
    if (!u || u.password !== await hash(password)) throw new Error('Wrong email or password.');
    this.storage.setItem(SESSION_KEY, u.id);
    this.userId = u.id;
    return { user: { id: u.id, email: u.email, username: u.username } };
  }

  async resendConfirmation() { await wait(); } // nothing to confirm in the browser-only accounts

  async signOut() {
    await wait();
    this.storage.removeItem(SESSION_KEY);
    this.userId = null;
  }

  async listBases() {
    await wait();
    const d = this.db();
    this.me(d);
    return d.bases.filter((b) => b.userId === this.userId).map(({ userId, ...b }) => ({ ...b })); // eslint-disable-line no-unused-vars
  }

  async createBase(fields) {
    await wait();
    const d = this.db();
    this.me(d);
    if (d.bases.filter((b) => b.userId === this.userId).length >= MAX_BASES) throw new Error('You already have the most villages allowed.');
    const b = {
      id: uuid(), userId: this.userId, name: fields.name, save: fields.save ?? null, checkpoint: fields.checkpoint ?? null,
      townHall: fields.townHall ?? 0, wave: fields.wave ?? 1, bestWave: fields.bestWave ?? 0, createdAt: now(), updatedAt: now()
    };
    d.bases.push(b);
    this.write(d);
    const { userId, ...out } = b; // eslint-disable-line no-unused-vars
    return out;
  }

  /**
   * Like SupabaseBackend.updateBase: `updatedAt` is the village's revision (it moves only when the save or
   * checkpoint changes, always forward); with `expected`, a stale change is refused with a conflict error.
   */
  async updateBase(id, fields, { expected = null, session = null } = {}) {
    await wait();
    const d = this.db();
    const b = d.bases.find((x) => x.id === id && x.userId === this.userId);
    if (!b) throw new Error('That village no longer exists.');
    // One device at a time (v0.15.4): a save from a device that isn't the account's any more is refused, like the
    // database's bases_session trigger. (A call without a device id stands for the server itself, as in the tests.)
    const owner = d.users.find((u) => u.id === this.userId);
    if (session && owner && owner.activeSession && owner.activeSession !== session) throw sessionReplacedError();
    if (expected && b.updatedAt !== expected) throw conflictError(b.updatedAt);
    const same = (k) => fields[k] === undefined || JSON.stringify(fields[k] ?? null) === JSON.stringify(b[k] ?? null);
    const content = !same('save') || !same('checkpoint');
    const { updatedAt, userId, id: _id, ...rest } = fields; // eslint-disable-line no-unused-vars
    const before = b.bestWave || 0;
    Object.assign(b, rest);
    if ((b.bestWave || 0) > before) b.bestWaveAt = now(); // when the best wave last went up (earlier wins leaderboard ties)
    if (content) b.updatedAt = new Date(Math.max(Date.now(), (Date.parse(b.updatedAt) || 0) + 1)).toISOString();
    this.write(d);
    return { updatedAt: b.updatedAt };
  }

  /** Like SupabaseBackend.claimSession: this device becomes the account's one device (the newest login wins). */
  async claimSession(session) {
    await wait();
    const d = this.db();
    this.me(d).activeSession = session;
    this.write(d);
    return true;
  }

  /** Is `session` still the account's device? */
  async sessionActive(session) {
    await wait();
    const u = this.db().users.find((x) => x.id === this.userId);
    return !u || !u.activeSession || u.activeSession === session;
  }

  async deleteBase(id) {
    await wait();
    const d = this.db();
    this.me(d);
    d.bases = d.bases.filter((x) => !(x.id === id && x.userId === this.userId));
    for (const award of d.achievements) if (award.userId === this.userId && award.baseId === id) award.baseId = null;
    const stats = d.stats.find((row) => row.userId === this.userId);
    if (stats?.villageCounters) delete stats.villageCounters[id];
    this.write(d);
  }

  async getStats() {
    await wait();
    const d = this.db();
    this.me(d);
    const s = d.stats.find((x) => x.userId === this.userId);
    return s ? { bestWave: s.bestWave, bestTownHall: s.bestTownHall, counters: { ...s.counters }, villageCounters: s.villageCounters || {} }
      : { bestWave: 0, bestTownHall: 0, counters: {}, villageCounters: {} };
  }

  async saveStats(stats) {
    await wait();
    const d = this.db();
    this.me(d);
    let s = d.stats.find((x) => x.userId === this.userId);
    if (!s) d.stats.push(s = { userId: this.userId, bestWave: 0, bestTownHall: 0, counters: {}, reachedAt: null });
    if (stats.bestWave > s.bestWave) { s.bestWave = stats.bestWave; s.reachedAt = now(); }
    s.bestTownHall = Math.max(s.bestTownHall, stats.bestTownHall);
    s.counters = { ...stats.counters };
    const owned = Object.fromEntries(d.bases.filter((base) => base.userId === this.userId)
      .map((base) => [base.id, stats.villageCounters?.[base.id]]));
    s.villageCounters = mergeVillageCounters(s.villageCounters, owned);
    this.write(d);
    return { bestWave: s.bestWave };
  }

  async listAchievements() {
    await wait();
    const d = this.db();
    this.me(d);
    return d.achievements.filter((a) => a.userId === this.userId).map(({ userId, ...a }) => ({ ...a })); // eslint-disable-line no-unused-vars
  }

  async earnAchievements(list) {
    await wait();
    const d = this.db();
    this.me(d);
    for (const a of list) {
      if (!d.bases.some((base) => base.userId === this.userId && base.id === a.baseId)) continue;
      if (d.achievements.some((x) => x.userId === this.userId && x.baseId === a.baseId && x.id === a.id)) continue;
      d.achievements.push({ userId: this.userId, id: a.id, baseId: a.baseId, earnedAt: now(), claimedAt: null });
    }
    this.write(d);
  }

  async claimAchievement(id, baseId) {
    await wait();
    const d = this.db();
    this.me(d);
    const a = d.achievements.find((x) => x.userId === this.userId && x.baseId === baseId && x.id === id);
    if (a && !a.claimedAt) a.claimedAt = now();
    this.write(d);
  }

  /** Villages in leaderboard order: best wave first, then who got there first. Only ones on the board unless `all`. */
  villageOrder(d, all = false) {
    return d.bases.filter((b) => all || b.bestWave > 0).sort((a, b) => (b.bestWave || 0) - (a.bestWave || 0)
      || String(a.bestWaveAt || a.updatedAt).localeCompare(String(b.bestWaveAt || b.updatedAt)) || String(a.id).localeCompare(String(b.id)));
  }

  async leaderboard(limit = 10) {
    await wait();
    const d = this.db();
    // One row per village (like get_village_leaderboard): best wave first, then who got there first.
    const bases = this.villageOrder(d);
    const seen = new Set();
    const rows = bases.map((b, i) => {
      const u = d.users.find((x) => x.id === b.userId);
      const isMe = b.userId === this.userId, first = !seen.has(b.userId);
      seen.add(b.userId);
      const hidden = u && u.publicBases === false && !isMe;
      return {
        rank: i + 1, username: u ? u.username : '?', villageName: hidden ? null : b.name, bestWave: b.bestWave, bestTownHall: b.townHall || 0,
        isMe, first, baseId: hidden ? null : b.id
      };
    });
    return rows.filter((r) => r.rank <= limit || (r.isMe && r.first)).map(({ first, ...r }) => r); // eslint-disable-line no-unused-vars
  }

  /** One leaderboard page, like SupabaseBackend.leaderboardPage: { rows, mine, hasMore } (rows carry `pos`). */
  async leaderboardPage(offset = 0, limit = 10) {
    const all = await this.leaderboard(Infinity); // every village, in board order (rank here is the place)
    const n = offset + limit + 1;
    const rows = all.map((r) => ({ ...r, pos: r.rank })).filter((r) => (r.pos > offset && r.pos <= n) || r.isMe);
    return boardPage(rows, offset, limit);
  }

  // ---------- other players (v0.7): search, player cards, visiting villages ----------
  /** Players matching the search: [{ username, bestWave, bestTownHall, achievements, isMe }] (like search_players). */
  async searchPlayers({ query = '', minWave = 0, maxWave = null, townHall = null, sort = 'wave', limit = 30, offset = 0 } = {}) {
    await wait();
    const d = this.db();
    this.me(d);
    const q = String(query || '').trim().toLowerCase();
    const rows = d.users.map((u) => {
      const s = d.stats.find((x) => x.userId === u.id) || { bestWave: 0, bestTownHall: 0 };
      // v0.8.5, like search_players: the player's villages' numbers (the all-time stats only with no villages).
      const own = d.bases.filter((b) => b.userId === u.id);
      const bestWave = own.length ? Math.max(...own.map((b) => b.bestWave || 0)) : s.bestWave;
      const bestTownHall = own.length ? Math.max(...own.map((b) => b.townHall || 0)) : s.bestTownHall;
      return { username: u.username, bestWave, bestTownHall, achievements: d.achievements.filter((a) => a.userId === u.id).length, isMe: u.id === this.userId };
    }).filter((r) => (!q || r.username.toLowerCase().includes(q)) && r.bestWave >= (minWave || 0)
      && (maxWave == null || r.bestWave <= maxWave) && (townHall == null || r.bestTownHall === townHall));
    const key = sort === 'hall' ? 'bestTownHall' : sort === 'achievements' ? 'achievements' : 'bestWave';
    rows.sort((a, b) => b[key] - a[key] || b.bestWave - a.bestWave || a.username.localeCompare(b.username));
    const skip = Math.max(0, Math.min(10000, offset || 0));
    return rows.slice(skip, skip + Math.max(1, Math.min(50, limit)));
  }

  /** A player's card, or null: stats, rank, achievements, and their villages (best first) unless they hide them. */
  async playerProfile(username) {
    await wait();
    const d = this.db();
    this.me(d);
    const u = d.users.find((x) => x.username.toLowerCase() === String(username).toLowerCase());
    if (!u) return null;
    const s = d.stats.find((x) => x.userId === u.id) || { bestWave: 0, bestTownHall: 0 };
    const isMe = u.id === this.userId, open = u.publicBases !== false;
    // v0.8.5, like get_player_profile: ranks and numbers in village-leaderboard terms.
    const rankOf = new Map(this.villageOrder(d).map((b, i) => [b.id, i + 1]));
    const own = this.villageOrder(d, true).filter((b) => b.userId === u.id);
    return {
      username: u.username, joinedAt: u.createdAt || null, publicBases: open, isMe,
      bestWave: own.length ? Math.max(...own.map((b) => b.bestWave || 0)) : s.bestWave,
      bestTownHall: own.length ? Math.max(...own.map((b) => b.townHall || 0)) : s.bestTownHall,
      rank: own.map((b) => rankOf.get(b.id)).filter(Boolean)[0] || null,
      achievements: open || isMe ? d.achievements.filter((a) => a.userId === u.id && own.some((b) => b.id === a.baseId && b.save))
        .map((a) => ({ id: a.id, baseId: a.baseId, earnedAt: a.earnedAt })) : [],
      bases: open || isMe ? own.filter((b) => b.save)
        .map((b) => ({ id: b.id, name: b.name, townHall: b.townHall, bestWave: b.bestWave, wave: b.wave, rank: rankOf.get(b.id) || null })) : []
    };
  }

  /** One village to look at: { id, name, username, townHall, bestWave, save }; refused if its owner hides them. */
  async playerBase(id) {
    await wait();
    const d = this.db();
    this.me(d);
    const b = d.bases.find((x) => x.id === id);
    const u = b && d.users.find((x) => x.id === b.userId);
    if (!b || !u || (u.publicBases === false && u.id !== this.userId)) throw new Error('That village can’t be viewed.');
    return { id: b.id, name: b.name, username: u.username, townHall: b.townHall, bestWave: b.bestWave, save: b.save };
  }

  /** Whether others can view your villages (Settings). */
  async getPublicBases() {
    await wait();
    return this.me(this.db()).publicBases !== false;
  }

  async setPublicBases(on) {
    await wait();
    const d = this.db();
    this.me(d).publicBases = !!on;
    this.write(d);
  }
}
