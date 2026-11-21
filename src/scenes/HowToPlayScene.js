// How to Play, in five tabs:
//   Basics    - controls, waves and the day/night cycle, gold.
//   Buildings - a browser for every building: picture (level 1 or max), what it is, where it unlocks, its
//               ability paths, and how its stats grow from level 1 to max (all read from config).
//   Upgrades  - leveling buildings and the Village Hall, rebuilding / selling, and the RV Lab abilities
//               (build the lab -> pick a path per building type; every building of that type gets the perks).
//   Enemies   - a roster of every enemy on the left (mini picture cards under their category: Ground, Air,
//               Tanks & Bosses, Special) and the picked one on the right: picture, description, tags, which
//               defenses can hit it, and stats.
//   Leagues   - every league's badge and the wave it takes, with where you stand when logged in.
// Arrow keys browse the Buildings / Enemies lists (up / down: the enemy categories); 1-5 switch tabs; Esc goes back.
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { IS_TOUCH } from '../device.js';
import {
  DEFENSE_TYPES, buildingName, typeConfig, maxLevel, levelStats, limitFor, unlockTownHall, footprintDims, buildCost,
  totalSpent, isDefense, isSupport, takesBonusSlot, bonusTownHall
} from '../logic/buildings.js';
import { ENEMY_KINDS } from '../logic/enemies.js';
import { formatGold } from '../logic/economy.js';
import { ABILITIES, ABILITY_COSTS, PATH_COLORS, PATH_KEYS } from '../abilityConfig.js';
import { Button } from '../objects/Button.js';
import { addLeagueRow } from '../objects/LeagueRow.js';
import { LEAGUES } from '../logic/leagues.js';
import { session } from '../net/account.js';
import { buildingTextureKey } from '../objects/BuildingView.js';
import { TEX, enemyKey } from '../assetKeys.js';
import { drawWindow, drawShowcaseCard, drawCardStrip, drawStatBar, drawTag, drawGlossy, fitWidth, fitIcon, addHeroBadge } from '../objects/uiDraw.js';
import { ENEMY_DESCRIPTIONS, ENEMY_CATEGORIES, ENEMY_ORDER } from '../enemyText.js';
import { BUILDING_DESCRIPTIONS } from '../buildingText.js';
import { COLORS, bodyStyle, textStyle, RP_COLOR } from '../theme.js';
import { rpText } from '../logic/researchPoints.js';
import { SPELL_KINDS, spellConfig, spellName, spellEffect } from '../logic/spells.js';
import { addSpellIcon } from '../objects/SpellIcons.js';
import { showTitleBackdrop } from './TitleBackdropScene.js';

// ---------- layout ----------
const TABS = [
  { key: 'basics', label: 'Basics' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'upgrades', label: 'Upgrades' },
  { key: 'enemies', label: 'Enemies' },
  { key: 'leagues', label: 'Leagues' }
];
const TAB = { y: 134, w: 200, h: 44, gap: 14 };
const LEFT = 76, RIGHT = 1204;                 // content edges
const CONTENT_TOP = 174, CONTENT_BOTTOM = 600; // the Back button's top is ~609
// Browsers (Buildings / Enemies): a row of chips, a picture card on the left, details on the right.
const CHIP_Y = 200, CHIP_H = 50, CHIP_GAP = 8;
const CARD = { x: 96, y: 246, w: 216, h: 248 };
const RX = CARD.x + CARD.w + 40, RW = RIGHT - RX;
const STAT_COLS = 3, STAT_ROW = 40;
// Where a browser's parts go: the picture card, the text column right of it (name, tags, description: taller
// descriptions than descMax drop to a smaller font) and the stat grid.
const BUILDING_LAYOUT = { card: CARD, rx: RX, rw: RW, descMax: 66, statX: RX, statW: RW };
// Enemies: the roster panel on the left; the picked enemy's card and text right of it, its "hit by" row and stats
// across the whole detail area under them. The roster is as wide as its biggest category's row of tiles.
const ROSTER = { x: LEFT, y: CONTENT_TOP, h: CONTENT_BOTTOM - CONTENT_TOP, pad: 13, tileW: 54, tileH: 58, gap: 5, head: 28, block: 14 };
const ROSTER_COLS = Math.max(...ENEMY_CATEGORIES.map((c) => c.kinds.length));
ROSTER.w = ROSTER.pad * 2 + ROSTER_COLS * ROSTER.tileW + (ROSTER_COLS - 1) * ROSTER.gap;
const DX = ROSTER.x + ROSTER.w + 24, DW = RIGHT - DX;
const ENEMY_CARD = { x: DX + 24, y: CONTENT_TOP + 4, w: 196, h: 226 };
const ENEMY_LAYOUT = {
  card: ENEMY_CARD, rx: ENEMY_CARD.x + ENEMY_CARD.w + 36, rw: RIGHT - (ENEMY_CARD.x + ENEMY_CARD.w + 36),
  descMax: 104, statX: DX, statW: DW
};
// A color per enemy category (the roster's headers).
const CATEGORY_COLORS = { ground: COLORS.button, air: COLORS.buttonBlue, tanks: 0xb03a2e, special: 0x9b59d0 };

// Buildings in the order a player meets them: the base, economy, walls, then defenses and traps.
const BUILDING_ORDER = ['townHall', 'mine', 'storage', 'house', 'rvlab', 'dj', 'fuelStation', 'wall', 'cannon', 'archer', 'mortar', 'wizard', 'firework', 'spear', 'ksi', 'flock', 'ra', 'catapult', 'mousetrap', 'altar'];

const categoryOf = (kind) => ENEMY_CATEGORIES.find((c) => c.kinds.includes(kind));
// The category tabs share the chip row: tabs on the left, the shown category's chips on the right.

// Defenses that attack (support towers like the F.L.O.C.K Tower never hit anything).
const ATTACKERS = DEFENSE_TYPES.filter((t) => !typeConfig(t).support);

function defenseHitsEnemy(defType, enemyKind) {
  const cfg = typeConfig(defType);
  return CONFIG.enemies[enemyKind].type === 'air' ? cfg.hitsAir : cfg.hitsGround;
}

/** First wave (1-based) whose roster includes this enemy, or null if only endless waves bring it. */
function firstWave(kind) {
  const i = CONFIG.waves.findIndex((w) => (w[kind] || 0) > 0);
  return i >= 0 ? i + 1 : null;
}

const round1 = (n) => Math.round(n * 10) / 10;
// Stat bars compare against the regular enemies; a raid boss's bars are simply full.
const maxOf = (fn) => Math.max(...ENEMY_KINDS.filter((k) => !CONFIG.enemies[k].boss).map((k) => fn(CONFIG.enemies[k])));

