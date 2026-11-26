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
import { currencyCost } from './CurrencyCost.js';
import { buildingTextureKey } from './BuildingView.js';
import { drawBadge, fitWidth, fitIcon } from './uiDraw.js';
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
import { notifyGuideMessage } from '../audio.js';
import { TEX } from '../assetKeys.js';
import { isMergeable, hasMergedOf, masteryLevel, masteryTier, masteryTierCount, checkMastery, needsMergeReason } from '../logic/merge.js';
import { mergeConfig } from '../logic/buildings.js';
import { MERGE_GEAR } from './BuildingView.js';
import { IS_TOUCH } from '../device.js';

// Layout (pixels). The grid has a "Tier N" gutter, then three path columns; the details panel sits to its right.
const GUTTER = 46;
const COL_HEAD = 36;
const NODE_H = IS_TOUCH ? 80 : 64, ROW_STEP = NODE_H + 8;
const TOP = 112;                                      // grid / panel top, below the title and the info line
const INFO_Y = 84;                                    // the info line / tabs / balance row: clear of the title bar (ends at 60)
const GRID_H = COL_HEAD + 8 + ROW_STEP * (MAX_TIER - 1) + NODE_H;
const RESPEC_H = 58;                                  // the "Reset path" row under the tree
// Merged defenses' Mastery (merge.js): a gold fourth column next to the three paths, for every type that can
// merge (v0.9.3); greyed out, with no glow, until the village has a merged one. The window is always as wide as the
// 4-column layout needs; a type that can't merge spreads its 3 columns wider.
const GOLD = 0xffc83a, GOLD_INK = '#8a5a00';
// The Mastery column's text: tier names, their status line, and not-yet tiers (all gold tones).
const MASTERY_INK = { name: '#6b4500', line: '#a06a00', dim: '#c9a862' };
const MASTERY_GREY = 0xb3aa9a; // the column before the type has a merged building
const WIN_H = TOP + GRID_H + RESPEC_H + 24;
const INK = { a: '#b8640a', b: '#2a6fb0', c: '#2f8a2f' }; // path colors that read on the light body
// Events that can change what the windows show.
const REFRESH_ON = ['abilityResearched', 'abilitiesApplied', 'buildingPlaced', 'buildingUpgraded', 'buildingDestroyed',
  'buildingRepaired', 'waveStarted', 'waveCleared', 'labGuideChanged', 'researchPointsChanged', 'buildingsMerged', 'masteryResearched', 'abilityRespecced'];

/** Keep a window in sync with the game until it closes. Returns the unsubscribe function. */
function follow(scene, gs, refresh) {
  const handlers = REFRESH_ON.map((name) => {
    const fn = () => refresh();
    gs.on(name, fn, scene);
    return [name, fn];
  });
  return () => handlers.forEach(([name, fn]) => gs.off(name, fn));
}

