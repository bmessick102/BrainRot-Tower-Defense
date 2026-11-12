// HUD overlay: gold, wave status, pause, shop, building info panel, banners, tutorial guide.
// Runs in parallel with GameScene. Text only changes in response to GameState events.
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import {
  DEFENSE_TYPES, ECONOMY_TYPES, WALL_TYPES, buildableCount, buildCost, buildingName, checkBuy, checkUpgrade, countOwned, isDefense,
  levelStats, limitFor, maxHp, maxLevel, typeConfig, footprintDims, wallGroup, planWallGroupUpgrade
} from '../logic/buildings.js';
import { checkRepair, formatGold, repairCost, hallIncomeRate } from '../logic/economy.js';
import { enemiesLeft, nightWaveNumber } from '../logic/waves.js';
import { isClockRunning, secondsUntilDusk, earlyCallSkip, earlyCallBonus } from '../logic/dayNight.js';
import {
  canSkipTutorial, currentStep, goldNeeded, isGuideVisible, isWaitingForGold, tutorialAllows
} from '../logic/tutorial.js';
import { isWaveActive } from '../logic/util.js';
import { gnomeStats, gnomeTier } from '../logic/villagers.js';
import { Button } from '../objects/Button.js';
import { ResourceBar, formatSpaced } from '../objects/ResourceBar.js';
import { drawWindow, drawGlossy, drawHudPill, drawRibbon, drawBadge, drawShowcaseCard, drawCardStrip } from '../objects/uiDraw.js';
import { BUILDING_DESCRIPTIONS } from '../buildingText.js';
import { buildingTextureKey } from '../objects/BuildingView.js';
import { TEX, SFX } from '../assetKeys.js';
import { playSfx } from '../audio.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { achievementById } from '../logic/achievements.js';
import { LEAGUES } from '../logic/leagues.js';

// Shop window: slate header (title + category tabs), recessed card tray, green gold strip.
const SHOP_W = 1100;
const SHOP_H = 330;
const SHOP_HEADER = 58;
const SHOP_OPEN_Y = 720 - SHOP_H - 10;
const SHOP_CLOSED_Y = 740;
const TRAY = { x: 14, y: 72, h: 206 };
const CARD_Y = TRAY.y + 6;
const CARD_H = TRAY.h - 12;
const FOOTER = { y: 286, h: 34 };
// Corner fog: a few drifting cloud puffs in each screen corner, always on, under the HUD.
const FOG = { color: 0xe4ecf2, alpha: 0.5, puffsPerCorner: 3, scale: [1.9, 2.6], drift: [25, 55], period: [7000, 11000] };

// Traps (hidden, like the Mousetrap) get their own tab; they're still defenses in the game rules.
const TRAP_TYPES = DEFENSE_TYPES.filter((t) => CONFIG.defenses[t].trap);
const SHOP_TABS = [
  { key: 'defenses', label: 'Defenses', types: DEFENSE_TYPES.filter((t) => !TRAP_TYPES.includes(t)) },
  { key: 'traps', label: 'Traps', types: TRAP_TYPES },
  { key: 'economy', label: 'Economy', types: ECONOMY_TYPES },
  { key: 'walls', label: 'Walls', types: WALL_TYPES }
];

// Quick bar: a compact strip along the bottom, right-aligned just left of the Edit / Shop buttons.
// Centered on the same line as the Edit button (y 650), about its height.
const QB = { y: 650 - 40, h: 80, right: 1004, btnH: 52, upgradeW: 200, groupW: 112, infoW: 74 };

const INFO_W = 440;
const INFO_X = 1280 - 16 - INFO_W;
const INFO_Y = 92; // below the gold bar; tall enough panels still clear the Settings icon
const INFO_HEADER = 62;
const INFO_TABS_Y = 90; // Info / Stats tab buttons
// Building picture card on the left; the tabs and their content sit in the column to its right.
const PIC = { x: 18, w: 128, h: 150 };
const INFO_PIC_Y = INFO_HEADER + 12;
const INFO_COL = PIC.x + PIC.w + 16;
const INFO_COL_W = INFO_W - INFO_COL - 18;
const SHOP_INFO_W = 480;
const INFO_BTN_H = 48; // keeps the tallest panel (Upgrade + Sell + Repair) clear of the Settings icon
const BANNER_MS = 2500;
const EARLY_W = 150; // "Start Wave" button beside the wave pill
const EARLY_GAP = 10;

export class UIScene extends Phaser.Scene {
  constructor() {
    super('UIScene');
  }

