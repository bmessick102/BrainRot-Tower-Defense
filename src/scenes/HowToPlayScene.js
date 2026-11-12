// How to Play: controls and economy basics on the left; an enemy browser on the right
// (picture, description, tags, which defenses can hit it, and stats, all read from config).
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { DEFENSE_TYPES, buildingName, typeConfig } from '../logic/buildings.js';
import { ENEMY_KINDS } from '../logic/enemies.js';
import { formatGold } from '../logic/economy.js';
import { Button } from '../objects/Button.js';
import { buildingTextureKey } from '../objects/BuildingView.js';
import { TEX, enemyKey } from '../assetKeys.js';
import { drawWindow, drawShowcaseCard, drawCardStrip, drawStatBar, drawTag, drawGlossy } from '../objects/uiDraw.js';
import { ENEMY_DESCRIPTIONS } from '../enemyText.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

// Enemy browser layout (right half of the window).
const COL2 = 650, RIGHT = 1218;
const CHIP_Y = 186, CHIP_H = 54, CHIP_GAP = 12;
const CARD = { x: COL2 + 14, y: 230, w: 196, h: 226 };
const RX = CARD.x + CARD.w + 28, RW = RIGHT - RX;
const GRID_BOTTOM = 604; // the last stat bar must end above the Back button (top ~609)
const DESC_MAX_H = 80;   // descriptions taller than ~4 lines drop to a smaller font
const GRID_Y = 482; // leaves room for a four-line description above; last bar still clears the Back button

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
const maxOf = (fn) => Math.max(...ENEMY_KINDS.map((k) => fn(CONFIG.enemies[k])));

function rangeText(cfg) {
  if (cfg.type === 'air' && cfg.attackRange <= 0) return 'Overhead';
  if (cfg.attackRange <= 0.5) return 'Melee';
  return `${cfg.attackRange} tiles`;
}

/** Stat tiles: label, shown value, bar fraction (relative to the strongest enemy), bar color. */
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

