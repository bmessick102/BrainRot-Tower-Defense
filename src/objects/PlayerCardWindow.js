// A player's card (v0.7), from the leaderboard or player search: their league badge and name, four stat tiles
// (furthest wave, Village Hall, rank, achievements), the achievements they've earned, and their villages (best first)
// with a green Visit button each to go and look at it. A player who hides their villages shows a note instead.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { leagueFor, leagueBadgeSize } from '../logic/leagues.js';
import { ACHIEVEMENTS } from '../logic/achievements.js';
import { fitIcon, fitWidth } from './uiDraw.js';

import { TEX } from '../assetKeys.js';

const TROPHY = TEX.achievementIcon;

const W = 660, H = 620, ACH_SHOWN = 8;

/** A green button at the right end of a list row: "Visit" (a village, on the card) or "Profile" (a player's card,
 *  on the leaderboard and Find Players; v0.8.0). */
export const VISIT_W = 78;
export function rowButton(scene, rightX, y, h, label, onClick) {
  return new Button(scene, rightX - VISIT_W / 2, y, VISIT_W, h, label, onClick, { color: COLORS.buttonGood, fontSize: 16, radius: 9 });
}
export const visitButton = (scene, rightX, y, h, onClick) => rowButton(scene, rightX, y, h, 'Visit', onClick);
export const profileButton = (scene, rightX, y, h, onClick) => rowButton(scene, rightX, y, h, 'Profile', onClick);

export class PlayerCardWindow {
  /**
   * @param {object} o
   * @param {object} o.session  the account session (session.backend.playerProfile)
   * @param {string} o.username
   * @param {(profile, baseId) => void} o.onVisit  look at one of their villages
   * @param {string} [o.focusBaseId] the village it's opened for (a leaderboard row's, or the one just visited): marked
   * @param {() => void} [o.onClose]
   */
  constructor(scene, { session, username, onVisit, onClose = null, focusBaseId = null }) {
    this.scene = scene;
    this.focusBaseId = focusBaseId;
    this.session = session;
    this.username = username;
    this.onVisit = onVisit;
    this.modal = new Modal(scene, { width: W, height: H, title: username, onClose });
    this.load();
  }

  async load() {
    this.message('Loading…');
    try {
      const p = await this.session.backend.playerProfile(this.username);
      if (!this.modal.frame) return;
      if (!p) { this.message('That player couldn’t be found.', true); return; }
      this.render(p);
    } catch (e) {
      if (this.modal.frame) this.message(e.message || 'Couldn’t load that player.', true);
    }
  }

  message(text, error = false) {
    const m = this.modal, s = this.scene;
    if (!m.frame) return;
    m.clear();
    m.add(s.add.text(m.cx, m.y + H / 2 - 20, text, bodyStyle(20, error ? COLORS.inkBad : COLORS.inkDim, { align: 'center', wordWrap: { width: W - 80 } })).setOrigin(0.5));
    if (error) m.add(new Button(s, m.cx, m.y + H / 2 + 46, 200, 52, 'Retry', () => this.load(), { color: COLORS.buttonBlue, fontSize: 21 }));
  }

