// All the leagues lined out side by side: each badge with its name and the wave that gets you there. Used by the
// Profile window (compact) and the How to Play Leagues tab (large). Your own league is outlined and tagged
// "YOU"; leagues below it show a tick, leagues above it are dimmed. `best` < 0 means "no player" (How to Play
// when logged out): every league is shown plainly.
import { LEAGUES } from '../logic/leagues.js';
import { drawTag, fitWidth, fitIcon } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

/** What it takes, in words ("Survive wave 5" / "Reach wave 160"). */
export function leagueRequirement(league) {
  return league.minWave <= 5 ? `Survive wave ${league.minWave}` : `Reach wave ${league.minWave}`;
}

/**
 * @param {Phaser.Scene} scene
 * @param {(obj) => void} add registers each object with the window / page that owns them
 * @param {object} o
 * @param {number} o.x left edge, o.y top, o.w total width, o.h cell height
 * @param {number} o.best the furthest wave survived (-1: no player)
 * @param {boolean} [o.large] bigger badges and text (How to Play)
 */
export function addLeagueRow(scene, add, { x, y, w, h, best, large = false }) {
  const gap = large ? 14 : 8;
  const cw = (w - gap * (LEAGUES.length - 1)) / LEAGUES.length;
  const hasPlayer = best >= 0;
  const mine = hasPlayer ? LEAGUES.filter((l) => best >= l.minWave).pop() || null : null;
  // Large cells stack badge, name, requirement and a status note: the badge takes what the text leaves.
  const badge = Math.min(large ? 120 : 40, cw - 24, large ? h - (hasPlayer ? 112 : 92) : h * 0.52);

  LEAGUES.forEach((league, i) => {
    const cx0 = x + i * (cw + gap), cx = cx0 + cw / 2;
    const reached = hasPlayer && best >= league.minWave;
    const current = mine === league;
    const g = scene.add.graphics();
    g.fillStyle(current ? COLORS.button : COLORS.frame, current ? 1 : 0.2).fillRoundedRect(cx0, y, cw, h, 12);
    g.fillStyle(current ? 0xfff1c4 : reached ? 0xe4f3d2 : 0xe6e0d2, 1).fillRoundedRect(cx0 + 2, y + 2, cw - 4, h - 5, 11);
    add(g);

    const by = y + 10 + badge / 2;
    if (scene.textures.exists(league.texture)) {
      const img = scene.add.image(cx, by, league.texture);
      fitIcon(img, badge);
      if (hasPlayer && !reached) { img.setTint(0x6f6a62); img.setAlpha(0.55); } // not reached yet
      add(img);
    }
    let ty = y + 10 + badge + (large ? 10 : 6);
    const name = scene.add.text(cx, ty, league.name, large ? textStyle(22, '#ffffff') : bodyStyle(14, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0.5, 0);
    fitWidth(name, cw - 12);
    add(name);
    ty += name.displayHeight + (large ? 6 : 2);
    const need = scene.add.text(cx, ty, large ? leagueRequirement(league) : `Wave ${league.minWave}+`, bodyStyle(large ? 16 : 12.5, current ? COLORS.inkAccent : COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0.5, 0);
    fitWidth(need, cw - 12);
    add(need);
    ty += need.displayHeight + 6;

    if (large && hasPlayer) {
      const note = current ? 'You are here' : reached ? '✔ Reached' : `${league.minWave - best} more wave${league.minWave - best === 1 ? '' : 's'}`;
      const noteText = scene.add.text(cx, ty, note, bodyStyle(14, current ? COLORS.inkAccent : reached ? COLORS.inkGood : COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0.5, 0);
      fitWidth(noteText, cw - 12); // never wider than its cell
      add(noteText);
    } else if (!large && reached) {
      add(scene.add.text(cx0 + cw - 8, y + 6, current ? '' : '✔', bodyStyle(13, COLORS.inkGood, { fontStyle: 'bold' })).setOrigin(1, 0));
    }
    if (current) {
      // A small "YOU" tag on the top edge.
      const tag = scene.add.container(0, 0);
      drawTag(scene, tag, cx - 24, y - 12, 'YOU', COLORS.button, textStyle(large ? 14 : 12));
      add(tag);
    }
  });
}
