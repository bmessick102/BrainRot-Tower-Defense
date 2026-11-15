// How to Play, in four tabs:
//   Basics    - controls, waves and the day/night cycle, gold.
//   Buildings - a browser for every building: picture (level 1 or max), what it is, where it unlocks, its
//               ability paths, and how its stats grow from level 1 to max (all read from config).
//   Upgrades  - leveling buildings and the Village Hall, rebuilding / selling, and the RV Lab abilities
//               (build the lab -> research one pick per tier, which every building of that type gets).
//   Enemies   - a browser for every enemy: picture, description, tags, which defenses can hit it, and stats.
// Arrow keys browse the Buildings / Enemies lists; 1-4 switch tabs; Esc goes back to the title.
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { IS_TOUCH } from '../device.js';
import {
  DEFENSE_TYPES, buildingName, typeConfig, maxLevel, levelStats, limitFor, unlockTownHall, footprintDims, buildCost,
  totalSpent, isDefense, isSupport
} from '../logic/buildings.js';
import { ENEMY_KINDS } from '../logic/enemies.js';
import { formatGold } from '../logic/economy.js';
import { ABILITIES, ABILITY_COSTS, ABILITY_LEVEL_REQ, PATH_COLORS, PATH_KEYS } from '../abilityConfig.js';
import { Button } from '../objects/Button.js';
import { buildingTextureKey } from '../objects/BuildingView.js';
import { TEX, enemyKey } from '../assetKeys.js';
import { drawWindow, drawShowcaseCard, drawCardStrip, drawStatBar, drawTag, drawGlossy } from '../objects/uiDraw.js';
import { ENEMY_DESCRIPTIONS } from '../enemyText.js';
import { BUILDING_DESCRIPTIONS } from '../buildingText.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

// ---------- layout ----------
const TABS = [
  { key: 'basics', label: 'Basics' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'upgrades', label: 'Upgrades' },
  { key: 'enemies', label: 'Enemies' }
];
const TAB = { y: 134, w: 200, h: 44, gap: 14 };
const LEFT = 76, RIGHT = 1204;                 // content edges
const CONTENT_TOP = 174, CONTENT_BOTTOM = 600; // the Back button's top is ~609
// Browsers (Buildings / Enemies): a row of chips, a picture card on the left, details on the right.
const CHIP_Y = 200, CHIP_H = 50, CHIP_GAP = 8;
const CARD = { x: 96, y: 246, w: 216, h: 248 };
const RX = CARD.x + CARD.w + 40, RW = RIGHT - RX;
const DESC_MAX_H = 66; // descriptions taller than ~3 lines drop to a smaller font
const STAT_COLS = 3, STAT_ROW = 40;

