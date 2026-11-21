// Leaderboard: the top players by furthest wave survived (one row per player: their best village), each
// with their league badge (src/logic/leagues.js), your own row highlighted, and added at the bottom if
// you're not in the top list. The footer shows your league and what the next one takes. v0.7: click a row for that
// player's card (PlayerCardWindow); the eye button goes straight to their best village.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { leagueFor, nextLeague } from '../logic/leagues.js';
import { fitIcon, fitWidth } from './uiDraw.js';
import { eyeButton } from './PlayerCardWindow.js';

const W = 640, H = 640, TOP = 40, TOP_N = 10, ROW_H = 38, ROW_GAP = 4;
const MEDALS = [0xffc83a, 0xc9d1da, 0xd08a4a];

export class LeaderboardWindow {
  constructor(scene, { session, onClose = null, onOpenPlayer = null, onVisitBest = null }) {
    this.scene = scene;
    this.session = session;
    this.onOpenPlayer = onOpenPlayer;
    this.onVisitBest = onVisitBest;
    this.modal = new Modal(scene, { width: W, height: H, title: 'Leaderboard', y: TOP, onClose });
    this.load();
  }

  async load() {
    // Offline, nothing is sent: your waves reach the board when you log in again.
    if (this.session.offline) { this.show('You’re playing offline.\nThe leaderboard needs a connection: your progress is sent when you log in again.'); return; }
    this.show('Loading…');
    try {
      await this.session.sendOutbox(); // your newest best wave first
      const rows = await this.session.backend.leaderboard(TOP_N);
      this.render(rows);
    } catch (e) {
      this.show(e.message || 'Couldn’t load the leaderboard.', true);
    }
  }

  /** A status message in the middle (with Retry for errors). */
  show(text, error = false) {
    const m = this.modal, s = this.scene;
    if (!m.frame) return;
    m.clear();
    m.add(s.add.text(m.cx, m.y + H / 2 - 20, text, bodyStyle(20, error ? COLORS.inkBad : COLORS.inkDim, { align: 'center', wordWrap: { width: W - 80 } })).setOrigin(0.5));
    if (error) m.add(new Button(s, m.cx, m.y + H / 2 + 50, 200, 52, 'Retry', () => this.load(), { color: COLORS.buttonBlue, fontSize: 21 }));
  }

  render(rows) {
    const m = this.modal, s = this.scene;
    if (!m.frame) return;
    m.clear();
    m.add(s.add.text(m.cx, m.y + 84, 'Furthest wave survived', bodyStyle(18, COLORS.inkDim)).setOrigin(0.5));
    const left = m.x + 28, w = W - 56;
    const cols = { rank: left + 34, badge: left + 82, name: left + 110, hall: left + w - 220, wave: left + w - 110 };
    const hy = m.y + 116;
    m.add(s.add.text(cols.rank, hy, 'Rank', bodyStyle(14, COLORS.inkDim)).setOrigin(0.5));
    m.add(s.add.text(cols.name, hy, 'Player', bodyStyle(14, COLORS.inkDim)).setOrigin(0, 0.5));
    m.add(s.add.text(cols.hall, hy, 'Village Hall', bodyStyle(14, COLORS.inkDim)).setOrigin(0.5));
    m.add(s.add.text(cols.wave, hy, 'Wave', bodyStyle(14, COLORS.inkDim)).setOrigin(0.5));

    const top = rows.filter((r) => r.rank <= TOP_N);
    const mine = rows.find((r) => r.isMe && r.rank > TOP_N);
    let y = m.y + 136;
    if (!top.length) {
      m.add(s.add.text(m.cx, y + 160, 'Nobody is on the board yet.\nSurvive a wave to be the first!', bodyStyle(20, COLORS.inkDim, { align: 'center', lineSpacing: 8 })).setOrigin(0.5));
    }
    for (const r of top) { this.row(r, left, y, w, cols); y += ROW_H + ROW_GAP; }
    if (mine) {
      m.add(s.add.text(m.cx, y + 8, '· · ·', bodyStyle(18, COLORS.inkDim)).setOrigin(0.5));
      this.row(mine, left, y + 22, w, cols);
    }
    // Footer: your league, and the wave the next one needs.
    const me = this.session.stats.bestWave, myLeague = leagueFor(me), next = nextLeague(me);
    const parts = [];
    if (myLeague) parts.push(`Your league: ${myLeague.name}`);
    if (next) parts.push(`${next.name} at wave ${next.minWave}`);
    else if (myLeague) parts.push('the top league!');
    const foot = me > 0 ? parts.join('  ·  ') : `Survive a wave to get on the board (${next.name} league)`;
    const fy = m.y + H - 30;
    const ft = m.add(s.add.text(m.cx, fy, foot, bodyStyle(17, COLORS.inkDim)).setOrigin(0.5));
    if (myLeague && s.textures.exists(myLeague.texture)) {
      const img = m.add(s.add.image(ft.x - ft.width / 2 - 22, fy, myLeague.texture));
      fitIcon(img, 34);
    }
  }

