// The RV Lab's research window, drawn as a Modal over the game (UIScene), laid out as a skill tree. A list of
// every defense on the left; pick one to research its tree. The first pick for a type locks it to that path
// (A, B or C); a paid "Reset path" button clears it. Picks are paid in research points (RP) and apply at once to
// every building of that type, whatever its level. A defense's Abilities button opens this window on its type.
// The tree is a grid: three path columns (A orange, B blue, C green) by five tier rows. Each node is a small
// card with the tier's name and state; clicking one shows it in the details panel on the right (what it does,
// who gets it, what it needs, what it costs, and the Research button). It redraws whenever research, research
// points or the buildings change, keeping the selected node.
import { Modal, confirmDialog } from './Modal.js';
import { Button } from './Button.js';
import { buildingTextureKey } from './BuildingView.js';
import { drawBadge, fitWidth, fitIcon, addHeroBadge } from './uiDraw.js';
import { COLORS, bodyStyle, textStyle, mix, RP_TEXT_COLOR } from '../theme.js';
import { rpText } from '../logic/researchPoints.js';
import { PATH_COLORS, PATH_TEXT_COLORS } from '../abilityConfig.js';
import {
  ABILITY_TYPES, DEFENSE_ABILITY_TYPES, ECONOMY_ABILITY_TYPES, MAX_TIER, PATH_KEYS, tierInfo, pathName, pathTiers, labLevel, labPicks, labTierCount,
  checkResearch, canResearchFor, researchCost, lockedPath, checkRespec
} from '../logic/abilities.js';
import { buildingName } from '../logic/buildings.js';
import { formatGold } from '../logic/economy.js';
import { isWaveActive } from '../logic/util.js';
import { labGuideHint } from '../logic/labGuide.js';
import { TEX } from '../assetKeys.js';

// Layout (pixels). The grid has a "Tier N" gutter, then three path columns; the details panel sits to its right.
const GUTTER = 46;
const COL_HEAD = 36;
const NODE_H = 60, ROW_STEP = 70;
const TOP = 112;                                      // grid / panel top, below the title and the info line
const INFO_Y = 84;                                    // the info line / tabs / balance row: clear of the title bar (ends at 60)
const GRID_H = COL_HEAD + 8 + ROW_STEP * (MAX_TIER - 1) + NODE_H;
const RESPEC_H = 46;                                  // the "Reset path" row under the tree
const WIN_H = TOP + GRID_H + RESPEC_H + 24;
const INK = { a: '#b8640a', b: '#2a6fb0', c: '#2f8a2f' }; // path colors that read on the light body
// Events that can change what the windows show.
const REFRESH_ON = ['goldChanged', 'abilityResearched', 'abilitiesApplied', 'buildingPlaced', 'buildingUpgraded', 'buildingDestroyed',
  'buildingRepaired', 'buildingSold', 'waveStarted', 'waveCleared', 'labGuideChanged', 'researchPointsChanged'];

/** Keep a window in sync with the game until it closes. Returns the unsubscribe function. */
function follow(scene, gs, refresh) {
  const handlers = REFRESH_ON.map((name) => {
    const fn = () => refresh();
    gs.on(name, fn, scene);
    return [name, fn];
  });
  return () => handlers.forEach(([name, fn]) => gs.off(name, fn));
}

/** "123 Burgers" / "4,500 gold" with its icon in a dark pill, right-aligned at (x, y). */
export function balance(scene, m, gs, rp, x, y) { // (also the Fuel Station window's Burgers pill)
  const pill = m.add(scene.add.graphics());
  const text = rp ? rpText(gs.researchPoints || 0) : `${formatGold(Math.floor(gs.gold))} gold`;
  const t = m.add(scene.add.text(x - 14, y, text, textStyle(18, rp ? RP_TEXT_COLOR : COLORS.textGold)).setOrigin(1, 0.5));
  const key = rp ? TEX.researchPoint : TEX.coin;
  let left = t.x - t.width - 12;
  if (scene.textures.exists(key)) {
    const icon = m.add(scene.add.image(t.x - t.width - 20, y, key));
    icon.setScale(26 / icon.frame.height);
    left = icon.x - 20;
  }
  pill.fillStyle(0x000000, 0.45).fillRoundedRect(left, y - 17, x - left, 34, 17);
  return left;
}

