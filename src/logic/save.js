// Save format (versioned JSON), validation, and safe localStorage access.
// `storage` is passed in (window.localStorage in the game, a fake in tests). Every access is try/catch.
import { validHeroSleep } from './hero.js';
import { CONFIG } from '../config.js';
import { BUILDING_TYPES, HERO_TYPES, WALL_ORIENTS, footprintDims, buildingSize, maxLevel, levelStats, isDefense, maxHp, wallLevel, commonWallLevel } from './buildings.js';
import { isRectOnGrass, footprintsOverlap } from './grid.js';
import { MAP } from '../mapTiles.js';
import { validDecorSeed } from './decor.js';
import { GRID_SIZE, LEGACY_GRID, GRID_40 } from '../gridConfig.js';
import { serializeResearch, validResearch, deserializeResearch, hasAbilities, convertOldResearch, convertMixedResearch, picksFor } from './abilities.js';
import { validLabGuide } from './labGuide.js';
import { validHype } from './dj.js';
import { mineStockCap } from './economy.js';
import { serializeTips, validTips, deserializeTips } from './tips.js';
import { validResearchPoints } from './researchPoints.js';
import { serializeSpells, validSpells, deserializeSpells, validFuelGuide } from './spells.js';
import { PATHS } from './waves.js';
import { isMergeable, serializeMastery, validMastery, validFreeRespecs } from './merge.js';

// Version 2 adds the day/night clock and nightsAtMaxTownHall (waves come at night).
// Version 1 saves (waves on Town Hall upgrade) still load: see migrateV1.
// Version 4: walls went from 10 levels (a picture per 2) to 6 (a picture each); see migrateV3.
// Version 5: the RV Lab's research applies to every building (one pick per tier per type); see migrateV4.
// Version 6: a type's research is locked to one path (A, B or C); see migrateV5.
// Version 7: the Spear Thrower (5 -> 10 levels) and Fuel Station (4 -> 8) got a picture per 2 levels; see migrateV6.
// Version 8 (v0.11): walls went from 8 levels to 10, with a new Level 6; see migrateV7.
export const SAVE_VERSION = 8;
// Wall segments were 3 tiles long up to save version 2.
const V2_WALL_LENGTH = 3;
export const SAVE_KEYS = {
  save: 'ibtd.save', checkpoint: 'ibtd.checkpoint', settings: 'ibtd.settings',
  // New Game moves the old save and checkpoint here instead of deleting them, so a village can be recovered
  // (e.g. a save the game failed to read because of a bug). One slot each: the most recent replaced game.
  backup: 'ibtd.save.backup', checkpointBackup: 'ibtd.checkpoint.backup',
  // The last release whose patch notes this device has seen (PatchNotesWindow.js): its own key, since saveSettings
  // rewrites the settings object.
  patchNotes: 'ibtd.patchNotes'
};
export const DEFAULT_SETTINGS = { music: 0.7, sfx: 0.7 };
const CLOCK_PHASES = ['day', 'dusk', 'night', 'dawn'];
// A grace period longer than a day stores a negative day time; anything beyond this is corrupt.
const MAX_GRACE_SECONDS = 3600;

