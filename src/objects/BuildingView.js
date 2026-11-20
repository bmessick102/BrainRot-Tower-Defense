// Draws one building: sprite, level badge, HP bar (only when damaged), and a mine's coin icon.
import { gridToScreen } from '../logic/iso.js';
import { fpW, fpH } from '../logic/grid.js';
import { maxHp, maxLevel, BUILDING_TYPES } from '../logic/buildings.js';
import { mineShowsCoin, mineFill } from '../logic/economy.js';
import { isWaveActive } from '../logic/util.js';
import { buildingKey, buildingLevelKey, buildingDestroyedKey, TEX } from '../assetKeys.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { MAP } from '../mapTiles.js';
import { textStyle, COLORS } from '../theme.js';
import { drawGlossy } from './uiDraw.js';
import { darkness, lerpColor } from './DayNight.js';
import { hypeFill } from '../logic/dj.js';
import { hasAbilities, picksOf, MAX_TIER, canResearchSomething } from '../logic/abilities.js';
import { PATH_COLORS } from '../abilityConfig.js';

const OVERLAY_DEPTH = 5000;
// DJ Babyface's hype pill: width, and how far above the label row it sits when that row is showing.
const HYPE_W = 40, HYPE_STACK = 20;
// Cannons and mortars with nothing to shoot turn to a new random facing every this many ms (min, max).
const IDLE_TURN_MS = [2500, 7000];
// The label chip: level badge radius, ability pip radius and spacing.
const CHIP_R = 10, PIP_R = 5, PIP_GAP = 12;
const FLASH_MIN_GAP_MS = 400;

// Night lighting: a pool of light on the ground around each standing building.
const LIGHT_DEPTH = -5000;        // above the map, below buildings
const LIGHT_ALPHA = 0.85;         // strength at full night
const LIGHT_SPREAD = 2.8;         // pool width in footprints
// Screen blending brightens like light but can't blow out to white where pools overlap.
const LIGHT_BLEND = 'SCREEN';
// Buildings are lit by their own pool at night: the top of the picture gets this soft moonlight (much
// lighter than the NIGHT_TINT everything else gets), the base a warm glow: white blended this far
// toward the pool's color.
const BUILDING_LIT_TOP = 0xe2e6f8;
const BUILDING_LIT_WARMTH = 0.2;
const LIGHT_COLORS = {
  townHall: 0xffa23c, mine: 0xffa23c, storage: 0xffb43c, house: 0xffc86b, cannon: 0xff8a3c,
  archer: 0xff9a3c, mortar: 0xff7a3c, wizard: 0xb066ff, firework: 0xff4d6d, catapult: 0xff5fa8, spear: 0xc98a4a, flock: 0x4cd6ff, mousetrap: 0xffc24a, ra: 0xff7a2a, rvlab: 0xffd27a, dj: 0xc070ff, altar: 0xffb04a, fuelStation: 0xffc24a
};

// Shared rubble art for any building without its own bld_<type>_destroyed picture. Every variant that
// exists (bld_destroyed, bld_destroyed_2, bld_destroyed_3 ...) is used, picked at random per destruction.
const GENERIC_RUBBLE = 'bld_destroyed';
// Flat rubble pictures (a wide pile, not a standing ruin) lie centered on the footprint and fill this share
// of its width, instead of standing like a building. By type, for that type's own bld_<type>_destroyed art.
const FLAT_RUBBLE = { storage: 0.95 };
const MAX_RUBBLE_VARIANTS = 9;

/** The generic rubble pictures that are loaded. */
export function genericRubbleKeys(scene) {
  const keys = [];
  for (let i = 1; i <= MAX_RUBBLE_VARIANTS; i++) {
    const k = i === 1 ? GENERIC_RUBBLE : `${GENERIC_RUBBLE}_${i}`;
    if (scene.textures.exists(k)) keys.push(k);
  }
  return keys;
}

// Rubble art for destroyed walls, by level (the first entry whose maxLevel covers the wall's level).
export const WALL_RUBBLE = [
  { maxLevel: 1, key: 'bld_wall_rubble_wood' },   // the wooden post
  { maxLevel: 5, key: 'bld_wall_rubble_stone' },  // the steel-banded post on a stone base, and the stone blocks
  { maxLevel: 6, key: 'bld_wall_rubble_skull' },  // the skull fortress block
  { maxLevel: 8, key: 'bld_wall_rubble_lava' }    // the lava block and the lava tower
];

