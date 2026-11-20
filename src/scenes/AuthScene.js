// Login screen (first screen after loading). Picks up a saved login and goes straight to the title screen;
// otherwise shows the account window over the title art: Log In (email + password) and Sign Up (username,
// email, password, confirm). Without a server set up (src/backendConfig.js) it offers offline play.
// Passwords go straight to Supabase over HTTPS (stored there only as a bcrypt hash). New passwords need
// PASSWORD_MIN characters with a letter and a number. With TURNSTILE_SITE_KEY set, a Cloudflare Turnstile
// "are you human?" box sits beside the button and its token goes along with each log in / sign up.
// When the server can't be reached (no connection, or it's down), Retry and Play Offline appear under the
// window. Play Offline opens the last account that logged in on this device (its device copies, unsent until
// it logs in again: session.startOffline), or this browser's own save if there is none. Whenever the server
// answers, a login is still required.
import Phaser from 'phaser';
import { session } from '../net/account.js';
import { USERNAME_RE, EMAIL_RE, PASSWORD_MIN, passwordProblem, isNetworkError } from '../net/session.js';
import { TURNSTILE_SITE_KEY } from '../backendConfig.js';
import { Button } from '../objects/Button.js';
import { addFullscreenButton } from '../objects/FullscreenButton.js';
import { addTextField } from '../objects/TextField.js';
import { drawWindow, drawHudPill } from '../objects/uiDraw.js';
import { MUSIC } from '../assetKeys.js';
import { showTitleBackdrop } from './TitleBackdropScene.js';
import { playMusic } from '../audio.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

const W = 520;
const TOP = 290;            // window top: just under the logo in the title art
const HEADER = 56;
const ROW0 = 140;           // first field row, from the window top
const ROW_GAP = 54;
const LABEL_W = 150;
const LAST_EMAIL = 'ibtd.lastEmail';
const CAPTCHA_ROW = 18;     // extra window height when the human check sits beside the button
const OFFLINE_ROW = 66;     // room under the window for Retry / Play Offline

/** Loads Cloudflare Turnstile once (only when a site key is set). */
let turnstileLoading = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoading) {
    turnstileLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { turnstileLoading = null; reject(new Error('Couldn\u2019t load the \u201cI\u2019m human\u201d check. Check your connection.')); };
      document.head.appendChild(s);
    });
  }
  return turnstileLoading;
}

export class AuthScene extends Phaser.Scene {
  constructor() {
    super('AuthScene');
  }

  init(data) {
    this.message = (data && data.message) || '';
    this.tab = (data && data.tab) || 'login';
    this.busy = false;
    this.fields = null;
    this.msg = null;
    this.submitBtn = null;
    this.captchaToken = null;
    this.captchaId = null;
    this.canResend = false;
    this.unreachable = false; // the server couldn't be reached: offer Retry / Play Offline
    this.typedEmail = '';
  }

  create() {
    const { width, height } = this.scale;
    showTitleBackdrop(this); // the animated title picture, drawn under this scene
    this.add.rectangle(0, 0, width, height, 0x000000, 0.25).setOrigin(0);
    playMusic(this, MUSIC.title);
    this.ui = [];
    addFullscreenButton(this, width - 36, 34);

    if (!session.configured) { this.showOffline(); return; }
    if (session.loggedIn) { this.scene.start('TitleScene'); return; }

    // A saved login skips the form.
    const wait = this.pill('Connecting…');
    session.restore().then((user) => {
      if (!this.sys.isActive()) return;
      if (user) { this.scene.start('TitleScene', { justLoggedIn: true }); return; }
      wait.forEach((o) => o.destroy());
      this.showForm();
    }).catch((e) => {
      if (!this.sys.isActive()) return;
      wait.forEach((o) => o.destroy());
      this.message = e.message || 'Can’t reach the server.';
      this.unreachable = isNetworkError(e);
      this.showForm();
    });
  }

  /** A small dark caption pill centered at y. Returns its objects. */
  pill(text, y = 470) {
    const t = this.add.text(this.scale.width / 2, y, text, textStyle(22)).setOrigin(0.5).setDepth(2);
    const g = this.add.graphics().setDepth(1);
    drawHudPill(g, t.x - t.width / 2 - 22, y - 20, t.width + 44, 40);
    return [t, g];
  }

