// The Fuel Station's window: brew spells with research points. Drawn exactly like the RV Lab's research window
// (AbilityWindow.js): a Modal with the slate title bar, Brew / Perks tabs and the RP pill on the info row, a
// glossy column header over the spell nodes (light cards with a colored stripe, gold outline when selected, green
// when you can brew it), the details panel on the right (title, what it does, a ✔ / ✘ checklist, the purple
// action button), and a recessed tray at the bottom with the spell slots for the next raid (click a brewed spell
// there to pour it out). The Perks tab opens its perk tree in the RV Lab window. It redraws on RP, brewing,
// upgrades and waves. Rules live in src/logic/spells.js.
import { Modal, confirmDialog } from './Modal.js';
import { currencyCost } from './CurrencyCost.js';
import { Button } from './Button.js';
import { drawBadge, drawGlossy, fitWidth } from './uiDraw.js';
import { balance } from './AbilityWindow.js';
import { addSpellIcon, SPELL_COLORS } from './SpellIcons.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { isWaveActive } from '../logic/util.js';
import {
  SPELL_KINDS, spellConfig, spellStats, spellSummary, spellFullName, checkBrew, brewCost, brewedSpells, spellCount, spellSlots, fuelLevel, fuelStation, spellUnlocked
} from '../logic/spells.js';

// Layout (pixels), on the RV Lab window's grid: info row at 84, content from 112.
const W = 920, H = 574;
const INFO_Y = 84, TOP = 112;
const COL_HEAD = 36;                                   // the glossy band over the spell nodes (like a path header)
const CARD_W = 262, CARD_H = 96, CARD_GAP = 10;
const GRID_H = COL_HEAD + 8 + CARD_H * 3 + CARD_GAP * 2;
const PANEL_W = W - 22 - (CARD_W * 2 + CARD_GAP) - 16 - 22;
const TRAY_Y = TOP + GRID_H + 12, TRAY_H = 78;
const SLOT_R = 24;
const BREW_COLOR = 0x8e5bd6;                           // the RV Lab's purple RP buttons
const REFRESH_ON = ['researchPointsChanged', 'spellBrewed', 'spellDiscarded', 'buildingUpgraded', 'buildingPlaced',
  'buildingDestroyed', 'buildingRepaired', 'waveStarted', 'waveCleared', 'abilityResearched', 'abilitiesApplied', 'abilityRespecced', 'townHallUpgraded'];

/** Open the Fuel Station window. `onPerks` opens its perk tree (this window closes first). */
export function openFuelStationWindow(scene, gs, { onClose = null, onPerks = null } = {}) {
  let selected = SPELL_KINDS.find((k) => spellUnlocked(gs, k)) || SPELL_KINDS[0];
  let unfollow = () => {};
  const m = new Modal(scene, { width: W, height: H, title: 'Fuel Station', header: 56, depth: 1000,
    onClose: () => { unfollow(); if (onClose) onClose(); } });

  const refresh = () => {
    if (!m.frame) return;
    m.clear();
    const lvl = fuelLevel(gs);
    m.setTitle(lvl ? `Fuel Station · Brew Spells (level ${lvl})` : 'Fuel Station · Brew Spells');
    drawTabs(scene, m, onPerks ? () => { m.close(); onPerks(); } : null);
    const tabsW = 2 * 96 + 6 + 16;
    m.add(scene.add.text(m.x + 22 + tabsW, m.y + INFO_Y, 'Brew with Shakes. In a wave, click a spell on the hotbar (or press its number), then click the map.',
      bodyStyle(15, COLORS.inkDim, { wordWrap: { width: W - 44 - tabsW - 170 } })).setOrigin(0, 0.5));
    balance(scene, m, gs, true, m.x + W - 22, m.y + INFO_Y);

    // The spell nodes under a glossy column header.
    const gx = m.x + 22, gy = m.y + TOP, gw = CARD_W * 2 + CARD_GAP;
    const hg = m.add(scene.add.graphics());
    hg.fillStyle(COLORS.frame, 1).fillRoundedRect(gx, gy, gw, COL_HEAD - 2, 10);
    hg.fillStyle(BREW_COLOR, 1).fillRoundedRect(gx + 2, gy + 2, gw - 4, COL_HEAD - 6, 9);
    hg.fillStyle(0xffffff, 0.22).fillRoundedRect(gx + 6, gy + 4, gw - 12, 7, 4);
    m.add(scene.add.text(gx + gw / 2, gy + (COL_HEAD - 2) / 2, lvl ? `Spells · Fuel Station level ${lvl}` : 'Spells', textStyle(16)).setOrigin(0.5));
    SPELL_KINDS.forEach((kind, i) => {
      const cx = gx + (i % 2) * (CARD_W + CARD_GAP), cy = gy + COL_HEAD + 8 + Math.floor(i / 2) * (CARD_H + CARD_GAP);
      drawNode(scene, m, gs, kind, cx, cy, kind === selected, () => { selected = kind; refresh(); });
    });

    drawDetails(scene, m, gs, selected, gx + gw + 16, gy, PANEL_W, GRID_H);
    drawSlotTray(scene, m, gs, m.x + 22, m.y + TRAY_Y, W - 44, TRAY_H);
  };
  const handlers = REFRESH_ON.map((name) => { const fn = () => refresh(); gs.on(name, fn, scene); return [name, fn]; });
  unfollow = () => handlers.forEach(([name, fn]) => gs.off(name, fn));
  refresh();
  return m;
}

