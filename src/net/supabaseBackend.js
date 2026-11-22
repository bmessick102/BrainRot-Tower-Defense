// The online backend: Supabase Auth (email + password) and the tables in supabase/schema.sql.
// Every method returns plain camelCase objects and throws an Error with a player-friendly message.
import { createClient } from '@supabase/supabase-js';
import { networkError, conflictError } from './errors.js';

const BASE_COLUMNS = 'id, name, save, checkpoint, town_hall, wave, best_wave, created_at, updated_at';

const toBase = (r) => ({
  id: r.id, name: r.name, save: r.save, checkpoint: r.checkpoint,
  townHall: r.town_hall, wave: r.wave, bestWave: r.best_wave, createdAt: r.created_at, updatedAt: r.updated_at
});

/** camelCase base fields -> table columns (only the ones given). */
function baseColumns(f) {
  const out = {};
  if (f.name !== undefined) out.name = f.name;
  if (f.save !== undefined) out.save = f.save;
  if (f.checkpoint !== undefined) out.checkpoint = f.checkpoint;
  if (f.townHall !== undefined) out.town_hall = f.townHall;
  if (f.wave !== undefined) out.wave = f.wave;
  if (f.bestWave !== undefined) out.best_wave = f.bestWave;
  return out;
}

/** Supabase / network errors -> something a player can act on. */
export function friendlyError(error) {
  const msg = String((error && (error.message || error.error_description)) || error || '');
  // No connection, or the server itself is down: the login screen offers offline play for these.
  const status = Number(error && error.status);
  if (/failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg) || status >= 500 || (error && error.name === 'AuthRetryableFetchError')) {
    return networkError();
  }
  const rules = [
    [/invalid login credentials/i, 'Wrong email or password.'],
    [/already registered|already been registered|user_already_exists/i, 'That email already has an account. Log in instead.'],
    [/password should|password is too short|weak_password|weak password/i, 'Password must be at least 8 characters, with a letter and a number.'],
    [/captcha/i, 'The \u201cI\u2019m human\u201d check failed or expired. Try it again.'],
    [/email rate limit|over_email_send_rate_limit/i, 'Too many emails were sent. Wait a few minutes and try again.'],
    [/database error saving new user|profiles_username|username_format/i, 'That username is taken or not allowed.'],
    [/email not confirmed/i, 'Confirm your email first (check your inbox), then log in.'],
    [/unable to validate email|invalid format|email address .* is invalid/i, 'That email address doesn’t look right.'],
    [/base limit/i, 'You already have the most villages allowed.'],
    // A server function the game calls isn't installed yet (a migration hasn't been run on the database).
    [/schema cache|could not find the function|PGRST202/i, 'This isn’t available on the server yet. Try again later.'],
    [/rate limit|too many requests/i, 'Too many tries. Wait a minute and try again.'],
    [/jwt|not authenticated|session/i, 'Your login expired. Log in again.']
  ];
  for (const [re, text] of rules) if (re.test(msg)) return new Error(text);
  return new Error(msg || 'Something went wrong.');
}

/** The game's own address (the confirmation link comes back here). */
function gameUrl() {
  if (typeof location === 'undefined') return undefined;
  const base = (import.meta.env && import.meta.env.BASE_URL) || '/';
  return location.origin + base;
}

function check({ data, error }) {
  if (error) throw friendlyError(error);
  return data;
}