// Buildings in the order a player meets them: the base, economy, walls, then defenses and traps.
const BUILDING_ORDER = ['townHall', 'mine', 'storage', 'house', 'rvlab', 'dj', 'wall', 'cannon', 'archer', 'mortar', 'wizard', 'firework', 'flock', 'catapult', 'ra', 'mousetrap', 'altar'];

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
  } else if (type === 'dj') {
    out.push(grow(type, 'Range', 'range', 0x4cd6ff, ' tiles'));
    out.push(grow(type, 'Gnome work speed', 'gnomeBoostPct', 0xffc93c, '%'));
    out.push(grow(type, 'Drop the Beat fire rate', 'beatPct', 0xff6b3d, '%'));
    out.push(grow(type, 'Drop the Beat length', 'beatSeconds', 0xc070ff, ' s'));
  } else if (type === 'rvlab') {
    out.push(fixed('Tiers it researches', `1 → ${top}`, 1, 0xff9a3c));
    out.push(fixed('Village Hall needed', `${levelStats('rvlab', 1).townHall} → ${levelStats('rvlab', top).townHall}`, 1, 0x3cb8ff));
  } else if (type === 'wall') {
    out.push(fixed('Cost per wall', formatGold(buildCost('wall')), 0.1, 0xffc93c));
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
  else if (type === 'dj') tags.push(['Utility', 0x9b59d0], ['Click to Drop the Beat', 0xc070ff]);
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
    tags.push([`Up to ${limitFor(type, CONFIG.rules.maxTownHallLevel)}${type === 'wall' ? ' walls' : ''}`, COLORS.buttonDark]);
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
    const bg = this.add.image(width / 2, height / 2, TEX.titleBackground);
    bg.setScale(Math.max(width / bg.frame.width, height / bg.frame.height));
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
      enemies: { index: 0, count: ENEMY_KINDS.length, show: (i) => this.showEnemy(i) }
    };

    new Button(this, width / 2, height - 82, 220, 58, 'Back', back, { color: COLORS.buttonGood, fontSize: 24 });
    this.input.keyboard.once('keydown-ESC', back);
    const step = (d) => {
      const b = this.browsers[this.tab];
      if (b) b.show((b.index + d + b.count) % b.count);
    };
    this.input.keyboard.on('keydown-LEFT', () => step(-1));
    this.input.keyboard.on('keydown-RIGHT', () => step(1));
    ['ONE', 'TWO', 'THREE', 'FOUR'].forEach((k, i) => this.input.keyboard.on(`keydown-${k}`, () => this.showTab(TABS[i].key)));

    this.showTab('basics');
  }

  showTab(key) {
    this.tab = key;
    TABS.forEach((t, i) => { this.tabButtons[i].color = t.key === key ? COLORS.buttonGood : COLORS.buttonDark; this.tabButtons[i].redraw(); });
    this.page.removeAll(true);
    this.detail = null;
    if (key === 'basics') this.buildBasics();
    else if (key === 'upgrades') this.buildUpgrades();
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
    const gap = 22, colW = (RW - gap * (STAT_COLS - 1)) / STAT_COLS;
    stats.forEach((s, i) => {
      const x = RX + (i % STAT_COLS) * (colW + gap), sy = y + Math.floor(i / STAT_COLS) * STAT_ROW;
      box.add(this.add.text(x, sy, s.label, bodyStyle(13, COLORS.inkDim)));
      const v = this.add.text(x + colW, sy, s.value, bodyStyle(13, COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0);
      if (v.width > colW * 0.62) v.setFontSize(12);
      box.add(v);
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

  // ---------- Basics ----------
  buildBasics() {
    const gap = 20, w = (RIGHT - LEFT - gap * 2) / 3, h = CONTENT_BOTTOM - CONTENT_TOP;
    const cols = [
      ['Controls', IS_TOUCH ? [
        'Tap: select, collect, and press buttons.',
        'Drag the map to pan; pinch with two fingers to zoom.',
        'Placing: drag the see-through building where you want it (or tap a spot), then tap Place or tap it again.',
        'Walls: each Place starts the next one right after it. Touching walls join up.',
        'Edit button (bottom right): rearrange your village. Pick buildings up (or Remove All) into the hotbar, place them again, slide the whole layout with the Shift arrows, then Save.',
        'Profile (top left): your league, rank, achievements and stats.'
      ] : [
        'Left-click: select, collect, place, and press buttons.',
        'Drag the map to pan; scroll to zoom.',
        'Esc: cancel placing, close a window, or pause.',
        'Walls: keep clicking to lay a line. Touching walls join up.',
        'Edit button (bottom right): rearrange your village. Pick buildings up (or Remove All) into the hotbar, place them again, slide the whole layout with the Shift arrows, then Save.',
        'Profile (top left): your league, rank, achievements and stats.'
      ]],
      ['Waves, day & night', [
        'Build between waves as long as you like. Start Wave sends enemies from the flashing paths right away.',
        `Day and night cycle on their own (~8 min; clock under your gold). Attacks in the dark are restless: enemies hit ${Math.round((CONFIG.rules.night.damage - 1) * 100)}% harder and move faster, but pay +${Math.round(CONFIG.rules.night.lootBonus * 100)}% gold and RP.`,
        'Each wave is tougher than the last. Every 3rd is special (Air Raid, Siege...): the top bar warns you, and it pays bonus gold.',
        `Waves are rated 1-3 stars by how much of your village survives; 3 stars pays +${Math.round(CONFIG.rules.waveStars.bonus[2] * 100)}% gold and RP. Everything destroyed is rebuilt free after.`,
        'If the Village Hall falls, Retry rewinds to before that wave. Waves that drag on too long get enraged.'
      ]],
      ['Gold & research points', [
        'Bitcoin Mines fill with gold. Click a mine when its coin shows (not during a wave).',
        'The Village Hall and Storage set the most gold you can hold. Build Storage to hold more.',
        'Enemies that hit a Storage steal gold from it. Gnomes mine extra gold between waves and repair during attacks.',
        'Defeated enemies pay a gold bounty. Achievements pay gold too: claim them from your Profile.',
        `Research points (RP, under your gold) pay for research in the RV Lab. Every defeated enemy gives some (tougher ones more), and beating a wave gives ${CONFIG.rules.researchPointsPerWave} x the wave number.`
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
      'Select a building and press Upgrade. Upgrades are instant, by day only.',
      'A building can\'t be a higher level than your Village Hall.',
      'Every level adds health and power. Buildings grow, and get new art every few levels.',
      'Upgrading the Village Hall unlocks new buildings, lets you build more of each and hold more gold, but brings bigger attacks with new enemy types.',
      'Walls: "Select all" upgrades a whole connected stretch at once.',
      `Everything destroyed in a wave is rebuilt free once you beat it. During a wave you can Rebuild a building early for ${Math.round(CONFIG.rules.rebuildCostShare * 100)}% of its level's cost.`,
      `Selling returns ${Math.round(CONFIG.rules.sellRefund * 100)}% of the gold spent on a building.`
    ]);

    // Right: the RV Lab and abilities, in three numbered steps plus an example.
    const rx = LEFT + lw + gap;
    y = this.card(rx, CONTENT_TOP, rw, h, 'Abilities (RV Lab)');
    const req = ABILITY_LEVEL_REQ.default.join(' / ');
    const steps = [
      ['Build the RV Lab', `Village Hall ${CONFIG.rvlab.unlockTownHall}, Shop → Economy. Each RV Lab level unlocks the next tier (level N needs Village Hall N+${levelStats('rvlab', 1).townHall - 1}).`],
      ['Research one pick per tier (costs RP)', 'In the RV Lab (or a building\'s Abilities button), pick Path A\'s, B\'s or C\'s option at each tier, in any mix (A1, B2, A3...). Picks are final. Defenses and economy buildings (Mine, Storage, House, DJ) each have a tab.'],
      ['Every building gets it', `No buying: each pick goes straight onto every building of that type. Tiers 1-5 work on buildings at level ${req}; lower ones get them as they level up.`]
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
    pic.setScale(Math.min(64 / pic.frame.width, 70 / pic.frame.height));
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
    this.page.add(this.add.text(px + GAP * 5 + 14, py, 'Example: a Cannon\'s tiers over its level badge', bodyStyle(14, COLORS.inkDim)).setOrigin(0, 0.5));
    this.page.add(this.add.text(px - 6, py + 22, `A1 ${name('a', 1)}  →  B2 ${name('b', 2)}  →  A3 ${name('a', 3)}`, bodyStyle(14, COLORS.ink, { fontStyle: 'bold' })));
    this.page.add(this.add.text(px - 6, py + 46, 'Orange = Path A, blue = Path B, green = Path C, empty = not researched (or level too low).', bodyStyle(13, COLORS.inkDim)));
    y += exH + 12;
    const c = (list) => list.map(formatGold).join(' / ');
    this.page.add(this.add.text(rx + 20, y, `Research, per tier: ${c(ABILITY_COSTS.research)} RP, once for every building\nof that type. A book bobs over the RV Lab when you can research.`, bodyStyle(13, COLORS.inkDim, { lineSpacing: 3 })));
  }

  // ---------- browsers (Buildings / Enemies) ----------
  buildBrowser(key) {
    const isB = key === 'buildings';
    const list = isB ? BUILDING_ORDER : ENEMY_KINDS;
    this.page.add(this.add.text(LEFT + 4, CONTENT_BOTTOM - 8, `Click ${isB ? 'a building' : 'an enemy'} above, or use the arrow keys`, bodyStyle(13, COLORS.inkDim)).setOrigin(0, 1));
    // One chip per entry (green = shown).
    const n = list.length;
    const chipW = Math.floor((RIGHT - LEFT - CHIP_GAP * (n - 1)) / n);
    this.chips = list.map((item, i) => {
      const chip = new Button(this, LEFT + chipW / 2 + i * (chipW + CHIP_GAP), CHIP_Y, chipW, CHIP_H, '', () => this.browsers[key].show(i), { radius: 10 });
      const img = this.add.image(0, -2, isB ? buildingTextureKey(this, item, 1) : enemyKey(item));
      img.setScale(Math.min((chipW - 14) / img.frame.width, (CHIP_H - 14) / img.frame.height));
      chip.add(img);
      this.page.add(chip);
      return chip;
    });
    // The picture card's arrows; the card and details are rebuilt per entry in this.detail.
    this.detail = this.add.container(0, 0);
    this.page.add(this.detail);
    const midY = CARD.y + CARD.h / 2;
    const b = this.browsers[key];
    const step = (d) => b.show((b.index + d + n) % n);
    const prev = new Button(this, CARD.x, midY, 44, 44, '', () => step(-1), { color: COLORS.buttonBlue, circle: true, icon: 'left' });
    const next = new Button(this, CARD.x + CARD.w, midY, 44, 44, '', () => step(1), { color: COLORS.buttonBlue, circle: true, icon: 'right' });
    this.page.add([prev, next]);
    b.show(b.index, false);
  }

  /** Highlight the shown chip and start a fresh detail view. Returns its graphics. */
  beginDetail(index) {
    this.chips.forEach((chip, i) => { chip.color = i === index ? COLORS.buttonGood : COLORS.buttonDark; chip.redraw(); });
    const p = this.detail;
    p.removeAll(true);
    const g = this.add.graphics();
    p.add(g);
    return g;
  }

  /** Picture card: the picture on the spotlight tile, "n / total", and a strip at the bottom. */
  pictureCard(g, key, index, total, strip, coinStrip, animate) {
    const p = this.detail;
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
    const p = this.detail;
    const t = this.add.text(RX, CARD.y - 6, name, textStyle(30));
    if (t.width > RW) t.setStyle(textStyle(Math.floor(30 * RW / t.width)));
    p.add(t);
    let y = t.y + t.height;
    if (sub) {
      const s = this.add.text(RX + 2, y - 2, sub.toUpperCase(), bodyStyle(14, COLORS.inkAccent, { letterSpacing: 2 }));
      p.add(s);
      y = s.y + s.height;
    }
    return y;
  }

  description(text, y) {
    const d = this.add.text(RX, y, text || '', bodyStyle(15, COLORS.ink, { wordWrap: { width: RW }, lineSpacing: 3 }));
    if (d.height > DESC_MAX_H) d.setFontSize(14).setLineSpacing(1); // long descriptions tighten up
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
    // Level 1 / Max level picture toggle under the card.
    const p = this.detail;
    const tw = (CARD.w - 8) / 2, ty = CARD.y + CARD.h + 26;
    [['Level 1', false], [`Level ${top}`, true]].forEach(([label, max], i) => {
      const btn = new Button(this, CARD.x + tw / 2 + i * (tw + 8), ty, tw, 36, label, () => { b.artMax = max; this.showBuilding(index, false); },
        { fontSize: 15, radius: 9, color: b.artMax === max ? COLORS.buttonGood : COLORS.buttonDark });
      p.add(btn);
    });

    const cfg = typeConfig(type);
    const sub = type === 'townHall' ? 'The heart of your village' : isDefense(type) ? (cfg.trap ? 'Trap' : isSupport(type) ? 'Support tower' : 'Defense') : type === 'wall' ? 'Wall' : type === 'rvlab' ? 'Research' : type === 'altar' ? 'Hero' : type === 'dj' ? 'Utility' : 'Economy';
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
    const kind = ENEMY_KINDS[index];
    const cfg = CONFIG.enemies[kind];
    const g = this.beginDetail(index);
    const p = this.detail;
    this.pictureCard(g, enemyKey(kind), index, ENEMY_KINDS.length, `Bounty ${cfg.bounty}`, true, animate);

    let y = this.nameBlock(cfg.name, cfg.role);
    const tags = [cfg.type === 'air' ? ['Flying', COLORS.buttonBlue] : ['Ground', COLORS.button]];
    if (cfg.type === 'ranged') tags.push(['Ranged', 0x9b59d0]);
    if (cfg.jumpsWalls) tags.push(['Jumps walls', 0x23a99a]);
    if (cfg.invisibleUntilJump) tags.push(['Invisible', 0x6c7a89]);
    if (cfg.drops) tags.push(['Drops troops', 0xd0583c]);
    if (cfg.boss) tags.push(['Raid boss', 0xb03a2e], ['Rams through walls', 0xc98a12], ['Bursts into troops', 0xd0583c]);
    if (cfg.burrows) tags.push(['Tunnels underground', 0x8f673d], ['F.L.O.C.K sees it', 0x6c7a89]);
    if (cfg.prefers && cfg.preferredDamageMultiplier) tags.push([`${cfg.preferredDamageMultiplier}x vs ${cfg.prefers.includes('wall') ? 'walls' : cfg.prefers.includes('airDefense') ? 'air defenses' : 'gold buildings'}`, 0xc98a12]);
    const fw = firstWave(kind);
    const dropper = cfg.droppedBy && CONFIG.enemies[cfg.droppedBy];
    const bossFrom = cfg.boss && CONFIG.rules.babyCar ? `From Village Hall ${CONFIG.rules.babyCar.fromTownHall}`
      : cfg.fromTownHall ? `From Village Hall ${cfg.fromTownHall}` : null;
    tags.push([dropper ? `From ${dropper.name}s` : bossFrom || (fw ? `From wave ${fw}` : 'Endless waves'), COLORS.buttonDark]);
    y = this.tagRow(p, RX, y + 6, tags);
    y = this.description(ENEMY_DESCRIPTIONS[kind], y + 4) + 10;

    // Which defenses can hit it: building icons with a green check or red cross. Hover shows the name.
    const hits = ATTACKERS.filter((d) => defenseHitsEnemy(d, kind)).length;
    const baseLabel = `Hit by ${hits} of ${ATTACKERS.length} defenses${cfg.invisibleUntilJump ? ' once revealed' : ''}`;
    const hitLabel = this.add.text(RX, y, baseLabel, bodyStyle(14, COLORS.inkDim));
    p.add(hitLabel);
    const iconW = 58, iconH = 44;
    ATTACKERS.forEach((def, i) => {
      const x = RX + i * (iconW + 8), iy = y + 22;
      const ok = defenseHitsEnemy(def, kind);
      drawGlossy(g, x, iy, iconW, iconH, ok ? 0xbfe8a0 : 0xc9c3b8, { radius: 9, lip: 3, shadow: false });
      const icon = this.add.image(x + iconW / 2, iy + iconH / 2 - 1, buildingTextureKey(this, def, 1));
      icon.setScale(Math.min((iconW - 12) / icon.frame.width, (iconH - 10) / icon.frame.height));
      if (!ok) { icon.setTint(0x8a8a8a); icon.setAlpha(0.6); }
      const mark = this.add.text(x + iconW - 4, iy + 2, ok ? '✔' : '✘', textStyle(16, ok ? COLORS.textGood : COLORS.textBad)).setOrigin(0.5);
      const zone = this.add.zone(x, iy, iconW, iconH).setOrigin(0).setInteractive();
      zone.on('pointerover', () => hitLabel.setText(`${buildingName(def)}: ${ok ? 'can hit it' : "can't hit it"}`).setColor(ok ? COLORS.inkGood : COLORS.inkBad));
      zone.on('pointerout', () => hitLabel.setText(baseLabel).setColor(COLORS.inkDim));
      p.add([icon, mark, zone]);
    });
    y += 22 + iconH + 14;
    this.statGrid(g, p, enemyStats(cfg), Math.min(y, CONTENT_BOTTOM - STAT_ROW * 2 + 6));
  }
}