// ---------- enemy stats ----------
function rangeText(cfg) {
  if (cfg.type === 'air' && cfg.attackRange <= 0) return 'Overhead';
  if (cfg.attackRange <= 0.5) return 'Melee';
  return `${cfg.attackRange} tiles`;
}

/** Longest reach of any enemy: attack range, or blast radius for exploders. */
const maxReach = () => maxOf((c) => Math.max(c.attackRange, c.blastRadius || 0));

/** Stat tiles for a carrier (Neegy Balloon): it never attacks, it drops troops. */
function carrierStats(cfg) {
  const troop = CONFIG.enemies[cfg.drops];
  return [
    { label: 'Health', value: formatGold(cfg.hp), frac: cfg.hp / maxOf((c) => c.hp), color: 0x4cd137 },
    { label: 'Drops', value: `${cfg.perDrop} ${troop.name}s`, frac: 1, color: 0xff6b3d },
    { label: 'Drops every', value: `${cfg.dropInterval} s`, frac: 1 / cfg.dropInterval, color: 0xffc93c },
    { label: 'Attacks', value: 'Never (drops troops)', frac: 0.08, color: 0xe0452f },
    { label: 'Speed', value: `${cfg.speed} tiles/s`, frac: cfg.speed / maxOf((c) => c.speed), color: 0x3cb8ff },
    { label: 'On death', value: `Drops ${cfg.deathDrop} more`, frac: 1, color: 0xb36bff }
  ];
}

/** Enemies that blow themselves up (config `explodes`): one blast, extra damage to what they prefer. */
function exploderStats(cfg) {
  const vsWalls = cfg.prefers && cfg.prefers.includes('wall') ? cfg.damage * cfg.preferredDamageMultiplier : null;
  const stats = [
    { label: 'Health', value: formatGold(cfg.hp), frac: cfg.hp / maxOf((c) => c.hp), color: 0x4cd137 },
    { label: 'Blast damage', value: formatGold(cfg.damage), frac: cfg.damage / maxOf((c) => c.damage), color: 0xff6b3d }
  ];
  if (vsWalls !== null) stats.push({ label: 'Damage to walls', value: formatGold(vsWalls), frac: 1, color: 0xe0452f });
  stats.push(
    { label: 'Attacks', value: 'Once (explodes)', frac: 0.08, color: 0xffc93c },
    { label: 'Speed', value: `${cfg.speed} tiles/s`, frac: cfg.speed / maxOf((c) => c.speed), color: 0x3cb8ff },
    { label: 'Blast radius', value: `${cfg.blastRadius} tiles`, frac: cfg.blastRadius / maxReach(), color: 0xb36bff }
  );
  return stats.slice(0, 6);
}

function enemyStats(cfg) {
  if (cfg.explodes) return exploderStats(cfg);
  if (cfg.drops) return carrierStats(cfg);
  // Exploders hit once and carriers never hit, so they're left out of the attack-rate comparisons.
  const repeat = ENEMY_KINDS.map((k) => CONFIG.enemies[k]).filter((c) => !c.explodes && !c.drops);
  const dps = (c) => c.damage / c.attackInterval;
  const fastest = Math.min(...repeat.map((c) => c.attackInterval));
  const maxDps = Math.max(...repeat.map(dps));
  return [
    { label: 'Health', value: formatGold(cfg.hp), frac: cfg.hp / maxOf((c) => c.hp), color: 0x4cd137 },
    { label: 'Damage per hit', value: formatGold(cfg.damage), frac: cfg.damage / maxOf((c) => c.damage), color: 0xff6b3d },
    { label: 'Attacks every', value: `${cfg.attackInterval} s`, frac: fastest / cfg.attackInterval, color: 0xffc93c },
    { label: 'Damage per second', value: String(round1(dps(cfg))), frac: dps(cfg) / maxDps, color: 0xe0452f },
    { label: 'Speed', value: `${cfg.speed} tiles/s`, frac: cfg.speed / maxOf((c) => c.speed), color: 0x3cb8ff },
    { label: 'Attack range', value: rangeText(cfg), frac: Math.max(0.08, cfg.attackRange / maxReach()), color: 0xb36bff }
  ];
}

// ---------- building stats ----------
const fmt = (v) => (Number.isInteger(v) ? formatGold(v) : String(round1(v)));
const tiles = (n) => `${n} tile${n === 1 ? '' : 's'}`;

/** A stat that grows with level: "40 → 301", the bar showing level 1 against the top level. */
function grow(type, label, key, color, unit = '') {
  const lo = levelStats(type, 1)[key], hi = levelStats(type, maxLevel(type))[key];
  return { label, value: `${fmt(lo)}${unit} → ${fmt(hi)}${unit}`, frac: hi ? lo / hi : 0, growth: true, color };
}
/** A stat that stays the same at every level. */
const fixed = (label, value, frac, color) => ({ label, value, frac: Math.max(0.06, Math.min(1, frac)), color });