/** Brew / Perks tabs on the info row, drawn like the research window's Defenses / Economy tabs. */
function drawTabs(scene, m, onPerks) {
  const tabs = [{ label: 'Brew', on: true, click: null }, { label: 'Perks', on: false, click: onPerks }];
  tabs.forEach((tb, i) => {
    const tw = 96, tx = m.x + 22 + i * (tw + 6), ty = m.y + INFO_Y - 16;
    const g = m.add(scene.add.graphics());
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(tx, ty, tw, 30, 9);
    g.fillStyle(tb.on ? 0x6cbf2c : 0x4a4f5a, 1).fillRoundedRect(tx + 2, ty + 2, tw - 4, 25, 8);
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(tx + 5, ty + 4, tw - 10, 7, 4);
    m.add(scene.add.text(tx + tw / 2, ty + 14, tb.label, textStyle(15)).setOrigin(0.5));
    if (!tb.click) return;
    const zone = m.add(scene.add.zone(tx, ty, tw, 30).setOrigin(0).setInteractive({ useHandCursor: true }));
    zone.on('pointerdown', tb.click);
  });
}

/**
 * One spell node, in the research tree's node look: frame, light face (dimmer when locked), the spell's color as
 * a stripe on the left, its icon (the item's picture), name, state line and effect; gold outline when selected,
 * green when it can be brewed.
 */
