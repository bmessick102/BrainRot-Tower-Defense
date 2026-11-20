// Title: the START GAME sign, with a caption saying what it starts, and a row of buttons below.
// Logged in (the usual way): START GAME plays your current village (or makes your first one); the row has
// Villages (pick, make, delete), Achievements, Leaderboard, How to Play, Settings; your name and Log Out
// sit top-left. Offline (no server set up): START GAME continues the browser's save or starts fresh, and
// the row is New Game (only with a save; asks before overwriting), How to Play, Settings.
// Playing offline as an account (the server couldn't be reached; session.offline): the logged-in layout, on
// that account's device copies, with a Reconnect button and a note that progress is sent at the next login.
import Phaser from 'phaser';
import { loadGame, deleteGame } from '../logic/save.js';
import { getStorage } from '../state/GameState.js';
import { Button } from '../objects/Button.js';
import { addFullscreenButton } from '../objects/FullscreenButton.js';
import { TEX, MUSIC, SFX } from '../assetKeys.js';
import { IMAGE_FILES } from '../assetManifest.js';
import { playMusic, playSfx } from '../audio.js';
import { drawWindow, drawHudPill, fitIcon } from '../objects/uiDraw.js';
import { SettingsWindow } from '../objects/SettingsWindow.js';
import { nightWaveNumber } from '../logic/waves.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { session } from '../net/account.js';
import { BASE_NAME_MAX } from '../net/session.js';
import { VillagesWindow } from '../objects/VillagesWindow.js';
import { AchievementsWindow } from '../objects/AchievementsWindow.js';
import { LeaderboardWindow } from '../objects/LeaderboardWindow.js';
import { confirmDialog, promptDialog } from '../objects/Modal.js';
import { drawBadge } from '../objects/uiDraw.js';
import { leagueFor } from '../logic/leagues.js';
import { showTitleBackdrop } from './TitleBackdropScene.js';
import { takeTakeover } from '../objects/LockOverlay.js';