/** Game state -> plain save object (version 2 format). */
export function serializeGame(state, now = new Date()) {
  const th = state.buildings.find((b) => b.type === 'townHall');
  const clock = state.clock || { phase: 'day', t: 0 };
  return {
    version: SAVE_VERSION,
    grid: GRID_SIZE, // the grid it was saved on (52 since v0.9.2; 40 in v0.9.0-0.9.1; none: the 32 x 31 map; see migrateGrid)
    savedAt: now.toISOString(),
    gold: Math.floor(state.gold),
    townHallLevel: th ? th.level : 1,
    wavesCleared: state.wavesCleared,
    nightsAtMaxTownHall: state.nightsAtMaxTownHall || 0,
    clock: { phase: clock.phase, t: Math.round(clock.t * 100) / 100 },
    tutorialStep: state.tutorialStep,
    tutorialDone: !!state.tutorialDone,
    // RV Lab research: { type: "aba" }, the pick at each tier (left out when nothing is researched). Every
    // building of that type has those tiers, so buildings don't store them.
    research: serializeResearch(state.research),
    labGuide: state.labGuideStep || 0, // RV Lab guide step (labGuide.js); missing in older saves
    wavePlan: state.wavePlan ? { number: state.wavePlan.number, paths: [...state.wavePlan.paths] } : null, // next wave's corners (waves.js); missing in older saves
    tips: serializeTips(state),        // first-time tips already shown (tips.js); missing in older saves
    researchPoints: Math.floor(state.researchPoints || 0), // RP for RV Lab abilities; missing in older saves
    spells: serializeSpells(state),    // Fuel Station spells brewed and waiting ("rage,heal"); missing in older saves
    fuelGuide: state.fuelGuide || 0,   // Fuel Station guide step (spells.js); missing in older saves
    wallLevel: wallLevel(state), // every wall's level (walls upgrade all at once); missing in older saves
    ...(validDecorSeed(state.decorSeed) ? { decorSeed: state.decorSeed } : {}), // where its grass tufts grow (decor.js); v0.9.1
    debuted: [...(state.debuted || [])], // enemies whose debut wave this village has had (waves.js); missing in older saves
    mastery: serializeMastery(state),           // merged defenses' Mastery tiers per type ({ cannon: 2 }, merge.js); missing in older saves
    buildings: state.buildings.map((b) => {
      const out = { id: b.id, type: b.type, level: b.level, col: b.col, row: b.row };
      if (b.type === 'mine') out.stock = Math.round((b.stock || 0) * 100) / 100;
      if (HERO_TYPES.includes(b.type) && b.heroSleep > 0) out.heroSleep = Math.round(b.heroSleep * 10) / 10; // a hero's nap (the Brisket King's, the Hatsune Queen's)
      if (b.type === 'wall') out.orient = b.orient || 'x';
      if (b.merged) out.merged = true; // a merged defense (merge.js): its Mastery comes from `mastery`, by type
      // Ruins only exist mid-night (everything is rebuilt free when the wave is beaten).
      if (b.destroyed && b.type !== 'townHall') out.destroyed = true;
      return out;
    })
  };
}

const isInt = (v) => Number.isInteger(v);
const SINGLE_PATH_RE = /^(a+|b+|c+)$/;

/** The next wave's saved entrances: missing / null (planned on load) or { number: wave >= 1, paths: 1 to all of PATHS }. */
export function validWavePlan(p) {
  if (p === undefined || p === null) return true;
  return typeof p === 'object' && isInt(p.number) && p.number >= 1 && Array.isArray(p.paths)
    && p.paths.length >= 1 && p.paths.length <= PATHS.length && p.paths.every((x) => PATHS.includes(x));
}

/**
 * Version 1 -> version 2. v1 had no clock (start at morning) and a 10-step tutorial whose
 * steps 8-10 were "upgrade Town Hall / wave incoming / you did it" (now: night falls / you survived).
 */
export function migrateV1(obj) {
  const stepMap = { 8: 8, 9: 8, 10: 9, 11: 10 };
  const step = stepMap[obj.tutorialStep] ?? Math.min(obj.tutorialStep, 10);
  return { ...obj, version: 2, nightsAtMaxTownHall: 0, clock: { phase: 'day', t: 0 }, tutorialStep: step, tutorialDone: obj.tutorialDone || step >= 10 };
}

/**
 * Version 2 -> version 3: walls became single tiles. Each old 3-tile segment becomes one wall per tile
 * (same level; the first keeps the segment's id), so the same fence stands where it stood.
 */
