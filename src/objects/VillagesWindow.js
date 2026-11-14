// "Your Villages": the account's villages (up to MAX_BASES), each with its Village Hall picture, level and
// waves, a Rename button beside its name, a Play button and a Delete button (asks first). Below: New Village, and Import from this device
// when the browser still has a village saved from before accounts.
import { Modal, confirmDialog, promptDialog } from './Modal.js';
import { Button } from './Button.js';
import { buildingTextureKey } from './BuildingView.js';
import { MAX_BASES, BASE_NAME_MAX } from '../net/session.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

const W = 720, H = 600, ROW_H = 74, ROW_GAP = 8;

/** "Village Hall 7 · 23 buildings · 4,210 gold" */
function describeVillage(save) {
  const n = (save.buildings || []).filter((b) => b.type !== 'wall').length;
  return `Village Hall ${save.townHallLevel}  ·  ${n} buildings  ·  ${Math.floor(save.gold).toLocaleString('en-US')} gold`;
}

/** "saved Nov 11, 3:42 PM" */
function savedWhen(save) {
  const d = new Date(save.savedAt);
  return Number.isNaN(d.getTime()) ? 'save date unknown' : `saved ${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

export class VillagesWindow {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} o
   * @param {import('../net/session.js').Session} o.session
   * @param {(base: object) => void} o.onPlay the window has closed; start this village
   * @param {() => void} [o.onClose] closed without playing (the list may have changed)
   */
  constructor(scene, { session, onPlay, onClose = null }) {
    this.scene = scene;
    this.session = session;
    this.onPlay = onPlay;
    this.message = '';
    this.modal = new Modal(scene, { width: W, height: H, title: 'Your Villages', y: 50, onClose });
    this.render();
  }

  render() {
    const m = this.modal, s = this.scene, ses = this.session;
    if (!m.frame) return;
    m.clear();
    const n = ses.bases.length;
    m.add(s.add.text(m.cx, m.y + 86, `${n} / ${MAX_BASES} villages  ·  each village has its own progress`, bodyStyle(17, COLORS.inkDim)).setOrigin(0.5));

    const left = m.x + 24, right = m.x + W - 24;
    let y = m.y + 110;
    if (!n) {
      m.add(s.add.text(m.cx, y + 120, 'No villages yet.\nMake your first one below!', bodyStyle(22, COLORS.inkDim, { align: 'center', lineSpacing: 8 })).setOrigin(0.5));
    }
    for (const b of ses.bases) {
      this.row(b, left, y, right - left);
      y += ROW_H + ROW_GAP;
    }

    this.msg = m.add(s.add.text(m.cx, m.y + H - 98, this.message, bodyStyle(16, COLORS.inkBad, { align: 'center', wordWrap: { width: W - 60 } })).setOrigin(0.5));

    const found = n < MAX_BASES ? ses.deviceVillages() : [];
    const legacy = found[0] || null;
    const by = m.y + H - 50;
    const newBtn = new Button(s, legacy ? m.cx - 160 : m.cx, by, 260, 56, 'New Village', () => this.newVillage(), { color: COLORS.button, fontSize: 22 });
    if (n >= MAX_BASES) newBtn.setLabel('New Village', `Limit ${MAX_BASES}: delete one first`).setEnabled(false);
    m.add(newBtn);
    if (legacy) {
      const sub = found.length > 1 ? `${found.length} villages found in this browser` : `Village Hall ${legacy.save.townHallLevel} village in this browser`;
      m.add(new Button(s, m.cx + 160, by, 300, 56, 'Import from this device', () => this.importLegacy(found), { color: COLORS.buttonBlue, fontSize: 20 })
        .setLabel('Import from this device', sub));
    }
  }

  /** One village: picture, name, progress, Play / Delete. */
  row(b, x, y, w) {
    const m = this.modal, s = this.scene;
    const active = b.id === this.session.activeId;
    const g = s.add.graphics();
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, ROW_H, 12);
    g.fillStyle(active ? 0xfff1c4 : 0xe6e0d2, 1).fillRoundedRect(x + 3, y + 3, w - 6, ROW_H - 6, 10);
    if (active) g.lineStyle(3, COLORS.button, 1).strokeRoundedRect(x + 3, y + 3, w - 6, ROW_H - 6, 10);
    m.add(g);

    // The village's hall as its picture.
    const th = b.save ? b.save.townHallLevel || 0 : 0;
    try {
      const key = buildingTextureKey(s, 'townHall', th);
      if (key && s.textures.exists(key)) {
        const img = s.add.image(x + 44, y + ROW_H / 2, key);
        const f = img.frame;
        img.setScale(Math.min(60 / f.width, 60 / f.height));
        m.add(img);
      }
    } catch { /* no picture */ }

    const name = m.add(s.add.text(x + 84, y + 24, b.name, textStyle(22)).setOrigin(0, 0.5));
    const detail = b.save
      ? `Village Hall ${th}  ·  Wave ${Math.max(1, b.wave || 0)}  ·  Best wave survived: ${b.bestWave || 0}`
      : 'New village · not started yet';
    m.add(s.add.text(x + 84, y + 52, detail, bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
    // Rename, just right of the name; then "Last played" if it still fits before the Play button.
    const rx = x + 84 + name.width + 12, rw = 78;
    m.add(new Button(s, rx + rw / 2, y + 24, rw, 28, 'Rename', () => this.rename(b), { color: COLORS.buttonDark, fontSize: 14, radius: 8 }));
    if (active) {
      const tag = s.add.text(rx + rw + 12, y + 24, 'Last played', bodyStyle(14, COLORS.inkAccent)).setOrigin(0, 0.5);
      if (tag.x + tag.width > x + w - 240) tag.destroy();
      else m.add(tag);
    }

    const cy = y + ROW_H / 2 - 1;
    m.add(new Button(s, x + w - 172, cy, 116, 48, 'Play', () => this.play(b), { color: COLORS.buttonGood, fontSize: 21 }));
    m.add(new Button(s, x + w - 60, cy, 96, 48, 'Delete', () => this.confirmDelete(b), { color: COLORS.buttonDanger, fontSize: 18 }));
  }

  setMessage(text) {
    this.message = text;
    if (this.msg && this.msg.active) this.msg.setText(text);
  }

  play(b) {
    this.session.selectBase(b.id);
    this.modal.destroy();
    this.onPlay(b);
  }

  rename(b) {
    promptDialog(this.scene, {
      title: 'Rename Village',
      label: 'Name',
      value: b.name,
      maxLength: BASE_NAME_MAX,
      confirmLabel: 'Rename',
      onConfirm: async (name) => {
        await this.session.renameBase(b.id, name);
        this.message = '';
        this.render();
      }
    });
  }

  confirmDelete(b) {
    const th = b.save ? b.save.townHallLevel || 0 : 0;
    confirmDialog(this.scene, {
      title: 'Delete Village',
      lines: [`Delete “${b.name}”?`, b.save ? `Village Hall ${th}, best wave ${b.bestWave || 0}. This can’t be undone.` : 'This can’t be undone.',
        'Your achievements and leaderboard rank stay.'],
      confirmLabel: 'Delete',
      onConfirm: async () => {
        this.setMessage('Deleting…');
        try {
          await this.session.deleteBase(b.id);
          this.message = '';
        } catch (e) {
          this.message = e.message || String(e);
        }
        this.render();
      }
    });
  }

  newVillage() {
    const n = this.session.bases.length;
    promptDialog(this.scene, {
      title: 'New Village',
      label: 'Name',
      value: `Village ${n + 1}`,
      maxLength: BASE_NAME_MAX,
      confirmLabel: 'Create & Play',
      note: 'Starts from the ruined Village Hall, with the tutorial.',
      onConfirm: async (name) => {
        const b = await this.session.createBase(name);
        this.modal.destroy();
        this.onPlay(b);
      }
    });
  }

  /** One village found: name it. Several: pick one first (newest at the top). */
  importLegacy(all) {
    const found = all.slice(0, 6); // the newest few fit the window
    if (found.length === 1) { this.nameImport(found[0]); return; }
    const s = this.scene, rowH = 64, w = 640;
    const pick = new Modal(s, { width: w, height: 130 + found.length * (rowH + 8) + 20, title: 'Villages in This Browser', header: 56 });
    pick.add(s.add.text(pick.cx, pick.y + 82, 'Pick the village to copy into your account', bodyStyle(17, COLORS.inkDim)).setOrigin(0.5));
    found.forEach((v, i) => {
      const x = pick.x + 20, y = pick.y + 110 + i * (rowH + 8), rw = w - 40;
      const g = pick.add(s.add.graphics());
      g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, rw, rowH, 10);
      g.fillStyle(0xe6e0d2, 1).fillRoundedRect(x + 3, y + 3, rw - 6, rowH - 6, 8);
      pick.add(s.add.text(x + 16, y + 20, describeVillage(v.save), bodyStyle(17)).setOrigin(0, 0.5));
      pick.add(s.add.text(x + 16, y + 44, `${v.source}  ·  ${savedWhen(v.save)}`, bodyStyle(14, COLORS.inkDim)).setOrigin(0, 0.5));
      pick.add(new Button(s, x + rw - 70, y + rowH / 2 - 1, 110, 44, 'Import', () => { pick.destroy(); this.nameImport(v); }, { color: COLORS.buttonBlue, fontSize: 19 }));
    });
  }

  nameImport(v) {
    promptDialog(this.scene, {
      title: 'Import Village',
      label: 'Name',
      value: String(v.name || 'My Village').slice(0, BASE_NAME_MAX),
      maxLength: BASE_NAME_MAX,
      confirmLabel: 'Import',
      note: `${describeVillage(v.save)}. The original stays where it is.`,
      onConfirm: async (name) => {
        await this.session.importLegacy(name, v.key);
        this.message = '';
        this.render();
      }
    });
  }
}