export class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  init(data) {
    this.loggingOut = false;
    this.opening = false;
    this.windowOpen = false;
    this.offline = !!(data && data.offline) || !session.configured; // no server set up: always offline
    this.justLoggedIn = !!(data && data.justLoggedIn);
    this.notice = (data && data.notice) || '';
  }

  create() {
    const { width, height } = this.scale;
    // Online play needs a login; offline play (no server set up) uses the browser's own save.
    if (!this.offline && !session.loggedIn) {
      this.scene.start('AuthScene');
      return;
    }
    this.online = !this.offline;
    this.storage = getStorage();
    this.base = this.online ? session.activeBase : null;
    // Logged in with no village open, the storage would fall through to the browser's old save: skip it.
    const save = this.online && !this.base ? { status: 'none', data: null } : loadGame(this.storage);
    this.hasSave = save.status === 'ok';
    this.settings = null;
    this.windowOpen = false;

    // Background: the animated title picture (its own scene, drawn under this one), with a soft shade toward
    // the bottom behind the buttons.
    showTitleBackdrop(this);
    const shadeH = 240, steps = 24, shadeG = this.add.graphics();
    for (let i = 0; i < steps; i++) { // whole-pixel strips that never overlap (overlaps show as lines)
      const y0 = Math.round((i * shadeH) / steps), y1 = Math.round(((i + 1) * shadeH) / steps);
      shadeG.fillStyle(0x000000, 0.5 * ((i + 1) / steps) ** 1.6).fillRect(0, height - shadeH + y0, width, y1 - y0);
    }

    // The title picture's logo already shows the game name; without the logo art it's written out.
    if (!IMAGE_FILES.some((f) => f.key === 'title_logo')) {
      this.add.text(width / 2, 150, 'Italian Brainrot\nTower Defense', textStyle(64, COLORS.textGold, { align: 'center' })).setOrigin(0.5);
    }

    this.buildStartButton(width / 2, 478);
    addFullscreenButton(this, width - 36, 34);
    // Say what START GAME does (and where you are); a broken save gets a warning.
    let caption, bad = save.status === 'invalid';
    if (this.notice) { caption = this.notice; bad = true; }
    else if (this.online) {
      const b = this.base;
      caption = !b ? 'No village yet  ·  START GAME makes your first one'
        : this.hasSave ? `${b.name}  ·  Wave ${Math.max(1, nightWaveNumber(save.data))}  ·  Village Hall ${save.data.townHallLevel}`
          : bad ? `${b.name}  ·  save could not be loaded  ·  starts over` : `${b.name}  ·  new village`;
    } else {
      caption = this.hasSave ? `Continue  ·  Wave ${nightWaveNumber(save.data)}  ·  Village Hall ${save.data.townHallLevel}`
        : bad ? 'Save could not be loaded  ·  starts a new game' : null;
    }
    if (caption) {
      const cap = this.add.text(width / 2, 596, caption, textStyle(19, bad ? COLORS.textBad : COLORS.text)).setOrigin(0.5);
      const pill = this.add.graphics();
      drawHudPill(pill, width / 2 - cap.width / 2 - 18, 596 - 17, cap.width + 36, 34);
      cap.setDepth(1); // above the pill drawn after it
    }

    const row = this.online ? [
      ['Villages', () => this.openVillages(), COLORS.button],
      ['Achievements', () => this.openAchievements(), COLORS.buttonGood],
      ['Leaderboard', () => this.openLeaderboard(), 0x8e5bd6],
      ['How to Play', () => this.scene.start('HowToPlayScene'), COLORS.buttonBlue],
      ['Settings', () => this.openSettings(), COLORS.buttonDark]
    ] : [
      // New Game only matters when there's a save to replace; without one, START GAME already does it.
      ...(this.hasSave ? [['New Game', () => this.confirmNewGame(), COLORS.button]] : []),
      ['How to Play', () => this.scene.start('HowToPlayScene'), COLORS.buttonBlue],
      ['Settings', () => this.openSettings(), COLORS.buttonDark]
    ];
    const bw = this.online ? 192 : 200, gap = this.online ? 16 : 22;
    const total = row.length * bw + (row.length - 1) * gap;
    this.rowButtons = {};
    row.forEach(([label, fn, color], i) => {
      this.rowButtons[label] = new Button(this, width / 2 - total / 2 + bw / 2 + i * (bw + gap), 656, bw, 52, label, () => { if (!this.windowOpen) fn(); }, { fontSize: 21, color });
    });

    if (this.online) {
      this.buildAccountPill();
      this.drawClaimBadge();
      // "Reload here and take over" (LockOverlay.js): straight back into that village, taking it from the other tab.
      const takeover = takeTakeover();
      if (takeover && session.baseById(takeover)) { this.playVillage(session.baseById(takeover)); return; }
      // First login on a device that has a village from before accounts: offer to bring it along.
      if (this.justLoggedIn && !session.bases.length && session.legacyVillage() && !session.legacyDeclined) this.offerImport();
    } else if (session.configured) {
      // Playing this browser's own save because the server couldn't be reached: a way back to the login.
      new Button(this, 90, 32, 150, 42, 'Log In', () => { if (!this.windowOpen) this.scene.start('AuthScene'); }, { color: COLORS.buttonBlue, fontSize: 18, radius: 10 });
    }

    playMusic(this, MUSIC.title);
  }

  // ---------- account (online) ----------
  /** Top-left: who's logged in, and Log Out. */
  buildAccountPill() {
    // Your league badge (from your furthest wave) on the left of the pill.
    const league = leagueFor(session.stats.bestWave);
    const hasBadge = !!(league && this.textures.exists(league.texture));
    const tx = hasBadge ? 70 : 30;
    if (hasBadge) {
      const img = this.add.image(40, 32, league.texture).setDepth(2);
      fitIcon(img, 54);
    }
    const name = this.add.text(tx, 40, session.user.username, textStyle(22)).setOrigin(0, 0.5).setDepth(1);
    const small = this.add.text(tx, 18, hasBadge ? `${league.name} League` : 'Signed in as', textStyle(13, hasBadge ? COLORS.textGold : COLORS.textDim)).setOrigin(0, 0.5).setDepth(1);
    const w = Math.max(name.width, small.width) + tx + 4 - 14;
    drawHudPill(this.add.graphics(), 14, 6, w, 52);
    new Button(this, 14 + w + 70, 32, 120, 42, 'Log Out', () => this.logOut(), { color: COLORS.buttonDark, fontSize: 18, radius: 10 });
    if (session.offline) {
      // Played from this device's copies (the server couldn't be reached): Reconnect tries the login again.
      new Button(this, 14 + w + 70 + 130, 32, 130, 42, 'Reconnect', () => {
        if (this.windowOpen || this.loggingOut) return;
        session.endOffline();
        this.scene.start('AuthScene');
      }, { color: COLORS.buttonBlue, fontSize: 18, radius: 10 });
      this.add.text(16, 72, 'Playing offline: progress stays on this device and is sent when you log in again', textStyle(14, COLORS.textBad)).setOrigin(0, 0.5);
    } else if (session.syncState === 'offline') {
      this.add.text(16, 72, 'Not connected: progress is kept on this device for now', textStyle(14, COLORS.textBad)).setOrigin(0, 0.5);
    }
  }

  /** Red badge on Achievements: rewards ready to claim. */
  drawClaimBadge() {
    const n = session.unclaimed().length, btn = this.rowButtons.Achievements;
    if (!n || !btn) return;
    const x = btn.x + btn.btnW / 2 - 8, y = btn.y - btn.btnH / 2 + 2;
    drawBadge(this.add.graphics().setDepth(5), x, y, 13);
    this.add.text(x, y - 1, String(n), textStyle(15)).setOrigin(0.5).setDepth(6);
  }

  async logOut() {
    if (this.windowOpen || this.loggingOut) return;
    this.loggingOut = true;
    const t = this.add.text(this.scale.width / 2, 540, 'Logging out…', textStyle(22)).setOrigin(0.5).setDepth(50);
    await session.signOut();
    if (t.active) this.scene.start('AuthScene');
  }

  openVillages() {
    this.windowOpen = true;
    new VillagesWindow(this, {
      session,
      onPlay: (b) => this.playVillage(b),
      onClose: () => this.scene.restart() // the caption may have changed
    });
  }

  openAchievements() {
    this.windowOpen = true;
    new AchievementsWindow(this, { session, onClose: () => { this.windowOpen = false; } });
  }

  openLeaderboard() {
    this.windowOpen = true;
    new LeaderboardWindow(this, { session, onClose: () => { this.windowOpen = false; } });
  }

  /** START GAME (online): the current village, or make the first one. */
  startOnline() {
    const b = session.activeBase;
    if (b) { this.playVillage(b); return; }
    this.windowOpen = true;
    promptDialog(this, {
      title: 'Your First Village',
      label: 'Name',
      value: `${session.user.username}'s Village`.slice(0, BASE_NAME_MAX),
      maxLength: BASE_NAME_MAX,
      confirmLabel: 'Create & Play',
      note: 'You can have several villages: manage them from Villages.',
      onConfirm: async (name) => { const nb = await session.createBase(name); this.playVillage(nb); },
      onCancel: () => { this.windowOpen = false; }
    });
  }

  /**
   * Open the village here (any other tab of this browser playing it is told and stops saving it, then it is
   * read again so this tab starts from its newest copy) and play it.
   */
  async playVillage(b) {
    if (this.opening) return;
    this.opening = true;
    this.windowOpen = true;
    const t = this.add.text(this.scale.width / 2, 540, 'Opening…', textStyle(22)).setOrigin(0.5).setDepth(50);
    const ok = await session.openBase(b.id);
    if (!this.sys.isActive()) return;
    const nb = session.activeBase;
    if (!ok || !nb || nb.id !== b.id) {
      this.opening = false;
      t.destroy();
      if (!session.lock) this.scene.restart({ notice: 'That village isn’t available any more.' });
      return;
    }
    this.scene.start('GameScene', { mode: nb.save ? 'continue' : 'new' });
  }

  offerImport() {
    const v = session.legacyVillage();
    this.windowOpen = true;
    confirmDialog(this, {
      title: 'Your Village',
      lines: ['Bring your village into this account?', `This browser has a Village Hall ${v.save.townHallLevel} village saved from before.`, 'It becomes one of your villages (the original stays here too).'],
      confirmLabel: 'Import',
      confirmColor: COLORS.buttonGood,
      cancelLabel: 'Start Fresh',
      width: 640,
      onConfirm: async () => {
        try {
          await session.importLegacy('My Village');
          this.scene.restart();
        } catch (e) {
          this.scene.restart({ notice: e.message || 'Import failed' });
        }
      },
      onCancel: () => { session.declineLegacy(); this.windowOpen = false; }
    });
  }

  /** Start Game: gentle idle wobble; on hover it grows, glows gold, and stops wobbling; it squashes when pressed. */
  buildStartButton(x, y) {
    const start = this.add.image(x, y, TEX.startButton);
    const base = 290 / start.frame.width;
    start.setScale(base).setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 40 });

    // Gold glow (WebGL only; canvas renderer just gets the scale effect).
    let glow = null;
    if (start.preFX) {
      start.preFX.padding = 24;
      glow = start.preFX.addGlow(0xffd84a, 0, 0, false, 0.1, 18);
    }
    const wobble = this.tweens.add({ targets: start, angle: { from: -1.5, to: 1.5 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    let pressed = false;
    let scaleTween = null;
    let glowTween = null;

    const to = (scale, glowStrength, duration = 160, ease = 'Back.easeOut') => {
      if (scaleTween) scaleTween.stop();
      scaleTween = this.tweens.add({ targets: start, scale: base * scale, duration, ease });
      if (glow) {
        if (glowTween) glowTween.stop();
        glowTween = this.tweens.add({ targets: glow, outerStrength: glowStrength, duration });
      }
    };

    start.on('pointerover', () => {
      if (pressed) return;
      wobble.pause();
      this.tweens.add({ targets: start, angle: 0, duration: 120 });
      to(1.1, 5);
    });
    start.on('pointerout', () => {
      if (pressed) return;
      to(1, 0, 180, 'Cubic.easeOut');
      wobble.resume();
    });
    start.on('pointerdown', () => {
      if (pressed || this.windowOpen || this.loggingOut) return;
      pressed = true;
      playSfx(this, SFX.uiClick);
      if (scaleTween) scaleTween.stop();
      scaleTween = this.tweens.add({
        targets: start, scale: base * 0.96, duration: 80, yoyo: true, ease: 'Quad.easeOut',
        onComplete: () => {
          pressed = false;
          if (this.online) this.startOnline();
          else if (this.hasSave) this.continueGame();
          else this.newGame();
        }
      });
    });
  }

  openSettings() {
    if (this.settings || this.dialog) return;
    let deleted = false;
    this.settings = new SettingsWindow(this, {
      storage: this.storage,
      hasSave: this.hasSave,
      account: this.online ? { username: session.user.username, email: session.user.email } : null,
      onDeleteSave: () => { deleteGame(this.storage); deleted = true; },
      onClose: () => {
        this.settings = null;
        if (deleted) this.scene.restart(); // the caption and button row change without a save
      }
    });
  }

  continueGame() {
    this.scene.start('GameScene', { mode: 'continue' });
  }

  newGame() {
    deleteGame(this.storage);
    this.scene.start('GameScene', { mode: 'new' });
  }

  confirmNewGame() {
    if (this.dialog) return;
    const { width, height } = this.scale;
    const shade = this.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
    const g = this.add.graphics();
    const pw = 520, ph = 230, px = width / 2 - pw / 2, py = height / 2 - ph / 2, header = 56;
    drawWindow(g, px, py, pw, ph, { header });
    const title = this.add.text(width / 2, py + 4 + header / 2, 'New Game', textStyle(30)).setOrigin(0.5);
    const text = this.add.text(width / 2, py + 100, 'Overwrite your saved game?', bodyStyle(22)).setOrigin(0.5);
    const close = () => { [shade, g, title, text, yes, no].forEach((o) => o.destroy()); this.dialog = null; };
    const yes = new Button(this, width / 2 - 110, py + ph - 52, 190, 56, 'Overwrite', () => { close(); this.newGame(); }, { color: COLORS.buttonDanger, fontSize: 22 });
    const no = new Button(this, width / 2 + 110, py + ph - 52, 190, 56, 'Cancel', close, { color: COLORS.buttonGood, fontSize: 22 });
    this.dialog = [shade, g, title, text, yes, no];
  }
}
