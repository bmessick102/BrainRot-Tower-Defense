// Home screen Settings window: a Settings tab (Music / Effects volume, Delete Saved Game with a
// confirm step) and a Credits tab. Built at the scene root on a dim backdrop; destroy() removes it all.
import { Button } from './Button.js';
import { addVolumeSlider } from './VolumeSlider.js';
import { drawWindow } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { getMusicLevel, getSfxLevel, setMusicLevel, setSfxLevel } from '../audio.js';
import { saveSettings } from '../logic/save.js';
import { CREDITS_TEAM, CREDITS_NOTES } from '../credits.js';

const W = 560, H = 430, HEADER = 60, DEPTH = 1000;

export class SettingsWindow {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} o
   * @param {Storage|null} o.storage where settings are saved
   * @param {boolean} o.hasSave whether Delete Saved Game is available
   * @param {{username: string, email: string}|null} [o.account] logged in: show the account instead of Delete Saved Game
   * @param {() => void} o.onDeleteSave deletes the save (the caller owns save handling)
   * @param {() => void} o.onClose
   */
  constructor(scene, { storage, hasSave, onDeleteSave, onClose, account = null }) {
    this.scene = scene;
    this.account = account;
    this.storage = storage;
    this.hasSave = hasSave;
    this.onDeleteSave = onDeleteSave;
    this.onClose = onClose;
    this.tab = 'settings';
    this.confirming = false;
    this.notice = '';

    const { width, height } = scene.scale;
    this.px = Math.round(width / 2 - W / 2);
    this.py = Math.round(height / 2 - H / 2);
    const shade = scene.add.rectangle(0, 0, width, height, 0x000000, 0.6).setOrigin(0).setInteractive();
    const g = scene.add.graphics();
    drawWindow(g, this.px, this.py, W, H, { header: HEADER });
    const title = scene.add.text(width / 2, this.py + 4 + HEADER / 2, 'Settings', textStyle(32)).setOrigin(0.5);
    const close = new Button(scene, this.px + W - 14, this.py + 14, 52, 50, '', () => this.close(), { color: COLORS.buttonDanger, icon: 'x', radius: 10 });
    const tabW = 170, tabY = this.py + HEADER + 34;
    this.tabs = {
      settings: new Button(scene, width / 2 - tabW / 2 - 6, tabY, tabW, 38, 'Options', () => this.show('settings'), { fontSize: 19, radius: 10 }),
      credits: new Button(scene, width / 2 + tabW / 2 + 6, tabY, tabW, 38, 'Credits', () => this.show('credits'), { fontSize: 19, radius: 10 })
    };
    this.frame = [shade, g, title, close, ...Object.values(this.tabs)];
    this.frame.forEach((o) => o.setDepth(DEPTH));
    this.content = [];
    this.escKey = scene.input.keyboard ? scene.input.keyboard.addKey('ESC') : null;
    if (this.escKey) this.escKey.on('down', this.onEsc = () => this.close());
    this.show('settings');
  }

  show(tab) {
    this.tab = tab;
    this.confirming = tab === 'settings' && this.confirming;
    for (const [k, b] of Object.entries(this.tabs)) {
      b.color = k === tab ? COLORS.buttonGood : COLORS.buttonDark;
      b.redraw();
    }
    this.content.forEach((o) => o.destroy());
    this.content = [];
    if (tab === 'settings') this.buildSettings();
    else this.buildCredits();
  }

  add(...objs) {
    for (const o of objs.flat()) {
      if (!o.depth) o.setDepth(DEPTH + 1);
      this.content.push(o);
    }
  }

  buildSettings() {
    const s = this.scene, cx = s.scale.width / 2;
    const save = () => saveSettings(this.storage, { music: getMusicLevel(), sfx: getSfxLevel() });
    const x = this.px + 200, sw = 250;
    this.add(addVolumeSlider(s, { x, y: this.py + 176, width: sw, label: 'Music', get: getMusicLevel, set: (v) => { setMusicLevel(v); save(); }, depth: DEPTH + 1 }));
    this.add(addVolumeSlider(s, { x, y: this.py + 236, width: sw, label: 'Effects', get: getSfxLevel, set: (v) => { setSfxLevel(v); save(); }, depth: DEPTH + 1 }));

    const g = s.add.graphics();
    g.fillStyle(COLORS.bodyShade, 1).fillRect(this.px + 24, this.py + 286, W - 48, 2);
    this.add(g);

    const by = this.py + H - 62;
    if (this.account) {
      this.add(s.add.text(cx, this.py + 318, `Signed in as ${this.account.username}`, bodyStyle(20)).setOrigin(0.5));
      this.add(s.add.text(cx, this.py + 346, this.account.email || '', bodyStyle(16, COLORS.inkDim)).setOrigin(0.5));
      this.add(s.add.text(cx, this.py + H - 40, 'Make, switch or delete villages from Villages on the title screen.', bodyStyle(15, COLORS.inkDim)).setOrigin(0.5));
      return;
    }
    if (this.confirming) {
      this.add(s.add.text(cx, this.py + 318, 'Delete your saved village? This can\'t be undone.', bodyStyle(18, COLORS.inkBad)).setOrigin(0.5));
      this.add(new Button(s, cx - 110, by, 200, 54, 'Delete', () => this.deleteSave(), { color: COLORS.buttonDanger, fontSize: 21 }));
      this.add(new Button(s, cx + 110, by, 200, 54, 'Cancel', () => { this.confirming = false; this.show('settings'); }, { color: COLORS.buttonDark, fontSize: 21 }));
      return;
    }
    const info = this.notice || (this.hasSave ? 'Starts you over from the tutorial. Settings are kept.' : 'There is no saved game.');
    this.add(s.add.text(cx, this.py + 318, info, bodyStyle(17, this.notice ? COLORS.inkGood : COLORS.inkDim)).setOrigin(0.5));
    const del = new Button(s, cx, by, 300, 54, 'Delete Saved Game', () => { this.confirming = true; this.show('settings'); }, { color: COLORS.buttonDanger, fontSize: 21 });
    del.setEnabled(this.hasSave);
    this.add(del);
  }

  buildCredits() {
    const s = this.scene, cx = s.scale.width / 2;
    let y = this.py + 146;
    this.add(s.add.text(cx, y, 'Italian Brainrot Tower Defense', bodyStyle(22, COLORS.inkAccent)).setOrigin(0.5, 0));
    y += 44;
    // Names right-aligned and roles left-aligned at a split point that centers the widest pair.
    const names = CREDITS_TEAM.map((p) => s.add.text(0, y, p.name, bodyStyle(18)).setOrigin(1, 0));
    const roles = CREDITS_TEAM.map((p) => s.add.text(0, y, p.role, bodyStyle(18, COLORS.inkDim)));
    const nameW = Math.max(...names.map((t) => t.width)), roleW = Math.max(...roles.map((t) => t.width));
    const split = cx - (nameW + 24 + roleW) / 2 + nameW + 12;
    names.forEach((t, i) => { t.setPosition(split - 12, y + i * 32); roles[i].setPosition(split + 12, y + i * 32); });
    this.add(names, roles);
    y += CREDITS_TEAM.length * 32;
    y += 14;
    for (const line of CREDITS_NOTES) {
      this.add(s.add.text(cx, y, line, bodyStyle(15, COLORS.inkDim, { align: 'center', wordWrap: { width: W - 60 } })).setOrigin(0.5, 0));
      y += 24;
    }
  }

  deleteSave() {
    this.onDeleteSave();
    this.hasSave = false;
    this.confirming = false;
    this.notice = 'Saved game deleted.';
    this.show('settings');
  }

  close() {
    this.destroy();
    if (this.onClose) this.onClose();
  }

  destroy() {
    if (this.escKey) { this.escKey.off('down', this.onEsc); this.scene.input.keyboard.removeKey(this.escKey); this.escKey = null; }
    [...this.content, ...this.frame].forEach((o) => o.destroy());
    this.content = [];
    this.frame = [];
  }
}
