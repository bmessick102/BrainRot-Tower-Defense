// The "Upgrade to level N?" window (opened by the building panel's Upgrade button, UIScene.onUpgrade): the next level's
// picture, its stat bars and facts, and the price, with a red "Note!" band listing whatever is missing. The Village Hall's
// version lists what the new level unlocks as a row of cards instead of the facts. Walls upgrade all together.
// Layout: PurchasePreview.js. What can be bought: src/logic/upgradePreview.js. It redraws when the money, the hall or
// the wave changes, and buys through GameState.upgradeBuilding with the level it showed (a stale window can't buy twice).
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { buildingTextureKey, showcaseFooting } from './BuildingView.js';
import { drawShowcaseCard, fitIcon, fitWidth } from './uiDraw.js';
import { drawShowcase, drawStatBars, drawFacts, drawPurchaseFooter, PREVIEW_W, PREVIEW_H } from './PurchasePreview.js';
import { ensureEncoreTextures, ENCORE_ICON } from './EncoreIcon.js';
import { ensureAegisTexture, AEGIS_ICON } from './AegisIcon.js';
import { playSfxCapped } from '../audio.js';
import { SFX, TEX } from '../assetKeys.js';
import { requestImages } from '../assetLoader.js';
import { levelArtKey } from '../assetPlan.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { buildingName, isDefense, typeConfig, HERO_TYPES } from '../logic/buildings.js';
import { towerRange, towerMinRange, towerFireInterval } from '../logic/abilities.js';
import { previewUpgrade, hallUpgradeUnlocks } from '../logic/upgradePreview.js';
import { heroStatsFor } from '../logic/heroes.js';
import { formatGold } from '../logic/economy.js';
import { djStats, hypeNeeded } from '../logic/dj.js';

const MAX_BARS = 5, UNLOCK_PAGE = 7;
const fmt = (n) => Number(Number(n).toFixed(2)).toLocaleString('en-US');

/** The icon beside a stat bar, from its label (a PurchasePreview statIcon kind, or a texture key). */
export function statIconFor(label, type) {
  if (/^(HP|Hit points|Hero health)$/.test(label)) return 'hp';
  if (/healing/i.test(label)) return 'heal'; // the Mage's Sanctuary healing
  if (/Feast/.test(label)) return TEX.feastReady;
  if (/Encore/.test(label)) return ENCORE_ICON;
  if (/Aegis/.test(label)) return AEGIS_ICON;
  // How much it holds (a chest of Bitcoin / a cooler of Shakes); what it makes (the coin / the Shake).
  if (/^Bitcoin capacity/.test(label)) return 'gold_capacity';
  if (/^Shake capacity/.test(label) || (type === 'shakeCollector' && /^Stock/.test(label))) return 'shake_capacity';
  if (/Shake/.test(label) || type === 'shakeCollector') return 'shake';
  if (/Bitcoin|Gold/.test(label)) return 'coin';
  if (/^Gnomes/.test(label)) return 'gnomes';
  if (/^Marked/.test(label)) return 'mark'; // the F.L.O.C.K's damage bonus on marked enemies
  if (/^Pool damage/.test(label)) return 'pool';
  if (/^Beam damage/.test(label)) return 'beam';
  if (/damage|Zap/i.test(label)) return 'damage';
  if (/range|radius/i.test(label)) return 'range';
  if (/time|duration/i.test(label)) return 'time';
  if (/speed/i.test(label)) return 'speed'; // Attack speed (heroes), Firing speed boost (DJ)
  if (/slow|chill/i.test(label)) return 'slow'; // the KSI Frost Fortress's chill
  if (/research/i.test(label)) return 'research'; // the RV Lab's unlocked tier
  if (/spell/i.test(label)) return 'spells'; // the Fuel Station's unlocked spells
  return 'star';
}

/** "Single target" / "Splash (1.5 tiles)" and "Ground & Air" for a defense. */
export function defenseKind(type) {
  const cfg = typeConfig(type);
  const damage = type === 'ra' ? 'Beam (heats up on one enemy)'
    : type === 'flock' ? 'None (marks enemies)'
      : type === 'mousetrap' ? 'Snaps every enemy nearby'
        : cfg.splashRadius ? `Splash (${cfg.splashRadius} tiles)` : 'Single target';
  const targets = cfg.hitsGround && cfg.hitsAir ? 'Ground & Air' : cfg.hitsAir ? 'Air' : 'Ground';
  return { damage, targets };
}