// Each picture covers this many building levels: levels 1-2 use bld_<type>_lv1, 3-4 use _lv2 ... 9-10 use _lv5.
export const LEVELS_PER_ART = 2;
// Types with a picture for every level (the RV Lab: 5 levels, 5 pictures; walls: 8 levels, 8 pictures; DJ
// Babyface: a picture per level, and a level without one yet shows the closest lower picture).
// Catapult: 5 levels, a picture each. (The Spear Thrower, 10 levels / 5 pictures, and the Fuel Station, 8 levels /
// 4 pictures, use the usual picture per 2 levels and grow on the levels in between, like the Cannon.)
const LEVELS_PER_ART_BY_TYPE = { rvlab: 1, wall: 1, dj: 1, catapult: 1 };

/** Which picture (1-based) a building level shows. */
export function artTier(level, type = null) {
  return Math.ceil(level / (LEVELS_PER_ART_BY_TYPE[type] ?? LEVELS_PER_ART));
}

/**
 * Best texture for a building at a level: its picture, else the closest lower picture, else the base key.
 * Destroyed: this type's own rubble art, else one of the shared rubble variants (not for walls), chosen by
 * `rubbleRoll` (0..1, picked once per destruction so it doesn't flicker), else the placeholder slab.
 */
export function buildingTextureKey(scene, type, level, destroyed = false, rubbleRoll = 0) {
  if (destroyed && type === 'wall') {
    // Walls: each level range has its own rubble picture (WALL_RUBBLE).
    const k = (WALL_RUBBLE.find((r) => level <= r.maxLevel) || WALL_RUBBLE[WALL_RUBBLE.length - 1]).key;
    const placeholders = scene.registry.get('placeholderKeys');
    if (scene.textures.exists(k) && !(placeholders && placeholders.has(k))) return k;
  }
  if (destroyed) {
    const own = buildingDestroyedKey(type);
    const placeholders = scene.registry.get('placeholderKeys');
    const realArt = scene.textures.exists(own) && !(placeholders && placeholders.has(own));
    if (realArt) return own;
    const variants = type === 'wall' ? [] : genericRubbleKeys(scene);
    if (variants.length) return variants[Math.min(variants.length - 1, Math.floor(rubbleRoll * variants.length))];
    return own;
  }
  // The Village Hall's starting ruin (level 0) has its own picture.
  if (level === 0 && scene.textures.exists(buildingLevelKey(type, 0))) return buildingLevelKey(type, 0);
  for (let tier = artTier(level, type); tier >= 1; tier--) {
    const k = buildingLevelKey(type, tier);
    if (scene.textures.exists(k)) return k;
  }
  return buildingKey(type);
}

// Sprite width as a share of the footprint width, so every building sits inside its tiles with a margin.
// Cannon and Mortar art paints bulkier than the rest, so they get a little less.
const DEFAULT_SPRITE_SCALE = 0.75;
// Cannon: 0.63 because its 5 tiers share one crop box (the biggest tier fills it), which keeps the
// Level 3-4 art the size it was at 0.58 while Level 1 is a touch smaller and Level 9-10 bigger.
// Catapult: 0.66 for the same reason (its Level 1 art fills 94% of the shared box).
// F.L.O.C.K Tower: 1.28 of its single tile, so it stands a bit wider than the tile (about 85% of the
// size it had on a 2x2 footprint).
// Mousetrap: a flat 1-tile trap, drawn a little wider than its tile.
// Tower of Rah: a tall, slim tower, drawn narrower than its footprint (it starts small and grows a lot).
// RV Lab: a long RV on its own paved pad; 0.77 of its 2x2 footprint (10% bigger than the earlier 0.7).
const SPRITE_SCALE = { mortar: 0.65, cannon: 0.63, firework: 0.52, catapult: 0.66, spear: 0.66, flock: 1.28, mousetrap: 1.1, ra: 0.54, rvlab: 0.77, dj: 0.77, altar: 0.66, fuelStation: 0.8 };

