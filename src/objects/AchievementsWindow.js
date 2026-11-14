// Achievements window: tabs (Village / Battle / Builder), a card per achievement with its medal, progress and
// gold reward. Earned rewards are claimed into the village being played (opened from the in-game Profile, top left);
// from the title screen the window only shows progress.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { drawStatBar, drawBadge } from './uiDraw.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, achievementProgress, progressValues } from '../logic/achievements.js';
import { addGold, formatGold } from '../logic/economy.js';
import { isWaveActive } from '../logic/util.js';
import { TEX, SFX } from '../assetKeys.js';
import { playSfx } from '../audio.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

const W = 880, H = 610, TOP = 55;
const CARD_H = 80, CARD_GAP = 8, COL_GAP = 16, PAD = 24;
const GOLD = 0xffc83a, GOLD_DARK = 0xa86a12;

/** A five-pointed star centered on cx, cy. */
function star(g, cx, cy, r, color) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  g.fillStyle(color, 1).fillPoints(pts, true);
  g.lineStyle(2, COLORS.frame, 0.8).strokePoints(pts, true);
}

const ICON_H = 62, HEADER_ICON_H = 36;

/**
 * A faded grey copy of a texture for achievements not earned yet, made once and cached as `<key>_grey`
 * (drawn on a canvas, so it works with both renderers).
 */
function greyTexture(scene, key) {
  const greyKey = `${key}_grey`;
  if (scene.textures.exists(greyKey)) return greyKey;
  const src = scene.textures.get(key).getSourceImage();
  const tex = scene.textures.createCanvas(greyKey, src.width, src.height);
  const ctx = tex.getContext();
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = 60 + lum * 0.7; // lifted and flattened so it reads as "locked"
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  return greyKey;
}

/** The achievement icon centered on (x, y), `h` px tall: full color when earned, grey when not. */
function addIcon(scene, x, y, h, earned) {
  const img = scene.add.image(x, y, earned ? TEX.achievementIcon : greyTexture(scene, TEX.achievementIcon));
  img.setScale(h / img.frame.height);
  if (!earned) img.setAlpha(0.85);
  return img;
}