/** The info line under the title: the RV Lab guide's hint while it has one for this window, else `text`. */
function infoLine(scene, m, gs, kind, text, width, x = m.x + 24) {
  const hint = labGuideHint(gs, kind);
  if (hint) {
    const g = m.add(scene.add.graphics());
    const t = scene.add.text(x + 12, m.y + INFO_Y, `Guide: ${hint}`, bodyStyle(15, '#5a3a00', { fontStyle: 'bold', wordWrap: { width: width - 24 } })).setOrigin(0, 0.5);
    // At most three lines: a long hint steps its font down so the note stays clear of the title bar and the grid.
    for (let size = 14; t.height > 58 && size >= 11; size--) t.setFontSize(size);
    g.fillStyle(0xffd84a, 0.9).fillRoundedRect(x, m.y + INFO_Y - t.height / 2 - 6, Math.min(width, t.width + 24), t.height + 12, 10);
    m.add(t);
  } else {
    m.add(scene.add.text(x + 2, m.y + INFO_Y, text, bodyStyle(15, COLORS.inkDim, { wordWrap: { width } })).setOrigin(0, 0.5));
  }
}

/** A small diamond, filled in the path's color when owned / researched. */
function gem(g, x, y, R, color, filled, dim) {
  const pts = [{ x, y: y - R }, { x: x + R, y }, { x, y: y + R }, { x: x - R, y }];
  g.fillStyle(COLORS.frame, dim ? 0.35 : 1).fillPoints(pts.map((p) => ({ x: p.x + (p.x - x) * 0.2, y: p.y + (p.y - y) * 0.2 })), true);
  g.fillStyle(filled ? color : dim ? 0xd5cdbd : 0xb9b1a2, 1).fillPoints(pts, true);
  if (filled) g.fillStyle(0xffffff, 0.35).fillPoints([pts[0], pts[1], { x, y }, pts[3]], true);
}

/**
 * The skill tree: path headers, a "Tier N" gutter, connectors, and one node per (path, tier).
 * `nodeState(path, tier)` returns { state: 'owned' | 'available' | 'locked' | 'taken' | 'future', line, short }
 * where `line` is the short state text under the node's name. `route` (optional): the building's picks, drawn
 * as a gold line through its owned nodes. Available nodes get a steady green outline.
 */