export function migrateV2(obj) {
  if (!Array.isArray(obj.buildings)) return { ...obj, version: 3 };
  let maxId = 0;
  for (const b of obj.buildings) {
    const n = parseInt(String(b && b.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
  }
  const buildings = [];
  for (const b of obj.buildings) {
    if (!b || b.type !== 'wall' || CONFIG.walls.segmentLength >= V2_WALL_LENGTH) { buildings.push(b); continue; }
    for (let i = 0; i < V2_WALL_LENGTH; i++) {
      const col = b.orient === 'y' ? b.col : b.col + i;
      const row = b.orient === 'y' ? b.row + i : b.row;
      buildings.push({ ...b, id: i === 0 ? b.id : `b${++maxId}`, col, row });
    }
  }
  return { ...obj, version: 3, buildings };
}

/**
 * Version 3 -> version 4: walls went from 10 levels to 6, one picture per level. An old wall keeps its picture:
 * old Level L showed picture ceil(L / 2), which is now Level ceil(L / 2).
 */
export function migrateV3(obj) {
  if (!Array.isArray(obj.buildings)) return { ...obj, version: 4 };
  const buildings = obj.buildings.map((b) => (b && b.type === 'wall' && Number.isInteger(b.level)
    ? { ...b, level: Math.max(1, Math.ceil(b.level / 2)) } : b));
  return { ...obj, version: 4, buildings };
}

/**
 * Version 4 -> version 5: research was options per path and each building bought its own tiers; now the
 * RV Lab picks one option per tier for a type and every building of that type gets it. The kept pick at
 * each tier is the one most buildings bought (convertOldResearch); research that isn't kept is refunded in RP.
 * The RV Lab guide lost its "open Abilities" and "buy" steps (4, 5): those villages finish it.
 */
export function migrateV4(obj) {
  const { research, refund } = convertOldResearch(obj.research, obj.buildings);
  const buildings = Array.isArray(obj.buildings) ? obj.buildings.map((b) => {
    if (!b || typeof b !== 'object') return b;
    const rest = { ...b };
    delete rest.picks; // old per-building tiers (now from the research)
    delete rest.paths;
    return rest;
  }) : obj.buildings;
  const rp = Number.isInteger(obj.researchPoints) && obj.researchPoints >= 0 ? obj.researchPoints : 0;
  const labGuide = Number.isInteger(obj.labGuide) && obj.labGuide >= 4 && obj.labGuide < 99 ? 99 : obj.labGuide;
  return { ...obj, version: 5, research, researchPoints: rp + refund, labGuide, buildings };
}

/**
 * Version 5 -> version 6: the first RV Lab pick for a type now locks its path. A type with picks on several
 * paths keeps the path with the most picks (convertMixedResearch) and the RP it paid beyond that is refunded.
 */
export function migrateV5(obj) {
  const { research, refund } = convertMixedResearch(obj.research);
  const rp = Number.isInteger(obj.researchPoints) && obj.researchPoints >= 0 ? obj.researchPoints : 0;
  // The Diddypult (catapult) went from 6 levels to 5: a saved level 6 becomes 5.
  const buildings = Array.isArray(obj.buildings)
    ? obj.buildings.map((b) => (b && b.type === 'catapult' && Number.isInteger(b.level) && b.level > 5 ? { ...b, level: 5 } : b))
    : obj.buildings;
  return { ...obj, version: 6, research: obj.research === undefined ? obj.research : research, researchPoints: rp + refund, buildings };
}

/**
 * Version 6 -> version 7: the Spear Thrower went from 5 levels (a picture each) to 10 and the Fuel Station from 4 to
 * 8 (a picture per 2 levels). Old level L becomes 2L - 1, the first level that shows the same picture (and, for the
 * Fuel Station, opens the same spells), kept no higher than the Village Hall allows.
 */
export function migrateV6(obj) {
  const cap = Number.isInteger(obj.townHallLevel) ? Math.max(1, obj.townHallLevel) : 1;
  const buildings = Array.isArray(obj.buildings)
    ? obj.buildings.map((b) => (b && (b.type === 'spear' || b.type === 'fuelStation') && Number.isInteger(b.level) && b.level >= 1
      ? { ...b, level: Math.max(1, Math.min(2 * b.level - 1, cap)) } : b))
    : obj.buildings;
  return { ...obj, version: 7, buildings };
}

/**
 * Version 7 -> version 8 (v0.11): walls went from 8 levels to 10, with a new picture as Level 6, so the old Levels 6-8
 * are now 7-9. A wall keeps its picture and strength: a saved wall level (wallLevel and each wall's own level) of 6 or
 * more goes up by one. That stays within the Village Hall level (the old Levels 6-8 needed Halls 8-10), so the save
 * stays valid; walls above the new hall rule (Level N at Hall 2N - 1) are kept, they just can't upgrade yet.
 */
export function migrateV7(obj) {
  const up = (l) => (Number.isInteger(l) && l >= 6 ? l + 1 : l);
  const buildings = Array.isArray(obj.buildings)
    ? obj.buildings.map((b) => (b && b.type === 'wall' ? { ...b, level: up(b.level) } : b))
    : obj.buildings;
  return { ...obj, version: 8, buildings, ...(obj.wallLevel !== undefined ? { wallLevel: up(obj.wallLevel) } : {}) };
}

/**
 * Older grids. Saves from before v0.9.0 have no `grid` field: their buildings sit on the old 32 x 31 grid (Village Hall
 * at (17, 15)), and every building moves by the same shift, so the old hall lands on the new one's anchor (25, 25).
 * v0.9.0-0.9.1 saves say `grid: 40`: that grid is the middle of today's 52 x 52 one, so everything moves GRID_EXTEND (6)
 * tiles down and right. Either way the layout keeps its exact shape; a building that then isn't on the playable grass
 * (the old grids' corners lie over today's scenery) moves to the nearest free grass spot (onGrass).
 */
export function migrateGrid(obj) {
  if (!obj || !Array.isArray(obj.buildings)) return obj;
  const from40 = obj.grid === GRID_40.size;
  const dc = from40 ? GRID_40.shift : MAP.townHallAnchor[0] - LEGACY_GRID.townHallAnchor[0];
  const dr = from40 ? GRID_40.shift : MAP.townHallAnchor[1] - LEGACY_GRID.townHallAnchor[1];
  const moved = obj.buildings.map((b) => (b && Number.isInteger(b.col) && Number.isInteger(b.row) ? { ...b, col: b.col + dc, row: b.row + dr } : b));
  return { ...obj, grid: GRID_SIZE, buildings: onGrass(moved) };
}

/**
 * v0.9.2: the playable grass isn't the whole grid (tiles touching a bridge aren't playable), so a building a migrated save
 * left on a tile that isn't grass moves to the nearest free spot that is (walls and buildings alike); everything else
 * stays put. Malformed entries are left for validateSave to judge.
 */
function onGrass(buildings) {
  const ok = (b) => b && typeof b.type === 'string' && BUILDING_TYPES.includes(b.type) && Number.isInteger(b.col) && Number.isInteger(b.row);
  const dims = (b) => footprintDims(b.type, b.orient || 'x');
  const placed = buildings.filter((b) => ok(b) && isRectOnGrass(b.col, b.row, dims(b).w, dims(b).h));
  const fits = (b, c, r) => {
    const { w, h } = dims(b);
    if (!isRectOnGrass(c, r, w, h)) return false;
    return placed.every((o) => !footprintsOverlap({ col: c, row: r, w, h }, { col: o.col, row: o.row, ...dims(o) }));
  };
  return buildings.map((b) => {
    if (!ok(b) || placed.includes(b)) return b;
    for (let d = 1; d < GRID_SIZE; d++) {
      for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== d || !fits(b, b.col + dc, b.row + dr)) continue;
        const nb = { ...b, col: b.col + dc, row: b.row + dr };
        placed.push(nb);
        return nb;
      }
    }
    return b;
  });
}