  render(p) {
    const m = this.modal, s = this.scene;
    m.clear();
    m.setTitle(p.username);
    const left = m.x + 28, w = W - 56;
    // Name row: league badge, league name, joined date.
    const league = leagueFor(p.bestWave);
    let y = m.y + 80;
    if (league && s.textures.exists(league.texture)) fitIcon(m.add(s.add.image(left + 30, y + 22, league.texture)), leagueBadgeSize(league, 62));
    const nx = left + 70;
    m.add(s.add.text(nx, y, league ? `${league.name} League` : 'No league yet', textStyle(22, league ? COLORS.textGold : COLORS.text)));
    const joined = p.joinedAt ? new Date(p.joinedAt) : null;
    const sub = [p.isMe ? 'This is you' : null, joined && !Number.isNaN(joined.getTime()) ? `Playing since ${joined.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}` : null].filter(Boolean).join('  ·  ');
    m.add(s.add.text(nx, y + 30, sub, bodyStyle(16, COLORS.inkDim)));

    // Stat tiles.
    y += 66;
    const tiles = [
      ['Furthest wave', p.bestWave > 0 ? String(p.bestWave) : '-'],
      ['Village Hall', p.bestTownHall > 0 ? String(p.bestTownHall) : '-'],
      ['Best rank', p.bestWave > 0 && p.rank ? `#${p.rank}` : '-'], // their best village's leaderboard rank
      ['Achievements', `${p.achievements.length} / ${ACHIEVEMENTS.length}`]
    ];
    const tw = (w - 3 * 10) / 4;
    const g = m.add(s.add.graphics());
    tiles.forEach(([label, value], i) => {
      const tx = left + i * (tw + 10);
      g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(tx, y, tw, 70, 12);
      g.fillStyle(COLORS.tray, 1).fillRoundedRect(tx + 2, y + 3, tw - 4, 65, 11);
      m.add(s.add.text(tx + tw / 2, y + 26, value, textStyle(26, COLORS.textGold)).setOrigin(0.5));
      m.add(s.add.text(tx + tw / 2, y + 54, label, bodyStyle(14, COLORS.inkDim)).setOrigin(0.5));
    });

    // Achievements: the newest ones as chips (with the trophy), and how many more.
    y += 88;
    m.add(s.add.text(left, y, 'Achievements', textStyle(19)));
    y += 30;
    const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
    const earned = [...p.achievements].sort((a, b) => String(b.earnedAt).localeCompare(String(a.earnedAt))).map((a) => byId.get(a.id)).filter(Boolean);
    if (!earned.length) m.add(s.add.text(left, y + 4, 'None yet.', bodyStyle(16, COLORS.inkDim)));
    const cw = (w - 10) / 2, ch = 30;
    earned.slice(0, ACH_SHOWN).forEach((a, i) => {
      const cx = left + (i % 2) * (cw + 10), cy = y + Math.floor(i / 2) * (ch + 6);
      g.fillStyle(0xe9e1cf, 1).fillRoundedRect(cx, cy, cw, ch, 9);
      if (s.textures.exists(TROPHY)) fitIcon(m.add(s.add.image(cx + 17, cy + ch / 2, TROPHY)), 22);
      const t = m.add(s.add.text(cx + 34, cy + ch / 2, a.name, bodyStyle(15, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      fitWidth(t, cw - 44);
    });
    const rows = Math.min(ACH_SHOWN, Math.max(1, earned.length));
    y += Math.ceil(rows / 2) * (ch + 6);
    if (earned.length > ACH_SHOWN) { m.add(s.add.text(left + w, y - 2, `+${earned.length - ACH_SHOWN} more`, bodyStyle(14, COLORS.inkDim)).setOrigin(1, 0)); }

    // Villages (best first), each with a Visit button.
    y += 14;
    m.add(s.add.text(left, y, 'Villages', textStyle(19)));
    y += 30;
    const bottom = m.y + H - 92;
    if (!p.bases.length) {
      const why = p.publicBases || p.isMe ? 'No villages to show yet.' : `${p.username} keeps their villages private.`;
      m.add(s.add.text(left, y + 4, why, bodyStyle(16, COLORS.inkDim)));
    }
    const rowH = 38;
    // The village it was opened for is marked (outlined, like your own row on the leaderboard); else their best one.
    const marked = p.bases.some((b) => b.id === this.focusBaseId) ? this.focusBaseId : p.bases[0] && p.bases[0].id;
    p.bases.forEach((b, i) => {
      const ry = y + i * (rowH + 4);
      if (ry + rowH > bottom) return;
      const on = b.id === marked;
      g.fillStyle(on ? 0xfff1c4 : 0xe6e0d2, 1).fillRoundedRect(left, ry, w, rowH, 9);
      if (on) g.lineStyle(2, COLORS.button, 1).strokeRoundedRect(left, ry, w, rowH, 9);
      // Its leaderboard rank (v0.8.5; a village with no wave yet isn't on the board).
      const rank = m.add(s.add.text(left + 12, ry + rowH / 2, b.rank ? `#${b.rank}` : '-', textStyle(16, b.rank ? COLORS.textGold : COLORS.textDim)).setOrigin(0, 0.5));
      const name = m.add(s.add.text(left + 66, ry + rowH / 2, b.name, bodyStyle(17, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      fitWidth(rank, 50);
      fitWidth(name, w - 350);
      if (i === 0) m.add(s.add.text(name.x + name.displayWidth + 8, ry + rowH / 2, 'Best', bodyStyle(13, COLORS.inkAccent, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      m.add(s.add.text(left + w - VISIT_W - 20, ry + rowH / 2, `Village Hall ${b.townHall || '-'}  ·  Wave ${Math.max(b.bestWave || 0, 0)}`, bodyStyle(15, COLORS.inkDim)).setOrigin(1, 0.5));
      m.add(visitButton(s, left + w - 6, ry + rowH / 2, 30, () => this.visit(p, b.id)));
    });

    // The big button: their best village.
    const best = p.bases[0];
    const btn = m.add(new Button(s, m.cx, m.y + H - 46, 330, 56, best ? 'Visit Best Village' : 'No Village to Visit', () => best && this.visit(p, best.id), { color: COLORS.buttonGood, fontSize: 21 }));
    if (!best) btn.setEnabled(false);
  }

  visit(profile, baseId) {
    this.modal.destroy();
    this.onVisit(profile, baseId);
  }

  destroy() { this.modal.destroy(); }
}