function drawNode(scene, m, gs, kind, x, y, isSel, onSelect) {
  const cfg = spellConfig(kind);
  const open = spellUnlocked(gs, kind);
  const c = checkBrew(gs, kind);
  const g = m.add(scene.add.graphics());
  g.fillStyle(COLORS.frame, isSel ? 1 : open ? 0.32 : 0.18).fillRoundedRect(x, y, CARD_W, CARD_H, 11);
  g.fillStyle(open ? 0xfffaf0 : 0xe3dccd, 1).fillRoundedRect(x + 2, y + 2, CARD_W - 4, CARD_H - 5, 10);
  g.fillStyle(SPELL_COLORS[kind], open ? 1 : 0.35).fillRoundedRect(x + 2, y + 2, 6, CARD_H - 5, 3);
  const icon = m.add(addSpellIcon(scene, x + 46, y + CARD_H / 2 - 1, kind, 70));
  if (!open) { icon.setTint(0x9a9a9a); icon.setAlpha(0.6); }
  m.add(scene.add.text(x + 86, y + 10, cfg.name, bodyStyle(16, open ? COLORS.ink : '#a89c88', { fontStyle: 'bold' })));
  const cost = brewCost(gs, kind);
  const line = !open ? `Locked · Fuel Station lv ${cfg.level}` : 'Brew · Free (first one)';
  const short = open && /more Shakes?$/.test(c.reason || '');
  const ink = !open ? '#b3a892' : c.ok ? COLORS.inkGood : short ? COLORS.inkBad : COLORS.inkDim;
  const priceStyle = bodyStyle(12.5, ink, { fontStyle: 'bold' });
  if (open && cost > 0) m.add(currencyCost(scene, [{ currency: 'rp', amount: cost }], priceStyle, 'Brew', 16).setPosition(x + 86, y + 41));
  else fitWidth(m.add(scene.add.text(x + 86, y + 33, line, priceStyle)), CARD_W - 96);
  const s = spellStats(gs, kind);
  const ink2 = open ? COLORS.inkDim : '#b3a892';
  // Two short lines (what it does, then its size and length) so nothing has to shrink to fit the card.
  m.add(scene.add.text(x + 86, y + 52, cfg.effect, bodyStyle(13, ink2, { fontStyle: 'bold' })));
  m.add(scene.add.text(x + 86, y + 70, `${s.radius} tiles${s.duration ? ` · ${s.duration} s` : ' · instant'}`, bodyStyle(13, ink2)));
  const n = spellCount(gs, kind);
  if (n) {
    drawBadge(g, x + CARD_W - 16, y + 16, 11);
    m.add(scene.add.text(x + CARD_W - 16, y + 15, `${n}`, textStyle(14)).setOrigin(0.5));
  }
  if (isSel) {
    const sel = m.add(scene.add.graphics());
    sel.lineStyle(3, 0xffc83a, 1).strokeRoundedRect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, 13);
  } else if (c.ok) {
    const glow = m.add(scene.add.graphics());
    glow.lineStyle(3, 0x6cbf2c, 1).strokeRoundedRect(x - 2, y - 2, CARD_W + 4, CARD_H + 4, 13);
  }
  const hover = m.add(scene.add.graphics().setVisible(false));
  hover.fillStyle(0xffffff, 0.25).fillRoundedRect(x + 2, y + 2, CARD_W - 4, CARD_H - 5, 10);
  const zone = m.add(scene.add.zone(x, y, CARD_W, CARD_H).setOrigin(0).setInteractive({ useHandCursor: true }));
  zone.on('pointerover', () => hover.setVisible(true));
  zone.on('pointerout', () => hover.setVisible(false));
  zone.on('pointerdown', onSelect);
}

/** The details panel, as in the research window: title (the item), subtitle (its effect), what it does, a checklist and the Brew button. */
function drawDetails(scene, m, gs, kind, x, y, w, h) {
  const cfg = spellConfig(kind);
  const open = spellUnlocked(gs, kind);
  const g = m.add(scene.add.graphics());
  g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, h, 14);
  g.fillStyle(0xf6f1e6, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 5, 13);
  g.fillStyle(SPELL_COLORS[kind], 1).fillRoundedRect(x + 2, y + 2, w - 4, 10, { tl: 13, tr: 13, bl: 0, br: 0 });
  const icon = m.add(addSpellIcon(scene, x + w - 46, y + 52, kind, 68));
  if (!open) { icon.setTint(0x9a9a9a); icon.setAlpha(0.7); }
  let cy = y + 24;
  const title = m.add(scene.add.text(x + 20, cy, cfg.name, textStyle(26)));
  fitWidth(title, w - 100);
  cy += 38;
  m.add(scene.add.text(x + 20, cy, open ? `${cfg.effect} · ${spellCount(gs, kind)} brewed` : `${cfg.effect} · opens at Fuel Station level ${cfg.level}`,
    bodyStyle(14, open ? COLORS.inkAccent : COLORS.inkBad, { fontStyle: 'bold' })));
  cy += 30;
  const desc = m.add(scene.add.text(x + 20, cy, spellSummary(gs, kind), bodyStyle(16, COLORS.ink, { wordWrap: { width: w - 40 }, lineSpacing: 4 })));
  cy += desc.height + 10;
  const s = spellStats(gs, kind);
  const facts = m.add(scene.add.text(x + 20, cy, `${s.radius} tiles · ${s.duration ? `${s.duration} s` : 'instant'} · power x${s.power}`,
    bodyStyle(14, COLORS.inkDim, { fontStyle: 'italic' })));
  cy += facts.height + 16;
  const st = fuelStation(gs);
  const slots = spellSlots(gs), used = brewedSpells(gs).length;
  const checks = [
    [!!st && st.level >= cfg.level, `Fuel Station level ${cfg.level}${st ? ` (yours: ${st.level})` : ''}`],
    [used < slots, `A free spell slot (${used} / ${slots} used)`],
    [!isWaveActive(gs), 'Not during a wave']
  ];
  g.fillStyle(COLORS.frame, 0.15).fillRect(x + 20, cy - 10, w - 40, 1);
  for (const [ok, text] of checks) {
    m.add(scene.add.text(x + 22, cy, ok ? '✔' : '✘', bodyStyle(15, ok ? COLORS.inkGood : COLORS.inkBad, { fontStyle: 'bold' })));
    m.add(scene.add.text(x + 44, cy, text, bodyStyle(14.5, ok ? COLORS.ink : COLORS.inkBad, { wordWrap: { width: w - 64 } })));
    cy += 25;
  }
  const c = checkBrew(gs, kind);
  const price = c.cost ?? brewCost(gs, kind);
  const b = new Button(scene, x + w / 2, y + h - 42, w - 40, 56, 'Brew · Free', () => gs.brewSpell(kind),
    { color: BREW_COLOR, fontSize: 22, radius: 12, invalidFeedback: true });
  if (price > 0) b.setCosts([{ currency: 'rp', amount: price }], 'Brew', c.reason);
  else b.setLabel('Brew · Free', c.reason);
  b.setEnabled(c.ok);
  m.add(b);
}