export class SupabaseBackend {
  constructor(url, anonKey) {
    this.kind = 'supabase';
    this.db = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ibtd.auth' }
    });
    this.userId = null;
    // Another tab on this browser logged out or into a different account (the login is shared between tabs):
    // this tab's requests would now run as someone else, so it must start over (account.js reloads the page).
    // Unsent progress is safe: it stays in the device copies, marked unsent, for the next login.
    this.onUserChanged = null;
    this.db.auth.onAuthStateChange((event, s) => this.authChanged(event, s));
  }

  /** Supabase's login changed (this tab or another). Returns true when it is no longer this tab's player. */
  authChanged(event, s) {
    const id = (s && s.user && s.user.id) || null;
    if (!this.userId || id === this.userId || event === 'INITIAL_SESSION') return false;
    const was = this.userId;
    this.userId = null; // nothing more is sent as the old player
    // Outside the auth callback (Supabase warns against awaiting auth calls inside it).
    setTimeout(() => { if (this.onUserChanged) this.onUserChanged({ from: was, to: id }); }, 0);
    return true;
  }

  /** The logged-in player from a saved session, or null. */
  async currentUser() {
    const { data, error } = await this.db.auth.getSession();
    if (error) {
      const e = friendlyError(error);
      if (e.network) throw e; // can't tell yet: the login screen offers Retry / Play Offline
      return null;
    }
    if (!data || !data.session) return null;
    return this.profileFor(data.session.user);
  }

  async profileFor(user) {
    this.userId = user.id;
    const row = check(await this.db.from('profiles').select('username').eq('id', user.id).maybeSingle());
    const meta = user.user_metadata || {};
    return { id: user.id, email: user.email, username: (row && row.username) || meta.username || 'Player' };
  }

  async usernameAvailable(name) {
    return !!check(await this.db.rpc('username_available', { name }));
  }

  /**
   * Returns { user } when signed straight in, or { needsConfirm: true } when Supabase emails a confirmation
   * link first. (With confirmation on, an email that already has an account gets the same answer, so
   * sign-up never reveals who has an account.) The link brings the player back to the game, logged in.
   */
  async signUp({ email, password, username, captchaToken = null }) {
    const options = { data: { username }, emailRedirectTo: gameUrl() };
    if (captchaToken) options.captchaToken = captchaToken;
    const data = check(await this.db.auth.signUp({ email, password, options }));
    if (!data.session) return { needsConfirm: true };
    return { user: await this.profileFor(data.user) };
  }

  async signIn({ email, password, captchaToken = null }) {
    const data = check(await this.db.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : {} }));
    return { user: await this.profileFor(data.user) };
  }

  /** Send the sign-up confirmation email again. */
  async resendConfirmation(email, captchaToken = null) {
    const options = { emailRedirectTo: gameUrl() };
    if (captchaToken) options.captchaToken = captchaToken;
    check(await this.db.auth.resend({ type: 'signup', email, options }));
  }

  async signOut() {
    this.userId = null;
    try {
      await Promise.race([this.db.auth.signOut(), new Promise((r) => setTimeout(r, 4000))]);
    } finally {
      // Logged out on purpose: the saved login must go even when the server can't be reached (Supabase keeps it
      // when it can't refresh an expired one first), or the next person on this device would be logged in as you.
      try {
        const ls = typeof localStorage !== 'undefined' ? localStorage : null;
        if (ls) for (const k of Object.keys(ls)) if (k === 'ibtd.auth' || k.startsWith('ibtd.auth-')) ls.removeItem(k);
      } catch { /* blocked */ }
    }
  }

  // ---------- villages ----------
  async listBases() {
    return check(await this.db.from('bases').select(BASE_COLUMNS).order('created_at')).map(toBase);
  }

  async createBase(fields) {
    // The owner is named, not left to the login the request carries: if another tab switched accounts, the
    // security rules refuse it instead of filing the village under the other account.
    if (!this.userId) throw new Error('Your login expired. Log in again.');
    return toBase(check(await this.db.from('bases').insert({ ...baseColumns(fields), user_id: this.userId }).select(BASE_COLUMNS).single()));
  }

  /**
   * Change a village. Returns { updatedAt }: its revision now. `updated_at` is the village's revision: it
   * changes only when its save or checkpoint does (the bases_stamp trigger sets it on the server; before that
   * migration runs, this sends it). With `expected` (the revision this tab loaded or last saved), the change
   * only applies on top of that revision: if another tab or device saved in between, it throws a conflict
   * error (isConflictError) and changes nothing. Throws when no row matched (the village was deleted
   * elsewhere, or the login changed), so it stays unsent.
   */
  async updateBase(id, fields, { expected = null } = {}) {
    if (!this.userId) throw new Error('Your login expired. Log in again.');
    const uid = this.userId;
    const cols = baseColumns(fields);
    if (fields.save !== undefined || fields.checkpoint !== undefined) cols.updated_at = new Date().toISOString();
    let q = this.db.from('bases').update(cols).eq('id', id).eq('user_id', uid);
    if (expected) q = q.eq('updated_at', expected);
    const rows = check(await q.select('id, updated_at'));
    if (rows && rows.length) return { updatedAt: rows[0].updated_at };
    if (expected) {
      // Nothing matched: a newer revision (another tab or device saved), or the village is gone.
      const now = check(await this.db.from('bases').select('id, updated_at').eq('id', id).eq('user_id', uid).maybeSingle());
      if (now) throw conflictError(now.updated_at);
    }
    throw new Error('That village no longer exists.');
  }

  async deleteBase(id) {
    check(await this.db.from('bases').delete().eq('id', id));
  }

  // ---------- stats, achievements, leaderboard ----------
  async getStats() {
    const r = check(await this.db.from('player_stats').select('best_wave, best_town_hall, counters').maybeSingle());
    return r ? { bestWave: r.best_wave, bestTownHall: r.best_town_hall, counters: r.counters || {} } : { bestWave: 0, bestTownHall: 0, counters: {} };
  }

  /** Save the stats. Returns what the server kept ({ bestWave }): it only counts waves it has verified. */
  async saveStats(stats) {
    const r = check(await this.db.from('player_stats').upsert({
      user_id: this.userId, best_wave: stats.bestWave, best_town_hall: stats.bestTownHall, counters: stats.counters
    }).select('best_wave').maybeSingle());
    return { bestWave: r ? r.best_wave : null };
  }

  async listAchievements() {
    return check(await this.db.from('achievements').select('achievement, base_id, earned_at, claimed_at'))
      .map((r) => ({ id: r.achievement, baseId: r.base_id, earnedAt: r.earned_at, claimedAt: r.claimed_at }));
  }

  /** Record earned achievements ([{ id, baseId }]); ones already recorded are left alone. */
  async earnAchievements(list) {
    if (!list.length) return;
    const rows = list.map((a) => ({ user_id: this.userId, achievement: a.id, base_id: a.baseId || null }));
    check(await this.db.from('achievements').upsert(rows, { onConflict: 'user_id,achievement', ignoreDuplicates: true }));
  }

  async claimAchievement(id) {
    check(await this.db.from('achievements').update({ claimed_at: new Date().toISOString() }).eq('user_id', this.userId).eq('achievement', id).is('claimed_at', null));
  }

  /**
   * The top `limit` villages by best wave (v0.8: one row per village), plus the caller's own best village if it is lower:
   * [{ rank, username, villageName, bestWave, bestTownHall, isMe }]. `villageName` is null when the owner hides their
   * villages. Before supabase/migration-2026-11-22-v0.8.sql is run, falls back to one row per player
   * (get_leaderboard, no village names).
   */
  async leaderboard(limit = 10) {
    const { data, error } = await this.db.rpc('get_village_leaderboard', { lim: limit });
    if (!error) {
      return (data || []).map((r) => ({
        rank: Number(r.rank), username: r.username, villageName: r.village_name || null,
        bestWave: r.best_wave, bestTownHall: r.town_hall, isMe: !!r.is_me
      }));
    }
    if (error.code !== 'PGRST202' && !/could not find the function/i.test(error.message || '')) throw friendlyError(error);
    return check(await this.db.rpc('get_leaderboard', { lim: limit })).map((r) => ({
      rank: Number(r.rank), username: r.username, villageName: null, bestWave: r.best_wave, bestTownHall: r.best_town_hall, isMe: !!r.is_me
    }));
  }

  // ---------- other players (v0.7; supabase/migration-2026-11-21-player-profiles.sql) ----------
  /** Players matching the search: [{ username, bestWave, bestTownHall, achievements, isMe }]. */
  async searchPlayers({ query = '', minWave = 0, maxWave = null, townHall = null, sort = 'wave', limit = 30 } = {}) {
    const rows = check(await this.db.rpc('search_players', { q: query || '', min_wave: minWave || 0, max_wave: maxWave, hall: townHall, sort, lim: limit }));
    return (rows || []).map((r) => ({ username: r.username, bestWave: r.best_wave, bestTownHall: r.best_town_hall, achievements: r.achievements, isMe: !!r.is_me }));
  }

  /** A player's card, or null (see LocalBackend.playerProfile). */
  async playerProfile(username) {
    const r = check(await this.db.rpc('get_player_profile', { name: username }));
    if (!r) return null;
    return {
      username: r.username, joinedAt: r.joined_at, publicBases: !!r.public_bases, isMe: !!r.is_me,
      bestWave: r.best_wave || 0, bestTownHall: r.best_town_hall || 0, rank: Number(r.rank) || null,
      achievements: (r.achievements || []).map((a) => ({ id: a.id, earnedAt: a.earned_at })),
      bases: (r.bases || []).map((b) => ({ id: b.id, name: b.name, townHall: b.town_hall, bestWave: b.best_wave, wave: b.wave }))
    };
  }

  /** One village to look at: { id, name, username, townHall, bestWave, save }; refused if its owner hides them. */
  async playerBase(id) {
    const r = check(await this.db.rpc('get_player_base', { base: id }));
    if (!r) throw new Error('That village can’t be viewed.');
    return { id: r.id, name: r.name, username: r.username, townHall: r.town_hall, bestWave: r.best_wave, save: r.save };
  }

  /** Whether others can view your villages (Settings). */
  async getPublicBases() {
    const r = check(await this.db.from('profiles').select('public_bases').eq('id', this.userId).maybeSingle());
    return !r || r.public_bases !== false;
  }

  async setPublicBases(on) {
    check(await this.db.rpc('set_public_bases', { on_: !!on }));
  }
}