  row(r, x, y, w, cols) {
    const m = this.modal, s = this.scene;
    const g = m.add(s.add.graphics());
    g.fillStyle(r.isMe ? 0xfff1c4 : r.rank % 2 ? 0xe6e0d2 : 0xdcd5c5, 1).fillRoundedRect(x, y, w, ROW_H, 9);
    if (r.isMe) g.lineStyle(3, COLORS.button, 1).strokeRoundedRect(x, y, w, ROW_H, 9);
    const cy = y + ROW_H / 2;
    if (r.rank <= 3 && s.textures.exists(`ui_medal_${r.rank}`)) {
      fitIcon(m.add(s.add.image(cols.rank, cy, `ui_medal_${r.rank}`)), ROW_H + 2); // v0.7: the gold / silver / bronze medal
    } else if (r.rank <= 3) {
      g.fillStyle(COLORS.frame, 1).fillCircle(cols.rank, cy + 1, 15);
      g.fillStyle(MEDALS[r.rank - 1], 1).fillCircle(cols.rank, cy, 13);
      m.add(s.add.text(cols.rank, cy, String(r.rank), textStyle(16)).setOrigin(0.5));
    } else {
      m.add(s.add.text(cols.rank, cy, String(r.rank), bodyStyle(17, COLORS.inkDim)).setOrigin(0.5));
    }
    // Your own row shows the wave your profile does (the server only counts waves it has verified, so it can be a
    // little behind for a while after a long offline stretch).
    const wave = r.isMe ? Math.max(r.bestWave, this.session.stats.bestWave || 0) : r.bestWave;
    const league = leagueFor(wave);
    if (league && s.textures.exists(league.texture)) {
      const img = m.add(s.add.image(cols.badge, cy, league.texture));
      fitIcon(img, 32);
    }
    const name = m.add(s.add.text(cols.name, cy, r.username, bodyStyle(18)).setOrigin(0, 0.5));
    fitWidth(name, cols.hall - cols.name - 110);
    if (r.isMe) m.add(s.add.text(cols.name + name.displayWidth + 8, cy, '(you)', bodyStyle(15, COLORS.inkAccent)).setOrigin(0, 0.5));
    m.add(s.add.text(cols.hall, cy, String(r.bestTownHall || '-'), bodyStyle(18, COLORS.ink)).setOrigin(0.5));
    m.add(s.add.text(cols.wave, cy, String(wave), textStyle(22, COLORS.textGold)).setOrigin(0.5));
    // v0.7: the row opens the player's card; the eye looks at their best village.
    if (this.onOpenPlayer) {
      const zone = m.add(s.add.zone(x, y, w - 56, ROW_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerup', () => this.onOpenPlayer(r.username));
    }
    if (this.onVisitBest) m.add(eyeButton(s, x + w - 24, cy + 1, 32, () => this.onVisitBest(r.username)));
  }

  close() { this.modal.close(); }
}
