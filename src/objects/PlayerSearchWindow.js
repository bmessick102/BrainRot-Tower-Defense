// Find Players (v0.7, from Settings): search by name, filter by league and Village Hall, sort by furthest wave,
// Village Hall or achievements. Each result shows its league badge, name, Village Hall, wave and achievements, with an
// green Profile button (v0.8.0; visiting is on the card); clicking the row opens their card (PlayerCardWindow).
// v0.8.3: paged on the server, SEARCH_PAGE players at a time (paging.js): each page is its own (spam-guarded) request
// with the filters of the last search, and Next is offered while the server has more.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { addTextField } from './TextField.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { LEAGUES, leagueFor, leagueBadgeSize } from '../logic/leagues.js';
import { CONFIG } from '../config.js';
import { fitIcon, fitWidth } from './uiDraw.js';
import { profileButton, VISIT_W } from './PlayerCardWindow.js';
import { SEARCH_PAGE } from '../net/paging.js';

const W = 780, H = 650, ROW_H = 38, ROW_GAP = 3, PER_PAGE = SEARCH_PAGE; // (8 rows end above the page arrows)
// Spam guard: one request at a time, at least this long apart. Presses in between (Search, Enter, the filters, the page
// arrows) are merged into one request for the newest of them, run when it's allowed. The server has its own limit too
// (supabase: rate_limit_hit), which answers "Too many searches" past it.
export const SEARCH_GAP_MS = 1000;
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
   * @param {object} [o.filters] the last search's filters (kept when coming back)
   */
  constructor(scene, { session, onOpenPlayer, onClose = null, filters = null }) {
    this.scene = scene;
    this.session = session;
    this.onOpenPlayer = onOpenPlayer;
    this.f = { query: '', league: null, hall: null, sort: 'wave', ...(filters || {}) };
    this.page = 0;
    this.results = null;
    this.hasMore = false;
    this.active = null;       // the filters of the last search (what the pages page through)
    this.wantPage = 0;        // the page the next request asks for
    this.searching = false;   // a search is on its way to the server
    this.queued = false;      // pressed again meanwhile: search once more (newest filters) when it's back
    this.lastSearchAt = -Infinity;
    this.gapTimer = null;
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
    add(s.add.text(left + 284, y, 'Sort by', bodyStyle(15, COLORS.inkDim)).setOrigin(0, 0.5));
    // Sort: three toggles sharing what's left of the row, so the last one ends at the window's inner edge.
    const sortLeft = left + 348, gap = 6, sw = (left + W - 56 - sortLeft - gap * (SORTS.length - 1)) / SORTS.length;
    SORTS.forEach(([key, label], i) => {
      const b = add(new Button(s, sortLeft + sw / 2 + i * (sw + gap), y, sw, 36, label, () => { this.f.sort = key; this.refilter(); },
        { color: this.f.sort === key ? COLORS.buttonGood : COLORS.buttonDark, fontSize: 14, radius: 9 }));
      if (b.label) fitWidth(b.label, sw - 12);
    });
  }

  refilter() { this.drawFilters(); this.search(); }

  /** A new search with the current filters, from its first page. */
  search() {
    this.active = this.filters;
    this.f.query = this.active.query;
    this.wantPage = 0;
    this.request();
  }

  /** Another page of the last search. */
  goPage(page) {
    if (page < 0 || !this.active) return;
    this.wantPage = page;
    this.request();
  }

  /** Ask the server for page `wantPage` of the last search (spam-guarded: see SEARCH_GAP_MS). */
  async request() {
    if (!this.modal.frame) return; // closed
    if (this.searching) { this.queued = true; return; }
    const wait = this.lastSearchAt + SEARCH_GAP_MS - Date.now();
    if (wait > 0) {
      if (!this.gapTimer) this.gapTimer = this.scene.time.delayedCall(wait, () => { this.gapTimer = null; this.request(); });
      return;
    }
    this.searching = true;
    this.lastSearchAt = Date.now();
    const f = this.active, page = this.wantPage;
    if (page === 0 || !this.results) this.status('Searching…'); // (paging keeps the rows on screen until the next ones come)
    try {
      const range = leagueWaveRange(f.league);
      // One page, plus one row to know if there's another.
      const rows = await this.session.backend.searchPlayers({ query: f.query, ...range, townHall: f.hall, sort: f.sort, limit: PER_PAGE + 1, offset: page * PER_PAGE });
      if (!this.modal.frame) return;
      if (page > 0 && !rows.length) { this.wantPage = page - 1; this.queued = true; return; } // fewer players than before: step back
      this.page = page;
      this.hasMore = rows.length > PER_PAGE;
      this.results = rows.slice(0, PER_PAGE);
      this.drawResults();
    } catch (e) {
      if (this.modal.frame) this.status(e.message || 'Couldn’t search right now.', true);
    } finally {
      this.searching = false;
      if (this.queued) { this.queued = false; this.request(); }
    }
  }

  status(text, error = false) {
    const m = this.modal, s = this.scene;
    this.clearBody(this.body);
    this.addBody(s.add.text(m.cx, m.y + 400, text, bodyStyle(19, error ? COLORS.inkBad : COLORS.inkDim, { align: 'center', wordWrap: { width: W - 80 } })).setOrigin(0.5));
    if (error) this.addBody(new Button(s, m.cx, m.y + 460, 180, 50, 'Retry', () => this.request(), { color: COLORS.buttonBlue, fontSize: 20 }));
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
    rows.forEach((r, i) => {
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
      // The row opens the card, and so does its Profile button.
      const zone = this.addBody(s.add.zone(left, ry, w - VISIT_W - 12, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => paint(true));
      zone.on('pointerout', () => paint(false));
      zone.on('pointerup', () => this.onOpenPlayer(r.username));
      this.addBody(profileButton(s, left + w - 6, cy, 30, () => this.onOpenPlayer(r.username)));
    });
    // Pages: Back / Next (greyed out at either end), "Page n" between them.
    if (this.page > 0 || this.hasMore) {
      const py = m.y + H - 32;
      const prev = this.addBody(new Button(s, m.cx - 90, py, 44, 36, '', () => this.goPage(this.page - 1), { color: COLORS.buttonBlue, icon: 'left', radius: 9 }));
      this.addBody(s.add.text(m.cx, py, `Page ${this.page + 1}`, textStyle(18)).setOrigin(0.5));
      const next = this.addBody(new Button(s, m.cx + 90, py, 44, 36, '', () => this.goPage(this.page + 1), { color: COLORS.buttonBlue, icon: 'right', radius: 9 }));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.hasMore);
    }
  }

  close() { this.modal.close(); }
  destroy() { this.modal.destroy(); }
}