  create() {
    this.gs = this.registry.get('gameState');
    this.world = this.scene.get('GameScene');
    this.shopOpen = false;
    this.shopTab = 'defenses';
    this.selectedId = null;
    this.placementActive = false;

    this.buildFog(); // first, so every HUD element draws over it
    this.buildGold();
    this.buildWave();
    this.buildPauseButton();
    this.buildShop();
    this.buildShopButton();
    this.buildShopBadge();
    this.buildEditButton();
    this.buildRotateButton();
    this.buildInfo();
    this.buildQuickBar();
    this.buildGuide();
    this.buildBanner();
    this.focusGfx = this.add.graphics().setDepth(900);

    this.subscribe();
    this.refreshAll();
    const pending = this.registry.get('pendingBanner');
    if (pending) { this.registry.set('pendingBanner', null); this.time.delayedCall(300, () => this.showBanner(pending)); }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.gs.offContext(this));
  }

  update(time) {
    this.drawFocus(time);
    if (this.selectedId && this.infoPanel.visible) this.syncInfoPic();
    if (this.quickBar && this.quickBar.visible) this.quickBar.setY(this.quickBarY()); // follows the guide opening / closing
  }

  /** GameScene asks this before treating a click as a map click. */
  isPointerOverUI(pointer) {
    return this.input.hitTestPointer(pointer).length > 0;
  }

  // ---------- gold ----------
  buildFog() {
    const { width: W, height: H } = this.scale;
    const R = Phaser.Math;
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const sx = cx ? -1 : 1; // direction into the screen
      const sy = cy ? -1 : 1;
      for (let i = 0; i < FOG.puffsPerCorner; i++) {
        const x = cx + sx * R.Between(0, 110);
        const y = cy + sy * R.Between(0, 70);
        const scale = R.FloatBetween(FOG.scale[0], FOG.scale[1]);
        const alpha = FOG.alpha * (1 - i * 0.18);
        const puff = this.add.image(x, y, TEX.fog).setTint(FOG.color).setAlpha(alpha).setScale(scale)
          .setRotation(R.FloatBetween(0, Math.PI * 2)).setDepth(-100);
        // Slow drift in and out of the corner, swelling and thinning a little as it goes.
        this.tweens.add({
          targets: puff,
          x: x + sx * R.Between(FOG.drift[0], FOG.drift[1]),
          y: y + sy * R.Between(FOG.drift[0], FOG.drift[1]) * 0.6,
          scale: scale * 1.12,
          alpha: alpha * 0.75,
          rotation: puff.rotation + R.FloatBetween(-0.25, 0.25),
          duration: R.Between(FOG.period[0], FOG.period[1]),
          delay: R.Between(0, 3000),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    }
  }

  buildGold() {
    // Top right: the coin's right edge sits ~18 px from the screen edge.
    this.goldBar = new ResourceBar(this, 1280 - 18 - 32 - 270, 34, 270, 36, TEX.coin);
    const r = this.goldBar.bounds();
    this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setInteractive();
  }

  refreshGold() {
    this.goldBar.setValue(this.gs.gold, this.gs.capacity);
  }

  // ---------- wave status ----------
  buildWave() {
    this.waveBg = this.add.graphics();
    this.waveText = this.add.text(640, 39, '', textStyle(22)).setOrigin(0.5);
    // "Start Wave" sits right of the pill: day -> countdown now, countdown -> wave now, for bonus gold.
    this.earlyBtn = new Button(this, 0, 39, EARLY_W, 46, 'Start Wave', () => this.gs.callWaveEarly(),
      { color: COLORS.buttonGood, fontSize: 18, radius: 12 });
  }

  /** m:ss */
  static clockText(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  refreshWave() {
    const w = this.gs.wave;
    let text = '';
    if (w.phase === 'countdown') text = `Night falls · Wave ${w.number} in ${Math.max(0, Math.ceil(w.countdown))}s`;
    else if (w.phase === 'active') text = `Wave ${w.number} · ${enemiesLeft(this.gs)} enemies left${w.enraged ? ' · Enraged!' : ''}`;
    else if (this.gs.tutorialDone && this.gs.townHall && this.gs.townHall.level === 0) text = 'Rebuild your Village Hall to begin';
    else if (isClockRunning(this.gs)) {
      const left = secondsUntilDusk(this.gs.clock);
      if (left !== null) text = `Nightfall in ${UIScene.clockText(left)} · Wave ${nightWaveNumber(this.gs)}`;
    }
    this.waveText.setText(text);
    this.waveBg.clear();

    const canCall = earlyCallSkip(this.gs) !== null;
    const bonus = canCall ? earlyCallBonus(this.gs) : 0;
    this.earlyBtn.setVisible(canCall);
    if (!text) { this.earlyBtn.setY(-500); return; }
    // Center the pill (+ button, when shown) as one group.
    const tw = this.waveText.width + 48;
    const group = tw + (canCall ? EARLY_GAP + EARLY_W : 0);
    const left = 640 - group / 2;
    this.waveText.setX(left + tw / 2);
    drawHudPill(this.waveBg, left, 18, tw, 42);
    if (canCall) {
      this.earlyBtn.setPosition(left + tw + EARLY_GAP + EARLY_W / 2, 39);
      this.earlyBtn.setLabel('Start Wave', bonus > 0 ? `+${formatGold(bonus)} gold` : '');
    } else {
      this.earlyBtn.setY(-500);
    }
  }

  // ---------- pause ----------
  buildPauseButton() {
    // Bottom right, just above the Shop icon.
    const img = this.add.image(1198, 516, TEX.settingsButton);
    const s = 72 / img.frame.height;
    img.setScale(s).setInteractive({ useHandCursor: true });
    img.on('pointerover', () => img.setScale(s * 1.06));
    img.on('pointerout', () => img.setScale(s));
    img.on('pointerdown', () => { playSfx(this, SFX.uiClick); this.world.openPause(); });
  }

  // ---------- shop ----------
  buildShopButton() {
    const img = this.add.image(1198, 630, TEX.shopButton);
    const s = 140 / img.frame.height;
    img.setScale(s).setInteractive({ useHandCursor: true });
    img.on('pointerover', () => { if (this.shopButtonEnabled()) img.setScale(s * 1.06); });
    img.on('pointerout', () => img.setScale(s));
    img.on('pointerdown', () => {
      if (!this.shopButtonEnabled() && !this.shopOpen) return;
      playSfx(this, SFX.uiClick);
      this.toggleShop();
    });
    this.shopButton = img;
  }

  /** Red notification bubble on the Shop icon: buildings + wall segments still allowed at this Town Hall level. */
  buildShopBadge() {
    const b = this.shopButton.getBounds();
    const x = b.right - 18, y = b.top + 18;
    this.badge = this.add.container(x, y).setDepth(600);
    const circle = this.add.graphics();
    drawBadge(circle, 0, 0, 16);
    this.badgeText = this.add.text(0, 0, '', textStyle(17)).setOrigin(0.5);
    this.badge.add([circle, this.badgeText]);
    this.badgeCount = -1;
    this.badge.setVisible(false);
  }

  refreshShopBadge() {
    const n = buildableCount(this.gs);
    if (n === this.badgeCount) return;
    const grew = n > this.badgeCount && this.badgeCount >= 0;
    this.badgeCount = n;
    this.badge.setVisible(n > 0);
    this.badgeText.setText(n > 99 ? '99+' : String(n));
    if (grew) {
      this.tweens.killTweensOf(this.badge);
      this.badge.setScale(1.5);
      this.tweens.add({ targets: this.badge, scale: 1, duration: 320, ease: 'Back.easeOut' });
    }
  }

  shopButtonEnabled() {
    return !isWaveActive(this.gs) && tutorialAllows(this.gs, 'shop');
  }

  refreshShopButton() {
    this.shopButton.setAlpha(this.shopButtonEnabled() || this.shopOpen ? 1 : 0.4);
  }

  // ---------- edit mode ----------
  /** "Rotate (R)" button, shown while a wall is being placed or moved. */
  buildRotateButton() {
    this.rotateBtn = new Button(this, 640, 628, 170, 46, 'Rotate (R)', () => this.world.rotatePlacement(), { fontSize: 18 });
    this.rotateBtn.setDepth(650);
    this.showRotate(false);
  }

  showRotate(show) {
    this.rotateBtn.setVisible(show).setY(show ? 628 : -500);
  }

  buildEditButton() {
    const img = this.add.image(1062, 650, TEX.editButton);
    const s = 96 / img.frame.height;
    img.setScale(s).setInteractive({ useHandCursor: true });
    img.on('pointerover', () => { if (this.world.canEdit()) img.setScale(s * 1.06); });
    img.on('pointerout', () => img.setScale(this.world.editMode ? s * 1.1 : s));
    img.on('pointerdown', () => {
      if (!this.world.editMode && !this.world.canEdit()) return;
      playSfx(this, SFX.uiClick);
      this.closeShop();
      this.world.setEditMode(!this.world.editMode);
    });
    this.editButton = img;
    this.editButtonScale = s;
    this.editGlow = this.add.graphics();

    // Hint shown while edit mode is on.
    this.editHintBg = this.add.graphics().setVisible(false);
    this.editHint = this.add.text(640, 689, 'Edit mode: click a building to move it  ·  Esc or Edit to finish', textStyle(18)).setOrigin(0.5).setVisible(false);
  }

  refreshEditButton() {
    const on = this.world.editMode;
    const usable = on || this.world.canEdit();
    this.editButton.setAlpha(usable ? 1 : 0.4);
    this.editButton.setScale(this.editButtonScale * (on ? 1.1 : 1));
    this.editGlow.clear();
    if (on) {
      const b = this.editButton.getBounds();
      this.editGlow.lineStyle(4, 0xffe066, 1).strokeRoundedRect(b.x - 4, b.y - 4, b.width + 8, b.height + 8, 16);
    }
    this.editHint.setVisible(on);
    this.editHintBg.setVisible(on).clear();
    if (on) drawHudPill(this.editHintBg, 640 - this.editHint.width / 2 - 24, 668, this.editHint.width + 48, 42);
  }

  buildShop() {
    const c = this.add.container(16, SHOP_CLOSED_Y).setDepth(500);
    const bg = this.add.graphics();
    drawWindow(bg, 0, 0, SHOP_W, SHOP_H, { header: SHOP_HEADER });
    // Recessed tray behind the cards.
    const t = { ...TRAY, w: SHOP_W - TRAY.x * 2 };
    bg.fillStyle(COLORS.frame, 0.25).fillRoundedRect(t.x, t.y, t.w, t.h, 12);
    bg.fillStyle(COLORS.tray, 1).fillRoundedRect(t.x + 2, t.y + 3, t.w - 4, t.h - 5, 11);
    // Green gold strip along the bottom.
    drawGlossy(bg, TRAY.x, FOOTER.y, SHOP_W - TRAY.x * 2, FOOTER.h, COLORS.footer, { radius: 10, lip: 3, shadow: false });
    const blocker = this.add.zone(0, 0, SHOP_W, SHOP_H).setOrigin(0).setInteractive();
    const headerMid = 4 + SHOP_HEADER / 2;
    const title = this.add.text(26, headerMid, 'Build', textStyle(32)).setOrigin(0, 0.5);
    c.add([bg, blocker, title]);

    // Category tabs (green = selected) with a red count of what's still buildable in each.
    this.tabButtons = {};
    this.tabBadges = {};
    const tabW = 150, tabH = 40, tabX0 = 150;
    SHOP_TABS.forEach((tab, i) => {
      const cx = tabX0 + tabW / 2 + i * (tabW + 16);
      const btn = new Button(this, cx, headerMid, tabW, tabH, tab.label, () => this.setShopTab(tab.key), { fontSize: 19, radius: 10 });
      const badge = this.add.container(cx + tabW / 2 - 6, headerMid - tabH / 2 + 4);
      const bgfx = this.add.graphics();
      drawBadge(bgfx, 0, 0, 12);
      const txt = this.add.text(0, 0, '', textStyle(14)).setOrigin(0.5);
      badge.add([bgfx, txt]);
      badge.text = txt;
      this.tabButtons[tab.key] = btn;
      this.tabBadges[tab.key] = badge;
      c.add([btn, badge]);
    });
    const close = new Button(this, SHOP_W - 18, 16, 48, 46, '', () => this.closeShop(), { color: COLORS.buttonDanger, icon: 'x', radius: 10 });
    c.add(close);

    this.cardLayer = this.add.container(0, 0);
    c.add(this.cardLayer);

    // Footer: hint on the left, gold / capacity in a dark pill in the middle.
    const fy = FOOTER.y + FOOTER.h / 2 - 2;
    c.add(this.add.text(TRAY.x + 18, fy, 'Pick a building, then click the map to place it', textStyle(15)).setOrigin(0, 0.5));
    this.footerPill = this.add.graphics();
    this.footerGold = this.add.text(0, fy, '', textStyle(18)).setOrigin(1, 0.5);
    this.footerCoin = this.add.image(0, fy, TEX.coin);
    this.footerCoin.setScale(30 / this.footerCoin.frame.height);
    c.add([this.footerPill, this.footerGold, this.footerCoin]);
    this.shopPanel = c;
  }

  refreshShopFooter() {
    const fy = FOOTER.y + FOOTER.h / 2 - 2;
    this.footerGold.setText(`${formatSpaced(this.gs.gold)} / ${formatSpaced(this.gs.capacity)}`);
    const w = this.footerGold.width + 56, right = SHOP_W - TRAY.x - 40;
    this.footerPill.clear().fillStyle(0x000000, 0.4).fillRoundedRect(right - w, fy - 13, w, 26, 13);
    this.footerCoin.setX(right - 4);
    this.footerGold.setX(right - 26);
  }

  /** How many more of this tab's buildings the Village Hall level still allows. */
  tabBuildable(types) {
    const th = this.gs.townHallLevel;
    return types.reduce((n, t) => n + Math.max(0, limitFor(t, th) - countOwned(this.gs.buildings, t)), 0);
  }

  setShopTab(tab) {
    this.shopTab = tab;
    this.refreshShop();
  }

  toggleShop() {
    if (this.shopOpen) this.closeShop();
    else this.openShop();
  }

  openShop() {
    if (!this.shopButtonEnabled()) return;
    if (this.world.editMode) this.world.setEditMode(false);
    if (this.world.placement) this.world.cancelPlacement();
    if (this.selectedId) this.world.select(null);
    this.shopOpen = true;
    this.gs.tutorialEvent('shopOpened');
    // Tutorial: jump to the tab with the building the guide asks for (after the step advanced).
    const step = currentStep(this.gs);
    if (step && step.allow && Array.isArray(step.allow.cards) && step.allow.cards.length) {
      this.shopTab = (SHOP_TABS.find((t) => t.types.includes(step.allow.cards[0])) || SHOP_TABS[0]).key;
    }
    this.refreshShop();
    this.tweens.killTweensOf(this.shopPanel);
    this.tweens.add({ targets: this.shopPanel, y: SHOP_OPEN_Y, duration: 220, ease: 'Cubic.easeOut' });
    this.refreshGuide();
    this.refreshShopButton();
  }

  closeShop() {
    this.hideShopInfo();
    if (!this.shopOpen) return;
    this.shopOpen = false;
    this.tweens.killTweensOf(this.shopPanel);
    this.tweens.add({ targets: this.shopPanel, y: SHOP_CLOSED_Y, duration: 180, ease: 'Cubic.easeIn' });
    this.refreshGuide();
    this.refreshShopButton();
  }

  /** Card state: { ok, reason } including tutorial restrictions. */
  cardState(type) {
    const r = checkBuy(this.gs, type);
    if (r.ok && !tutorialAllows(this.gs, 'card', type)) return { ok: false, reason: 'Follow the guide' };
    return r;
  }

  refreshShop() {
    for (const tab of SHOP_TABS) {
      const btn = this.tabButtons[tab.key];
      btn.color = tab.key === this.shopTab ? COLORS.buttonGood : COLORS.buttonDark;
      btn.redraw();
      const n = this.tabBuildable(tab.types);
      const badge = this.tabBadges[tab.key];
      badge.setVisible(n > 0);
      badge.text.setText(n > 99 ? '99+' : String(n));
    }
    this.refreshShopFooter();
    this.cardLayer.removeAll(true);
    const types = SHOP_TABS.find((t) => t.key === this.shopTab).types;
    // Cards shrink to fit when a tab has more of them (Defenses has 5); short tabs line up on the left.
    const gap = 12, x0 = TRAY.x + 8;
    const cw = Math.min(214, Math.floor((SHOP_W - x0 * 2 - gap * (types.length - 1)) / types.length));
    types.forEach((type, i) => {
      this.cardLayer.add(this.makeCard(type, x0 + i * (cw + gap), CARD_Y, cw, CARD_H));
    });
  }

  /** Short trait line for the bottom-left of a shop card. */
  cardTrait(type) {
    if (type === 'flock') return 'Reveals & marks';
    if (type === 'mousetrap') return 'Hidden trap';
    if (type === 'ra') return 'Beam · Ground & Air';
    if (isDefense(type)) {
      const cfg = typeConfig(type);
      return cfg.hitsGround && cfg.hitsAir ? 'Ground & Air' : cfg.hitsAir ? 'Air only' : 'Ground only';
    }
    if (type === 'mine') return `+${levelStats('mine', 1).production} / s`;
    if (type === 'storage') return `Holds ${formatGold(levelStats('storage', 1).capacity)}`;
    if (type === 'house') return `+${levelStats('house', 1).gnomes} gnome workers`;
    if (type === 'wall') return CONFIG.walls.segmentLength > 1 ? `${CONFIG.walls.segmentLength}-tile segment` : 'Joins any wall';
    return '';
  }

  /** Text shown across a locked card, or '' when the card only lacks gold (or is buyable). */
  lockedText(reason) {
    const vh = /^Requires VH(\d+)/.exec(reason || '');
    if (vh) return `Village Hall ${vh[1]}\nrequired`;
    return reason || '';
  }

  makeCard(type, x, y, w, h) {
    const st = this.cardState(type);
    const th = this.gs.townHallLevel;
    const short = !st.ok && /^Need /.test(st.reason); // only short on gold: stays blue, price turns red
    const locked = !st.ok && !short;
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    // Gradient card with a spotlight and a diamond tile for the building to stand on.
    const cx = w / 2, tileY = h - 66, thh = Math.min(64, w * 0.32) / 2;
    drawShowcaseCard(g, 0, 0, w, h, { locked, tileY });

    const icon = this.add.image(cx, tileY + thh * 0.6, buildingTextureKey(this, type, 1)).setOrigin(0.5, 1);
    icon.setScale(Math.min((w - 46) / icon.frame.width, 96 / icon.frame.height));
    if (locked) { icon.setTint(0x9a9a9a); icon.setAlpha(0.55); }

    // Name top-left (wraps short of the info button).
    const name = this.add.text(10, 7, buildingName(type), textStyle(w < 200 ? 16 : 17, COLORS.text, { wordWrap: { width: w - 44 } }));
    // Bottom row: trait on the left, "Built: n/max" on the right.
    const rowY = h - 40;
    const trait = this.add.text(10, rowY, this.cardTrait(type), textStyle(13)).setOrigin(0, 1);
    const builtLabel = this.add.text(w - 10, rowY - 17, type === 'wall' ? 'Walls:' : 'Built:', textStyle(11)).setOrigin(1, 1);
    const built = this.add.text(w - 10, rowY + 1, `${countOwned(this.gs.buildings, type)}/${limitFor(type, th)}`, textStyle(16)).setOrigin(1, 1);
    // Narrow cards (a full Defenses tab): shrink the trait line so it never runs into the Built count.
    const room = w - 10 - Math.max(built.width, builtLabel.width) - 6 - 10;
    if (trait.width > room) trait.setScale(Math.max(0.6, room / trait.width));
    drawCardStrip(g, 6, h - 36, w - 12);
    const cost = this.add.text(0, h - 22, formatGold(buildCost(type)), textStyle(20, short ? COLORS.textBad : COLORS.text)).setOrigin(0.5);
    const coin = this.add.image(0, h - 21, TEX.coin);
    coin.setScale(24 / coin.frame.height);
    const pw = cost.width + 6 + 24;
    cost.setX(w / 2 - pw / 2 + cost.width / 2);
    coin.setX(w / 2 + pw / 2 - 12);
    card.add([g, icon, name, trait, builtLabel, built, cost, coin]);
    if (locked) {
      card.add(this.add.text(cx, tileY - 34, this.lockedText(st.reason), textStyle(16, COLORS.text, { align: 'center', wordWrap: { width: w - 20 } })).setOrigin(0.5));
    }

    // Hover brightens buyable cards.
    const hover = this.add.graphics().setVisible(false);
    hover.fillStyle(0xffffff, 0.16).fillRoundedRect(3, 3, w - 6, h - 6, 10);
    card.add(hover);
    const zone = this.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: st.ok });
    zone.on('pointerover', () => hover.setVisible(this.cardState(type).ok));
    zone.on('pointerout', () => hover.setVisible(false));
    zone.on('pointerdown', () => {
      if (!this.cardState(type).ok) return;
      playSfx(this, SFX.uiClick);
      this.closeShop();
      this.world.beginPlacement(type);
    });
    card.add(zone);
    const info = new Button(this, w - 18, 18, 28, 28, 'i', () => this.showShopInfo(type), { fontSize: 17, color: COLORS.buttonBlue, circle: true });
    card.add(info);
    card.cardType = type;
    card.cardW = w;
    card.cardH = h;
    return card;
  }

  // ---------- shop info popup (the "i" on each shop card) ----------
  /** Name, unlock and limits, description, and Level 1 stat bars for a building type, above the shop. */
  showShopInfo(type) {
    this.hideShopInfo();
    const W = SHOP_INFO_W, x = 650, header = 50; // x: just right of the guide bubble
    const c = this.add.container(x, 0).setDepth(560);
    const bg = this.add.graphics();
    const blocker = this.add.zone(0, 0, W, 10).setOrigin(0).setInteractive();
    c.add([bg, blocker]);
    c.add(this.add.text(18, 4 + header / 2, buildingName(type), textStyle(22)).setOrigin(0, 0.5));
    const th = this.gs.townHallLevel;
    const unlock = typeConfig(type).unlockTownHall ?? 1;
    const limitNow = limitFor(type, th);
    const allowed = th < unlock ? `Unlocks at VH${unlock}` : `${type === 'wall' ? 'Walls' : 'Built'} ${countOwned(this.gs.buildings, type)} / ${limitNow} at VH${th}`;
    c.add(this.add.text(18, header + 16, `Cost ${formatGold(buildCost(type))} · ${allowed}`, bodyStyle(14, COLORS.inkAccent)));
    const desc = this.add.text(18, header + 40, BUILDING_DESCRIPTIONS[type] || '', bodyStyle(14, COLORS.ink, { wordWrap: { width: W - 36 }, lineSpacing: 3 }));
    c.add(desc);
    const top = desc.y + desc.height + 14;
    // Level 1 picture on the left (labelled on the card, which saves a title row), Level 1 stats beside it.
    const picG = this.add.graphics();
    c.add(picG);
    c.add(this.drawBuildingPic(picG, PIC.x, top, buildingTextureKey(this, type, 1)));
    c.add(this.add.text(PIC.x + 10, top + 6, 'Level 1', textStyle(15)));
    const col = PIC.x + PIC.w + 16;
    const preview = { type, level: 1, hp: levelStats(type, 1).hp, destroyed: false, stock: 0, ...footprintDims(type) };
    let y = Math.max(this.drawStats(c, preview, col, top, W - col - 18, true), top + PIC.h) + 14;
    const close = new Button(this, W - 10, 10, 40, 40, '', () => this.hideShopInfo(), { color: COLORS.buttonDanger, icon: 'x', radius: 9 });
    c.add(close);
    drawWindow(bg, 0, 0, W, y, { header });
    blocker.setSize(W, y);
    c.setY(SHOP_OPEN_Y - y - 8);
    this.shopInfo = c;
  }

  hideShopInfo() {
    if (this.shopInfo) { this.shopInfo.destroy(); this.shopInfo = null; }
  }

  /**
   * Shop-style picture card (blue gradient, spotlight, diamond tile) drawn into g at (x, y), PIC-sized.
   * Returns the building image standing on the tile; pass `image` to reuse an existing one.
   */
  drawBuildingPic(g, x, y, key, image = null) {
    const tileY = y + PIC.h - 36, tileW = 60;
    drawShowcaseCard(g, x, y, PIC.w, PIC.h, { tileY, tileW });
    const pic = (image || this.add.image(0, 0, key)).setTexture(key).setOrigin(0.5, 1);
    pic.setPosition(x + PIC.w / 2, tileY + tileW * 0.3);
    pic.setScale(Math.min((PIC.w - 24) / pic.frame.width, (PIC.h - 44) / pic.frame.height));
    return pic;
  }

  // ---------- building info panel ----------
  // Header (name, level, close) + Info / Stats tabs + the action buttons (Upgrade, Sell, Repair).
  buildInfo() {
    const c = this.add.container(INFO_X, INFO_Y).setDepth(400);
    this.infoBg = this.add.graphics();
    this.infoBlocker = this.add.zone(0, 0, INFO_W, 400).setOrigin(0).setInteractive();
    this.infoName = this.add.text(18, 10, '', textStyle(22));
    this.infoLevel = this.add.text(18, 38, '', textStyle(15, COLORS.textGold));
    this.infoContent = this.add.container(0, 0); // rebuilt on every refresh
    this.infoPicBg = this.add.graphics();
    this.infoPic = this.drawBuildingPic(this.infoPicBg, PIC.x, INFO_PIC_Y, TEX.coin);
    this.infoPicKey = null;
    this.infoTab = 'info';
    const tabW = (INFO_COL_W - 8) / 2;
    this.infoTabs = {
      info: new Button(this, INFO_COL + tabW / 2, INFO_TABS_Y, tabW, 32, 'Info', () => { this.infoTab = 'info'; this.refreshInfo(); }, { fontSize: 17, radius: 9 }),
      stats: new Button(this, INFO_COL + tabW * 1.5 + 8, INFO_TABS_Y, tabW, 32, 'Stats', () => { this.infoTab = 'stats'; this.refreshInfo(); }, { fontSize: 17, radius: 9 })
    };
    const bw = INFO_W - 32;
    this.infoButtons = {
      upgrade: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Upgrade', () => this.onUpgrade(), { color: COLORS.buttonGood, fontSize: 19 }),
      sell: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Sell', () => this.gs.sellBuilding(this.selectedId), { color: COLORS.buttonDanger, fontSize: 19 }),
      repair: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Repair', () => this.gs.repair(this.selectedId), { color: COLORS.buttonGood, fontSize: 19 }),
      // Walls: switch to (or back from) the whole connected group of same-level walls.
      group: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Select connected walls', () => this.world.setGroupMode(!this.groupMode), { color: COLORS.buttonBlue, fontSize: 19 })
    };
    const close = new Button(this, INFO_W - 12, 12, 42, 40, '', () => this.world.select(null), { color: COLORS.buttonDanger, icon: 'x', radius: 9 });
    c.add([this.infoBg, this.infoBlocker, this.infoName, this.infoLevel, this.infoPicBg, this.infoPic, this.infoContent,
      ...Object.values(this.infoTabs), ...Object.values(this.infoButtons), close]);
    this.infoPanel = c;
    this.hideInfo();
  }

  /**
   * Info panel picture: the same art the map shows (current level, or this building's rubble when
   * destroyed). Checked every frame too, because the map swaps its sprite a frame after the state changes.
   */
  syncInfoPic(b = this.gs.getBuilding(this.selectedId)) {
    if (!b) return;
    const view = this.world.views && this.world.views.buildings.get(b.id);
    const picKey = view && view.sprite ? view.sprite.texture.key : buildingTextureKey(this, b.type, b.level, b.destroyed);
    if (picKey === this.infoPicKey) return;
    this.infoPicKey = picKey;
    this.infoPicBg.clear();
    this.drawBuildingPic(this.infoPicBg, PIC.x, INFO_PIC_Y, picKey, this.infoPic);
  }

  hideInfo() {
    this.infoPanel.setVisible(false).setX(2000);
  }

  onUpgrade() {
    const b = this.gs.getBuilding(this.selectedId);
    if (!b) return;
    if (this.groupMode && b.type === 'wall') this.gs.upgradeWallGroup(b.id);
    else this.gs.upgradeBuilding(b.id);
  }

  /**
   * Stat bars for the Stats tab. Each bar is full at the building's top level; `next` is the value
   * after the next upgrade (drawn as a lighter segment). `current` (HP only) dims what's been lost.
   */
  statRows(b) {
    const levels = typeConfig(b.type).levels;
    const top = levels[levels.length - 1];
    const lvl = levelStats(b.type, b.level);
    const nxt = b.level < maxLevel(b.type) ? levelStats(b.type, b.level + 1) : null;
    const row = (label, key, color, opts = {}) => ({
      label, color,
      value: lvl[key], max: top[key], next: nxt ? nxt[key] : null,
      unit: opts.unit || '', current: opts.current, fmt: opts.fmt
    });
    const rows = [row('HP', 'hp', 0x4cd137, { current: b.destroyed ? 0 : b.hp })];
    if (b.type === 'ra') {
      rows.push(row('Beam damage', 'dps', 0xff6b3d, { unit: ' / s' }));
      return rows;
    }
    if (b.type === 'mousetrap') {
      rows.push(row('Damage', 'damage', 0xff6b3d));
      rows.push(row('Hold time', 'hold', 0xffc93c, { unit: ' s', fmt: (v) => String(v) }));
      return rows;
    }
    if (b.type === 'flock') {
      rows.push(row('Range', 'range', 0x4cd6ff, { unit: ' tiles', fmt: (v) => String(v) }));
      rows.push(row('Marked damage bonus', 'markBonus', 0xff6b3d, { unit: '%' }));
    } else if (isDefense(b.type)) rows.push(row(b.type === 'catapult' ? 'Impact damage' : 'Damage', 'damage', 0xff6b3d));
    if (b.type === 'catapult') rows.push(row('Pool damage', 'poolDps', 0xff4fa3, { unit: ' / s' }));
    if (b.type === 'mine') {
      rows.push(row('Production', 'production', 0xffc93c, { unit: ' / s' }));
      rows.push(row('Stock capacity', 'stockCap', 0x3cb8ff));
    }
    if (b.type === 'storage' || b.type === 'townHall') rows.push(row('Gold capacity', 'capacity', 0xffc93c));
    if (b.type === 'house') rows.push(row('Gnomes', 'gnomes', 0xe85d4a));
    return rows;
  }

  /** Fixed facts shown as text under the bars. */
  statNotes(b, preview = false) {
    if (b.type === 'ra') {
      const cfg = CONFIG.defenses.ra;
      const heat = cfg.stages.slice(1).map((s) => `x${s.mult} after ${s.after} s`).join(', ');
      return [`Range ${cfg.range} tiles · hits ground & air`, 'Locks onto the toughest enemy in range', `Heats up on one enemy: ${heat}`];
    }
    if (b.type === 'mousetrap') {
      const r = CONFIG.defenses.mousetrap.range;
      return ['Hidden: enemies never target it and walk over it', `Snaps on every ground enemy within ${r} tiles`,
        b.sprung && !preview ? 'Sprung: resets when the wave ends' : 'Once per wave · resets after'];
    }
    if (b.type === 'flock') {
      return ['Never attacks: marks every enemy in range (ground & air)', 'Reveals invisible enemies in range',
        "Towers don't stack: the strongest bonus applies"];
    }
    if (isDefense(b.type)) {
      const cfg = typeConfig(b.type);
      const tiles = (n) => `${n} tile${n === 1 ? '' : 's'}`;
      const notes = [`Range ${tiles(cfg.range)}${cfg.minRange ? ` (not within ${cfg.minRange})` : ''}`, `Fires every ${cfg.fireInterval} s`];
      notes.push(`Hits ${cfg.hitsGround && cfg.hitsAir ? 'ground & air' : cfg.hitsAir ? 'air only' : 'ground only'}${cfg.splashRadius ? ` · splash ${tiles(cfg.splashRadius)}` : ''}`);
      if (cfg.pool) notes.push(`Pink pool ${tiles(cfg.pool.radius * 2)} wide for ${cfg.pool.duration} s · slows ${Math.round(cfg.pool.slow * 100)}%`);
      return notes;
    }
    const V = CONFIG.villagers;
    const pct = (f) => `${Math.round(f * 1000) / 10}%`; // 0.025 -> 2.5%
    if (b.type === 'house') {
      const gs = gnomeStats(b.level);
      return [`Gnome level ${gnomeTier(b.level)}. By day: each mines +${pct(gs.mine)} of a mine's rate and carries it to storage (${V.maxPerMine} per mine)`,
        `In attacks: each repairs ${pct(gs.repair)} of a building's HP per second`];
    }
    if (b.type === 'mine' && preview) return [];
    if (b.type === 'mine') {
      const crew = (this.gs._gnomes ? [...this.gs._gnomes.values()] : []).filter((g) => g.task === 'mine' && g.targetId === b.id);
      const extra = crew.reduce((sum, g) => sum + gnomeStats(g.level).mine, 0);
      return [`Stock now ${formatGold(b.stock || 0)} / ${formatGold(levelStats('mine', b.level).stockCap)}`,
        `Gnome workers: ${crew.length} / ${V.maxPerMine} (+${pct(extra)} carried to storage)`];
    }
    if (b.type === 'wall') return [CONFIG.walls.segmentLength > 1 ? `Segment of ${CONFIG.walls.segmentLength} tiles` : 'Joins every wall it touches'];
    if (b.type === 'townHall') {
      const rate = hallIncomeRate(b.level);
      return [`Tonight's attack: wave ${nightWaveNumber(this.gs)}`, ...(rate > 0 ? [`Makes ${rate} gold / s on its own`] : [])];
    }
    return [];
  }

  /** Draw the Info or Stats tab body starting at y; returns the y below it. */
  drawInfoContent(b, y) {
    const box = this.infoContent;
    box.removeAll(true);
    if (this.infoTab === 'info') {
      const t = this.add.text(INFO_COL, y, BUILDING_DESCRIPTIONS[b.type] || '', bodyStyle(15, COLORS.ink, { wordWrap: { width: INFO_COL_W }, lineSpacing: 3 }));
      box.add(t);
      return y + t.height + 12;
    }
    return this.drawStats(box, b, INFO_COL, y, INFO_COL_W) + 8;
  }

  /** Stat bars + notes for building b into container box at (x, y), `width` wide. Returns the y below. */
  drawStats(box, b, x, y, width, preview = false) {
    const g = this.add.graphics();
    box.add(g);
    for (const r of this.statRows(b)) {
      box.add(this.add.text(x, y, r.label, bodyStyle(14, COLORS.inkDim)));
      const fmt = r.fmt || formatGold;
      const valueText = r.current !== undefined && !preview ? `${fmt(r.current)} / ${fmt(r.value)}` : `${fmt(r.value)}${r.unit}`;
      const v = this.add.text(x + width, y, valueText, bodyStyle(14)).setOrigin(1, 0);
      box.add(v);
      if (r.next !== null && r.next !== r.value) {
        box.add(this.add.text(v.x - v.width - 4, y, `+${fmt(Math.round((r.next - r.value) * 100) / 100)}`, bodyStyle(13, COLORS.inkGood)).setOrigin(1, 0));
      }
      const by = y + 20, bh = 12;
      const frac = (n) => Math.max(0, Math.min(1, n / r.max));
      g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, by, width, bh, bh / 2);
      g.fillStyle(0x2c261f, 1).fillRoundedRect(x + 2, by + 2, width - 4, bh - 4, (bh - 4) / 2);
      const iw = width - 4, seg = (f, color, a) => { if (f > 0) g.fillStyle(color, a).fillRoundedRect(x + 2, by + 2, Math.max(bh - 4, iw * f), bh - 4, (bh - 4) / 2); };
      if (r.next !== null) seg(frac(r.next), r.color, 0.35);              // next upgrade
      seg(frac(r.value), r.color, 0.5);                                   // this level
      const shown = r.current !== undefined ? r.current : r.value;
      seg(frac(shown), r.color, 1);                                       // current
      if (frac(shown) > 0) g.fillStyle(0xffffff, 0.35).fillRect(x + 6, by + 3, Math.max(0, iw * frac(shown) - 8), 2); // shine
      y += 38;
    }
    const notes = this.statNotes(b, preview);
    if (notes.length) {
      const t = this.add.text(x, y + 2, notes.join('\n'), bodyStyle(14, COLORS.ink, { lineSpacing: 3, wordWrap: { width } }));
      box.add(t);
      y += t.height + 6;
    }
    return y;
  }

  /**
   * Selecting a building shows the compact quick bar (name, level, Upgrade / Rebuild, Info). The full
   * panel opens from its Info button.
   */
  refreshInfo() {
    const b = this.selectedId ? this.gs.getBuilding(this.selectedId) : null;
    if (!b || this.infoOpen) this.hideQuickBar();
    if (!b) { this.hideInfo(); return; }
    if (!this.infoOpen) { this.hideInfo(); this.refreshQuickBar(b); return; }
    this.refreshInfoPanel();
  }

  /** Open the full info panel for the selected building. */
  openInfo() {
    if (!this.selectedId) return;
    this.infoOpen = true;
    this.refreshInfo();
  }

  // ---------- quick bar (shown when a building is selected) ----------
  buildQuickBar() {
    const c = this.add.container(0, QB.y).setDepth(400);
    this.qbBg = this.add.graphics();
    this.qbBlocker = this.add.zone(0, 0, 10, QB.h).setOrigin(0).setInteractive();
    this.qbName = this.add.text(18, QB.h / 2 - 25, '', textStyle(19));
    this.qbLevel = this.add.text(18, QB.h / 2 + 2, '', textStyle(14, COLORS.textGold));
    this.qbButtons = {
      upgrade: new Button(this, 0, QB.h / 2, QB.upgradeW, QB.btnH, 'Upgrade', () => this.onUpgrade(), { color: COLORS.buttonGood, fontSize: 17 }),
      repair: new Button(this, 0, QB.h / 2, QB.upgradeW, QB.btnH, 'Rebuild', () => this.gs.repair(this.selectedId), { color: COLORS.buttonGood, fontSize: 17 }),
      group: new Button(this, 0, QB.h / 2, QB.groupW, QB.btnH, 'Select all', () => this.world.setGroupMode(!this.groupMode), { color: COLORS.buttonBlue, fontSize: 15 }),
      info: new Button(this, 0, QB.h / 2, QB.infoW, QB.btnH, 'Info', () => this.openInfo(), { color: COLORS.buttonBlue, fontSize: 17 })
    };
    const close = new Button(this, 0, 0, 34, 32, '', () => this.world.select(null), { color: COLORS.buttonDanger, icon: 'x', radius: 8 });
    this.qbClose = close;
    c.add([this.qbBg, this.qbBlocker, this.qbName, this.qbLevel, ...Object.values(this.qbButtons), close]);
    this.quickBar = c;
    this.hideQuickBar();
  }

  hideQuickBar() {
    if (this.quickBar) this.quickBar.setVisible(false).setY(2000);
  }

  refreshQuickBar(b) {
    const gs = this.gs;
    const btn = this.qbButtons;
    const group = b.type === 'wall' ? wallGroup(gs, b) : [];
    const grouped = this.groupMode && group.length > 1;
    const ruin = b.type === 'townHall' && b.level === 0;
    this.qbName.setText(grouped ? `Walls  x${group.length}` : buildingName(b.type));
    this.qbLevel.setText(`Level ${b.level} / ${maxLevel(b.type)}${b.destroyed ? '  ·  Destroyed' : ruin ? '  ·  In ruins' : ''}`);
    const shown = [];
    // Destroyed (not walls): Rebuild. Otherwise Upgrade (or Rebuild for the starting hall ruin).
    if (b.destroyed && b.type !== 'wall') {
      const rep = checkRepair(gs, b);
      const ok = rep.ok && tutorialAllows(gs, 'repair');
      btn.repair.setLabel(`Rebuild · ${formatGold(repairCost(b))}`, rep.ok ? (ok ? '' : 'Follow the guide') : rep.reason).setEnabled(ok);
      shown.push(btn.repair);
    } else {
      const u = this.upgradeButtonState(b, group, grouped, ruin);
      btn.upgrade.setLabel(u.label, u.sub).setEnabled(u.ok);
      shown.push(btn.upgrade);
    }
    if (b.type === 'wall' && !b.destroyed && group.length > 1) {
      btn.group.setLabel(grouped ? 'One wall' : `Select all ${group.length}`, grouped ? '' : 'connected');
      shown.push(btn.group);
    }
    shown.push(btn.info);
    for (const bt of Object.values(btn)) bt.setVisible(shown.includes(bt));
    // Layout: title on the left, buttons in a row, right-aligned left of the Edit / Shop buttons.
    const textW = Math.max(this.qbName.width, this.qbLevel.width) + 30;
    let x = textW;
    for (const bt of shown) { bt.setX(x + bt.btnW / 2); x += bt.btnW + 8; }
    const w = x + 8;
    this.quickBar.setVisible(true).setX(QB.right - w).setY(this.quickBarY());
    this.qbClose.setPosition(w - 6, 4);
    this.qbBg.clear();
    drawWindow(this.qbBg, 0, 0, w, QB.h, { radius: 14 });
    this.qbBlocker.setSize(w, QB.h);
    if (this.qbBlocker.input) this.qbBlocker.input.hitArea.setSize(w, QB.h);
  }

  /** While the tutorial guide is up (bottom-left), the bar sits just above it instead of beside it. */
  quickBarY() {
    return this.guide && this.guide.y < 1000 ? this.guide.y - QB.h - 8 : QB.y;
  }

  /** The Upgrade button's label, subtext and whether it can be pressed (one building, or a wall group). */
  upgradeButtonState(b, group, grouped, ruin) {
    const gs = this.gs;
    if (grouped) {
      const plan = planWallGroupUpgrade(gs, group);
      const n = plan.ids.length;
      const ok = n > 0 && tutorialAllows(gs, 'upgrade', 'wall');
      const label = n === 0 ? `Upgrade ${plan.total} walls` : n === plan.total ? `Upgrade ${n} walls · ${formatGold(plan.cost)}` : `Upgrade ${n} of ${plan.total} · ${formatGold(plan.cost)}`;
      const sub = n === 0
        ? (plan.reason === 'Max level' ? 'Max level' : plan.each !== null && gs.gold < plan.each ? `Need ${formatGold(plan.each - gs.gold)} more gold for one` : plan.reason)
        : ok ? `To level ${b.level + 1}${n < plan.total ? ` · all ${plan.total}: ${formatGold(plan.total * plan.each)}` : ''}` : 'Follow the guide';
      return { label, sub, ok };
    }
    const up = checkUpgrade(gs, b);
    const verb = ruin ? 'Rebuild' : 'Upgrade'; // the starting hall ruin is rebuilt, not upgraded
    const label = up.cost === null ? verb : `${verb} · ${formatGold(up.cost)}`;
    let sub = up.reason;
    const ok = up.ok && tutorialAllows(gs, 'upgrade', b.type);
    if (up.ok && !ok) sub = 'Follow the guide';
    else if (up.ok && ruin) sub = 'Unlocks building · nights begin';
    else if (up.ok) sub = b.type === 'townHall' ? `Level ${b.level + 1} · tougher nights` : `To level ${b.level + 1}`;
    return { label, sub, ok };
  }

  /** The Upgrade button the player can see right now (quick bar or full panel), for the guide's arrow. */
  visibleUpgradeButton() {
    return this.infoOpen ? this.infoButtons.upgrade : this.qbButtons.upgrade;
  }

  refreshInfoPanel() {
    const gs = this.gs;
    const b = this.selectedId ? gs.getBuilding(this.selectedId) : null;
    if (!b) { this.hideInfo(); return; }
    this.infoPanel.setVisible(true).setX(INFO_X);

    // Walls: the whole connected group of same-level walls (group mode), worked out live.
    const group = b.type === 'wall' ? wallGroup(gs, b) : [];
    const grouped = this.groupMode && group.length > 1;
    this.infoName.setText(grouped ? `Walls  x${group.length}` : buildingName(b.type));
    const ruin = b.type === 'townHall' && b.level === 0;
    this.infoLevel.setText(`Level ${b.level} / ${maxLevel(b.type)}${b.destroyed ? '  ·  Destroyed' : ruin ? '  ·  In ruins' : grouped ? '  ·  connected group' : ''}`);
    for (const [tab, btn] of Object.entries(this.infoTabs)) {
      btn.color = tab === this.infoTab ? COLORS.buttonGood : COLORS.buttonDark;
      btn.redraw();
    }
    this.syncInfoPic(b);
    let y = Math.max(this.drawInfoContent(b, INFO_TABS_Y + 26), INFO_PIC_Y + PIC.h + 12);
    if (b.type === 'house' && this.infoTab === 'info') y = this.drawGnomeCard(this.infoContent, b, y);

    const btn = this.infoButtons;
    const waveActive = isWaveActive(gs);
    const visible = [];

    const u = this.upgradeButtonState(b, group, grouped, ruin);
    btn.upgrade.setLabel(u.label, u.sub).setEnabled(u.ok);
    visible.push(btn.upgrade);

    // Walls touching other walls of the same level: switch to (or back from) the whole group.
    const showGroup = b.type === 'wall' && !b.destroyed && group.length > 1;
    btn.group.setVisible(showGroup);
    if (showGroup) {
      btn.group.setLabel(grouped ? 'Select one wall' : `Select connected walls (${group.length})`, grouped ? '' : 'Same level, to upgrade together');
      visible.push(btn.group);
    }

    // Selling is never possible while enemies attack, so the button steps aside then (keeps the panel short).
    // (Not for a whole wall group: selling stays one wall at a time.)
    const showSell = b.type !== 'townHall' && !waveActive && !grouped;
    if (showSell) {
      const sell = gs.checkSell(b);
      const sellOk = sell.ok && tutorialAllows(gs, 'sell');
      btn.sell.setLabel(`Sell · +${formatGold(sell.refund ?? 0)}`, sell.ok ? (sellOk ? '' : 'Follow the guide') : sell.reason).setEnabled(sellOk);
      visible.push(btn.sell);
    }
    btn.sell.setVisible(showSell);

    // Ruins stay ruins until rebuilt (any time). Walls come back on their own at dawn.
    const showRepair = b.destroyed && b.type !== 'wall';
    btn.repair.setVisible(showRepair);
    if (showRepair) {
      const rep = checkRepair(gs, b);
      const repOk = rep.ok && tutorialAllows(gs, 'repair');
      btn.repair.setLabel(`Rebuild · ${formatGold(repairCost(b))}`, rep.ok ? (repOk ? '' : 'Follow the guide') : rep.reason).setEnabled(repOk);
      visible.push(btn.repair);
    }

    for (const bt of Object.values(btn)) if (!visible.includes(bt)) bt.setY(-1000);
    for (const bt of visible) { bt.setY(y + INFO_BTN_H / 2).setVisible(true); y += INFO_BTN_H + 6; }
    const h = y + 8;
    this.infoBg.clear();
    drawWindow(this.infoBg, 0, 0, INFO_W, h, { header: INFO_HEADER });
    this.infoBlocker.setSize(INFO_W, h);
    if (this.infoBlocker.input) this.infoBlocker.input.hitArea.setSize(INFO_W, h);
  }

  /**
   * House Info tab: a card for the gnomes who live there, styled like the building cards: the gnome on a
   * showcase tile, its name and head count, and what each gnome does. Returns the y below it.
   */
  drawGnomeCard(box, b, y) {
    const V = CONFIG.villagers;
    const x = PIC.x, w = INFO_W - PIC.x * 2, h = 116, pw = 92, ph = h - 12;
    const g = this.add.graphics();
    box.add(g);
    // Recessed tray (like the shop's), the gnome's showcase card inside it.
    g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, h, 12);
    g.fillStyle(COLORS.tray, 1).fillRoundedRect(x + 2, y + 3, w - 4, h - 5, 11);
    const cx = x + 6, cy = y + 6, tileY = cy + ph - 30, tileW = 46;
    drawShowcaseCard(g, cx, cy, pw, ph, { tileY, tileW });
    const pic = this.add.image(cx + pw / 2, tileY + tileW * 0.3, TEX.villager).setOrigin(0.5, 1);
    pic.setScale(Math.min((pw - 30) / pic.frame.width, (ph - 30) / pic.frame.height));
    box.add(pic);
    // Name, and how many live here (with the next level's extra in green, like the Stats tab).
    const tx = cx + pw + 12, tw = x + w - 12 - tx;
    const n = levelStats('house', b.level).gnomes;
    const next = b.level < maxLevel('house') ? levelStats('house', b.level + 1).gnomes : n;
    const title = this.add.text(tx, y + 8, 'Gnome Worker', textStyle(19));
    box.add(title);
    // Gnome level (rises on the house levels that improve gnomes): a little badge after the name.
    box.add(this.add.text(title.x + title.width + 8, y + 12, `Lv ${gnomeTier(b.level)}`, textStyle(14, COLORS.textGold)));
    const count = this.add.text(x + w - 12, y + 10, `x${n} here`, textStyle(16, COLORS.textGold)).setOrigin(1, 0);
    box.add(count);
    if (next > n) box.add(this.add.text(count.x - count.width - 6, y + 12, `+${next - n}`, bodyStyle(13, COLORS.inkGood)).setOrigin(1, 0));
    // Each gnome's stats at this level, with what the next upgrade adds in green (like the Stats tab).
    const pct = (f) => `${Math.round(f * 1000) / 10}%`;
    const cur = gnomeStats(b.level);
    const nxt = b.level < maxLevel('house') ? gnomeStats(b.level + 1) : null;
    const rows = [
      ['By day', `Mines +${pct(cur.mine)} to storage`, nxt && nxt.mine > cur.mine ? `+${pct(nxt.mine - cur.mine)}` : ''],
      ['In attacks', `Repairs ${pct(cur.repair)} HP / s`, nxt && nxt.repair > cur.repair ? `+${pct(nxt.repair - cur.repair)}` : ''],
      ['Enemies', 'Ignore gnomes', '']
    ];
    let ry = y + 40;
    for (const [label, value, gain] of rows) {
      g.fillStyle(COLORS.frame, 0.12).fillRect(tx, ry - 3, tw, 1);
      box.add(this.add.text(tx, ry, label, bodyStyle(14, COLORS.inkDim)));
      const v = this.add.text(tx + tw, ry, value, bodyStyle(14)).setOrigin(1, 0);
      box.add(v);
      if (gain) box.add(this.add.text(v.x - v.width - 4, ry + 1, gain, bodyStyle(12, COLORS.inkGood)).setOrigin(1, 0));
      ry += 23;
    }
    return y + h + 10;
  }

  // ---------- banner ----------
  buildBanner() {
    this.bannerBg = this.add.graphics().setDepth(800);
    this.bannerText = this.add.text(640, 115, '', textStyle(28)).setOrigin(0.5).setDepth(801);
    this.bannerBg.setAlpha(0);
    this.bannerText.setAlpha(0);
  }

  showBanner(text) {
    this.bannerText.setText(text);
    const w = this.bannerText.width + 70;
    this.bannerBg.clear();
    drawRibbon(this.bannerBg, 640, 90, w, 54);
    this.tweens.killTweensOf([this.bannerBg, this.bannerText]);
    this.bannerBg.setAlpha(1);
    this.bannerText.setAlpha(1);
    this.tweens.add({ targets: [this.bannerBg, this.bannerText], alpha: 0, delay: BANNER_MS - 300, duration: 300 });
  }

  // ---------- tutorial guide ----------
  buildGuide() {
    const c = this.add.container(16, 0).setDepth(700);
    // The guide character: a bust standing on the bottom of the bubble area.
    const portrait = this.add.image(62, 158, TEX.guide).setOrigin(0.5, 1);
    portrait.setScale(150 / portrait.frame.height);
    this.guideBubble = this.add.graphics();
    this.guideBlocker = this.add.zone(0, 0, 640, 160).setOrigin(0).setInteractive();
    this.guideText = this.add.text(146, 18, '', bodyStyle(18, COLORS.ink, { wordWrap: { width: 440 }, lineSpacing: 4 }));
    this.guideProgress = this.add.text(146, 92, '', bodyStyle(16, COLORS.inkAccent));
    this.guideNext = new Button(this, 540, 124, 110, 40, 'Next', () => this.gs.tutorialEvent('next'), { fontSize: 19, color: COLORS.buttonGood });
    this.guideSkip = new Button(this, 400, 124, 150, 40, 'Skip tutorial', () => this.gs.skipTutorial(), { fontSize: 16, color: COLORS.buttonDark });
    c.add([this.guideBlocker, this.guideBubble, portrait, this.guideText, this.guideProgress, this.guideNext, this.guideSkip]);
    this.guide = c;
  }

  refreshGuide() {
    const gs = this.gs;
    const visible = isGuideVisible(gs);
    this.guide.setVisible(visible);
    this.guide.setY(visible ? (this.shopOpen ? SHOP_OPEN_Y - 176 : 720 - 170) : 2000);
    if (!visible) return;
    const step = currentStep(gs);
    this.guideText.setText(step.text);
    const need = goldNeeded(gs);
    this.guideProgress.setText(need && isWaitingForGold(gs) ? `Collect gold from your mine: ${formatGold(gs.gold)} / ${formatGold(need)}` : '');
    this.guideProgress.setY(Math.max(70, 26 + this.guideText.height));
    this.guideNext.setVisible(!!step.showNext).setY(step.showNext ? 124 : -1000);
    const skip = canSkipTutorial(gs);
    this.guideSkip.setVisible(skip).setY(skip ? 124 : -1000);
    const g = this.guideBubble;
    g.clear();
    drawWindow(g, 124, 4, 486, 152, { radius: 16, flat: true });
    // Tail pointing at the guide: dark outline triangle, then the body color inside it.
    g.fillStyle(COLORS.frame, 1).fillTriangle(126, 64, 126, 104, 100, 92);
    g.fillStyle(COLORS.body, 1).fillTriangle(130, 70, 130, 98, 108, 91);
  }

  /** Screen rect the guide currently points at, or null. */
  focusTarget() {
    const gs = this.gs;
    if (!isGuideVisible(gs)) return null;
    const step = currentStep(gs);
    const n = gs.tutorialStep;
    const waiting = isWaitingForGold(gs);
    const building = (type) => {
      const a = this.world.buildingScreenAnchor(type);
      return a ? { x: a.x - a.width / 2, y: a.y, w: a.width, h: a.bottom - a.y } : null;
    };
    const imageRect = (img) => {
      const b = img.getBounds();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    };
    const card = (type) => {
      const cardObj = this.cardLayer.list.find((c) => c.cardType === type);
      if (!cardObj) return imageRect(this.shopButton);
      return { x: this.shopPanel.x + cardObj.x, y: this.shopPanel.y + cardObj.y, w: cardObj.cardW, h: cardObj.cardH };
    };
    const btnRect = (b) => {
      const m = b.getWorldTransformMatrix();
      return { x: m.tx - b.btnW / 2, y: m.ty - b.btnH / 2, w: b.btnW, h: b.btnH };
    };
    switch (n) {
      case 1: {
        const th = gs.townHall;
        return th && this.selectedId === th.id ? btnRect(this.visibleUpgradeButton()) : building('townHall');
      }
      case 2: return imageRect(this.shopButton);
      case 3: return this.shopOpen ? card('mine') : imageRect(this.shopButton);
      case 5: return building('mine');
      case 6:
      case 7:
        if (waiting) return building('mine');
        if (this.placementActive) return null;
        return this.shopOpen ? card(step.buyType) : imageRect(this.shopButton);
      case 8: {
        const s = this.world.spawnMarkerScreen();
        return s ? { x: s.x - 40, y: s.y - 40, w: 80, h: 80 } : null;
      }
      case 9: return btnRect(this.guideNext);
      default: return null;
    }
  }

  drawFocus(time) {
    const g = this.focusGfx;
    g.clear();
    const t = this.focusTarget();
    if (!t) return;
    // Keep the highlight on screen even when its target (e.g. a spawn path) is scrolled away.
    const r = { ...t };
    r.x = Phaser.Math.Clamp(r.x, 10, 1270 - r.w);
    r.y = Phaser.Math.Clamp(r.y, 60, 710 - r.h);
    const pulse = 0.55 + 0.45 * Math.sin(time * 0.008);
    g.lineStyle(4, 0xffe066, pulse).strokeRoundedRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12, 12);
    const bounce = Math.abs(Math.sin(time * 0.006)) * 12;
    const cx = r.x + r.w / 2;
    const above = r.y > 70;
    const tipY = above ? r.y - 10 - bounce : r.y + r.h + 10 + bounce;
    const dir = above ? -1 : 1;
    g.fillStyle(0xffe066, 1);
    g.lineStyle(3, 0x3a2400, 1);
    g.beginPath();
    g.moveTo(cx, tipY);
    g.lineTo(cx - 16, tipY + dir * 22);
    g.lineTo(cx - 6, tipY + dir * 22);
    g.lineTo(cx - 6, tipY + dir * 42);
    g.lineTo(cx + 6, tipY + dir * 42);
    g.lineTo(cx + 6, tipY + dir * 22);
    g.lineTo(cx + 16, tipY + dir * 22);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  // ---------- events ----------
  subscribe() {
    const gs = this.gs;
    const on = (names, fn) => names.forEach((n) => gs.on(n, fn, this));
    const isSelected = (d) => d && d.id === this.selectedId;

    on(['goldChanged', 'buildingPlaced', 'buildingSold', 'buildingUpgraded', 'baseReset'], () => {
      this.refreshShopBadge();
      this.refreshGold();
      if (this.shopOpen) this.refreshShop();
      this.refreshInfo();
      this.refreshGuide();
      this.refreshWave();
    });
    on(['mineStockChanged', 'buildingDamaged', 'buildingDestroyed', 'buildingRepaired', 'buildingHealed', 'buildingMoved'], (d) => {
      if (isSelected(d)) this.refreshInfo();
    });
    on(['selectionChanged'], (d) => {
      if (d.id !== this.selectedId) this.infoOpen = false; // a new selection starts with the quick bar
      this.selectedId = d.id;
      this.groupMode = !!d.group;
      if (d.id && this.shopOpen) this.closeShop();
      this.refreshInfo();
    });
    on(['placementChanged'], (d) => {
      this.placementActive = d.active;
      this.showRotate(!!d.active && d.type === 'wall' && CONFIG.walls.segmentLength > 1); // single-tile walls don't turn
      this.refreshGuide();
    });
    on(['waveTriggered', 'waveTick', 'enemyKilled', 'enemySpawned', 'clockTick', 'clockPhase', 'townHallUpgraded'], () => this.refreshWave());
    on(['waveStarted'], () => {
      this.closeShop();
      this.refreshWave();
      this.refreshInfo();
      this.refreshShopButton();
      this.refreshEditButton();
    });
    on(['waveCleared'], (d) => {
      const ruins = d.ruins ? ` · ${d.ruins} to rebuild` : '';
      this.showBanner(`Wave ${d.number} cleared! +${formatGold(d.bounty)} gold${ruins}`);
      // Then, if the gnomes rebuilt a mine for free, say so.
      if (d.salvaged) this.time.delayedCall(BANNER_MS + 200, () => this.showBanner('Your gnomes salvaged a Bitcoin Mine!'));
      this.refreshAll();
    });
    on(['storageFull'], () => this.showBanner('Storage full'));
    on(['achievementEarned'], (d) => this.queueAchievementToast(d.id));
    on(['leaguePromoted'], (d) => {
      const l = LEAGUES.find((x) => x.key === d.key);
      if (l) this.queueToast({ title: 'New league!', name: `${l.name} League`, sub: `Furthest wave: ${d.wave}  ·  see the Leaderboard`, texture: l.texture });
    });
    on(['enemiesEnraged'], () => { this.showBanner('The enemies grow restless!'); this.refreshWave(); });
    on(['waveCalledEarly'], (d) => {
      this.refreshWave();
      const what = d.from === 'dusk' ? 'Wave incoming!' : 'Night falls early!';
      this.showBanner(d.bonus > 0 ? `${what} +${formatGold(d.bonus)} gold` : what);
    });
    on(['editModeChanged', 'waveTriggered'], () => this.refreshEditButton());
    on(['tutorialChanged'], () => this.refreshAll());
  }

  // ---------- achievement toasts ----------
  /** Achievements unlocked during play: a toast with a gold medal. */
  queueAchievementToast(id) {
    const a = achievementById(id);
    if (a) this.queueToast({ title: 'Achievement unlocked!', name: a.name, sub: `+${formatGold(a.reward)} gold to claim  ·  Pause → Achievements` });
  }

  /** Gold-trimmed toasts under the banner, top center, one at a time: { title, name, sub, texture? } (else a medal). */
  queueToast(item) {
    this.toastQueue = this.toastQueue || [];
    this.toastQueue.push(item);
    if (!this.toastBusy) this.nextToast();
  }

  nextToast() {
    const a = this.toastQueue.shift();
    if (!a) { this.toastBusy = false; return; }
    this.toastBusy = true;
    playSfx(this, this.cache.audio.exists(SFX.achievement) ? SFX.achievement : SFX.waveClear);
    const c = this.add.container(640, 200).setDepth(850); // under the wave banner (y 90)
    const title = this.add.text(0, -14, a.title, textStyle(16, COLORS.textGold)).setOrigin(0.5);
    const name = this.add.text(0, 8, a.name, textStyle(24)).setOrigin(0.5);
    const sub = this.add.text(0, 32, a.sub, textStyle(13, COLORS.textDim)).setOrigin(0.5);
    const w = Math.max(title.width, name.width, sub.width) + 110, h = 84;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 12, w, h, 16);
    g.fillStyle(COLORS.frame, 1).fillRoundedRect(-w / 2, -h / 2 + 8, w, h, 16);
    g.fillStyle(0x3b2a12, 0.92).fillRoundedRect(-w / 2 + 4, -h / 2 + 12, w - 8, h - 8, 13);
    g.lineStyle(2, 0xffc83a, 1).strokeRoundedRect(-w / 2 + 6, -h / 2 + 14, w - 12, h - 12, 11);
    // On the left: the league badge, or a gold medal with a star.
    const mx = -w / 2 + 44, my = 8;
    let icon = null;
    if (a.texture && this.textures.exists(a.texture)) {
      icon = this.add.image(mx, my, a.texture);
      icon.setScale(62 / Math.max(icon.frame.width, icon.frame.height));
    } else {
      g.fillStyle(0xa86a12, 1).fillCircle(mx, my, 24);
      g.fillStyle(0xffc83a, 1).fillCircle(mx, my - 2, 20);
      const pts = [];
      for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5.5 : 12; pts.push({ x: mx + Math.cos(ang) * r, y: my - 2 + Math.sin(ang) * r }); }
      g.fillStyle(0xfff6d0, 1).fillPoints(pts, true);
    }
    [title, name, sub].forEach((t) => t.setX(t.x + 24));
    c.add([g, title, name, sub, ...(icon ? [icon] : [])]);
    c.setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c, alpha: 0, y: 182, delay: 3400, duration: 350,
      onComplete: () => { c.destroy(); this.time.delayedCall(150, () => this.nextToast()); }
    });
  }

  refreshAll() {
    this.refreshShopBadge();
    this.refreshGold();
    this.refreshWave();
    this.refreshShopButton();
    this.refreshEditButton();
    if (this.shopOpen) this.refreshShop();
    this.refreshInfo();
    this.refreshGuide();
  }
}
