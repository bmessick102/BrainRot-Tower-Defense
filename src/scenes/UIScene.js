// HUD overlay: gold, wave status, pause, shop, building info panel, banners, tutorial guide.
// Runs in parallel with GameScene. Text only changes in response to GameState events.
import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { IS_TOUCH } from '../device.js';
import {
  DEFENSE_TYPES, ECONOMY_TYPES, WALL_TYPES, buildableCount, buildCost, buildingName, checkBuy, checkUpgrade, countOwned, isDefense,
  levelStats, limitFor, maxHp, maxLevel, typeConfig, footprintDims, wallLevel, takesBonusSlot, bonusActive, bonusSlotCount, bonusSlotsUsed,
  bonusSlotsFree, nextTakesBonusSlot, bonusTownHall
} from '../logic/buildings.js';
import { checkRepair, formatGold, repairCost, hallIncomeRate, mineStockCap } from '../logic/economy.js';
import { enemiesLeft, nightWaveNumber, nextWaveInfo, wavePlanCounts } from '../logic/waves.js';
import { liveStars, starText } from '../logic/waveStars.js';
import { isClockRunning, canStartWave, secondsToNextPhase, nightAmount, isDark } from '../logic/dayNight.js';
import {
  canSkipTutorial, currentStep, goldNeeded, isGuideVisible, isWaitingForGold, tutorialAllows
} from '../logic/tutorial.js';
import { isWaveActive } from '../logic/util.js';
import { gnomeStats, gnomeTier } from '../logic/villagers.js';
import { Button } from '../objects/Button.js';
import { ResourceBar, formatSpaced } from '../objects/ResourceBar.js';
import { drawWindow, drawGlossy, drawHudPill, drawRibbon, drawBadge, drawShowcaseCard, drawCardStrip, drawAngledArrow, fitWidth, fitIcon, addHeroBadge } from '../objects/uiDraw.js';
import {
  TOP_ROW_CY, topRowY, GOLD_BAR, RP_BAR, CLOCK, clockRect, PROFILE, WAVE_CX, waveSpan,
  fitInSpan, fitPill, liftClear, rectsOverlap, findOverlaps, SCREEN
} from '../logic/hudLayout.js';
import { MAP } from '../mapTiles.js';
import { BUILDING_DESCRIPTIONS } from '../buildingText.js';
import { buildingTextureKey } from '../objects/BuildingView.js';
import { TEX, SFX } from '../assetKeys.js';
import { playSfx } from '../audio.js';
import { COLORS, bodyStyle, textStyle, RP_BAR_COLORS } from '../theme.js';
import { achievementById } from '../logic/achievements.js';
import { LEAGUES } from '../logic/leagues.js';
import { RESEARCH_TYPES, UTILITY_TYPES, HERO_TYPES, SPELL_TYPES } from '../logic/buildings.js';
import { AbilityHotbar } from '../objects/AbilityHotbar.js';
import { openFuelStationWindow } from '../objects/FuelStationWindow.js';
import { SPELL_KINDS, spellConfig, spellFullName, spellSlots, brewedSpells } from '../logic/spells.js';
import { rpCap, rpText } from '../logic/researchPoints.js';
import { heroStats, getAltar } from '../logic/hero.js';
import { djStats, hypeNeeded } from '../logic/dj.js';
import { hotbarGroups, isStored as isStoredIn } from '../logic/layout.js';
import { hasAbilities, canResearchFor, labLevel, towerRange, towerMinRange, towerFireInterval } from '../logic/abilities.js';
import { openResearchWindow, abilitySummary } from '../objects/AbilityWindow.js';
import { currentTip } from '../logic/tips.js';
import { isLabGuideVisible, labGuideStep, labGuideText } from '../logic/labGuide.js';
import { Modal } from '../objects/Modal.js';
import { ProfileWindow } from '../objects/ProfileWindow.js';
import { profileNews, markProfileSeen } from '../net/profileNews.js';
import { session } from '../net/account.js';
import { leagueFor } from '../logic/leagues.js';

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
const SHOP_CARD_W = 200; // every shop card is this wide; more than fit = more pages
/** Card grid: left edge, gap and how many cards fit on a page. */
function shopCardGrid() {
  const x0 = TRAY.x + 8, gap = 12;
  return { x0, gap, perPage: Math.max(1, Math.floor((SHOP_W - x0 * 2 + gap) / (SHOP_CARD_W + gap))) };
}
// Traps (hidden, like the Mousetrap) get their own tab; they're still defenses in the game rules.
const TRAP_TYPES = DEFENSE_TYPES.filter((t) => CONFIG.defenses[t].trap);
const SHOP_TABS = [
  { key: 'defenses', label: 'Defenses', types: [...DEFENSE_TYPES.filter((t) => !TRAP_TYPES.includes(t)), ...HERO_TYPES] }, // the Brisket King's altar too
  { key: 'traps', label: 'Traps', types: TRAP_TYPES },
  { key: 'economy', label: 'Economy', types: [...ECONOMY_TYPES, ...RESEARCH_TYPES, ...UTILITY_TYPES, ...SPELL_TYPES] }, // the RV Lab, DJ Babyface and Fuel Station sit with the economy buildings
  { key: 'walls', label: 'Walls', types: WALL_TYPES }
];

// Quick bar: a compact strip along the bottom, right-aligned just left of the Edit / Shop buttons.
// Centered on the same line as the Edit button (y 650), about its height.
const QB = { y: 650 - 40, h: 80, right: 1004, btnH: 52, upgradeW: 200, infoW: 74, abilityW: 132 };

