// Find Players (v0.7, from Settings): search by name, filter by league and Village Hall, sort by furthest wave,
// Village Hall or achievements. Each result shows its league badge, name, Village Hall, wave and achievements, with an
// green Visit button to look at their best village; clicking the row opens their card (PlayerCardWindow).
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { addTextField } from './TextField.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { LEAGUES, leagueFor, leagueBadgeSize } from '../logic/leagues.js';
import { CONFIG } from '../config.js';
import { fitIcon, fitWidth } from './uiDraw.js';
import { visitButton, VISIT_W } from './PlayerCardWindow.js';

const W = 780, H = 650, ROW_H = 40, ROW_GAP = 4, PER_PAGE = 8;
const SORTS = [['wave', 'Furthest wave'], ['hall', 'Village Hall'], ['achievements', 'Achievements']];

/** A league's wave range: from its minWave up to the next league's (the top one has no ceiling). */
export function leagueWaveRange(key) {
  const i = LEAGUES.findIndex((l) => l.key === key);
  if (i < 0) return { minWave: 0, maxWave: null };
  return { minWave: LEAGUES[i].minWave, maxWave: i + 1 < LEAGUES.length ? LEAGUES[i + 1].minWave - 1 : null };
}

export class PlayerSearchWindow {
  /**
   * @param {object} o
   * @param {object} o.session
   * @param {(username) => void} o.onOpenPlayer  show a player's card
   * @param {(username) => void} o.onVisitBest   look at a player's best village
   * @param {object} [o.filters] the last search's filters (kept when coming back)
   */
  constructor(scene, { session, onOpenPlayer, onVisitBest, onClose = null, filters = null }) {
    this.scene = scene;
    this.session = session;
    this.onOpenPlayer = onOpenPlayer;
    this.onVisitBest = onVisitBest;
    this.f = { query: '', league: null, hall: null, sort: 'wave', ...(filters || {}) };
    this.page = 0;
    this.results = null;
    this.modal = new Modal(scene, { width: W, height: H, title: 'Find Players', onClose });
    const m = this.modal;
    this.field = m.add(addTextField(scene, m.x + 28, m.y + 100, W - 56 - 150, { value: this.f.query, placeholder: 'Player name', maxLength: 16, onEnter: () => this.search() }));
    m.add(new Button(scene, m.x + W - 28 - 66, m.y + 100, 132, 46, 'Search', () => this.search(), { color: COLORS.buttonGood, fontSize: 19 }));
    this.body = [];
    this.drawFilters();
    this.search();
  }

  get filters() { return { ...this.f, query: this.field.value.trim() }; }

  /** Hide the text box while a window is on top (it's a page element, drawn over the canvas). */
  setFieldVisible(on) { if (this.field && this.field.node) this.field.node.style.visibility = on ? 'visible' : 'hidden'; }

  addBody(...objs) { for (const o of objs.flat()) { this.modal.add(o); this.body.push(o); } return objs[0]; }
  clearBody(list) { for (const o of list) o.destroy(); list.length = 0; }

