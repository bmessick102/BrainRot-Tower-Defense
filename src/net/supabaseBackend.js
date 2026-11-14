// The online backend: Supabase Auth (email + password) and the tables in supabase/schema.sql.
// Every method returns plain camelCase objects and throws an Error with a player-friendly message.
import { createClient } from '@supabase/supabase-js';

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
    [/rate limit|too many requests/i, 'Too many tries. Wait a minute and try again.'],
    [/failed to fetch|networkerror|network request failed|load failed|fetch/i, 'Can’t reach the server. Check your connection.'],
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
  }

  /** The logged-in player from a saved session, or null. */
  async currentUser() {
    const { data, error } = await this.db.auth.getSession();
    if (error || !data || !data.session) return null;
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
    await this.db.auth.signOut();
  }

  // ---------- villages ----------
  async listBases() {
    return check(await this.db.from('bases').select(BASE_COLUMNS).order('created_at')).map(toBase);
  }

  async createBase(fields) {
    return toBase(check(await this.db.from('bases').insert(baseColumns(fields)).select(BASE_COLUMNS).single()));
  }

  async updateBase(id, fields) {
    check(await this.db.from('bases').update({ ...baseColumns(fields), updated_at: new Date().toISOString() }).eq('id', id));
  }

  async deleteBase(id) {
    check(await this.db.from('bases').delete().eq('id', id));
  }

  // ---------- stats, achievements, leaderboard ----------
  async getStats() {
    const r = check(await this.db.from('player_stats').select('best_wave, best_town_hall, counters').maybeSingle());
    return r ? { bestWave: r.best_wave, bestTownHall: r.best_town_hall, counters: r.counters || {} } : { bestWave: 0, bestTownHall: 0, counters: {} };
  }

  async saveStats(stats) {
    check(await this.db.from('player_stats').upsert({
      user_id: this.userId, best_wave: stats.bestWave, best_town_hall: stats.bestTownHall, counters: stats.counters
    }));
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
    check(await this.db.from('achievements').update({ claimed_at: new Date().toISOString() }).eq('achievement', id).is('claimed_at', null));
  }

  /** Top `limit` players by furthest wave, plus the caller's own row: [{ rank, username, bestWave, bestTownHall, isMe }]. */
  async leaderboard(limit = 10) {
    return check(await this.db.rpc('get_leaderboard', { lim: limit })).map((r) => ({
      rank: Number(r.rank), username: r.username, bestWave: r.best_wave, bestTownHall: r.best_town_hall, isMe: !!r.is_me
    }));
  }
}