// Buildings grow as they level up: this share of their normal size at Level 1, up to LEVEL_SIZE.max at
// their top level (Level 10, or the type's own top level). They only grow on upgrades that keep the same
// picture (the new picture already looks bigger), so with art every 2 levels: Level 2, 4, 6 ... grow and
// Level 3, 5, 7 ... keep the size they had.
export const LEVEL_SIZE = { min: 0.855, max: 0.99, maxLevel: 10 }; // 10% under the old 0.95 / 1.1

/** How many levels from 2 up to `level` keep the previous level's picture (the levels that grow). */
function growthSteps(level, type = null) {
  let n = 0;
  for (let l = 2; l <= level; l++) if (artTier(l, type) === artTier(l - 1, type)) n++;
  return n;
}

/** Size multiplier for a building level: equal steps on the levels that don't change picture. */
export function levelSizeFactor(level, topLevel = LEVEL_SIZE.maxLevel, type = null) {
  const top = Math.max(1, topLevel);
  const total = growthSteps(top, type);
  const t = total ? growthSteps(Math.max(1, Math.min(top, level)), type) / total : 0;
  return LEVEL_SIZE.min + (LEVEL_SIZE.max - LEVEL_SIZE.min) * t;
}

/** The building's top level, for size growth (10 unless the type has fewer levels). */
function topLevelOf(type) {
  return type && BUILDING_TYPES.includes(type) ? maxLevel(type) : LEVEL_SIZE.maxLevel;
}

// Flat pads whose picture shows thick sides: the share of the picture's height (from its bottom) where its
// side corners meet the ground. That point goes on the footprint's center, so the pad sits flush with its
// tiles instead of floating above them. (The Brisket King's altar: about 0.44 in all 5 pictures.)
const GROUND_SHARE = { altar: 0.44 };

export function spriteScale(type) {
  return SPRITE_SCALE[type] ?? DEFAULT_SPRITE_SCALE;
}

/**
 * Size a building sprite to its footprint (times spriteScale) and stand it on the ground.
 * The shrunken art's base stays centered in the footprint: its front corner sits between the
 * footprint's center and front corner. Returns that base point (bottom-center of the sprite).
 */
export function placeBuildingSprite(sprite, col, row, size, type = null, level = 1) {
  const k = spriteScale(type) * levelSizeFactor(level, topLevelOf(type), type);
  const center = gridToScreen(col + size / 2, row + size / 2);
  const front = gridToScreen(col + size, row + size);
  const f = Math.min(1, k); // art wider than its footprint still stands inside it, not past the front corner
  const w = size * MAP.tileWidth * k;
  const frame = sprite.frame;
  sprite.setDisplaySize(w, (w * frame.height) / frame.width);
  const ground = type ? GROUND_SHARE[type] : undefined;
  const base = ground !== undefined
    ? { x: center.x, y: center.y + sprite.displayHeight * ground }
    : { x: center.x + (front.x - center.x) * f, y: center.y + (front.y - center.y) * f };
  sprite.setPosition(base.x, base.y);
  sprite.setDepth(col + row + 2 * size);
  return base;
}

/** Is the world point on a visible pixel of a bottom-center-origin sprite? */
export function spriteHit(scene, s, wx, wy) {
  const left = s.x - s.displayWidth / 2, topY = s.y - s.displayHeight;
  if (wx < left || wx > left + s.displayWidth || wy < topY || wy > s.y) return false;
  const px = Math.floor(((wx - left) / s.displayWidth) * s.frame.width);
  const py = Math.floor(((wy - topY) / s.displayHeight) * s.frame.height);
  const alpha = scene.textures.getPixelAlpha(px, py, s.texture.key, s.frame.name);
  return alpha === null || alpha === undefined ? true : alpha > 40;
}

// Click feedback: squash-and-spring on the building, gold rings rippling out on the ground.
export const POP_SQUASH = { x: 1.12, y: 0.8 };
export const POP_SQUASH_MS = 110;
export const POP_SPRING_MS = 420;
const RING_COLOR = 0xffd84a;
const RING_DEPTH = -4400; // on the ground, under the building