/** A defense's facts at the next level: Range (and what it gains), how often it fires, damage type, targets. */
function defenseFacts(b, next) {
  const facts = [];
  const r2 = (v) => Math.round(v * 100) / 100;
  if (b.type !== 'flock') {
    const from = r2(towerRange(b)), to = r2(towerRange(next)), min = r2(towerMinRange(next));
    facts.push({ label: 'Range', value: `${fmt(to)} tiles${min ? ` (not within ${fmt(min)})` : ''}`, gain: to > from ? `+${fmt(to - from)}` : '' });
  }
  if (b.type !== 'flock' && b.type !== 'mousetrap' && b.type !== 'ra') {
    const from = r2(towerFireInterval(b)), to = r2(towerFireInterval(next));
    facts.push({ label: 'Fires every', value: `${fmt(to)} s`, gain: to < from ? `${fmt(to - from)} s` : '' });
  }
  const kind = defenseKind(b.type);
  facts.push({ label: 'Damage type', value: kind.damage }, { label: 'Targets', value: kind.targets });
  return facts;
}

/** A hero altar's facts at the next level: how often the hero attacks, its reach, what it hits, its ability's uses. */
function heroFacts(next) {
  const st = heroStatsFor(next);
  const reach = next.type === 'mageAltar' ? `${fmt(st.attackRange)} tiles (aura ${fmt(st.auraRadius)})`
    : next.type === 'queenAltar' ? `Shoots ${fmt(st.attackRange)} tiles · guards ${fmt(st.guardRange)}`
      : `Guards ${fmt(st.guardRange)} tiles`;
  const charges = st.feastCharges || st.encoreCharges || st.aegisCharges || 1;
  return [
    { label: 'Attacks every', value: `${fmt(st.attackInterval)} s` },
    { label: 'Range', value: reach },
    { label: 'Targets', value: next.type === 'altar' ? 'Ground' : 'Ground & Air' },
    { label: 'Ability', value: `${charges}× per wave` }
  ];
}

/** DJ Babyface's facts at the next level (its Info notes include the live hype meter, which means nothing here). */
function djFacts(b, next) {
  const from = djStats(b).gnomeBoostPct, to = djStats(next).gnomeBoostPct;
  return [
    { label: 'Gnomes in range', value: `work +${fmt(to)}% faster`, gain: to > from ? `+${fmt(to - from)}%` : '' },
    { label: 'Drop the Beat', value: `ready after ${hypeNeeded(next)} enemies defeated` }
  ];
}

/** Bars and facts for the next level: { bars, facts }. */
function upgradeContent(scene, b, level, nextLevel, preview) {
  const start = { ...b, level }, next = { ...b, level: nextLevel };
  const rows = scene.upgradeStatRows(start, nextLevel)
    .filter((r) => r.label !== 'Attack range' && r.label !== 'Attack speed')
    .map((r) => ({ ...r, label: r.label === 'HP' ? 'Hit points' : r.label, icon: statIconFor(r.label, b.type) }));
  if (b.type === 'townHall') rows.splice(0, 0, ...rows.splice(1, 2)); // the capacities first, then hit points
  let facts;
  if (b.type === 'wall') {
    facts = [{ label: 'Walls upgraded', value: `${preview.count} (every wall goes up together)` },
      { label: 'Price per wall', value: `${formatGold(preview.each)} Bitcoin` }];
  } else if (isDefense(b.type)) facts = defenseFacts(start, next);
  else if (HERO_TYPES.includes(b.type)) facts = heroFacts(next);
  else if (b.type === 'dj') facts = djFacts(start, next);
  else facts = scene.statNotes(next).slice(0, 4).map((text) => ({ text }));
  return { bars: rows.slice(0, MAX_BARS), facts };
}

