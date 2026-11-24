// The Patch Notes window ("What's New"): one tab per update (src/patchNotes.js: the latest, then PATCH_HISTORY, newest
// first; v0.7.1), each tab its update's changes in pages, grouped in sections
// (New Features, Changes, Balance, Bug Fixes: a colored heading each, repeated when a section carries onto the next
// page), each entry with a picture (the building, enemy or spell it's about), a bold title, the version it came in and
// a short note. The same blue page arrows as the shop and How to Play; "Got it!" closes it. TitleScene opens it once
// per version and from its button.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { drawShowcaseCard, drawGlossy, fitIcon, fitWidth, addHeroBadge } from './uiDraw.js';
import { buildingTextureKey } from './BuildingView.js';
import { enemyKey, spellArtKey } from '../assetKeys.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { PATCH_NOTES, PATCH_RELEASES, PATCH_SECTIONS, PATCH_SECTION_ORDER } from '../patchNotes.js';
import { readKey, writeKey, SAVE_KEYS } from '../logic/save.js';

const W = 900, H = 640, HEADER = 60;
const TABS_H = 58, TAB_H = 40, TAB_W = 170, TAB_GAP = 10; // the update tabs under the title
const ROW_H = 84, ICON = 72, HEAD_H = 36;
const ROOM = H - HEADER - TABS_H - 18 - 74; // the page's height for rows (between the tabs and the footer)

/** A tab's name: "v0.7 · Latest" for the newest update, "v0.6" for older ones. */
export const releaseLabel = (release, i) => `v${release.release}${i === 0 ? ' · Latest' : ''}`;

/**
 * The notes laid out in pages: [[{ section, continued } | { entry }]]. Sections in their fixed order; a section that
 * starts (or carries on) on a page gets its heading there.
 */
export function patchPages(notes = PATCH_NOTES) {
  const pages = [];
  let page = [], used = 0;
  const sections = PATCH_SECTION_ORDER.map((t) => notes.sections.find((s) => s.type === t)).filter((s) => s && s.entries.length);
  for (const sec of sections) {
    let headed = false;
    sec.entries.forEach((entry, i) => {
      const need = ROW_H + (headed ? 0 : HEAD_H);
      if (used + need > ROOM && page.length) { pages.push(page); page = []; used = 0; headed = false; }
      if (!headed) { page.push({ section: sec.type, continued: i > 0 }); used += HEAD_H; headed = true; }
      page.push({ entry });
      used += ROW_H;
    });
  }
  if (page.length) pages.push(page);
  return pages;
}

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
    this.releases = PATCH_RELEASES;
    if (storage) markPatchNotesSeen(storage);
    this.modal = new Modal(scene, { width: W, height: H, title: PATCH_NOTES.title, header: HEADER, depth: 1200, onClose });
    this.showRelease(0);
  }

  /** Open update `i`'s tab (0 = the latest) at its first page. */
  showRelease(i) {
    this.tab = Math.max(0, Math.min(this.releases.length - 1, i));
    const rel = this.releases[this.tab];
    this.layout = patchPages(rel);
    this.pages = this.layout.length;
    this.modal.setTitle(this.tab === 0 ? PATCH_NOTES.title : `What's New in v${rel.release}`);
    this.show(0);
  }

  /** The update tabs under the title: green for the open one; tabs shrink to fit if there are many. */
  drawTabs(m) {
    const s = this.scene, n = this.releases.length;
    const w = Math.min(TAB_W, (W - 68 - TAB_GAP * (n - 1)) / n);
    const y = m.y + HEADER + 18 + TAB_H / 2;
    this.releases.forEach((rel, i) => {
      const btn = new Button(s, m.x + 34 + w / 2 + i * (w + TAB_GAP), y, w, TAB_H, releaseLabel(rel, i),
        () => { if (i !== this.tab) this.showRelease(i); },
        { color: i === this.tab ? COLORS.buttonGood : COLORS.buttonDark, fontSize: 18, radius: 10 });
      if (btn.label) fitWidth(btn.label, w - 14); // (v0.14: nine tabs, so "v0.14 · Latest" shrinks to fit its narrower tab)
      m.add(btn);
    });
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
    this.drawTabs(m);
    const left = m.x + 34, textX = left + ICON + 20, textW = W - (textX - m.x) - 34;
    let y = m.y + HEADER + TABS_H + 18;
    for (const row of this.layout[this.page] || []) {
      if (row.section) {
        // Section heading: a colored tab with its name, and a rule across.
        const sec = PATCH_SECTIONS[row.section];
        const label = s.add.text(left + 14, y + HEAD_H / 2 - 2, row.continued ? `${sec.title} (continued)` : sec.title, textStyle(17)).setOrigin(0, 0.5);
        const g = s.add.graphics();
        drawGlossy(g, left, y + 3, label.width + 28, HEAD_H - 10, sec.color, { radius: 9, lip: 3, shadow: false });
        g.fillStyle(sec.color, 0.35).fillRect(left + label.width + 36, y + HEAD_H / 2 - 2, W - 68 - label.width - 36, 2);
        m.add(g, label);
        label.setDepth(m.depth + 2); // (over its tab)
        y += HEAD_H;
        continue;
      }
      const e = row.entry;
      this.icon(m, e, left, y);
      // Title, with the version it came in as a small tag at its end.
      const tag = e.version ? s.add.text(0, y + 13, `v${e.version.replace(/\.0$/, '')}`, bodyStyle(13, COLORS.text, { fontStyle: 'bold' })).setOrigin(0, 0.5) : null;
      const t = s.add.text(textX, y + 2, e.title, textStyle(19));
      fitWidth(t, textW - (tag ? tag.width + 22 : 0));
      if (tag) {
        tag.setX(textX + t.displayWidth + 14);
        const tg = s.add.graphics();
        tg.fillStyle(COLORS.frame, 0.55).fillRoundedRect(tag.x - 7, y + 3, tag.width + 14, 20, 10);
        m.add(tg, tag);
        tag.setDepth(m.depth + 2); // (over its pill)
      }
      const body = s.add.text(textX, y + 28, e.text, bodyStyle(14.5, COLORS.ink, { wordWrap: { width: textW }, lineSpacing: 2 }));
      for (let size = 14; body.height > ROW_H - 28 && size >= 12; size--) body.setFontSize(size);
      m.add(t, body);
      y += ROW_H;
    }
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
