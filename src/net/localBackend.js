// A stand-in for the Supabase backend that keeps everything in this browser's localStorage. Only used on
// the dev server (npm run dev) while src/backendConfig.js has no Supabase keys, or with ?backend=local,
// so accounts, villages, achievements and the leaderboard can be tried without a server.
// Not secure (anyone with the browser can read it) and never used in the built game.

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
    const u = { id: uuid(), email, username, password: await hash(password) };
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

  async updateBase(id, fields) {
    await wait();
    const d = this.db();
    const b = d.bases.find((x) => x.id === id && x.userId === this.userId);
    if (!b) throw new Error('That village no longer exists.');
    Object.assign(b, fields, { updatedAt: now() });
    this.write(d);
  }

  async deleteBase(id) {
    await wait();
    const d = this.db();
    d.bases = d.bases.filter((x) => !(x.id === id && x.userId === this.userId));
    this.write(d);
  }

  async getStats() {
    await wait();
    const s = this.db().stats.find((x) => x.userId === this.userId);
    return s ? { bestWave: s.bestWave, bestTownHall: s.bestTownHall, counters: { ...s.counters } } : { bestWave: 0, bestTownHall: 0, counters: {} };
  }

  async saveStats(stats) {
    await wait();
    const d = this.db();
    let s = d.stats.find((x) => x.userId === this.userId);
    if (!s) d.stats.push(s = { userId: this.userId, bestWave: 0, bestTownHall: 0, counters: {}, reachedAt: null });
    if (stats.bestWave > s.bestWave) { s.bestWave = stats.bestWave; s.reachedAt = now(); }
    s.bestTownHall = Math.max(s.bestTownHall, stats.bestTownHall);
    s.counters = { ...stats.counters };
    this.write(d);
  }

  async listAchievements() {
    await wait();
    return this.db().achievements.filter((a) => a.userId === this.userId).map(({ userId, ...a }) => ({ ...a })); // eslint-disable-line no-unused-vars
  }

  async earnAchievements(list) {
    await wait();
    const d = this.db();
    for (const a of list) {
      if (d.achievements.some((x) => x.userId === this.userId && x.id === a.id)) continue;
      d.achievements.push({ userId: this.userId, id: a.id, baseId: a.baseId || null, earnedAt: now(), claimedAt: null });
    }
    this.write(d);
  }

  async claimAchievement(id) {
    await wait();
    const d = this.db();
    const a = d.achievements.find((x) => x.userId === this.userId && x.id === id);
    if (a && !a.claimedAt) a.claimedAt = now();
    this.write(d);
  }

  async leaderboard(limit = 10) {
    await wait();
    const d = this.db();
    const rows = d.stats.filter((s) => s.bestWave > 0)
      .sort((a, b) => b.bestWave - a.bestWave || String(a.reachedAt).localeCompare(String(b.reachedAt)))
      .map((s, i) => {
        const u = d.users.find((x) => x.id === s.userId);
        return { rank: i + 1, username: u ? u.username : '?', bestWave: s.bestWave, bestTownHall: s.bestTownHall, isMe: s.userId === this.userId };
      });
    return rows.filter((r) => r.rank <= limit || r.isMe);
  }
}