  drawFilters() {
    const m = this.modal, s = this.scene;
    this.filterObjs = this.filterObjs || [];
    this.clearBody(this.filterObjs);
    const add = (o) => { m.add(o); this.filterObjs.push(o); return o; };
    const left = m.x + 28;
    // League: All + each league (its badge on the button).
    let y = m.y + 150;
    add(s.add.text(left, y, 'League', bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
    const opts = [{ key: null, name: 'All' }, ...LEAGUES];
    const bw = (W - 56 - 80 - (opts.length - 1) * 6) / opts.length;
    opts.forEach((l, i) => {
      const on = this.f.league === l.key;
      const b = add(new Button(s, left + 80 + bw / 2 + i * (bw + 6), y, bw, 36, l.name, () => { this.f.league = l.key; this.refilter(); },
        { color: on ? COLORS.buttonGood : COLORS.buttonDark, fontSize: 14, radius: 9 }));
      if (b.label) fitWidth(b.label, bw - 10);
    });
    // Village Hall: a stepper (Any, 1 ... max). Sort: three toggles.
    y += 48;
    add(s.add.text(left, y, 'Village Hall', bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
    const max = CONFIG.rules.maxTownHallLevel;
    const step = (d) => {
      const order = [null, ...Array.from({ length: max }, (_, i) => i + 1)];
      const i = order.indexOf(this.f.hall);
      this.f.hall = order[(i + d + order.length) % order.length];
      this.refilter();
    };
    add(new Button(s, left + 112, y, 34, 34, '', () => step(-1), { color: COLORS.buttonBlue, icon: 'left', radius: 8 }));
    add(s.add.text(left + 172, y, this.f.hall ? `Level ${this.f.hall}` : 'Any', textStyle(17)).setOrigin(0.5));
    add(new Button(s, left + 232, y, 34, 34, '', () => step(1), { color: COLORS.buttonBlue, icon: 'right', radius: 8 }));
    add(s.add.text(left + 290, y, 'Sort by', bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
    const sw = 128;
    SORTS.forEach(([key, label], i) => {
      add(new Button(s, left + 360 + sw / 2 + i * (sw + 6), y, sw, 36, label, () => { this.f.sort = key; this.refilter(); },
        { color: this.f.sort === key ? COLORS.buttonGood : COLORS.buttonDark, fontSize: 14, radius: 9 }));
    });
  }

  refilter() { this.drawFilters(); this.search(); }

  async search() {
    const f = this.filters;
    this.f.query = f.query;
    this.page = 0;
    this.status('Searching…');
    try {
      const range = leagueWaveRange(f.league);
      const rows = await this.session.backend.searchPlayers({ query: f.query, ...range, townHall: f.hall, sort: f.sort, limit: 50 });
      if (!this.modal.frame) return;
      this.results = rows;
      this.drawResults();
    } catch (e) {
      if (this.modal.frame) this.status(e.message || 'Couldn’t search right now.', true);
    }
  }

  status(text, error = false) {
    const m = this.modal, s = this.scene;
    this.clearBody(this.body);
    this.addBody(s.add.text(m.cx, m.y + 400, text, bodyStyle(19, error ? COLORS.inkBad : COLORS.inkDim, { align: 'center', wordWrap: { width: W - 80 } })).setOrigin(0.5));
    if (error) this.addBody(new Button(s, m.cx, m.y + 460, 180, 50, 'Retry', () => this.search(), { color: COLORS.buttonBlue, fontSize: 20 }));
  }

  drawResults() {
    const m = this.modal, s = this.scene;
    this.clearBody(this.body);
    const rows = this.results || [];
    const left = m.x + 28, w = W - 56;
    const cols = { badge: left + 26, name: left + 54, hall: left + w - 330, wave: left + w - 235, ach: left + w - 145 };
    let y = m.y + 236;
    for (const [x, label, o] of [[cols.name, 'Player', 0], [cols.hall, 'Village Hall', 0.5], [cols.wave, 'Wave', 0.5], [cols.ach, 'Achievements', 0.5]]) {
      this.addBody(s.add.text(x, y, label, bodyStyle(14, COLORS.inkDim)).setOrigin(o, 0.5));
    }
    y += 18;
    if (!rows.length) { this.addBody(s.add.text(m.cx, y + 120, 'No players match.', bodyStyle(19, COLORS.inkDim)).setOrigin(0.5)); return; }
    const pages = Math.ceil(rows.length / PER_PAGE);
    this.page = Math.min(this.page, pages - 1);
    rows.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((r, i) => {
      const ry = y + i * (ROW_H + ROW_GAP), cy = ry + ROW_H / 2;
      const g = this.addBody(s.add.graphics());
      const paint = (hover) => {
        g.clear().fillStyle(r.isMe ? 0xfff1c4 : hover ? 0xf2ecdf : i % 2 ? 0xe6e0d2 : 0xdcd5c5, 1).fillRoundedRect(left, ry, w, ROW_H, 9);
        if (r.isMe) g.lineStyle(2, COLORS.button, 1).strokeRoundedRect(left, ry, w, ROW_H, 9);
      };
      paint(false);
      const league = leagueFor(r.bestWave);
      if (league && s.textures.exists(league.texture)) fitIcon(this.addBody(s.add.image(cols.badge, cy, league.texture)), leagueBadgeSize(league, 36));
      const name = this.addBody(s.add.text(cols.name, cy, r.username, bodyStyle(18)).setOrigin(0, 0.5));
      fitWidth(name, cols.hall - cols.name - 70);
      if (r.isMe) this.addBody(s.add.text(cols.name + name.displayWidth + 8, cy, '(you)', bodyStyle(14, COLORS.inkAccent)).setOrigin(0, 0.5));
      this.addBody(s.add.text(cols.hall, cy, r.bestTownHall ? String(r.bestTownHall) : '-', bodyStyle(18)).setOrigin(0.5));
      this.addBody(s.add.text(cols.wave, cy, String(r.bestWave || 0), textStyle(20, COLORS.textGold)).setOrigin(0.5));
      this.addBody(s.add.text(cols.ach, cy, String(r.achievements || 0), bodyStyle(18)).setOrigin(0.5));
      // The row opens the card; Visit goes straight to their best village.
      const zone = this.addBody(s.add.zone(left, ry, w - VISIT_W - 12, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => paint(true));
      zone.on('pointerout', () => paint(false));
      zone.on('pointerup', () => this.onOpenPlayer(r.username));
      this.addBody(visitButton(s, left + w - 6, cy, 30, () => this.onVisitBest(r.username)));
    });
    if (pages > 1) {
      const py = m.y + H - 40;
      this.addBody(new Button(s, m.cx - 90, py, 44, 40, '', () => { this.page = (this.page - 1 + pages) % pages; this.drawResults(); }, { color: COLORS.buttonBlue, icon: 'left', radius: 9 }));
      this.addBody(s.add.text(m.cx, py, `${this.page + 1} / ${pages}`, textStyle(18)).setOrigin(0.5));
      this.addBody(new Button(s, m.cx + 90, py, 44, 40, '', () => { this.page = (this.page + 1) % pages; this.drawResults(); }, { color: COLORS.buttonBlue, icon: 'right', radius: 9 }));
    }
  }

  close() { this.modal.close(); }
  destroy() { this.modal.destroy(); }
}
