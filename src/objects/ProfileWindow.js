// Profile window (opened from the profile pill, top left of the game screen): who you are, your league and
// how far to the next one, your leaderboard rank, your achievements (and the window to claim them), and
// lifetime stats for the whole account. Achievements and the Leaderboard open on top of it.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { AchievementsWindow } from './AchievementsWindow.js';
import { LeaderboardWindow } from './LeaderboardWindow.js';
import { drawBadge, drawTag } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { leagueFor, nextLeague, LEAGUES } from '../logic/leagues.js';
import { ACHIEVEMENTS } from '../logic/achievements.js';
import { formatGold } from '../logic/economy.js';

const W = 760;
// Lifetime stats: [label, value from session.stats].
const STATS = [
  ['Enemies defeated', (s) => s.counters.kills],
  ['Gold mined', (s) => s.counters.mined],
  ['Bombers shot down', (s) => s.counters.bomberKills],
  ['Balloons popped', (s) => s.counters.balloonKills],
  ['Perfect waves', (s) => s.counters.perfect],
  ['Wave stars', (s) => s.counters.stars],
  ['Traps sprung', (s) => s.counters.traps],
  ['Waves called early', (s) => s.counters.early],
  ['Best Village Hall', (s) => s.bestTownHall]
];
// The stats card is the last thing in the window: it starts STATS_TOP below the window top and has a row per
// two stats, so the window's height follows the list (a new stat can't spill out of the bottom).
const STATS_TOP = 362, STAT_ROW = 30, STATS_HEAD = 46, BOTTOM_PAD = 18;
const H = STATS_TOP + STATS_HEAD + Math.ceil(STATS.length / 2) * STAT_ROW + BOTTOM_PAD;

/** A light card with a title, for one section of the window. */
function card(scene, m, x, y, w, h, title) {
  const g = scene.add.graphics();
  g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, h, 12);
  g.fillStyle(0xf6f1e6, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 5, 11);
  m.add(g);
  m.add(scene.add.text(x + 16, y + 12, title, bodyStyle(15, COLORS.inkDim, { fontStyle: 'bold' })));
  return g;
}

export class ProfileWindow {
  /** scene: UIScene; gs: the village being played (rewards are claimed into it); onClose: called after. */
  /** news: what was new when it opened (profileNews.js), shown with NEW! tags. */
  constructor(scene, { session, gs, news = null, onClose = null }) {
    this.scene = scene;
    this.session = session;
    this.gs = gs;
    this.news = news || { newAchievements: [], newLeague: null };
    this.rank = 'loading';
    this.modal = new Modal(scene, { width: W, height: H, title: 'Profile', header: 56, onClose });
    this.render();
    this.loadRank();
  }

  /** Your leaderboard rank (from the server; the board lists the top players plus you). */
  async loadRank() {
    try {
      await this.session.sendOutbox(); // your newest furthest wave first
      const rows = await this.session.backend.leaderboard(10);
      const me = rows.find((r) => r.isMe);
      this.rank = me ? me.rank : null;
    } catch {
      this.rank = 'error';
    }
    this.render();
  }