/** Gold rings rippling out from a footprint rectangle (click feedback). */
export function footprintRipple(scene, col, row, w, h) {
  const c = gridToScreen(col + w / 2, row + h / 2);
  const corner = (x, y) => { const p = gridToScreen(x, y); return { x: p.x - c.x, y: p.y - c.y }; };
  const diamond = [corner(col, row), corner(col + w, row), corner(col + w, row + h), corner(col, row + h)];
  [0, 120].forEach((delay, i) => {
    const g = scene.add.graphics().setDepth(RING_DEPTH).setPosition(c.x, c.y).setScale(0.8).setAlpha(0);
    g.lineStyle(i === 0 ? 4 : 3, RING_COLOR, 1).strokePoints(diamond, true);
    g.fillStyle(RING_COLOR, i === 0 ? 0.18 : 0).fillPoints(diamond, true);
    scene.tweens.add({
      targets: g, scale: 1.5, alpha: { from: 0.95, to: 0 }, delay, duration: 520, ease: 'Cubic.easeOut',
      onComplete: () => g.destroy()
    });
  });
}

/** Squash-and-spring tween on a view's bx/by multipliers. */
export function startPop(scene, view) {
  if (view.popTween) view.popTween.stop();
  view.bx = 1;
  view.by = 1;
  view.popTween = scene.tweens.chain({
    targets: view,
    tweens: [
      { bx: POP_SQUASH.x, by: POP_SQUASH.y, duration: POP_SQUASH_MS, ease: 'Quad.easeOut' },
      { bx: 1, by: 1, duration: POP_SPRING_MS, ease: 'Back.easeOut' }
    ]
  });
}

export class BuildingView {
  constructor(scene, b) {
    this.scene = scene;
    this.id = b.id;
    this.key = null;
    this.sprite = scene.add.image(0, 0, buildingKey(b.type)).setOrigin(0.5, 1);
    // One label chip over the building: a level badge plus its five ability-tier pips (once it has any). While
    // the building is damaged, the health bar carries the level and the pips sit beside it on the same row.
    this.chipGfx = scene.add.graphics();
    this.chipText = scene.add.text(0, 0, '', textStyle(13)).setOrigin(0.5);
    this.badge = scene.add.container(0, 0, [this.chipGfx, this.chipText]).setDepth(OVERLAY_DEPTH);
    this.chipKey = '';
    this.hpBar = new HealthBar(scene, { width: Math.max(48, b.size * 24), height: 12, depth: OVERLAY_DEPTH, color: HP_TEAM.player, badge: true });
    this.coin = b.type === 'mine' ? scene.add.image(0, 0, TEX.coin).setDepth(OVERLAY_DEPTH + 1).setVisible(false) : null;
    // DJ Babyface: its hype meter (during waves, or while charged) and a bobbing "DROP!" once it's full.
    this.hypeGfx = b.type === 'dj' ? scene.add.graphics().setDepth(OVERLAY_DEPTH) : null;
    // (the beat-ready icon, or a "DROP!" label if its art is missing)
    this.hypeReady = b.type !== 'dj' ? null : scene.textures.exists(TEX.beatReady)
      ? scene.add.image(0, 0, TEX.beatReady).setDepth(OVERLAY_DEPTH + 1).setVisible(false)
      : scene.add.text(0, 0, '♪ DROP! ♪', textStyle(16, '#ffe2ff')).setOrigin(0.5).setDepth(OVERLAY_DEPTH + 1).setVisible(false);
    // RV Lab: a research book always bobbing over it, pulsing while there's research you can do (and
    // afford) right now (the RP token if the book art is missing).
    const readyKey = [TEX.researchReady, TEX.researchPoint].find((k) => scene.textures.exists(k));
    this.researchIcon = b.type === 'rvlab' && readyKey
      ? scene.add.image(0, 0, readyKey).setDepth(OVERLAY_DEPTH + 1).setVisible(false) : null;
    this.researchCheckAt = 0;
    this.researchReady = false;
    this.flashUntil = 0;
    this.light = scene.add.image(0, 0, TEX.light).setBlendMode(LIGHT_BLEND).setDepth(LIGHT_DEPTH)
      .setTint(LIGHT_COLORS[b.type] || 0xffa23c).setVisible(false);
    this.flickerPhase = Math.random() * Math.PI * 2;
    this.bx = 1; // click bounce multipliers (tweened by pop())
    this.by = 1;
    this.popTween = null;
    this.baseAlpha = 1; // setAlpha (swap / move previews) ...
    this.fade = 1;      // ... times setFade (see-through while in front of the hovered building)
    this.sync(b, 0);
  }