/** True only for a well-formed version 7 save whose buildings all sit on grass without overlapping. */
export function validateSave(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.version !== SAVE_VERSION) return false;
  if (!isInt(obj.nightsAtMaxTownHall) || obj.nightsAtMaxTownHall < 0) return false;
  if (!obj.clock || !CLOCK_PHASES.includes(obj.clock.phase) || typeof obj.clock.t !== 'number' || !Number.isFinite(obj.clock.t) || obj.clock.t < -MAX_GRACE_SECONDS) return false;
  if (typeof obj.gold !== 'number' || !Number.isFinite(obj.gold) || obj.gold < 0) return false;
  if (!isInt(obj.townHallLevel) || obj.townHallLevel < 0 || obj.townHallLevel > maxLevel('townHall')) return false;
  if (!isInt(obj.wavesCleared) || obj.wavesCleared < 0) return false;
  if (!isInt(obj.tutorialStep) || obj.tutorialStep < 1) return false;
  if (typeof obj.tutorialDone !== 'boolean') return false;
  if (!Array.isArray(obj.buildings)) return false;
  if (!validResearch(obj.research)) return false;
  // Since version 6 a type's research follows one path ("aaa", never "aba"; migrateV5 converts older ones).
  if (obj.research && Object.values(obj.research).some((v) => !SINGLE_PATH_RE.test(v))) return false;
  if (!validWavePlan(obj.wavePlan)) return false;
  if (!validLabGuide(obj.labGuide)) return false;
  if (!validTips(obj.tips)) return false;
  if (!validResearchPoints(obj.researchPoints)) return false;
  if (!validSpells(obj.spells)) return false;
  if (!validFuelGuide(obj.fuelGuide)) return false;
  // freeRespecs: v0.8.0-0.8.2 saves list the types with a merge's free path reset. Still checked as before, so no save
  // changes validity, but ignored on load (v0.8.3 removed free resets; an unused one is dropped).
  if (!validMastery(obj.mastery) || !validFreeRespecs(obj.freeRespecs)) return false;
  if (obj.decorSeed !== undefined && !validDecorSeed(obj.decorSeed)) return false;
  if (obj.wallLevel !== undefined && (!isInt(obj.wallLevel) || obj.wallLevel < 1 || obj.wallLevel > Math.min(maxLevel('wall'), Math.max(1, obj.townHallLevel)))) return false;

  const seen = new Set();
  const placed = [];
  let townHalls = 0;
  for (const b of obj.buildings) {
    if (!b || typeof b !== 'object' || typeof b.id !== 'string' || seen.has(b.id)) return false;
    seen.add(b.id);
    if (!BUILDING_TYPES.includes(b.type)) return false;
    if (!isInt(b.level) || b.level < (b.type === 'townHall' ? 0 : 1) || b.level > maxLevel(b.type)) return false;
    if (!isInt(b.col) || !isInt(b.row)) return false;
    if (b.type === 'wall' && !WALL_ORIENTS.includes(b.orient)) return false;
    const fp = { col: b.col, row: b.row, ...footprintDims(b.type, b.orient) };
    if (!isRectOnGrass(fp.col, fp.row, fp.w, fp.h)) return false;
    if (placed.some((p) => footprintsOverlap(p, fp))) return false;
    placed.push(fp);
    if (b.type === 'townHall') {
      townHalls++;
      if (b.level !== obj.townHallLevel) return false;
    }
    if (b.type === 'mine' && b.stock !== undefined && (typeof b.stock !== 'number' || !Number.isFinite(b.stock) || b.stock < 0)) return false;
    if (b.hype !== undefined && (b.type !== 'dj' || !validHype(b.hype))) return false;
    if (b.heroSleep !== undefined && (!HERO_TYPES.includes(b.type) || !validHeroSleep(b.heroSleep))) return false;
    if (b.destroyed !== undefined && (b.destroyed !== true || b.type === 'townHall')) return false;
    // Merged (v0.8): only a mergeable type, at its top level.
    if (b.merged !== undefined && (b.merged !== true || !isMergeable(b.type) || b.level !== maxLevel(b.type))) return false;
  }
  if (townHalls !== 1) return false;
  // Level 1 buildings are allowed beside the ruined level 0 hall (the skip-tutorial starter base).
  return obj.buildings.every((b) => b.level <= Math.max(1, obj.townHallLevel));
}

