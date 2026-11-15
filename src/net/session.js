// The player's account while the game runs: who is logged in, their villages ("bases"), their stats
// (furthest wave, best Village Hall, counters for achievements) and their achievements.
//
// The game itself still saves through a plain Storage (getItem / setItem / removeItem). `session.storage`
// is that Storage: while a village is open, its save and checkpoint keys read and write that village
// (kept in memory, mirrored to localStorage so nothing is lost if the tab closes, and uploaded to the
// backend shortly after each change). Every other key (settings) goes straight to localStorage.
// With no village open it behaves exactly like localStorage (offline play).
import { parseSave } from '../logic/save.js';
import { COUNTERS, estimateBestWave } from '../logic/achievements.js';

export const MAX_BASES = 5;
export const BASE_NAME_MAX = 20;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;

/** What's wrong with a new password (at least PASSWORD_MIN characters, with a letter and a number), or ''. */
export function passwordProblem(pw) {
  const p = String(pw || '');
  if (p.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Password needs at least one letter and one number.';
  return '';
}

// Game save keys that belong to the open village.
const GAME_KEYS = { 'ibtd.save': 'save', 'ibtd.checkpoint': 'checkpoint' };
// Places this browser can hold a village from outside the account (see deviceVillages).
const LEGACY_SAVE = 'ibtd.save';
const LEGACY_CHECKPOINT = 'ibtd.checkpoint';
const LEGACY_BACKUP = 'ibtd.save.backup';
const LEGACY_CHECKPOINT_BACKUP = 'ibtd.checkpoint.backup';
const DEV_DB = 'ibtd.dev.db'; // LocalBackend's browser-only accounts (dev server before Supabase keys)
const MIRROR_PREFIX = 'ibtd.cloud.';
const importedKey = (uid) => `ibtd.imported.${uid}`; // fingerprints of villages this account imported
const UPLOAD_MS = 1500;  // a village uploads this long after its last change
const STATS_MS = 4000;   // stats / achievements upload this long after their last change
const RETRY_MS = [3000, 8000, 20000, 45000];
const mirrorKey = (id) => `ibtd.cloud.${id}`;
const lastBaseKey = (uid) => `ibtd.lastBase.${uid}`;
const outboxKey = (uid) => `ibtd.outbox.${uid}`;
const declinedKey = (uid) => `ibtd.legacyDeclined.${uid}`;

/** The next wave a save will fight (same rule as nightWaveNumber: waves cleared + 1). */
export function saveWave(save) {
  if (!save) return 0;
  return (save.wavesCleared || 0) + 1;
}

const emptyStats = () => ({ bestWave: 0, bestTownHall: 0, counters: {} });

/** Tells one saved village apart from another (and copies of the same one alike). */
export function villageFingerprint(save) {
  const bs = (save && save.buildings) || [];
  return `${save && save.savedAt}|${save && save.townHallLevel}|${bs.length}|${save && save.gold}`;
}

export class Session {
  /**
   * @param {object} o
   * @param {object|null} o.backend SupabaseBackend / LocalBackend (null: online play isn't set up)
   * @param {Storage|null} o.storage the device's localStorage
   */
  constructor({ backend = null, storage = null, timers = null } = {}) {
    this.backend = backend;
    this.local = storage;
    this.timers = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) };
    this.listeners = new Set();
    this.reset();
    const self = this;
    this.storage = {
      getItem(k) { return self.getItem(k); },
      setItem(k, v) { self.setItem(k, v); },
      removeItem(k) { self.removeItem(k); }
    };
  }

  reset() {
    this.user = null;
    this.bases = [];
    this.activeId = null;
    this.stats = emptyStats();
    this.achievements = new Map(); // id -> { earnedAt, claimedAt, baseId }
    this.outbox = { stats: false, earns: [], claims: [] };
    this.syncState = 'ok'; // 'ok' | 'saving' | 'offline' (see updateSync)
    this.outboxFailed = false;
    for (const t of [this.statsTimer, ...(this.bases || []).map((b) => b.timer)]) if (t) this.timers.clear(t);
    this.statsTimer = null;
    this.statsRetry = 0;
  }

  get configured() { return !!this.backend; }
  get loggedIn() { return !!this.user; }
  get activeBase() { return this.bases.find((b) => b.id === this.activeId) || null; }
  baseById(id) { return this.bases.find((b) => b.id === id) || null; }

  /** Called with no arguments whenever the account, villages, achievements or sync state change. */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error(e); } } }
  setSync(state) { if (this.syncState !== state) { this.syncState = state; this.changed(); } }

  /** 'offline' while any upload is failing, 'saving' while something waits to upload, else 'ok'. */
  updateSync() {
    const failing = this.outboxFailed || this.bases.some((b) => (b.retry || 0) > 0);
    const waiting = this.bases.some((b) => b.dirty) || this.hasOutbox();
    this.setSync(failing ? 'offline' : waiting ? 'saving' : 'ok');
  }

  // ---------- device storage (never throws) ----------
  lget(k) { try { return this.local ? this.local.getItem(k) : null; } catch { return null; } }
  lset(k, v) { try { if (this.local) this.local.setItem(k, v); } catch { /* full or blocked */ } }
  ldel(k) { try { if (this.local) this.local.removeItem(k); } catch { /* blocked */ } }
  ljson(k) { try { return JSON.parse(this.lget(k) || 'null'); } catch { return null; } }

  // ---------- the Storage the game saves through ----------
  /** A per-village copy of the other save-related keys (New Game backups), so villages never share them. */
  scopedKey(k) {
    return this.activeId && (k.startsWith('ibtd.save.') || k.startsWith('ibtd.checkpoint.')) ? `${k}.${this.activeId}` : k;
  }

  getItem(k) {
    const field = GAME_KEYS[k], b = this.activeBase;
    if (field && b) return b[field] ? JSON.stringify(b[field]) : null;
    return this.lget(this.scopedKey(k));
  }

  setItem(k, v) {
    const field = GAME_KEYS[k], b = this.activeBase;
    if (!(field && b)) { this.lset(this.scopedKey(k), v); return; }
    let obj;
    try { obj = JSON.parse(v); } catch { return; }
    this.writeBase(b, { [field]: obj });
  }

  removeItem(k) {
    const field = GAME_KEYS[k], b = this.activeBase;
    if (field && b) this.writeBase(b, { [field]: null });
    else this.ldel(this.scopedKey(k));
  }

  /**
   * A village's own progress counts: the waves it has cleared are at least its (and the account's) furthest
   * wave survived, so progress made offline, before tracking, or anywhere else carries over to the league
   * badge and the leaderboard. Only ever raises the numbers.
   */
  catchUpBestWave(b) {
    const n = estimateBestWave(b && b.save);
    if (!(n > 0)) return false;
    let changed = false;
    if (n > (b.bestWave || 0)) { b.bestWave = n; changed = true; }
    if (this.user && n > this.stats.bestWave) { this.stats.bestWave = n; this.statsChanged(); }
    return changed;
  }

  /** Change a village's save / checkpoint: mirror it on this device and upload it soon. */
  writeBase(b, fields) {
    Object.assign(b, fields);
    if (fields.save !== undefined && b.save) {
      b.townHall = b.save.townHallLevel || 0;
      b.wave = saveWave(b.save);
      this.catchUpBestWave(b);
    }
    b.rev = (b.rev || 0) + 1;
    b.dirty = true;
    this.writeMirror(b);
    this.scheduleUpload(b);
  }

  writeMirror(b) {
    this.lset(mirrorKey(b.id), JSON.stringify({ save: b.save, checkpoint: b.checkpoint, bestWave: b.bestWave || 0, dirty: !!b.dirty }));
  }

  scheduleUpload(b, ms = UPLOAD_MS) {
    if (!this.backend) return;
    if (b.timer) this.timers.clear(b.timer);
    b.timer = this.timers.set(() => { b.timer = null; this.uploadBase(b); }, ms);
  }

  async uploadBase(b) {
    if (!this.backend || !this.baseById(b.id)) return;
    if (b.uploading) { b.again = true; return; }
    b.uploading = true;
    const rev = b.rev;
    this.updateSync();
    try {
      await this.backend.updateBase(b.id, { save: b.save, checkpoint: b.checkpoint, townHall: b.townHall, wave: b.wave, bestWave: b.bestWave || 0 });
      b.retry = 0;
      if (b.rev === rev) { b.dirty = false; this.writeMirror(b); }
    } catch (e) {
      console.warn('Village upload failed', e);
      const delay = RETRY_MS[Math.min(b.retry || 0, RETRY_MS.length - 1)];
      b.retry = (b.retry || 0) + 1;
      if (this.baseById(b.id)) this.scheduleUpload(b, delay);
    } finally {
      this.updateSync();
      b.uploading = false;
      if (b.again) { b.again = false; this.scheduleUpload(b, 0); }
    }
  }

  /** Upload everything waiting right now (before logging out, leaving the page, or a manual Save). Never throws. */
  async flush() {
    if (!this.backend || !this.user) return true;
    const jobs = this.bases.filter((b) => b.dirty).map((b) => {
      if (b.timer) { this.timers.clear(b.timer); b.timer = null; }
      return this.uploadBase(b);
    });
    if (this.statsTimer) { this.timers.clear(this.statsTimer); this.statsTimer = null; }
    jobs.push(this.sendOutbox());
    await Promise.all(jobs);
    return !this.bases.some((b) => b.dirty) && !this.hasOutbox();
  }

  // ---------- logging in and out ----------
  /** Picks up a saved login (if any). Returns the user or null. */
  async restore() {
    if (!this.backend) return null;
    const user = await this.backend.currentUser();
    if (user) await this.loadAccount(user);
    return this.user;
  }

  async signIn(email, password, { captchaToken = null } = {}) {
    const r = await this.backend.signIn({ email: email.trim(), password, captchaToken });
    await this.loadAccount(r.user);
    return r;
  }

  /** Returns { user } or { needsConfirm: true } (the project still requires email confirmation). */
  async signUp(email, password, username, { captchaToken = null } = {}) {
    const r = await this.backend.signUp({ email: email.trim(), password, username: username.trim(), captchaToken });
    if (r.user) await this.loadAccount(r.user);
    return r;
  }

  async signOut() {
    try { await Promise.race([this.flush(), new Promise((r) => setTimeout(r, 4000))]); } catch { /* best effort */ }
    try { if (this.backend) await this.backend.signOut(); } catch { /* the local session is cleared below */ }
    this.reset();
    this.changed();
  }

  /** Fetch the account's villages, stats and achievements, and merge anything left on this device. */
  async loadAccount(user) {
    const [bases, stats, achievements] = await Promise.all([
      this.backend.listBases(), this.backend.getStats(), this.backend.listAchievements()
    ]);
    this.reset();
    this.user = user;
    this.bases = bases.map((b) => ({ ...b, rev: 0, dirty: false }));
    this.stats = { bestWave: stats.bestWave || 0, bestTownHall: stats.bestTownHall || 0, counters: { ...(stats.counters || {}) } };
    for (const a of achievements) this.achievements.set(a.id, { earnedAt: a.earnedAt, claimedAt: a.claimedAt, baseId: a.baseId });

    // A village saved on this device but never uploaded (tab closed, offline): keep the newer copy.
    for (const b of this.bases) {
      const m = this.ljson(mirrorKey(b.id));
      if (!m || !m.dirty || !m.save) continue;
      const mine = String(m.save.savedAt || ''), theirs = String((b.save && b.save.savedAt) || '');
      if (!b.save || mine > theirs) {
        this.writeBase(b, { save: m.save, checkpoint: m.checkpoint });
        b.bestWave = Math.max(b.bestWave || 0, m.bestWave || 0);
      }
    }
    // Stats, achievements and claims that didn't reach the server last time.
    const box = this.ljson(outboxKey(user.id));
    if (box) {
      if (box.stats) this.mergeStats(box.stats);
      for (const e of box.earns || []) if (!this.achievements.has(e.id)) { this.achievements.set(e.id, { earnedAt: e.at, claimedAt: null, baseId: e.baseId }); this.outbox.earns.push(e); }
      for (const id of box.claims || []) {
        const a = this.achievements.get(id);
        if (a && !a.claimedAt) { a.claimedAt = new Date().toISOString(); this.outbox.claims.push(id); }
      }
      if (box.stats) this.outbox.stats = true;
      this.queueOutbox();
    }

    // Villages further along than the account's records (played offline, before tracking ...): catch up.
    for (const b of this.bases) {
      if (this.catchUpBestWave(b)) { b.dirty = true; this.writeMirror(b); this.scheduleUpload(b); }
    }

    const last = this.lget(lastBaseKey(user.id));
    this.activeId = this.baseById(last) ? last : (this.bases[0] ? this.bases[0].id : null);
    this.changed();
  }

  // ---------- villages ----------
  selectBase(id) {
    if (!this.baseById(id)) return false;
    this.activeId = id;
    this.lset(lastBaseKey(this.user.id), id);
    this.changed();
    return true;
  }

  /** Make a village (empty: a new game; or from an existing save) and open it. */
  async createBase(name, { save = null, checkpoint = null, bestWave = 0 } = {}) {
    if (this.bases.length >= MAX_BASES) throw new Error(`You can have up to ${MAX_BASES} villages. Delete one first.`);
    const clean = String(name || '').trim().slice(0, BASE_NAME_MAX) || `Village ${this.bases.length + 1}`;
    const b = await this.backend.createBase({ name: clean, save, checkpoint, townHall: save ? save.townHallLevel || 0 : 0, wave: saveWave(save), bestWave });
    this.bases.push({ ...b, rev: 0, dirty: false });
    this.selectBase(b.id);
    return b;
  }

  /** Give a village a new name (trimmed, up to BASE_NAME_MAX characters). */
  async renameBase(id, name) {
    const b = this.baseById(id);
    if (!b) throw new Error('That village no longer exists.');
    const clean = String(name || '').trim().slice(0, BASE_NAME_MAX);
    if (!clean) throw new Error('Type a name first.');
    await this.backend.updateBase(id, { name: clean });
    b.name = clean;
    this.changed();
    return b;
  }

  async deleteBase(id) {
    await this.backend.deleteBase(id);
    const b = this.baseById(id);
    if (b && b.timer) this.timers.clear(b.timer);
    this.bases = this.bases.filter((x) => x.id !== id);
    this.ldel(mirrorKey(id));
    if (this.activeId === id) {
      this.activeId = this.bases[0] ? this.bases[0].id : null;
      if (this.activeId) this.lset(lastBaseKey(this.user.id), this.activeId);
      else this.ldel(lastBaseKey(this.user.id));
    }
    this.changed();
  }

  /** Close the open village (the game's Storage goes back to plain localStorage). */
  closeBase() { this.activeId = null; }

  // ---------- villages saved in this browser outside the account ----------
  /**
   * Every valid village this browser holds that this account hasn't imported yet, newest first:
   * [{ key, source, name, save, checkpoint }]. It looks in the pre-account save slot, the backup New Game
   * makes, accounts kept in the browser by the dev server before Supabase was set up, and device copies
   * of other accounts' villages. Read straight from the device, never the open village.
   */
  deviceVillages() {
    const parse = (v) => {
      const r = parseSave(typeof v === 'string' || v === null || v === undefined ? v : JSON.stringify(v));
      return r.status === 'ok' ? r.data : null;
    };
    const found = [];
    const add = (key, source, name, save, checkpoint) => {
      const s = parse(save);
      if (s) found.push({ key, source, name, save: s, checkpoint: parse(checkpoint) });
    };
    add('save', 'Saved in this browser', 'My Village', this.lget(LEGACY_SAVE), this.lget(LEGACY_CHECKPOINT));
    add('backup', 'Backup from a New Game', 'Old Village', this.lget(LEGACY_BACKUP), this.lget(LEGACY_CHECKPOINT_BACKUP));
    const db = this.ljson(DEV_DB);
    if (db && Array.isArray(db.bases)) {
      for (const b of db.bases) {
        if (this.baseById(b.id)) continue; // this account's own village (dev mode keeps them here)
        const owner = Array.isArray(db.users) ? db.users.find((u) => u.id === b.userId) : null;
        add(`dev:${b.id}`, `Browser-only account${owner ? ` “${owner.username}”` : ''}`, b.name || 'My Village', b.save, b.checkpoint);
      }
    }
    for (const k of this.localKeys()) {
      if (!k.startsWith(MIRROR_PREFIX)) continue;
      const id = k.slice(MIRROR_PREFIX.length);
      if (this.baseById(id)) continue; // one of this account's own villages
      const m = this.ljson(k);
      if (m) add(`mirror:${id}`, 'Copy kept from another account', 'My Village', m.save, m.checkpoint);
    }
    // Drop repeats and anything this account already imported.
    const done = new Set(this.user ? this.ljson(importedKey(this.user.id)) || [] : []);
    const seen = new Set();
    return found.filter((v) => {
      const fp = villageFingerprint(v.save);
      if (seen.has(fp) || done.has(fp)) return false;
      seen.add(fp);
      return true;
    }).sort((a, b) => String(b.save.savedAt || '').localeCompare(String(a.save.savedAt || '')));
  }

  /** Every key in the device storage (empty if it can't be listed). */
  localKeys() {
    try {
      if (!this.local || typeof this.local.length !== 'number' || !this.local.key) return [];
      const out = [];
      for (let i = 0; i < this.local.length; i++) out.push(this.local.key(i));
      return out;
    } catch { return []; }
  }

  /** The newest village this browser holds that this account hasn't imported (for the first-login offer), or null. */
  legacyVillage() {
    return this.deviceVillages()[0] || null;
  }

  /** Has this account already said "start fresh" to the import offer? */
  get legacyDeclined() { return !!(this.user && this.lget(declinedKey(this.user.id))); }
  declineLegacy() { if (this.user) this.lset(declinedKey(this.user.id), '1'); }

  /**
   * Copy a village from this browser (deviceVillages; `key` picks one, else the newest) into a new village on
   * this account. The original stays where it was; this account won't be offered it again.
   */
  async importLegacy(name = 'My Village', key = null) {
    const list = this.deviceVillages();
    const v = key ? list.find((x) => x.key === key) : list[0];
    if (!v) throw new Error('There is no village in this browser to import.');
    const bestWave = estimateBestWave(v.save);
    const b = await this.createBase(name, { save: v.save, checkpoint: v.checkpoint, bestWave });
    const done = this.ljson(importedKey(this.user.id)) || [];
    this.lset(importedKey(this.user.id), JSON.stringify([...done, villageFingerprint(v.save)]));
    this.recordTownHall(v.save.townHallLevel || 0);
    this.recordWave(bestWave);
    return b;
  }

  // ---------- stats ----------
  bump(counter, n = 1) {
    if (!this.user || !COUNTERS.includes(counter) || !(n > 0)) return;
    this.stats.counters[counter] = (this.stats.counters[counter] || 0) + n;
    this.statsChanged();
  }

  /** A wave was survived in the open village: furthest wave for the leaderboard. */
  recordWave(n) {
    if (!this.user || !(n > 0)) return;
    const b = this.activeBase;
    if (b && n > (b.bestWave || 0)) { b.bestWave = n; b.dirty = true; this.writeMirror(b); this.scheduleUpload(b); }
    if (n > this.stats.bestWave) { this.stats.bestWave = n; this.statsChanged(); }
  }

  recordTownHall(level) {
    if (!this.user || !(level > this.stats.bestTownHall)) return;
    this.stats.bestTownHall = level;
    this.statsChanged();
  }

  mergeStats(s) {
    this.stats.bestWave = Math.max(this.stats.bestWave, s.bestWave || 0);
    this.stats.bestTownHall = Math.max(this.stats.bestTownHall, s.bestTownHall || 0);
    for (const k of COUNTERS) {
      const v = s.counters && s.counters[k];
      if (Number.isFinite(v)) this.stats.counters[k] = Math.max(this.stats.counters[k] || 0, v);
    }
  }

  statsChanged() {
    this.outbox.stats = true;
    this.queueOutbox();
  }

  // ---------- achievements ----------
  earnedIds() { return new Set(this.achievements.keys()); }
  unclaimed() { return [...this.achievements.entries()].filter(([, a]) => !a.claimedAt).map(([id]) => id); }

  /** Mark achievements earned (in the open village). */
  earn(ids) {
    if (!this.user) return;
    const at = new Date().toISOString(), baseId = this.activeId;
    for (const id of ids) {
      if (this.achievements.has(id)) continue;
      this.achievements.set(id, { earnedAt: at, claimedAt: null, baseId });
      this.outbox.earns.push({ id, baseId, at });
    }
    this.queueOutbox();
    this.changed();
  }

  /** Mark an achievement's reward as taken (the caller has already paid it into the village). */
  claim(id) {
    const a = this.achievements.get(id);
    if (!a || a.claimedAt) return false;
    a.claimedAt = new Date().toISOString();
    this.outbox.claims.push(id);
    this.queueOutbox(0);
    this.changed();
    return true;
  }

  // ---------- sending stats / achievements ----------
  hasOutbox() { return this.outbox.stats || this.outbox.earns.length > 0 || this.outbox.claims.length > 0; }

  /** Keep what's waiting on this device too, and send it soon. */
  queueOutbox(ms = STATS_MS) {
    if (!this.user) return;
    this.lset(outboxKey(this.user.id), JSON.stringify({ stats: this.outbox.stats ? this.stats : null, earns: this.outbox.earns, claims: this.outbox.claims }));
    if (!this.backend) return;
    if (this.statsTimer) this.timers.clear(this.statsTimer);
    this.statsTimer = this.timers.set(() => { this.statsTimer = null; this.sendOutbox(); }, ms);
  }

  async sendOutbox() {
    if (!this.backend || !this.user || !this.hasOutbox()) return;
    if (this.sending) { this.sendAgain = true; return; }
    this.sending = true;
    const uid = this.user.id;
    const box = { stats: this.outbox.stats, earns: [...this.outbox.earns], claims: [...this.outbox.claims] };
    this.outbox = { stats: false, earns: [], claims: [] };
    try {
      if (box.stats) await Promise.all(this.bases.filter((x) => x.dirty).map((x) => this.uploadBase(x)));
      if (box.earns.length) await this.backend.earnAchievements(box.earns);
      for (const id of box.claims) await this.backend.claimAchievement(id);
      if (box.stats) await this.backend.saveStats(this.stats);
      this.statsRetry = 0;
      this.outboxFailed = false;
      if (this.user && this.user.id === uid && !this.hasOutbox()) this.ldel(outboxKey(uid));
      this.updateSync();
    } catch (e) {
      console.warn('Stats upload failed', e);
      if (!this.user || this.user.id !== uid) return;
      // Put it back (in front of anything newer) and try again later.
      this.outbox = {
        stats: box.stats || this.outbox.stats,
        earns: [...box.earns, ...this.outbox.earns],
        claims: [...box.claims, ...this.outbox.claims]
      };
      this.outboxFailed = true;
      this.updateSync();
      this.queueOutbox(RETRY_MS[Math.min(this.statsRetry++, RETRY_MS.length - 1)]);
    } finally {
      this.sending = false;
      if (this.sendAgain) { this.sendAgain = false; this.sendOutbox(); }
    }
  }
}