  sync(b, time) {
    // Roll a rubble variant once each time the building is destroyed; clear it when it's repaired.
    if (b.destroyed && this.rubbleRoll === undefined) this.rubbleRoll = Math.random();
    if (!b.destroyed) this.rubbleRoll = undefined;
    const key = this.variantKey(b, buildingTextureKey(this.scene, b.type, b.level, b.destroyed, this.rubbleRoll), time);
    if (key !== this.key) {
      this.sprite.setTexture(key);
      this.key = key;
    }
    this.b = b;
    let front = placeBuildingSprite(this.sprite, b.col, b.row, b.size, b.type, b.level);
    if (b.destroyed && FLAT_RUBBLE[b.type] && key === buildingDestroyedKey(b.type)) {
      // A flat pile: centered on the footprint, nearly as wide as it (depth stays the building's).
      const c = gridToScreen(b.col + b.size / 2, b.row + b.size / 2);
      const w = b.size * MAP.tileWidth * FLAT_RUBBLE[b.type];
      this.sprite.setOrigin(0.5, 0.55).setDisplaySize(w, (w * this.sprite.frame.height) / this.sprite.frame.width).setPosition(c.x, c.y);
      front = { x: c.x, y: c.y + this.sprite.displayHeight * 0.45 };
    } else this.sprite.setOrigin(0.5, 1);
    const top = front.y - this.sprite.displayHeight;
    // Click bounce (bottom origin, so it squashes into the ground and springs up).
    if (this.bx !== 1 || this.by !== 1) this.sprite.setScale(this.sprite.scaleX * this.bx, this.sprite.scaleY * this.by);

    const max = maxHp(b);
    // Labels only when they're wanted (hovered, selected, or edit mode), so a full village stays readable. The
    // health bar shows whenever the building is damaged (with the level on its left end).
    const labels = this.scene.showLabels ? this.scene.showLabels(b.id) : true;
    const damaged = !b.destroyed && b.hp < max;
    const picks = b.destroyed ? [] : picksOf(b);
    // Every building with a perk tree shows its 5-slot perk bar (empty until perks are researched).
    const hasPips = !b.destroyed && hasAbilities(b.type);
    const pipsW = hasPips ? PIP_GAP * MAX_TIER + 4 : 0;
    const rowY = top - 12;
    if (damaged) {
      // [health bar][pips], centered together.
      const barW = this.hpBar.width, gap = labels && pipsW ? 6 : 0, shown = labels ? pipsW : 0;
      const left = front.x - (barW + gap + shown) / 2;
      this.hpBar.draw(left + barW / 2, rowY - this.hpBar.height / 2, b.hp / max, true, b.level);
      this.badge.setVisible(labels && pipsW > 0).setPosition(left + barW + gap, rowY);
      if (labels && pipsW) this.drawChip(picks, null, true);
    } else {
      this.hpBar.draw(front.x, rowY, 1, false, b.level);
      this.badge.setVisible(labels);
      if (labels) {
        const w = CHIP_R * 2 + (pipsW ? 4 + pipsW : 0);
        this.badge.setPosition(front.x - w / 2, rowY);
        this.drawChip(picks, b.level, hasPips);
      }
    }

    if (this.researchIcon) {
      // Re-checked a few times a second (it looks through every defense's paths).
      if (time >= this.researchCheckAt) {
        this.researchCheckAt = time + 250;
        this.researchReady = !b.destroyed && !!this.scene.gs && canResearchSomething(this.scene.gs);
      }
      // Always over a standing RV Lab; it also pulses while there's research you can do right now.
      this.researchIcon.setVisible(!b.destroyed);
      if (!b.destroyed) {
        const base = 40 / this.researchIcon.frame.height;
        this.researchIcon.setScale(base * (this.researchReady ? 1.1 + 0.12 * Math.sin(time * 0.008) : 1));
        this.researchIcon.setPosition(front.x, top - 46 + Math.sin(time * 0.004) * 4);
      }
    }

    if (this.hypeGfx) this.drawHype(b, front.x, top - 12, time, labels || damaged, labels);

    if (this.coin) {
      const show = mineShowsCoin(b) && !isWaveActive(this.scene.gs); // no collecting while a wave attacks
      this.coin.setVisible(show);
      if (show) {
        const base = 28 / this.coin.frame.width;
        const full = mineFill(b) >= 1;
        const pulse = full ? 1.25 + 0.2 * Math.sin(time * 0.009) : 1;
        this.coin.setScale(base * pulse);
        this.coin.setPosition(front.x, top - 44 + Math.sin(time * 0.004) * 4);
      }
    }

    if (this.flashUntil && time > this.flashUntil) this.flashUntil = 0;
    // Ground light pool, only once it's dark (fading in from there) and gently flickering.
    const night = darkness(this.scene.night || 0);
    if (!this.flashUntil) {
      const moon = this.scene.ambientTint ?? 0xffffff;
      if (b.sprung) this.sprite.setTint(0x7a7a7a); // a sprung trap looks spent until it resets
      // Boosted by DJ Babyface's Drop the Beat: the defense pulses between pink and cyan party lights.
      else if (b.djBoostT > 0 && !b.destroyed) this.sprite.setTint(Math.sin(time * 0.02) > 0 ? 0xffc8f4 : 0xc8f4ff);
      // Under a Rage spell (spells.js): an angry red pulse. Healing: a soft green one.
      else if (b.spellRageT > 0 && !b.destroyed) this.sprite.setTint(lerpColor(0xff6a5a, 0xffb0a0, 0.5 + 0.5 * Math.sin(time * 0.015)));
      else if (b.spellHealT > 0 && !b.destroyed && b.hp < maxHp(b)) this.sprite.setTint(lerpColor(0xb8ffb0, 0xffffff, 0.5 + 0.5 * Math.sin(time * 0.01)));
      // In range of the selected DJ Babyface: a soft purple glow, gently pulsing, so it's clear what it reaches.
      else if (this.scene.djAffected && this.scene.djAffected.has(b.id)) {
        const k = 0.5 + 0.5 * Math.sin(time * 0.005);
        this.sprite.setTint(lerpColor(0xd2a6ff, 0xb886ff, k));
      }
      else if (night > 0 && !b.destroyed) {
        // Lit by its own light pool: a warm, bright base easing up to softer moonlight at the top, so
        // buildings glow like the ground around them instead of sitting dark in it.
        const top = lerpColor(moon, BUILDING_LIT_TOP, night);
        const bottom = lerpColor(moon, lerpColor(0xffffff, LIGHT_COLORS[b.type] || 0xffa23c, BUILDING_LIT_WARMTH), night);
        this.sprite.setTint(top, top, bottom, bottom);
      } else this.sprite.setTint(moon); // moonlit at night (rubble has no light)
    }
    // Invisibility spell: see-through while it lasts (enemies can't see it either).
    this.sprite.setAlpha(this.baseAlpha * this.fade * (b.spellInvisT > 0 && !b.destroyed ? 0.4 + 0.08 * Math.sin(time * 0.01) : 1));
    const lit = night > 0.01 && !b.destroyed;
    this.light.setVisible(lit);
    if (lit) {
      const c = gridToScreen(b.col + b.size / 2, b.row + b.size / 2);
      const w = b.size * MAP.tileWidth * LIGHT_SPREAD;
      const flicker = 0.9 + 0.06 * Math.sin(time * 0.007 + this.flickerPhase) + 0.04 * Math.sin(time * 0.019 + this.flickerPhase * 2);
      this.light.setPosition(c.x, c.y).setDisplaySize(w, w / 2).setAlpha(night * LIGHT_ALPHA * flicker);
    }
  }