  clearUi() {
    this.removeCaptcha();
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
  }

  // ---------- "are you human?" check ----------
  get captchaOn() { return !!TURNSTILE_SITE_KEY && session.backend.kind === 'supabase'; }

  /** The Turnstile box (300 x 65) with its left edge at x, centered on y. */
  addCaptcha(x, y) {
    const box = document.createElement('div');
    Object.assign(box.style, { width: '300px', height: '65px' });
    this.keep(this.add.dom(x, y, box).setOrigin(0, 0.5));
    this.captchaToken = null;
    loadTurnstile().then((ts) => {
      if (!box.isConnected || !this.sys.isActive()) return;
      this.captchaId = ts.render(box, {
        sitekey: TURNSTILE_SITE_KEY, theme: 'light', size: 'normal', action: this.tab === 'signup' ? 'signup' : 'login',
        callback: (token) => { this.captchaToken = token; },
        'expired-callback': () => { this.captchaToken = null; },
        'error-callback': () => { this.captchaToken = null; }
      });
    }).catch((e) => this.showMessage(e.message));
  }

  /** Tokens work once: get a fresh one after every try. */
  resetCaptcha() {
    this.captchaToken = null;
    if (this.captchaId !== null && window.turnstile) { try { window.turnstile.reset(this.captchaId); } catch { /* gone */ } }
  }

  removeCaptcha() {
    if (this.captchaId !== null && window.turnstile) { try { window.turnstile.remove(this.captchaId); } catch { /* gone */ } }
    this.captchaId = null;
    this.captchaToken = null;
  }

  keep(o) { this.ui.push(o); return o; }

  // ---------- no server ----------
  showOffline() {
    const cx = this.scale.width / 2, h = 300;
    drawWindow(this.add.graphics(), cx - W / 2, TOP, W, h, { header: HEADER });
    this.add.text(cx, TOP + 4 + HEADER / 2, 'Online Play', textStyle(30)).setOrigin(0.5);
    this.add.text(cx, TOP + 120, 'Accounts, achievements and the leaderboard\nneed the game’s server, which isn’t set up yet.',
      bodyStyle(19, COLORS.ink, { align: 'center', lineSpacing: 6 })).setOrigin(0.5);
    this.add.text(cx, TOP + 180, 'You can still play: your village is saved in this browser.', bodyStyle(16, COLORS.inkDim)).setOrigin(0.5);
    new Button(this, cx, TOP + h - 50, 280, 56, 'Play Offline', () => this.scene.start('TitleScene', { offline: true }), { color: COLORS.buttonGood, fontSize: 23 });
  }

