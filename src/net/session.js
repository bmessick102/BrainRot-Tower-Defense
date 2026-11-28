// The player's account while the game runs: who is logged in, their villages ("bases"), their stats
// (furthest wave, best Village Hall, counters for achievements) and their achievements.
//
// The game itself still saves through a plain Storage (getItem / setItem / removeItem). `session.storage`
// is that Storage: while a village is open, its save and checkpoint keys read and write that village
// (kept in memory, mirrored to localStorage so nothing is lost if the tab closes, and uploaded to the
// backend shortly after each change). Every other key (settings) goes straight to localStorage.
// With no village open it behaves exactly like localStorage (offline play).
//
// Keeping two copies of a village from overwriting each other:
// - Revisions, not clocks. Each village on the server has a revision (`updatedAt`, moved forward by the server
//   whenever its save changes). An upload only applies on top of the revision this tab loaded or last saved;
//   if another tab or device saved in between, the server refuses it (a conflict) and nothing is overwritten.
// - Device copies remember the revision they were based on (`base`) and how many local edits they hold
//   (`edits`). At login, an unsent device copy wins only if the server is still at that revision (a
//   fast-forward). If both changed, the server's version stays and the device copy is kept as a backup that
//   Villages offers to restore. Wall-clock times (`savedAt`) never decide anything.
// - Tabs (tabGuard.js): opening a village in a second tab tells the first one, which stops saving it
//   (`lock`: the game shows "This village was opened in another tab").
// - Device copies belong to one account (`uid`): another account logging in on the same device never sees
//   them; they wait for their own account's next login.
// - Offline (startOffline): when the server can't be reached at launch, the last account that logged in on
//   this device (and didn't log out) can play its device copies. Its progress stays unsent until that account
//   logs in again; nothing is sent, and achievement rewards can't be claimed, until then.
import { parseSave } from '../logic/save.js';
import { COUNTERS, estimateBestWave, mergeVillageCounters } from '../logic/achievements.js';
import { isConflictError } from './errors.js';

export const MAX_BASES = 5;
export const BASE_NAME_MAX = 20;
export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export { isNetworkError } from './errors.js';

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
const BACKUP_PREFIX = 'ibtd.backup.'; // a village's device copy that lost to a newer server copy (keepBackup)
const BACKUPS_PER_VILLAGE = 3;
const OFFLINE_USER = 'ibtd.offlineUser'; // the account offline play opens: { id, username } (gone at Log Out)
const LAST_EMAIL = 'ibtd.lastEmail';     // the login screen's remembered email (gone at Log Out)
const importedKey = (uid) => `ibtd.imported.${uid}`; // fingerprints of villages this account imported
const indexKey = (uid) => `ibtd.account.${uid}`;     // the account's village list, stats and achievements, for offline play
const UPLOAD_MS = 1500;  // a village uploads this long after its last change
const STATS_MS = 4000;   // stats / achievements upload this long after their last change
const RETRY_MS = [3000, 8000, 20000, 45000];
const mirrorKey = (id) => `ibtd.cloud.${id}`;
const lastBaseKey = (uid) => `ibtd.lastBase.${uid}`;
const outboxKey = (uid) => `ibtd.outbox.${uid}`;
const declinedKey = (uid) => `ibtd.legacyDeclined.${uid}`;
const UNREADABLE_PREFIX = 'ibtd.unreadable.';
const unreadableKey = (id) => `${UNREADABLE_PREFIX}${id}`; // a village's save the game couldn't read, kept before it was replaced
export const OFFLINE_CHANGE = 'You’re playing offline. Log in again to make, rename or delete villages.';

/** The next wave a save will fight (same rule as nightWaveNumber: waves cleared + 1). */
export function saveWave(save) {
  if (!save) return 0;
  return (save.wavesCleared || 0) + 1;
}