export function openUpgradeWindow(scene, gs, b) {
  const initial = previewUpgrade(gs, b);
  if (initial.cost === null) return null;
  const { level, nextLevel } = initial;
  const hall = b.type === 'townHall';
  const wall = b.type === 'wall';
  if (HERO_TYPES.includes(b.type)) { ensureEncoreTextures(scene); ensureAegisTexture(scene); }
  const title = hall && level === 0 ? 'Rebuild the Village Hall?' : wall ? `Upgrade walls to level ${nextLevel}?` : `Upgrade to level ${nextLevel}?`;
  const m = new Modal(scene, { width: PREVIEW_W, height: PREVIEW_H, title, onClose: () => scene.refreshGuide() });
  const artKey = levelArtKey(b.type, nextLevel);
  let unlockPage = 0;

  /** The current state for the level this window shows, or null once it's gone (upgraded elsewhere, removed). */
  const live = () => {
    const current = gs.getBuilding(b.id);
    if (!current) return null;
    const status = previewUpgrade(gs, current);
    return status.level === level && status.cost !== null ? status : null;
  };

  const confirm = () => {
    const status = live();
    const result = status?.ok ? gs.upgradeBuilding(b.id, level) : { ok: false };
    if (result.ok) { m.close(); return; }
    playSfxCapped(scene, SFX.invalid, 1);
    draw();
  };

  const drawUnlocks = (g, top) => {
    const unlocks = hallUpgradeUnlocks(nextLevel);
    m.add(scene.add.text(m.cx, m.y + top, 'Unlocks Buildings:', bodyStyle(19, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0.5));
    if (!unlocks.length) {
      m.add(scene.add.text(m.cx, m.y + top + 70, 'No new buildings at this level', bodyStyle(18, COLORS.inkDim)).setOrigin(0.5));
      return;
    }
    const pages = Math.ceil(unlocks.length / UNLOCK_PAGE);
    unlockPage = Math.min(unlockPage, pages - 1);
    const items = unlocks.slice(unlockPage * UNLOCK_PAGE, (unlockPage + 1) * UNLOCK_PAGE);
    const step = 116, cw = 106, ch = 112, cy = m.y + top + 20;
    items.forEach((item, i) => {
      const cx = m.cx + (i - (items.length - 1) / 2) * step, x = cx - cw / 2;
      drawShowcaseCard(g, x, cy, cw, ch, { tileY: cy + 66, tileW: 34 });
      m.add(fitIcon(scene.add.image(cx, cy + 74, buildingTextureKey(scene, item.type, 1)).setOrigin(0.5, 1), 84, 62));
      const tag = item.slots ? `+${item.add}` : item.isNew ? (item.add > 1 ? `New ×${item.add}` : 'New') : `+${item.add}`;
      m.add(scene.add.text(x + 8, cy + 6, tag, textStyle(17)));
      fitWidth(m.add(scene.add.text(cx, cy + ch - 17, item.name || buildingName(item.type), textStyle(14)).setOrigin(0.5)), cw - 10);
    });
    if (pages > 1) {
      const nav = { color: COLORS.buttonBlue, radius: 9 };
      const y = cy + ch / 2;
      m.add(new Button(scene, m.x + 40, y, 46, 56, '', () => { unlockPage--; draw(); }, { ...nav, icon: 'left' }).setEnabled(unlockPage > 0));
      m.add(new Button(scene, m.x + m.w - 40, y, 46, 56, '', () => { unlockPage++; draw(); }, { ...nav, icon: 'right' }).setEnabled(unlockPage < pages - 1));
    }
  };

  const draw = () => {
    if (!m.frame) return;
    const status = live();
    if (!status) { m.close(); return; }
    m.clear();
    const g = m.add(scene.add.graphics());
    const loaded = !artKey || scene.textures.exists(artKey);
    const shown = loaded ? nextLevel : Math.max(1, level); // the level whose picture shows
    drawShowcase(scene, m, g, {
      name: buildingName(b.type),
      picture: { key: buildingTextureKey(scene, b.type, shown), footing: showcaseFooting(b.type, shown) },
      tag: { small: wall ? 'Wall level' : 'Level', big: hall && level === 0 ? 'Ruin → 1' : `${level} → ${nextLevel}` }
    });
    const { bars, facts } = upgradeContent(scene, gs.getBuilding(b.id), level, nextLevel, status);
    drawStatBars(scene, m, g, bars);
    if (hall) drawUnlocks(g, 402);
    else drawFacts(scene, m, g, facts, 410);
    drawPurchaseFooter(scene, m, g, {
      costs: [{ currency: status.currency || 'gold', amount: status.cost, short: status.short }],
      label: hall && level === 0 ? 'Rebuild' : '', notes: status.notes, onConfirm: confirm
    });
  };

  draw();
  if (artKey && !scene.textures.exists(artKey)) requestImages([artKey], { front: true }).then(() => draw());
  for (const event of ['goldChanged', 'researchPointsChanged', 'townHallUpgraded', 'buildingUpgraded', 'wallsUpgraded',
    'waveStarted', 'waveCleared', 'gameOver', 'buildingDestroyed', 'buildingRepaired', 'tutorialChanged']) gs.on(event, draw, m);
  const destroy = m.destroy.bind(m);
  m.destroy = () => { gs.offContext(m); destroy(); };
  return m;
}