/** Save object -> fresh game data (buildings at full HP, ruins at 0). Assumes validateSave passed. */
export function deserializeGame(obj) {
  let maxId = 0;
  const research = deserializeResearch(obj.research);
  const mastery = obj.mastery && validMastery(obj.mastery) ? { ...obj.mastery } : {};
  // Walls all share one level. Saves from before that (no wallLevel) take their walls' most common level
  // (ties: the higher one; commonWallLevel), and every wall is brought to it, up or down.
  const walls = obj.wallLevel !== undefined ? obj.wallLevel : commonWallLevel(obj.buildings);
  const buildings = obj.buildings.map((s) => {
    const n = parseInt(String(s.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n)) maxId = Math.max(maxId, n);
    const level = s.type === 'wall' ? walls : s.level;
    const b = { id: s.id, type: s.type, level, col: s.col, row: s.row, ...footprintDims(s.type, s.orient), hp: levelStats(s.type, level).hp, destroyed: false };
    if (s.type === 'wall') b.orient = s.orient;
    else b.size = buildingSize(s.type);
    if (s.type === 'mine') b.stock = s.stock || 0; // clamped below, once its perks (Deep Vault) are known
    if (s.type === 'dj') b.hype = 0; // (a saved charge from before v0.11.1 is dropped: the meter empties between waves)
    if (HERO_TYPES.includes(s.type)) b.heroSleep = s.heroSleep || 0;
    if (isDefense(s.type)) { b.cooldown = 0; b.targetId = null; }
    if (hasAbilities(s.type)) b.picks = picksFor(research, s.type);
    if (s.merged) { b.merged = true; if (mastery[s.type]) b.mastery = mastery[s.type]; } // a merged defense, with its type's Mastery
    b.hp = maxHp(b); // with any health tiers (and a merged one's extra health)
    if (s.type === 'mine') b.stock = Math.min(b.stock, mineStockCap(b));
    if (s.destroyed) { b.destroyed = true; b.hp = 0; }
    return b;
  });
  return {
    gold: obj.gold,
    wavesCleared: obj.wavesCleared,
    nightsAtMaxTownHall: obj.nightsAtMaxTownHall,
    clock: { phase: obj.clock.phase, t: obj.clock.t },
    tutorialStep: obj.tutorialStep,
    tutorialDone: obj.tutorialDone,
    research,
    mastery,
    labGuideStep: obj.labGuide || 0,
    tipsSeen: deserializeTips(obj.tips),
    wavePlan: obj.wavePlan && validWavePlan(obj.wavePlan) ? { number: obj.wavePlan.number, paths: [...new Set(obj.wavePlan.paths)] } : null,
    researchPoints: obj.researchPoints || 0,
    spells: deserializeSpells(obj.spells),
    fuelGuide: obj.fuelGuide || 0,
    wallLevel: walls,
    decorSeed: validDecorSeed(obj.decorSeed) ? obj.decorSeed : null, // null: a save from before v0.9.1 (GameState makes one)
    // null = a save from before debut waves (GameState fills it in for its hall: waves.js legacyDebuted).
    debuted: Array.isArray(obj.debuted) ? obj.debuted.filter((k) => typeof k === 'string' && CONFIG.enemies[k]) : null,
    buildings,
    nextId: maxId + 1
  };
}