  /**
   * The label chip, drawn from its left-middle (the container's position): a glossy level badge (when `level`
   * is given) and the ability pips, one diamond per tier colored by the path it has (A orange, B blue, C green;
   * empty for tiers it doesn't have yet; all empty before any research), on one dark pill. `pips` false: just
   * the level badge (buildings without a perk tree). Redrawn only on change.
   */
  drawChip(picks, level, pips) {
    const key = `${picks.join('')}|${level}|${pips}`;
    if (key === this.chipKey) return;
    this.chipKey = key;
    const g = this.chipGfx;
    g.clear();
    const hasLevel = level !== null;
    const pipsW = pips ? PIP_GAP * MAX_TIER + 4 : 0;
    const w = (hasLevel ? CHIP_R * 2 : 0) + (hasLevel && pipsW ? 4 : 0) + pipsW;
    if (!w) return;
    g.fillStyle(0x000000, 0.45).fillRoundedRect(0, -PIP_R - 3, w, PIP_R * 2 + 6, PIP_R + 3);
    let x = 0;
    if (hasLevel) {
      drawGlossy(g, 0, -CHIP_R, CHIP_R * 2, CHIP_R * 2, COLORS.buttonBlue, { circle: true, lip: 2, shadow: true });
      this.chipText.setText(String(level)).setPosition(CHIP_R, -1).setVisible(true);
      x = CHIP_R * 2 + 4;
    } else {
      this.chipText.setVisible(false);
    }
    for (let k = 0; k < (pipsW ? MAX_TIER : 0); k++) {
      const cx = x + 2 + PIP_GAP / 2 + k * PIP_GAP;
      const pts = [{ x: cx, y: -PIP_R }, { x: cx + PIP_R, y: 0 }, { x: cx, y: PIP_R }, { x: cx - PIP_R, y: 0 }];
      if (picks[k]) g.fillStyle(PATH_COLORS[picks[k]], 1).fillPoints(pts, true);
      g.lineStyle(1.5, picks[k] ? 0xffffff : 0x8a8a8a, picks[k] ? 0.9 : 0.7).strokePoints(pts, true);
    }
  }

