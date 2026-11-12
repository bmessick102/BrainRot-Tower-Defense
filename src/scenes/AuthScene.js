// Login screen (first screen after loading). Picks up a saved login and goes straight to the title screen;
// otherwise shows the account window over the title art: Log In (email + password) and Sign Up (username,
// email, password, confirm). Without a server set up (src/backendConfig.js) it offers offline play.
import Phaser from 'phaser';
import { session } from '../net/account.js';
import { USERNAME_RE, EMAIL_RE } from '../net/session.js';
import { Button } from '../objects/Button.js';
import { addTextField } from '../objects/TextField.js';
import { drawWindow, drawHudPill } from '../objects/uiDraw.js';
import { TEX, MUSIC } from '../assetKeys.js';
import { playMusic } from '../audio.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

const W = 520;
const TOP = 290;            // window top: just under the logo in the title art
const HEADER = 56;
const ROW0 = 140;           // first field row, from the window top
const ROW_GAP = 54;
const LABEL_W = 150;
const LAST_EMAIL = 'ibtd.lastEmail';

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
  }

  create() {
    const { width, height } = this.scale;
    const bg = this.add.image(width / 2, height / 2, TEX.titleBackground);
    bg.setScale(Math.max(width / bg.frame.width, height / bg.frame.height));
    this.add.rectangle(0, 0, width, height, 0x000000, 0.25).setOrigin(0);
    playMusic(this, MUSIC.title);
    this.ui = [];

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
    this.ui.forEach((o) => o.destroy());
    this.ui = [];
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
    const h = msgY + 96;
    const top = Math.min(TOP, this.scale.height - 12 - h);
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
      row(2, 'password', 'Password', { type: 'password', placeholder: 'At least 6 characters', maxLength: 72, autocomplete: 'new-password' });
      row(3, 'confirm', 'Confirm', { type: 'password', placeholder: 'Type it again', maxLength: 72, autocomplete: 'new-password' });
    } else {
      row(0, 'email', 'Email', { type: 'email', placeholder: 'you@example.com', maxLength: 120, autocomplete: 'email', value: lastEmail });
      row(1, 'password', 'Password', { type: 'password', maxLength: 72, autocomplete: 'current-password' });
    }
    this.fields = fields;

    const good = /check your email|created/i.test(this.message);
    this.msg = this.keep(this.add.text(cx, top + msgY, this.message, bodyStyle(16, good ? COLORS.inkGood : COLORS.inkBad, { align: 'center', wordWrap: { width: W - 50 } })).setOrigin(0.5));
    this.submitBtn = this.keep(new Button(this, cx, top + h - 46, 280, 56, signup ? 'Create Account' : 'Log In', () => this.submit(), { color: COLORS.buttonGood, fontSize: 23 }));

    if (session.backend.kind === 'local') {
      const t = this.keep(this.add.text(16, this.scale.height - 16, 'Dev mode: accounts are kept in this browser only (no Supabase keys yet)', textStyle(15, COLORS.textGold)).setOrigin(0, 1));
      void t;
    }
    this.time.delayedCall(60, () => {
      const first = signup ? fields.username : (fields.email.value ? fields.password : fields.email);
      if (first && first.active) first.focus();
    });
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
      if (password.length < 6) return this.showMessage('Password must be at least 6 characters.');
      if (password !== f.confirm.value) return this.showMessage('The passwords don’t match.');
      this.setBusy(true, 'Creating…');
      try {
        if (!await session.backend.usernameAvailable(username)) throw new Error('That username is taken. Try another.');
        const r = await session.signUp(email, password, username);
        this.rememberEmail(email);
        if (r.needsConfirm) {
          this.setBusy(false);
          this.tab = 'login';
          this.message = 'Account created! Check your email to confirm it, then log in.';
          this.showForm();
          return;
        }
        this.scene.start('TitleScene', { justLoggedIn: true });
      } catch (e) {
        this.setBusy(false);
        this.showMessage(e.message || String(e));
      }
      return;
    }
    if (!EMAIL_RE.test(email)) return this.showMessage('Type the email you signed up with.');
    if (!password) return this.showMessage('Type your password.');
    this.setBusy(true, 'Logging in…');
    try {
      await session.signIn(email, password);
      this.rememberEmail(email);
      this.scene.start('TitleScene', { justLoggedIn: true });
    } catch (e) {
      this.setBusy(false);
      this.showMessage(e.message || String(e));
    }
  }

  rememberEmail(email) {
    try { localStorage.setItem(LAST_EMAIL, email); } catch { /* blocked */ }
  }
}
