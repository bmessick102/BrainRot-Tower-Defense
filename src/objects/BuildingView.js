// Draws one building: sprite, level badge, HP bar (only when damaged), and a mine's coin icon.
import { gridToScreen } from '../logic/iso.js';
import { maxHp, maxLevel, BUILDING_TYPES } from '../logic/buildings.js';
import { mineShowsCoin, mineFill } from '../logic/economy.js';
import { isWaveActive } from '../logic/util.js';
import { buildingKey, buildingLevelKey, buildingDestroyedKey, TEX } from '../assetKeys.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { MAP } from '../mapTiles.js';
import { textStyle } from '../theme.js';

const OVERLAY_DEPTH = 5000;
const FLASH_MIN_GAP_MS = 400;

// Night lighting: a pool of light on the ground around each standing building.
const LIGHT_DEPTH = -5000;        // above the map, below buildings
const LIGHT_ALPHA = 0.85;         // strength at full night
const LIGHT_SPREAD = 2.8;         // pool width in footprints
// Screen blending brightens like light but can't blow out to white where pools overlap.
const LIGHT_BLEND = 'SCREEN';
const LIGHT_COLORS = {
  townHall: 0xffa23c, mine: 0x3cb8ff, storage: 0xffb43c, house: 0xffc86b, cannon: 0xff8a3c,
  archer: 0xff9a3c, mortar: 0xff7a3c, wizard: 0xb066ff, firework: 0xff4d6d, catapult: 0xff5fa8, flock: 0x4cd6ff, mousetrap: 0xffc24a, ra: 0xff7a2a
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

// Each picture covers this many building levels: levels 1-2 use bld_<type>_lv1, 3-4 use _lv2 ... 9-10 use _lv5.
export const LEVELS_PER_ART = 2;

/** Which picture (1-based) a building level shows. */
export function artTier(level) {
  return Math.ceil(level / LEVELS_PER_ART);
}

/**
 * Best texture for a building at a level: its picture, else the closest lower picture, else the base key.
 * Destroyed: this type's own rubble art, else one of the shared rubble variants (not for walls), chosen by
 * `rubbleRoll` (0..1, picked once per destruction so it doesn't flicker), else the placeholder slab.
 */
export function buildingTextureKey(scene, type, level, destroyed = false, rubbleRoll = 0) {
  if (destroyed && type === 'wall') {
    // Walls: wooden rubble for levels 1-2, stone for 3-10 (see WALL_RUBBLE in WallView.js).
    const k = level <= 2 ? 'bld_wall_rubble_wood' : 'bld_wall_rubble_stone';
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
  for (let tier = artTier(level); tier >= 1; tier--) {
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
const SPRITE_SCALE = { mortar: 0.65, cannon: 0.63, firework: 0.52, catapult: 0.66, flock: 1.28, mousetrap: 1.1, ra: 0.54 };

// Buildings grow as they level up: this share of their normal size at Level 1, up to LEVEL_SIZE.max at
// their top level (Level 10, or Level 6 for the Catapult). They only grow on upgrades that keep the same
// picture (the new picture already looks bigger), so with art every 2 levels: Level 2, 4, 6 ... grow and
// Level 3, 5, 7 ... keep the size they had.
export const LEVEL_SIZE = { min: 0.95, max: 1.1, maxLevel: 10 };

/** How many levels from 2 up to `level` keep the previous level's picture (the levels that grow). */
function growthSteps(level) {
  let n = 0;
  for (let l = 2; l <= level; l++) if (artTier(l) === artTier(l - 1)) n++;
  return n;
}

/** Size multiplier for a building level: equal steps on the levels that don't change picture. */
export function levelSizeFactor(level, topLevel = LEVEL_SIZE.maxLevel) {
  const top = Math.max(1, topLevel);
  const total = growthSteps(top);
  const t = total ? growthSteps(Math.max(1, Math.min(top, level))) / total : 0;
  return LEVEL_SIZE.min + (LEVEL_SIZE.max - LEVEL_SIZE.min) * t;
}

/** The building's top level, for size growth (10 unless the type has fewer levels). */
function topLevelOf(type) {
  return type && BUILDING_TYPES.includes(type) ? maxLevel(type) : LEVEL_SIZE.maxLevel;
}

export function spriteScale(type) {
  return SPRITE_SCALE[type] ?? DEFAULT_SPRITE_SCALE;
}

/**
 * Size a building sprite to its footprint (times spriteScale) and stand it on the ground.
 * The shrunken art's base stays centered in the footprint: its front corner sits between the
 * footprint's center and front corner. Returns that base point (bottom-center of the sprite).
 */
export function placeBuildingSprite(sprite, col, row, size, type = null, level = 1) {
  const k = spriteScale(type) * levelSizeFactor(level, topLevelOf(type));
  const center = gridToScreen(col + size / 2, row + size / 2);
  const front = gridToScreen(col + size, row + size);
  const f = Math.min(1, k); // art wider than its footprint still stands inside it, not past the front corner
  const base = { x: center.x + (front.x - center.x) * f, y: center.y + (front.y - center.y) * f };
  const w = size * MAP.tileWidth * k;
  const frame = sprite.frame;
  sprite.setDisplaySize(w, (w * frame.height) / frame.width);
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
    this.badge = scene.add.text(0, 0, '', textStyle(16)).setOrigin(0.5, 1).setDepth(OVERLAY_DEPTH);
    this.hpBar = new HealthBar(scene, { width: b.size * 24, height: 12, depth: OVERLAY_DEPTH, color: HP_TEAM.player, badge: true });
    this.coin = b.type === 'mine' ? scene.add.image(0, 0, TEX.coin).setDepth(OVERLAY_DEPTH + 1).setVisible(false) : null;
    this.flashUntil = 0;
    this.light = scene.add.image(0, 0, TEX.light).setBlendMode(LIGHT_BLEND).setDepth(LIGHT_DEPTH)
      .setTint(LIGHT_COLORS[b.type] || 0xffa23c).setVisible(false);
    this.flickerPhase = Math.random() * Math.PI * 2;
    this.bx = 1; // click bounce multipliers (tweened by pop())
    this.by = 1;
    this.popTween = null;
    this.sync(b, 0);
  }

  sync(b, time) {
    // Roll a rubble variant once each time the building is destroyed; clear it when it's repaired.
    if (b.destroyed && this.rubbleRoll === undefined) this.rubbleRoll = Math.random();
    if (!b.destroyed) this.rubbleRoll = undefined;
    const key = buildingTextureKey(this.scene, b.type, b.level, b.destroyed, this.rubbleRoll);
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

    this.badge.setText(`Lv ${b.level}`).setPosition(front.x, top - 2);
    const max = maxHp(b);
    // While the bar shows, its badge carries the level, so the floating "Lv N" label steps aside.
    const damaged = !b.destroyed && b.hp < max;
    this.badge.setVisible(!damaged);
    this.hpBar.draw(front.x, top - 18, b.hp / max, damaged, b.level);

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
    if (!this.flashUntil) this.sprite.setTint(b.sprung ? 0x7a7a7a : this.scene.ambientTint ?? 0xffffff); // a sprung trap looks spent until it resets // moonlit at night

    // Ground light pool, fading in with the night and gently flickering.
    const night = this.scene.night || 0;
    const lit = night > 0.01 && !b.destroyed;
    this.light.setVisible(lit);
    if (lit) {
      const c = gridToScreen(b.col + b.size / 2, b.row + b.size / 2);
      const w = b.size * MAP.tileWidth * LIGHT_SPREAD;
      const flicker = 0.9 + 0.06 * Math.sin(time * 0.007 + this.flickerPhase) + 0.04 * Math.sin(time * 0.019 + this.flickerPhase * 2);
      this.light.setPosition(c.x, c.y).setDisplaySize(w, w / 2).setAlpha(night * LIGHT_ALPHA * flicker);
    }
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
    const ratio = levelSizeFactor(oldLevel, top) / levelSizeFactor(newLevel, top);
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
    this.sprite.setAlpha(a);
    this.badge.setAlpha(a);
    this.hpBar.setAlpha(a);
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
  }
}
