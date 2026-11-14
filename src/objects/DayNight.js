// Day/night visuals. The clock itself is game state (src/logic/dayNight.js); this only draws it:
// the night map crossfades in over the day map, and world sprites read scene.night
// (0 = day, 1 = full night) and scene.ambientTint every frame.
import { TEX } from '../assetKeys.js';
import { MAP } from '../mapTiles.js';
import { nightAmount, DARK_AT } from '../logic/clockLight.js';

// Light moonlit tint: buildings and enemies stay clearly visible at night (the night map does the darkening).
export const NIGHT_TINT = 0xbcc6ee;

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

export class DayNight {
  constructor(scene) {
    this.scene = scene;
    this.nightMap = scene.textures.exists(TEX.mapNight)
      ? scene.add.image(0, 0, TEX.mapNight).setOrigin(0, 0).setDisplaySize(MAP.imageWidth, MAP.imageHeight).setDepth(-9999).setAlpha(0)
      : null;
    scene.night = 0;
    scene.ambientTint = 0xffffff;
  }

  /** Apply the light level for the game's current clock. */
  update(clock) {
    const night = nightAmount(clock);
    this.scene.night = night;
    this.scene.ambientTint = lerpColor(0xffffff, NIGHT_TINT, night);
    if (this.nightMap) this.nightMap.setAlpha(night);
  }
}
