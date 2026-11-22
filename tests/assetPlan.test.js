// v0.6.2: what loads up front and what streams in later (src/assetPlan.js).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { IMAGE_FILES, AUDIO_FILES } from '../src/assetManifest.js';
import {
  isDeferredImage, isDeferredAudio, coreImages, coreAudio, artGroup, levelArtKey, villageImageKeys, reachableImageKeys,
  artTierOf, ART_LEVELS
} from '../src/assetPlan.js';
import { artTier, LEVELS_PER_ART } from '../src/objects/BuildingView.js';
import { BUILDING_TYPES, maxLevel } from '../src/logic/buildings.js';
import { PATCH_RELEASES } from '../src/patchNotes.js';

const keys = new Set(IMAGE_FILES.map((f) => f.key));

describe('asset plan', () => {
  it('every manifest file exists, and the game ships WebP pictures (no PNGs left)', () => {
    for (const f of [...IMAGE_FILES, ...AUDIO_FILES]) expect(fs.existsSync(path.join('public', f.path))).toBe(true);
    expect(IMAGE_FILES.every((f) => f.path.endsWith('.webp'))).toBe(true);
  });

  it('only building pictures past Level 1 wait (not walls or the Village Hall); every Level 1 picture is core', () => {
    expect(isDeferredImage('bld_cannon_lv2')).toBe(true);
    expect(isDeferredImage('bld_cannon_lv2_dl')).toBe(true);
    expect(isDeferredImage('bld_storage_lv3_fill2')).toBe(true);
    for (const k of ['bld_cannon_lv1', 'bld_cannon_lv1_dl', 'bld_wall_lv5', 'bld_townHall_lv4', 'bld_cannon_destroyed', 'enemy_tank', 'ui_coin', 'game_map_grid_night']) {
      expect(isDeferredImage(k)).toBe(false);
    }
    const core = new Set(coreImages().map((f) => f.key));
    for (const t of BUILDING_TYPES) if (keys.has(`bld_${t}_lv1`)) expect(core.has(`bld_${t}_lv1`)).toBe(true);
    // The title backdrop's art and the patch notes' building icons never wait.
    for (const k of keys) if (/^(title|enemy|hero|ui|proj|villager|game_map)_/.test(k)) expect(core.has(k)).toBe(true);
    for (const e of PATCH_RELEASES.flatMap((r) => r.entries)) if (e.icon.building) expect(isDeferredImage(levelArtKey(e.icon.building, e.icon.level || 1))).toBe(false);
  });

  it('music and ambience load when they play (not the title music); sound effects are core', () => {
    expect(isDeferredAudio('music_attack')).toBe(true);
    expect(isDeferredAudio('ambient_day')).toBe(true);
    expect(isDeferredAudio('music_title')).toBe(false);
    expect(isDeferredAudio('sfx_cannon_fire')).toBe(false);
    expect(coreAudio().some((f) => f.key === 'music_village')).toBe(false);
  });

  it('art tiers match BuildingView (the same picture is asked for as is drawn)', () => {
    expect(ART_LEVELS.default).toBe(LEVELS_PER_ART);
    for (const t of BUILDING_TYPES) for (let l = 1; l <= maxLevel(t); l++) expect(artTierOf(l, t)).toBe(artTier(l, t));
  });

  it('a level picture comes with its variants (facings, fills)', () => {
    expect(artGroup('bld_cannon_lv2').sort()).toEqual(['bld_cannon_lv2', 'bld_cannon_lv2_dl', 'bld_cannon_lv2_dr', 'bld_cannon_lv2_ul', 'bld_cannon_lv2_ur']);
    expect(artGroup('bld_storage_lv2')).toHaveLength(4);
    expect(artGroup('bld_nope_lv2')).toEqual([]);
  });

  it("a village asks for exactly its buildings' current pictures; Level 1 ones and walls are already in", () => {
    const v = villageImageKeys([{ type: 'cannon', level: 5 }, { type: 'mine', level: 1 }, { type: 'wall', level: 8 }, { type: 'townHall', level: 6 }]);
    expect(v.sort()).toEqual(artGroup(levelArtKey('cannon', 5)).sort());
    expect(villageImageKeys([])).toEqual([]);
  });

  it('the background set is what the Village Hall can build (one level past it), growing with the hall', () => {
    const vh3 = reachableImageKeys(3), vh10 = reachableImageKeys(10);
    expect(vh3.length).toBeLessThan(vh10.length);
    expect(vh3).toContain('bld_cannon_lv2');           // levels 3-4
    expect(vh3).not.toContain(levelArtKey('cannon', 9)); // not yet
    expect(vh3.every(isDeferredImage)).toBe(true);
    // At the top hall it's every deferred picture.
    expect(new Set(reachableImageKeys(11))).toEqual(new Set(IMAGE_FILES.map((f) => f.key).filter(isDeferredImage)));
  });
});
