import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { buildingTextureKey } from './BuildingView.js';
import { drawShowcaseCard, drawStatBar, fitIcon, fitWidth } from './uiDraw.js';
import { playSfxCapped } from '../audio.js';
import { SFX } from '../assetKeys.js';
import { requestImages } from '../assetLoader.js';
import { levelArtKey } from '../assetPlan.js';
import { COLORS, bodyStyle, mix, textStyle } from '../theme.js';
import { buildingName } from '../logic/buildings.js';
import { previewUpgrade, hallUpgradeUnlocks } from '../logic/upgradePreview.js';
import { CONFIG } from '../config.js';

const W = 990, H = 618;
const STAT_PAGE = 6, UNLOCK_PAGE = 7;
const format = (n) => Number(n.toFixed(2)).toLocaleString('en-US');

export function openUpgradeWindow(scene, gs, b) {
  const initial = previewUpgrade(gs, b);
  if (initial.cost === null) return null;
  const { level, nextLevel } = initial;
  const hall = b.type === 'townHall';
  const desiredKey = levelArtKey(b.type, nextLevel);
  const title = level === 0 ? 'Rebuild Village Hall' : `Upgrade ${buildingName(b.type)}`;
  const m = new Modal(scene, { width: W, height: H, title, onClose: () => scene.refreshGuide() });
  let statPage = 0, unlockPage = 0;
  let artFailed = false;
  let confirm, notice;
  const live = () => {
    const current = gs.getBuilding(b.id);
    if (!current || gs.gameOver) return null;
    const status = previewUpgrade(gs, current);
    return status.level === level ? status : null;
  };
  const refresh = () => {
    if (!m.frame) return;
    const status = live();
    if (!status || status.cost === null) { m.close(); return; }
    confirm.setCosts([{ currency: status.currency || 'gold', amount: status.cost }], level === 0 ? 'Rebuild' : 'Upgrade')
      .setEnabled(status.ok);
    notice.setText(status.requirements.join('  ·  '));
  };
  const confirmUpgrade = () => {
    const status = live();
    if (!status?.ok || status.nextLevel !== nextLevel) {
      playSfxCapped(scene, SFX.invalid, 1);
      refresh();
      return;
    }
    const result = gs.upgradeBuilding(b.id, level);
    if (result.ok) m.close();
    else {
      playSfxCapped(scene, SFX.invalid, 1);
      refresh();
    }
  };
  const pageButtons = (cx, y, page, pages, move) => {
    if (pages < 2) return;
    const options = { color: COLORS.buttonBlue, radius: 8 };
    m.add(new Button(scene, cx - 58, y, 46, 39, '', () => move(-1), { ...options, icon: 'left' }).setEnabled(page > 0));
    m.add(scene.add.text(cx, y, `${page + 1} / ${pages}`, bodyStyle(15, COLORS.inkDim)).setOrigin(0.5));
    m.add(new Button(scene, cx + 58, y, 46, 39, '', () => move(1), { ...options, icon: 'right' }).setEnabled(page + 1 < pages));
  };
  const draw = () => {
    if (!m.frame) return;
    m.clear();
    const x = m.x + 28, y = m.y + 84;
    const g = m.add(scene.add.graphics());
    drawShowcaseCard(g, x, y, 327, 267, { tileY: y + 216, tileW: 143 });
    if (desiredKey && !scene.textures.exists(desiredKey)) {
      m.add(scene.add.text(x + 164, y + 128, artFailed ? 'Preview artwork unavailable' : 'Loading artwork…', textStyle(17)).setOrigin(0.5));
    } else {
      const key = buildingTextureKey(scene, b.type, nextLevel);
      m.add(fitIcon(scene.add.image(x + 164, y + 232, key).setOrigin(0.5, 1), 279, 214));
    }
    m.add(scene.add.text(x + 164, y + 284, `Level ${level} → ${nextLevel}`, textStyle(23)).setOrigin(0.5));
    const rx = x + 365, rw = W - 421;
    const rows = scene.upgradeStatRows(b, nextLevel);
    const count = Math.ceil(rows.length / STAT_PAGE);
    for (const [index, row] of rows.slice(statPage * STAT_PAGE, (statPage + 1) * STAT_PAGE).entries()) {
      const sy = y + index * 39;
      const fmt = row.fmt || format;
      const delta = row.next - row.value;
      m.add(scene.add.text(rx, sy, row.label, bodyStyle(18, COLORS.ink, { fontStyle: 'bold' })));
      const next = m.add(scene.add.text(rx + rw, sy, `${fmt(row.value)} → ${fmt(row.next)}${row.unit || ''}`, bodyStyle(18, COLORS.ink)).setOrigin(1, 0));
      if (delta > 0) m.add(scene.add.text(next.x - next.width - 10, sy, `+${fmt(delta)}`, bodyStyle(16, COLORS.inkGood)).setOrigin(1, 0));
      const scale = Math.max(row.max, row.next) || 1;
      drawStatBar(g, rx, sy + 23, rw, row.next / scale, mix(row.color, 0xffffff, 0.55), 12);
      if (row.value > 0) {
        const fill = Math.max(8, (rw - 4) * row.value / scale);
        g.fillStyle(row.color, 1).fillRoundedRect(rx + 2, sy + 25, fill, 8, 4);
      }
    }
    pageButtons(rx + rw / 2, y + 276, statPage, count, (d) => { statPage += d; draw(); });
    const bottom = y + 310;
    g.fillStyle(COLORS.frame, 0.22).fillRect(x, bottom, W - 56, 2);
    if (hall) {
      const { quantities, levels } = hallUpgradeUnlocks(nextLevel);
      const unlocks = [...quantities.map((u) => ({
        type: u.type, label: u.isNew ? `New · ×${u.add}` : `+${u.add} slot${u.add === 1 ? '' : 's'}`
      })), ...levels.map((u) => ({
        type: u.type, label: u.first === u.last ? `Lv ${u.last} upgrade` : `Lv ${u.first}–${u.last} upgrades`
      }))];
      const spellSlots = CONFIG.fuelStation.spellSlots;
      const addedSlots = spellSlots[nextLevel - 1] - (spellSlots[level - 1] || 0);
      if (addedSlots > 0) {
        unlocks.splice(quantities.length, 0, { type: 'fuelStation', label: `+${addedSlots} spell slot${addedSlots === 1 ? '' : 's'}` });
      }
      m.add(scene.add.text(x, bottom + 8, `Village Hall ${nextLevel} unlocks`, bodyStyle(18, COLORS.ink, { fontStyle: 'bold' })));
      for (const [index, item] of unlocks.slice(unlockPage * UNLOCK_PAGE, (unlockPage + 1) * UNLOCK_PAGE).entries()) {
        const cx = x + 65 + index * 133;
        const type = item.type;
        m.add(fitIcon(scene.add.image(cx, bottom + 63, buildingTextureKey(scene, type, 1)), 52, 47));
        fitWidth(m.add(scene.add.text(cx, bottom + 91, buildingName(type), bodyStyle(13)).setOrigin(0.5)), 126);
        m.add(scene.add.text(cx, bottom + 111, item.label, bodyStyle(14, COLORS.inkGood, { fontStyle: 'bold' })).setOrigin(0.5));
      }
      if (!unlocks.length) m.add(scene.add.text(x, bottom + 48, 'More health and storage capacity', bodyStyle(18, COLORS.inkDim)));
      pageButtons(x + 837, bottom + 19, unlockPage, Math.ceil(unlocks.length / UNLOCK_PAGE), (d) => { unlockPage += d; draw(); });
    } else {
      const notes = b.type === 'wall' ? [`Upgrades all ${initial.count} walls together`, `Each wall costs ${format(initial.each)}`] : scene.statNotes({ ...b, level: nextLevel });
      if (notes.length) m.add(scene.add.text(x, bottom + 14, notes.slice(0, 4).join('\n'), bodyStyle(17, COLORS.ink, { lineSpacing: 5, wordWrap: { width: W - 58 } })));
    }
    notice = m.add(scene.add.text(m.cx, m.y + H - 88, '', bodyStyle(16, COLORS.inkBad, {
      fontStyle: 'bold', align: 'center', wordWrap: { width: W - 55 }
    })).setOrigin(0.5, 1));
    confirm = m.add(new Button(scene, m.cx, m.y + H - 45, 305, 62, 'Upgrade', confirmUpgrade, {
      color: COLORS.buttonGood, fontSize: 23, invalidFeedback: true
    }));
    refresh();
  };
  draw();
  if (desiredKey && !scene.textures.exists(desiredKey)) requestImages([desiredKey], { front: true }).then((loaded) => {
    artFailed = !loaded;
    draw();
  });
  const events = ['goldChanged', 'researchPointsChanged', 'townHallUpgraded', 'waveStarted', 'waveCleared', 'buildingDestroyed', 'tutorialChanged'];
  for (const event of events) gs.on(event, refresh, m);
  const destroy = m.destroy.bind(m);
  m.destroy = () => { gs.offContext(m); destroy(); };
  return m;
}