/** Longest reach of any enemy: attack range, or blast radius for exploders. */
const maxReach = () => maxOf((c) => Math.max(c.attackRange, c.blastRadius || 0));

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

    const col1 = 80;
    this.add.text(col1, 122, 'Controls', textStyle(26));
    this.add.text(col1, 162, [
      'Left-click  —  select, collect, place, and use buttons',
      'Click and drag the map  —  pan',
      'Scroll wheel  —  zoom',
      'Esc  —  cancel placement or pause',
      'Walls  —  keep clicking to lay a line; they join up'
    ].join('\n'), bodyStyle(17, COLORS.ink, { lineSpacing: 10 }));

    this.add.text(col1, 326, 'Economy', textStyle(26));
    this.add.text(col1, 364, [
      'Bitcoin Mines slowly fill with gold.',
      'Click a mine when its coin appears to collect',
      '(not during a wave).',
      'Your Village Hall and Bitcoin Storage set the most',
      'gold you can hold. Build Storage to hold more.',
      '',
      'Enemies attack every night. Build during the day!',
      'Walls make ground enemies walk around or break through.',
      'Upgrading your Village Hall unlocks buildings,',
      'but each night\'s attack grows with it.'
    ].join('\n'), bodyStyle(17, COLORS.ink, { lineSpacing: 6 }));

    this.buildEnemyBrowser();

    new Button(this, width / 2, height - 82, 220, 58, 'Back', back, { color: COLORS.buttonGood, fontSize: 24 });
    this.input.keyboard.once('keydown-ESC', back);
  }

  // ---------- enemy browser ----------
  buildEnemyBrowser() {
    this.add.text(COL2 + 10, 122, 'Enemies', textStyle(26));
    this.add.text(RIGHT, 136, 'Click an enemy, or use the arrow keys', bodyStyle(13, COLORS.inkDim)).setOrigin(1, 0.5);

    // One chip per enemy (green = shown).
    const n = ENEMY_KINDS.length;
    const chipW = Math.floor((RIGHT - COL2 - CHIP_GAP * (n - 1)) / n);
    this.chips = ENEMY_KINDS.map((kind, i) => {
      const chip = new Button(this, COL2 + chipW / 2 + i * (chipW + CHIP_GAP), CHIP_Y, chipW, CHIP_H, '', () => this.showEnemy(i), { radius: 10 });
      const img = this.add.image(0, -2, enemyKey(kind));
      img.setScale(Math.min((chipW - 20) / img.frame.width, (CHIP_H - 16) / img.frame.height));
      chip.add(img);
      return chip;
    });

    // Profile card frame stays put; its picture, text, and stats are rebuilt per enemy.
    this.profile = this.add.container(0, 0);
    const midY = CARD.y + CARD.h / 2;
    const step = (d) => this.showEnemy((this.enemyIndex + d + n) % n);
    this.prevBtn = new Button(this, CARD.x, midY, 44, 44, '', () => step(-1), { color: COLORS.buttonBlue, circle: true, icon: 'left' });
    this.nextBtn = new Button(this, CARD.x + CARD.w, midY, 44, 44, '', () => step(1), { color: COLORS.buttonBlue, circle: true, icon: 'right' });
    this.prevBtn.setDepth(5);
    this.nextBtn.setDepth(5);
    this.input.keyboard.on('keydown-LEFT', () => step(-1));
    this.input.keyboard.on('keydown-RIGHT', () => step(1));

    this.enemyIndex = 0;
    this.showEnemy(0, false);
  }

  showEnemy(index, animate = true) {
    this.enemyIndex = index;
    const kind = ENEMY_KINDS[index];
    const cfg = CONFIG.enemies[kind];
    this.chips.forEach((chip, i) => { chip.color = i === index ? COLORS.buttonGood : COLORS.buttonDark; chip.redraw(); });

    const p = this.profile;
    p.removeAll(true);
    const g = this.add.graphics();
    p.add(g);

    // Picture card: enemy on the spotlight tile, "n / total" in the corner, bounty strip at the bottom.
    const tileY = CARD.y + CARD.h - 66;
    drawShowcaseCard(g, CARD.x, CARD.y, CARD.w, CARD.h, { tileY, tileW: 60 });
    const pic = this.add.image(CARD.x + CARD.w / 2, tileY + 18, enemyKey(kind)).setOrigin(0.5, 1);
    const fit = Math.min((CARD.w - 56) / pic.frame.width, 140 / pic.frame.height);
    pic.setScale(fit);
    p.add(pic);
    p.add(this.add.text(CARD.x + 12, CARD.y + 8, `${index + 1} / ${ENEMY_KINDS.length}`, textStyle(15)));
    drawCardStrip(g, CARD.x + 6, CARD.y + CARD.h - 36, CARD.w - 12);
    const bounty = this.add.text(0, CARD.y + CARD.h - 22, `Bounty ${cfg.bounty}`, textStyle(18)).setOrigin(0.5);
    const coin = this.add.image(0, CARD.y + CARD.h - 21, TEX.coin);
    coin.setScale(24 / coin.frame.height);
    const bw = bounty.width + 6 + 24;
    bounty.setX(CARD.x + CARD.w / 2 - bw / 2 + bounty.width / 2);
    coin.setX(CARD.x + CARD.w / 2 + bw / 2 - 12);
    p.add([bounty, coin]);

    // Name, tags, description.
    // Long names shrink to fit the column; the enemy's role sits underneath as subtext.
    const name = this.add.text(RX, CARD.y - 4, cfg.name, textStyle(30));
    if (name.width > RW) name.setStyle(textStyle(Math.floor(30 * RW / name.width)));
    p.add(name);
    let nameBottom = name.y + name.height;
    if (cfg.role) {
      const role = this.add.text(RX + 2, nameBottom - 2, cfg.role.toUpperCase(), bodyStyle(14, COLORS.inkAccent, { letterSpacing: 2 }));
      p.add(role);
      nameBottom = role.y + role.height;
    }
    const tags = [cfg.type === 'air' ? ['Flying', COLORS.buttonBlue] : ['Ground', COLORS.button]];
    if (cfg.type === 'ranged') tags.push(['Ranged', 0x9b59d0]);
    if (cfg.jumpsWalls) tags.push(['Jumps walls', 0x23a99a]);
    if (cfg.invisibleUntilJump) tags.push(['Invisible', 0x6c7a89]);
    if (cfg.drops) tags.push(['Drops troops', 0xd0583c]);
    if (cfg.prefers && cfg.preferredDamageMultiplier) tags.push([`${cfg.preferredDamageMultiplier}x vs ${cfg.prefers.includes('wall') ? 'walls' : cfg.prefers.includes('airDefense') ? 'air defenses' : 'gold buildings'}`, 0xc98a12]);
    const fw = firstWave(kind);
    const dropper = cfg.droppedBy && CONFIG.enemies[cfg.droppedBy];
    tags.push([dropper ? `From ${dropper.name}s` : fw ? `From wave ${fw}` : 'Endless waves', COLORS.buttonDark]);
    let tx = RX, ty = nameBottom + 6;
    for (const [label, color] of tags) {
      const probe = this.add.text(0, 0, label, textStyle(14));
      const w = probe.width + 22;
      probe.destroy();
      if (tx + w > RIGHT) { tx = RX; ty += 32; }
      tx += drawTag(this, p, tx, ty, label, color, textStyle(14)) + 8;
    }
    const desc = this.add.text(RX, ty + 34, ENEMY_DESCRIPTIONS[kind] || '', bodyStyle(15, COLORS.ink, { wordWrap: { width: RW }, lineSpacing: 3 }));
    if (desc.height > DESC_MAX_H) desc.setFontSize(14).setLineSpacing(1); // long descriptions tighten up
    p.add(desc);

    // Which defenses can hit it: building icons with a green check or red cross. Hover shows the name.
    const hitY = desc.y + desc.height + 12;
    const hits = ATTACKERS.filter((d) => defenseHitsEnemy(d, kind)).length;
    const baseLabel = `Hit by ${hits} of ${ATTACKERS.length} defenses${cfg.invisibleUntilJump ? ' once revealed' : ''}`;
    const hitLabel = this.add.text(RX, hitY, baseLabel, bodyStyle(14, COLORS.inkDim));
    p.add(hitLabel);
    const iconW = Math.min(58, Math.floor((RW - 8 * (ATTACKERS.length - 1)) / ATTACKERS.length)), iconH = 44;
    ATTACKERS.forEach((def, i) => {
      const x = RX + i * (iconW + 8), y = hitY + 22;
      const ok = defenseHitsEnemy(def, kind);
      drawGlossy(g, x, y, iconW, iconH, ok ? 0xbfe8a0 : 0xc9c3b8, { radius: 9, lip: 3, shadow: false });
      const icon = this.add.image(x + iconW / 2, y + iconH / 2 - 1, buildingTextureKey(this, def, 1));
      icon.setScale(Math.min((iconW - 12) / icon.frame.width, (iconH - 10) / icon.frame.height));
      if (!ok) { icon.setTint(0x8a8a8a); icon.setAlpha(0.6); }
      const mark = this.add.text(x + iconW - 4, y + 2, ok ? '✔' : '✘', textStyle(16, ok ? COLORS.textGood : COLORS.textBad)).setOrigin(0.5);
      const zone = this.add.zone(x, y, iconW, iconH).setOrigin(0).setInteractive();
      zone.on('pointerover', () => hitLabel.setText(`${buildingName(def)}: ${ok ? 'can hit it' : "can't hit it"}`).setColor(ok ? COLORS.inkGood : COLORS.inkBad));
      zone.on('pointerout', () => hitLabel.setText(baseLabel).setColor(COLORS.inkDim));
      p.add([icon, mark, zone]);
    });

    // Stats grid: two columns of labeled bars. It starts below the defense icons (lower for long
    // descriptions) and tightens its rows so the last bar still clears the Back button.
    const iconsBottom = hitY + 22 + iconH;
    const gridY = Math.max(GRID_Y, iconsBottom + 10);
    const rowGap = Math.min(40, Math.floor((GRID_BOTTOM - 32 - gridY) / 2));
    const colW = (RIGHT - COL2 - 30) / 2;
    enemyStats(cfg).forEach((s, i) => {
      const x = COL2 + 10 + (i % 2) * (colW + 20), y = gridY + Math.floor(i / 2) * rowGap;
      p.add(this.add.text(x, y, s.label, bodyStyle(14, COLORS.inkDim)));
      p.add(this.add.text(x + colW, y, s.value, bodyStyle(14)).setOrigin(1, 0));
      drawStatBar(g, x, y + 20, colW, s.frac, s.color);
    });

    if (animate) {
      pic.setScale(fit * 0.8);
      this.tweens.add({ targets: pic, scale: fit, duration: 220, ease: 'Back.easeOut' });
    }
  }
}