  // ---------- log in / sign up ----------
  showForm() {
    this.clearUi();
    const cx = this.scale.width / 2;
    const signup = this.tab === 'signup';
    const rows = signup ? 4 : 2;
    const msgY = ROW0 + (rows - 1) * ROW_GAP + 40;
    const h = msgY + 96 + (this.captchaOn ? CAPTCHA_ROW : 0);
    const below = this.unreachable ? OFFLINE_ROW : 0; // Retry / Play Offline under the window
    const top = Math.min(TOP, this.scale.height - 12 - h - below);
    const px = cx - W / 2;

    const g = this.keep(this.add.graphics());
    drawWindow(g, px, top, W, h, { header: HEADER });
    this.keep(this.add.text(cx, top + 4 + HEADER / 2, signup ? 'Create Account' : 'Welcome Back!', textStyle(30)).setOrigin(0.5));

    // Tabs
    const tabW = 170, tabY = top + HEADER + 34;
    for (const [key, label, dx] of [['login', 'Log In', -tabW / 2 - 6], ['signup', 'Sign Up', tabW / 2 + 6]]) {
      const b = this.keep(new Button(this, cx + dx, tabY, tabW, 38, label, () => {
        if (this.busy || this.tab === key) return;
        this.tab = key; this.message = ''; this.showForm();
      }, { fontSize: 19, radius: 10, color: this.tab === key ? COLORS.buttonGood : COLORS.buttonDark }));
      void b;
    }

    // Fields
    const fx = px + 28 + LABEL_W, fw = W - 56 - LABEL_W;
    const fields = {};
    const row = (i, key, label, opts) => {
      const y = top + ROW0 + i * ROW_GAP;
      this.keep(this.add.text(px + 28, y, label, bodyStyle(19)).setOrigin(0, 0.5));
      fields[key] = this.keep(addTextField(this, fx, y, fw, { ...opts, onEnter: () => this.submit() }));
    };
    const lastEmail = (() => { try { return localStorage.getItem(LAST_EMAIL) || ''; } catch { return ''; } })();
    if (signup) {
      row(0, 'username', 'Username', { placeholder: '3-16 letters, numbers, _', maxLength: 16, autocomplete: 'username' });
      row(1, 'email', 'Email', { type: 'email', placeholder: 'you@example.com', maxLength: 120, autocomplete: 'email' });
      row(2, 'password', 'Password', { type: 'password', placeholder: `${PASSWORD_MIN}+ characters, letters & numbers`, maxLength: 72, autocomplete: 'new-password' });
      row(3, 'confirm', 'Confirm', { type: 'password', placeholder: 'Type it again', maxLength: 72, autocomplete: 'new-password' });
    } else {
      row(0, 'email', 'Email', { type: 'email', placeholder: 'you@example.com', maxLength: 120, autocomplete: 'email', value: this.typedEmail || lastEmail });
      row(1, 'password', 'Password', { type: 'password', maxLength: 72, autocomplete: 'current-password' });
    }
    this.fields = fields;

    const good = /check your email|sent|almost done/i.test(this.message);
    this.msg = this.keep(this.add.text(cx, top + msgY, this.message, bodyStyle(16, good ? COLORS.inkGood : COLORS.inkBad, { align: 'center', wordWrap: { width: W - 50 } })).setOrigin(0.5));
    // "Confirm your email first": the message becomes a link that sends the email again.
    this.msg.on('pointerdown', () => { if (this.canResend) this.resend(); });
    this.setResend(this.canResend);
    const label = signup ? 'Create Account' : 'Log In';
    if (this.captchaOn) {
      // Human check on the left, a narrower button on the right.
      const by = top + h - 50;
      this.addCaptcha(px + 22, by);
      this.submitBtn = this.keep(new Button(this, px + W - 22 - 86, by, 172, 56, label, () => this.submit(), { color: COLORS.buttonGood, fontSize: 21 }));
    } else {
      this.submitBtn = this.keep(new Button(this, cx, top + h - 46, 280, 56, label, () => this.submit(), { color: COLORS.buttonGood, fontSize: 23 }));
    }

    if (this.unreachable) this.showOfflineRow(cx, top + h + OFFLINE_ROW / 2 + 2);

    if (session.backend.kind === 'local') {
      const t = this.keep(this.add.text(16, this.scale.height - 28, 'Dev mode: accounts are kept in this browser only (local backend, no Supabase)', textStyle(15, COLORS.textGold)).setOrigin(0, 1));
      void t;
    }
    this.time.delayedCall(60, () => {
      const first = signup ? fields.username : (fields.email.value ? fields.password : fields.email);
      if (first && first.active) first.focus();
    });
  }

  /** The server can't be reached: try again, or play from this device. */
  showOfflineRow(cx, y) {
    const who = session.offlineAccount();
    this.keep(new Button(this, cx - 130, y, 220, 54, 'Retry', () => {
      if (!this.busy) this.scene.restart({ tab: this.tab });
    }, { color: COLORS.buttonBlue, fontSize: 21 }));
    this.keep(new Button(this, cx + 130, y, 260, 54, 'Play Offline', () => this.playOffline(), { color: COLORS.button, fontSize: 21 })
      .setLabel('Play Offline', who ? `as ${who.username}, from this device` : 'with this browser’s save'));
  }

  /** The last account that logged in here plays its device copies (sent at its next login); else the browser's own save. */
  playOffline() {
    if (this.busy) return;
    if (session.startOffline()) this.scene.start('TitleScene');
    else this.scene.start('TitleScene', { offline: true });
  }