  /**
   * DJ Babyface's hype meter: a slim purple bar over the booth while a wave is on (or while it holds some
   * charge), and a bobbing "DROP!" once it's full and a wave is on (click the booth to drop the beat).
   */
  drawHype(b, x, rowY, time, rowBusy, labels) {
    // One slim pill, stacked over the label row (level chip / health bar) when that's showing, or in its place
    // when it isn't, so the two never overlap. During waves it always shows; between waves only on hover /
    // selection. When the meter is full in a wave, the beat-ready icon takes the pill's place.
    const g = this.hypeGfx;
    g.clear();
    const fill = b.destroyed ? 0 : hypeFill(b);
    const wave = !!this.scene.gs && isWaveActive(this.scene.gs);
    const show = !b.destroyed && (wave || labels);
    const ready = show && wave && fill >= 1;
    const y = rowBusy ? rowY - HYPE_STACK : rowY; // the pill's center line
    this.hypeReady.setVisible(ready);
    if (ready) {
      const base = this.hypeReady.type === 'Image' ? 40 / this.hypeReady.frame.height : 1;
      this.hypeReady.setPosition(x, y - 14 + Math.sin(time * 0.006) * 3).setScale(base * (1 + 0.06 * Math.sin(time * 0.012)));
      return;
    }
    if (!show) return;
    const w = HYPE_W, h = 6;
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, (h + 4) / 2);
    g.fillStyle(0x3a2250, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, h / 2);
    if (fill > 0) g.fillStyle(0xc070ff, 1).fillRoundedRect(x - w / 2, y - h / 2, Math.max(h, w * fill), h, h / 2);
  }

  /**
   * Picture variants of a level's art: the Cannon in 4 facings (_dl / _dr / _ul / _ur), turned toward the enemy
   * it's shooting and keeping its last facing between waves (new ones face down-left); the Storage in 3 fills
   * (_fill1..3) by how full your gold is (below 1/3, from 1/3, from 2/3 of your max). Falls back to the plain
   * level picture when a variant isn't loaded.
   */
  variantKey(b, key, time = 0) {
    if (b.destroyed || !/_lv\d+$/.test(key)) return key;
    let variant = null;
    if (b.type === 'cannon' || b.type === 'mortar' || b.type === 'spear') {
      // Cannon: 4 facings. Mortar: left (its plain picture) or right (_r). Turned toward the enemy it's shooting;
      // with nothing to shoot (between waves too) it looks around now and then, at random (lookAround).
      const gs = this.scene.gs;
      const t = b.targetId && gs ? gs.enemies.find((e) => e.id === b.targetId && e.alive) : null;
      const four = b.type !== 'mortar'; // Cannon and Spear Thrower: 4 facings
      if (t) {
        const a = gridToScreen(b.col + fpW(b) / 2, b.row + fpH(b) / 2), p = gridToScreen(t.x, t.y);
        const dx = p.x - a.x, dy = p.y - a.y;
        this.facing = four ? (dy >= 0 ? (dx < 0 ? 'dl' : 'dr') : (dx < 0 ? 'ul' : 'ur')) : (dx < 0 ? 'l' : 'r');
        this.lookAt = time + IDLE_TURN_MS[0] + Math.random() * (IDLE_TURN_MS[1] - IDLE_TURN_MS[0]);
      } else {
        this.lookAround(four ? ['dl', 'dr', 'ul', 'ur'] : ['l', 'r'], time);
      }
      const f = this.facing || (four ? 'dl' : 'l');
      variant = four ? `${key}_${f}` : f === 'r' ? `${key}_r` : null;
    } else if (b.type === 'storage') {
      const gs = this.scene.gs;
      const cap = gs ? gs.capacity : 0;
      const f = cap > 0 ? gs.gold / cap : 0;
      variant = `${key}_fill${f >= 2 / 3 ? 3 : f >= 1 / 3 ? 2 : 1}`;
    }
    return variant && this.scene.textures.exists(variant) ? variant : key;
  }

  /** Idle: every few seconds (IDLE_TURN_MS, random) turn to a different facing from `options`. */
  lookAround(options, time) {
    if (this.lookAt === undefined) this.lookAt = time + Math.random() * IDLE_TURN_MS[1]; // not all in step
    if (time < this.lookAt) return;
    this.lookAt = time + IDLE_TURN_MS[0] + Math.random() * (IDLE_TURN_MS[1] - IDLE_TURN_MS[0]);
    const others = options.filter((o) => o !== (this.facing || options[0]));
    this.facing = others[Math.floor(Math.random() * others.length)];
  }

  /** Hit flash: tint white for 80 ms. Throttled so a building under constant attack flickers instead of staying white. */
  flash(time) {
    if (time - (this.lastFlash || -Infinity) < FLASH_MIN_GAP_MS) return;
    this.lastFlash = time;
    this.sprite.setTintFill(0xffffff);
    this.flashUntil = time + 80;
  }

  /** Click effect: the building squashes and springs back while gold rings ripple out from its footprint. */
  /** Upgrade: grow from the old size, swell a little past the new one, then settle. */
  growPop(oldLevel, newLevel) {
    if (this.popTween) this.popTween.stop();
    const top = topLevelOf(this.b.type);
    const ratio = levelSizeFactor(oldLevel, top, this.b.type) / levelSizeFactor(newLevel, top, this.b.type);
    this.bx = ratio;
    this.by = ratio;
    this.popTween = this.scene.tweens.chain({
      targets: this,
      tweens: [
        { bx: 1.1, by: 1.1, duration: 160, ease: 'Quad.easeOut' },
        { bx: 1, by: 1, duration: 420, ease: 'Back.easeOut' }
      ]
    });
  }

  pop() {
    startPop(this.scene, this);
    const b = this.b;
    if (b) footprintRipple(this.scene, b.col, b.row, b.size, b.size);
  }

  setAlpha(a) {
    this.baseAlpha = a;
    this.sprite.setAlpha(a * this.fade);
    this.badge.setAlpha(a);
    this.hpBar.setAlpha(a);
  }

  /** See-through while it stands in front of the hovered / selected building (1 = solid). */
  setFade(f) {
    if (f === this.fade) return;
    this.fade = f;
    this.sprite.setAlpha(this.baseAlpha * f);
  }

  /** Top-center of the sprite in world pixels (for tutorial arrows and labels). */
  topCenter() {
    return { x: this.sprite.x, y: this.sprite.y - this.sprite.displayHeight };
  }

  /** Is the world point on a visible pixel of this building's sprite? */
  hitTest(wx, wy) {
    return spriteHit(this.scene, this.sprite, wx, wy);
  }

  destroy() {
    if (this.popTween) this.popTween.stop();
    this.sprite.destroy();
    this.badge.destroy();
    this.hpBar.destroy();
    this.light.destroy();
    if (this.coin) this.coin.destroy();
    if (this.hypeGfx) { this.hypeGfx.destroy(); this.hypeReady.destroy(); }
    if (this.researchIcon) this.researchIcon.destroy();
  }
}
