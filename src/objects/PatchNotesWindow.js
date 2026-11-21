// The Patch Notes window ("What's New"): this release's changes (src/patchNotes.js) in a Modal, a few entries per page,
// each with a picture (the building, enemy or spell it's about), a bold title and a short note. The same blue page
// arrows as the shop and How to Play; "Got it!" closes it. TitleScene opens it once per version and from its button.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { drawShowcaseCard, fitIcon, fitWidth, addHeroBadge } from './uiDraw.js';
import { buildingTextureKey } from './BuildingView.js';
import { enemyKey, spellArtKey } from '../assetKeys.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { PATCH_NOTES } from '../patchNotes.js';
import { readKey, writeKey, SAVE_KEYS } from '../logic/save.js';

const W = 900, H = 600, HEADER = 60;
const PER_PAGE = 5;
const ROW_H = 88, ICON = 76;

/** Has this device seen this release's patch notes? */
export function patchNotesSeen(storage) {
  return readKey(storage, SAVE_KEYS.patchNotes) === PATCH_NOTES.version;
}

/** Remember that this device has seen them (they come back for the next version). */
export function markPatchNotesSeen(storage) {
  writeKey(storage, SAVE_KEYS.patchNotes, PATCH_NOTES.version);
}

export class PatchNotesWindow {
  constructor(scene, { storage = null, onClose = null } = {}) {
    this.scene = scene;
    this.page = 0;
    this.pages = Math.ceil(PATCH_NOTES.entries.length / PER_PAGE);
    if (storage) markPatchNotesSeen(storage);
    this.modal = new Modal(scene, { width: W, height: H, title: PATCH_NOTES.title, header: HEADER, depth: 1200, onClose });
    this.show(0);
  }

  /** The picture for an entry, fitted in an ICON-sized card at (x, y). */
  icon(m, entry, x, y) {
    const s = this.scene, ic = entry.icon || {};
    const g = s.add.graphics();
    drawShowcaseCard(g, x, y, ICON, ICON, { tileY: y + ICON - 22, tileW: 40 });
    m.add(g);
    if (ic.hero) { m.add(addHeroBadge(s, x + ICON / 2, y + ICON / 2, 60)); return; }
    const key = ic.building ? buildingTextureKey(s, ic.building, ic.level || 1)
      : ic.enemy ? enemyKey(ic.enemy) : ic.spell ? spellArtKey(ic.spell) : ic.texture;
    if (!key || !s.textures.exists(key)) return;
    const img = s.add.image(x + ICON / 2, y + ICON - 12, key).setOrigin(0.5, 1);
    fitIcon(img, ICON - 14, ICON - 18);
    m.add(img);
  }

  show(page) {
    const m = this.modal, s = this.scene;
    this.page = Math.max(0, Math.min(this.pages - 1, page));
    m.clear();
    const left = m.x + 34, top = m.y + HEADER + 22, textX = left + ICON + 20, textW = W - (textX - m.x) - 34;
    PATCH_NOTES.entries.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((e, i) => {
      const y = top + i * ROW_H;
      this.icon(m, e, left, y);
      const t = s.add.text(textX, y + 2, e.title, textStyle(20));
      fitWidth(t, textW);
      const body = s.add.text(textX, y + 30, e.text, bodyStyle(14.5, COLORS.ink, { wordWrap: { width: textW }, lineSpacing: 2 }));
      for (let size = 14; body.height > ROW_H - 30 && size >= 12; size--) body.setFontSize(size);
      m.add(t, body);
    });
    // Footer: page arrows and count (blue like every pager), and Got it!
    const fy = m.y + H - 44;
    const arrow = { radius: 10, color: COLORS.buttonBlue, disabledColor: COLORS.buttonBlueDisabled };
    const prev = new Button(s, m.x + 60, fy, 52, 46, '', () => this.show(this.page - 1), { icon: 'left', ...arrow }).setEnabled(this.page > 0);
    const next = new Button(s, m.x + 190, fy, 52, 46, '', () => this.show(this.page + 1), { icon: 'right', ...arrow }).setEnabled(this.page < this.pages - 1);
    const count = s.add.text(m.x + 125, fy - 2, `${this.page + 1} / ${this.pages}`, textStyle(19)).setOrigin(0.5);
    const done = new Button(s, m.x + W - 120, fy, 190, 52, this.page < this.pages - 1 ? 'Next' : 'Got it!',
      () => (this.page < this.pages - 1 ? this.show(this.page + 1) : m.close()), { color: COLORS.buttonGood, fontSize: 22 });
    m.add(prev, next, count, done);
  }

  close() {
    this.modal.close();
  }
}