/** JSON text -> { status: 'none' | 'ok' | 'invalid', data }. Never throws. */
export function parseSave(text) {
  if (text === null || text === undefined || text === '') return { status: 'none', data: null };
  let obj;
  try { obj = JSON.parse(text); } catch { return { status: 'invalid', data: null }; }
  if (obj && typeof obj === 'object' && obj.version === 1 && Number.isInteger(obj.tutorialStep)) obj = migrateV1(obj);
  if (obj && typeof obj === 'object' && obj.version === 2) obj = migrateV2(obj);
  if (obj && typeof obj === 'object' && obj.version === 3) obj = migrateV3(obj);
  if (obj && typeof obj === 'object' && obj.version === 4) obj = migrateV4(obj);
  if (obj && typeof obj === 'object' && obj.version === 5) obj = migrateV5(obj);
  if (obj && typeof obj === 'object' && obj.version === 6) obj = migrateV6(obj);
  if (obj && typeof obj === 'object' && obj.version === 7) obj = migrateV7(obj);
  if (obj && typeof obj === 'object' && (obj.grid === undefined || obj.grid === GRID_40.size)) obj = migrateGrid(obj);
  // A planned wave from an entrance the map no longer has (v0.9.1 dropped the left waterfall): plan it again on load.
  if (obj && typeof obj === 'object' && obj.wavePlan && Array.isArray(obj.wavePlan.paths) && !obj.wavePlan.paths.every((x) => PATHS.includes(x))) obj = { ...obj, wavePlan: null };
  if (!validateSave(obj)) return { status: 'invalid', data: null };
  return { status: 'ok', data: obj };
}

export function readKey(storage, key) {
  try { return storage ? storage.getItem(key) : null; } catch { return null; }
}

export function writeKey(storage, key, value) {
  try { if (!storage) return false; storage.setItem(key, value); return true; } catch { return false; }
}

export function removeKey(storage, key) {
  try { if (storage) storage.removeItem(key); return true; } catch { return false; }
}

/** Load and validate a save slot. */
export function loadGame(storage, key = SAVE_KEYS.save) {
  return parseSave(readKey(storage, key));
}

export function writeGame(storage, state, key = SAVE_KEYS.save) {
  return writeKey(storage, key, JSON.stringify(serializeGame(state)));
}