  /** A log in / sign up couldn't reach the server: say so and offer Retry / Play Offline. */
  serverUnreachable(e) {
    if (!isNetworkError(e)) return false;
    this.typedEmail = this.fields && this.fields.email ? this.fields.email.value.trim() : '';
    this.unreachable = true;
    this.message = e.message || 'Can’t reach the server. Check your connection.';
    this.showForm();
    return true;
  }

  setBusy(busy, label = '') {
    this.busy = busy;
    if (!this.submitBtn) return;
    this.submitBtn.setEnabled(!busy);
    this.submitBtn.setLabel(busy ? label : (this.tab === 'signup' ? 'Create Account' : 'Log In'));
    for (const f of Object.values(this.fields || {})) f.node.disabled = busy;
  }

  showMessage(text, good = false) {
    this.message = text;
    if (this.msg && this.msg.active) this.msg.setColor(good ? COLORS.inkGood : COLORS.inkBad).setText(text);
    this.setResend(/confirm your email/i.test(text));
  }

  /** Turn the message into a "send it again" link (or back). */
  setResend(on) {
    this.canResend = on;
    if (!this.msg || !this.msg.active) return;
    if (on) {
      if (!/send it again/i.test(this.msg.text)) this.msg.setText(`${this.message}\nClick here to send it again.`);
      this.msg.setInteractive({ useHandCursor: true });
    } else if (this.msg.input) {
      this.msg.disableInteractive();
    }
  }

  async resend() {
    const email = this.fields && this.fields.email.value.trim();
    if (!email || this.busy) return;
    if (this.captchaOn && !this.captchaToken) { this.showMessage('Tick the \u201cI\u2019m human\u201d box first, then click here again.'); this.canResend = true; this.setResend(true); return; }
    this.busy = true;
    try {
      await session.backend.resendConfirmation(email, this.captchaToken);
      this.showMessage(`Sent! Check ${email} for the link (and your spam folder).`, true);
    } catch (e) {
      this.showMessage(e.message || String(e));
    } finally {
      this.busy = false;
      this.resetCaptcha();
    }
  }

  async submit() {
    if (this.busy || !this.fields) return;
    const f = this.fields;
    const email = f.email.value.trim();
    const password = f.password.value;
    if (this.tab === 'signup') {
      const username = f.username.value.trim();
      if (!USERNAME_RE.test(username)) return this.showMessage('Username: 3-16 letters, numbers or _ (no spaces).');
      if (!EMAIL_RE.test(email)) return this.showMessage('That email address doesn’t look right.');
      const weak = passwordProblem(password);
      if (weak) return this.showMessage(weak);
      if (password !== f.confirm.value) return this.showMessage('The passwords don’t match.');
      if (this.captchaOn && !this.captchaToken) return this.showMessage('Tick the \u201cI\u2019m human\u201d box first.');
      this.setBusy(true, 'Creating…');
      try {
        if (!await session.backend.usernameAvailable(username)) throw new Error('That username is taken. Try another.');
        const r = await session.signUp(email, password, username, { captchaToken: this.captchaToken });
        this.rememberEmail(email);
        if (r.needsConfirm) {
          this.setBusy(false);
          this.tab = 'login';
          this.message = `Almost done! Open the link we sent to ${email} to finish signing up (check spam too).`;
          this.showForm();
          return;
        }
        this.scene.start('TitleScene', { justLoggedIn: true });
      } catch (e) {
        this.setBusy(false);
        this.resetCaptcha();
        if (this.serverUnreachable(e)) return;
        this.showMessage(e.message || String(e));
      }
      return;
    }
    if (!EMAIL_RE.test(email)) return this.showMessage('Type the email you signed up with.');
    if (!password) return this.showMessage('Type your password.');
    if (this.captchaOn && !this.captchaToken) return this.showMessage('Tick the \u201cI\u2019m human\u201d box first.');
    this.setBusy(true, 'Logging in…');
    try {
      await session.signIn(email, password, { captchaToken: this.captchaToken });
      this.rememberEmail(email);
      this.scene.start('TitleScene', { justLoggedIn: true });
    } catch (e) {
      this.setBusy(false);
      this.resetCaptcha();
      if (this.serverUnreachable(e)) return;
      this.showMessage(e.message || String(e));
    }
  }

  rememberEmail(email) {
    try { localStorage.setItem(LAST_EMAIL, email); } catch { /* blocked */ }
  }
}