/** "123 Shakes" / "4,500 gold" with its icon in a dark pill, right-aligned at (x, y). */
export function balance(scene, m, gs, rp, x, y) { // (also the Fuel Station window's Shakes pill)
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
    notifyGuideMessage(scene, gs, `lab-${gs.labGuideStep}`);
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
 * The skill tree: column headers, a "Tier N" gutter, connectors, and one node per (column, tier). Columns are the three
 * paths and, for a type with a merged building, a gold "★ Mastery" column (3 tiers, merge.js) as the 4th, drawn alike.
 * `nodeState(path, tier)` returns { state: 'owned' | 'available' | 'locked' | 'taken' | 'future', line, short }
 * where `line` is the short state text under the node's name. `route` (optional): the building's picks, drawn
 * as a gold line through its owned nodes. Available nodes get a steady green outline. `mastery` (or null):
 * { stateOf(tier) } for the 4th column; its nodes select as { mastery: true, tier }.
 */
function drawTree(scene, m, x, y, colW, gap, type, nodeState, selected, onSelect, route = null, mastery = null) {
  const g = m.add(scene.add.graphics());
  const nx = (i) => x + GUTTER + i * (colW + gap);
  const ny = (tier) => y + COL_HEAD + 8 + (tier - 1) * ROW_STEP;
  const cols = PATH_KEYS.map((p) => ({
    color: PATH_COLORS[p], ink: INK[p], tiers: MAX_TIER, head: `${p.toUpperCase()} · ${pathName(type, p)}`,
    state: (t) => nodeState(p, t), title: (t, st) => (st.hidden ? '? ? ?' : tierInfo(type, p, t).name),
    isSel: (t) => !!selected && !selected.mastery && selected.path === p && selected.tier === t, pick: (t) => ({ path: p, tier: t })
  }));
  if (mastery) {
    cols.push({
      color: mastery.locked ? MASTERY_GREY : GOLD, ink: mastery.locked ? '#8c8170' : GOLD_INK, tiers: masteryTierCount(type),
      head: '★ Mastery', gold: !mastery.locked,
      state: (t) => mastery.stateOf(t), title: (t) => masteryTier(type, t).name,
      isSel: (t) => !!selected && !!selected.mastery && selected.tier === t, pick: (t) => ({ mastery: true, tier: t })
    });
  }
  if (mastery && !mastery.locked) masteryAura(scene, m, nx(cols.length - 1), y, colW, COL_HEAD + 8 + ROW_STEP * (masteryTierCount(type) - 1) + NODE_H);
  // Tier bands and gutter labels: one row per tier makes "one pick per tier" easy to see.
  for (let t = 1; t <= MAX_TIER; t++) {
    const top = ny(t) - 4;
    g.fillStyle(COLORS.frame, t % 2 ? 0.05 : 0.1).fillRoundedRect(x, top, GUTTER + colW * cols.length + gap * (cols.length - 1), NODE_H + 8, 10);
    m.add(scene.add.text(x + GUTTER / 2, top + (NODE_H + 8) / 2 - 9, 'TIER', bodyStyle(10, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0.5));
    m.add(scene.add.text(x + GUTTER / 2, top + (NODE_H + 8) / 2 + 8, String(t), textStyle(19)).setOrigin(0.5));
  }
  cols.forEach((col, i) => {
    const color = col.color, cx = nx(i);
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(cx, y, colW, COL_HEAD - 2, 10);
    g.fillStyle(color, 1).fillRoundedRect(cx + 2, y + 2, colW - 4, COL_HEAD - 6, 9);
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(cx + 6, y + 4, colW - 12, 7, 4);
    const head = m.add(scene.add.text(cx + colW / 2, y + (COL_HEAD - 2) / 2, col.head, textStyle(16)).setOrigin(0.5));
    fitWidth(head, colW - 16);
    // Connectors down the column: solid in the column's color once the tier above is owned / researched.
    for (let t = 1; t < col.tiers; t++) {
      const done = col.state(t).state === 'owned';
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
  cols.forEach((col, i) => {
    const color = col.color;
    for (let t = 1; t <= col.tiers; t++) {
      const st = col.state(t);
      const cx = nx(i), cy = ny(t);
      const isSel = col.isSel(t);
      const owned = st.state === 'owned', avail = st.state === 'available';
      const dim = st.state === 'taken' || st.state === 'future';
      const ng = m.add(scene.add.graphics());
      ng.fillStyle(COLORS.frame, isSel ? 1 : dim ? 0.18 : 0.32).fillRoundedRect(cx, cy, colW, NODE_H, 11);
      const face = owned ? mix(0xfff6dc, color, col.gold ? 0.45 : 0.3) : avail ? 0xfffaf0 : dim ? 0xe3dccd : 0xebe4d5;
      ng.fillStyle(face, 1).fillRoundedRect(cx + 2, cy + 2, colW - 4, NODE_H - 5, 10);
      if (owned) ng.fillStyle(color, 1).fillRoundedRect(cx + 2, cy + 2, 6, NODE_H - 5, 3);
      gem(ng, cx + 20, cy + NODE_H / 2, 10, color, owned, dim);
      // The Mastery column keeps to its gold theme: every name and line in gold tones (no green, red or grey).
      const nameInk = col.gold ? (dim ? MASTERY_INK.dim : MASTERY_INK.name) : dim || st.hidden ? '#a89c88' : COLORS.ink;
      const name = m.add(scene.add.text(cx + 36, cy + 12, col.title(t, st), bodyStyle(16, nameInk, { fontStyle: 'bold' })));
      fitWidth(name, colW - 42);
      const lineInk = col.gold ? (owned ? col.ink : dim ? MASTERY_INK.dim : MASTERY_INK.line)
        : owned ? col.ink : avail ? (st.short ? COLORS.inkBad : COLORS.inkGood) : dim ? '#b3a892' : COLORS.inkDim;
      const style = bodyStyle(14, lineInk, { fontStyle: owned || avail ? 'bold' : 'normal' });
      if (st.costs) {
        const price = m.add(currencyCost(scene, st.costs, style, '', 16));
        price.setPosition(cx + 36, cy + NODE_H / 2 + 13).setScale(Math.min(1, (colW - 42) / price.width));
      } else fitWidth(m.add(scene.add.text(cx + 36, cy + NODE_H / 2 + 5, st.line || '', style)), colW - 42);
      if (isSel) {
        const sel = m.add(scene.add.graphics());
        sel.lineStyle(3, 0xffc83a, 1).strokeRoundedRect(cx - 2, cy - 2, colW + 4, NODE_H + 4, 13);
      } else if (avail) {
        // Available nodes get a steady outline, so the next move stands out (green; gold in the Mastery column).
        const glow = m.add(scene.add.graphics());
        glow.lineStyle(3, col.gold ? 0xd99a00 : 0x6cbf2c, 1).strokeRoundedRect(cx - 2, cy - 2, colW + 4, NODE_H + 4, 13);
      }
      const hover = m.add(scene.add.graphics().setVisible(false));
      hover.fillStyle(col.gold ? GOLD : 0xffffff, col.gold ? 0.22 : 0.25).fillRoundedRect(cx + 2, cy + 2, colW - 4, NODE_H - 5, 10);
      const zone = m.add(scene.add.zone(cx, cy, colW, NODE_H).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => hover.setVisible(true));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerdown', () => onSelect(col.pick(t)));
    }
  });
}

/** The Mastery column's gold glow and outline (x, y, w, h: the column): steady, no flashing (user, v0.8.2). */
function masteryAura(scene, m, x, y, w, h) {
  const glow = m.add(scene.add.graphics());
  for (let k = 3; k >= 1; k--) glow.fillStyle(GOLD, 0.08 * (4 - k)).fillRoundedRect(x - 4 * k, y - 4 * k, w + 8 * k, h + 8 * k, 12 + 4 * k);
  glow.lineStyle(3, GOLD, 0.9).strokeRoundedRect(x - 5, y - 5, w + 10, h + 10, 15);
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
  g.fillStyle(d.color ?? PATH_COLORS[d.path], 1).fillRoundedRect(x + 2, y + 2, w - 4, 10, { tl: 13, tr: 13, bl: 0, br: 0 });
  const info = d.info || (d.hidden
    ? { name: 'Locked tier', desc: `Level up your RV Lab to ${d.tier} to reveal this tier and research it.` }
    : tierInfo(d.type, d.path, d.tier));
  let cy = y + 24;
  const title = m.add(scene.add.text(x + 20, cy, info.name, textStyle(26)));
  fitWidth(title, w - 40);
  cy += 38;
  fitWidth(m.add(scene.add.text(x + 20, cy, d.subtitle || `Path ${d.path.toUpperCase()} · ${pathName(d.type, d.path)} · Tier ${d.tier}`, bodyStyle(14, d.ink || INK[d.path], { fontStyle: 'bold' }))), w - 40);
  cy += 30;
  const desc = m.add(scene.add.text(x + 20, cy, info.desc, bodyStyle(18, COLORS.ink, { wordWrap: { width: w - 40 }, lineSpacing: 4 })));
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
      const check = m.add(scene.add.text(x + 44, cy, text, bodyStyle(16, ok ? COLORS.ink : COLORS.inkBad, { wordWrap: { width: w - 64 } })));
      cy += Math.max(25, check.height + 6);
    }
  }
  const by = y + h - 42;
  if (d.button) {
    // The price is on the button ("Research · 240 RP"); the RP balance is at the top right.
    const b = new Button(scene, x + w / 2, by, w - 40, 66, d.button.label, d.button.onClick, { color: d.buttonColor ?? (d.rp ? 0x8e5bd6 : COLORS.buttonGood), fontSize: 20, radius: 12, invalidFeedback: true });
    const reason = d.button.ok ? '' : d.button.sub || '';
    if (d.button.costs?.length) b.setCosts(d.button.costs, d.button.label, reason);
    else b.setLabel(d.button.label, reason);
    b.setEnabled(!!d.button.ok);
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
export function openResearchWindow(scene, gs, { onClose = null, startType = null, focusMastery = false } = {}) {
  // Fixed width, sized for four columns (3 paths + Mastery): a type without a merged building spreads three wider columns over it.
  const LIST_W = 184, PANEL_W = 310, COL4_W = 150, GAP = 10;
  const GRID_W = GUTTER + COL4_W * 4 + GAP * 3, W = 22 + LIST_W + 14 + GRID_W + 16 + PANEL_W + 22;
  let type = startType && ABILITY_TYPES.includes(startType) ? startType : null;
  let unfollow = () => {};
  let selected = null;
  let goldThresholds = [];
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
    return { state: 'available', line: cost === 0 ? 'Research · Free' : '',
      costs: cost > 0 ? [{ currency: 'rp', amount: cost }] : null, short: (gs.researchPoints || 0) < cost };
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
  const pageSize = IS_TOUCH ? 5 : Infinity;
  let page = IS_TOUCH ? Math.floor(TABS.find((t) => t.key === tab).types.indexOf(type) / pageSize) : 0;

  const shakeCost = (amount) => amount > 0 ? [{ currency: 'rp', amount }] : [];
  const confirmResearch = (name, costs, onConfirm) => confirmDialog(scene, {
    title: 'Research perk?', lines: costs.length ? [name] : [name, 'Free research'], costs,
    confirmLabel: 'Research', confirmColor: COLORS.buttonGood, onConfirm
  });

  /** "Applies to every Cannon (3 now), whatever its level." */
  const appliesText = (owned) => {
    const n = gs.buildings.filter((b) => b.type === type).length;
    return `${owned ? 'On' : 'Applies to'} every ${buildingName(type)}${n ? ` (${n} now)` : ''}, whatever its level.`;
  };

  /** Does this type show its Mastery column? (Every mergeable type; greyed out until it has a merged building.) */
  const masteryShown = (t) => isMergeable(t);
  const masteryOpen = (t) => isMergeable(t) && hasMergedOf(gs, t);
  // A merged building's Mastery button opens on the Mastery column (its next tier), when the type has one.
  if (focusMastery && type && masteryOpen(type)) selected = { mastery: true, tier: Math.min(masteryTierCount(type), masteryLevel(gs, type) + 1) };
  const refresh = () => {
    if (!m.frame) return;
    m.clear();
    const lab = labLevel(gs);
    // The tree, plus the gold Mastery column for a merged type.
    const mastery = masteryShown(type);
    goldThresholds = mastery ? mergeConfig(type).mastery.goldCosts.map((cost) => gs.gold >= cost) : [];
    const COL_W = mastery ? COL4_W : Math.floor((GRID_W - GUTTER - GAP * 2) / 3);
    const treeH = GRID_H;
    m.resize(TOP + treeH + RESPEC_H + 24);
    if (selected && selected.mastery && !mastery) selected = null;
    m.setTitle(lab ? `RV Lab · Research (level ${lab}: tiers 1-${lab})` : 'RV Lab · Research');
    infoLine(scene, m, gs, 'research', lab
      ? 'Your first pick locks the path (A, B or C). Perks go onto every building of that type.'
      : 'Build or rebuild an RV Lab to research.', W - 420 - LIST_W, m.x + 22 + LIST_W + 14);
    // The tabs, over the list: the selected one green, a red "!" on a tab with research ready.
    TABS.forEach((tb, i) => {
      const tw = (LIST_W - 6) / 2, tx = m.x + 22 + i * (tw + 6), th = IS_TOUCH ? 48 : 36;
      const ty = m.y + INFO_Y - th / 2, on = tb.key === tab;
      const g = m.add(scene.add.graphics());
      g.fillStyle(COLORS.frame, 1).fillRoundedRect(tx, ty, tw, th, 9);
      g.fillStyle(on ? 0x6cbf2c : 0x4a4f5a, 1).fillRoundedRect(tx + 2, ty + 2, tw - 4, th - 5, 8);
      g.fillStyle(0xffffff, 0.18).fillRoundedRect(tx + 5, ty + 4, tw - 10, 7, 4);
      // A red "!" inside the tab's right end (not over its corner, where it ran into the next tab); the label
      // moves left to make room.
      const ready = tb.types.some((t) => canResearchFor(gs, t));
      const cy = ty + th / 2 - 2;
      const label = m.add(scene.add.text(tx + (ready ? (tw - 18) / 2 + 2 : tw / 2), cy, tb.label, textStyle(16)).setOrigin(0.5));
      fitWidth(label, tw - (ready ? 28 : 12));
      if (ready) {
        drawBadge(g, tx + tw - 13, cy, 7);
        m.add(scene.add.text(tx + tw - 13, cy, '!', textStyle(11)).setOrigin(0.5));
      }
      const zone = m.add(scene.add.zone(tx, ty, tw, th).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => {
        if (tab === tb.key) return;
        tab = tb.key;
        type = tb.types.find((t) => canResearchFor(gs, t)) || tb.types[0];
        page = IS_TOUCH ? Math.floor(tb.types.indexOf(type) / pageSize) : 0;
        selected = null;
        refresh();
      });
    });
    // Top right: the selected defense's tiers as pips, then your RP.
    const pg = m.add(scene.add.graphics());
    const balanceLeft = balance(scene, m, gs, true, m.x + W - 22, m.y + INFO_Y);
    drawPips(pg, balanceLeft - 14 - (18 * MAX_TIER + 8) / 2, m.y + INFO_Y, labPicks(gs, type)); // just left of the RP pill, whatever its width

    // The tab's buildings: its picture in a small tile, then its name over its five tiers (slim bars colored by
    // pick), centered together in the row, and a "!" badge on the right when research is ready. Everything is
    // placed from the row's height (12 defenses make short rows), so nothing overlaps.
    const types = TABS.find((tb) => tb.key === tab).types;
    const pages = Math.max(1, Math.ceil(types.length / pageSize));
    const lx = m.x + 22, ly = m.y + TOP;
    const itemH = IS_TOUCH ? 82 : Math.min(62, Math.floor((treeH + RESPEC_H + 4) / types.length));
    const go = (dir) => {
      const next = page + dir;
      if (next >= 0 && next < pages) { page = next; refresh(); }
    };
    const first = IS_TOUCH ? page * pageSize : 0;
    types.slice(first, first + pageSize).forEach((t, i) => {
      const y = ly + i * itemH, sel = t === type;
      const top = y + 2, inner = itemH - 8; // the row's face
      const g = m.add(scene.add.graphics());
      g.fillStyle(COLORS.frame, sel ? 1 : 0.2).fillRoundedRect(lx, y, LIST_W, itemH - 4, 9);
      g.fillStyle(sel ? 0x6cbf2c : 0xf3ecdd, 1).fillRoundedRect(lx + 2, top, LIST_W - 4, inner, 8);
      // Picture tile.
      const tileW = IS_TOUCH ? 48 : 34, tileX = lx + 5;
      g.fillStyle(sel ? 0x4f9a22 : 0xe3dac6, 1).fillRoundedRect(tileX, top + 2, tileW, inner - 4, 6);
      const pic = m.add(scene.add.image(tileX + tileW / 2, top + inner / 2, buildingTextureKey(scene, t, 1)));
      fitIcon(pic, tileW - 4, inner - 6);
      // A type with a merged building: the gear on its picture's corner.
      if (masteryOpen(t) && scene.textures.exists(MERGE_GEAR)) m.add(fitIcon(scene.add.image(tileX + tileW - 4, top + 7, MERGE_GEAR), Math.min(18, inner / 2)));
      // Name over the tier bars, as one block centered in the row.
      const ready = canResearchFor(gs, t);
      const nx = tileX + tileW + 7, barH = Math.max(4, Math.min(6, Math.round(inner / 7)));
      const size = IS_TOUCH ? 17 : 14;
      const name = m.add(scene.add.text(nx, 0, buildingName(t), sel ? textStyle(size) : bodyStyle(size, COLORS.ink, { fontStyle: 'bold' })));
      fitWidth(name, lx + LIST_W - nx - (ready ? 30 : 10)); // ends before the "!" badge
      const blockH = name.displayHeight + 2 + barH;
      name.setY(top + (inner - blockH) / 2);
      const barY = name.y + name.displayHeight + 2, barW = 15, barGap = 3;
      const picks = labPicks(gs, t);
      for (let d = 0; d < MAX_TIER; d++) {
        g.fillStyle(picks[d] ? PATH_COLORS[picks[d]] : sel ? 0x3f7a1c : 0xcfc6b3, 1).fillRoundedRect(nx + d * (barW + barGap), barY, barW, barH, barH / 2);
      }
      if (ready) {
        const r = Math.min(9, inner / 2 - 2), bx = lx + LIST_W - 15, by = top + inner / 2;
        drawBadge(g, bx, by, r);
        m.add(scene.add.text(bx, by - 1, '!', textStyle(Math.round(r * 1.4))).setOrigin(0.5));
      }
      const hover = m.add(scene.add.graphics().setVisible(false));
      hover.fillStyle(0xffffff, 0.2).fillRoundedRect(lx + 2, top, LIST_W - 4, inner, 8);
      const zone = m.add(scene.add.zone(lx, y, LIST_W, itemH - 4).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerover', () => hover.setVisible(!sel));
      zone.on('pointerout', () => hover.setVisible(false));
      zone.on('pointerdown', () => { if (type !== t) { type = t; selected = null; refresh(); } });
      if (pages > 1) zone.on('wheel', (p, dx, dy) => go(Math.sign(dy)));
    });
    if (pages > 1) {
      const y = ly + pageSize * itemH + 36;
      const nav = { color: COLORS.buttonBlue, radius: 9 };
      m.add(new Button(scene, lx + 32, y, 62, 58, '', () => go(-1), { ...nav, icon: 'left' }).setEnabled(page > 0));
      m.add(new Button(scene, lx + LIST_W - 32, y, 62, 58, '', () => go(1), { ...nav, icon: 'right' }).setEnabled(page < pages - 1));
      m.add(scene.add.text(lx + LIST_W / 2, y, `${page + 1} / ${pages}`, bodyStyle(16, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0.5));
    }

    const st = stateOf(lab);
    if (!selected) selected = firstPick(st);
    const gx = lx + LIST_W + 14, gy = ly;
    const panelX = gx + GRID_W + 16;
    let mState = null;
    const masteryLocked = mastery && !masteryOpen(type);
    if (mastery) {
      const have = masteryLevel(gs, type);
      const masteryCosts = (info) => [{ currency: 'gold', amount: info.goldCost }, ...shakeCost(info.cost)];
      mState = (t) => {
        if (masteryLocked) return { state: 'future', line: t === 1 ? 'Merge to unlock' : `After Mastery ${t - 1}` };
        if (t <= have) return { state: 'owned', line: '✔ Mastered' };
        if (t > have + 1) return { state: 'future', line: `After Mastery ${t - 1}` };
        const info = masteryTier(type, t);
        if (lab < info.labLevel) return { state: 'locked', line: `Locked · RV Lab lv ${info.labLevel}` };
        return { state: 'available', costs: masteryCosts(info), short: (gs.researchPoints || 0) < info.cost || gs.gold < info.goldCost };
      };
      if (selected.mastery) {
        // The Mastery tier's details: what it does, what it needs, and its Research button (gold).
        const t = selected.tier, info = masteryTier(type, t), mc = checkMastery(gs, type, t), s = mState(t), M = mergeConfig(type);
        const n = gs.buildings.filter((b) => b.type === type && b.merged).length;
        const detail = {
          type, path: 'a', tier: t, rp: true, color: GOLD, ink: GOLD_INK, buttonColor: 0xd9a21b,
          info: { name: info.name, desc: info.desc }, subtitle: `Mastery ${t} · ${M.ability} (${M.name})`,
          applies: `${s.state === 'owned' ? 'On' : 'Applies to'} every ${M.name} (${n} now). Not part of the path lock.`,
          checks: s.state === 'owned' ? [] : [
            [lab >= info.labLevel, `RV Lab level ${info.labLevel}${lab ? ` (yours: ${lab})` : ''}`],
            ...(t > 1 ? [[have >= t - 1, `Mastery ${t - 1} first`]] : []),
            [!isWaveActive(gs), 'Not during a wave']
          ],
          button: null
        };
        if (masteryLocked) {
          detail.color = MASTERY_GREY; detail.ink = '#8c8170';
          detail.applies = `Opens once you have a ${M.name}. Not part of the path lock.`;
          detail.checks = [[false, `A ${M.name} (merge two)`], ...detail.checks.filter(([, label]) => !/^Mastery \d first$/.test(label))];
          detail.button = { label: 'Research', costs: masteryCosts(info), ok: false, sub: needsMergeReason(type) };
        } else if (s.state === 'owned') {
          detail.note = have === masteryTierCount(type) ? '✔ Fully mastered' : '✔ Mastered';
          detail.noteGood = true;
        }

        else {
          const target = type;
          const costs = masteryCosts(info);
          detail.button = { label: 'Research', costs, ok: mc.ok, sub: mc.reason, onClick: () => confirmResearch(info.name, costs, () => {
            if (checkMastery(gs, target, t).ok && gs.researchMastery(target, t).ok) {
              selected = { mastery: true, tier: Math.min(masteryTierCount(target), t + 1) };
              refresh();
            }
          }) };
        }
        drawDetails(scene, m, panelX, gy, PANEL_W, treeH, detail);
      }
    }
    drawTree(scene, m, gx, gy, COL_W, GAP, type, st, selected, (sel) => { selected = sel; refresh(); }, labPicks(gs, type), mState ? { stateOf: mState, locked: masteryLocked } : null);

    if (!selected.mastery) {
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
      if (s.hidden) detail.button = { label: 'Research', costs: shakeCost(researchCost(tier)), ok: false, sub: c.reason };
      else if (s.state === 'owned') { detail.note = count === MAX_TIER ? '✔ Fully researched' : '✔ Researched'; detail.noteGood = true; }
      else if (s.state === 'taken') detail.note = `Your ${buildingName(type)}s are locked to Path ${locked.toUpperCase()}. Reset the path to switch.`;

      else {
        const target = type;
        detail.button = { label: c.cost === 0 ? 'Research (free)' : 'Research', costs: shakeCost(c.cost ?? researchCost(tier)), ok: c.ok, sub: c.reason,
          onClick: () => confirmResearch(tierInfo(target, path, tier).name, shakeCost(c.cost), () => {
            if (gs.researchAbility(target, path, tier).ok) { selected = { path, tier: Math.min(MAX_TIER, tier + 1) }; refresh(); }
          }) };
      }
      drawDetails(scene, m, panelX, gy, PANEL_W, treeH, detail);
    }

    // Paid respec, under the tree: clears this type's path (its picks are not refunded) so it can take another. Always
    // its normal price (v0.8.3: merging no longer gives a free reset).
    const count = labTierCount(gs, type);
    const locked = lockedPath(gs, type);
    if (count > 0) {
      const rc = checkRespec(gs, type), ry = gy + treeH + 8 + RESPEC_H / 2;
      m.add(scene.add.text(gx, ry, `${buildingName(type)}s are locked to Path ${locked.toUpperCase()} · ${pathName(type, locked)}${rc.ok ? '' : ` (${rc.reason})`}`, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0, 0.5));
      const rb = new Button(scene, panelX + PANEL_W - 150, ry, 300, 54, 'Reset path', () => {
        confirmDialog(scene, {
          title: 'Reset path?',
          lines: [`Reset the ${buildingName(type)} path?`,
            `Its ${count} researched tier${count > 1 ? 's' : ''} are lost (no refund) and you pick a path again.`],
          confirmLabel: 'Reset', costs: shakeCost(rc.cost), onConfirm: () => { if (gs.respecPath(type).ok) { selected = null; refresh(); } }
        });
      }, { color: 0x8e5bd6, fontSize: 18, radius: 12, invalidFeedback: true });
      rb.setCosts(shakeCost(rc.cost), 'Reset path').setEnabled(rc.ok);
      m.add(rb);
    }
  };
  const stopFollowing = follow(scene, gs, refresh);
  const onGoldChanged = () => {
    if (goldThresholds.some((met, index) => met !== (gs.gold >= mergeConfig(type).mastery.goldCosts[index]))) refresh();
  };
  gs.on('goldChanged', onGoldChanged, m);
  unfollow = () => {
    stopFollowing();
    gs.off('goldChanged', onGoldChanged, m);
    scene.events.off('shutdown', unfollow);
  };
  scene.events.once('shutdown', unfollow);
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