export class AchievementsWindow {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} o
   * @param {import('../net/session.js').Session} o.session
   * @param {object} [o.gs] the GameState being played (needed to claim rewards)
   * @param {() => void} [o.onClose]
   */
  constructor(scene, { session, gs = null, onClose = null }) {
    this.scene = scene;
    this.session = session;
    this.gs = gs;
    this.message = '';
    const claimable = new Set(session.unclaimed());
    const firstWithClaim = ACHIEVEMENT_GROUPS.find((grp) => ACHIEVEMENTS.some((a) => a.group === grp.key && claimable.has(a.id)));
    this.tab = firstWithClaim ? firstWithClaim.key : ACHIEVEMENT_GROUPS[0].key;
    this.modal = new Modal(scene, { width: W, height: H, title: 'Achievements', y: TOP, onClose });
    this.render();
  }

  render() {
    const m = this.modal, s = this.scene, ses = this.session;
    if (!m.frame) return;
    m.clear();
    const earned = ses.earnedIds(), claimable = new Set(ses.unclaimed());
    const values = progressValues(ses.stats, this.gs);

    // Count in the header (left).
    this.hasIcon = s.textures.exists(TEX.achievementIcon);
    if (this.hasIcon) m.add(addIcon(s, m.x + 36, m.y + 33, HEADER_ICON_H, true));
    else star(m.add(s.add.graphics()), m.x + 36, m.y + 34, 15, GOLD);
    m.add(s.add.text(m.x + 58, m.y + 34, `${earned.size} / ${ACHIEVEMENTS.length}`, textStyle(22, COLORS.textGold)).setOrigin(0, 0.5));

    // Tabs, each with a red badge counting rewards ready to claim.
    const tabW = 180, tabY = m.y + 60 + 32;
    ACHIEVEMENT_GROUPS.forEach((grp, i) => {
      const x = m.cx + (i - (ACHIEVEMENT_GROUPS.length - 1) / 2) * (tabW + 12);
      m.add(new Button(s, x, tabY, tabW, 40, grp.label, () => { this.tab = grp.key; this.message = ''; this.render(); },
        { fontSize: 20, radius: 10, color: this.tab === grp.key ? COLORS.buttonGood : COLORS.buttonDark }));
      const n = ACHIEVEMENTS.filter((a) => a.group === grp.key && claimable.has(a.id)).length;
      if (n) {
        const bg = m.add(s.add.graphics());
        drawBadge(bg, x + tabW / 2 - 6, tabY - 16, 12);
        m.add(s.add.text(x + tabW / 2 - 6, tabY - 17, String(n), textStyle(15)).setOrigin(0.5));
      }
    });

    const list = ACHIEVEMENTS.filter((a) => a.group === this.tab);
    const cardW = (W - PAD * 2 - COL_GAP) / 2;
    const top = m.y + 128;
    list.forEach((a, i) => {
      const col = i % 2, rowI = Math.floor(i / 2);
      this.card(a, m.x + PAD + col * (cardW + COL_GAP), top + rowI * (CARD_H + CARD_GAP), cardW, earned.has(a.id), claimable.has(a.id), values);
    });

    const note = this.message || (this.gs ? '' : 'Rewards are claimed inside a village: Profile (top left) → Achievements.');
    this.msg = m.add(s.add.text(m.cx, m.y + H - 22, note, bodyStyle(16, this.message ? COLORS.inkBad : COLORS.inkDim, { align: 'center' })).setOrigin(0.5));
  }

  card(a, x, y, w, earned, claimable, values) {
    const m = this.modal, s = this.scene;
    const g = m.add(s.add.graphics());
    const face = !earned ? 0xe2dccd : claimable ? 0xfff1c4 : 0xe4f3d2;
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, CARD_H, 12);
    g.fillStyle(face, 1).fillRoundedRect(x + 3, y + 3, w - 6, CARD_H - 6, 10);
    if (claimable) g.lineStyle(3, COLORS.button, 1).strokeRoundedRect(x + 3, y + 3, w - 6, CARD_H - 6, 10);

    // Icon: the achievement trophy, full color when earned, grey when not (a drawn medal if the art is missing).
    const mx = x + 40, my = y + CARD_H / 2;
    if (this.hasIcon) {
      m.add(addIcon(s, mx, my, ICON_H, earned));
    } else {
      g.fillStyle(COLORS.frame, 1).fillCircle(mx, my + 2, 27);
      g.fillStyle(earned ? GOLD_DARK : 0x6f6a62, 1).fillCircle(mx, my, 26);
      g.fillStyle(earned ? GOLD : 0xa9a397, 1).fillCircle(mx, my - 2, 22);
      star(g, mx, my - 2, 14, earned ? 0xfff6d0 : 0xcfc9bd);
    }

    const tx = x + 78;
    m.add(s.add.text(tx, y + 16, a.name, bodyStyle(18, earned ? COLORS.ink : COLORS.inkDim)).setOrigin(0, 0.5));
    m.add(s.add.text(tx, y + 38, a.desc, bodyStyle(13, COLORS.inkDim, { wordWrap: { width: w - 78 - 128 } })).setOrigin(0, 0.5));
    const p = achievementProgress(a, values);
    if (!earned) {
      const bar = m.add(s.add.graphics());
      drawStatBar(bar, tx, y + 56, 150, p.value / p.goal, 0x6cbf2c, 12);
      m.add(s.add.text(tx + 158, y + 62, `${formatGold(p.value)} / ${formatGold(p.goal)}`, bodyStyle(13, COLORS.inkDim)).setOrigin(0, 0.5));
    }

    // Reward (right): coin + amount, then Claim / Claimed.
    const rx = x + w - 66;
    if (s.textures.exists(TEX.coin)) {
      const coin = s.add.image(rx - 34, y + 22, TEX.coin);
      coin.setScale(20 / Math.max(coin.frame.width, coin.frame.height));
      m.add(coin);
    }
    m.add(s.add.text(rx - 20, y + 22, formatGold(a.reward), bodyStyle(17, earned && !claimable ? COLORS.inkDim : COLORS.inkAccent)).setOrigin(0, 0.5));
    if (claimable && this.gs) {
      m.add(new Button(s, rx, y + 54, 104, 36, 'Claim', () => this.claim(a), { color: COLORS.buttonGood, fontSize: 18, radius: 9 }));
    } else if (claimable) {
      m.add(s.add.text(rx, y + 54, 'Ready to claim', bodyStyle(13, COLORS.inkAccent)).setOrigin(0.5));
    } else if (earned) {
      m.add(s.add.text(rx, y + 54, '✔ Claimed', bodyStyle(15, COLORS.inkGood)).setOrigin(0.5));
    }
  }

  /** Pay the reward into the village (if it fits in storage) and mark it claimed. */
  claim(a) {
    const gs = this.gs;
    if (!gs) return;
    if (isWaveActive(gs)) { this.message = 'Claim rewards after the wave.'; this.render(); return; }
    if (gs.gold + a.reward > gs.capacity) {
      this.message = `Not enough storage room for ${formatGold(a.reward)} gold: spend some, or build / upgrade Bitcoin Storage.`;
      this.render();
      return;
    }
    if (!this.session.claim(a.id)) return;
    addGold(gs, a.reward);
    gs.emit('goldChanged', { gold: gs.gold, capacity: gs.capacity });
    gs.save();
    playSfx(this.scene, SFX.coinCollect);
    this.message = '';
    this.render();
  }
}