/** Retry after game over: copy the checkpoint into the save slot. Returns true if a checkpoint existed. */
export function restoreCheckpoint(storage) {
  const text = readKey(storage, SAVE_KEYS.checkpoint);
  if (!text) return false;
  return writeKey(storage, SAVE_KEYS.save, text);
}

/**
 * New Game clears the save and checkpoint (settings stay). The old ones are kept in the backup slots
 * first, so the previous village is never lost for good; restoreBackup() brings it back.
 */
export function deleteGame(storage) {
  const save = readKey(storage, SAVE_KEYS.save);
  const checkpoint = readKey(storage, SAVE_KEYS.checkpoint);
  if (save) writeKey(storage, SAVE_KEYS.backup, save);
  if (checkpoint) writeKey(storage, SAVE_KEYS.checkpointBackup, checkpoint);
  removeKey(storage, SAVE_KEYS.save);
  removeKey(storage, SAVE_KEYS.checkpoint);
}

/** Put the backed-up game (from the last New Game) back into the save slots. Returns true if there was one. */
export function restoreBackup(storage) {
  const save = readKey(storage, SAVE_KEYS.backup);
  if (!save) return false;
  writeKey(storage, SAVE_KEYS.save, save);
  const checkpoint = readKey(storage, SAVE_KEYS.checkpointBackup);
  if (checkpoint) writeKey(storage, SAVE_KEYS.checkpoint, checkpoint);
  return true;
}

/**
 * Music and SFX volume (0-1). Older settings stored one shared `volume`; it seeds both levels.
 */
export function loadSettings(storage) {
  try {
    const obj = JSON.parse(readKey(storage, SAVE_KEYS.settings) || 'null') || {};
    const level = (v, fallback) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback);
    const legacy = level(obj.volume, null);
    return {
      music: level(obj.music, legacy ?? DEFAULT_SETTINGS.music),
      sfx: level(obj.sfx, legacy ?? DEFAULT_SETTINGS.sfx)
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  const graphics = loadGraphicsSetting(storage); // kept: it's saved on its own (saveGraphicsSetting)
  return writeKey(storage, SAVE_KEYS.settings, JSON.stringify(withFast({ music: settings.music, sfx: settings.sfx, graphics }, loadWaveSpeed(storage))));
}

// The wave speed button (src/logic/fastForward.js) lives in the same settings object: `fast` is written only when
// sped up (true for 2x, as before v0.8.9; 4 for 4x), and kept by every other settings save.
const withFast = (obj, speed) => (speed === 4 ? { ...obj, fast: 4 } : speed > 1 ? { ...obj, fast: true } : obj);

/** The saved wave speed: 1, 2 or 4. */
export function loadWaveSpeed(storage) {
  try {
    const fast = JSON.parse(readKey(storage, SAVE_KEYS.settings) || 'null')?.fast;
    return fast === 4 ? 4 : fast === true ? 2 : 1;
  } catch {
    return 1;
  }
}

/** Is the saved wave speed above 1x? */
export const loadFastSetting = (storage) => loadWaveSpeed(storage) > 1;

/** Save the wave speed: 1, 2 or 4 (true = 2x, false = 1x). */
export function saveFastSetting(storage, fast) {
  const speed = fast === true ? 2 : fast === 4 || fast === 2 ? fast : 1;
  const { music, sfx } = loadSettings(storage);
  return writeKey(storage, SAVE_KEYS.settings, JSON.stringify(withFast({ music, sfx, graphics: loadGraphicsSetting(storage) }, speed)));
}

/** Graphics quality saved with the settings (src/quality.js): 'auto' (the default), 'high' or 'low'. */
export const GRAPHICS_SETTINGS = ['auto', 'high', 'low'];

export function loadGraphicsSetting(storage) {
  try {
    const obj = JSON.parse(readKey(storage, SAVE_KEYS.settings) || 'null') || {};
    return GRAPHICS_SETTINGS.includes(obj.graphics) ? obj.graphics : 'auto';
  } catch {
    return 'auto';
  }
}

/** Save the graphics quality, keeping the volume levels. */
export function saveGraphicsSetting(storage, graphics) {
  const { music, sfx } = loadSettings(storage);
  const g = GRAPHICS_SETTINGS.includes(graphics) ? graphics : 'auto';
  return writeKey(storage, SAVE_KEYS.settings, JSON.stringify(withFast({ music, sfx, graphics: g }, loadWaveSpeed(storage))));
}
