// Home screen Settings window: a Settings tab (Music / Effects volume, Graphics quality, Delete Saved Game with a
// confirm step) and a Credits tab. Built at the scene root on a dim backdrop; destroy() removes it all.
import { Button } from './Button.js';
import { addVolumeSlider } from './VolumeSlider.js';
import { addGraphicsToggle } from './GraphicsToggle.js';
import { drawWindow } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { getMusicLevel, getSfxLevel, setMusicLevel, setSfxLevel } from '../audio.js';
import { saveSettings } from '../logic/save.js';
import { CREDITS_SECTIONS, CREDITS_DISCLAIMER } from '../credits.js';

const W = 560, H = 490, HEADER = 60, DEPTH = 1000;

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
  constructor(scene, { storage, hasSave, onDeleteSave, onClose, account = null, backend = null, onFindPlayers = null }) {
    this.scene = scene;
    this.account = account;
    this.backend = backend;             // v0.7: the account's backend ("Let others view my villages")
    this.onFindPlayers = onFindPlayers; // v0.7: Find Players
    this.publicBases = null;            // (loaded when the Options tab opens)
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
    this.add(addGraphicsToggle(s, { x, y: this.py + 296, width: sw, storage: this.storage, depth: DEPTH + 1 }));

    const g = s.add.graphics();
    g.fillStyle(COLORS.bodyShade, 1).fillRect(this.px + 24, this.py + 346, W - 48, 2);
    this.add(g);

    const by = this.py + H - 62;
    if (this.account) {
      this.add(s.add.text(this.px + 30, this.py + 372, `Signed in as ${this.account.username}`, bodyStyle(19)).setOrigin(0, 0.5));
      this.add(s.add.text(this.px + 30, this.py + 396, this.account.email || '', bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
      // v0.7: Find Players, and whether others can look at your villages.
      if (this.onFindPlayers) {
        this.add(new Button(s, this.px + W - 30 - 100, this.py + 382, 200, 44, 'Find Players', () => { const go = this.onFindPlayers; this.close(); go(); }, { color: COLORS.buttonBlue, fontSize: 19 }));
      }
      if (this.backend && this.backend.getPublicBases) this.buildPrivacy(by + 16);
      return;
    }
    if (this.confirming) {
      this.add(s.add.text(cx, this.py + 378, 'Delete your saved village? This can\'t be undone.', bodyStyle(18, COLORS.inkBad)).setOrigin(0.5));
      this.add(new Button(s, cx - 110, by, 200, 54, 'Delete', () => this.deleteSave(), { color: COLORS.buttonDanger, fontSize: 21 }));
      this.add(new Button(s, cx + 110, by, 200, 54, 'Cancel', () => { this.confirming = false; this.show('settings'); }, { color: COLORS.buttonDark, fontSize: 21 }));
      return;
    }
    const info = this.notice || (this.hasSave ? 'Starts you over from the tutorial. Settings are kept.' : 'There is no saved game.');
    this.add(s.add.text(cx, this.py + 378, info, bodyStyle(17, this.notice ? COLORS.inkGood : COLORS.inkDim)).setOrigin(0.5));
    const del = new Button(s, cx, by, 300, 54, 'Delete Saved Game', () => { this.confirming = true; this.show('settings'); }, { color: COLORS.buttonDanger, fontSize: 21 });
    del.setEnabled(this.hasSave);
    this.add(del);
  }

  /** "Let others view my villages: On / Off" (v0.7), from the account. */
  buildPrivacy(y) {
    const s = this.scene;
    this.add(s.add.text(this.px + 30, y, 'Let others view my villages', bodyStyle(18)).setOrigin(0, 0.5));
    const label = this.publicBases === null ? '…' : this.publicBases ? 'On' : 'Off';
    const btn = new Button(s, this.px + W - 30 - 70, y, 140, 46, label, async () => {
      if (this.publicBases === null) return;
      const next = !this.publicBases;
      btn.setEnabled(false);
      try {
        await this.backend.setPublicBases(next);
        this.publicBases = next;
      } catch (e) {
        this.privacyNote = e.message || 'Couldn’t change that right now.';
      }
      if (this.tab === 'settings' && this.frame.length) this.show('settings');
    }, { color: this.publicBases === false ? COLORS.buttonDark : COLORS.buttonGood, fontSize: 19 });
    btn.setEnabled(this.publicBases !== null);
    this.add(btn);
    if (this.privacyNote) this.add(s.add.text(this.px + 30, y + 30, this.privacyNote, bodyStyle(14, COLORS.inkBad)).setOrigin(0, 0.5));
    if (this.publicBases === null && !this.loadingPrivacy) {
      this.loadingPrivacy = true;
      this.backend.getPublicBases()
        .then((on) => { this.publicBases = on; })
        .catch(() => { this.privacyNote = 'Not available until the server is updated.'; })
        .finally(() => { this.loadingPrivacy = false; if (this.tab === 'settings' && this.frame.length) this.show('settings'); });
    }
  }

  /**
   * The credits (src/credits.js): the game's name, then each section under a small heading (people as two columns,
   * name | what they did, sharing one split so all sections line up), then the fan-content notice in small print.
   * Laid out at full size first; if it would run past the window's bottom, the gaps and then the text shrink a step at
   * a time until it fits.
   */
  buildCredits() {
    const fits = [
      { f: 1, g: 1 }, { f: 1, g: 0.7 }, { f: 0.95, g: 0.55 }, { f: 0.9, g: 0.45 }, { f: 0.84, g: 0.35 }, { f: 0.78, g: 0.25 }
    ];
    const limit = this.py + H - 16;
    for (let i = 0; i < fits.length; i++) {
      const { objs, bottom } = this.layoutCredits(fits[i]);
      if (bottom <= limit || i === fits.length - 1) { this.add(objs); return; }
      objs.forEach((o) => o.destroy());
    }
  }

  /** One try at the credits layout: f scales the text, g the gaps. Returns the objects and their bottom edge. */
  layoutCredits({ f, g }) {
    const s = this.scene, cx = s.scale.width / 2, objs = [];
    const size = (n) => Math.max(11, Math.round(n * f)), gap = (n) => Math.round(n * g);
    const text = (x, y, str, style) => { const t = s.add.text(x, y, str, style); objs.push(t); return t; };
    let y = this.py + 126;
    const title = text(cx, y, 'Italian Brainrot Tower Defense', bodyStyle(size(21), COLORS.inkAccent)).setOrigin(0.5, 0);
    y += title.height + gap(8);

    // One name | role split for every section, centered on the widest name and the widest role.
    const rowSize = size(17), people = CREDITS_SECTIONS.flatMap((sec) => sec.people || []);
    const measure = (str) => { const t = s.add.text(0, 0, str, bodyStyle(rowSize)); const w = t.width; t.destroy(); return w; };
    const roleLines = (p) => [].concat(p.role); // a role is one line or a list of lines
    const nameW = Math.max(0, ...people.map((p) => measure(p.name)));
    const roleW = Math.max(0, ...people.flatMap(roleLines).map((r) => measure(r)));
    const split = Math.round(cx - (nameW + 24 + roleW) / 2 + nameW + 12);

    const rules = s.add.graphics();
    objs.push(rules);
    rules.fillStyle(0x7a6a55, 0.3); // COLORS.inkDim, faint
    CREDITS_SECTIONS.forEach((sec, i) => {
      if (i > 0) y += gap(9);
      // Heading: small accent text between two faint rules.
      const head = text(cx, y, sec.title, bodyStyle(size(15), COLORS.inkAccent)).setOrigin(0.5, 0);
      const ry = Math.round(y + head.height / 2), half = Math.round(head.width / 2) + 12, reach = 110;
      rules.fillRect(cx - half - reach, ry, reach, 2).fillRect(cx + half, ry, reach, 2);
      y += head.height + gap(2);
      for (const p of sec.people || []) {
        text(split - 12, y, p.name, bodyStyle(rowSize)).setOrigin(1, 0);
        roleLines(p).forEach((r, k) => {
          if (k > 0) y += rowSize + 2; // a role's next line sits closer than the next person
          text(split + 12, y, r, bodyStyle(rowSize, COLORS.inkDim));
        });
        y += rowSize + 4 + gap(3);
      }
      for (const line of sec.lines || []) {
        const t = text(cx, y, line, bodyStyle(size(15), COLORS.inkDim, { align: 'center', wordWrap: { width: W - 60 } })).setOrigin(0.5, 0);
        y += t.height + gap(2);
      }
    });

    y += gap(10) + 4;
    const fine = text(cx, y, CREDITS_DISCLAIMER, bodyStyle(size(12), COLORS.inkDim, { align: 'center', wordWrap: { width: W - 56 } })).setOrigin(0.5, 0);
    return { objs, bottom: y + fine.height };
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