const emptyStats = () => ({ bestWave: 0, bestTownHall: 0, counters: {}, villageCounters: {} });
const achievementKey = (baseId, id) => `${baseId || ''}|${id}`;
const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** A short, stable name for a text (backup keys). */
function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

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
   * @param {import('./tabGuard.js').TabGuard|null} [o.guard] tells this browser's other tabs which village is open here
   */
  constructor({ backend = null, storage = null, timers = null, guard = null } = {}) {
    this.backend = backend;
    this.local = storage;
    this.timers = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (t) => clearTimeout(t) };
    this.listeners = new Set();
    // Villages this tab gave up (another tab opened them, or the server has a newer copy): never saved from
    // this tab again, whatever its game does. `lock` says why; the game shows it and offers only a reload.
    this.lostIds = new Set();
    this.lock = null; // { reason: 'tab' | 'conflict', baseId, name }
    this.reset();
    this.guard = guard;
    if (guard) {
      guard.onClaim = (m) => this.otherTabClaimed(m);
      guard.onWho = (uid) => (this.user && this.user.id === uid ? [...this.held] : []);
    }
    const self = this;
    this.storage = {
      getItem(k) { return self.getItem(k); },
      setItem(k, v) { self.setItem(k, v); },
      removeItem(k) { self.removeItem(k); },
      // GameState.getStorage() takes this: a game keeps saving into the village it was started in.
      pinned() { return self.pinnedStorage(); }
    };
  }

  reset() {
    // The old account's pending uploads stop first (before its villages are dropped).
    for (const t of [this.statsTimer, ...(this.bases || []).map((b) => b.timer)]) if (t) this.timers.clear(t);
    for (const b of this.bases || []) b.timer = null;
    this.user = null;
    this.bases = [];
    this.activeId = null;
    this.held = new Set(); // villages this tab has opened (openBase): another tab opening one takes it from here
    this.stats = emptyStats();
    this.achievements = new Map(); // village and achievement -> award record
    this.outbox = { stats: false, earns: [], claims: [] };
    this.inflightOutbox = null;
    this.sending = null;
    this.syncState = 'ok'; // 'ok' | 'saving' | 'offline' (see updateSync)
    this.outboxFailed = false;
    this.statsTimer = null;
    this.statsRetry = 0;
    this.serverBestWave = 0;
  }

  /**
   * A Storage pinned to the village open right now (plain device storage when none is): whatever later
   * happens to the session (another village opened, logged out), a game started here never saves into a
   * different village or the device's old save slot. If its village is no longer loaded, its saves go to that
   * village's device copy (marked unsent), which the next login of its account picks up.
   */
  pinnedStorage() {
    const id = this.activeId, uid = this.user ? this.user.id : null, self = this;
    return {
      getItem(k) { return self.getItem(k, id); },
      setItem(k, v) { self.setItem(k, v, id, uid); },
      removeItem(k) { self.removeItem(k, id, uid); }
    };
  }

  get configured() { return !!this.backend; }
  get loggedIn() { return !!this.user; }
  /** Playing the device copies while the server can't be reached (startOffline). */
  get offline() { return !!(this.user && this.user.offline); }
  /** Uploads (villages, stats, achievements) can go now. */
  get canSend() { return !!this.backend && !!this.user && !this.offline; }
  get activeBase() { return this.bases.find((b) => b.id === this.activeId) || null; }
  baseById(id) { return this.bases.find((b) => b.id === id) || null; }

  /** Called with no arguments whenever the account, villages, achievements or sync state change. */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of [...this.listeners]) { try { fn(); } catch (e) { console.error(e); } } }
  setSync(state) { if (this.syncState !== state) { this.syncState = state; this.changed(); } }

  /** 'offline' while any upload is failing, 'saving' while something waits to upload, else 'ok'. */
  updateSync() {
    const live = this.bases.filter((b) => !b.lost);
    const failing = this.outboxFailed || live.some((b) => (b.retry || 0) > 0);
    const waiting = live.some((b) => b.dirty) || this.hasOutbox() || !!this.inflightOutbox;
    this.setSync(failing ? 'offline' : waiting ? 'saving' : 'ok');
  }

  // ---------- device storage (never throws) ----------
  lget(k) { try { return this.local ? this.local.getItem(k) : null; } catch { return null; } }
  lset(k, v) { try { if (this.local) this.local.setItem(k, v); } catch { /* full or blocked */ } }
  ldel(k) { try { if (this.local) this.local.removeItem(k); } catch { /* blocked */ } }
  ljson(k) { try { return JSON.parse(this.lget(k) || 'null'); } catch { return null; } }

  // ---------- the Storage the game saves through ----------
  /** A per-village copy of the other save-related keys (New Game backups), so villages never share them. */
  scopedKey(k, id = this.activeId) {
    return id && (k.startsWith('ibtd.save.') || k.startsWith('ibtd.checkpoint.')) ? `${k}.${id}` : k;
  }

  // `id`: the village these keys belong to (pinnedStorage); by default the open one. With no village, the
  // game keys are the device's own slots (offline play). `uid`: the account it belongs to.
  getItem(k, id = this.activeId) {
    const field = GAME_KEYS[k];
    if (field && id) {
      const b = this.baseById(id);
      const v = b ? b[field] : (this.ljson(mirrorKey(id)) || {})[field];
      return v ? JSON.stringify(v) : null;
    }
    return this.lget(this.scopedKey(k, id));
  }

  setItem(k, v, id = this.activeId, uid = this.user ? this.user.id : null) {
    const field = GAME_KEYS[k];
    if (!(field && id)) { this.lset(this.scopedKey(k, id), v); return; }
    if (this.lostIds.has(id)) return; // another tab has it now, or the server has newer: never overwrite that
    let obj;
    try { obj = JSON.parse(v); } catch { return; }
    const b = this.baseById(id);
    if (b) this.writeBase(b, { [field]: obj });
    else this.writeOrphan(id, { [field]: obj }, uid);
  }

  removeItem(k, id = this.activeId, uid = this.user ? this.user.id : null) {
    const field = GAME_KEYS[k];
    if (!(field && id)) { this.ldel(this.scopedKey(k, id)); return; }
    if (this.lostIds.has(id)) return;
    const b = this.baseById(id);
    if (b) this.writeBase(b, { [field]: null });
    else this.writeOrphan(id, { [field]: null }, uid);
  }

  /** A save for a village that isn't loaded (its account logged out): into its device copy, marked unsent. */
  writeOrphan(id, fields, uid = null) {
    const m = this.ljson(mirrorKey(id)) || { save: null, checkpoint: null, bestWave: 0 };
    if (m.uid && uid && m.uid !== uid) return; // never into another account's copy
    this.lset(mirrorKey(id), JSON.stringify({ ...m, ...fields, uid: m.uid || uid || null, dirty: true, edits: (m.edits || 0) + 1 }));
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
    if (b.lost) return;
    // A save the game couldn't read (corrupt, or a bug in an update) is about to be replaced by a fresh start:
    // keep a copy on this device first. Once it reads again, Villages offers it to import (deviceVillages).
    if (fields.save !== undefined && !b.saveChecked) {
      b.saveChecked = true;
      if (b.save && parseSave(JSON.stringify(b.save)).status !== 'ok') {
        this.lset(unreadableKey(b.id), JSON.stringify({ uid: this.user ? this.user.id : null, name: b.name, save: b.save, checkpoint: b.checkpoint || null }));
      }
    }
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

  /**
   * The village's device copy: its content, whether it holds unsent changes (`dirty`, `edits` of them), the
   * server revision it is based on (`base`) and whose it is (`uid`). `force`: even for a village this tab gave
   * up (its final copy, written once its last upload is done).
   */
  writeMirror(b, force = false) {
    if (b.lost && !force) return;
    this.lset(mirrorKey(b.id), JSON.stringify({
      uid: b.uid || (this.user ? this.user.id : null), name: b.name,
      save: b.save ?? null, checkpoint: b.checkpoint ?? null, bestWave: b.bestWave || 0,
      dirty: !!b.dirty, base: b.serverRev || null, edits: b.dirty ? Math.max(1, (b.rev || 0) - (b.syncedRev || 0)) : 0
    }));
  }

  scheduleUpload(b, ms = UPLOAD_MS) {
    if (!this.canSend || b.lost) return;
    if (b.timer) this.timers.clear(b.timer);
    b.timer = this.timers.set(() => { b.timer = null; return this.uploadBase(b); }, ms);
  }

  async uploadBase(b) {
    if (!this.canSend || b.lost || !this.baseById(b.id)) return;
    if (b.inflight) { b.again = true; return; }
    const run = (async () => {
      const rev = b.rev;
      this.updateSync();
      try {
        // Only on top of the revision this tab last had: a newer save from another tab or device is never overwritten.
        const r = await this.backend.updateBase(b.id, { save: b.save, checkpoint: b.checkpoint, townHall: b.townHall, wave: b.wave, bestWave: b.bestWave || 0 }, { expected: b.serverRev || null });
        b.retry = 0;
        if (r && r.updatedAt) b.serverRev = r.updatedAt;
        b.syncedRev = rev;
        if (b.rev === rev) b.dirty = false;
        this.writeMirror(b); // what's still unsent is now based on the new revision
        // The server may now have verified more of this village's waves: offer the stats again while the
        // leaderboard is behind the game's own count, so the two catch up.
        if (this.user && Number.isFinite(this.serverBestWave) && this.stats.bestWave > this.serverBestWave) this.statsChanged();
      } catch (e) {
        if (isConflictError(e)) { this.uploadConflict(b, e); return; }
        console.warn('Village upload failed', e);
        const delay = RETRY_MS[Math.min(b.retry || 0, RETRY_MS.length - 1)];
        b.retry = (b.retry || 0) + 1;
        if (this.baseById(b.id)) this.scheduleUpload(b, delay);
      } finally {
        this.updateSync();
      }
    })();
    b.inflight = run;
    try { await run; } finally {
      b.inflight = null;
      if (b.again) { b.again = false; this.scheduleUpload(b, 0); }
    }
  }

  /** The server refused a save: another tab or device saved this village since. Keep this copy as a backup and stop. */
  uploadConflict(b, e) {
    console.warn('Village upload refused: the server has a newer copy', e);
    this.keepBackup(b, { save: b.save, checkpoint: b.checkpoint }, 'conflict');
    this.loseBase(b.id, 'conflict');
  }

  /**
   * This tab stops saving a village (for good, until the page reloads) and says why (`lock`). Resolves once
   * its last upload has finished and (another tab took it) its final device copy is written.
   */
  loseBase(id, reason) {
    const b = this.baseById(id);
    this.lostIds.add(id);
    this.held.delete(id);
    if (b) {
      b.lost = true;
      b.again = false;
      if (b.timer) { this.timers.clear(b.timer); b.timer = null; }
    }
    if (!this.lock) this.lock = { reason, baseId: id, name: b ? b.name : '' };
    this.updateSync();
    this.changed();
    const last = b && b.inflight ? b.inflight.catch(() => {}) : Promise.resolve();
    return last.then(() => { if (b && reason === 'tab') this.writeMirror(b, true); });
  }

  /** Another tab of this browser is opening a village (tabGuard.js). Returns a promise if this tab had it open. */
  otherTabClaimed(m) {
    if (!this.user || !m || m.uid !== this.user.id || !m.baseId) return null;
    const id = m.baseId;
    const claiming = !!(this.guard && this.guard.claiming.has(id));
    if (!this.held.has(id) && !claiming) return null;
    if (claiming && this.guard.newerThan(m)) return null; // this tab opened it after that one did: that one gives way
    return this.loseBase(id, 'tab');
  }

  /** Upload everything waiting right now (before logging out, leaving the page, or a manual Save). Never throws. */
  async flush() {
    if (!this.backend || !this.user) return true;
    if (this.offline) return false; // kept on this device until the next login
    const jobs = this.bases.filter((b) => b.dirty && !b.lost).map((b) => {
      if (b.timer) { this.timers.clear(b.timer); b.timer = null; }
      return this.uploadBase(b);
    });
    if (this.statsTimer) { this.timers.clear(this.statsTimer); this.statsTimer = null; }
    jobs.push(this.sendOutbox());
    await Promise.all(jobs);
    return !this.bases.some((b) => b.dirty && !b.lost) && !this.hasOutbox();
  }

  // ---------- logging in and out ----------
  /** Picks up a saved login (if any). Returns the user or null. Throws a network error when the server can't be reached. */
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
    // Logged out on purpose: the next person on this device gets nothing of this account (no offline play as
    // it, no remembered email). Its unsent device copies stay, for that account's next login only.
    this.ldel(OFFLINE_USER);
    this.ldel(LAST_EMAIL);
    this.reset();
    this.changed();
  }

  /** Fetch the account's villages, stats and achievements, and merge anything left on this device. */
  async loadAccount(user) {
    // Villages another tab has open right now: their device copies are that tab's to write, not this login's.
    const othersP = this.guard ? this.guard.holders(user.id) : Promise.resolve(new Set());
    const [bases, stats, achievements, others] = await Promise.all([
      this.backend.listBases(), this.backend.getStats(), this.backend.listAchievements(), othersP
    ]);
    this.reset();
    this.user = user;
    this.bases = bases.map((b) => ({ ...b, uid: user.id, serverRev: b.updatedAt || null, rev: 0, syncedRev: 0, dirty: false }));
    this.mergeStats(stats);
    this.serverBestWave = stats.bestWave || 0; // what the leaderboard shows (the server only counts waves it has verified)
    for (const a of achievements) this.achievements.set(achievementKey(a.baseId, a.id), a);

    // A village saved on this device but never uploaded (tab closed, offline): see mergeDeviceCopy.
    for (const b of this.bases) if (!others.has(b.id)) this.mergeDeviceCopy(b);
    this.loadOutbox(user.id);

    // Villages further along than the account's records (played offline, before tracking ...): catch up.
    for (const b of this.bases) {
      if (others.has(b.id)) continue;
      if (this.catchUpBestWave(b)) { b.dirty = true; this.writeMirror(b); this.scheduleUpload(b); }
    }

    const last = this.lget(lastBaseKey(user.id));
    this.activeId = this.baseById(last) ? last : (this.bases[0] ? this.bases[0].id : null);
    this.saveIndex();
    this.changed();
  }

  /** Stats, achievements and claims that didn't reach the server last time (kept in the outbox on this device). */
  loadOutbox(uid) {
    const box = this.ljson(outboxKey(uid));
    if (!box) return;
    if (box.stats) this.mergeStats(box.stats);
    for (const e of box.earns || []) {
      const key = achievementKey(e.baseId, e.id);
      if (!this.baseById(e.baseId) || this.achievements.has(key)) continue;
      this.achievements.set(key, { id: e.id, earnedAt: e.at, claimedAt: null, baseId: e.baseId });
      this.outbox.earns.push(e);
    }
    for (const claim of box.claims || []) {
      // Before village-specific awards, pending claims stored only the achievement ID.
      const a = typeof claim === 'string'
        ? [...this.achievements.values()].filter((award) => award.id === claim && this.baseById(award.baseId))
          .sort((a, b) => String(a.earnedAt).localeCompare(String(b.earnedAt)))[0]
        : this.achievements.get(achievementKey(claim.baseId, claim.id));
      if (a && this.baseById(a.baseId) && !a.claimedAt) {
        a.claimedAt = new Date().toISOString();
        this.outbox.claims.push({ id: a.id, baseId: a.baseId });
      }
    }
    if (box.stats) this.outbox.stats = true;
    this.queueOutbox();
  }

  /**
   * Bring a village's unsent device copy together with the server's (`b`, whose `serverRev` is the server's
   * revision). Clock-free: the copy wins only if it was based on that same revision (nobody else saved since:
   * a fast-forward), and then uploads. If the server moved on too, the server's version stays and the device
   * copy is kept as a backup (Villages offers it). Returns 'server' | 'same' | 'device' | 'backup'.
   */
  mergeDeviceCopy(b) {
    const m = this.ljson(mirrorKey(b.id));
    const uid = b.uid || (this.user ? this.user.id : null);
    if (m && m.uid && uid && m.uid !== uid) return 'server'; // not this account's copy: left untouched
    if (!(m && m.dirty && (m.save || m.checkpoint))) { this.writeMirror(b); return 'server'; }
    if (sameJson(m.save, b.save) && sameJson(m.checkpoint, b.checkpoint)) { this.writeMirror(b); return 'same'; }
    // Copies from before revisions were kept: only when the server has nothing yet.
    const fastForward = m.base ? m.base === b.serverRev : !b.save && !b.checkpoint;
    if (fastForward) {
      this.writeBase(b, { save: m.save ?? null, checkpoint: m.checkpoint ?? null });
      if ((m.bestWave || 0) > (b.bestWave || 0)) { b.bestWave = m.bestWave; this.writeMirror(b); }
      return 'device';
    }
    this.keepBackup(b, m, 'conflict');
    this.writeMirror(b);
    return 'backup';
  }

  /** Keep a copy of a village on this device, for this account only, until it's restored or imported (deviceVillages). */
  keepBackup(b, copy, reason = 'conflict') {
    const uid = b.uid || (this.user ? this.user.id : null);
    if (!uid || !copy || !copy.save) return;
    const key = `${BACKUP_PREFIX}${b.id}.${hashText(JSON.stringify([copy.save, copy.checkpoint ?? null]))}`;
    if (this.lget(key)) return;
    const older = this.localKeys().filter((k) => k.startsWith(`${BACKUP_PREFIX}${b.id}.`))
      .map((k) => [k, String((this.ljson(k) || {}).keptAt || '')]).sort((x, y) => x[1].localeCompare(y[1]));
    while (older.length >= BACKUPS_PER_VILLAGE) this.ldel(older.shift()[0]);
    this.lset(key, JSON.stringify({ uid, baseId: b.id, name: b.name, save: copy.save, checkpoint: copy.checkpoint ?? null, keptAt: new Date().toISOString(), reason }));
  }

  // ---------- offline ----------
  /** The account offline play would open: the last one that logged in on this device and didn't log out ({ id, username }), or null. */
  offlineAccount() {
    const who = this.ljson(OFFLINE_USER);
    return who && who.id && this.ljson(indexKey(who.id)) ? who : null;
  }

  /**
   * The server can't be reached: play that account's villages from their device copies. Returns false when
   * there's no such account (then offline play uses the browser's own save slot, as with no server at all).
   */
  startOffline() {
    const who = this.offlineAccount();
    if (!who) return false;
    const idx = this.ljson(indexKey(who.id)) || {};
    this.reset();
    this.user = { id: who.id, username: who.username || 'Player', email: '', offline: true };
    this.bases = (idx.bases || []).map((meta) => {
      if (this.lget(mirrorKey(meta.id)) === null) return null; // never copied to this device: can't be played here
      const m = this.ljson(mirrorKey(meta.id)) || {};
      if (m.uid && m.uid !== who.id) return null;
      const save = m.save ?? null, rev = m.base || meta.updatedAt || null;
      return {
        id: meta.id, uid: who.id, name: meta.name || m.name || 'My Village', save, checkpoint: m.checkpoint ?? null,
        townHall: save ? save.townHallLevel || 0 : 0, wave: saveWave(save), bestWave: Math.max(meta.bestWave || 0, m.bestWave || 0),
        updatedAt: rev, serverRev: rev, rev: m.dirty ? Math.max(1, m.edits || 1) : 0, syncedRev: 0, dirty: !!m.dirty
      };
    }).filter(Boolean);
    const s = idx.stats || {};
    this.mergeStats(s);
    for (const [key, a] of Array.isArray(idx.achievements) ? idx.achievements : []) {
      const id = a.id || key;
      this.achievements.set(achievementKey(a.baseId, id), { ...a, id });
    }
    this.loadOutbox(who.id);
    const last = this.lget(lastBaseKey(who.id));
    this.activeId = this.baseById(last) ? last : (this.bases[0] ? this.bases[0].id : null);
    this.changed();
    return true;
  }

  /** Leave offline play (to try the server again). Everything played stays on this device, unsent. */
  endOffline() {
    if (!this.offline) return;
    this.reset();
    this.changed();
  }

  /** What offline play needs from this account, kept on this device at every login and village change. */
  saveIndex() {
    if (!this.user || this.offline) return;
    const uid = this.user.id;
    this.lset(indexKey(uid), JSON.stringify({
      bases: this.bases.map((b) => ({ id: b.id, name: b.name, bestWave: b.bestWave || 0, updatedAt: b.serverRev || null })),
      stats: this.stats,
      achievements: [...this.achievements.entries()]
    }));
    this.lset(OFFLINE_USER, JSON.stringify({ id: uid, username: this.user.username }));
  }

  // ---------- villages ----------
  selectBase(id) {
    if (!this.baseById(id)) return false;
    this.activeId = id;
    this.lset(lastBaseKey(this.user.id), id);
    this.changed();
    return true;
  }

  /**
   * Open a village to play it: any other tab of this browser that has it open is told and stops saving it
   * (tabGuard.js), then it is read again (server + device copy), so this tab starts from the newest copy.
   * Resolves false when it can't be played here (another tab claimed it at the same moment, or it was deleted).
   */
  async openBase(id) {
    if (!this.user || !this.baseById(id)) return false;
    this.selectBase(id);
    if (this.lostIds.has(id)) return false;
    if (this.guard) await this.guard.claim(this.user.id, id);
    if (this.lostIds.has(id) || !this.baseById(id)) return false;
    this.held = new Set([id]);
    return this.refreshBase(id);
  }

  /** Read a village again: the server's copy if it changed (it can't be reached: what this tab has), then the device copy. */
  async refreshBase(id) {
    let b = this.baseById(id);
    if (!b) return false;
    if (b.inflight) await b.inflight.catch(() => {});
    if (this.canSend) {
      let row;
      try { row = (await this.backend.listBases()).find((x) => x.id === id) || null; } catch { row = undefined; }
      b = this.baseById(id);
      if (!b || b.lost) return false;
      if (row === null) { this.dropBase(id); this.changed(); return false; } // deleted on another device
      if (row && row.updatedAt !== b.serverRev) {
        if (b.dirty) this.keepBackup(b, { save: b.save, checkpoint: b.checkpoint }, 'conflict');
        if (b.timer) { this.timers.clear(b.timer); b.timer = null; }
        Object.assign(b, {
          name: row.name, save: row.save, checkpoint: row.checkpoint, townHall: row.townHall, wave: row.wave,
          bestWave: Math.max(b.bestWave || 0, row.bestWave || 0), updatedAt: row.updatedAt, serverRev: row.updatedAt,
          dirty: false, rev: 0, syncedRev: 0, retry: 0, saveChecked: false
        });
      }
    }
    this.mergeDeviceCopy(b);
    this.changed();
    return true;
  }

  /** Forget a village in this tab (its device copy stays). */
  dropBase(id) {
    const b = this.baseById(id);
    if (b && b.timer) this.timers.clear(b.timer);
    this.bases = this.bases.filter((x) => x.id !== id);
    delete this.stats.villageCounters[id];
    this.outbox.earns = this.outbox.earns.filter((a) => a.baseId !== id);
    this.outbox.claims = this.outbox.claims.filter((a) => a.baseId !== id);
    for (const [key, award] of this.achievements) if (award.baseId === id) this.achievements.delete(key);
    this.queueOutbox();
    this.held.delete(id);
    if (this.activeId === id) {
      this.activeId = this.bases[0] ? this.bases[0].id : null;
      if (this.activeId) this.lset(lastBaseKey(this.user.id), this.activeId);
      else this.ldel(lastBaseKey(this.user.id));
    }
    this.saveIndex();
  }

  /** Make a village (empty: a new game; or from an existing save) and open it. */
  async createBase(name, { save = null, checkpoint = null, bestWave = 0 } = {}) {
    if (this.offline) throw new Error(OFFLINE_CHANGE);
    if (this.bases.length >= MAX_BASES) throw new Error(`You can have up to ${MAX_BASES} villages. Delete one first.`);
    const clean = String(name || '').trim().slice(0, BASE_NAME_MAX) || `Village ${this.bases.length + 1}`;
    const b = await this.backend.createBase({ name: clean, save, checkpoint, townHall: save ? save.townHallLevel || 0 : 0, wave: saveWave(save), bestWave });
    const nb = { ...b, uid: this.user.id, serverRev: b.updatedAt || null, rev: 0, syncedRev: 0, dirty: false };
    this.bases.push(nb);
    this.writeMirror(nb); // a device copy from the start, for offline play
    this.saveIndex();
    this.selectBase(b.id);
    return b;
  }

  /** Give a village a new name (trimmed, up to BASE_NAME_MAX characters). */
  async renameBase(id, name) {
    if (this.offline) throw new Error(OFFLINE_CHANGE);
    const b = this.baseById(id);
    if (!b) throw new Error('That village no longer exists.');
    const clean = String(name || '').trim().slice(0, BASE_NAME_MAX);
    if (!clean) throw new Error('Type a name first.');
    // (Not a new revision: a name never conflicts with a save.)
    await this.backend.updateBase(id, { name: clean });
    b.name = clean;
    this.saveIndex();
    this.changed();
    return b;
  }

  async deleteBase(id) {
    if (this.offline) throw new Error(OFFLINE_CHANGE);
    await this.backend.deleteBase(id);
    this.ldel(mirrorKey(id));
    this.dropBase(id);
    this.changed();
  }

  // ---------- villages saved in this browser outside the account ----------
  /**
   * Every valid village this browser holds that this account hasn't imported yet, newest first:
   * [{ key, source, name, save, checkpoint, baseId? }]. It looks in the pre-account save slot, the backup New
   * Game makes, accounts kept in the browser by the dev server before Supabase was set up, and this account's
   * own copies: backups of its villages (a device copy that lost to a newer server copy; `baseId` is the
   * village, which restoreBackup can put it back into), unsent copies of its villages deleted elsewhere, and
   * saves the game once couldn't read. Other accounts' device copies are never listed. Read straight from
   * the device, never the open village.
   */
  deviceVillages() {
    const parse = (v) => {
      const r = parseSave(typeof v === 'string' || v === null || v === undefined ? v : JSON.stringify(v));
      return r.status === 'ok' ? r.data : null;
    };
    const found = [];
    const add = (key, source, name, save, checkpoint, baseId = null) => {
      const s = parse(save);
      if (s) found.push({ key, source, name, save: s, checkpoint: parse(checkpoint), baseId });
    };
    add('save', 'Saved in this browser', 'My Village', this.lget(LEGACY_SAVE), this.lget(LEGACY_CHECKPOINT));
    add('backup', 'Backup from a New Game', 'Old Village', this.lget(LEGACY_BACKUP), this.lget(LEGACY_CHECKPOINT_BACKUP));
    // The dev server's browser-only accounts, to bring into a real account. Not while they ARE this session's
    // accounts (the dev server's own backend): then they're other players' villages on this device.
    const db = this.backend && this.backend.storage && this.backend.storage === this.local ? null : this.ljson(DEV_DB);
    if (db && Array.isArray(db.bases)) {
      for (const b of db.bases) {
        if (this.baseById(b.id)) continue; // this account's own village (dev mode keeps them here)
        const owner = Array.isArray(db.users) ? db.users.find((u) => u.id === b.userId) : null;
        add(`dev:${b.id}`, `Browser-only account${owner ? ` “${owner.username}”` : ''}`, b.name || 'My Village', b.save, b.checkpoint);
      }
    }
    const uid = this.user ? this.user.id : null;
    for (const k of uid ? this.localKeys() : []) {
      if (k.startsWith(MIRROR_PREFIX)) {
        const id = k.slice(MIRROR_PREFIX.length);
        if (this.baseById(id)) continue; // one of this account's villages
        const m = this.ljson(k);
        if (m && m.uid === uid && m.dirty) add(`mirror:${id}`, 'Unsent copy of a village deleted elsewhere', m.name || 'My Village', m.save, m.checkpoint);
      } else if (k.startsWith(BACKUP_PREFIX)) {
        const v = this.ljson(k);
        if (v && v.uid === uid) {
          const kept = this.baseById(v.baseId) ? 'Backup: also changed in another tab or device' : 'Backup of a deleted village';
          add(`backup:${k.slice(BACKUP_PREFIX.length)}`, kept, v.name || 'My Village', v.save, v.checkpoint, this.baseById(v.baseId) ? v.baseId : null);
        }
      } else if (k.startsWith(UNREADABLE_PREFIX)) {
        // This account's saves the game once couldn't read (kept by writeBase): offered once they read again.
        const u = this.ljson(k);
        if (u && u.uid === uid) add(`unreadable:${k.slice(UNREADABLE_PREFIX.length)}`, 'Kept when it couldn’t be loaded', u.name || 'My Village', u.save, u.checkpoint);
      }
    }
    // Drop repeats and anything this account already imported.
    const done = new Set(uid ? this.ljson(importedKey(uid)) || [] : []);
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

  /** This account won't be offered a device village again; this account's own backup / unsent copy of it is removed. */
  markImported(v) {
    const done = this.ljson(importedKey(this.user.id)) || [];
    this.lset(importedKey(this.user.id), JSON.stringify([...done, villageFingerprint(v.save)]));
    if (v.key.startsWith('backup:')) this.ldel(BACKUP_PREFIX + v.key.slice('backup:'.length));
    if (v.key.startsWith('mirror:')) this.ldel(MIRROR_PREFIX + v.key.slice('mirror:'.length));
  }

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
    this.markImported(v);
    this.recordTownHall(v.save.townHallLevel || 0);
    this.recordWave(bestWave);
    return b;
  }

  /**
   * Put a backup (deviceVillages entry with a baseId) back into its village, replacing what the village has
   * now (which is kept as a backup in turn, so nothing is lost). The village is opened here first.
   */
  async restoreBackup(key) {
    const v = this.deviceVillages().find((x) => x.key === key);
    if (!v || !v.baseId) throw new Error('That backup is no longer on this device.');
    if (!await this.openBase(v.baseId)) throw new Error('That village is open in another tab, or no longer exists.');
    const b = this.baseById(v.baseId);
    this.keepBackup(b, { save: b.save, checkpoint: b.checkpoint }, 'replaced');
    this.writeBase(b, { save: v.save, checkpoint: v.checkpoint });
    this.markImported(v);
    this.changed();
    return b;
  }

  // ---------- stats ----------
  bump(counter, n = 1) {
    if (!this.user || !COUNTERS.includes(counter) || !(n > 0)) return;
    const base = this.activeBase;
    if (base && !base.lost) {
      const row = this.stats.villageCounters[base.id] ||= {};
      row[counter] = (row[counter] || 0) + n;
    }
    this.stats.counters[counter] = (this.stats.counters[counter] || 0) + n;
    this.statsChanged();
  }

  /** A wave was survived in the open village: furthest wave for the leaderboard. */
  recordWave(n) {
    if (!this.user || !(n > 0)) return;
    const b = this.activeBase;
    if (b && !b.lost && n > (b.bestWave || 0)) { b.bestWave = n; b.dirty = true; this.writeMirror(b); this.scheduleUpload(b); }
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
    this.stats.villageCounters = mergeVillageCounters(this.stats.villageCounters, s.villageCounters);
  }

  statsChanged() {
    this.outbox.stats = true;
    this.queueOutbox();
  }

  // ---------- achievements ----------
  achievementEntries(baseId = this.activeId) {
    if (!this.baseById(baseId)) return [];
    return [...this.achievements.values()].filter((a) => a.baseId === baseId);
  }

  earnedIds(baseId = this.activeId) { return new Set(this.achievementEntries(baseId).map((a) => a.id)); }
  unclaimed(baseId = this.activeId) { return this.achievementEntries(baseId).filter((a) => !a.claimedAt).map((a) => a.id); }

  async playerProfile(username) {
    const uid = this.user?.id;
    const profile = await this.backend.playerProfile(username);
    if (!profile?.isMe || this.user?.id !== uid) return profile;
    const awards = new Map(profile.achievements.map((a) => [achievementKey(a.baseId, a.id), a]));
    for (const base of profile.bases) {
      for (const { baseId, id, earnedAt } of this.achievementEntries(base.id)) {
        const key = achievementKey(baseId, id);
        if (!awards.has(key)) awards.set(key, { baseId, id, earnedAt });
      }
    }
    return { ...profile, achievements: [...awards.values()] };
  }

  villageAchievementStats(baseId = this.activeId, gs = null) {
    const base = this.baseById(baseId);
    return {
      bestWave: Math.max(base?.bestWave || 0, gs?.wavesCleared ?? base?.save?.wavesCleared ?? 0),
      bestTownHall: gs?.townHallLevel ?? base?.townHall ?? 0,
      counters: this.stats.villageCounters[baseId] || {}
    };
  }

  /** Mark achievements earned (in the open village). Offline, they wait on this device for the next login. */
  earn(ids) {
    if (!this.user || !this.activeBase || this.activeBase.lost) return;
    const at = new Date().toISOString(), baseId = this.activeId;
    for (const id of ids) {
      const key = achievementKey(baseId, id);
      if (this.achievements.has(key)) continue;
      this.achievements.set(key, { id, earnedAt: at, claimedAt: null, baseId });
      this.outbox.earns.push({ id, baseId, at });
    }
    this.queueOutbox();
    this.changed();
  }

  /** Mark an achievement's reward as taken (the caller has already paid it into the village). Never offline. */
  claim(id, baseId = this.activeId) {
    if (this.offline) return false; // rewards wait until the server has the achievement
    if (baseId !== this.activeId || !this.activeBase || this.activeBase.lost) return false;
    const a = this.achievements.get(achievementKey(baseId, id));
    if (!a || a.claimedAt) return false;
    a.claimedAt = new Date().toISOString();
    this.outbox.claims.push({ id, baseId });
    this.queueOutbox(0);
    this.changed();
    return true;
  }

  // ---------- sending stats / achievements ----------
  hasOutbox() { return this.outbox.stats || this.outbox.earns.length > 0 || this.outbox.claims.length > 0; }

  /** Keep what's waiting on this device too, and send it soon (not while offline: at the next login). */
  queueOutbox(ms = STATS_MS) {
    if (!this.user) return;
    this.persistOutbox();
    if (!this.canSend) return;
    if (this.statsTimer) this.timers.clear(this.statsTimer);
    this.statsTimer = this.timers.set(() => { this.statsTimer = null; return this.sendOutbox(); }, ms);
  }

  persistOutbox() {
    const key = outboxKey(this.user.id), flight = this.inflightOutbox, queued = this.outbox;
    if (!flight && !this.hasOutbox()) { this.ldel(key); return; }
    this.lset(key, JSON.stringify({
      stats: flight?.stats || queued.stats ? this.stats : null,
      earns: [...(flight?.earns || []), ...queued.earns],
      claims: [...(flight?.claims || []), ...queued.claims]
    }));
  }

  async sendOutbox() {
    if (!this.canSend) return;
    const uid = this.user.id;
    if (this.sending) {
      await this.sending;
      if (this.user?.id === uid && !this.outboxFailed) return this.sendOutbox();
      return;
    }
    if (!this.hasOutbox()) return;
    const box = this.outbox;
    this.outbox = { stats: false, earns: [], claims: [] };
    this.inflightOutbox = box;
    this.sending = Promise.resolve().then(() => this.uploadOutbox(uid, box));
    return this.sending;
  }

  async uploadOutbox(uid, box) {
    const stillCurrent = () => this.user?.id === uid && this.inflightOutbox === box;
    let retry = null;
    try {
      if (!stillCurrent()) return;
      if (box.stats) await Promise.all(this.bases.filter((x) => x.dirty && !x.lost).map((x) => this.uploadBase(x)));
      if (!stillCurrent()) return;
      if (box.earns.length) await this.backend.earnAchievements(box.earns.filter((a) => this.baseById(a.baseId)));
      for (const { id, baseId } of box.claims) {
        if (!stillCurrent()) return;
        if (this.baseById(baseId)) await this.backend.claimAchievement(id, baseId);
      }
      if (!stillCurrent()) return;
      if (box.stats) {
        const kept = await this.backend.saveStats(this.stats);
        if (!stillCurrent()) return;
        if (kept && Number.isFinite(kept.bestWave)) this.serverBestWave = kept.bestWave;
      }
      this.statsRetry = 0;
      this.outboxFailed = false;
      this.saveIndex();
    } catch (e) {
      console.warn('Stats upload failed', e);
      if (!stillCurrent()) return;
      // Put it back (in front of anything newer) and try again later.
      this.outbox = {
        stats: box.stats || this.outbox.stats,
        earns: [...box.earns, ...this.outbox.earns],
        claims: [...box.claims, ...this.outbox.claims]
      };
      this.outboxFailed = true;
      retry = RETRY_MS[Math.min(this.statsRetry++, RETRY_MS.length - 1)];
    } finally {
      if (stillCurrent()) {
        this.inflightOutbox = null;
        this.sending = null;
        if (retry === null) this.persistOutbox();
        else this.queueOutbox(retry);
        this.updateSync();
      }
    }
  }
}