function drawTree(scene, m, x, y, colW, gap, type, nodeState, selected, onSelect, route = null) {
  const g = m.add(scene.add.graphics());
  const nx = (i) => x + GUTTER + i * (colW + gap);
  const ny = (tier) => y + COL_HEAD + 8 + (tier - 1) * ROW_STEP;
  // Tier bands and gutter labels: one row per tier makes "one pick per tier" easy to see.
  for (let t = 1; t <= MAX_TIER; t++) {
    const top = ny(t) - 4;
    g.fillStyle(COLORS.frame, t % 2 ? 0.05 : 0.1).fillRoundedRect(x, top, GUTTER + colW * 3 + gap * 2, NODE_H + 8, 10);
    m.add(scene.add.text(x + GUTTER / 2, top + (NODE_H + 8) / 2 - 9, 'TIER', bodyStyle(10, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0.5));
    m.add(scene.add.text(x + GUTTER / 2, top + (NODE_H + 8) / 2 + 8, String(t), textStyle(19)).setOrigin(0.5));
  }
  PATH_KEYS.forEach((p, i) => {
    const color = PATH_COLORS[p], cx = nx(i);
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(cx, y, colW, COL_HEAD - 2, 10);
    g.fillStyle(color, 1).fillRoundedRect(cx + 2, y + 2, colW - 4, COL_HEAD - 6, 9);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(cx + 6, y + 4, colW - 12, 7, 4);
    const head = m.add(scene.add.text(cx + colW / 2, y + (COL_HEAD - 2) / 2, `${p.toUpperCase()} · ${pathName(type, p)}`, textStyle(16)).setOrigin(0.5));
    fitWidth(head, colW - 16);
    // Connectors down the column: solid in the path's color once the tier above is owned / researched.
    for (let t = 1; t < MAX_TIER; t++) {
      const done = nodeState(p, t).state === 'owned';
      g.lineStyle(done ? 5 : 3, done ? color : 0xb9b1a2, done ? 0.95 : 0.6).lineBetween(cx + colW / 2, ny(t) + NODE_H, cx + colW / 2, ny(t + 1));
    }
  });
  // The building's route through the tree (A1 -> B2 -> A3 ...): a gold line behind the nodes.
  if (route && route.length > 1) {
    g.lineStyle(8, 0xffc83a, 0.6);
    g.beginPath();
    route.forEach((p, k) => {
      const px = nx(PATH_KEYS.indexOf(p)) + colW / 2, py = ny(k + 1) + NODE_H / 2;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    });
    g.strokePath();
  }
  PATH_KEYS.forEach((p, i) => {
    const color = PATH_COLORS[p];
    for (let t = 1; t <= MAX_TIER; t++) {
      const st = nodeState(p, t);
      const cx = nx(i), cy = ny(t);
      const isSel = selected && selected.path === p && selected.tier === t;
      const owned = st.state === 'owned', avail = st.state === 'available';
      const dim = st.state === 'taken' || st.state === 'future';
      const ng = m.add(scene.add.graphics());
      ng.fillStyle(COLORS.frame, isSel ? 1 : dim ? 0.18 : 0.32).fillRoundedRect(cx, cy, colW, NODE_H, 11);
      const face = owned ? mix(0xfff6dc, color, 0.3) : avail ? 0xfffaf0 : dim ? 0xe3dccd : 0xebe4d5;
      ng.fillStyle(face, 1).fillRoundedRect(cx + 2, cy + 2, colW - 4, NODE_H - 5, 10);
      if (owned) ng.fillStyle(color, 1).fillRoundedRect(cx + 2, cy + 2, 6, NODE_H - 5, 3);
      gem(ng, cx + 22, cy + NODE_H / 2, 11, color, owned, dim);
      const name = m.add(scene.add.text(cx + 40, cy + 10, st.hidden ? '? ? ?' : tierInfo(type, p, t).name, bodyStyle(14.5, dim || st.hidden ? '#a89c88' : COLORS.ink, { fontStyle: 'bold' })));
      fitWidth(name, colW - 48);
      const lineInk = owned ? INK[p] : avail ? (st.short ? COLORS.inkBad : COLORS.inkGood) : dim ? '#b3a892' : COLORS.inkDim;
      m.add(scene.add.text(cx + 40, cy + 33, st.line || '', bodyStyle(12.5, lineInk, { fontStyle: owned || avail ? 'bold' : 'normal' })));
      if (isSel) {
        const sel = m.add(scene.add.graphics());
        sel.lineStyle(3, 0xffc83a, 1).strokeRoundedRect(cx - 2, cy - 2, colW + 4, NODE_H + 4, 13);
      } else if (avail) {
        // Available nodes get a steady green outline, so the next move stands out.
        const glow = m.add(scene.add.graphics());
        glow.lineStyle(3, 0x6cbf2c, 1).strokeRoundedRect(cx - 2, cy - 2, colW + 4, NODE_H + 4, 13);
      }
      const hover = m.add(scene.add.graphics().setVisible(false));
      hover.fillStyle(0xffffff, 0.25).fillRoundedRect(cx + 2, cy + 2, colW - 4, NODE_H - 5, 10);
      const zone = m.add(scene.add.zone(cx, cy, colW, NODE_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => hover.setVisible(true));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerdown', () => onSelect({ path: p, tier: t }));
    }
  });
}

/**
 * The details panel at (x, y), w x h: the selected tier's name, path and tier, what it does, a checklist of what
 * it needs, its cost, and one big action button (or a note on why there's none).
 * d = { type, path, tier, applies, checks: [[ok, text]], rp, button: { label, sub, ok, onClick } | null, note, noteGood }
 */
function drawDetails(scene, m, x, y, w, h, d) {
  const g = m.add(scene.add.graphics());
  g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, h, 14);
  g.fillStyle(0xf6f1e6, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 5, 13);
  g.fillStyle(PATH_COLORS[d.path], 1).fillRoundedRect(x + 2, y + 2, w - 4, 10, { tl: 13, tr: 13, bl: 0, br: 0 });
  const info = d.hidden
    ? { name: 'Locked tier', desc: `Level up your RV Lab to ${d.tier} to reveal this tier and research it.` }
    : tierInfo(d.type, d.path, d.tier);
  let cy = y + 24;
  const title = m.add(scene.add.text(x + 20, cy, info.name, textStyle(26)));
  fitWidth(title, w - 40);
  cy += 38;
  m.add(scene.add.text(x + 20, cy, `Path ${d.path.toUpperCase()} · ${pathName(d.type, d.path)} · Tier ${d.tier}`, bodyStyle(14, INK[d.path], { fontStyle: 'bold' })));
  cy += 30;
  const desc = m.add(scene.add.text(x + 20, cy, info.desc, bodyStyle(16, COLORS.ink, { wordWrap: { width: w - 40 }, lineSpacing: 4 })));
  cy += desc.height + 14;
  if (d.applies) {
    const ap = m.add(scene.add.text(x + 20, cy, d.applies, bodyStyle(14, COLORS.inkDim, { fontStyle: 'italic', wordWrap: { width: w - 40 } })));
    cy += ap.height + 12;
  }
  cy += 6;
  if (d.checks && d.checks.length) {
    g.fillStyle(COLORS.frame, 0.15).fillRect(x + 20, cy - 10, w - 40, 1);
    for (const [ok, text] of d.checks) {
      m.add(scene.add.text(x + 22, cy, ok ? '✔' : '✘', bodyStyle(15, ok ? COLORS.inkGood : COLORS.inkBad, { fontStyle: 'bold' })));
      m.add(scene.add.text(x + 44, cy, text, bodyStyle(14.5, ok ? COLORS.ink : COLORS.inkBad, { wordWrap: { width: w - 64 } })));
      cy += 25;
    }
  }
  const by = y + h - 42;
  if (d.button) {
    // The price is on the button ("Research · 240 RP"); the RP balance is at the top right.
    const b = new Button(scene, x + w / 2, by, w - 40, 56, d.button.label, d.button.onClick, { color: d.rp ? 0x8e5bd6 : COLORS.buttonGood, fontSize: 22, radius: 12 });
    b.setLabel(d.button.label, d.button.ok ? '' : d.button.sub || '').setEnabled(!!d.button.ok);
    m.add(b);
  } else if (d.note) {
    const bg = m.add(scene.add.graphics());
    const nt = m.add(scene.add.text(x + w / 2, by, d.note, textStyle(17, d.noteGood ? '#b6f59a' : COLORS.textDim, { align: 'center', wordWrap: { width: w - 64 } })).setOrigin(0.5));
    bg.fillStyle(0x000000, 0.4).fillRoundedRect(x + 20, by - nt.height / 2 - 12, w - 40, nt.height + 24, 12);
  }
}

/** Five pips, one per tier colored by its pick (same look as over buildings on the map), centered at (x, y). */
function drawPips(g, x, y, picks) {
  const R = 7, GAP = 18;
  g.fillStyle(0x000000, 0.45).fillRoundedRect(x - (GAP * MAX_TIER) / 2 - 4, y - R - 5, GAP * MAX_TIER + 8, R * 2 + 10, R + 5);
  for (let k = 0; k < MAX_TIER; k++) {
    const cx = x - (GAP * (MAX_TIER - 1)) / 2 + k * GAP;
    const pts = [{ x: cx, y: y - R }, { x: cx + R, y }, { x: cx, y: y + R }, { x: cx - R, y }];
    if (picks[k]) g.fillStyle(PATH_COLORS[picks[k]], 1).fillPoints(pts, true);
    g.lineStyle(1.5, picks[k] ? 0xffffff : 0x8a8a8a, 1).strokePoints(pts, true);
  }
}

// ======================= the RV Lab's Research =======================
/** The RV Lab window: pick a defense on the left, research its tree (in RP). `startType` opens on a defense. */
export function openResearchWindow(scene, gs, { onClose = null, startType = null } = {}) {
  const LIST_W = 196, PANEL_W = 330, COL_W = 182, GAP = 10;
  const W = 22 + LIST_W + 14 + GUTTER + COL_W * 3 + GAP * 2 + 16 + PANEL_W + 22;
  let type = startType && ABILITY_TYPES.includes(startType) ? startType : null;
  let unfollow = () => {};
  let selected = null;
  const m = new Modal(scene, { width: W, height: WIN_H, title: 'RV Lab · Research', header: 56, depth: 1000,
    onClose: () => { unfollow(); if (onClose) onClose(); } });

  const stateOf = (lab) => (p, t) => {
    const picks = labPicks(gs, type), count = picks.length;
    const locked = picks[0] || null;
    if (t <= count && picks[t - 1] === p) return { state: 'owned', line: '✔ Researched' };
    if (locked && locked !== p) return { state: 'taken', line: `Locked to Path ${locked.toUpperCase()}` };
    // Tiers past what the RV Lab can reach stay hidden (name and text) until it levels up, so a new player
    // sees a few options at a time instead of the whole tree.
    if (t > Math.max(1, lab)) return { state: t > count + 1 ? 'future' : 'locked', line: `Locked · RV Lab lv ${t}`, hidden: true };
    if (t > count + 1) return { state: 'future', line: `After tier ${t - 1}` };
    if (!lab) return { state: 'locked', line: gs.buildings.some((b) => b.type === 'rvlab') ? 'RV Lab destroyed' : 'Build an RV Lab' };
    if (t > lab) return { state: 'locked', line: `RV Lab level ${t}` };
    const cost = checkResearch(gs, type, p, t).cost;
    return { state: 'available', line: cost === 0 ? 'Research · Free' : `Research · ${rpText(researchCost(t))}`, short: (gs.researchPoints || 0) < cost };
  };
  /** The node to show: the next tier, on the path picked last (so climbing a path keeps going down it). */
  const firstPick = (st) => {
    const picks = labPicks(gs, type), next = Math.min(MAX_TIER, picks.length + 1);
    const last = picks[picks.length - 1];
    if (last) return { path: last, tier: next };
    return { path: PATH_KEYS.find((p) => st(p, next).state === 'available') || 'a', tier: next };
  };
  // Two tabs: Defenses and Economy (the economy buildings' trees). Open on the given type's tab, else on the
  // first building with research ready, else the first defense.
  const TABS = [{ key: 'defenses', label: 'Defenses', types: DEFENSE_ABILITY_TYPES }, { key: 'economy', label: 'Economy', types: ECONOMY_ABILITY_TYPES }];
  if (!type) type = ABILITY_TYPES.find((t) => canResearchFor(gs, t)) || DEFENSE_ABILITY_TYPES[0];
  let tab = ECONOMY_ABILITY_TYPES.includes(type) ? 'economy' : 'defenses';

  /** "Applies to every Cannon (3 now), whatever its level." */
  const appliesText = (owned) => {
    const n = gs.buildings.filter((b) => b.type === type).length;
    return `${owned ? 'On' : 'Applies to'} every ${buildingName(type)}${n ? ` (${n} now)` : ''}, whatever its level.`;
  };

  const refresh = () => {
    if (!m.frame) return;
    m.clear();
    const lab = labLevel(gs);
    m.setTitle(lab ? `RV Lab · Research (level ${lab}: tiers 1-${lab})` : 'RV Lab · Research');
    infoLine(scene, m, gs, 'research', lab
      ? 'Your first pick locks the path (A, B or C). Perks go onto every building of that type.'
      : 'Build or rebuild an RV Lab to research.', W - 420 - LIST_W, m.x + 22 + LIST_W + 14);
    // The tabs, over the list: the selected one green, a red "!" on a tab with research ready.
    TABS.forEach((tb, i) => {
      const tw = (LIST_W - 6) / 2, tx = m.x + 22 + i * (tw + 6), ty = m.y + INFO_Y - 16, on = tb.key === tab;
      const g = m.add(scene.add.graphics());
      g.fillStyle(COLORS.frame, 1).fillRoundedRect(tx, ty, tw, 30, 9);
      g.fillStyle(on ? 0x6cbf2c : 0x4a4f5a, 1).fillRoundedRect(tx + 2, ty + 2, tw - 4, 25, 8);
      g.fillStyle(0xffffff, 0.18).fillRoundedRect(tx + 5, ty + 4, tw - 10, 7, 4);
      m.add(scene.add.text(tx + tw / 2, ty + 14, tb.label, textStyle(15)).setOrigin(0.5));
      if (tb.types.some((t) => canResearchFor(gs, t))) {
        drawBadge(g, tx + tw - 2, ty + 5, 8); // on the tab's top corner, clear of its label
        m.add(scene.add.text(tx + tw - 2, ty + 4, '!', textStyle(12)).setOrigin(0.5));
      }
      const zone = m.add(scene.add.zone(tx, ty, tw, 30).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => {
        if (tab === tb.key) return;
        tab = tb.key;
        type = tb.types.find((t) => canResearchFor(gs, t)) || tb.types[0];
        selected = null;
        refresh();
      });
    });
    // Top right: the selected defense's tiers as pips, then your RP.
    const pg = m.add(scene.add.graphics());
    const balanceLeft = balance(scene, m, gs, true, m.x + W - 22, m.y + INFO_Y);
    drawPips(pg, balanceLeft - 14 - (18 * MAX_TIER + 8) / 2, m.y + INFO_Y, labPicks(gs, type)); // just left of the RP pill, whatever its width

    // The tab's buildings: picture, name, its five tiers as squares colored by pick, "!" when research is ready.
    const types = TABS.find((tb) => tb.key === tab).types;
    const lx = m.x + 22, ly = m.y + TOP, itemH = Math.min(58, Math.floor((GRID_H + 4) / types.length));
    types.forEach((t, i) => {
      const y = ly + i * itemH, sel = t === type;
      const g = m.add(scene.add.graphics());
      g.fillStyle(COLORS.frame, sel ? 1 : 0.2).fillRoundedRect(lx, y, LIST_W, itemH - 4, 9);
      g.fillStyle(sel ? 0x6cbf2c : 0xf3ecdd, 1).fillRoundedRect(lx + 2, y + 2, LIST_W - 4, itemH - 8, 8);
      const pic = m.add(scene.add.image(lx + 24, y + itemH - 8, buildingTextureKey(scene, t, 1)).setOrigin(0.5, 1));
      fitIcon(pic, 36, itemH - 10);
      if (t === 'altar') m.add(addHeroBadge(scene, lx + 36, y + 13, 20)); // the Brisket King's portrait
      const name = m.add(scene.add.text(lx + 48, y + 3, buildingName(t), sel ? textStyle(14) : bodyStyle(13.5, COLORS.ink, { fontStyle: 'bold' })));
      fitWidth(name, LIST_W - 80); // ends before the "!" badge
      const picks = labPicks(gs, t);
      for (let d = 0; d < MAX_TIER; d++) {
        g.fillStyle(picks[d] ? PATH_COLORS[picks[d]] : sel ? 0x3f7a1c : 0xcfc6b3, 1).fillRect(lx + 50 + d * 13, y + itemH - 16, 10, 6);
      }
      if (canResearchFor(gs, t)) {
        drawBadge(g, lx + LIST_W - 14, y + 14, 10);
        m.add(scene.add.text(lx + LIST_W - 14, y + 13, '!', textStyle(14)).setOrigin(0.5));
      }
      const hover = m.add(scene.add.graphics().setVisible(false));
      hover.fillStyle(0xffffff, 0.2).fillRoundedRect(lx + 2, y + 2, LIST_W - 4, itemH - 8, 8);
      const zone = m.add(scene.add.zone(lx, y, LIST_W, itemH - 4).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => hover.setVisible(!sel));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerdown', () => { if (type !== t) { type = t; selected = null; refresh(); } });
    });

    const st = stateOf(lab);
    if (!selected) selected = firstPick(st);
    const gx = lx + LIST_W + 14, gy = ly;
    drawTree(scene, m, gx, gy, COL_W, GAP, type, st, selected, (sel) => { selected = sel; refresh(); }, labPicks(gs, type));

    const { path, tier } = selected;
    const s = st(path, tier);
    const c = checkResearch(gs, type, path, tier);
    const count = labTierCount(gs, type);
    const locked = lockedPath(gs, type);
    const checks = s.state === 'owned' || s.state === 'taken' || s.hidden ? [] : [
      [lab >= tier, `RV Lab level ${tier}${lab ? ` (yours: ${lab})` : ''}`],
      ...(tier > 1 ? [[count >= tier - 1, `Tier ${tier - 1} first`]] : []),
      [!isWaveActive(gs), 'Not during a wave']
    ];
    const detail = { type, path, tier, checks, hidden: !!s.hidden, applies: s.state === 'taken' || s.hidden ? '' : appliesText(s.state === 'owned'), rp: true, button: null };
    if (!locked && !s.hidden && s.state === 'available') detail.applies += ' Picking it locks every ' + buildingName(type) + ' to Path ' + path.toUpperCase() + '.';
    if (s.hidden) detail.note = `Unlocks at RV Lab level ${tier}`;
    else if (s.state === 'owned') { detail.note = '✔ Researched'; detail.noteGood = true; }
    else if (s.state === 'taken') detail.note = `Your ${buildingName(type)}s are locked to Path ${locked.toUpperCase()}. Reset the path to switch.`;
    else if (s.state === 'future') detail.note = `Research tier ${count + 1} first`;
    else detail.button = { label: c.cost === 0 ? 'Research (free)' : `Research · ${rpText(c.cost ?? researchCost(tier))}`, ok: c.ok, sub: c.reason, onClick: () => { if (gs.researchAbility(type, path, tier).ok) { selected = { path, tier: Math.min(MAX_TIER, tier + 1) }; refresh(); } } };
    drawDetails(scene, m, gx + GUTTER + COL_W * 3 + GAP * 2 + 16, gy, PANEL_W, GRID_H, detail);

    // Paid respec, under the tree: clears this type's path (its picks are not refunded) so it can take another.
    if (count > 0) {
      const rc = checkRespec(gs, type), ry = gy + GRID_H + 8 + RESPEC_H / 2;
      m.add(scene.add.text(gx, ry, `${buildingName(type)}s are locked to Path ${locked.toUpperCase()} · ${pathName(type, locked)}${rc.ok ? '' : ` (${rc.reason})`}`, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      const rb = new Button(scene, gx + GUTTER + COL_W * 3 + GAP * 2 + 16 + PANEL_W - 150, ry, 300, 42, `Reset path · ${rpText(rc.cost)}`, () => {
        confirmDialog(scene, {
          title: 'Reset path?',
          lines: [`Reset the ${buildingName(type)} path for ${rpText(rc.cost)}?`,
            `Its ${count} researched tier${count > 1 ? 's' : ''} are lost (no refund) and you pick a path again.`],
          confirmLabel: 'Reset', onConfirm: () => { if (gs.respecPath(type).ok) { selected = null; refresh(); } }
        });
      }, { color: 0x8e5bd6, fontSize: 18, radius: 12 });
      rb.setEnabled(rc.ok);
      m.add(rb);
    }
  };
  unfollow = follow(scene, gs, refresh);
  refresh();
  return m;
}

/** Short summary of a defense's picks for its info panel: "Heavy Shot: tiers 1, 3" per path. */
export function abilitySummary(b) {
  return PATH_KEYS.map((p) => {
    const tiers = pathTiers(b, p);
    const text = tiers.length ? `${pathName(b.type, p)}: tier${tiers.length > 1 ? 's' : ''} ${tiers.join(', ')}` : `${pathName(b.type, p)}: none`;
    return { path: p, text, color: PATH_TEXT_COLORS[p] };
  });
}