const INFO_W = 440;
const INFO_X = 1280 - 16 - INFO_W;
const INFO_Y = Math.ceil(CLOCK.cy + CLOCK.h / 2) + 8; // below the gold bar and the day/night pill under it
const INFO_TOP_MIN = TOP_ROW_CY + 36;                    // a very tall panel may rise to here (just under the top row)
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
const CANCEL_W = 112; // "Cancel" beside Start Now during the countdown
const EARLY_H = 54;         // Start Wave button height: room for its label and a hint line without touching the edges
const PILL_H = 46;          // the wave pill beside it
const SPECIAL_BTN_MAX = 300; // the widest the button grows for a long hint
// Top row: Profile, wave pill + Start Wave, the RP bar and the gold bar all share one centre line; the geometry
// lives in src/logic/hudLayout.js (TOP_ROW_CY, topRowY, GOLD_BAR, RP_BAR, CLOCK, waveSpan), where tests check
// that nothing overlaps. To add a bar to the row, place it with topRowY(its height) (its top y).
// The wave pill + button are centered near WAVE_CX, inside the free span between the profile and the RP bar.
// Layout editor hotbar (bottom left, beside the Edit button) and its cards.
const HOTBAR = { x: 16, y: 598, w: 988, h: 114 };
const HOTBAR_CARD = { w: 84, h: 92, gap: 8 };
const SHIFT_PAD = { x: 96, y: 474, dx: 34, dy: 26 }; // center of the layout shift pad and its buttons' offsets
// Select Row (edit mode): a toggle right of the shift pad; while it's on, clicking a wall picks up its whole run.
const ROW_BTN = { x: 248, y: 474, w: 150, h: 48 };

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
    // The scene object is reused for every game (maybe another village): nothing from the last one carries over.
    this.toastQueue = []; this.toastBusy = false; // a toast cut off mid-show would block every later one
    this.cornerRects = null; this.babyCarAnnounced = null; this.profileBadgeCount = undefined;
    this.storageFullShown = false;
    this.tipShown = false; this.rpLostSum = 0; this.heroTabAt = 0;
    // HUD pieces the build steps below check for (the profile pill redraws the wave pill if it exists): the last
    // game's were destroyed with it. (A stale wave pill crashed the HUD when the player or league changed.)
    this.waveText = null; this.waveBg = null; this.wavePillRect = null; this.profileRight = undefined; this.waveSpanFor = undefined;
    this.rpBar = null; this.rpLostText = null; this.clockText = null; this.clockRect = null; this.infoPanel = null;

    this.buildGold();
    this.buildResearchPoints();
    this.buildClock();
    this.buildProfile();
    this.buildWave();
    this.buildPauseButton();
    this.buildShop();
    this.buildShopButton();
    this.buildShopBadge();
    this.buildEditButton();
    this.abilityBar = new AbilityHotbar(this, this.gs, this.world); // the ability hotbar (bottom middle)
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
    // The Hero tab's status (nap timer, health) changes every second: redraw it now and then.
    if (this.infoTab === 'hero' && this.infoPanel && this.infoPanel.visible && time >= (this.heroTabAt || 0)) {
      this.heroTabAt = time + 500;
      const b = this.selectedId && this.gs.getBuilding(this.selectedId);
      if (b && b.type === 'altar') this.refreshInfo();
    }
    this.drawFocus(time);
    this.abilityBar.update(time);
    this.layoutAroundAbilityBar(); // the info panel keeps clear of it
    this.refreshClock();
    if (this.selectedId && this.infoPanel.visible) this.syncInfoPic();
    if (this.quickBar && this.quickBar.visible) this.quickBar.setY(this.quickBarY()); // follows the guide opening / closing
  }

  /** GameScene asks this before treating a click as a map click. */
  isPointerOverUI(pointer) {
    return this.input.hitTestPointer(pointer).length > 0;
  }

  // ---------- spawn corners: the map's wave markers ----------
  /**
   * Per attack corner of the next wave (the running one while it lasts): GameScene's WaveMarkers draw an arrow
   * and the enemy kinds with counts on the map at the back of that corner's path (world space, under this HUD).
   * The fog over the back of every path is GameScene's too (SpawnFog), always on.
   */
  syncCornerHud() {
    let counts = {};
    try { counts = wavePlanCounts(this.gs); } catch (e) { counts = {}; }
    if (this.gs.gameOver) counts = {};
    if (this.world && this.world.waveMarkers) this.world.waveMarkers.setCounts(counts);
  }

  // ---------- gold ----------
  buildGold() {
    // Top right: the coin's right edge sits ~18 px from the screen edge.
    this.goldBar = new ResourceBar(this, GOLD_BAR.x, GOLD_BAR.y, GOLD_BAR.w, GOLD_BAR.h, TEX.coin);
    const r = this.goldBar.bounds();
    this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setInteractive();
  }

  refreshGold() {
    this.goldBar.setValue(this.gs.gold, this.gs.capacity);
  }

  // ---------- Burgers (research points; the bar left of the gold bar) ----------
  /** A small drawn burger for the Burgers icon, made once unless the real art (TEX.researchPoint) was loaded. */
  ensureRpIcon() {
    if (this.textures.exists(TEX.researchPoint)) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x2a160a, 1).fillRoundedRect(2, 4, 28, 25, 9);                          // outline
    g.fillStyle(0xe0913a, 1).fillEllipse(16, 11, 24, 13).fillRoundedRect(5, 23, 22, 4, 2); // buns
    g.fillStyle(0x7ac142, 1).fillRect(4, 15, 24, 2);                                    // lettuce
    g.fillStyle(0xffc43a, 1).fillRect(4, 17, 24, 2);                                    // cheese
    g.fillStyle(0x6b3418, 1).fillRoundedRect(5, 19, 22, 4, 2);                          // patty
    g.fillStyle(0xfff1c4, 0.9).fillEllipse(11, 9, 3, 2).fillEllipse(17, 7, 3, 2).fillEllipse(21, 10, 3, 2); // seeds
    g.generateTexture(TEX.researchPoint, 32, 32);
    g.destroy();
  }

  /**
   * The Burgers resource bar (research points; internally rp): same look as the gold bar, burger orange, in the
   * top row just left of it. Its "Max" is the cap (grows with the RV Lab's level); any earned past it is lost
   * (see showRpLost).
   */
  buildResearchPoints() {
    this.ensureRpIcon();
    this.rpBar = new ResourceBar(this, RP_BAR.x, RP_BAR.y, RP_BAR.w, RP_BAR.h, TEX.researchPoint,
      RP_BAR_COLORS);
    const r = this.rpBar.bounds();
    this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setInteractive();
    this.rpLostSum = 0;
    // "Burgers full: n lost" takes the place of the bar's "Max" label for a moment (so it never lands on the wave
    // banner or the info panel below the row).
    const mt = this.rpBar.maxText;
    this.rpLostText = this.add.text(mt.x, mt.y, '', { fontFamily: mt.style.fontFamily, fontSize: mt.style.fontSize, color: '#ffb0b0', stroke: '#000000', strokeThickness: 4 }).setOrigin(0, 1).setAlpha(0).setDepth(460);
    this.refreshResearchPoints();
  }

  refreshResearchPoints() {
    if (!this.rpBar) return;
    this.rpBar.setValue(this.gs.researchPoints || 0, rpCap(this.gs));
  }

  /** "Burgers full: 12 lost" under the bar when Burgers are earned past the cap; adds up while kills keep coming. */
  showRpLost(n) {
    if (!this.rpLostText) return;
    this.rpLostSum += n;
    const max = this.rpBar.maxText;
    this.tweens.killTweensOf([this.rpLostText, max]);
    this.rpLostText.setText(`Burgers full: ${formatSpaced(this.rpLostSum)} lost`).setAlpha(1);
    // Kept left of the bar's icon (a long count shrinks).
    const room = this.rpBar.x + this.rpBar.w - this.rpBar.iconRadius - 4 - this.rpLostText.x;
    this.rpLostText.setScale(this.rpLostText.width > room ? room / this.rpLostText.width : 1);
    max.setAlpha(0);
    this.tweens.add({
      targets: this.rpLostText, alpha: 0, delay: 900, duration: 500,
      onComplete: () => { this.rpLostSum = 0; this.tweens.add({ targets: max, alpha: 1, duration: 200 }); }
    });
  }

  // ---------- time of day (directly below the gold bar) ----------
  /**
   * The day/night clock, which runs on its own (waves come whenever Start Wave is pressed): a sun or moon and
   * the phase with the time left in it, e.g. "Day 3:12", "Night 1:05". Hidden until the clock runs.
   */
  buildClock() {
    this.clockBg = this.add.graphics();
    this.clockIcon = this.add.graphics();
    this.clockText = this.add.text(0, 0, '', textStyle(16)).setOrigin(1, 0.5);
    this.clockKey = '';
  }

  refreshClock() {
    if (!this.clockText) return;
    const gs = this.gs, c = gs.clock;
    const show = !!c && isClockRunning(gs);
    if (!show) {
      if (this.clockKey !== 'off') { this.clockKey = 'off'; this.clockBg.clear(); this.clockIcon.clear(); this.clockText.setText(''); this.clockRect = null; }
      return;
    }
    const left = Math.ceil(secondsToNextPhase(c));
    const label = { day: 'Day', dusk: 'Dusk', night: 'Night', dawn: 'Dawn' }[c.phase] || 'Day';
    const text = `${label} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const night = nightAmount(c);
    const key = `${text}|${night.toFixed(2)}`;
    if (key === this.clockKey) return;
    this.clockKey = key;
    const { cy, right } = CLOCK; // directly below the gold bar, right-aligned with its coin
    this.clockText.setText(text).setPosition(right - 12, cy).setColor(night > 0.5 ? '#cfd8ff' : '#fff3c4');
    const ix = this.clockText.x - this.clockText.width - 16;
    const g = this.clockIcon;
    g.clear();
    if (night <= 0.5) {
      // Sun: a disc with short rays.
      g.fillStyle(0xffc93c, 1);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.fillCircle(ix + Math.cos(a) * 10, cy + Math.sin(a) * 10, 2);
      }
      g.fillStyle(0xffe27a, 1).fillCircle(ix, cy, 6.5);
      g.lineStyle(1.5, 0xc98a12, 1).strokeCircle(ix, cy, 6.5);
    } else {
      // Moon: a crescent (a pale disc with the pill's color bitten out).
      g.fillStyle(0xe6ecff, 1).fillCircle(ix, cy, 8);
      g.fillStyle(0x2b3350, 1).fillCircle(ix + 4.5, cy - 3, 7);
    }
    const leftEdge = ix - 16, w = right - leftEdge;
    this.clockBg.clear();
    drawHudPill(this.clockBg, leftEdge, cy - CLOCK.h / 2, w, CLOCK.h);
    this.clockRect = clockRect(w); // the wave banner keeps clear of it
  }

  // ---------- profile (top left) ----------
  /**
   * Who's playing: league badge, league name and username in a HUD pill, with a red badge counting
   * achievement rewards ready to claim. Clicking it opens the Profile window. Only when logged in.
   */
  buildProfile() {
    this.profile = null;
    if (!session.loggedIn || !session.user) return;
    const c = this.add.container(PROFILE.x, topRowY(PROFILE.h)).setDepth(450);
    this.profile = c;
    this.refreshProfile();
  }

  refreshProfile() {
    const c = this.profile;
    if (!c) return;
    c.removeAll(true);
    const league = leagueFor(session.stats.bestWave);
    const hasBadge = !!(league && this.textures.exists(league.texture));
    const tx = hasBadge ? 58 : 18;
    const name = this.add.text(tx, 36, session.user.username, textStyle(20)).setOrigin(0, 0.5);
    const small = this.add.text(tx, 15, hasBadge ? `${league.name} League` : 'Profile', textStyle(13, hasBadge ? COLORS.textGold : COLORS.textDim)).setOrigin(0, 0.5);
    // A long username (up to 16 wide letters) shrinks so the pill leaves room for the wave pill beside it.
    for (const t of [name, small]) fitWidth(t, PROFILE.maxTextW);
    const w = Math.max(name.displayWidth, small.displayWidth) + tx + 18;
    this.profileRight = PROFILE.x + w + 22; // with the news badge on its corner
    const bg = this.add.graphics();
    drawHudPill(bg, 0, 0, w, 50);
    const hover = this.add.graphics().setVisible(false);
    hover.fillStyle(0xffffff, 0.12).fillRoundedRect(0, 0, w, 50, 25);
    c.add([bg, hover, small, name]);
    if (hasBadge) {
      const img = this.add.image(28, 25, league.texture);
      fitIcon(img, 48);
      c.add(img);
    }
    // What's new (like the shop's badge): rewards to claim + achievements / league not seen yet. It pops when
    // the count goes up.
    const n = profileNews(session).count;
    if (n) {
      const badge = this.add.container(w + 4, 4); // on the corner, clear of the league name
      const circle = this.add.graphics();
      drawBadge(circle, 0, 0, 16);
      badge.add([circle, this.add.text(0, 0, n > 99 ? '99+' : String(n), textStyle(17)).setOrigin(0.5)]);
      c.add(badge);
      if (this.profileBadgeCount !== undefined && n > this.profileBadgeCount) {
        badge.setScale(1.5);
        this.tweens.add({ targets: badge, scale: 1, duration: 320, ease: 'Back.easeOut' });
      }
    }
    this.profileBadgeCount = n;
    const zone = this.add.zone(0, 0, w, 50).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => hover.setVisible(true));
    zone.on('pointerout', () => hover.setVisible(false));
    zone.on('pointerdown', () => { playSfx(this, SFX.uiClick); this.openProfile(); });
    c.add(zone);
    if (this.waveText && this.profileRight !== this.waveSpanFor) this.refreshWave(); // the wave pill keeps clear of it
  }

  openProfile() {
    if (Modal.isOpen(this)) return;
    // The window highlights what's new; opening it counts as seeing it (unclaimed rewards stay counted).
    const news = profileNews(session);
    markProfileSeen(session);
    new ProfileWindow(this, { session, gs: this.gs, news, onClose: () => { this.refreshProfile(); this.refreshGuide(); } });
    this.refreshProfile();
    this.refreshGuide(); // the guide bubble hides behind windows
  }

  // ---------- wave status ----------
  buildWave() {
    this.waveBg = this.add.graphics();
    this.waveText = this.add.text(WAVE_CX, TOP_ROW_CY, '', textStyle(22)).setOrigin(0.5);
    // "Start Wave" sits right of the pill: waves only come when the player starts them. During the countdown it
    // turns into "Start Now" (the wave attacks right away).
    this.earlyBtn = new Button(this, 0, TOP_ROW_CY, EARLY_W, EARLY_H, 'Start Wave', () => {
      if (this.gs.wave && this.gs.wave.phase === 'countdown') this.gs.startWaveNow();
      else this.gs.startWave();
    },
      { color: COLORS.buttonGood, fontSize: 19, radius: 12 });
    // During the countdown: Cancel puts the wave back (same number), as if Start Wave was never pressed.
    this.cancelWaveBtn = new Button(this, 0, -500, CANCEL_W, EARLY_H, 'Cancel', () => this.gs.cancelWave(),
      { color: COLORS.buttonDanger, fontSize: 19, radius: 12 });
    this.cancelWaveBtn.setLabel('Cancel', 'Not yet');
    this.cancelWaveBtn.setVisible(false);
  }

  refreshWave() {
    this.syncCornerHud();
    const w = this.gs.wave;
    // Each state has shorter versions of its text for when the top row is tight (a long username, the
    // countdown's three buttons): refreshWave uses the longest that fits.
    let texts = [], special = null;
    if (w.phase === 'countdown') {
      // The countdown: how long until it attacks ("!" markers show where from).
      special = w.special ? CONFIG.specialWaves.types[w.special] : null;
      const s = Math.max(0, Math.ceil(w.countdown));
      texts = [`Wave ${w.number}${special ? ` · ${special.name}` : ''} attacks in ${s}s`, `Wave ${w.number} in ${s}s`, `${s}s`];
    } else if (w.phase === 'active') {
      special = w.special ? CONFIG.specialWaves.types[w.special] : null;
      const live = liveStars(this.gs); // the rating this wave is on track for
      const left = enemiesLeft(this.gs), stars = live ? `  ${starText(live)}` : '';
      texts = [`Wave ${w.number}${special ? ` · ${special.name}` : ''} · ${left} enemies left${w.enraged ? ' · Enraged!' : w.restless ? ' · Restless' : ''}${stars}`,
        `Wave ${w.number} · ${left} left${stars}`, `${left} left`];
    } else if (this.gs.tutorialDone && this.gs.townHall && this.gs.townHall.level === 0) texts = ['Rebuild your Village Hall to begin', 'Rebuild your Village Hall'];
    else if (isClockRunning(this.gs)) {
      // Warn about a special wave (or Da Baby Car, the raid boss) all through the build time before it.
      const info = nextWaveInfo(this.gs);
      special = info.specialInfo || (info.babyCars ? { name: info.babyCars > 1 ? `${info.babyCars} ${CONFIG.enemies.babycar.name}s` : CONFIG.enemies.babycar.name, hint: 'Raid boss: rams straight at your Village Hall' } : null);
      const n = nightWaveNumber(this.gs);
      texts = [`Next: Wave ${n}${special ? ` · ${special.name}!` : ''}`, `Wave ${n}${special ? '!' : ''}`];
    }
    const text = texts[0] || '';
    this.waveText.setText(text).setColor(special ? COLORS.textBad : COLORS.text);
    this.waveBg.clear();
    this.wavePillRect = null;

    const counting = w.phase === 'countdown' && this.gs.tutorialDone;
    const canCall = (canStartWave(this.gs) || counting) && !this.world.editMode;
    this.earlyBtn.setVisible(canCall);
    this.cancelWaveBtn.setVisible(counting && canCall);
    if (!counting || !canCall) this.cancelWaveBtn.setY(-500);
    if (!text) { this.earlyBtn.setY(-500); return; }
    // Before a special wave the button turns red and says what's coming; at night it says the wave will be
    // restless (a special wave's hint comes first); in the countdown it's "Start Now". Its width follows the
    // hint, so the text never spills out of it.
    let bw = 0;
    if (canCall) {
      const nightHint = isDark(this.gs.clock) ? `Night: restless, +${Math.round(CONFIG.rules.night.lootBonus * 100)}% loot` : '';
      this.earlyBtn.color = special ? COLORS.buttonDanger : COLORS.buttonGood;
      if (counting) this.earlyBtn.setLabel('Start Now', 'Skip the countdown');
      else this.earlyBtn.setLabel('Start Wave', special ? special.hint : nightHint);
      const sub = this.earlyBtn.sub;
      sub.setScale(1);
      this.earlyBtn.label.setScale(1);
      bw = Math.min(SPECIAL_BTN_MAX, Math.max(EARLY_W, Math.ceil(sub.width) + 40));
      fitWidth(sub, bw - 28); // a very long hint shrinks to fit
      this.earlyBtn.resize(bw, EARLY_H);
    }
    // Center the pill (+ buttons, when shown) as one group near WAVE_CX, inside the free span between the profile
    // and the RP bar: the pill text steps down to a shorter version (then shrinks), and if that's still not
    // enough the Start button narrows (its hint shrinks with it).
    const span = waveSpan(this.profile ? this.profileRight : 0);
    this.waveSpanFor = this.profile ? this.profileRight : undefined;
    const avail = span.hi - span.lo;
    const widths = texts.map((t) => this.waveText.setScale(1).setText(t).width);
    let gap = (canCall ? EARLY_GAP + bw : 0) + (counting && canCall ? EARLY_GAP + CANCEL_W : 0);
    let fit = fitPill(avail, widths, gap);
    if (fit.overflow > 0 && canCall) {
      const nbw = Math.max(EARLY_W - 20, bw - Math.ceil(fit.overflow));
      gap -= bw - nbw;
      bw = nbw;
      const sub = this.earlyBtn.sub;
      sub.setScale(1);
      fitWidth(sub, bw - 28);
      fitWidth(this.earlyBtn.label, bw - 16);
      this.earlyBtn.resize(bw, EARLY_H);
      fit = fitPill(avail, widths, gap);
    }
    this.waveText.setText(texts[fit.index]).setScale(fit.scale);
    const tw = fit.pillW;
    const left = fitInSpan(span.lo, span.hi, tw + gap, WAVE_CX).left;
    this.waveText.setX(left + tw / 2);
    drawHudPill(this.waveBg, left, TOP_ROW_CY - PILL_H / 2, tw, PILL_H);
    this.wavePillRect = { x: left, y: TOP_ROW_CY - PILL_H / 2, w: tw, h: PILL_H };
    if (canCall) this.earlyBtn.setPosition(left + tw + EARLY_GAP + bw / 2, TOP_ROW_CY);
    else this.earlyBtn.setY(-500);
    if (counting && canCall) this.cancelWaveBtn.setPosition(left + tw + EARLY_GAP + bw + EARLY_GAP + CANCEL_W / 2, TOP_ROW_CY);
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
    this.settingsButton = img;
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
    return !isWaveActive(this.gs) && !this.world.editMode && tutorialAllows(this.gs, 'shop');
  }

  refreshShopButton() {
    this.shopButton.setAlpha(this.shopButtonEnabled() || this.shopOpen ? 1 : 0.4);
  }

  // ---------- ability hotbar (src/objects/AbilityHotbar.js): what keeps clear of it ----------
  /**
   * The hotbar (bottom middle: spells, Brisket Feast, Drop the Beat). Each frame it steps around the guide
   * bubble (and a tall info panel that can't move); when it moves, the info panel is placed again.
   * The quick bar sits above it (quickBarY).
   */
  layoutAroundAbilityBar() {
    const bar = this.abilityBar;
    if (!bar) return;
    bar.avoid = [this.guideRect()].filter(Boolean);
    bar.extraAvoid = this.infoPanel && this.infoPanel.visible && this.infoPanelBlocksBar
      ? { x: this.infoPanel.x, y: this.infoPanel.y, w: INFO_W, h: this.infoH || 0 } : null;
    const r = bar.rect();
    const key = r ? `${r.x},${r.y},${r.w},${r.h}` : '';
    if (key === this.abilityBarKey) return;
    this.abilityBarKey = key;
    if (this.infoPanel && this.infoPanel.visible) this.placeInfoPanel();
  }

  /** Screen rects of the fixed corner buttons (Settings, Shop, Edit), measured once at their resting size. */
  cornerButtonRects() {
    if (!this.cornerRects) {
      const rect = (img) => { const b = img.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      this.cornerRects = [this.settingsButton, this.shopButton, this.editButton].filter(Boolean).map(rect);
    }
    return this.cornerRects;
  }

  /**
   * The full info panel (top right, under the day/night pill) steps left when it would cover something: a tall
   * panel clears the Settings / Shop / Edit buttons, then the hotbar (to the hotbar's left if there's room, else
   * it stays and the hotbar steps left of it instead: infoPanelBlocksBar).
   */
  placeInfoPanel() {
    const h = this.infoH || 0;
    let x = INFO_X, y = INFO_Y;
    // Too tall to fit under the day/night pill (the Brisket King's Hero tab): it rises to just under the top
    // row instead, left of the pill.
    if (y + h > SCREEN.h - 8) {
      y = Math.max(INFO_TOP_MIN, SCREEN.h - 8 - h);
      const clock = this.clockRect || clockRect(130);
      x = Math.min(x, clock.x - 8 - INFO_W);
    }
    const at = (px) => ({ x: px, y, w: INFO_W, h });
    const fixed = this.cornerButtonRects();
    for (let i = 0; i < fixed.length; i++) {
      const hit = fixed.find((o) => rectsOverlap(at(x), o, 8));
      if (!hit) break;
      x = hit.x - 8 - INFO_W;
    }
    this.infoPanelBlocksBar = false;
    const r = this.abilityBar && this.abilityBar.naturalRect();
    if (r && rectsOverlap(at(x), r, 8)) {
      const left = r.x - 8 - INFO_W;
      if (left >= 16 && !fixed.some((o) => rectsOverlap(at(left), o, 8))) x = left; else this.infoPanelBlocksBar = true;
    }
    this.infoPanel.setX(Math.max(16, x)).setY(y);
    if (this.guide) this.refreshGuide(); // the bubble hides if the panel had to spread over it
  }

  // ---------- edit mode ----------
  /**
   * Buttons shown while a building is being placed or moved: "Rotate (R)" for walls, and on touch screens
   * Cancel and Place too (with a mouse: click to place, right-click / Esc to cancel).
   */
  buildRotateButton() {
    this.rotateBtn = new Button(this, 640, 628, 170, 52, IS_TOUCH ? 'Rotate' : 'Rotate (R)', () => this.world.rotatePlacement(), { fontSize: 19 });
    this.placeBtn = new Button(this, 640, 628, 160, 52, 'Place', () => this.world.confirmPlacement(), { color: COLORS.buttonGood, fontSize: 21 });
    this.cancelPlaceBtn = new Button(this, 640, 628, 160, 52, 'Cancel', () => this.world.cancelPlacement(), { color: COLORS.buttonDanger, fontSize: 21 });
    for (const b of [this.rotateBtn, this.placeBtn, this.cancelPlaceBtn]) b.setDepth(650);
    this.showPlacementButtons(null);
  }

  /** Lay out the placement buttons in a centered row: [Cancel] [Rotate] [Place]. `d`: placementChanged data. */
  showPlacementButtons(d) {
    const active = !!(d && d.active);
    const rotate = active && d.type === 'wall' && CONFIG.walls.segmentLength > 1; // single-tile walls don't turn
    const touch = active && this.world.touchMode;
    if (this.world.touchMode) this.rotateBtn.setLabel('Rotate');
    // Moving a building in edit mode, Cancel puts it back where it was.
    const mode = this.world.placement && this.world.placement.mode;
    this.cancelPlaceBtn.setLabel(mode === 'move' || mode === 'row' ? 'Put Back' : 'Cancel');
    const row = [touch && this.cancelPlaceBtn, rotate && this.rotateBtn, touch && this.placeBtn].filter(Boolean);
    for (const b of [this.rotateBtn, this.placeBtn, this.cancelPlaceBtn]) if (!row.includes(b)) b.setVisible(false).setY(-500);
    const gap = 14, rowW = row.reduce((t, b) => t + b.btnW, 0) + gap * (row.length - 1);
    let x = 640 - rowW / 2;
    let y = this.world.editMode ? HOTBAR.y - 90 : 628; // above the hotbar in edit mode
    // ...and lifted above the ability hotbar and the guide bubble when they're in the way.
    const h = 52, obstacles = [this.abilityBar && this.abilityBar.rect(), this.guideRect()];
    y = liftClear({ x, y: y - h / 2, w: rowW, h }, obstacles) + h / 2;
    for (const b of row) { b.setVisible(true).setPosition(x + b.btnW / 2, y); x += b.btnW + gap; }
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
      if (this.world.editMode) this.world.leaveEdit(); // asks first if the layout changed
      else this.world.setEditMode(true);
    });
    this.editButton = img;
    this.editButtonScale = s;
    this.editGlow = this.add.graphics();

    this.buildHotbar();
  }

  // ---------- layout editor hotbar (edit mode; GameScene keeps the draft, src/logic/layout.js) ----------
  buildHotbar() {
    const H = HOTBAR;
    const c = this.add.container(H.x, H.y).setDepth(600).setVisible(false);
    const bg = this.add.graphics();
    drawWindow(bg, 0, 0, H.w, H.h, { radius: 16 });
    bg.fillStyle(COLORS.frame, 0.25).fillRoundedRect(12, 12, H.w - 24, H.h - 24, 12);
    bg.fillStyle(COLORS.tray, 1).fillRoundedRect(14, 15, H.w - 28, H.h - 29, 11);
    // Clicking the hotbar itself stores the building being carried (or puts a hotbar one back).
    const zone = this.add.zone(0, 0, H.w, H.h).setOrigin(0).setInteractive();
    zone.on('pointerdown', () => { if (this.world.placement && !this.world.storeHeld()) this.world.cancelPlacement(); });
    this.hotbarEmpty = this.add.text(H.w / 2, H.h / 2, '', bodyStyle(17, COLORS.inkDim, { align: 'center' })).setOrigin(0.5);
    this.hotbarPrev = new Button(this, 34, H.h / 2, 34, 60, '', () => { this.hotbarPage--; this.refreshHotbar(); }, { icon: 'left', radius: 9, color: COLORS.buttonDark });
    this.hotbarNext = new Button(this, H.w - 34, H.h / 2, 34, 60, '', () => { this.hotbarPage++; this.refreshHotbar(); }, { icon: 'right', radius: 9, color: COLORS.buttonDark });
    this.hotbarCards = this.add.container(0, 0);
    c.add([bg, zone, this.hotbarEmpty, this.hotbarCards, this.hotbarPrev, this.hotbarNext]);
    this.hotbar = c;
    this.hotbarPage = 0;

    // Actions above the hotbar (right) and a hint (left).
    const ay = H.y - 32;
    this.editHintBg = this.add.graphics().setDepth(600).setVisible(false);
    this.editHint = this.add.text(H.x + 22, ay, 'Click a building to pick it up · click the hotbar to store it', textStyle(16)).setOrigin(0, 0.5).setDepth(601).setVisible(false);
    const right = H.x + H.w;
    this.layoutSave = new Button(this, right - 70, ay, 140, 46, 'Save', () => this.world.saveLayout(), { color: COLORS.buttonGood, fontSize: 20, radius: 12 });
    this.layoutCancel = new Button(this, right - 70 - 150, ay, 140, 46, 'Cancel', () => this.world.leaveEdit(), { color: COLORS.buttonDark, fontSize: 20, radius: 12 });
    this.layoutRemoveAll = new Button(this, right - 70 - 150 - 170, ay, 160, 46, 'Remove All', () => this.world.storeAllBuildings(), { color: COLORS.button, fontSize: 20, radius: 12 });
    for (const b of [this.layoutSave, this.layoutCancel, this.layoutRemoveAll]) b.setDepth(601).setVisible(false);
    this.buildShiftPad();
    // Select Row: green while on (like a selected tab).
    this.rowBtn = new Button(this, ROW_BTN.x, ROW_BTN.y, ROW_BTN.w, ROW_BTN.h, 'Select Row', () => this.world.setRowSelect(!this.world.rowSelect),
      { color: COLORS.buttonDark, fontSize: 19, radius: 12 });
    this.rowBtn.setDepth(601).setVisible(false);
  }

  /** The Select Row toggle's look (green + "On" while on) and the hint that goes with it. */
  refreshRowSelect() {
    const on = !!this.world.rowSelect;
    this.rowBtn.color = on ? COLORS.buttonGood : COLORS.buttonDark;
    this.rowBtn.setLabel('Select Row', on ? 'On: click a wall' : '');
    this.editHint.setText(on ? 'Click a wall to pick up its whole row · click again to drop it'
      : 'Click a building to pick it up · click the hotbar to store it');
  }

  /**
   * Shift pad (left, above the hotbar): four round arrows along the map's diagonal grid lines that slide the
   * whole placed layout one tile (GameScene.shiftWholeLayout; nothing changes until Save).
   */
  buildShiftPad() {
    const P = SHIFT_PAD;
    const c = this.add.container(P.x, P.y).setDepth(601).setVisible(false);
    const bg = this.add.graphics();
    drawHudPill(bg, -P.dx - 30, -P.dy - 30, (P.dx + 30) * 2, (P.dy + 30) * 2);
    c.add([bg, this.add.text(0, 0, 'Shift', textStyle(15)).setOrigin(0.5)]);
    // Each button sits in its corner; its arrow points along the grid line it moves the layout
    // (screen angle of one tile step: col+1 runs down-right, row+1 down-left).
    const a = Math.atan2(MAP.tileHeight / 2, MAP.tileWidth / 2);
    const dirs = [[1, 0, a, 1, 1], [0, 1, Math.PI - a, -1, 1], [-1, 0, Math.PI + a, -1, -1], [0, -1, -a, 1, -1]];
    for (const [dc, dr, ang, sx, sy] of dirs) {
      const b = new Button(this, sx * P.dx, sy * P.dy, 40, 40, '', () => this.world.shiftWholeLayout(dc, dr), { circle: true, color: COLORS.buttonBlue });
      const arrow = this.add.graphics();
      drawAngledArrow(arrow, 0, -2, 24, ang);
      b.add(arrow);
      c.add(b);
    }
    this.shiftPad = c;
  }

  /** Show / hide the editor and rebuild the hotbar cards from the draft. */
  refreshHotbar() {
    const world = this.world, on = !!(world.editMode && world.layout);
    this.hotbar.setVisible(on);
    for (const o of [this.layoutSave, this.layoutCancel, this.layoutRemoveAll, this.editHint, this.editHintBg]) o.setVisible(on);
    // The shift pad, while anything is placed (it moves out of the way when hidden so it never blocks clicks).
    const canShift = on && world.layout.stored.length < this.gs.buildings.length;
    this.shiftPad.setVisible(canShift).setY(canShift ? SHIFT_PAD.y : -500);
    // Select Row, while any wall is placed.
    const walls = on && this.gs.buildings.some((b) => b.type === 'wall' && !isStoredIn(world.layout, b.id));
    this.rowBtn.setVisible(walls).setY(walls ? ROW_BTN.y : -500);
    if (on) this.refreshRowSelect();
    for (const b of [this.layoutSave, this.layoutCancel, this.layoutRemoveAll]) b.setY(on ? HOTBAR.y - 32 : -500);
    this.hotbarCards.removeAll(true);
    if (!on) return;
    const H = HOTBAR;
    this.editHintBg.clear();
    drawHudPill(this.editHintBg, H.x, H.y - 53, this.editHint.width + 44, 42);

    const groups = hotbarGroups(this.gs, world.layout);
    const left = world.layout.stored.length;
    this.layoutSave.setEnabled(left === 0);
    this.layoutSave.setLabel('Save', left ? `${left} to place` : '');
    this.layoutRemoveAll.setEnabled(left < this.gs.buildings.length);
    this.hotbarEmpty.setText(groups.length ? '' : 'Everything is placed. Save to keep this layout, or click a building to pick it up.');

    // Paging: as many cards as fit between the arrows.
    const x0 = 64, x1 = H.w - 64, cw = HOTBAR_CARD.w, gap = HOTBAR_CARD.gap;
    const perPage = Math.max(1, Math.floor((x1 - x0 + gap) / (cw + gap)));
    const pages = Math.max(1, Math.ceil(groups.length / perPage));
    this.hotbarPage = Math.max(0, Math.min(this.hotbarPage, pages - 1));
    this.hotbarPrev.setVisible(pages > 1).setEnabled(this.hotbarPage > 0);
    this.hotbarNext.setVisible(pages > 1).setEnabled(this.hotbarPage < pages - 1);
    const shown = groups.slice(this.hotbarPage * perPage, (this.hotbarPage + 1) * perPage);
    const held = world.placement && world.placement.fromHotbar ? world.placement : null;
    const startX = x0 + (x1 - x0 - (shown.length * (cw + gap) - gap)) / 2;
    shown.forEach((grp, i) => this.hotbarCards.add(this.makeHotbarCard(grp, startX + i * (cw + gap), (H.h - HOTBAR_CARD.h) / 2, held)));
  }

  /** One hotbar card: the building's picture, its level, and how many are waiting. Click to place the next one. */
  makeHotbarCard(grp, x, y, held) {
    const { w, h } = HOTBAR_CARD;
    const card = this.add.container(x, y);
    const g = this.add.graphics();
    const tileY = h - 24;
    drawShowcaseCard(g, 0, 0, w, h, { tileY, tileW: 28 });
    const active = held && held.type === grp.type && held.level === grp.level;
    if (active) g.lineStyle(3, 0xffe066, 1).strokeRoundedRect(1, 1, w - 2, h - 2, 12);
    const icon = this.add.image(w / 2, tileY + 8, buildingTextureKey(this, grp.type, grp.level)).setOrigin(0.5, 1);
    fitIcon(icon, w - 18, h - 26);
    const lv = this.add.text(8, h - 6, `Lv ${grp.level}`, textStyle(13)).setOrigin(0, 1);
    const badge = this.add.graphics();
    drawBadge(badge, w - 14, 14, 13);
    const count = this.add.text(w - 14, 13, `${grp.ids.length}`, textStyle(grp.ids.length > 99 ? 11 : 14)).setOrigin(0.5);
    const hover = this.add.graphics().setVisible(false);
    hover.fillStyle(0xffffff, 0.16).fillRoundedRect(3, 3, w - 6, h - 6, 10);
    const zone = this.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => hover.setVisible(true));
    zone.on('pointerout', () => hover.setVisible(false));
    zone.on('pointerdown', () => {
      // Carrying a building from the map: it goes into the hotbar first.
      if (this.world.placement && !this.world.placement.fromHotbar) this.world.storeHeld();
      this.world.pickFromHotbar(grp.type, grp.level);
    });
    card.add([g, icon, lv, hover, badge, count]);
    if (grp.type === 'altar') card.add(addHeroBadge(this, 16, 18, 24)); // the Brisket King's portrait
    card.add(zone);
    return card;
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
    this.refreshHotbar();
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
    // Page arrows (shown only when a tab has more cards than fit), left of the close button.
    this.shopPage = 0;
    const pgY = headerMid - 2;
    // Blue like every other paging arrow (How to Play); greyed-down blue at the first / last page.
    const arrow = { radius: 10, color: COLORS.buttonBlue, disabledColor: COLORS.buttonBlueDisabled };
    this.shopPrev = new Button(this, 884, pgY, 44, 40, '', () => { this.shopPage--; this.refreshShop(); }, { icon: 'left', ...arrow });
    this.shopPageText = this.add.text(948, pgY, '', textStyle(18)).setOrigin(0.5);
    this.shopNext = new Button(this, 1012, pgY, 44, 40, '', () => { this.shopPage++; this.refreshShop(); }, { icon: 'right', ...arrow });
    c.add([this.shopPrev, this.shopPageText, this.shopNext]);

    this.cardLayer = this.add.container(0, 0);
    c.add(this.cardLayer);

    // Footer: hint on the left, gold / capacity in a dark pill in the middle.
    const fy = FOOTER.y + FOOTER.h / 2 - 2;
    c.add(this.add.text(TRAY.x + 18, fy, IS_TOUCH ? 'Tap a building, drag it where you want it, then tap Place' : 'Pick a building, then click the map to place it', textStyle(15)).setOrigin(0, 0.5));
    // Village Hall 11: how many of its Bonus Slots are used (center of the footer).
    this.footerPool = this.add.text(SHOP_W / 2 - 40, fy, '', textStyle(16)).setOrigin(0.5);
    c.add(this.footerPool);
    this.footerPill = this.add.graphics();
    this.footerGold = this.add.text(0, fy, '', textStyle(18)).setOrigin(1, 0.5);
    this.footerCoin = this.add.image(0, fy, TEX.coin);
    this.footerCoin.setScale(30 / this.footerCoin.frame.height);
    c.add([this.footerPill, this.footerGold, this.footerCoin]);
    this.shopPanel = c;
  }

  refreshShopFooter() {
    const fy = FOOTER.y + FOOTER.h / 2 - 2;
    const bonus = bonusActive(this.gs.townHallLevel);
    this.footerPool.setVisible(bonus).setText(bonus ? `Bonus Slots ${bonusSlotsUsed(this.gs)} / ${bonusSlotCount(this.gs.townHallLevel)}` : '');
    this.footerGold.setText(`${formatSpaced(this.gs.gold)} / ${formatSpaced(this.gs.capacity)}`);
    const w = this.footerGold.width + 56, right = SHOP_W - TRAY.x - 40;
    this.footerPill.clear().fillStyle(0x000000, 0.4).fillRoundedRect(right - w, fy - 13, w, 26, 13);
    this.footerCoin.setX(right - 4);
    this.footerGold.setX(right - 26);
  }

  /**
   * How many more of this tab's buildings the Village Hall level still allows under their caps. (Village Hall 11's
   * Bonus Slots aren't counted per tab: they're shared by every tab, and the footer shows them.)
   */
  tabBuildable(types) {
    const th = this.gs.townHallLevel;
    return types.reduce((n, t) => n + Math.max(0, limitFor(t, th) - countOwned(this.gs.buildings, t)), 0);
  }

  setShopTab(tab) {
    if (tab !== this.shopTab) this.shopPage = 0;
    this.shopTab = tab;
    this.refreshShop();
  }

  toggleShop() {
    if (this.shopOpen) this.closeShop();
    else this.openShop();
  }

  openShop() {
    if (!this.shopButtonEnabled()) return;
    if (this.world.placement) this.world.cancelPlacement();
    if (this.selectedId) this.world.select(null);
    this.shopOpen = true;
    // RV Lab guide, "build one": open on the Economy tab, where the RV Lab is.
    if (labGuideStep(this.gs)?.key === 'build' && !isGuideVisible(this.gs)) this.shopTab = 'economy';
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
    // Every card is the same size; a tab with more cards than fit gets pages (arrows in the header).
    const { x0, gap, perPage } = shopCardGrid();
    const pages = Math.max(1, Math.ceil(types.length / perPage));
    this.shopPage = Math.max(0, Math.min(this.shopPage || 0, pages - 1));
    this.shopPrev.setVisible(pages > 1).setEnabled(this.shopPage > 0);
    this.shopNext.setVisible(pages > 1).setEnabled(this.shopPage < pages - 1);
    this.shopPageText.setVisible(pages > 1).setText(`${this.shopPage + 1} / ${pages}`);
    types.slice(this.shopPage * perPage, (this.shopPage + 1) * perPage).forEach((type, i) => {
      this.cardLayer.add(this.makeCard(type, x0 + i * (SHOP_CARD_W + gap), CARD_Y, SHOP_CARD_W, CARD_H));
    });
  }

  /** Short trait line for the bottom-left of a shop card. */
  cardTrait(type, narrow = false) {
    if (type === 'flock') return narrow ? 'Reveals' : 'Reveals & marks';
    if (type === 'mousetrap') return 'Hidden trap';
    if (type === 'ra') return narrow ? 'Beam' : 'Beam · Ground & Air';
    if (type === 'ksi') return narrow ? 'Slows' : 'Slows · Ground & Air';
    if (isDefense(type)) {
      const cfg = typeConfig(type);
      return cfg.hitsGround && cfg.hitsAir ? 'Ground & Air' : cfg.hitsAir ? 'Air only' : 'Ground only';
    }
    if (type === 'mine') return `+${levelStats('mine', 1).production} / s`;
    if (type === 'storage') return `Holds ${formatGold(levelStats('storage', 1).capacity)}`;
    if (type === 'house') return `+${levelStats('house', 1).gnomes} gnome workers`;
    if (type === 'wall') return CONFIG.walls.segmentLength > 1 ? `${CONFIG.walls.segmentLength}-tile segment` : 'Joins any wall';
    if (type === 'rvlab') return 'Defense abilities';
    if (type === 'dj') return 'Boosts gnomes and defenses';
    if (type === 'fuelStation') return narrow ? 'Spells' : 'Brews spells (Burgers)';
    if (type === 'altar') return narrow ? 'Hero' : 'Hero: the Brisket King';
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

    // (Walls show the village's wall level: new walls are placed at it.)
    const icon = this.add.image(cx, tileY + thh * 0.6, buildingTextureKey(this, type, type === 'wall' ? wallLevel(this.gs) : 1)).setOrigin(0.5, 1);
    fitIcon(icon, w - 46, 96);
    if (locked) { icon.setTint(0x9a9a9a); icon.setAlpha(0.55); }

    // Name top-left (wraps short of the info button).
    const name = this.add.text(10, 7, buildingName(type), textStyle(w < 200 ? 16 : 17, COLORS.text, { wordWrap: { width: w - 44 } }));
    // A long name steps down font sizes until it takes two lines (three small ones at the very worst, which still
    // end well above the lock text and the icon).
    for (let size = (w < 200 ? 16 : 17) - 1; size >= 13 && name.height > size * 2.7; size--) name.setFontSize(size);
    if (name.height > 13 * 3.6) name.setScale((13 * 3.6) / name.height);
    // Bottom row: trait on the left, "Built: n/max" on the right.
    const rowY = h - 40;
    const trait = this.add.text(10, rowY, this.cardTrait(type, w < 130), textStyle(13)).setOrigin(0, 1);
    const builtLabel = this.add.text(w - 10, rowY - 17, type === 'wall' ? 'Walls:' : 'Built:', textStyle(11)).setOrigin(1, 1);
    // (Village Hall 11: copies past the cap are in Bonus Slots; the count turns gold.)
    const owned = countOwned(this.gs.buildings, type), cap = limitFor(type, th);
    const built = this.add.text(w - 10, rowY + 1, `${owned}/${cap}`, textStyle(16, owned > cap && type !== 'wall' ? COLORS.textGold : COLORS.text)).setOrigin(1, 1);
    // Narrow cards (a full Defenses tab): wrap the trait onto a second line (growing upward) so it never runs
    // into the Built count.
    const room = w - 10 - Math.max(built.width, builtLabel.width) - 6 - 10;
    if (trait.width > room) { trait.setFontSize(12); trait.setWordWrapWidth(room, true); }
    drawCardStrip(g, 6, h - 36, w - 12);
    const cost = this.add.text(0, h - 22, formatGold(buildCost(type, this.gs)), textStyle(20, short ? COLORS.textBad : COLORS.text)).setOrigin(0.5);
    const coin = this.add.image(0, h - 21, TEX.coin);
    coin.setScale(24 / coin.frame.height);
    const pw = cost.width + 6 + 24;
    cost.setX(w / 2 - pw / 2 + cost.width / 2);
    coin.setX(w / 2 + pw / 2 - 12);
    card.add([g, icon, name, trait, builtLabel, built, cost, coin]);
    // Village Hall 11: at its cap, the next one goes in a Bonus Slot (a gold tag over the bottom of the picture; also
    // while the card is locked for gold or a wave, below that lock's pill).
    if (nextTakesBonusSlot(this.gs, type) && bonusSlotsFree(this.gs) > 0) {
      const tag = this.add.text(cx, rowY - 37, `Bonus Slot · ${bonusSlotsFree(this.gs)} left`, textStyle(13, COLORS.text)).setOrigin(0.5);
      fitWidth(tag, w - 26);
      const tg = this.add.graphics();
      drawGlossy(tg, cx - tag.displayWidth / 2 - 9, tag.y - 11, tag.displayWidth + 18, 22, 0xf2b632, { radius: 11, lip: 2, shadow: false });
      card.add([tg, tag]);
    }
    // The Brisket King's altar: his portrait beside it.
    if (type === 'altar') { const hb = addHeroBadge(this, w - 30, tileY - 22, 38); if (locked) hb.setAlpha(0.55); card.add(hb); }
    if (locked) {
      const lock = this.add.text(cx, Math.round(h * 0.42), this.lockedText(st.reason), textStyle(14, COLORS.text, { align: 'center', wordWrap: { width: w - 16 } })).setOrigin(0.5);
      fitWidth(lock, w - 20);
      const pill = this.add.graphics();
      const pw = lock.displayWidth + 18, ph = lock.displayHeight + 10;
      pill.fillStyle(0x000000, 0.62).fillRoundedRect(cx - pw / 2, lock.y - ph / 2, pw, ph, 10);
      card.add([pill, lock]);
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
    const allowed = th < unlock ? `Unlocks at VH${unlock}`
      : `${type === 'wall' ? 'Walls' : 'Built'} ${countOwned(this.gs.buildings, type)} / ${limitNow} at VH${th}`;
    const costText = type === 'wall' ? `Cost ${formatGold(buildCost(type, this.gs))} (Level ${wallLevel(this.gs)})` : `Cost ${formatGold(buildCost(type, this.gs))}`;
    c.add(this.add.text(18, header + 16, `${costText} · ${allowed}`, bodyStyle(14, COLORS.inkAccent)));
    // Village Hall 11's Bonus Slots: how extra copies of this type work.
    const poolNote = takesBonusSlot(type) && bonusActive(th) && limitNow > 0
      ? `
Bonus Slots: past ${limitNow}, each ${buildingName(type)} takes one of your ${bonusSlotCount(th)} Bonus Slots (${bonusSlotsFree(this.gs)} free), at the normal price. Sell one to free its slot.` : '';
    const desc = this.add.text(18, header + 40, (BUILDING_DESCRIPTIONS[type] || '') + poolNote, bodyStyle(14, COLORS.ink, { wordWrap: { width: W - 36 }, lineSpacing: 3 }));
    c.add(desc);
    const top = desc.y + desc.height + 14;
    // Level 1 picture on the left (labelled on the card, which saves a title row), Level 1 stats beside it.
    const picG = this.add.graphics();
    c.add(picG);
    c.add(this.drawBuildingPic(picG, PIC.x, top, buildingTextureKey(this, type, 1)));
    if (type === 'altar') c.add(addHeroBadge(this, PIC.x + PIC.w - 24, top + 24, 36)); // the Brisket King's portrait
    c.add(this.add.text(PIC.x + 10, top + 6, 'Level 1', textStyle(15)));
    const col = PIC.x + PIC.w + 16;
    const preview = { type, level: 1, hp: levelStats(type, 1).hp, destroyed: false, stock: 0, ...footprintDims(type) };
    let y = Math.max(this.drawStats(c, preview, col, top, W - col - 18, true), top + PIC.h) + 14;
    const altar = type === 'altar' ? getAltar(this.gs) : null;
    if (altar) {   // the Brisket King's altar: a shortcut to his hero page, a full-width button under the card
      const bw = W - 36, bh = 46;
      const open = new Button(this, W / 2, y + bh / 2, bw, bh, 'Open Brisket King', () => {
        this.hideShopInfo();
        this.closeShop();
        this.world.select(altar.id);
        this.infoTab = 'hero';
        this.openInfo();
      }, { color: COLORS.buttonBlue, fontSize: 19 });
      open.add(addHeroBadge(this, -bw / 2 + 28, -2, 32)); // his portrait at the button's left end
      c.add(open);
      y += bh + 16;
    }
    const close = new Button(this, W - 10, 10, 40, 40, '', () => this.hideShopInfo(), { color: COLORS.buttonDanger, icon: 'x', radius: 9 });
    c.add(close);
    drawWindow(bg, 0, 0, W, y, { header });
    blocker.setSize(W, y);
    // Above the shop, left of the day/night pill; a tall one (the altar's) stops just under the top row and
    // overlaps the shop's header instead of the top row.
    const popTop = Math.max(INFO_TOP_MIN, SHOP_OPEN_Y - y - 8);
    const clock = this.clockRect || clockRect(130);
    c.setPosition(popTop < clock.y + clock.h + 8 ? Math.min(x, clock.x - 8 - W) : x, popTop);
    this.shopInfo = c;
    this.shopInfoH = y;
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
    fitIcon(pic, PIC.w - 24, PIC.h - 44);
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
    // The Brisket King's portrait on his altar's picture (not on the Hero tab, which shows the king himself).
    this.infoHeroBadge = addHeroBadge(this, PIC.x + PIC.w - 24, INFO_PIC_Y + 24, 36).setVisible(false);
    this.infoPicKey = null;
    this.infoTab = 'info';
    const tabW = (INFO_COL_W - 8) / 2;
    this.infoTabs = {
      info: new Button(this, INFO_COL + tabW / 2, INFO_TABS_Y, tabW, 32, 'Info', () => { this.infoTab = 'info'; this.refreshInfo(); }, { fontSize: 17, radius: 9 }),
      stats: new Button(this, INFO_COL + tabW * 1.5 + 8, INFO_TABS_Y, tabW, 32, 'Stats', () => { this.infoTab = 'stats'; this.refreshInfo(); }, { fontSize: 17, radius: 9 }),
      // The Brisket King's altar gets a third tab: the hero himself (layoutInfoTabs).
      hero: new Button(this, 0, INFO_TABS_Y, tabW, 32, 'Hero', () => { this.infoTab = 'hero'; this.refreshInfo(); }, { fontSize: 17, radius: 9 })
    };
    const bw = INFO_W - 32;
    this.infoButtons = {
      upgrade: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Upgrade', () => this.onUpgrade(), { color: COLORS.buttonGood, fontSize: 19 }),
      sell: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Sell', () => this.gs.sellBuilding(this.selectedId), { color: COLORS.buttonDanger, fontSize: 19 }),
      repair: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Repair', () => this.gs.repair(this.selectedId), { color: COLORS.buttonGood, fontSize: 19 }),
      // RV Lab abilities: a defense's own tiers, or the RV Lab's research.
      abilities: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Abilities', () => this.openAbilities(), { color: COLORS.button, fontSize: 19 }),
      research: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Research', () => this.openResearch(), { color: COLORS.button, fontSize: 19 }),
      // Fuel Station: its brewing window.
      brew: new Button(this, INFO_W / 2, 0, bw, INFO_BTN_H, 'Brew Spells', () => this.openFuelStation(), { color: 0x8e5bd6, fontSize: 19 })
    };
    const close = new Button(this, INFO_W - 12, 12, 42, 40, '', () => this.world.select(null), { color: COLORS.buttonDanger, icon: 'x', radius: 9 });
    c.add([this.infoBg, this.infoBlocker, this.infoName, this.infoLevel, this.infoPicBg, this.infoPic, this.infoHeroBadge, this.infoContent,
      ...Object.values(this.infoTabs), ...Object.values(this.infoButtons), close]);
    this.infoPanel = c;
    this.hideInfo();
  }

  /**
   * Info panel picture: the map's art for the current level, held still (or this building's rubble when
   * destroyed). Checked every frame too, because the map swaps its sprite a frame after the state changes.
   */
  syncInfoPic(b = this.gs.getBuilding(this.selectedId)) {
    if (!b) return;
    const view = this.world.views && this.world.views.buildings.get(b.id);
    // A static picture: never the map's turning / filling variants (cannon facings, storage fill). Only rubble
    // copies the map, so it shows the same pile.
    let picKey = b.destroyed && view && view.sprite ? view.sprite.texture.key : buildingTextureKey(this, b.type, b.level, b.destroyed);
    // The Hero tab shows the Brisket King himself (asleep when he is).
    if (b.type === 'altar' && this.infoTab === 'hero') {
      const hs = this.gs.hero && this.gs.hero.status;
      const k = hs === 'down' ? 'hero_brisket_defeated' : hs === 'asleep' ? 'hero_brisket_sleep' : 'hero_brisket';
      if (this.textures.exists(k)) picKey = k;
    }
    this.infoHeroBadge.setVisible(b.type === 'altar' && this.infoTab !== 'hero');
    if (picKey === this.infoPicKey) return;
    this.infoPicKey = picKey;
    this.infoPicBg.clear();
    this.drawBuildingPic(this.infoPicBg, PIC.x, INFO_PIC_Y, picKey, this.infoPic);
  }

  hideInfo() {
    const was = this.infoPanel.visible;
    this.infoPanel.setVisible(false).setX(2000);
    if (was && this.guide) this.refreshGuide(); // back, if a tall panel had hidden it
  }

  // ---------- RV Lab windows ----------
  /** The selected defense's ability tree: the RV Lab's research window, opened on its type. */
  openAbilities() {
    const b = this.gs.getBuilding(this.selectedId);
    if (!b || !hasAbilities(b.type) || Modal.isOpen(this)) return;
    // The guide bubble hides while a window is open (the window shows the guide's hint) and comes back after.
    openResearchWindow(this, this.gs, { startType: b.type, onClose: () => this.refreshGuide() }); // its tree in the RV Lab
    this.refreshGuide();
  }

  /** The Fuel Station's brewing window (its Perks button opens its tree in the RV Lab window). */
  openFuelStation() {
    if (Modal.isOpen(this)) return;
    openFuelStationWindow(this, this.gs, {
      onClose: () => this.refreshGuide(),
      onPerks: () => { openResearchWindow(this, this.gs, { startType: 'fuelStation', onClose: () => this.refreshGuide() }); this.refreshGuide(); }
    });
    this.refreshGuide();
  }

  /** The RV Lab's research window. */
  openResearch() {
    if (Modal.isOpen(this)) return;
    openResearchWindow(this, this.gs, { onClose: () => this.refreshGuide() });
    this.refreshGuide();
    this.gs.emit('researchOpened', {}); // RV Lab guide
  }

  /** Abilities / Research button state for building b: { show, label, sub, ok }. */
  abilityButtonState(b) {
    if (b.type === 'rvlab') {
      const lvl = b.destroyed ? 0 : b.level;
      return { show: true, key: 'research', label: 'Research', sub: lvl ? `Tiers 1-${lvl}` : 'Rebuild first', ok: !b.destroyed };
    }
    if (b.type === 'fuelStation') {
      // Its perks are in the RV Lab (Economy tab, or the Perks button in its window); this opens the brewing.
      const n = brewedSpells(this.gs).length, slots = spellSlots(this.gs);
      return { show: true, key: 'brew', label: this.infoOpen ? 'Brew Spells' : 'Brew', sub: b.destroyed ? 'Rebuild first' : `${n} / ${slots} spells`, ok: !b.destroyed };
    }
    if (!hasAbilities(b.type)) return { show: false };
    const ready = canResearchFor(this.gs, b.type);
    const sub = ready ? 'Research ready!' : labLevel(this.gs) ? '' : 'Needs an RV Lab';
    return { show: true, key: 'abilities', label: 'Abilities', sub, ok: true };
  }

  onUpgrade() {
    const b = this.gs.getBuilding(this.selectedId);
    if (!b) return;
    if (b.type === 'wall') this.gs.upgradeWalls(); // Upgrade Walls: every wall at once
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
    if (b.type === 'ksi') rows.push(row('Chill (slow)', 'slow', 0x8fd8ff, { unit: '%', fmt: (v) => String(Math.round(v * 100)) }));
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
      // With this building's ability tiers (and a Commander aura) applied; the shop preview shows the base.
      const r2 = (v) => Math.round(v * 100) / 100;
      const range = preview ? cfg.range : r2(towerRange(b)), minRange = preview ? cfg.minRange : r2(towerMinRange(b));
      const every = preview ? cfg.fireInterval : r2(towerFireInterval(b));
      const notes = [`Range ${tiles(range)}${minRange ? ` (not within ${minRange})` : ''}`, `Fires every ${every} s`];
      notes.push(`Hits ${cfg.hitsGround && cfg.hitsAir ? 'ground & air' : cfg.hitsAir ? 'air only' : 'ground only'}${cfg.splashRadius ? ` · splash ${tiles(cfg.splashRadius)}` : ''}`);
      if (cfg.pool) notes.push(`Pink pool ${tiles(cfg.pool.radius * 2)} wide for ${cfg.pool.duration} s · slows ${Math.round(cfg.pool.slow * 100)}%`);
      if (cfg.chill) notes.push(`Chills everything splashed for ${cfg.chill.seconds} s · bosses take half`);
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
      return [`Stock now ${formatGold(b.stock || 0)} / ${formatGold(Math.round(mineStockCap(b)))}`,
        `Gnome workers: ${crew.length} / ${V.maxPerMine} (+${pct(extra)} carried to storage)`];
    }
    if (b.type === 'wall') return [CONFIG.walls.segmentLength > 1 ? `Segment of ${CONFIG.walls.segmentLength} tiles` : 'Joins every wall it touches'];
    if (b.type === 'altar') {
      const st = heroStats(b), h = this.gs.hero;
      const status = !h ? '' : h.status === 'asleep' ? `asleep (${Math.floor(Math.ceil(h.sleepT) / 60)}:${String(Math.ceil(h.sleepT) % 60).padStart(2, '0')})` : h.status === 'waking' ? 'waking up' : 'ready';
      return [`Brisket King Lv ${b.level}: ${formatGold(st.maxHp)} HP, ${formatGold(Math.round(st.damage))} per hit${preview ? '' : ` · ${status}`}`,
        `Guards ${st.guardRange} tiles · Brisket Feast ${st.feastCharges}x per wave`];
    }
    if (b.type === 'dj') {
      const s = djStats(b);
      return [`Gnomes in range work +${s.gnomeBoostPct}% faster · range ${s.range} tiles`,
        `Hype ${Math.floor(b.hype || 0)} / ${hypeNeeded(b)}: full, use its hotbar slot in a wave to Drop the Beat (+${s.beatPct}% fire rate, ${s.beatSeconds} s)`];
    }
    if (b.type === 'fuelStation') {
      const names = (lvl) => SPELL_KINDS.filter((k) => spellConfig(k).level === lvl).map((k) => spellFullName(k));
      const open = SPELL_KINDS.filter((k) => spellConfig(k).level <= b.level).map((k) => spellConfig(k).name);
      const next = b.level < maxLevel('fuelStation') ? names(b.level + 1) : [];
      return [`Brews ${open.join(', ')}`, `Spell slots: ${spellSlots(this.gs)} (more with the Village Hall) · ${brewedSpells(this.gs).length} brewed`,
        next.length ? `Level ${b.level + 1} adds ${next.join(' and ')}` : 'Every spell unlocked'];
    }
    if (b.type === 'rvlab') {
      const next = b.level < maxLevel('rvlab') ? levelStats('rvlab', b.level + 1) : null;
      return [`Researches ability tiers 1-${b.level}`, next ? `Level ${b.level + 1} (tier ${b.level + 1}) needs Village Hall ${next.townHall}` : 'Every tier unlocked'];
    }
    if (b.type === 'townHall') {
      const rate = hallIncomeRate(b.level);
      const next = nextWaveInfo(this.gs);
      // The level before the Bonus Slots': say what the next upgrade brings.
      const poolNext = b.level === bonusTownHall() - 1 ? [`Level ${bonusTownHall()}: ${CONFIG.rules.bonusSlots.count} Bonus Slots (extra buildings of any kind)`] : [];
      return [`Next attack: wave ${next.number}${next.specialInfo ? ` (${next.specialInfo.name})` : ''}`, ...(rate > 0 ? [`Makes ${rate} gold / s on its own`] : []), ...poolNext];
    }
    return [];
  }

  /** Info / Stats tabs, plus Hero for the Brisket King's altar (three narrower tabs then). */
  layoutInfoTabs(b) {
    const hero = b.type === 'altar';
    if (!hero && this.infoTab === 'hero') this.infoTab = 'info';
    const keys = hero ? ['info', 'stats', 'hero'] : ['info', 'stats'];
    const gap = 6, w = (INFO_COL_W - gap * (keys.length - 1)) / keys.length;
    this.infoTabs.hero.setVisible(hero);
    keys.forEach((k, i) => {
      const t = this.infoTabs[k];
      if (t.btnW !== w) t.resize(w);
      t.setPosition(INFO_COL + w / 2 + i * (w + gap), INFO_TABS_Y);
    });
  }

  /**
   * The Hero tab: the Brisket King's level, then (like the Stats tab and the Gnome Worker card) his stats as rows,
   * value on the right with the next altar level's gain in green: what he's doing (ready, asleep with the time
   * left, waking up), health (now / max), damage, attack speed, guard range. Under the picture, across the panel,
   * his ability's card (drawFeastCard). Returns the y below.
   */
  drawHeroInfo(box, b, y) {
    const st = heroStats(b), h = this.gs.hero;
    const nxt = b.level < maxLevel('altar') ? heroStats({ ...b, level: b.level + 1 }) : null;
    const name = this.add.text(INFO_COL, y, `${CONFIG.altar.heroName}`, textStyle(19));
    box.add(name);
    box.add(this.add.text(name.x + name.width + 8, y + 4, `Lv ${b.level}`, textStyle(15, COLORS.textGold)));
    y += 32;
    const fmt = (n) => formatGold(Math.round(n));
    const left = h ? Math.ceil(h.sleepT) : 0;
    const status = !h ? '-' : h.status === 'down' ? 'Knocked out' : h.status === 'asleep' ? `Asleep · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
      : h.status === 'waking' ? 'Waking up' : 'Ready';
    const rows = [
      ['Status', status, '', h && (h.status === 'asleep' || h.status === 'down') ? COLORS.inkBad : COLORS.inkGood],
      ['Health', `${fmt(h ? Math.max(0, h.hp) : st.maxHp)} / ${fmt(st.maxHp)}`, nxt ? `+${fmt(nxt.maxHp - st.maxHp)}` : ''],
      ['Damage', `${fmt(st.damage)} per hit`, nxt ? `+${fmt(nxt.damage - st.damage)}` : ''],
      ['Attack speed', `${Math.round((1 / st.attackInterval) * 100) / 100} ${Math.abs(1 / st.attackInterval - 1) < 0.005 ? 'hit' : 'hits'} / s`, ''],
      ['Guard range', `${st.guardRange} tiles`, nxt && nxt.guardRange > st.guardRange ? `+${nxt.guardRange - st.guardRange}` : '']
    ];
    const g = this.add.graphics();
    box.add(g);
    for (const [i, [label, value, gain, ink]] of rows.entries()) {
      if (i > 0) g.fillStyle(COLORS.frame, 0.12).fillRect(INFO_COL, y - 3, INFO_COL_W, 1);
      box.add(this.add.text(INFO_COL, y, label, bodyStyle(14, COLORS.inkDim)));
      const v = this.add.text(INFO_COL + INFO_COL_W, y, value, bodyStyle(14, ink || COLORS.ink, ink ? { fontStyle: 'bold' } : {})).setOrigin(1, 0);
      box.add(v);
      if (gain) box.add(this.add.text(v.x - v.width - 4, y + 1, gain, bodyStyle(12, COLORS.inkGood)).setOrigin(1, 0));
      y += 23;
    }
    // His ability, under the picture, across the panel.
    y = this.drawFeastCard(box, st, Math.max(y + 4, INFO_PIC_Y + PIC.h + 12));
    const tip = this.add.text(INFO_W / 2, y + 8, 'He naps after a wave to heal. Knocked out in a raid, he stays down until it ends.',
      bodyStyle(13, COLORS.inkDim, { align: 'center', wordWrap: { width: INFO_W - PIC.x * 2 - 16 } })).setOrigin(0.5, 0);
    box.add(tip);
    return tip.y + tip.height + 10;
  }

  /**
   * Brisket Feast's card on the Hero tab, in the Gnome Worker card's recessed tray: its hotbar icon (the gold
   * crown) in a gold slot like the hotbar's, its name, how many per wave (left in a wave), and what it does.
   * Returns the y below.
   */
  drawFeastCard(box, st, y) {
    const F = CONFIG.altar.hero.feast, h = this.gs.hero;
    const x = PIC.x, w = INFO_W - PIC.x * 2, slot = 64;
    const tx = x + 10 + slot + 12, tw = x + w - 12 - tx;
    const title = this.add.text(tx, y + 10, 'Brisket Feast', textStyle(19));
    const kind = this.add.text(title.x + title.width + 8, y + 14, 'Ability', textStyle(14, COLORS.textGold));
    const used = h && isWaveActive(this.gs) ? h.feastsUsed : 0;
    const charges = this.add.text(x + w - 12, y + 12, isWaveActive(this.gs) ? `${Math.max(0, st.feastCharges - used)} / ${st.feastCharges} left` : `${st.feastCharges}x per wave`,
      textStyle(16, COLORS.textGold)).setOrigin(1, 0);
    const text = this.add.text(tx, y + 40, `Heals him ${F.healPct}%, then he rages for ${F.boostSeconds} s (+${F.damagePct}% damage, +${F.speedPct}% speed) and slams and stuns enemies around him. In a wave, use its hotbar slot or its number key.`,
      bodyStyle(13, COLORS.ink, { wordWrap: { width: tw }, lineSpacing: 2 }));
    const hgt = Math.max(slot + 16, text.height + 50);
    // Recessed tray, then the gold icon slot centered on its left.
    const g = this.add.graphics();
    g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(x, y, w, hgt, 12);
    g.fillStyle(COLORS.tray, 1).fillRoundedRect(x + 2, y + 3, w - 4, hgt - 5, 11);
    const sy = y + (hgt - slot) / 2;
    drawGlossy(g, x + 10, sy, slot, slot, 0xf2b632, { radius: 12, lip: 4 });
    box.add(g);
    if (this.textures.exists(TEX.feastReady)) box.add(fitIcon(this.add.image(x + 10 + slot / 2, sy + slot / 2 - 2, TEX.feastReady), slot - 16));
    else box.add(this.add.text(x + 10 + slot / 2, sy + slot / 2 - 2, 'FEAST', textStyle(13)).setOrigin(0.5));
    box.add([title, kind, charges, text]);
    return y + hgt;
  }

  /** Draw the Info, Stats or Hero tab body starting at y; returns the y below it. */
  drawInfoContent(b, y) {
    const box = this.infoContent;
    box.removeAll(true);
    if (this.infoTab === 'hero' && b.type === 'altar') return this.drawHeroInfo(box, b, y);
    if (this.infoTab === 'info') {
      const t = this.add.text(INFO_COL, y, BUILDING_DESCRIPTIONS[b.type] || '', bodyStyle(15, COLORS.ink, { wordWrap: { width: INFO_COL_W }, lineSpacing: 3 }));
      box.add(t);
      return y + t.height + 12;
    }
    y = this.drawStats(box, b, INFO_COL, y, INFO_COL_W) + 8;
    // Its ability paths: "Heavy Shot 2/5 · Piercing Shot" in each path's color.
    if (hasAbilities(b.type)) {
      const ink = { a: '#b8640a', b: '#2a6fb0', c: '#2f8a2f' };
      for (const line of abilitySummary(b)) {
        const t = this.add.text(INFO_COL, y, line.text, bodyStyle(14, ink[line.path], { fontStyle: 'bold', wordWrap: { width: INFO_COL_W } }));
        box.add(t);
        y += t.height + 2;
      }
      y += 6;
    }
    return y;
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
      abilities: new Button(this, 0, QB.h / 2, QB.abilityW, QB.btnH, 'Abilities', () => this.openAbilities(), { color: COLORS.button, fontSize: 17 }),
      research: new Button(this, 0, QB.h / 2, QB.abilityW, QB.btnH, 'Research', () => this.openResearch(), { color: COLORS.button, fontSize: 17 }),
      brew: new Button(this, 0, QB.h / 2, QB.abilityW, QB.btnH, 'Brew', () => this.openFuelStation(), { color: 0x8e5bd6, fontSize: 17 }),
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
    const ruin = b.type === 'townHall' && b.level === 0;
    this.qbName.setText(buildingName(b.type));
    this.qbLevel.setText(`Level ${b.level} / ${maxLevel(b.type)}${b.destroyed ? '  ·  Destroyed' : ruin ? '  ·  In ruins' : ''}`);
    const shown = [];
    // Destroyed (not walls): Rebuild. Otherwise Upgrade (or Rebuild for the starting hall ruin).
    if (b.destroyed && b.type !== 'wall') {
      const rep = checkRepair(gs, b);
      const ok = rep.ok && tutorialAllows(gs, 'repair');
      btn.repair.setLabel(`Rebuild · ${formatGold(repairCost(b))}`, rep.ok ? (ok ? '' : 'Follow the guide') : rep.reason).setEnabled(ok);
      shown.push(btn.repair);
    } else {
      const u = this.upgradeButtonState(b, ruin);
      btn.upgrade.setLabel(u.label, u.sub).setEnabled(u.ok);
      btn.upgrade.resize(Math.max(QB.upgradeW, Math.ceil(Math.max(btn.upgrade.label.width, btn.upgrade.sub.width)) + 24)); // "Upgrade Walls · 105,600"
      shown.push(btn.upgrade);
    }
    const ab = this.abilityButtonState(b);
    if (ab.show) {
      btn[ab.key].setLabel(ab.label, ab.sub).setEnabled(ab.ok);
      shown.push(btn[ab.key]);
    }
    shown.push(btn.info);
    for (const bt of Object.values(btn)) bt.setVisible(shown.includes(bt));
    // Layout: title on the left, buttons in a row, right-aligned left of the Edit / Shop buttons.
    const textW = Math.max(this.qbName.width, this.qbLevel.width) + 30;
    let x = textW;
    for (const bt of shown) { bt.setX(x + bt.btnW / 2); x += bt.btnW + 8; }
    const w = x + 8;
    this.qbW = w;
    this.quickBar.setVisible(true).setX(QB.right - w).setY(this.quickBarY());
    this.qbClose.setPosition(w - 6, 4);
    this.qbBg.clear();
    drawWindow(this.qbBg, 0, 0, w, QB.h, { radius: 14 });
    this.qbBlocker.setSize(w, QB.h);
    if (this.qbBlocker.input) this.qbBlocker.input.hitArea.setSize(w, QB.h);
  }

  /** While the tutorial guide is up (bottom-left), the bar sits just above it instead of beside it. */
  quickBarY() {
    // ...and above the ability hotbar when it would cover it.
    const r = { x: this.quickBar ? this.quickBar.x : 0, y: QB.y, w: this.qbW || QB.right, h: QB.h };
    return liftClear(r, [this.guideRect(), this.abilityBar && this.abilityBar.rect()]);
  }

  /** The Upgrade button's label, subtext and whether it can be pressed (a wall's is Upgrade Walls: all of them). */
  upgradeButtonState(b, ruin) {
    const gs = this.gs;
    if (b.type === 'wall') {
      const up = checkUpgrade(gs, b); // checkWallUpgrade: every wall, walls placed x the next level's price
      const ok = up.ok && tutorialAllows(gs, 'upgrade', 'wall');
      const label = up.cost === null ? 'Upgrade Walls' : `Upgrade Walls · ${formatGold(up.cost)}`;
      const sub = !up.ok ? up.reason : !ok ? 'Follow the guide' : `All ${up.count} to level ${up.level}`;
      return { label, sub, ok };
    }
    const up = checkUpgrade(gs, b);
    const verb = ruin ? 'Rebuild' : 'Upgrade'; // the starting hall ruin is rebuilt, not upgraded
    const label = up.cost === null ? verb : `${verb} · ${up.currency === 'rp' ? rpText(up.cost) : formatGold(up.cost)}`;
    let sub = up.reason;
    const ok = up.ok && tutorialAllows(gs, 'upgrade', b.type);
    if (up.ok && !ok) sub = 'Follow the guide';
    else if (up.ok && ruin) sub = 'Unlocks building · waves begin';
    else if (up.ok) sub = b.type === 'townHall' ? `Level ${b.level + 1} · tougher waves` : `To level ${b.level + 1}`;
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

    this.infoName.setText(buildingName(b.type));
    const ruin = b.type === 'townHall' && b.level === 0;
    // Walls all share one level: the count of walls it applies to.
    const walls = b.type === 'wall' ? `  ·  all ${countOwned(gs.buildings, 'wall')} walls` : '';
    this.infoLevel.setText(`Level ${b.level} / ${maxLevel(b.type)}${b.destroyed ? '  ·  Destroyed' : ruin ? '  ·  In ruins' : walls}`);
    this.layoutInfoTabs(b);
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

    const u = this.upgradeButtonState(b, ruin);
    btn.upgrade.setLabel(u.label, u.sub).setEnabled(u.ok);
    visible.push(btn.upgrade);

    // RV Lab: a defense's Abilities, or the RV Lab's Research. (Not on ruins: Rebuild takes that row, which
    // keeps the tallest panel at three buttons, clear of the Settings icon.)
    const ab = b.destroyed ? { show: false } : this.abilityButtonState(b);
    for (const k of ['abilities', 'research', 'brew']) btn[k].setVisible(ab.show && ab.key === k);
    if (ab.show) {
      btn[ab.key].setLabel(ab.label, ab.sub).setEnabled(ab.ok);
      visible.push(btn[ab.key]);
    }

    // Selling is never possible while enemies attack, so the button steps aside then (keeps the panel short).
    const showSell = b.type !== 'townHall' && !waveActive;
    if (showSell) {
      const sell = gs.checkSell(b);
      const sellOk = sell.ok && tutorialAllows(gs, 'sell');
      btn.sell.setLabel(`Sell · +${formatGold(sell.refund ?? 0)}`, sell.ok ? (sellOk ? '' : 'Follow the guide') : sell.reason).setEnabled(sellOk);
      visible.push(btn.sell);
    }
    btn.sell.setVisible(showSell);

    // Mid-wave ruins can be rebuilt early for gold; everything is rebuilt free when the wave is beaten.
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
    this.infoH = h;
    this.placeInfoPanel(); // (item 29) off the ability hotbar
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
    fitIcon(pic, pw - 30, ph - 30);
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

  /**
   * The free span [lo, hi] for an overlay at screen rows y0..y1, centered near x 640: left of the day/night pill
   * and of the info panel when they reach those rows.
   */
  overlaySpan(y0, y1) {
    let hi = SCREEN.w - 16;
    const row = { x: 0, y: y0, w: SCREEN.w, h: y1 - y0 };
    if (this.clockRect && rectsOverlap(row, this.clockRect)) hi = Math.min(hi, this.clockRect.x - 8);
    if (this.infoPanel && this.infoPanel.visible && rectsOverlap(row, { x: this.infoPanel.x, y: this.infoPanel.y, w: INFO_W, h: this.infoH || 0 })) {
      hi = Math.min(hi, this.infoPanel.x - 8);
    }
    if (this.shopInfo && rectsOverlap(row, { x: this.shopInfo.x, y: this.shopInfo.y, w: SHOP_INFO_W, h: this.shopInfoH || 0 })) {
      hi = Math.min(hi, this.shopInfo.x - 8);
    }
    return { lo: 16, hi };
  }

  showBanner(text) {
    this.bannerText.setText(text).setScale(1);
    // The ribbon (y 90-154, its tails 26 px out each side) stays clear of the day/night pill and the info panel;
    // a long message shrinks to fit.
    const TAILS = 52, PAD = 70;
    const span = this.overlaySpan(90, 154);
    const fit = fitInSpan(span.lo, span.hi, this.bannerText.width + PAD + TAILS, 640);
    if (fit.scale < 1) this.bannerText.setScale((fit.w - PAD - TAILS) / this.bannerText.width);
    const w = this.bannerText.displayWidth + PAD, cx = fit.left + fit.w / 2;
    this.bannerText.setX(cx);
    this.bannerBg.clear();
    drawRibbon(this.bannerBg, cx, 90, w, 54);
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
    // (The same bubble shows the RV Lab guide once the first tutorial is over.)
    // (It also shows first-time tips (tips.js) when neither guide has anything to say: "Got it" / "No more tips".)
    this.guideNext = new Button(this, 540, 124, 110, 40, 'Next', () => {
      if (this.tipShown) this.gs.dismissTip();
      else if (this.labGuideShown()) this.gs.labGuideNext();
      else this.gs.tutorialEvent('next');
    }, { fontSize: 19, color: COLORS.buttonGood });
    this.guideSkip = new Button(this, 400, 124, 150, 40, 'Skip tutorial', () => {
      if (this.tipShown) this.gs.hideAllTips();
      else if (this.labGuideShown()) this.gs.skipLabGuide();
      else this.gs.skipTutorial();
    }, { fontSize: 16, color: COLORS.buttonDark });
    c.add([this.guideBlocker, this.guideBubble, portrait, this.guideText, this.guideProgress, this.guideNext, this.guideSkip]);
    this.guide = c;
  }

  /** Screen rect of the guide bubble (portrait + speech bubble) while it shows, else null. */
  guideRect() {
    return this.guide && this.guide.visible && this.guide.y < 1000 ? { x: 16, y: this.guide.y, w: 612, h: 160 } : null;
  }

  /** Is the RV Lab guide what the bubble shows right now? (The first tutorial always comes first.) */
  labGuideShown() {
    return !isGuideVisible(this.gs) && isLabGuideVisible(this.gs) && !Modal.isOpen(this);
  }

  refreshGuide() {
    const gs = this.gs;
    const lab = this.labGuideShown(); // the RV Lab guide (its in-window steps show inside the windows instead)
    // First-time tips take the bubble when neither guide is using it (not behind a window).
    const tip = !isGuideVisible(gs) && !lab && !Modal.isOpen(this) ? currentTip(gs) : null;
    this.tipShown = !!tip;
    const y = this.shopOpen ? SHOP_OPEN_Y - 176 : 720 - 170;
    // A tall info panel (the Brisket King's Hero tab) that had to spread over the bubble's spot hides it until
    // it closes, like a window does.
    const panel = this.infoPanel && this.infoPanel.visible && this.infoPanel.x < SCREEN.w
      ? { x: this.infoPanel.x, y: this.infoPanel.y, w: INFO_W, h: this.infoH || 0 } : null;
    const covered = !!panel && rectsOverlap({ x: 16, y, w: 612, h: 160 }, panel);
    const visible = (isGuideVisible(gs) || lab || !!tip) && !covered;
    this.guide.setVisible(visible);
    this.guide.setY(visible ? y : 2000);
    if (!visible) return;
    if (tip) {
      this.guideText.setText(tip.text).setFontSize(16);
      this.guideProgress.setText('');
      this.guideNext.setLabel('Got it').setVisible(true).setY(124);
      this.guideSkip.setLabel('No more tips').setVisible(true).setY(124);
      this.drawGuideBubble();
      return;
    }
    this.guideNext.setLabel('Next');
    const step = lab ? labGuideStep(gs) : currentStep(gs);
    this.guideText.setText(lab ? labGuideText(gs) : step.text).setFontSize(lab ? 16 : 18);
    const need = lab ? 0 : goldNeeded(gs);
    this.guideProgress.setText(need && isWaitingForGold(gs) ? `Collect gold from your mine: ${formatGold(gs.gold)} / ${formatGold(need)}` : '');
    this.guideProgress.setY(Math.max(70, 26 + this.guideText.height));
    this.guideNext.setVisible(!!step.showNext).setY(step.showNext ? 124 : -1000);
    const skip = lab ? !step.showNext : canSkipTutorial(gs); // the guide's last step just has Next
    this.guideSkip.setLabel(lab ? 'Skip guide' : 'Skip tutorial');
    this.guideSkip.setVisible(skip).setY(skip ? 124 : -1000);
    this.drawGuideBubble();
  }

  /** The guide's speech bubble, with its tail pointing at the guide. */
  drawGuideBubble() {
    const g = this.guideBubble;
    g.clear();
    drawWindow(g, 124, 4, 486, 152, { radius: 16, flat: true });
    // Tail pointing at the guide: dark outline triangle, then the body color inside it.
    g.fillStyle(COLORS.frame, 1).fillTriangle(126, 64, 126, 104, 100, 92);
    g.fillStyle(COLORS.body, 1).fillTriangle(130, 70, 130, 98, 108, 91);
  }

  /** What the RV Lab guide points at: the shop / RV Lab card, the RV Lab and its Research button, a defense and its Abilities button. */
  labGuideFocus() {
    const gs = this.gs;
    const step = labGuideStep(gs);
    if (!step) return null;
    const imageRect = (img) => { const r = img.getBounds(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const btnRect = (b) => { const m = b.getWorldTransformMatrix(); return { x: m.tx - b.btnW / 2, y: m.ty - b.btnH / 2, w: b.btnW, h: b.btnH }; };
    const building = (type) => {
      const a = this.world.buildingScreenAnchor(type);
      return a ? { x: a.x - a.width / 2, y: a.y, w: a.width, h: a.bottom - a.y } : null;
    };
    const selected = this.selectedId ? gs.getBuilding(this.selectedId) : null;
    const button = (key) => (this.infoOpen ? this.infoButtons[key] : this.qbButtons[key]);
    if (step.key === 'build') {
      if (this.placementActive) return null;
      if (!this.shopOpen) return imageRect(this.shopButton);
      const card = this.cardLayer.list.find((c) => c.cardType === 'rvlab');
      return card ? { x: this.shopPanel.x + card.x, y: this.shopPanel.y + card.y, w: card.cardW, h: card.cardH } : null;
    }
    if (step.key === 'open') return selected && selected.type === 'rvlab' ? btnRect(button('research')) : building('rvlab');
    return null;
  }

  /** Screen rect the guide currently points at, or null. */
  focusTarget() {
    const gs = this.gs;
    if (this.labGuideShown()) return this.labGuideFocus();
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

    on(['researchPointsChanged', 'baseReset'], (d) => {
      this.refreshResearchPoints();
      if (d && d.lost > 0) this.showRpLost(d.lost);
      const sel = this.selectedId && gs.getBuilding(this.selectedId);
      if (sel && (sel.type === 'rvlab' || sel.type === 'fuelStation')) this.refreshInfo(); // their upgrades are paid in RP
    });
    on(['goldChanged', 'buildingPlaced', 'buildingSold', 'buildingUpgraded', 'wallsUpgraded', 'baseReset', 'abilityResearched', 'abilitiesApplied'], () => {
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
      if (d.id && this.shopOpen) this.closeShop();
      this.refreshInfo();
    });
    on(['placementChanged'], (d) => {
      this.placementActive = d.active;
      this.showPlacementButtons(d);
      this.refreshGuide();
    });
    on(['waveTriggered', 'waveTick', 'enemyKilled', 'enemySpawned', 'clockPhase', 'townHallUpgraded', 'tutorialChanged', 'buildingDestroyed'], () => this.refreshWave());
    on(['waveStarted'], () => {
      this.closeShop();
      this.refreshWave();
      this.refreshInfo();
      this.refreshShopButton();
      this.refreshEditButton();
    });
    on(['waveCleared'], (d) => {
      const ruins = d.ruins ? ` · ${d.ruins} to rebuild` : '';
      const sp = d.special ? CONFIG.specialWaves.types[d.special] : null;
      const bonus = (d.bonus || 0) + (d.starGold || 0) ? ` (+${formatGold((d.bonus || 0) + (d.starGold || 0))} bonus)` : '';
      const stars = d.stars ? `${starText(d.stars)} ` : '';
      this.showBanner(`${stars}${sp ? `${sp.name} (wave ${d.number})` : `Wave ${d.number}`} cleared! +${formatGold(d.bounty)} gold${bonus} · +${rpText(d.rp || 0)}${ruins}`);
      // Then, if the gnomes rebuilt a mine for free, say so.
      if (d.salvaged) this.time.delayedCall(BANNER_MS + 200, () => this.showBanner('Your gnomes salvaged a Bitcoin Mine!'));
      this.refreshAll();
    });
    // "Storage full" shows once; it can show again only after the gold has dropped below capacity.
    on(['storageFull'], () => {
      if (this.storageFullShown) return;
      this.storageFullShown = true;
      this.showBanner('Storage full');
    });
    on(['goldChanged'], (d) => { if (d && d.gold < d.capacity) this.storageFullShown = false; });
    on(['spellBrewed', 'spellDiscarded'], () => this.refreshInfo()); // the Fuel Station's Brew button counts them
    on(['achievementEarned'], (d) => { this.queueAchievementToast(d.id); this.refreshProfile(); });
    on(['leaguePromoted', 'waveCleared'], () => this.refreshProfile()); // new league badge / furthest wave
    on(['leaguePromoted'], (d) => {
      const l = LEAGUES.find((x) => x.key === d.key);
      if (l) this.queueToast({ title: 'New league!', name: `${l.name} League`, sub: `Furthest wave: ${d.wave}  ·  see the Leaderboard`, texture: l.texture });
    });
    // Da Baby Car (raid boss) rolls in: announce it (once per wave).
    on(['enemySpawned'], (d) => {
      if (d.kind !== 'babycar' || this.babyCarAnnounced === this.gs.wave.number) return;
      this.babyCarAnnounced = this.gs.wave.number;
      this.showBanner(`${CONFIG.enemies.babycar.name} is coming for your Village Hall!`);
    });
    on(['enemiesEnraged'], () => { this.showBanner('The enemies are enraged!'); this.refreshWave(); });
    // Restless nights: a wave that's attacking when it gets dark (or that starts in the dark), and dawn after.
    on(['restlessChanged'], (d) => {
      const bonus = Math.round(CONFIG.rules.night.lootBonus * 100);
      this.showBanner(d.restless ? `Night: the enemies are restless! +${bonus}% gold & Burgers` : 'Daylight: the enemies calm down');
      this.refreshWave();
    });
    on(['waveCalled'], (d) => {
      this.refreshWave();
      const sp = this.gs.wave.special ? CONFIG.specialWaves.types[this.gs.wave.special] : null;
      const secs = Math.ceil(this.gs.wave.countdown);
      this.showBanner(sp ? `Wave ${d.number}: ${sp.name} in ${secs}s!` : `Wave ${d.number} attacks in ${secs}s!`);
    });
    on(['waveCancelled'], () => {
      this.showBanner("Wave cancelled: start it when you're ready");
      this.refreshWave();
      this.refreshEditButton();
      this.refreshShopButton();
    });
    on(['editModeChanged', 'waveTriggered'], () => { this.refreshEditButton(); this.refreshShopButton(); this.refreshWave(); });
    on(['layoutDraftChanged', 'placementChanged', 'rowSelectChanged'], () => { if (this.world.editMode) this.refreshHotbar(); });
    on(['layoutRejected'], (d) => this.showBanner(d.reason));
    on(['layoutSaved'], () => this.showBanner('Layout saved!'));
    on(['tutorialChanged'], () => this.refreshAll());
    // The RV Lab guide's bubble: hidden during attacks, back when the wave is beaten.
    on(['labGuideChanged', 'waveStarted', 'waveCleared', 'tipsChanged'], () => this.refreshGuide());
  }

  // ---------- achievement toasts ----------
  /** Achievements unlocked during play: a toast with the achievement trophy (a gold medal without the art). */
  queueAchievementToast(id) {
    const a = achievementById(id);
    if (a) this.queueToast({ title: 'Achievement unlocked!', name: a.name, sub: `+${formatGold(a.reward)} gold to claim  ·  Profile (top left)`, texture: TEX.achievementIcon });
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
      fitIcon(icon, 62);
    } else {
      g.fillStyle(0xa86a12, 1).fillCircle(mx, my, 24);
      g.fillStyle(0xffc83a, 1).fillCircle(mx, my - 2, 20);
      const pts = [];
      for (let i = 0; i < 10; i++) { const ang = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5.5 : 12; pts.push({ x: mx + Math.cos(ang) * r, y: my - 2 + Math.sin(ang) * r }); }
      g.fillStyle(0xfff6d0, 1).fillPoints(pts, true);
    }
    [title, name, sub].forEach((t) => t.setX(t.x + 24));
    c.add([g, title, name, sub, ...(icon ? [icon] : [])]);
    // Centered under the banner, but clear of the info panel (y 166-254 on screen); a wide one shrinks.
    const span = this.overlaySpan(166, 254);
    const fit = fitInSpan(span.lo, span.hi, w, 640);
    c.setX(fit.left + fit.w / 2);
    c.setAlpha(0).setScale(0.85 * fit.scale);
    this.tweens.add({ targets: c, alpha: 1, scale: fit.scale, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: c, alpha: 0, y: 182, delay: 3400, duration: 350,
      onComplete: () => { c.destroy(); this.time.delayedCall(150, () => this.nextToast()); }
    });
  }

  /**
   * Screen rects of every HUD piece showing right now, by name (for the overlap check below; the dev build's
   * console can call window.__IBTD__.scene.getScene('UIScene').hudOverlaps()).
   */
  hudRects() {
    const on = (o) => o && o.visible !== false && o.y > -100 && o.y < SCREEN.h + 100;
    const btn = (b) => (on(b) ? { x: b.x - b.btnW / 2, y: b.y - b.btnH / 2, w: b.btnW, h: b.btnH } : null);
    const [settings, shop, edit] = this.cornerButtonRects();
    const r = {
      profile: this.profile ? { x: PROFILE.x, y: topRowY(PROFILE.h), w: this.profileRight - PROFILE.x, h: PROFILE.h } : null,
      wavePill: this.wavePillRect || null,
      startWave: btn(this.earlyBtn),
      cancelWave: btn(this.cancelWaveBtn),
      rpBar: this.rpBar.bounds(),
      goldBar: this.goldBar.bounds(),
      clock: this.clockRect || null,
      settings, shop, edit,
      infoPanel: on(this.infoPanel) && this.infoPanel.x < SCREEN.w ? { x: this.infoPanel.x, y: this.infoPanel.y, w: INFO_W, h: this.infoH || 0 } : null,
      quickBar: on(this.quickBar) ? { x: this.quickBar.x, y: this.quickBar.y, w: this.qbW || 0, h: QB.h } : null,
      abilityBar: this.abilityBar ? this.abilityBar.rect() : null,
      guide: this.guideRect(),
      rotate: btn(this.rotateBtn), place: btn(this.placeBtn), cancelPlace: btn(this.cancelPlaceBtn),
      shopInfo: this.shopInfo ? { x: this.shopInfo.x, y: this.shopInfo.y, w: SHOP_INFO_W, h: this.shopInfoH || 0 } : null
    };
    if (this.world.editMode && this.hotbar.visible) {
      r.layoutHotbar = { ...HOTBAR };
      r.editHint = { x: HOTBAR.x, y: HOTBAR.y - 53, w: this.editHint.width + 44, h: 42 };
      r.layoutSave = btn(this.layoutSave); r.layoutCancel = btn(this.layoutCancel); r.layoutRemoveAll = btn(this.layoutRemoveAll);
      if (this.shiftPad.visible) r.shiftPad = { x: SHIFT_PAD.x - SHIFT_PAD.dx - 30, y: SHIFT_PAD.y - SHIFT_PAD.dy - 30, w: (SHIFT_PAD.dx + 30) * 2, h: (SHIFT_PAD.dy + 30) * 2 };
      if (this.rowBtn.visible) r.rowSelect = btn(this.rowBtn);
    }
    return r;
  }

  /** Overlapping HUD pairs right now, e.g. ['clock/infoPanel'] (the shop window and modal windows aside). */
  hudOverlaps() {
    return findOverlaps(this.hudRects());
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