/** The recessed tray (shop style) with the spell slots for the next raid; a brewed spell there can be poured out. */
function drawSlotTray(scene, m, gs, x, y, w, h) {
  const g = m.add(scene.add.graphics());
  g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, h, 12);
  g.fillStyle(COLORS.tray, 1).fillRoundedRect(x + 2, y + 3, w - 4, h - 5, 11);
  const slots = spellSlots(gs), list = brewedSpells(gs);
  const label = m.add(scene.add.text(x + 18, y + h / 2 - 12, `Next raid: ${list.length} / ${slots} spells`, bodyStyle(16, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5));
  const note = m.add(scene.add.text(x + 18, y + h / 2 + 12, slots ? 'More slots with Village Hall levels' : 'Build a Fuel Station for slots',
    bodyStyle(13, COLORS.inkDim)).setOrigin(0, 0.5));
  let sx = x + 18 + Math.max(label.width, note.width) + 24 + SLOT_R;
  const sy = y + h / 2;
  for (let k = 0; k < Math.max(slots, list.length); k++) {
    const kind = list[k];
    if (kind) {
      drawGlossy(g, sx - SLOT_R - 3, sy - SLOT_R - 3, (SLOT_R + 3) * 2, (SLOT_R + 3) * 2, 0xefe9dc, { circle: true, lip: 2, shadow: true });
      m.add(addSpellIcon(scene, sx, sy - 1, kind, SLOT_R * 2 - 4));
      const zone = m.add(scene.add.zone(sx - SLOT_R, sy - SLOT_R, SLOT_R * 2, SLOT_R * 2).setOrigin(0).setInteractive({ useHandCursor: !isWaveActive(gs) }));
      zone.on('pointerdown', () => {
        if (isWaveActive(gs)) return;
        confirmDialog(scene, {
          title: 'Pour it out?', lines: [`Pour out a ${spellFullName(kind)}?`, 'Its slot frees up. The Shakes it cost are not refunded.'],
          confirmLabel: 'Pour out', onConfirm: () => gs.discardSpell(kind)
        });
      });
    } else {
      g.fillStyle(COLORS.frame, 0.2).fillCircle(sx, sy, SLOT_R + 2);
      g.fillStyle(0xe3dccd, 1).fillCircle(sx, sy, SLOT_R);
      g.lineStyle(2, 0xb9b1a2, 1).strokeCircle(sx, sy, SLOT_R - 7);
    }
    sx += SLOT_R * 2 + 12;
  }
  if (list.length && sx < x + w - 200) m.add(scene.add.text(x + w - 18, sy, 'Click a spell to pour it out', bodyStyle(13, COLORS.inkDim, { fontStyle: 'italic' })).setOrigin(1, 0.5));
}