/** Up to six stats for a building type (level 1 → max where they grow). */
function buildingStats(type) {
  const cfg = typeConfig(type);
  const top = maxLevel(type);
  const out = [grow(type, 'Health', 'hp', 0x4cd137)];
  const levels = fixed('Levels', String(top), top / 10, 0x9a7cff);
  if (type === 'townHall') {
    out.push(grow(type, 'Gold it holds', 'capacity', 0xffc93c));
    out.push(fixed('Unlocks', 'New buildings', 1, 0x3cb8ff));
  } else if (type === 'mine') {
    out.push(grow(type, 'Gold per second', 'production', 0xffc93c));
    out.push(grow(type, 'Holds before collecting', 'stockCap', 0x3cb8ff));
  } else if (type === 'storage') {
    out.push(grow(type, 'Gold capacity', 'capacity', 0xffc93c));
  } else if (type === 'house') {
    out.push(grow(type, 'Gnome workers', 'gnomes', 0xe85d4a));
  } else if (type === 'altar') {
    out.push(grow(type, 'Hero health', 'heroHp', 0x4cd137));
    out.push(grow(type, 'Hero damage per hit', 'heroDamage', 0xff6b3d));
    out.push(fixed('Guard range', `${CONFIG.altar.hero.guardRange} tiles`, CONFIG.altar.hero.guardRange / 10, 0x3cb8ff));
    out.push(fixed('Longest nap', `${CONFIG.altar.hero.maxSleepSeconds} s`, 0.6, 0x9b59d0));
    out.push(fixed('Upgrades cost', `${levelStats(type, 2).cost} → ${rpText(levelStats(type, top).cost)}`, 0.5, RP_COLOR));
  } else if (type === 'dj') {
    out.push(grow(type, 'Range', 'range', 0x4cd6ff, ' tiles'));
    out.push(grow(type, 'Gnome work speed', 'gnomeBoostPct', 0xffc93c, '%'));
    out.push(grow(type, 'Drop the Beat fire rate', 'beatPct', 0xff6b3d, '%'));
    out.push(grow(type, 'Drop the Beat length', 'beatSeconds', 0xc070ff, ' s'));
  } else if (type === 'fuelStation') {
    // The levels that open a new spell, how many a raid can carry (by Village Hall), and what an upgrade costs.
    const opens = [...new Set(SPELL_KINDS.map((k) => spellConfig(k).level))].sort((a, b) => a - b);
    out.push(fixed('New spell at level', opens.join(' · '), opens.length / top, 0x9b59d0));
    const slots = cfg.spellSlots.filter((n) => n > 0);
    out.push(fixed('Spells per raid', `${slots[0]} → ${slots[slots.length - 1]} (Village Hall)`, 1, 0x3cb8ff));
    out.push(fixed('Upgrades cost', `${levelStats(type, 2).cost} → ${rpText(levelStats(type, top).cost)}`, 0.5, RP_COLOR));
    out.push(fixed('Stronger per level', `+${Math.round(cfg.powerPerLevel * 100)}%`, cfg.powerPerLevel * 3, 0xff6b3d));
  } else if (type === 'rvlab') {
    out.push(fixed('Tiers it researches', `1 → ${top}`, 1, 0xff9a3c));
    out.push(fixed('Village Hall needed', `${levelStats('rvlab', 1).townHall} → ${levelStats('rvlab', top).townHall}`, 1, 0x3cb8ff));
  } else if (type === 'wall') {
    const prices = typeConfig('wall').levels.map((l) => l.cost);
    out.push(fixed('Level price per wall', `${formatGold(prices[0])} → ${formatGold(prices[prices.length - 1])}`, 0.1, 0xffc93c));
    out.push(fixed('Upgrades', 'All walls at once', 1, 0x3cb8ff));
  } else if (type === 'mousetrap') {
    out.push(grow(type, 'Damage', 'damage', 0xff6b3d));
    out.push(grow(type, 'Holds enemies', 'hold', 0xffc93c, ' s'));
    out.push(fixed('Catch radius', tiles(cfg.range), cfg.range / 3, 0x3cb8ff));
  } else if (type === 'flock') {
    out.push(grow(type, 'Range', 'range', 0x4cd6ff, ' tiles'));
    out.push(grow(type, 'Marked damage bonus', 'markBonus', 0xff6b3d, '%'));
    out.push(fixed('Attacks', 'Never (support)', 0.06, 0xe0452f));
  } else if (type === 'ra') {
    out.push(grow(type, 'Beam damage / s', 'dps', 0xff6b3d));
    out.push(fixed('Range', tiles(cfg.range), cfg.range / 16, 0x3cb8ff));
    const heat = cfg.stages.slice(1).map((s) => `x${s.mult} at ${s.after}s`).join(', ');
    out.push(fixed('Heats up', heat, 1, 0xffc93c));
  } else if (isDefense(type)) {
    out.push(grow(type, type === 'catapult' ? 'Impact damage' : 'Damage', 'damage', 0xff6b3d));
    if (type === 'catapult') out.push(grow(type, 'Pool damage / s', 'poolDps', 0xff4fa3));
    if (type === 'ksi') {
      const lo = levelStats(type, 1).slow, hi = levelStats(type, top).slow;
      out.push({ label: `Chill (${cfg.chill.seconds} s)`, value: `${Math.round(lo * 100)}% → ${Math.round(hi * 100)}% slower`, frac: lo / hi, growth: true, color: 0x8fd8ff });
    }
    out.push(fixed('Range', `${tiles(cfg.range)}${cfg.minRange ? ` (not within ${cfg.minRange})` : ''}`, cfg.range / 16, 0x3cb8ff));
    out.push(fixed('Fires every', `${cfg.fireInterval} s`, 0.5 / cfg.fireInterval, 0xffc93c));
    if (type !== 'catapult') out.push(fixed('Splash', cfg.splashRadius ? tiles(cfg.splashRadius) : 'None', (cfg.splashRadius || 0) / 1.5, 0xb36bff));
  }
  out.push(levels);
  if (type !== 'townHall' && out.length < 6) {
    const total = totalSpent(type, top);
    out.push(fixed('Total to max level', formatGold(total), total / totalSpent('ra', maxLevel('ra')), 0xc98a12));
  }
  return out.slice(0, 6);
}

/** Category tags for a building: what it is, what it hits, where it unlocks, how many, its size. */
function buildingTags(type) {
  const cfg = typeConfig(type);
  const tags = [];
  if (type === 'townHall') tags.push(['Your base', 0xc98a12]);
  else if (type === 'wall') tags.push(['Wall', 0x8a6a46]);
  else if (type === 'rvlab') tags.push(['Research', 0x9b59d0]);
  else if (type === 'dj') tags.push(['Utility', 0x9b59d0], ['Drop the Beat on the hotbar', 0xc070ff]);
  else if (type === 'fuelStation') tags.push(['Spells', 0x9b59d0], ['Brewed with Burgers', RP_COLOR], ['Cast from the hotbar', 0xc070ff]);
  else if (type === 'altar') tags.push(['Hero', 0xc98a12], ['Melee', 0xd0583c], ['Sleeps to heal', 0x6c7a89]);
  else if (!isDefense(type)) tags.push(['Economy', COLORS.buttonGood]);
  else if (cfg.trap) tags.push(['Hidden trap', 0x6c7a89]);
  else if (isSupport(type)) tags.push(['Support', 0x23a99a]);
  else tags.push(['Defense', COLORS.buttonDanger]);
  if (isDefense(type)) {
    tags.push(cfg.hitsGround && cfg.hitsAir ? ['Ground & air', COLORS.buttonBlue] : cfg.hitsAir ? ['Air only', COLORS.buttonBlue] : ['Ground only', COLORS.button]);
  }
  if (type !== 'townHall') {
    tags.push([`Unlocks at VH${unlockTownHall(type)}`, COLORS.buttonDark]);
    // (Bonus Slot types: up to their cap, more with Village Hall 11's Bonus Slots.)
    tags.push([`Up to ${limitFor(type, CONFIG.rules.maxTownHallLevel)}${type === 'wall' ? ' walls' : takesBonusSlot(type) ? `, more with VH${bonusTownHall()} Bonus Slots` : ''}`, COLORS.buttonDark]);
  }
  const { w, h } = footprintDims(type);
  tags.push([`${w}x${h} tile${w * h === 1 ? '' : 's'}`, COLORS.buttonDark]);
  return tags;
}

export class HowToPlayScene extends Phaser.Scene {
  constructor() {
    super('HowToPlayScene');
  }

  create() {
    const { width, height } = this.scale;
    showTitleBackdrop(this); // the animated title picture (still running from the title screen), drawn under this scene
    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0);