  render() {
    const m = this.modal, s = this.scene, ses = this.session;
    if (!m.frame) return;
    m.clear();
    const stats = ses.stats;
    const best = stats.bestWave || 0;
    const league = leagueFor(best), next = nextLeague(best);
    const left = m.x + 24, inner = W - 48;

    // ---- who you are + league ----
    let y = m.y + 72;
    card(s, m, left, y, inner, 150, '');
    const bx = left + 70, by = y + 75;
    if (league && s.textures.exists(league.texture)) {
      const img = m.add(s.add.image(bx, by, league.texture));
      img.setScale(110 / Math.max(img.frame.width, img.frame.height));
    } else {
      const g = m.add(s.add.graphics());
      g.fillStyle(COLORS.frame, 1).fillCircle(bx, by, 46);
      g.fillStyle(0xb9b1a2, 1).fillCircle(bx, by, 43);
      m.add(s.add.text(bx, by, '?', textStyle(40)).setOrigin(0.5));
    }
    const tx = left + 140;
    m.add(s.add.text(tx, y + 16, ses.user.username, textStyle(30)));
    const lt = m.add(s.add.text(tx, y + 54, league ? `${league.name} League` : 'No league yet', textStyle(19, league ? COLORS.textGold : COLORS.textDim)));
    if (this.news.newLeague) this.newTag(lt.x + lt.width + 10, lt.y, 'NEW!');
    m.add(s.add.text(tx, y + 82, `Furthest wave survived: ${best}`, bodyStyle(16, COLORS.ink)));
    // Progress to the next league.
    const barX = tx, barY = y + 112, barW = left + inner - 24 - tx, barH = 16;
    const from = league ? league.minWave : 0;
    const frac = next ? Math.max(0, Math.min(1, (best - from) / (next.minWave - from))) : 1;
    const g = m.add(s.add.graphics());
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(barX, barY, barW, barH, barH / 2);
    g.fillStyle(0x2c261f, 1).fillRoundedRect(barX + 2, barY + 2, barW - 4, barH - 4, (barH - 4) / 2);
    if (frac > 0) g.fillStyle(0xffc83a, 1).fillRoundedRect(barX + 2, barY + 2, Math.max(barH - 4, (barW - 4) * frac), barH - 4, (barH - 4) / 2);
    const label = next
      ? `${next.minWave - best} more wave${next.minWave - best === 1 ? '' : 's'} to ${next.name} (wave ${next.minWave})`
      : `Top league reached! (${LEAGUES.length} of ${LEAGUES.length})`;
    m.add(s.add.text(barX + barW, y + 84, label, bodyStyle(14, COLORS.inkAccent, { fontStyle: 'bold' })).setOrigin(1, 0));

    // ---- rank + achievements ----
    y += 164;
    const half = (inner - 16) / 2;
    card(s, m, left, y, half, 112, 'Leaderboard rank');
    const rankText = this.rank === 'loading' ? 'Loading…' : this.rank === 'error' ? 'Offline' : this.rank ? `#${this.rank}` : 'Unranked';
    m.add(s.add.text(left + 16, y + 40, rankText, textStyle(this.rank > 0 ? 34 : 22, this.rank > 0 ? COLORS.textGold : COLORS.textDim)));
    if (!this.rank && this.rank !== 'loading' && this.rank !== 'error') m.add(s.add.text(left + 16, y + 74, 'Survive a wave to rank', bodyStyle(13, COLORS.inkDim)));
    m.add(new Button(s, left + half - 82, y + 70, 140, 46, 'Leaderboard', () => this.openLeaderboard(), { color: COLORS.buttonBlue, fontSize: 17, radius: 10 }));

    const ax = left + half + 16;
    card(s, m, ax, y, half, 112, 'Achievements');
    const earned = ses.earnedIds().size, unclaimed = ses.unclaimed().length;
    const count = m.add(s.add.text(ax + 16, y + 40, `${earned} / ${ACHIEVEMENTS.length}`, textStyle(30, COLORS.textGold)));
    const fresh = this.news.newAchievements.length;
    if (fresh) this.newTag(count.x + count.width + 10, count.y + 6, `${fresh} NEW!`);
    m.add(s.add.text(ax + 16, y + 78, unclaimed ? `${unclaimed} reward${unclaimed === 1 ? '' : 's'} to claim!` : 'All rewards claimed', bodyStyle(13, unclaimed ? COLORS.inkAccent : COLORS.inkDim, { fontStyle: 'bold' })));
    const achBtn = m.add(new Button(s, ax + half - 82, y + 70, 140, 46, 'Open', () => this.openAchievements(), { color: COLORS.buttonGood, fontSize: 17, radius: 10 }));
    if (unclaimed) {
      const rx = achBtn.x + 70 - 6, ry = achBtn.y - 23 + 2;
      drawBadge(m.add(s.add.graphics()), rx, ry, 12);
      m.add(s.add.text(rx, ry - 1, String(unclaimed), textStyle(14)).setOrigin(0.5));
    }

    // ---- lifetime stats ----
    y = m.y + STATS_TOP;
    const rows = Math.ceil(STATS.length / 2), statH = STAT_ROW;
    card(s, m, left, y, inner, STATS_HEAD + rows * statH, 'Lifetime stats (all your villages)');
    STATS.forEach(([name, get], i) => {
      const col = i % 2, row = Math.floor(i / 2);
      const sx = left + 16 + col * (inner / 2), sy = y + 40 + row * statH, sw = inner / 2 - 32;
      m.add(s.add.text(sx, sy, name, bodyStyle(15, COLORS.inkDim)));
      m.add(s.add.text(sx + sw, sy, formatGold(get(stats) || 0), bodyStyle(16, COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0));
    });
  }

  /**
   * A red "NEW!" tag at (x, y). drawTag makes its label before its background, so it's built inside its own
   * container (which keeps the label on top) and the container goes in the window.
   */
  newTag(x, y, text) {
    const c = this.scene.add.container(0, 0);
    drawTag(this.scene, c, x, y, text, COLORS.badge, textStyle(13));
    this.modal.add(c);
  }

  openAchievements() {
    // Rewards are claimed into this village (not during a wave); the profile refreshes after.
    new AchievementsWindow(this.scene, { session: this.session, gs: this.gs, onClose: () => { this.render(); this.onAchievementsClosed?.(); } });
  }

  openLeaderboard() {
    new LeaderboardWindow(this.scene, { session: this.session, onClose: () => { this.rank = 'loading'; this.render(); this.loadRank(); } });
  }
}
