// Day/night visuals. The clock itself is game state (src/logic/dayNight.js); this only draws it: the dusk or
// dawn map fades in over the day map as it starts getting dark, the night map then fades in over that (and
// back out the same way at dawn), and world sprites read scene.night (0 = day, 1 = full night) and
// scene.ambientTint every frame. A missing twilight picture is simply skipped.
import { TEX } from '../assetKeys.js';
import { MAP } from '../mapTiles.js';
import { nightAmount, skyBlend, DARK_AT } from '../logic/clockLight.js';

// Light moonlit tint: buildings and enemies stay clearly visible at night (the night map does the darkening).
export const NIGHT_TINT = 0xbcc6ee;
// The warm tint sprites get at dusk and dawn, so buildings match the orange sky behind them.
export const TWILIGHT_TINT = 0xffd2a8;
const TWILIGHT_TINT_STRENGTH = 0.6; // share of the way to TWILIGHT_TINT at the warmest moment

/**
 * Night lighting strength (enemy glows, building light pools) for a night amount: 0 until it's dark
 * (nightAmount >= DARK_AT), then rising to 1 at full night, so nothing glows in daylight or early dusk.
 */
export function darkness(night) {
  return Math.max(0, Math.min(1, (night - DARK_AT) / (1 - DARK_AT)));
}

/** Blend two 0xRRGGBB colors. */
export function lerpColor(a, b, t) {
  const ch = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** The sprite tint for a clock: white by day, warm in the twilight, moonlit at night. */
export function ambientTintFor(clock) {
  const blend = skyBlend(clock);
  const moon = lerpColor(0xffffff, NIGHT_TINT, nightAmount(clock));
  return lerpColor(moon, TWILIGHT_TINT, blend.warm * TWILIGHT_TINT_STRENGTH);
}

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    // Stacked above the day map, in order: dawn, dusk, night (each full-size and faded in by update()).
    const layer = (key, depth) => (scene.textures.exists(key)
      ? scene.add.image(0, 0, key).setOrigin(0, 0).setDisplaySize(MAP.imageWidth, MAP.imageHeight).setDepth(depth).setAlpha(0)
      : null);
    this.dawnMap = layer(TEX.mapDawn, -9999);
    this.duskMap = layer(TEX.mapDusk, -9998);
    this.nightMap = layer(TEX.mapNight, -9997);
    scene.night = 0;
    scene.ambientTint = 0xffffff;
  }

  /** Apply the light level for the game's current clock. */
  update(clock) {
    const blend = skyBlend(clock);
    this.scene.night = nightAmount(clock);
    this.scene.ambientTint = ambientTintFor(clock);
    if (this.dawnMap) this.dawnMap.setAlpha(blend.dawn);
    if (this.duskMap) this.duskMap.setAlpha(blend.dusk);
    if (this.nightMap) this.nightMap.setAlpha(blend.night);
  }
}
