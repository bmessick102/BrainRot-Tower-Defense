// Pause menu: Resume, Save, Music and Effects volume sliders (0-100%, saved to ibtd.settings), Graphics quality,
// Quit to Title.
// (Achievements moved to the in-game Profile, top left: src/objects/ProfileWindow.js.)
import Phaser from 'phaser';
import { saveSettings } from '../logic/save.js';
import { getStorage } from '../state/GameState.js';
import { addVolumeSlider } from '../objects/VolumeSlider.js';
import { addGraphicsToggle } from '../objects/GraphicsToggle.js';
import { isWaveActive } from '../logic/util.js';
import { Button } from '../objects/Button.js';
import { addFullscreenButton } from '../objects/FullscreenButton.js';
import { stopMusic, getMusicLevel, getSfxLevel, setMusicLevel, setSfxLevel } from '../audio.js';
import { drawWindow } from '../objects/uiDraw.js';
import { COLORS, textStyle } from '../theme.js';
import { session } from '../net/account.js';
import { VIEW } from '../renderScale.js';

const BANNER_MS = 2500;

export class PauseScene extends Phaser.Scene {
  constructor() {
    super('PauseScene');
  }

  create() {
    const { width, height } = VIEW;
    this.gs = this.registry.get('gameState');
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0).setInteractive();
    const pw = 440, ph = 540, px = width / 2 - pw / 2, py = height / 2 - ph / 2, header = 64;
    const g = this.add.graphics();
    drawWindow(g, px, py, pw, ph, { header });
    this.add.text(width / 2, py + 4 + header / 2, 'Paused', textStyle(38)).setOrigin(0.5);
    new Button(this, px + pw - 14, py + 14, 52, 50, '', () => this.resume(), { color: COLORS.buttonDanger, icon: 'x', radius: 10 });
    addFullscreenButton(this, px + 14, py + 14); // top-left corner, mirroring the close button

    new Button(this, width / 2, py + 126, 290, 58, 'Resume', () => this.resume(), { color: COLORS.buttonGood, fontSize: 24 });
    new Button(this, width / 2, py + 196, 290, 58, 'Save', () => this.save(), { color: COLORS.buttonBlue, fontSize: 24 });
    this.buildVolume(width / 2, py + 272);
    new Button(this, width / 2, py + ph - 62, 290, 58, 'Quit to Title', () => this.quit(), { color: COLORS.buttonDanger, fontSize: 24 });

    this.banner = this.add.text(width / 2, py - 34, '', textStyle(26, COLORS.textGold)).setOrigin(0.5);
    this.input.keyboard.on('keydown-ESC', () => this.resume());
  }

  buildVolume(cx, y) {
    const storage = this.gs ? this.gs.storage : getStorage();
    const save = () => saveSettings(storage, { music: getMusicLevel(), sfx: getSfxLevel() });
    const x = cx - 70, width = 190;
    addVolumeSlider(this, { x, y, width, label: 'Music', get: getMusicLevel, set: (v) => { setMusicLevel(v); save(); } });
    addVolumeSlider(this, { x, y: y + 60, width, label: 'Effects', get: getSfxLevel, set: (v) => { setSfxLevel(v); save(); } });
    addGraphicsToggle(this, { x, y: y + 120, width, storage });
  }

  showBanner(text) {
    this.banner.setText(text).setAlpha(1);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, alpha: 0, delay: BANNER_MS - 300, duration: 300 });
  }

  save() {
    if (!this.gs.save()) {
      this.showBanner(isWaveActive(this.gs) ? "Can't save during a wave" : 'Save failed');
      return;
    }
    if (!(session.loggedIn && session.activeBase)) { this.showBanner('Saved'); return; }
    // Logged in: upload now and say whether it reached the server.
    this.showBanner('Saving…');
    session.flush().then((ok) => { if (this.sys.isActive()) this.showBanner(ok ? 'Saved' : 'Saved on this device (offline)'); });
  }

  resume() {
    this.scene.resume('GameScene');
    this.scene.resume('UIScene');
    this.scene.stop();
  }

  /** Autosaves first, unless a wave is active (then the last save stays as it is). */
  quit() {
    this.gs.save();
    stopMusic();
    this.scene.stop('UIScene');
    this.scene.stop('GameScene');
    this.scene.start('TitleScene');
  }
}