    const g = this.add.graphics();
    const header = 68;
    drawWindow(g, 40, 30, width - 80, height - 60, { header });
    const back = () => this.scene.start('TitleScene');
    this.add.text(width / 2, 34 + header / 2, 'How to Play', textStyle(40)).setOrigin(0.5);
    new Button(this, width - 54, 44, 54, 52, '', back, { color: COLORS.buttonDanger, icon: 'x', radius: 10 });

    // Tabs (green = shown).
    const x0 = width / 2 - (TABS.length * TAB.w + (TABS.length - 1) * TAB.gap) / 2 + TAB.w / 2;
    this.tabButtons = TABS.map((t, i) => new Button(this, x0 + i * (TAB.w + TAB.gap), TAB.y, TAB.w, TAB.h, t.label, () => this.showTab(t.key), { fontSize: 20, radius: 10 }));

    this.page = this.add.container(0, 0); // the shown tab's content, rebuilt on every switch
    this.browsers = {
      buildings: { index: 0, count: BUILDING_ORDER.length, show: (i) => this.showBuilding(i), artMax: false },
      enemies: { index: 0, count: ENEMY_ORDER.length, show: (i) => this.showEnemy(i) }
    };

    new Button(this, width / 2, height - 82, 220, 58, 'Back', back, { color: COLORS.buttonGood, fontSize: 24 });
    this.input.keyboard.once('keydown-ESC', back);
    const step = (d) => {
      const b = this.browsers[this.tab];
      if (b) b.show((b.index + d + b.count) % b.count);
    };
    this.input.keyboard.on('keydown-LEFT', () => step(-1));
    this.input.keyboard.on('keydown-RIGHT', () => step(1));
    this.input.keyboard.on('keydown-UP', () => { if (this.tab === 'enemies') this.stepCategory(-1); });
    this.input.keyboard.on('keydown-DOWN', () => { if (this.tab === 'enemies') this.stepCategory(1); });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => this.input.keyboard.on(`keydown-${k}`, () => this.showTab(TABS[i].key)));

    this.showTab('basics');
  }

  showTab(key) {
    this.tab = key;
    TABS.forEach((t, i) => { this.tabButtons[i].color = t.key === key ? COLORS.buttonGood : COLORS.buttonDark; this.tabButtons[i].redraw(); });
    this.page.removeAll(true);
    this.detail = null;
    if (key === 'basics') this.buildBasics();
    else if (key === 'upgrades') this.buildUpgrades();
    else if (key === 'leagues') this.buildLeagues();
    else this.buildBrowser(key);
  }

  // ---------- shared drawing ----------
  /** A light card with an optional title; returns the y where its body starts. */
  card(x, y, w, h, title = '') {
    const g = this.add.graphics();
    g.fillStyle(COLORS.frame, 0.22).fillRoundedRect(x, y, w, h, 14);
    g.fillStyle(0xf6f1e6, 1).fillRoundedRect(x + 2, y + 2, w - 4, h - 5, 13);
    this.page.add(g);
    if (!title) return y + 14;
    this.page.add(this.add.text(x + 18, y + 12, title, textStyle(22)));
    return y + 50;
  }

  /** Bullet lines at (x, y), wrapped to `w`. Returns the y below them. */
  bullets(x, y, w, lines, size = 15) {
    // Shrink the text (down to 11 px) until every line fits above the bottom of the card.
    for (; size > 11; size--) {
      let h = y;
      for (const line of lines) {
        const probe = this.add.text(0, 0, line, bodyStyle(size, COLORS.ink, { wordWrap: { width: w - 16 }, lineSpacing: 2 }));
        h += probe.height + 8;
        probe.destroy();
      }
      if (h <= CONTENT_BOTTOM - 8) break;
    }
    for (const line of lines) {
      this.page.add(this.add.text(x, y, '•', bodyStyle(size, COLORS.inkAccent, { fontStyle: 'bold' })));
      const t = this.add.text(x + 16, y, line, bodyStyle(size, COLORS.ink, { wordWrap: { width: w - 16 }, lineSpacing: 2 }));
      this.page.add(t);
      y += t.height + 8;
    }
    return y;
  }

  /** Stat tiles in the right column of a browser: STAT_COLS columns of labeled bars from y. */
  statGrid(g, box, stats, y) {
    const L = this.lay, gap = 22, colW = (L.statW - gap * (STAT_COLS - 1)) / STAT_COLS;
    stats.forEach((s, i) => {
      const x = L.statX + (i % STAT_COLS) * (colW + gap), sy = y + Math.floor(i / STAT_COLS) * STAT_ROW;
      const label = this.add.text(x, sy, s.label, bodyStyle(13, COLORS.inkDim));
      const v = this.add.text(x + colW, sy, s.value, bodyStyle(13, COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0);
      if (v.width > colW * 0.62) v.setFontSize(12);
      // Label (left) and value (right) share one line: a long pair shrinks (the value first) so they never touch.
      const room = colW - 8;
      if (label.width + v.width > room) {
        fitWidth(v, Math.max(colW * 0.45, room - label.width));
        fitWidth(label, room - v.displayWidth);
      }
      box.add([label, v]);
      if (s.growth) {
        // Growth bar: the faint part is the top level, the solid part level 1.
        drawStatBar(g, x, sy + 20, colW, 1, s.color);
        g.fillStyle(0x2c261f, 0.55).fillRoundedRect(x + 2, sy + 22, colW - 4, 8, 4);
        g.fillStyle(s.color, 1).fillRoundedRect(x + 2, sy + 22, Math.max(8, (colW - 4) * Math.max(0, Math.min(1, s.frac))), 8, 4);
      } else drawStatBar(g, x, sy + 20, colW, s.frac, s.color);
    });
  }

  /** Tags in a row from (x, y), wrapping inside the right column. Returns the y below them. */
  tagRow(box, x, y, tags) {
    let tx = x, ty = y;
    for (const [label, color] of tags) {
      const probe = this.add.text(0, 0, label, textStyle(14));
      const w = probe.width + 22;
      probe.destroy();
      if (tx + w > RIGHT) { tx = x; ty += 32; }
      tx += drawTag(this, box, tx, ty, label, color, textStyle(14)) + 8;
    }
    return ty + 32;
  }

  // ---------- Leagues ----------
  buildLeagues() {
    const w = RIGHT - LEFT;
    // Where you stand, when you're logged in (the same number the Profile uses).
    const player = session && session.loggedIn;
    const best = player ? session.stats.bestWave || 0 : -1;
    const top = this.card(LEFT, CONTENT_TOP + 4, w, 262, 'Every league');
    addLeagueRow(this, (o) => this.page.add(o), { x: LEFT + 18, y: top + 4, w: w - 36, h: 262 - 62, best, large: true });
    const y = CONTENT_TOP + 4 + 262 + 14;
    const by = this.card(LEFT, y, w, CONTENT_BOTTOM - y, 'How leagues work');
    this.bullets(LEFT + 22, by - 6, w - 44, [
      'Your league comes from the furthest wave you have survived on your account.',
      `Your badge shows on your Profile and on the Leaderboard, which ranks players by furthest wave. There are ${LEAGUES.length} leagues, from Bronze to WarLord.`,
      player ? 'Your Profile (top left of the game) shows how close you are to the next league.' : 'Log in to see your own league and how far you are from the next one.'
    ], 14);
  }

  // ---------- Basics ----------
  buildBasics() {
    const gap = 20, w = (RIGHT - LEFT - gap * 2) / 3, h = CONTENT_BOTTOM - CONTENT_TOP;
    const cols = [
      ['Controls', IS_TOUCH ? [
        'Tap to select, collect, and press buttons.',
        'Drag the map to move it. Pinch with two fingers to zoom.',
        'To build: pick a building in the Shop, drag it where you want it, then tap Place.',
        'Walls: each Place starts the next wall. Walls that touch join up.',
        'Edit button (bottom right): move your buildings around, then press Save.',
        'Profile (top left): your league, achievements and stats.'
      ] : [
        'Left-click to select, collect, build, and press buttons.',
        'Drag the map to move it. Scroll to zoom.',
        'Esc: cancel building, close a window, or pause.',
        'In a wave, the hotbar (bottom middle) holds Brisket Feast, Drop the Beat and your spells: click a slot or press 1-9. A spell then needs a click on the map.',
        'Walls: keep clicking to make a line. Walls that touch join up.',
        'Edit button (bottom right): move your buildings around, then press Save.',
        'Profile (top left): your league, achievements and stats.'
      ]],
      ['Waves, day & night', [
        'Build as long as you like. Press Start Wave to get 30 seconds to get ready. A "!" shows where enemies will come from.',
        `Day turns to night about every 8 minutes. At night, enemies hit ${Math.round((CONFIG.rules.night.damage - 1) * 100)}% harder and move faster, but you earn +${Math.round(CONFIG.rules.night.lootBonus * 100)}% gold and Burgers.`,
        'Each wave is harder than the last. Every 3rd wave is special and pays bonus gold.',
        `You get 1 to 3 stars for how much of your village survives. 3 stars pays +${Math.round(CONFIG.rules.waveStars.bonus[2] * 100)}% gold and Burgers. After a wave, everything destroyed is rebuilt free.`,
        'If your Village Hall falls, you can Retry the wave.'
      ]],
      ['Gold & Burgers', [
        'Bitcoin Mines make gold. Click a mine when its coin shows (not during a wave).',
        'Your Village Hall and Storages decide how much gold you can hold.',
        'Enemies that hit a Storage steal gold from it. Gnomes mine extra gold and repair buildings.',
        'Defeated enemies and achievements pay gold.',
        `Burgers pay for perks, path resets, spells and RV Lab upgrades. Defeated enemies give Burgers, and beating a wave gives ${CONFIG.rules.researchPointsPerWave} x the wave number. Your burger bar has a cap that grows with the RV Lab's level; Burgers beyond it are lost, so spend them.`
      ]]
    ];
    cols.forEach(([title, lines], i) => {
      const x = LEFT + i * (w + gap);
      const y = this.card(x, CONTENT_TOP, w, h, title);
      this.bullets(x + 18, y, w - 36, lines);
    });
  }

  // ---------- Upgrades ----------
  buildUpgrades() {
    const gap = 20, lw = 500, rw = RIGHT - LEFT - lw - gap, h = CONTENT_BOTTOM - CONTENT_TOP;
    // Left: leveling buildings.
    let y = this.card(LEFT, CONTENT_TOP, lw, h, 'Upgrading buildings');
    this.bullets(LEFT + 18, y, lw - 36, [
      'Select a building and press Upgrade. Upgrades are instant and only work by day.',
      'A building cannot be a higher level than your Village Hall.',
      'Each level adds health and power. Buildings get bigger and get new art every few levels.',
      'Upgrading the Village Hall unlocks new buildings and lets you build more of each. But the attacks get harder too.',
      `Village Hall ${bonusTownHall()} adds ${CONFIG.rules.bonusSlots.count} Bonus Slots: each is one more building of any kind past its usual limit, at the normal price. Sell one to free its slot.`,
      'Walls share one level: "Upgrade Walls" raises every wall at once, and new walls are built at that level.',
      `After you beat a wave, destroyed buildings are rebuilt free. During a wave you can Rebuild one early for ${Math.round(CONFIG.rules.rebuildCostShare * 100)}% of its cost.`,
      `Selling gives back ${Math.round(CONFIG.rules.sellRefund * 100)}% of the gold you spent on a building.`
    ]);

    // Right: the RV Lab and abilities, in three numbered steps plus an example.
    const rx = LEFT + lw + gap;
    y = this.card(rx, CONTENT_TOP, rw, h, 'Abilities (RV Lab)');
    const steps = [
      ['Build the RV Lab', `You need Village Hall ${CONFIG.rvlab.unlockTownHall}. Find it in the Shop under Economy. Each RV Lab level opens the next tier, and upgrading it costs Burgers, not gold.`],
      ['Pick a path, then climb it (costs Burgers)', 'Your first pick for a building type locks all of that type to Path A, B or C, and its next tiers are that path\'s. To switch, pay Burgers to reset the path (the old picks are not refunded).'],
      ['Every building gets it', 'Each perk applies to every building of that type at once, whatever its level. Perks cost only Burgers and need only RV Lab level: tier N needs RV Lab level N.']
    ];
    steps.forEach(([title, text], i) => {
      const g = this.add.graphics();
      const cx = rx + 36, cy = y + 16;
      g.fillStyle(COLORS.frame, 1).fillCircle(cx, cy + 1, 17);
      g.fillStyle(COLORS.button, 1).fillCircle(cx, cy, 15);
      this.page.add(g);
      this.page.add(this.add.text(cx, cy, String(i + 1), textStyle(18)).setOrigin(0.5));
      this.page.add(this.add.text(rx + 64, y, title, bodyStyle(16, COLORS.ink, { fontStyle: 'bold' })));
      const t = this.add.text(rx + 64, y + 21, text, bodyStyle(14, COLORS.ink, { wordWrap: { width: rw - 84 }, lineSpacing: 2 }));
      this.page.add(t);
      y += Math.max(44, 21 + t.height) + 12;
    });

    // Example: a Cannon that picked A1, B2, A3, with its pips as they show on the map.
    const ex = this.add.graphics();
    const exH = 92;
    ex.fillStyle(0xe9e1cf, 1).fillRoundedRect(rx + 18, y, rw - 36, exH, 12);
    this.page.add(ex);
    const pic = this.add.image(rx + 64, y + exH - 10, buildingTextureKey(this, 'cannon', 5)).setOrigin(0.5, 1);
    fitIcon(pic, 64, 70);
    this.page.add(pic);
    const picks = ['a', 'b', 'a'];
    const px = rx + 120, py = y + 24, R = 8, GAP = 20;
    ex.fillStyle(0x000000, 0.5).fillRoundedRect(px - 6, py - R - 4, GAP * 5 + 2, R * 2 + 8, R + 4);
    for (let k = 0; k < 5; k++) {
      const cx = px + R + k * GAP;
      const pts = [{ x: cx, y: py - R }, { x: cx + R, y: py }, { x: cx, y: py + R }, { x: cx - R, y: py }];
      if (picks[k]) ex.fillStyle(PATH_COLORS[picks[k]], 1).fillPoints(pts, true);
      ex.lineStyle(1.5, picks[k] ? 0xffffff : 0x8a8a8a, 1).strokePoints(pts, true);
    }
    const name = (p, t) => ABILITIES.cannon[p].tiers[t - 1].name;
    this.page.add(this.add.text(px + GAP * 5 + 14, py, 'Example: a Cannon\'s picks over its level badge', bodyStyle(14, COLORS.inkDim)).setOrigin(0, 0.5));
    this.page.add(this.add.text(px - 6, py + 22, `A1 ${name('a', 1)}  →  B2 ${name('b', 2)}  →  A3 ${name('a', 3)}`, bodyStyle(14, COLORS.ink, { fontStyle: 'bold' })));
    this.page.add(this.add.text(px - 6, py + 46, 'Orange = Path A, blue = Path B, green = Path C, empty = not researched.', bodyStyle(13, COLORS.inkDim)));
    y += exH + 12;
    const c = (list) => list.map(formatGold).join(' / ');
    this.page.add(this.add.text(rx + 20, y, `Research costs ${c(ABILITY_COSTS.research)} Burgers per tier.\nA book floats over the RV Lab when you can research.`, bodyStyle(13, COLORS.inkDim, { lineSpacing: 3 })));
  }

  // ---------- browsers (Buildings / Enemies) ----------
  buildBrowser(key) {
    const isB = key === 'buildings';
    const list = isB ? BUILDING_ORDER : ENEMY_ORDER;
    this.lay = isB ? BUILDING_LAYOUT : ENEMY_LAYOUT;
    this.chips = [];
    this.rosterTiles = [];
    if (isB) {
      this.page.add(this.add.text(LEFT + 4, CONTENT_BOTTOM - 8, 'Click a building above, or use the arrow keys', bodyStyle(13, COLORS.inkDim)).setOrigin(0, 1));
      // One chip per building (green = shown).
      this.chipLayer = this.add.container(0, 0);
      this.page.add(this.chipLayer);
      this.layChips(list.map((item, i) => ({ item, i })), LEFT, RIGHT);
    } else this.buildRoster();
    // The picture card's arrows; the card and details are rebuilt per entry in this.detail.
    this.detail = this.add.container(0, 0);
    this.page.add(this.detail);
    const card = this.lay.card, midY = card.y + card.h / 2;
    const b = this.browsers[key];
    const n = list.length;
    const step = (d) => b.show((b.index + d + n) % n);
    const prev = new Button(this, card.x, midY, 44, 44, '', () => step(-1), { color: COLORS.buttonBlue, circle: true, icon: 'left' });
    const next = new Button(this, card.x + card.w, midY, 44, 44, '', () => step(1), { color: COLORS.buttonBlue, circle: true, icon: 'right' });
    this.page.add([prev, next]);
    b.show(b.index, false);
  }

  /** A row of building chips for `entries` ({ item, i }: i = the entry's index in its browser) from x0 to x1. */
  layChips(entries, x0, x1) {
    this.chipLayer.removeAll(true);
    const n = entries.length;
    const chipW = Math.floor((x1 - x0 - CHIP_GAP * (n - 1)) / n);
    this.chips = entries.map(({ item, i }, k) => {
      const chip = new Button(this, x0 + chipW / 2 + k * (chipW + CHIP_GAP), CHIP_Y, chipW, CHIP_H, '', () => this.browsers.buildings.show(i), { radius: 10 });
      const img = this.add.image(0, -2, buildingTextureKey(this, item, 1));
      fitIcon(img, chipW - 14, CHIP_H - 14);
      chip.add(img);
      chip.itemIndex = i;
      this.chipLayer.add(chip);
      return chip;
    });
  }

  /**
   * Enemies tab: the roster panel. Every enemy as a mini picture card (the same blue card as the big one), in rows
   * under its category's header (a colored marker, the name and how many). The shown one gets a gold frame.
   */
  buildRoster() {
    const R = ROSTER;
    this.card(R.x, R.y, R.w, R.h);
    const g = this.add.graphics();
    this.page.add(g);
    let y = R.y + R.pad;
    for (const cat of ENEMY_CATEGORIES) {
      const color = CATEGORY_COLORS[cat.key] ?? COLORS.buttonDark;
      const x = R.x + R.pad, right = R.x + R.w - R.pad;
      drawGlossy(g, x, y + 3, 14, 18, color, { radius: 4, lip: 2, shadow: false });
      const head = this.add.text(x + 22, y + 12, cat.label, textStyle(17)).setOrigin(0, 0.5);
      const count = this.add.text(right, y + 12, `${cat.kinds.length}`, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(1, 0.5);
      const lx = head.x + head.width + 10;
      g.fillStyle(COLORS.frame, 0.18).fillRect(lx, y + 12, count.x - count.width - 10 - lx, 2);
      this.page.add([head, count]);
      y += R.head;
      cat.kinds.forEach((kind, k) => this.rosterTile(kind, x + k * (R.tileW + R.gap), y));
      y += R.tileH + R.block;
    }
  }

  /** One roster entry at (x, y): mini card + picture; click shows it, hover lifts it. */
  rosterTile(kind, x, y) {
    const R = ROSTER, index = ENEMY_ORDER.indexOf(kind);
    const tile = this.add.container(x + R.tileW / 2, y + R.tileH / 2);
    const g = this.add.graphics();
    drawShowcaseCard(g, -R.tileW / 2, -R.tileH / 2, R.tileW, R.tileH, { tileY: R.tileH / 2 - 12, tileW: 18 });
    const img = this.add.image(0, R.tileH / 2 - 8, enemyKey(kind)).setOrigin(0.5, 1);
    fitIcon(img, R.tileW - 10, R.tileH - 12);
    // The shown enemy's frame: gold, a little outside the card.
    const ring = this.add.graphics();
    ring.lineStyle(4, 0xffd04a, 1).strokeRoundedRect(-R.tileW / 2 - 3, -R.tileH / 2 - 3, R.tileW + 6, R.tileH + 9, 14);
    ring.lineStyle(1.5, COLORS.frame, 0.9).strokeRoundedRect(-R.tileW / 2 - 5.5, -R.tileH / 2 - 5.5, R.tileW + 11, R.tileH + 14, 16);
    ring.setVisible(false);
    tile.add([g, img, ring]);
    tile.setSize(R.tileW, R.tileH + 4).setInteractive({ useHandCursor: true });
    tile.on('pointerover', () => this.tweens.add({ targets: tile, scale: 1.08, duration: 90 }));
    tile.on('pointerout', () => this.tweens.add({ targets: tile, scale: 1, duration: 90 }));
    tile.on('pointerup', () => this.browsers.enemies.show(index));
    tile.itemIndex = index;
    tile.ring = ring;
    this.page.add(tile);
    this.rosterTiles.push(tile);
  }

  /** Up / down in the Enemies tab: the first enemy of the next / previous category. */
  stepCategory(d) {
    const b = this.browsers.enemies;
    const at = ENEMY_CATEGORIES.indexOf(categoryOf(ENEMY_ORDER[b.index]));
    const cat = ENEMY_CATEGORIES[(at + d + ENEMY_CATEGORIES.length) % ENEMY_CATEGORIES.length];
    b.show(ENEMY_ORDER.indexOf(cat.kinds[0]));
  }

  /** Highlight the shown chip and start a fresh detail view. Returns its graphics. */
  beginDetail(index) {
    this.chips.forEach((chip) => { chip.color = chip.itemIndex === index ? COLORS.buttonGood : COLORS.buttonDark; chip.redraw(); });
    this.rosterTiles.forEach((t) => t.ring.setVisible(t.itemIndex === index));
    const p = this.detail;
    p.removeAll(true);
    const g = this.add.graphics();
    p.add(g);
    return g;
  }

  /** Picture card: the picture on the spotlight tile, "n / total", and a strip at the bottom. */
  pictureCard(g, key, index, total, strip, coinStrip, animate) {
    const p = this.detail, CARD = this.lay.card;
    const tileY = CARD.y + CARD.h - 66;
    drawShowcaseCard(g, CARD.x, CARD.y, CARD.w, CARD.h, { tileY, tileW: 64 });
    const pic = this.add.image(CARD.x + CARD.w / 2, tileY + 18, key).setOrigin(0.5, 1);
    const fit = Math.min((CARD.w - 50) / pic.frame.width, 150 / pic.frame.height);
    pic.setScale(fit);
    p.add(pic);
    p.add(this.add.text(CARD.x + 12, CARD.y + 8, `${index + 1} / ${total}`, textStyle(15)));
    drawCardStrip(g, CARD.x + 6, CARD.y + CARD.h - 36, CARD.w - 12);
    const label = this.add.text(0, CARD.y + CARD.h - 22, strip, textStyle(17)).setOrigin(0.5);
    p.add(label);
    if (coinStrip) {
      const coin = this.add.image(0, CARD.y + CARD.h - 21, TEX.coin);
      coin.setScale(24 / coin.frame.height);
      const bw = label.width + 6 + 24;
      label.setX(CARD.x + CARD.w / 2 - bw / 2 + label.width / 2);
      coin.setX(CARD.x + CARD.w / 2 + bw / 2 - 12);
      p.add(coin);
    } else label.setX(CARD.x + CARD.w / 2);
    if (animate) {
      pic.setScale(fit * 0.8);
      this.tweens.add({ targets: pic, scale: fit, duration: 220, ease: 'Back.easeOut' });
    }
    return pic;
  }

  /** Name (shrunk to fit) with a subtitle under it. Returns the y below. */
  nameBlock(name, sub) {
    const p = this.detail, { rx, rw, card } = this.lay;
    const t = this.add.text(rx, card.y - 6, name, textStyle(30));
    if (t.width > rw) t.setStyle(textStyle(Math.floor(30 * rw / t.width)));
    p.add(t);
    let y = t.y + t.height;
    if (sub) {
      const s = this.add.text(rx + 2, y - 2, sub.toUpperCase(), bodyStyle(14, COLORS.inkAccent, { letterSpacing: 2 }));
      p.add(s);
      y = s.y + s.height;
    }
    return y;
  }

  description(text, y) {
    const { rx, rw, descMax } = this.lay;
    const d = this.add.text(rx, y, text || '', bodyStyle(15, COLORS.ink, { wordWrap: { width: rw }, lineSpacing: 3 }));
    // Long descriptions step down in size until they fit their box.
    for (let size = 14; d.height > descMax && size >= 11; size--) d.setFontSize(size).setLineSpacing(1);
    this.detail.add(d);
    return d.y + d.height;
  }

  // ---------- Buildings ----------
  showBuilding(index, animate = true) {
    const b = this.browsers.buildings;
    b.index = index;
    const type = BUILDING_ORDER[index];
    const g = this.beginDetail(index);
    const top = maxLevel(type);
    const level = b.artMax ? top : 1;
    const strip = type === 'townHall' ? 'Your base' : formatGold(buildCost(type));
    this.pictureCard(g, buildingTextureKey(this, type, level), index, BUILDING_ORDER.length, strip, type !== 'townHall', animate);
    if (type === 'altar') this.detail.add(addHeroBadge(this, CARD.x + CARD.w - 30, CARD.y + 32, 42)); // the Brisket King's portrait
    // Level 1 / Max level picture toggle under the card.
    const p = this.detail;
    const tw = (CARD.w - 8) / 2, ty = CARD.y + CARD.h + 26;
    [['Level 1', false], [`Level ${top}`, true]].forEach(([label, max], i) => {
      const btn = new Button(this, CARD.x + tw / 2 + i * (tw + 8), ty, tw, 36, label, () => { b.artMax = max; this.showBuilding(index, false); },
        { fontSize: 15, radius: 9, color: b.artMax === max ? COLORS.buttonGood : COLORS.buttonDark });
      p.add(btn);
    });

    const cfg = typeConfig(type);
    const sub = type === 'townHall' ? 'The heart of your village' : isDefense(type) ? (cfg.trap ? 'Trap' : isSupport(type) ? 'Support tower' : 'Defense') : type === 'wall' ? 'Wall' : type === 'rvlab' ? 'Research' : type === 'altar' ? 'Hero' : type === 'dj' ? 'Utility' : type === 'fuelStation' ? 'Spells' : 'Economy';
    let y = this.nameBlock(buildingName(type), sub);
    y = this.tagRow(p, RX, y + 6, buildingTags(type));
    y = this.description(BUILDING_DESCRIPTIONS[type], y + 4) + 10;

    // Defenses: their two RV Lab ability paths.
    if (ABILITIES[type]) {
      const label = this.add.text(RX, y + 5, 'Ability paths (RV Lab):', bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' }));
      p.add(label);
      let tx = RX + label.width + 10;
      for (const path of PATH_KEYS) {
        tx += drawTag(this, p, tx, y, `${path.toUpperCase()} · ${ABILITIES[type][path].name}`, PATH_COLORS[path], textStyle(14)) + 8;
      }
      y += 36;
    }
    if (type === 'fuelStation') {
      // Its six spells, in even columns: the item's picture, its name and (under it) its effect.
      const colW = RW / SPELL_KINDS.length, textW = colW - 44;
      SPELL_KINDS.forEach((k, i) => {
        const sx = RX + i * colW;
        const icon = addSpellIcon(this, sx + 17, y + 17, k, 36);
        const name = this.add.text(sx + 40, y + 9, spellName(k), bodyStyle(13, COLORS.ink, { fontStyle: 'bold' })).setOrigin(0, 0.5);
        const eff = this.add.text(sx + 40, y + 26, spellEffect(k), bodyStyle(11.5, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0, 0.5);
        for (const t of [name, eff]) fitWidth(t, textW);
        p.add([icon, name, eff]);
      });
      y += 42;
    } else if (type === 'rvlab') {
      p.add(this.add.text(RX, y, `Researches the ability paths of all ${Object.keys(ABILITIES).length} defenses (see the Upgrades tab).`, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })));
      y += 26;
    }
    p.add(this.add.text(RX, y, `Stats: level 1 → level ${top}`, bodyStyle(13, COLORS.inkDim)));
    this.statGrid(g, p, buildingStats(type), Math.min(y + 22, CONTENT_BOTTOM - STAT_ROW * 2 + 6));
  }

  // ---------- Enemies ----------
  showEnemy(index, animate = true) {
    const b = this.browsers.enemies;
    b.index = index;
    const kind = ENEMY_ORDER[index];
    const cfg = CONFIG.enemies[kind];
    const g = this.beginDetail(index);
    const p = this.detail;
    this.pictureCard(g, enemyKey(kind), index, ENEMY_ORDER.length, `Bounty ${cfg.bounty}`, true, animate);

    let y = this.nameBlock(cfg.name, cfg.role);
    const tags = [cfg.type === 'air' ? ['Flying', COLORS.buttonBlue] : ['Ground', COLORS.button]];
    if (cfg.type === 'ranged') tags.push(['Ranged', 0x9b59d0]);
    if (cfg.jumpsWalls) tags.push(['Jumps walls', 0x23a99a]);
    if (cfg.invisibleUntilJump) tags.push(['Invisible', 0x6c7a89]);
    if (cfg.drops) tags.push(['Drops troops', 0xd0583c]);
    if (cfg.boss) tags.push(['Raid boss', 0xb03a2e], ['Rams through walls', 0xc98a12], ['Bursts into troops', 0xd0583c]);
    if (cfg.burrows) tags.push(['Tunnels underground', 0x8f673d], ['F.L.O.C.K sees it', 0x6c7a89]);
    // v0.6 abilities.
    if (cfg.call) tags.push([`Silences F.L.O.C.K Towers (${cfg.call.seconds} s)`, 0xd0583c]);
    if (cfg.summon) tags.push([`Summons ${cfg.summon.count} Skeletons every ${cfg.summon.cooldown} s`, 0xb03a2e]);
    if (cfg.bounce) tags.push(['Ranged', 0x9b59d0], [`Boulders bounce ${cfg.bounce.count}x`, 0xc98a12]);
    if (cfg.missileRadius) tags.push([`Missile strikes (${cfg.missileRadius} tile blast)`, 0xb03a2e]);
    if (cfg.quake) tags.push(['Earthquakes', 0x8f673d], [`${cfg.quake.wallMult}x quake damage to walls`, 0xc98a12]);
    if (cfg.prefers && cfg.preferredDamageMultiplier) tags.push([`${cfg.preferredDamageMultiplier}x vs ${cfg.prefers.includes('wall') ? 'walls' : cfg.prefers.includes('airDefense') ? 'air defenses' : 'gold buildings'}`, 0xc98a12]);
    const fw = firstWave(kind);
    const dropper = cfg.droppedBy && CONFIG.enemies[cfg.droppedBy];
    const bossFrom = cfg.boss && CONFIG.rules.babyCar ? `From Village Hall ${CONFIG.rules.babyCar.fromTownHall}`
      : cfg.fromTownHall ? `From Village Hall ${cfg.fromTownHall}` : null;
    tags.push([dropper ? `From ${dropper.name}s` : bossFrom || (fw ? `From wave ${fw}` : 'Endless waves'), COLORS.buttonDark]);
    y = this.tagRow(p, ENEMY_LAYOUT.rx, y + 6, tags);
    this.description(ENEMY_DESCRIPTIONS[kind], y + 4);

    // Under the card, across the whole detail area: which defenses can hit it (building icons with a green check
    // or red cross; hover shows the name), then the stats.
    y = ENEMY_CARD.y + ENEMY_CARD.h + 16;
    const hits = ATTACKERS.filter((d) => defenseHitsEnemy(d, kind)).length;
    const baseLabel = `Hit by ${hits} of ${ATTACKERS.length} defenses${cfg.invisibleUntilJump ? ' once revealed' : ''}`;
    const hitLabel = this.add.text(DX, y, baseLabel, bodyStyle(14, COLORS.inkDim));
    p.add(hitLabel);
    const iconGap = 8, iconH = 44;
    const iconW = Math.min(72, Math.floor((DW - iconGap * (ATTACKERS.length - 1)) / ATTACKERS.length));
    ATTACKERS.forEach((def, i) => {
      const x = DX + i * (iconW + iconGap), iy = y + 22;
      const ok = defenseHitsEnemy(def, kind);
      drawGlossy(g, x, iy, iconW, iconH, ok ? 0xbfe8a0 : 0xc9c3b8, { radius: 9, lip: 3, shadow: false });
      const icon = this.add.image(x + iconW / 2, iy + iconH / 2 - 1, buildingTextureKey(this, def, 1));
      fitIcon(icon, iconW - 12, iconH - 10);
      if (!ok) { icon.setTint(0x8a8a8a); icon.setAlpha(0.6); }
      const mark = this.add.text(x + iconW - 4, iy + 2, ok ? '✔' : '✘', textStyle(16, ok ? COLORS.textGood : COLORS.textBad)).setOrigin(0.5);
      const zone = this.add.zone(x, iy, iconW, iconH).setOrigin(0).setInteractive();
      zone.on('pointerover', () => hitLabel.setText(`${buildingName(def)}: ${ok ? 'can hit it' : "can't hit it"}`).setColor(ok ? COLORS.inkGood : COLORS.inkBad));
      zone.on('pointerout', () => hitLabel.setText(baseLabel).setColor(COLORS.inkDim));
      p.add([icon, mark, zone]);
    });
    y += 22 + iconH + 16;
    this.statGrid(g, p, enemyStats(cfg), Math.min(y, CONTENT_BOTTOM - STAT_ROW * 2 + 6));
  }
}

