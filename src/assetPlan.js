// What loads when (v0.6.2, for phones: the game used to download and decode every file, ~93 MB, before the
// title screen). Pure functions over the asset manifest; src/assetLoader.js does the loading.
//
//   core      loaded by BootScene behind the loading bar: the UI, maps, enemies, heroes, spells, projectiles, every
//             building's Level 1 picture (the shop, How to Play), destroyed / rubble pictures, walls, every Village
//             Hall picture (Villages list), the What's New window's building icons, the sound effects and the
//             title music.
//   deferred  building pictures past Level 1 (except walls and the Village Hall), and the music and ambience
//             tracks. A village's own pictures are fetched first (villageImageKeys: before it opens, from the
//             title screen), then what its Village Hall can build (reachableImageKeys), in the background; any
//             other picture is fetched the moment something draws it (buildingTextureKey asks for it and shows
//             the closest lower level meanwhile). Music and ambience load when they first play (audio.js).
import { IMAGE_FILES, AUDIO_FILES } from './assetManifest.js';
import { BUILDING_TYPES, maxLevel } from './logic/buildings.js';
import { PATCH_RELEASES } from './patchNotes.js';

const LEVEL_ART = /^bld_([A-Za-z]+)_lv(\d+)(?:_[a-z0-9]+)?$/;
// Levels per picture: a building gets new art every 2 levels (some every level). Kept equal to BuildingView's
// LEVELS_PER_ART / LEVELS_PER_ART_BY_TYPE (a test checks), so this module stays free of view code.
export const ART_LEVELS = { default: 2, rvlab: 1, wall: 1, dj: 1, catapult: 1, altar: 4, queenAltar: 4 };
export const artTierOf = (level, type) => Math.ceil(level / (ART_LEVELS[type] ?? ART_LEVELS.default));

const IMAGE_PATH = new Map(IMAGE_FILES.map((f) => [f.key, f.path]));
const AUDIO_PATH = new Map(AUDIO_FILES.map((f) => [f.key, f.path]));

// The What's New window's building icons, every tab's (drawn once, on the title screen): always core, so they show
// right away.
let patchIcons = null;
const patchIconKeys = () => patchIcons || (patchIcons = new Set(PATCH_RELEASES.flatMap((r) => r.entries)
  .filter((e) => e.icon && e.icon.building)
  .flatMap((e) => { const k = levelArtKey(e.icon.building, e.icon.level || 1); return k ? artGroup(k) : []; })));

/** Is this image file one that waits (a building picture past Level 1, other than walls and the Village Hall)? */
export function isDeferredImage(key) {
  const m = LEVEL_ART.exec(key);
  return !!m && m[1] !== 'wall' && m[1] !== 'townHall' && Number(m[2]) >= 2 && !patchIconKeys().has(key);
}

/** Is this sound one that loads when it first plays (music and ambience, except the title music)? */
export function isDeferredAudio(key) {
  return /^(music|ambient)_/.test(key) && key !== 'music_title';
}

export const coreImages = () => IMAGE_FILES.filter((f) => !isDeferredImage(f.key));
export const coreAudio = () => AUDIO_FILES.filter((f) => !isDeferredAudio(f.key));
export const imagePath = (key) => IMAGE_PATH.get(key) || null;
export const audioPath = (key) => AUDIO_PATH.get(key) || null;

/** A level picture and its variants that exist (the Cannon's facings _dl.., the Storage's fills _fill1..). */
export function artGroup(key) {
  if (!IMAGE_PATH.has(key)) return [];
  const prefix = `${key}_`;
  return [key, ...IMAGE_FILES.map((f) => f.key).filter((k) => k.startsWith(prefix) && LEVEL_ART.test(k))];
}

/** The picture a building at this level uses: its tier's, else the closest lower one that exists (as BuildingView). */
export function levelArtKey(type, level) {
  for (let t = artTierOf(Math.max(1, level), type); t >= 1; t--) {
    const k = `bld_${type}_lv${t}`;
    if (IMAGE_PATH.has(k)) return k;
  }
  return null;
}

const deferredGroup = (type, level) => {
  const k = levelArtKey(type, level);
  return k && isDeferredImage(k) ? artGroup(k) : [];
};

/** The deferred pictures a village's buildings show right now (load these before it opens). */
export function villageImageKeys(buildings) {
  const out = new Set();
  for (const b of buildings || []) if (b && b.type && Number.isInteger(b.level)) for (const k of deferredGroup(b.type, b.level)) out.add(k);
  return [...out];
}

/**
 * The deferred pictures a village could need soon: every building type's levels up to one past its Village Hall
 * (a building can't be a higher level than the hall, and the hall's next level is the next thing to unlock).
 */
export function reachableImageKeys(townHallLevel) {
  const out = new Set();
  const cap = Math.max(1, townHallLevel) + 1;
  for (const type of BUILDING_TYPES) {
    const top = Math.min(cap, maxLevel(type));
    for (let l = 2; l <= top; l++) for (const k of deferredGroup(type, l)) out.add(k);
  }
  return [...out];
}
