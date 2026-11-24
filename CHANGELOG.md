# Changelog

The version shows in the bottom-left corner of every screen (`package.json` `version` plus the commit). Details for everything below are in [README.md](README.md).

## 0.12.2

The Locklair Mage has one range for everything, marked by his white ring. No database or save changes.

### Changes
- **His white ring marks his range** (MageFx): it runs at his range (`mageStats(...).auraRadius`) instead of 1.35 tiles around his tile, faint and pulsing as before; the gold aura outline shown when he's selected is removed (the buildings in range are still tinted gold), and the raid-time violet outline gives way to the white ring (the violet fill and ripple stay).
- **His labels without the plate** (`BuildingView.drawHeroBar` replaces v0.12.1's `drawHeroPlate`, `PLATE` removed): the crown health bar where any building's bar goes (no dark box, not lifted), and while he's hovered or selected the normal perk bar (the dark pill with 5 pips, `drawChip`) centered right under it.

### Balance
- **One range for zap, Sanctuary Aura and Arcane Aegis** (`mageStats`; `hero.auraRadius` 4.5 removed from `CONFIG.mageAltar`): both reach `attackRange` 6 plus Long Staff (`mageRangeAdd` 1.5) and Wider Sanctuary (`auraRadiusAdd` 1), whichever path he's on; both perks' texts say so.

## 0.12.1

The Locklair Mage tidied up (hero plate, white ring, gold Arcane Aegis highlight, staff-tip fix, the user's ability icon) and a hero profile window in the shop for every hero. No database or save changes.

### Changes
- **Hero profile window** (new `src/objects/HeroWindow.js`, `openHeroWindow`): the shop info card of every hero (`HERO_TYPES`) has a "<hero>: stats & ability" button that opens it, built or not; it replaces "Open <hero>" (which closed the shop and selected the altar). Picture, role, stats at a level picked with ◀ ▶ (starts at your hero's level, else 1; includes your researched perks: `picksFor(research)`), that level's price and Village Hall, the ability card, the three perk paths.
- **Locklair Mage hero plate** (`BuildingView.drawHeroPlate`, `PLATE`): one dark violet-rimmed plate with his crown health bar and, while hovered / selected, his 5 perk pips under the bar, lifted 18 px clear of his staff's gem (before: the bar on the left and a separate pip chip on the right, off-center).
- **White ring** around his tile, always (MageFx, `HOME_RING` 1.35 tiles, pulsing), and with him selected his aura's outline in gold plus every building inside it (walls and himself too: what Arcane Aegis covers) tinted gold with a gold ground diamond (`GameScene.updateDjHighlight` now also does the Mage; `scene.affectedTint`).
- **Arcane Aegis icon**: the user's picture (`art-source/ui/ui_aegis_ready.png`) replaces the drawn stand-in.

### Bug Fixes
- **The Mage's zap and staff glow sat left of his staff's gem** (`MERGED_MUZZLE.bld_mageAltar_lv1`-`lv5`): v0.12's points were the middle of all magenta pixels, pulled left by the purple smoke; now the middle of the gem's bright facets (x 0.713-0.724, y 0.913-0.918).

## 0.12.0

The Locklair Mage (third hero, Village Hall 10), the F.L.O.C.K Mothership's new lightning, and DJ Babyface's hype meter emptying after each wave. No database changes; no save version change (`mageAltar` is a new building type; older saves load unchanged, a saved DJ charge is dropped).

### New Features
- **The Locklair Mage** (`CONFIG.mageAltar`, new `src/logic/mage.js`, `src/objects/MageFx.js`, `src/objects/AegisIcon.js`; `mageAltar` in `BUILDING_TYPES` / `HERO_TYPES`, `limits.mageAltar` 1 from VH10): a stationary hero whose building is his body and health (crown health bar, `badgeStyle: 'crown'`, always shown). 20 levels (`townHall` 10 for Levels 1-10, then N; Level 1 120,000 gold, Levels 2-20 2,000-10,000 Burgers; hp x1.08, heroDamage x1.06, heal x1.07 per level). Staff zap every 1.6 s, 6 tiles, ground and air, one target (purple `ZapFx` from `MERGED_MUZZLE.bld_mageAltar_lv*`, `sfx_mage_attack`). Sanctuary Aura: buildings (not his own) and the other heroes within 4.5 tiles heal `heal` HP/s in raids. Arcane Aegis (`useAegis`, hotbar slot `aegis`, key H, once per wave): buildings in his aura take no damage for 4 s (`b._mageAegis` in `damageBuilding`). Naps after every raid (`max(minSleepSeconds 20, lowest health share lost x 120)`, KO = 120 s); destroyed = knocked out, the statue stays (`STANDS_WHEN_DESTROYED`, grey tint, stars, normal depth). Perk tree `mageAltar` (Archmage / Sanctuary / Eternity; `mageWard` reduces damage in `damageBuilding`). Hero tab (`drawMageInfo`, `drawAegisCard`), shop / How to Play / visit badges (`HERO_FACES.mage`, his face on `bld_mageAltar_lv1`), range circle = zap range. Art `bld_mageAltar_lv1`-`lv5` (prepare-art `trim: 'group'`, a picture per 4 levels in `LEVELS_PER_ART_BY_TYPE` / `ART_LEVELS`; `SPRITE_SCALE` 0.78, `GROUND_SHARE` 0.21). Ability icon: a drawn stand-in (`ui_aegis_ready`; prepare-art rule added for the real picture). New tests: `tests/mage.test.js`.

### Changes
- **F.L.O.C.K Mothership's Triple Zap is a lightning bolt** (`ZapFx.js`, the user's reference picture): a zigzag (kinks every 16 px, up to 9 px off the line, re-struck every 70 ms) with a blue-violet haze, cyan glow, pale body and white core, plus 3 short forks; low graphics keeps glow + core. Colors are now an option (`ZAP_COLORS`, `MAGE_ZAP_COLORS`) and the bolt leaves a picture's `muzzlePoint()` when it has one. Its sound is unchanged: the user's "Merged FLOCK tower attack sound.mp3" is byte-for-byte `sfx_spell_lightning`, which it already plays.
- **DJ Babyface's hype meter empties when a wave is beaten** (`checkWaveCleared` sets `b.hype = 0`; it's no longer saved, and a saved charge loads as 0). Before, the charge carried over and showed half full between waves.

## 0.11.0

Village Halls 16-20 with the user's five new hall pictures, walls to 10 levels (one every 2 halls), both heroes to Level 20, and two new achievements. **Database:** run `supabase/migration-2026-11-23-village-halls-20.sql` (raises the server's Village Hall cap from 15 to 20; without it a Hall 16-20 village shows as 15 on the leaderboard and in player search). **Save version 8:** walls at Level 6+ move up one level (same picture and HP).

### New Features
- **Village Halls 16-20** (`rules.maxTownHallLevel` 15 -> 20; `townHall.levels` 16-20: upgrade 450,000 / 480,000 / 520,000 / 550,000 / 600,000 gold, HP x1.25 per level to 83,299, capacity +500 to 9,500; each upgrade fits the gold the hall before can hold). Every per-hall table now has 20 entries (`limits.*`, `fuelStation.spellSlots` stays 5). Each hall adds +1 Cannon and +1 Locklair Tower plus 2-3 others in turn (VH16 Mortar, Rah; VH17 KSI, Spear, Diddypult, Mine, Storage; VH18 F.L.O.C.K, Mortar, House; VH19 Rah, KSI, Mousetrap, Storage; VH20 Spear, F.L.O.C.K, Diddypult, Mine, House) and +12 walls (252 at VH20). Defense totals VH16-20: 77, 82, 86, 91, 96; every mergeable defense except Cannon / Locklair is even at VH20. A full VH20 village fits the map with a tile between buildings (new test).
- **Village Hall pictures** `bld_townHall_lv6`-`lv10` (the user's "Village Hall 11"-"15" drops): one per 2 levels, Halls 11-12 ... 19-20 (they reused the Level 10 picture before). Village Hall sizes now grow over 20 levels (`LEVEL_SIZE`), so Halls 1-10 draw up to 3% smaller.
- **Walls: 10 levels** (`walls.levels`): a new Level 6 (the user's dark stone tower, 1,900 HP, 220 gold) and Level 10 (red skull fortress, 4,800 HP, 1,200 gold); the skull fortress / lava block / lava tower moved from 6-8 to 7-9 with their HP and price. Art: `art-source/buildings/bld_wall_lv7`-`lv9.png` are the old `lv6`-`lv8` (git mv); the two new pictures were scaled onto the shared 1024 canvas at the old pillars' width and baseline so the group crop and every old wall's size stay the same. `WALL_RUBBLE`: stone to Level 6, skull 7, lava 8-10. Pillar widths per level (`PILLAR_WIDTHS` in WallView.js): the moved pictures keep their old widths, Level 6 0.48, Level 10 0.62 (`PILLAR_WIDTH.maxLevel` 8 used to clamp anything higher). Wall Breakers one-shot Levels 1-7, Levels 8-10 take two.
- **Both heroes to Level 20** (`altar.levels`, `queenAltar.levels` 16-20; 10,000 Burgers each, the top Burger cap; the King x1.15 altar HP / x1.12 health / x1.1 damage per level to 27,130 / 17,628 / 921, the Queen x1.15 / x1.075 / x1.067 to 34,155 / 9,487 / 550). Altar pictures every 4 levels (`LEVELS_PER_ART_BY_TYPE` / `ART_LEVELS` `altar: 4, queenAltar: 4`).
- **Achievements** `hall15` "Brainrot Empire" (60,000 gold) and `hall20` "Eternal Brainrot" (150,000), in the Builder tab (a tab holds 10 cards; Village is full).

### Changes
- **Walls upgrade every 2 Village Halls** (`walls.levels[].townHall` 1, 3, 5 ... 19; was 1, 2, 3, 5, 7, 8, 9, 10). `migrateV7` (save version 7 -> 8) adds one to `wallLevel` and each wall's level when it's 6 or more, so a wall keeps its picture and HP; that stays within the save's Village Hall level, so old saves stay valid. Walls above the new rule are kept and upgrade again once the hall catches up.
- **The Hatsune Queen's levels follow the hall like the Brisket King's** (`queenAltar.levels[].townHall`: 8 for Levels 1-8, then N for Level N; was two levels per hall from VH8): both heroes have the same top level at every hall from 8. Her stats per level are unchanged, so she's stronger than before at Halls 8-13 (at VH8 her Level 8 has 1.24x the King's dps and about his health) and the same from VH14.
- Tests: wave stages are their own 15 (no longer tied to the hall count); the full-village map test packs buildings with a one-tile margin.

## 0.10.3

The Great Pyramid of Rah stands centered on its tile, and every Tower of Rah is drawn smaller to keep it above a Level 8 one. No save or database changes.

### Changes
- **Tower of Rah sizes** (`SPRITE_SCALE.ra` 0.48 -> 0.40 in `BuildingView.js`; `TIER_GROWTH.ra` 0.03 kept, so each level still stands 3-4% taller than the last): visible size at zoom 1 Level 1 44 x 87 px (0.10.2: 58 x 105), Level 8 55 x 111 (0.10.2: 66 x 133). Every Tower of Rah is about 17% smaller than in 0.10.2.

### Bug Fixes
- **The Great Pyramid of Rah stood off its tile** (`CONFIG.merges.ra.art`): at `scale` 1.7 on Level 8's spot, its round base's ground ring (97% of the picture's width, its middle 17.5% of the way up) had its middle 11 px behind the tile's center, and the stones at its back sides hung over the tile's back edges (0.10.2's fit check only tested the front half of the base). Now `ground` 0.175 puts the ring's middle on the tile's center and `scale` 1.52 keeps the whole ring about 10% inside the plot rim (inset 0.08): 77 x 117 px at zoom 1, 1.39x wider and 1.06x taller than Level 8.

## 0.10.2

Towers of Rah merge into the Great Pyramid of Rah (Solar Lance), and every Tower of Rah level now draws bigger than the one before. No save or database changes (`merged` and `mastery.ra` use the existing save fields; older saves load as before).

### New Features
- **Great Pyramid of Rah** (`CONFIG.merges.ra`): two Level 8 Towers of Rah merge for 50,000 gold (Rah's own Level 8 upgrade, like every merge) + 3,000 Burgers; `hpMult` 2, `damageMult` 2 (the beam's dps, via `mergeDpsMult` in `towerDamageMult`; Sun Ring burns scale with it too), `fireIntervalMult` 1, `rangeAdd` 0.5 (6.5 tiles).
  - **Solar Lance** (new `src/logic/solarLance.js`, called from `beams.js` `stepBeams`, so the game and `simulate.js` share it): a beam at heat stage `lance.stage` (2 = x8) or hotter becomes a lance from the tower's center through its target to its range (`beam.lance` = the line in tiles, read by the view). Every other enemy, ground and air, within `lance.halfWidth` (0.5) tiles of the line takes `lance.mult` (0.5) x the beam's current tick (heat, Hotter Peak, damage perks; the enemy's own mark via `damageEnemy`), source `'lance'`. At most one lance hit per enemy per beam tick per tower, even where Prism lances cross (`b._lanceHits` / `b._lanceClock`, not saved). Prism: each beam lances on its own; chained beams never lance; Afterburn, Cauterize and Supernova come only from the beam's own target.
  - **Mastery** (1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5): Early Lance (`lanceStage` 1: from x3), Wide Lance (`lanceHalfWidth` 1, `lanceMult` 0.75), Blinding Light (`lanceSlow` 0.3 on everything a lance touches, its target too, renewed each step for `slowLinger` 0.25 s; bosses take `bossShare` 0.5, so 15%).
  - The user's picture (`art-source/buildings/bld_ra_merged.png`, `art.scale` 1.7) and ability icon (`ui_ability_solar_lance`); a drawn stand-in icon in `MergeIcons.js`. The beam leaves from its third eye (`MERGED_MUZZLE.bld_ra_merged` 0.5, 0.845; `GameScene.drawBeams` now uses `BuildingView.muzzlePoint` when a picture has one).
  - The lance view (`GameScene.drawBeams`, `LANCE`): one shared normal-blend graphics object for every lance, white core / red body / crimson edge from the muzzle through the target to the end of range (past the target 18 px above the ground), 3 pulses running along it; lance hits show a crimson "/s" number and a small spark per enemy every 450 ms, at most 8 sparks per 250 ms.
  - The merge window shows a beam's damage per second ("70/s -> 140/s": `fightStats` returns `perSecond` for beam types; it showed "-"). How to Play's merge line says "Towers of Rah Level 8" (its `plural` handles "X of Y" names).

### Changes
- **Tower of Rah sizes** (`BuildingView.js`): `SPRITE_SCALE.ra` 0.54 -> 0.48 and `TIER_GROWTH.ra` 0.03, so every level stands 3-4% taller than the one before (the Level 5-6 picture is squatter and drew 1.4% shorter than Level 4; Levels 3 and 7 were under 1% taller). Visible size at zoom 1: Level 1 58 x 105 px (was 59 x 118), Level 8 66 x 133 (was 68 x 136): low levels are drawn about 11% smaller, Level 8 about 2%. The Great Pyramid at `art.scale` 1.7 is 103 x 158 (1.55x wider, 1.19x taller than Level 8) with its base inside the plot rim (inset 0.08), 13 px clear of each side corner.

## 0.10.1

Both heroes to Level 15, more Cannons and Locklair Towers past Village Hall 10, and the UI caught up with wave-based difficulty. No save or database changes (heroes keep their level).

### Changes
- **Heroes have 15 levels** (config `altar.levels`, `queenAltar.levels`): Brisket King Levels 11-15 cost 7,000 / 7,500 / 8,500 / 9,000 / 10,000 Burgers (Level N needs VH N), x1.15 altar HP, x1.12 his health (to 10,003), x1.1 damage (to 572); Hatsune Queen Levels 2-15 re-priced 1,500 ... 10,000 Burgers and re-gated two per hall (`townHall` 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15), Levels 1-10 keep their stats, 11-15 x1.15 altar HP, x1.075 health (to 6,607), x1.067 damage (to 398). Every price fits the top Burger cap (10,000).
- **Altar pictures every 3 levels** (`LEVELS_PER_ART_BY_TYPE` / `ART_LEVELS` `altar: 3, queenAltar: 3`): the same 5 pictures over 15 levels (Levels 1-3, 4-6, 7-9, 10-12, 13-15).
- **UI for wave-based difficulty**: the Village Hall's upgrade button no longer says "tougher waves" (UIScene: "To level N" like every building); How to Play's Waves and Upgrades text, the post-tutorial message and GameState's comment say the waves follow the wave number and the Village Hall only unlocks buildings (How to Play also drops the old "every 3rd wave is special": every 10th is a Boss Wave).
- **Bought buildings land with the upgrade sound again** (GameScene.confirmPlacement, the user's call); moves and edit-mode placements keep the building placed sound.

### Balance
- **Defenses at Village Halls 11-15** (`limits`): one more Cannon and Locklair Tower per hall after 10 (Cannons 6, 7, 8, 9, 10, 11; Locklair Towers 5, 6, 7, 8, 9, 10 at VH10-15), plus one more of about two other defenses per hall, taking turns, every other mergeable one ending even at VH15: Mortar 5, 5, 6, 6, 7, 8; Gandolf 4, 5, 6, 6, 6, 6; Firework 3, 3, 4, 4, 4, 4; Spear 3, 4, 4, 4, 5, 6; KSI 3, 4, 4, 5, 5, 6; F.L.O.C.K 3, 3, 4, 4, 5, 6; Tower of Rah 2, 3, 4, 4, 5, 6; Diddypult 1, 2, 2, 3, 3, 4; Mousetrap 5, 5, 5, 6, 6, 6. Defense totals VH10-15: 40, 47, 54, 59, 65, 73 (were 40, 45, 47, 50, 54, 56).

## 0.10.0

Wave difficulty by wave number instead of Village Hall, enemies joining at set waves, and the Hatsune Queen's new poses. No database changes; older saves keep their waves cleared (a high-hall village at a low wave now gets easier waves, a low-hall village at a high wave harder ones).

### Changes
- **Wave stages** (waves.js, enemies.js `waveStage`, config `rules.waveStages`): the wave number now picks the base wave, not the Village Hall. `rules.waveStages` [1, 4, 7, 10, 14, 18, 23, 28, 34, 40, 48, 56, 65, 75, 85] is the wave where each of the 15 stages starts; stage s fights the old Village Hall s base wave (`CONFIG.waves`, then the endless formula), its rotating themes and its most entrances (`rules.entrancesByHall` -> `entrancesByStage`, same numbers: all 8 from stage 13 = wave 65). `rules.waveRamp` still adds +8% enemies / +5% HP per wave. `scaledWaveComposition(stage, n)`, `themesAt(stage, n)`, `waveThemeKey(stage, n, debut)`; `nextWaveInfo` returns `stage` (no `th`). Da Baby Car's burst picks troops from the running wave's stage. The Village Hall level no longer touches any of it.
- **Enemies join at set waves** (config enemies `fromTownHall` -> `fromWave`, `rules.babyCar` `fromWave` 18 / `lateWave` 34): John Pork 10, Skibidi Toilet and Bri Bri Bicus Dicus 14, Rahhh Skeleton and Frigo Camillo 18, La Vaca Saturno and Quandale Dingle 23, Big Yahu and Bombombini Gusini 28, Lirili Larila 34, Brr Brr Patapim 40, Grimace Golem 48 (each the first wave of its old hall's stage). A kind is absent before its fromWave and has `baseCount` from its stage, growing per stage after it. Debut waves follow the wave (`debutKindsAt(n)`, `nextDebut`); an old save without a `debuted` list counts the kinds due by its next wave as met (`legacyDebuted(n)`). How to Play says "From wave N"; the loading tip says waves grow with every wave survived.
- **Hatsune Queen poses** (HeroView `QUEEN_VIEW`, art-source/heroes/hero_queen_defeated / _wake / _select, the user's pictures): knocked out (`defeated`, height 46), waking (`wake`, 58) and clicked (`select`, a wave, 74) instead of reusing her sleep / standing pictures; her Hero tab picture follows too (UIScene).

## 0.9.4

A sound for brewing spells. No save or database changes.

### Changes
- **Spell brewed sound** (`SFX.spellBrewed`, art-source/audio/sfx_spell_brewed.mp3, the user's new sound): GameScene plays it on `spellBrewed` (spells.js `brewSpell`), so every brew at the Fuel Station has it, the free guided first brew included.

## 0.9.3

Sharp rendering (the canvas at the screen's real resolution, full-detail map pieces when zoomed in on a desktop), tiles that blend into the grass, and every Mastery path shown in the RV Lab. No save or database changes.

### Changes
- **Mastery column for every mergeable type** (AbilityWindow.js, merge.js): the RV Lab shows the ★ Mastery column for every `CONFIG.merges` type; until the village has a merged one it's grey with no glow ("Merge to unlock"), and its tiers' details say `needsMergeReason` ("Needs a Mega Cannon: merge two at Level 10"). `checkMastery` now also requires a merged building of the type (it used to allow researching ahead); a Mastery already researched is kept.
- **Building placed sound** (`SFX.buildingPlaced`, art-source/audio/sfx_building_placed.mp3, the user's new sound): GameScene.confirmPlacement plays it for a bought building (was the upgrade sound), a move, and a placement in edit mode (`placeSound`); walls keep theirs (upgrade when bought, `sfx_place` otherwise, which has no file).
- **Credits** (credits.js): the Audio section adds "Menu Music: 'Bomboclat Wallahi' by TR3N TEN (Produced by Tren Tenovic)."
- **Tiles blend into the grass** (scripts/draw-map-tiles.mjs): the playable tiles stay solid, and the checker now fades out over `BLEND` 1.1 tiles beyond them (distance to the nearest playable square, so the stepped edge rounds off, with a small noise wobble), only where the painting is grass (`grassScore`, smoothed at 1/4 size). All four maps redrawn; prepare-art rebuilt the game copies and detail pieces.
- **Real-resolution canvas** (new src/renderScale.js, main.js): the canvas is the 1280 x 720 view x `renderScale()` (the canvas's displayed size x `devicePixelRatio` / 1280, in 0.25 steps, 1 to `RENDER_SCALE_CAP` 2 on desktop / 1.5 on touch; always 1 on Low graphics). Every screen scene's camera zooms by it and centers on the view (`installViewCameras` patches `CameraManager.start`), so layouts keep their 1280 x 720 coordinates; `this.scale.width / height` reads in the screens became `VIEW` (AuthScene, BootScene, GameOverScene, HowToPlayScene, PauseScene, TitleScene, VersionScene, VisitHudScene, Modal, SettingsWindow). The map scenes work in canvas pixels, so only `camera.startZoom / minZoom / maxZoom` and `dragThresholdPx` are scaled (`zoomLimit`, `dragThreshold`), and what they hand the HUD is in view pixels (`buildingScreenAnchor`, `spawnMarkerScreen`, WaveMarkers' size and HUD test, GridOverlay's line width). `add.text` renders at the scale (`installSharpText`). A window resize or graphics change re-picks the scale live (`applyRenderScale`: map scenes keep their zoom per view pixel and their middle); text made at a lower scale stays as it is until its screen is rebuilt.
- **Full-detail map** (new src/mapDetail.js, src/objects/MapDetail.js, prepare-art): prepare-art also cuts each full-size map (6680 x 3768) into 4 x 2 pieces with a 2 px overlap, `public/assets/map-detail/<key>_<col>_<row>.webp` (10 MB for all four, not in the asset manifest). On desktop at High graphics, when a map pixel of the 2672 px picture would cover more than 1.15 canvas pixels, GameScene and VisitScene load the pieces in view of each time of day showing (none for a map hidden under an opaque one), draw them just above their picture and hide the soft picture once a full set is in. Unused pieces go after 15 s (at most 20 kept; ~12 MB of GPU memory each). Phones never load them.

## 0.9.2

The user's new map (forest and mountains, four times of day) on a 52 x 52 grid with its playable grass tiles drawn on, 8 new entrances, and a title-screen fix. Older saves move onto the new grid automatically (see below); a wave planned from an entrance the map no longer has is planned again.

### Changes
- **New map** (gridConfig.js): the user's paintings (upscaled_1795465442.zip: day / Dawn / Dusk / night, 6680 x 3768; the zip is kept in unused-assets/root/). Their grass is a rounded oval with a wooden bridge at each point. A 40 x 40 diamond's corners meet the four bridges (`BRIDGE_CORNERS` top 3327,585 / right 5615,1837 / bottom 3327,3090 / left 1065,1837: 4550 x 2505 px, 1.82 : 1, symmetric, so an even isometric grid) and `WORLD_SCALE` = 64 / 113.75 keeps tiles 64 px wide (64 x 35.2; the map is 3758 x 2120 world px). The grid carries on `GRID_EXTEND` 6 tiles past it on every side: `GRID_SIZE` 52, `GRID_CORNERS` extrapolated along the same bilinear fit, `TOWN_HALL_ANCHOR` (19, 19) -> (25, 25). `camera.minZoom` 0.35 -> 0.33 (fill: 0.34). `GRID_TINTS` re-sampled from the new tiled maps (they colour the solid ground under buildings and the dev grid).
- **Playable grass** (new src/mapGrass.js, `MAP.tiles`): only the grid tiles lying wholly on the painted grass are playable, measured on the day painting (at least 97% of 49 sample points on grass; the largest patch, holes filled, spurs removed): 1,943 tiles (was 1,600), out to the oval's rounded sides, while the grid's corners (over the bridges and scenery) aren't. Placement, decor (`DECOR.tufts` 80 -> 100, the same density) and the dev grid (GridOverlay draws only playable tiles) follow it; pathfinding ignores it, so enemies still walk in off the grass. Tests: the mechanics tests' hall is pinned at (19, 19) (`TEST_TOWN_HALL` in tests/helpers.js).
- **Tiles drawn on** (scripts/draw-map-tiles.mjs): the paintings' grass is plain, so the tiles are its own colour 10% lighter / darker (`TILE_CONTRAST`, the same on all four maps; measuring the paintings' texture gave 0.06-0.29). The user asked for whole, equal tiles and nothing over the scenery: tiles are drawn on exactly the playable tiles (src/mapGrass.js; each tile's coverage from 2 x 2 subsamples, so the stepped edge is crisp), with no fades, rounding or blends; everywhere else the painting is untouched. The script's `[DAY]` argument is gone. The full-size tiled maps (6680 x 3768) are now the map sources, `art-source/map/game_map_grid*.webp` (prepare-art reads WebP for art-source/map, decoded with sharp); the half-size PNGs and art-source/map/full-size/ are gone. The game still ships them 2672 wide.
- **8 entrances** (gridConfig.js `PATHS`, waves.js `PATHS`): `top`, `right`, `bottom`, `left` over the wooden bridges, `cave` out of the cave (top right), `stairsRight` up the mountain stairs, `stoneBridge` over the stone arch bridge, `stairsLeft` down the forest stairs; enemies appear 12-16 tiles of walking back (behind the bridges, at the cave's mouth, past the stone bridge, on the stairs) and walk the paths' bends; the cave, stairs and stone bridge reach the oval's rounded sides first, so their routes cross that plain grass to the grid. `rules.entrancesByHall` 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, then 8 from VH13. `PER_ROW` per entrance.

- **Older saves** (save.js `migrateGrid`; saves now store `grid: 52`): a `grid: 40` save (v0.9.0-0.9.1) moves every building +6, +6 (`GRID_40`); a save with no `grid` (32 x 31, before v0.9.0) moves by the hall's shift (+8, +10). Then any building or wall that isn't on the playable grass (the old grids' corners lie over today's scenery) moves to the nearest free grass spot (`onGrass`, a ring search). Own saves, cloud saves and visited villages all load through it.

### Bug Fixes
- **A player's card kept reopening** (TitleScene `init`): Phaser keeps a scene's last start data when it's started again without any, so after a visit (`reopenPlayer` / `reopenFrom` / `reopenBase`) every later Quit to Title, How to Play Back or Game Over reopened that player's card. The one-time fields (`justLoggedIn`, `reopen*`, `notice`) are now cleared once read; `offline` stays.

## 0.9.1

Diddypults merge into the Diddy Trebuchet (Barrel Burst), and the F.L.O.C.K Mothership stands centered on its tile. Saves load as they are.

### New Features
- **Diddy Trebuchet** (`CONFIG.merges.catapult`, new src/logic/barrelBurst.js): two Level 5 Diddypults merge (170,000 gold: the Diddypult's own last upgrade, like every merge; the brief asked 200,000 + 3,500 Burgers; x2 health and damage, impact **and** pool (`catapultPool` now multiplies its dps by the merge's `damageMult`), `fireIntervalMult` 1, +0.5 range; art `bld_catapult_merged`, the user's "Merged Diddypult building image v2", `art.scale` 1.3, `art.ground` 0.25: 94 x 88 px against a Level 5's 72 x 72 at zoom 1.3, inside its 2 x 2 tile's outline; muzzle `MERGED_MUZZLE.bld_catapult_merged` 0.31 / 0.8, the barrel in its arm; ability icon `ui_ability_barrel_burst`, the user's picture, with a drawn stand-in in MergeIcons.js). **Barrel Burst** (`barrelBurst: { jugs: 4, distance: 2, delay: 0.4, mult: 0.5, poolRadius: 1 }`): every shot is a giant barrel (`p.barrel`, `barrelFor`; ProjectileView draws a wooden barrel made in code, `proj_barrel`, 34 px, spinning 0.07 rad per frame). Where it lands, its pool appears with `group` = the barrel's id, then `burstBarrel` throws the jugs to `jugSpots` (on the grid's diagonals, a + on screen; evenly spread for 6; pulled back toward the impact if off the map picture) into `state.jugs`; `stepJugs` (simulate.js, after `stepPools`) lands them `delay` s later: each is an `applySplash` of radius `poolRadius` for `mult` x a normal barrel's hit (not a Big Jug's; Splash Zone's `poolBonus` is its only perk, so Hangover, Concussion and Pressure Cap never come from jugs) and a pool with the barrel's pool numbers (Toxic Fumes included) at `poolRadius`, in the same group, its tick synced to the barrel's pool. **Pools don't stack within a group:** `stepPools` keeps a per-call set of `group|enemy`, so an enemy in several of one barrel's pools takes one pool's damage per tick (other pools still stack as before). Boulder shots return before `fireDefense`, so they never burst. Mastery (1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5): More Jugs (`barrelJugs: 6`), Wide Spray (`jugDistance: 3`, `jugPoolRadius: 1.25`), Tar Pit (`tarSlow: 0.6`, `tarSeconds: 10` on the barrel's own pool: `tarPool`). `state.jugs` isn't saved (GameState `jugs`, cleared at wave end). GameScene: `barrelBurst` breaks the barrel into 10 tumbling wooden planks and lobs a small oil jug to each spot over `delay` (shorter at 2x / 4x); a `splash` of kind `jug` draws an oily ring and a soft thud. Checked in a running game: the greyed "Merge · Needs Level 5" on a Level 3, a merge through `GameState.mergeBuilding`, the barrel's lob, planks, jugs and 5 pools.

### Changes
- **F.L.O.C.K Mothership on its tile, F.L.O.C.K Towers smaller:** the Mothership stands by its base's side corners (`CONFIG.merges.flock.art.ground` 0.16: a diamond whose corners are 16% of the way up the picture and span its full width) on the tile's center, its base 1.02 tiles wide, the corners on the tile's edge (the user's pick of three; fitting inside the outline would have needed it smaller than a Level 10 F.L.O.C.K Tower, which itself covers its one-tile outline). The user then found a Level 10 F.L.O.C.K Tower looked bigger than it, so BuildingView `SPRITE_SCALE.flock` 1.15 -> 0.9 (every level, 22% smaller) and the Mothership's `art.scale` 1.2 -> 1.15 (its size unchanged: 0.9 x 1.15). At zoom 2: Mothership 66 x 95 px, Level 10 F.L.O.C.K Tower 57 x 87.
- **Grass tufts** (new src/logic/decor.js, src/objects/Ground.js `GrassTufts`; the user's "Isometric Grass Tile Image" as `art-source/decor/deco_grass.png`, prepare-art rule `/^deco_/` 128 px, a 6 KB core image): `DECOR.tufts` 80 tufts on random tiles of the field (not its outermost ring), each 0.72-1 x 90% of a tile wide, randomly flipped, standing on the tile's center (origin 0.5 / 0.7), depth -8800 (over the map and plots, under everything else), tinted with the time of day (`scene.ambientTint`). Purely visual: nothing reads them. Where they grow comes from the village's `decorSeed` (`grassSpots`, mulberry32), a new save field (`validDecorSeed`; made at random for a new village, and for an older save on load, then saved), so the owner and visitors see the same tufts. A tuft whose tile a building or wall covers (`coveredTiles`, from GameScene's `layoutList`, so edit-mode drafts count) is hidden, and shows again if the building moves away. VisitScene draws them too.
- **Solid ground under buildings** (Ground.js `drawGroundPlots`, GameScene `drawPlots`, VisitScene): every building's and wall's tiles are filled with solid grass (was a faint dirt tint, not under walls), so the map's checker doesn't show under them; the colour is the map's own grass for the time of day (`groundColor`: the middle of `GRID_TINTS` light / dark, blended like the maps by `overlayColors`), redrawn when it changes. The light rim round each building's plot stays (not walls). Visits get them too (day colour).
- **7 entrances** (the user's call): the left waterfall corner (`left`) is gone from gridConfig.js `PATHS`, waves.js `PATHS` and `PER_ROW`; the pillar path beside it (`upperLeft`) already brings enemies in there. `rules.entrancesByHall` is now 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, then 7 from Village Hall 13 (still every entrance from VH13). A save whose planned wave names an entrance the map no longer has (`left`) loads with `wavePlan: null` and plans it again (save.js `parseSave`; `validateSave` would otherwise refuse the whole save).
- Merge texts drop a leading "The" (`plainName` in merge.js: "Tap another Level 5 Diddypult to merge"); How to Play's merging line names each type's top level when it isn't 10 ("top-level (Level 10; Diddypults Level 5)").

## 0.9.0

The new 40 x 40 map (four times of day) with its tiles drawn on the game's grid, and enemies from 8 entrances. Older saves and online villages are moved onto the new grid when they load.

### New Features
- **The 40 x 40 map** (new src/gridConfig.js; mapTiles.js builds `MAP` from it). The user's paintings (6688 x 3764, day / dawn / dusk / night) are drawn at `WORLD_SCALE` 0.5305 (3548 x 1997 world px), so the nominal tile stays 64 px wide (64 x 31.3). The painted grass diamond is a skewed quadrilateral, so logic/iso.js maps the grid onto its four measured corners (`GRID_CORNERS`) with a bilinear fit (`gridToScreen` / exact inverse `screenToGrid`, `gridJacobian`; range circles are sized to the tiles where they stand, `rangeEllipse(r, gx, gy)`). Every tile of the diamond is grass. The Village Hall anchor moves to (19, 19) and the starter base sits around it (tutorial.js `STARTER_BASE`, relative to the hall).
- **Tiles drawn on the maps** (new scripts/draw-map-tiles.mjs): the painted checker didn't follow any regular grid (its squares were bigger than a tile and drifted), so buildings never lined up with it. The script replaces the grass inside the diamond with a light / dark checker on the exact game grid. Every colour comes from the painting: the grass colour at each spot is the painting's own grass there, smoothed (a normalized blur of its grass pixels, about a tile wide: its light and colour without its checker), and the tiles are that colour lighter / darker by the map's own checker contrast. The field has a soft border: corners rounded (`CORNER_R` 3 tiles), the tiles fading into plain grass over the outer tile along a wavy line (grid-space noise), a rounded fade around every path's mouth (`MOUTH_R`), and at the four paths whose dirt runs onto the grass the grass wears into the painted dirt along a wavy, soft line (`WEAR`; dirt and grass shadow only, never grey stone or the crystals; decided on the day painting for all four maps so they match). The new grass blends into the painting just outside the field, where its grass is smooth, and what's painted over the edge (bushes, stones, pillars, dirt) keeps its exact outline (a per-pixel "not grass" score near solid shapes; stray shadow specks are painted over). The painted dirt is never redrawn. Only the picture changes: every tile can still be built on. The tiles are baked into the map pictures: the game only shows the images (nothing is drawn at run time). Full-size results in art-source/map/full-size/ (webp), the game's sources art-source/map/game_map_grid*.png (3344 wide), shipped by prepare-art at 2672 wide. Checked in game with the dev grid (G): its lines fall on the drawn tile edges everywhere.
- **8 entrances** (gridConfig.js `PATHS`, waves.js `PATHS`): `top`, `topRight` (the gate path), `right` (the right waterfall, no path), `bottom`, `bottomLeft` (the bridge), `left` (the left waterfall), `upperLeft` (the pillar path near the left corner) and `topLeft` (the path halfway along the top-left edge); never the lake on the bottom-right edge. Each has an `entrance` (0.6 tile onto the grass), an `edge` where its enemies appear (in the spawn fog, ~13 tiles of walking back along the dirt, like the old map's 10-14) and `via` bends (`MAP.spawnRoutes`) that ground troops walk in order before they pathfind (enemies.js `spawnEnemy`: `e.entry` then `e.route`), so they follow the gate path's bends and cross the bridge. Spawn fog and wave markers work at all 8 (`PER_ROW` per entrance; no marker touches the grass at any zoom).

### Changes
- **Entrances per Village Hall** (`rules.entrancesByHall`: 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8 from VH13; waves.js `entrancesForHall`, `waveComposition(n).spawnPaths`): each wave picks 1 up to that many at random (`planPaths`; it used to be up to the base wave's count + 1, out of 4). The scripted waves' `spawnPaths` and `ENDLESS_WAVES_PER_EXTRA_PATH` are gone. Wave 1 still comes from the top. A saved wave plan with the old names (`right`, `left`...) is still valid.
- **Old saves** (save.js `migrateGrid`, save field `grid: 40`): a save without `grid` comes from the 32 x 31 map; every building moves by the hall's shift (+2, +4), so the layout keeps its shape and the old map fits well inside the new one. Visited and leaderboard villages go through the same `parseSave`. The server doesn't check positions, so there's no migration to run.
- **Camera:** `camera.minZoom` 0.5 -> 0.35, so the whole map and every entrance fit on screen (GameScene `minZoom` keeps the screen filled: 0.36 at 1280 x 720).
- The debug grid (src/objects/GridOverlay.js, G) only exists in dev builds: in the game G is the Encore hotkey.

### Bug Fixes
- **F.L.O.C.K Mothership tiny:** `CONFIG.merges.flock.art.scale` 0.7 -> 1.2. v0.8.8's 0.7 (to show the tile's outline) drew it smaller than the F.L.O.C.K Towers it's merged from, which are already wider than their one tile, so no size is both bigger and inside the outline. Both pictures are the same shape (cropped to their full width); at 1.2 it's 83 x 120 px at zoom 1.8 against a Level 6 one's 69 x 105 (corrected in 0.9.1: the F.L.O.C.K Tower's top level is 10, not 6).

## 0.8.12

A greyed Merge button shows which buildings can merge, and the KSI Frost Fortress stands centered on its tile. Saves load as they are.

### Changes
- **Greyed Merge preview** (merge.js `checkMerge`, UIScene, Button.js): `checkMerge` returns a new `preview` flag (a type in `CONFIG.merges`, not merged, not destroyed, below `maxLevel`; `show` is unchanged and still means the real Merge at max level). `mergeButtonState` passes it on with `top`. The info panel then shares the Upgrade row with a 118 px `mergePreview` button on its right (Upgrade narrows to fit), and the quick bar adds a compact one (104 px, or wider if its text needs it) right after Upgrade. Both are disabled, labelled "Merge" with "Needs Level N", in a dimmed gold (`MERGE_PREVIEW_DIM` over `MERGE_COLOR`). A tap shows "Upgrade to Level N, then merge two into one stronger building." in the banner (`mergePreviewTip`), through a new Button option `onDisabledClick` (a disabled button used to ignore taps). Not on non-mergeable types, walls, merged or destroyed buildings; at max level Merge still takes the Upgrade button's place. How to Play's merging line mentions it.

### Bug Fixes
- **KSI Frost Fortress sat off its tile:** 0.8.11 put its picture's bottom 40% of the way from the footprint's center to its front corner (12.8 px below the center at zoom 1; a Level 10 KSI's is 24.6), checked only against the front half of the plot rim. Its base is a round ice mound, widest 15-20% of the way up the picture, so that pushed the widest part ~18 px behind the tile's center line and over the tiles behind and beside it. `art.ground` now means what `GROUND_SHARE` does for the altars: the share of the picture's height (from its bottom) where its base's side corners meet the ground, placed on the footprint's center (BuildingView `sync`). The Frost Fortress uses 0.18 at `art.scale` 1.35 (was 1.45): its bottom lands 28 px below the center (Level 10: 25), it's 12% taller and 8% wider than Level 10 (106 x 158 vs 98 x 141 px), and its base's sides stop 6 px inside the outline's side corners. Like the normal KSI Tower's, its round base still covers the outline's front edges (the art's base isn't diamond-shaped).

## 0.8.11

KSI Towers merge into the KSI Frost Fortress (Shatter). Saves load as they are.

### New Features
- **KSI Frost Fortress** (`CONFIG.merges.ksi`, new src/logic/shatter.js): two Level 10 KSI Towers merge (120,000 gold + 3,000 Burgers; x2 health and damage, `fireIntervalMult` 1, +0.5 range; art `bld_ksi_merged`, the user's "Merged KSI Tower Image", `art.scale` 1.45 with `art.ground` 0.4 (see Changes); muzzle `MERGED_MUZZLE.bld_ksi_merged` = the right-hand Prime bottle, 0.68 / 0.84). **Shatter** (`shatter: { radius: 1.5, mult: 1 }`): its bottles carry `p.shatter` (combat.js `fireDefense`, `shatterFor`), and every enemy they chill is marked (`landSplash` -> `markShatter`: `e.shatter`, `e.shatterT` = the chill's seconds; Avalanche bounces carry it too). A marked enemy that dies before the mark runs out, whatever kills it, is queued by `damageEnemy` (`queueShatter` -> `state.shatters`) and bursts on the next `stepShatters` (simulate.js, after `stepEnemyStatus`): every enemy within `radius` (ground and air, not burrowed) takes `mult` x one of its bottles (`areaDamage`, source `shatter`). A shard kill on another marked enemy queues that one (a chain, one step per link). Mastery (1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5): Bigger Burst (`shatterRadiusAdd: 0.5`), Sharp Shards (`shatterMult: 1.5`), Splinter (`shatterChill`: shards chill with the tower's own chill and mark what they hit). No slow, freeze, ice patch, blizzard, splash or bounce added (its perks have those). `state.shatters` and the marks aren't saved (cleared at wave end; GameState `shatters`). GameScene's `enemyShattered`: an icy ring over the burst's reach, nine ice shards flying out, "SHATTER!" (at most every `SHATTER_TAG_MS` 350 ms) and `sfx_spell_freeze` (capped, 40%); shard damage shows as small icy-blue numbers. Ability icon `ui_ability_shatter`: the user's painted shattering-ice icon (`art-source/ui/ui_ability_shatter.png`, prepare-art 191 x 192 webp); MergeIcons.js also has a drawn stand-in (a cracking ice crystal) for when it's missing. Checked in a running game (a pack of grunts: 4 bursts, all 6 down; each shard hit = 382, a merged Level 10 bottle).

### Changes
- **Merged pictures can stand further back on their plot** (`CONFIG.merges[type].art.ground`, BuildingView `sync`): the picture's bottom goes that share of the way from the footprint's center to its front corner instead of at the Level 10 picture's spot (`min(1, k)`). Used by the KSI Frost Fortress (0.4): its wide icy base is drawn at the very bottom of the picture, and at the Level 10 spot (0.61) it covered the tile's outline even when smaller than a Level 10 KSI Tower. Measured on the trimmed picture against the plot rim (GameScene `drawPlots`, inset 0.08 tile, lower half): at `art.scale` 1.45 it uses 95% of the rim and stands 20% taller and 16% wider than Level 10 (114 x 169 vs 98 x 141 px at zoom 1). The normal KSI Tower keeps its size (`SPRITE_SCALE.ksi` 0.62).

## 0.8.10

A smaller Harpoon Ballista. Saves load as they are.

### Changes
- **Harpoon Ballista smaller:** `CONFIG.merges.spear.art.scale` 1.15 -> 1.05, so its base sits inside its 2x2 tile and the plot's rim (GameScene `drawPlots`) shows around it on every side (at 1.15 the front corner and edges were covered).

## 0.8.9

4x wave speed. Saves and settings load as they are.

### Changes
- **4x wave speed** (src/logic/fastForward.js, UIScene `toggleFast` / `styleFast`): the 2x toggle is now a three-step button, `WAVE_SPEEDS` [1, 2, 4]: each press (or T) goes off -> 2x -> 4x -> off (`nextWaveSpeed`). At 4x GameScene runs the same capped step four times a frame during a wave (`stepsPerFrame` returns the speed), so the wave plays out exactly as at 1x (tests/fastForward.test.js: same result in a quarter of the frames); between waves it's still 1x. The button reads "2x" (grey when off, orange with a pulsing ring at 2x) and "4x" (red, faster pulse). New `getWaveSpeed` / `setWaveSpeed` / `toWaveSpeed`; `isFastForward` / `setFastForward` / `FAST_FACTOR` (2) kept. Settings: `fast` in ibtd.settings is `true` for 2x (as before, so a 0.8.8 setting loads as 2x) and `4` for 4x (save.js `loadWaveSpeed`, `saveFastSetting(storage, speed)`; `loadFastSetting` = speed > 1); `saveGraphicsSetting` and `saveSettings` keep it. How to Play explains the three steps.

## 0.8.8

A smaller F.L.O.C.K Mothership. Saves load as they are.

### Changes
- **Presentation** (docs only): `docs/presentation/Italian_Brainrot_TD_v0.8.8.pptx` replaces the v0.8.6 deck. The last slide has all 24 enemies as cut-outs behind its panel (now 80% opaque) and around the app icon; every screenshot and app icon is clipped to rounded corners matching its frame (slide 2's icon now sits inside its ring); the title slide says v0.8.8. POWERPOINT_BRIEF.md matches. (The game's own icons already had smooth rounded corners: favicon-32/192 and icon-512 have anti-aliased transparent corners; apple-touch-icon and icon-maskable stay full-bleed, as iOS and Android round them.)
- **F.L.O.C.K Mothership smaller:** `CONFIG.merges.flock.art.scale` 1.25 -> 0.7, so its base fits inside its 1x1 tile and the plot's rim (GameScene `drawPlots`) shows around it. On a 1x1 tile even the Level 10 F.L.O.C.K Tower (`SPRITE_SCALE.flock` 1.15) covers its rim, so the Mothership is now drawn a little smaller than it. `standInScale` (unused: the picture exists) stays 1.25. ZapFx's emitter follows the picture's top, so the zaps still leave from it.

## 0.8.7

Shots leave merged defenses and the Hatsune Queen's crossbow from the right spot, and a smaller Harpoon Ballista. Saves load as they are.

### Changes
- **Harpoon Ballista smaller:** `CONFIG.merges.spear.art.scale` 1.25 -> 1.15.

### Bug Fixes
- **Merged defenses' shots left from the wrong spot:** ProjectileView placed every tower's shot at its kind's `MUZZLE` share of the picture's height over its center, which didn't fit the merged pictures (the Mega Cannon's barrel mouth is off to one side, the Missile Silo's nose is up front, Gandolf the Grand's staff is on top), and line shots (the Harpoon Ballista's spears) ignored the muzzle and flew 30 px over the footprint's center from the start. New `MERGED_MUZZLE` in BuildingView.js gives the muzzle on each merged picture, per facing (x = share of the width from the left, y = share of the height from the bottom; mirrored if the sprite is flipped), and `BuildingView.muzzlePoint()` turns it into screen px. ProjectileView's `launchOffset` uses it first (`fromMuzzle`); a line shot from a muzzle starts there and settles to its flight height over its first `LINE_BLEND` (1.2) tiles. HarpoonFx's chain and NetFx's Sky Net rocket start from it too. Checked in a running game: the first frame of every merged shot sits on its muzzle (the mortar's 6 px is its arc).
- **Hatsune Queen's bolts left from her waist:** HeroView drew them from her ground spot, `BOLT_LIFT` (34 px) up. New `HeroView.crossbowTip`: from `CROSSBOW_TIP` ({ x: 0.37, y: 0.79 }) of her shooting picture (`hero_queen_attack`, sized by `QUEEN_VIEW.height.attack`), on the side of her target; the side offset blends away as the bolt homes in. Checked in a running game: a bolt's first frame is 21 px to the side and 52 px over her feet, the crossbow's tip, mirrored when she aims left.

## 0.8.6

The Harpoon Ballista's own picture, and an updated presentation. Saves load as they are.

### Changes
- **Harpoon Ballista art:** the user's four facing pictures (`Spear_Thrower_Merged.zip`, now in unused-assets/root/) are `art-source/buildings/bld_spear_merged_dl/_dr/_ul/_ur.png` (new prepare-art rule `bld_spear_merged_(dl|dr|ul|ur)`: one shared 384 px box, 384 x 512 webp). `CONFIG.merges.spear.art` is now `{ key: 'bld_spear_merged_dl', facings: { dl, dr, ul, ur }, scale: 1.25 }`, so BuildingView turns it toward its target and looks around when idle like the Mega Cannon, and the gold-glow stand-in (the Level 10 Spear Thrower drawn 1.25x) is gone. The What's New entry "Spear Throwers can merge" (0.8.3) now shows it (`icon: { texture: 'bld_spear_merged_dl' }`, was the Level 10 picture). Windows (merge window, Info, How to Play) show the down-left picture. The old `bld_spear_merged` key was never drawn (no file), so nothing else changes.
- **Presentation:** `docs/presentation/Italian_Brainrot_TD_v0.8.6.pptx` replaces the v0.8.3 deck: the Harpoon Ballista's new picture and all seven painted ability icons (in gold boxes) on the merging slide, the new gear badge on the Mastery slide, the armor shield on Bri Bri Bicus Dicus's card, and Brady Messick credited as the game's creator (title slide, "Created by Brady Messick." team slide: the game concept, the design and every part of the game; art credit shared with Cole Martin; speaker notes to match). docs/POWERPOINT_BRIEF.md matches.

## 0.8.5

Player cards, the leaderboard and Find Players all show the same, per-village numbers; a tesla-style Triple Zap; painted merged ability icons, a new merge gear and an armor shield. **Database:** run `supabase/migration-2026-11-23-village-ranks.sql` (after the 0.8.4 leaderboard fix). Saves load as they are.

### Changes
- **Painted icons** (the user's art): the 7 merged ability icons `art-source/ui/ui_ability_rolling_thunder / ballista_bolt / triple_strike / sky_net / shall_not_pass / triple_zap / reel_in.png` (new prepare-art rule `ui_ability_*`: 192 px box, trimmed), shown by MergeIcons.js `abilityIcon` inside its gold box instead of the drawn symbols (which stay as the fallback); a new `ui_merge_gear.png` (same key and size, the old one is `unused-assets/root/Gear Icon Image.png`); and the armor shield `ui_armor_shield.png` (`TEX.armorShield`, 64 px), drawn by HealthBar.js `armorShield()` past the right end of an armored enemy's health bar (Bri Bri Bicus Dicus) while its armor holds, at 1.75x the bar's height, instead of the drawn kite (kept as the fallback).
- **Triple Zap look** (new src/objects/ZapFx.js; GameScene's `flockZap` handler): the zaps were drawn once as a jagged, zigzag bolt (13 px jitter per segment) that faded in place. Now each is a tesla-style beam redrawn every frame for `LIFE_MS` (350 ms): a straight glow / beam / white core from the tower's emitter (10 px under the top of its picture) to the target's body, two thin crackle arcs re-randomized every frame (pinned to the beam at both ends), a spark burst on the target and a glowing orb on the emitter; it follows a moving target and fades over the last 45%. Low graphics: the beam only. The zap logic was checked in a running game (every ~1 s, the 3 closest enemies within 5.5 tiles, ground and air, 60 x its own mark = 84 each at Level 10; enemies past 5.5 tiles untouched) and is unchanged.

### Bug Fixes
- **Card rank didn't match the leaderboard** (`get_player_profile`, PlayerCardWindow.js): the card's rank counted players with a higher all-time best wave (`player_stats`), while the leaderboard ranks villages, so clicking a row could open a card with another rank. `rank` is now the board rank of the player's best village (the same `rank() over (order by best_wave desc, best_wave_at asc nulls last)` as `get_village_leaderboard`); "Furthest wave" / "Village Hall" are their villages' best (`max(bases.best_wave)` / `max(bases.town_hall)`; the all-time stats only with no villages left, so a deleted village no longer shows); each village in `bases` carries its own board `rank` and they're listed in board order. The card shows `#rank` on every village row, labels the tile "Best rank", and marks the village it was opened for: `get_village_leaderboard` returns `base_id` (only for villages whose name it shows: public or your own), LeaderboardWindow passes it (`onOpenPlayer(username, baseId)` -> TitleScene `openPlayerCard(username, baseId)` -> `focusBaseId`), and Back from a visit reopens the card on the village visited (`reopenBase`). `search_players` uses the same village numbers (a `lateral` max over the player's villages). LocalBackend matches (`villageOrder`).
- **Village Hall shown as 11:** databases that ran the 0.8 code before the 0.8.4 leaderboard fix stored `bases.town_hall` (and `player_stats.best_town_hall`) capped at 11; a village was only corrected on its next save. The migration reads each village's level from its save once, with the tables' triggers off (`disable trigger user`), so no wave counting runs and no village revision moves (open games keep saving), then raises each player's best to their villages'.
- **SQL files in step:** spam-guard, leaderboard-fix, village-ranks and schema.sql now all define the same, newest `get_village_leaderboard` (dropping both older signatures first), `get_player_profile` and `search_players`, so re-running any of them can't fail on a changed return type or undo another; migration-2026-11-21-player-profiles.sql is marked superseded. Checked in PGlite from the v0.7.1 schema through all three migrations, re-runs in any order, and a fresh project.

## 0.8.4

The leaderboard works again on databases that skipped the v0.8 migration, a "Something went wrong" window instead of a frozen screen, friendly server errors, and a slightly smaller Mega Cannon. **Database:** run `supabase/migration-2026-11-23-leaderboard-fix.sql` (the game falls back to the per-player leaderboard until then). Saves load as they are.

### Changes
- **Crash window** (new src/objects/CrashOverlay.js, installed in main.js): an error inside a frame stops Phaser's loop (RequestAnimationFrame never schedules the next step), which froze the screen. `installCrashGuard` listens for window `error`, waits `CRASH_CHECK_MS` (1.5 s; longer while the tab is hidden) and, if `game.loop.frame` hasn't moved, shows a DOM window in the game's style (slate header, stone body, red message): Keep Playing (`loop.sleep()` + `loop.wake()`: the loop restarts, the broken frame is skipped) and Reload. Errors that don't stop the loop are only logged. `crashMessage` never shows stack traces or code words.
- **Friendly server errors** (supabaseBackend.js `friendlyError`): "column / relation / function ... does not exist" reads "This isn’t available on the server yet. Try again later."; any other database error with a Postgres SQLSTATE or PostgREST code (except P0001, which our functions raise with player-facing text) reads "Something went wrong on the server. Try again in a moment." (details to the console). The Profile window's rank says "Unavailable" when online but the server didn't answer (was "Offline").
- **Mega Cannon smaller:** `CONFIG.merges.cannon.art.scale` (and `standInScale`) 1.15 -> 1.08.

### Bug Fixes
- **Leaderboard: "column b.best_wave_at does not exist"**: the paged `get_village_leaderboard` (0.8.3, migration-2026-11-22-spam-guard.sql) reads `bases.best_wave_at`, added by migration-2026-11-22-v0.8.sql; a database that never ran that one got a leaderboard that failed with the raw SQL error. New `supabase/migration-2026-11-23-leaderboard-fix.sql` has everything the v0.8 migration does (the `best_wave_at` column filled in from `updated_at`, its index, the other check_base columns if missing, check_base / keep_bests with Village Hall caps of 15 and their triggers) plus `rate_limits` / `rate_limit_hit` and the paged leaderboard, so it works whichever ran before; safe to re-run. migration-2026-11-22-v0.8.sql no longer creates the old one-argument `get_village_leaderboard` (it drops it): next to the paged one it made calls ambiguous. In the game, `isServerSetupError` (paging.js: PGRST202, 42703, 42P01, 42883) sends the leaderboard to the per-player `get_leaderboard` instead of failing. Checked in PGlite from the v0.7.1 schema: reproduced, fixed, saves and Village Hall 15 go through, any order of the three migrations, and a fresh project.

## 0.8.3

Spear Throwers mergeable into the Harpoon Ballista (Reel In), the F.L.O.C.K Mothership's own picture, new achievement sounds, a fix for visits getting stuck, no more free path reset after merging, a cleaner edit mode, audio and asset credits, a smaller Gandolf the Grand and smaller F.L.O.C.K Towers, spam guards on log in and player search, and pages on the leaderboard and Find Players. **Database:** run `supabase/migration-2026-11-22-spam-guard.sql` (the game works without it, with only its own guards). Saves load as they are (an unused free reset in an older save is dropped).

### New Features
- **Harpoon Ballista** (`CONFIG.merges.spear`, new src/logic/harpoon.js, chain drawn by new src/objects/HarpoonFx.js): two Level 10 Spear Throwers merge (280,000 gold + 3,000 Burgers; x2 health and damage, `fireIntervalMult` 1, +0.5 range; stand-in art: the Level 10 picture drawn 1.25x with the gold glow until `bld_spear_merged` exists). **Reel In** (`harpoon: { every: 3, pull: 3, pullSeconds: 0.4, bossSlow: 0.5, bossSlowSeconds: 2, dragRadius: 0.6 }`): combat.js `shoot` counts throws (`b.harpoonCount`, `harpoonDue`); every 3rd is thrown by `throwHarpoons` at the toughest valid target (highest current hp, ground or air) as a normal merged spear line carrying `p.harpoon`. When that line hits its target, `hookEnemy` drags it `pull` tiles opposite its heading (`-e.vx/-e.vy`; away from the tower when still): `e.reelT/reelLeft/reelDx/reelDy`, stepped by `stepHarpoons` (after `stepFlockZaps` in simulate.js) with motion.js `knockback` for ground enemies (stops at walls and buildings, which ends the drag) and `moveToward` for flyers. The hooked enemy is held for `pullSeconds` (`applyStun`, so a Quandale dash ends with no impact). Bosses get `applySlow(0.5, 2)` instead. Emits `harpoonHit` { sourceId, targetId, x, y, boss }; GameScene floats "REELED IN!" / "SLOWED" with `sfx_catapult_impact` (capped, 60%), and HarpoonFx draws a chain from the tower's top to the enemy while it's dragged. Mastery (1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5): Longer Chain (`harpoonPullAdd: 2`), Dragnet (`harpoonDrag: 0.25`: enemies within 0.6 tiles of the dragged one take 25% of the harpoon's hit, once per harpoon each), Double Hook (`harpoonHooks: 2`). No pierce, bleed, vulnerability, slow or stun added (the Spear Thrower's perks have those). Nothing is saved (enemies are cleared at wave end; `harpoonCount` isn't serialized). Ability icon `ui_ability_reel_in` (stand-in: a hook on a chain, MergeIcons.js).

### Changes
- **New merged F.L.O.C.K picture:** `art-source/buildings/bld_flock_merged.png` is the user's "F.L.O.C.K Tower Merge Image" (prepare-art: 384 x 558 webp). `art.scale` stays 1.25 (the stand-in's size), so the Mothership no longer uses the gold-glow stand-in. The What's New entry "F.L.O.C.K Towers can merge" (0.8.2) now shows it (`icon: { texture: 'bld_flock_merged' }`, was the Level 10 picture).
- **Achievement sounds:** `sfx_achievement.mp3` is the user's new "Achievement Unlocked Sound" (the unlock toast, UIScene `nextToast`); the old one moved to the new `sfx_achievement_claim.mp3` (`SFX.achievementClaim`), played by the Claim button in AchievementsWindow.js `claim` instead of `sfx_coin_collect` (which stays as the fallback if the file is missing).
- **No free path reset after merging:** merge.js `mergeBuildings` no longer sets `state.freeRespecs`; abilities.js `hasFreeRespec` and the free branch of `checkRespec` are gone (it always returns the normal `respecCost`, no `free` flag); GameState drops `freeRespecs` (constructor, `loadFromSave`, `respecPath`); the RV Lab reset button (AbilityWindow.js) is always the purple "Reset path · <price>" with the normal confirm text (no gold "Free Reset" / "From merging"). save.js no longer writes `freeRespecs` (`serializeFreeRespecs` / `deserializeFreeRespecs` removed from merge.js), but `validFreeRespecs` still checks it in older saves, so a v0.8.0-0.8.2 save that has it stays valid (and one with a bad list stays invalid); it's then ignored, so any unused free reset is dropped. Still save version 7.
- **Edit mode without perk pips:** new `GameScene.showPips()` (false in edit mode); BuildingView's label update leaves out the 5 perk pips and the Mastery stars when it's false (on every building, hovered and selected too), so the chip is sized as the level badge alone (plus the merge gear on merged buildings) and stays centered over the building. Health bars unchanged; nothing changes outside edit mode.
- **Gandolf the Grand smaller:** `CONFIG.merges.wizard.art.scale` 1.3 to 1.2 (other merged types unchanged).
- **Missile Silo bigger:** `CONFIG.merges.firework.art.scale` 1.22 to 1.32 (the stand-in scale is unchanged).
- **F.L.O.C.K Towers 10% smaller:** BuildingView.js `SPRITE_SCALE.flock` 1.28 to 1.15 (every level). The merged Mothership is drawn `CONFIG.merges.flock.art.scale` (1.25, unchanged) times that, so it shrank by the same 10%.
- **Credits sections:** src/credits.js now has `CREDITS_SECTIONS` (Team, with Brady Messick's fuller credit on two lines: a `role` can be a list of lines; Audio: Supercell and Pixabay sound effects; Assets: Supercell inspiration, ChatGPT AI-generated images; Font & Engine: the existing notes) and `CREDITS_DISCLAIMER` (Supercell's Fan Content Policy notice). SettingsWindow.js `buildCredits` draws each section under a small accent heading between faint rules, people in one shared name | role split, and the notice in small print at the bottom; `layoutCredits` shrinks the gaps, then the text, a step at a time if it would run past the window.
- **Paging** (new src/net/paging.js; LeaderboardWindow.js, PlayerSearchWindow.js; supabaseBackend / localBackend; SQL in migration-2026-11-22-spam-guard.sql and schema.sql). The leaderboard pages through every village, `LEADERBOARD_PAGE` (10) a page, with arrows beside the subtitle ("places 11-20"); your best village shows under the page when it isn't on it. Find Players asks the server for each page, `SEARCH_PAGE` (8), instead of 50 rows cut up in the game; Back / Next and "Page n", through the same spam guard as searching (`request()` with `wantPage`; paging uses the filters of the last search). Both ask for a page plus one row to know if there's a next page. Server: `get_village_leaderboard(lim, off)` returns `pos` (place in board order; `rank` stays the shown rank, shared by ties) and the villages at pos off + 1 .. off + lim (lim <= 100, off <= 10,000) plus the caller's best village; it's plpgsql now, 40 calls a minute (`rate_limit_hit('leaderboard')`). `search_players` gains `off` (<= 10,000). The old signatures are dropped (an older game still works: `off` defaults to 0). Game side: `backend.leaderboardPage(offset, limit)` -> `{ rows, mine, hasMore }` (`boardPage`); `searchPlayers({ ..., offset })`; until the migration runs, both fall back to the old calls (`isMissingFunction`: PGRST202) and cut the page in the game (the leaderboard then reaches place 100 at most). `backend.leaderboard(limit)` is unchanged (the Profile window's rank).
- **Spam guards** (new src/net/spamGuard.js, new supabase/migration-2026-11-22-spam-guard.sql, also in schema.sql). Game side: AuthScene waits after repeated failures (`createAuthGuard`: 3 free tries, then 5 / 10 / 20 / 40 / 60 s, cleared by a success; lost connections don't count) and allows one confirmation email per 30 s; PlayerSearchWindow runs one search at a time, `SEARCH_GAP_MS` (1,000) apart, merging presses in between into one search with the newest filters. Server side: `rate_limits` table (RLS on, no policies or grants) and `rate_limit_hit(act, max_calls, per_secs)` (security definer, not callable by players): `search_players` 20 / min, `get_player_profile` 40 / min, `get_player_base` 40 / min per player, then "Too many requests" (friendlyError: "Too many tries. Wait a minute and try again."). Those three are plpgsql and volatile now (they write the counter; supabase-js rpc posts them, so nothing changes in the game). `search_players` cuts `q` to 16 characters; `get_player_profile` returns null for a name over 16; `username_available` returns false for anything outside `^[A-Za-z0-9_]{3,16}$`. Reviewed and unchanged: no SQL is built from text, player text is drawn on the canvas (no HTML), inputs have `maxLength`, usernames are checked by `profiles_username_format`, and the game has no AI model to prompt-inject. Checked in PGlite (schema.sql + the migration, re-run, 20 checks) and in the browser.

### Bug Fixes
- **Find Players sort buttons past the edge** (PlayerSearchWindow.js `drawFilters`): three 128 px toggles from `left + 360` ended 32 px past the window's inner edge, so "Achievements" was cut off. They now share the room left of the row (`sortLeft` = left + 348 to the inner edge, about 121 px each, labels fitted). The 8 result rows are a little tighter (`ROW_H` 40 -> 38, `ROW_GAP` 4 -> 3) so the page arrows (now at H - 32) no longer cover the last row.
- **Fresh database setup failed** (supabase/schema.sql): `get_village_leaderboard` read `profiles.public_bases` before the file added that column, so running schema.sql on a new project stopped with "column p.public_bases does not exist". The column is now added right after the profiles table. Existing databases already have it.
- **Second visit stuck** (src/scenes/VisitScene.js, VisitHudScene.js): the VisitHudScene object lives on between visits, and VisitScene.create launches it and calls `setStatus('Loading village…')` before it has started again, so it set text on the last visit's destroyed `statusText` (`Cannot read properties of null (reading 'drawImage')`). The exception ended VisitScene.create, so the screen stayed stuck on every visit after the first (Visit / Visit Best Village after Back, and the village switcher's restart). VisitHudScene now forgets its texts and card on `shutdown` (and in `init`), and VisitScene only talks to the HUD once it's running (`hudReady()`: setStatus, showVillage, showBuilding, covers); the HUD shows the village's title itself if it arrived first.

## 0.8.2

Gandolf Towers back to 6 and mergeable into Gandolf the Grand (You Shall Not Pass), F.L.O.C.K Towers mergeable into the F.L.O.C.K Mothership (Triple Zap), a new Encore Cloak icon, heroes sleeping at their altars at night, a steadier gold Mastery column, and boxed ability icons. No database change; saves load as they are.

### New Features
- **Gandolf the Grand** (`CONFIG.merges.wizard`, new src/logic/wizardWall.js, drawn by new src/objects/WallFx.js): two Level 10 Gandolf Towers merge (307,200 gold + 3,000 Burgers; x2 health and damage, +0.5 range; art `bld_wizard_merged`, `art.scale` 1.3). **You Shall Not Pass:** every 10 s (`wall.every`), with a ground enemy in range, a wall 3 tiles long stands for 3 s across the way the biggest ground crowd in range is walking (the crowd's average `vx`/`vy`; toward the tower if it's standing still), 1 tile ahead of it and at least 1.5 tiles from the tower. Ground troops within 0.45 tiles of it are held (`applyStun`, 0.2 s renewed every step, so a Quandale dash ends there), bosses slowed 50%, flyers and burrowed tunnelers pass. Mastery: Wider Wall (+1.5 tiles, +1 s), Searing Ward (held enemies burn for 30% of his shot damage per second), Double Cast (a second wall the same distance behind the crowd). Walls live in `state.barriers` (not saved, cleared at wave end); `stepWizardWalls` runs after the Sky Nets in simulate.js. GameScene's `wallRaised` shows "YOU SHALL NOT PASS!" over the tower with a thump, a small shake and one of Gandolf's voice lines.

- **F.L.O.C.K Mothership** (`CONFIG.merges.flock`, new src/logic/flockZap.js): two Level 10 F.L.O.C.K Towers merge (150,000 gold + 3,000 Burgers; x2 health, +0.5 range, marks +5% via `markAdd` in flock.js; stand-in art: the Level 10 picture drawn 1.25x with the gold glow until `bld_flock_merged` exists). **Triple Zap:** every 1 s it zaps the 3 closest enemies within 5.5 tiles (its own zap range, shorter than its marking), ground and air, 60 damage each (a normal hit, so its mark and armor apply). No zaps while silenced by John Pork or stunned. Mastery: Fourth Bolt (4 targets), Overcharge (x1.5 on enemies under half health), EMP Pulse (every 12 s stuns everything in zap range 0.75 s; bosses slowed 50%). `stepFlockZaps` runs after the walls in simulate.js; GameScene's `flockZap` draws a jagged blue bolt to each target (gone in about 0.3 s) with `sfx_spell_lightning` at 30%, and `flockEmp` an "EMP!" ring. `fightStats` reports its zaps (the merge window shows "- -> 3 x 60"); its Stats tab shows its range / mark bonus with the merge and a zap bar, and merges may set their own `description` for the Info tab. Ability icon `ui_ability_triple_zap` (stand-in: three bolts).

### Changes
- **Heroes sleep at night** (just for looks; hero.js `bedtime` / `restAtNight` / `wakeFromRest`, used by both heroes): when it's dark (`isDark(state.clock)`) and no raid is on or counting down (`isWaveInProgress`), a hero with nothing to do walks home to its altar's center (roam speed; snapped there after 20 s if it can't reach) and lies down (`h.resting`, not saved): HeroView shows the sleeping pose, "z Z" and the Brisket King's snoring, and the Hero tab says "Sleeping (night)". No healing, no timer. A raid's countdown (or daylight) gets it up with a 0.8 s wake-up (`heroWaking` / `queenWaking` with `night: true`). A healing nap that ends at night goes straight into night rest.
- **Encore Cloak icon:** the user's cloak picture as `art-source/ui/ui_encore_ready.png` (the key EncoreIcon.js already used; prepare-art rule width 192). It's loaded at boot, so the drawn teal music-note disc is now only a fallback; the icon over her is 32 px wide (was 28).
- **RV Lab Mastery column** (AbilityWindow.js): the outline is steady (v0.8.1's pulse removed); every tier name and status line is in gold tones (`MASTERY_INK`), available tiers get a gold outline instead of green, and the hover tint is gold.
- **Merged ability icons** (src/objects/MergeIcons.js `abilityIcon`): a glossy gold rounded box (`drawGlossy`) instead of a disc, with the art or the drawn symbol inside; bigger everywhere (building panel 40 -> 56 px, merge window 40 -> 60, How to Play 30 -> 40). New stand-in symbol for `ui_ability_shall_not_pass` (a staff and a wall).

### Balance
- **Gandolf Towers back to 6** (`limits.wizard` `[0,0,1,1,2,2,3,3,4,4,5,6,6,6,6]` as in v0.8.0; `limits.mortar` back to ending `5,5,5,5,6,6`): VH12 gives +1 Gandolf again instead of a Litman Mortar. A village that built a VH12 Mortar in v0.8.1 keeps it as an over-limit building (`overCap`).

## 0.8.1

Fewer Gandolf Towers, bigger merged shots, a pulsing Mastery column, a new app icon, the new Litman Triple Mortar picture, and the Hatsune Queen's shot sound. No database change; saves load as they are.

### Changes
- **Merged shots drawn bigger** (src/objects/ProjectileView.js): `MEGA_BALL_WIDTH` 26 -> 40 (a cannonball is 14); other merged shots use `MERGED_SCALE` (cannon 2.6, firework 1.8: the Missile Silo's rockets), flagged by `p.merged` set in combat.js `fireProjectile`. `attachRocketFx(scene, sprite, lightKey, k)` scales the rocket's glow and trail with them.
- **RV Lab Mastery column** (AbilityWindow.js `masteryAura`): the sparkles are gone; the gold glow pulses (alpha 1 to 0.1, 750 ms yoyo) only while a Mastery tier is available and affordable, otherwise it stays still at 35%. The header text is white with the outline, like the path headers. (The 3 Mastery stars on a merged building's label chip stay.)
- **New merged Mortar picture:** `art-source/buildings/bld_mortar_merged.png` is the user's "Litman MultiMortar Image V2" (same framing, so `art.scale` 1.24 is unchanged).
- **App icon:** the start screen's background with the game logo centered, as plain files (no script): master `docs/branding/app_icon.png`; `public/apple-touch-icon.png` (180) and new `icon-maskable-512.png` are square (the OS rounds them); `favicon-32.png`, `favicon-192.png` and new `icon-512.png` have rounded app corners. `manifest.webmanifest` lists 192 / 512 (any) and 512 (maskable).

### Balance
- **Gandolf Towers capped at 4** (`CONFIG.limits.wizard` `[0,0,1,1,1,2,2,2,3,3,4,4,4,4,4]`, was up to 6): one at VH3, VH6, VH9 and VH11. VH12 gives +1 Litman Mortar in its place (`limits.mortar` now ends `5,5,6,6,7,7`). Defense totals per hall: VH10 39, VH11 44, VH12-15 46 / 49 / 53 / 55. Villages over the new cap keep their Gandolfs (`overCap`: they work but block building more).

### Bug Fixes
- **Hatsune Queen's shots were often silent:** `queenShot` played `SFX.arrowFire` through `playSfxCapped(..., ENEMY_HIT_MAX)`, which skipped it while 4 arrow sounds were playing (several Locklair Towers). It now plays `FIRE_SFX.archer` with `playSfx`, like a Locklair Tower's shot.

## 0.8.0

A second hero (the Hatsune Queen), defense merging, two new enemies, Village Halls 12-15 (Bonus Slots removed), 2x wave speed, a per-village leaderboard, selling removed, and fixes. Saves load as they are (still save version 7; villages over the new caps keep their buildings). **Database:** run [supabase/migration-2026-11-22-v0.8.sql](supabase/migration-2026-11-22-v0.8.sql) (or all of schema.sql): it raises the server's Village Hall cap to 15 in `check_base()` / `keep_bests()` (without it, villages still save, but a Village Hall 12-15 village shows as 11 on the leaderboard and in player search) and adds the per-village leaderboard (`bases.best_wave_at`, kept by `check_base`; `get_village_leaderboard(lim)`). v0.7.2 never shipped; its changes are listed here.

### New Features
- **Hatsune Queen** (second hero; `CONFIG.queenAltar`, src/logic/queen.js, src/logic/heroes.js, HeroView `QUEEN_VIEW`; art `bld_queenAltar_lv1`-`lv5`, `hero_queen` / `_attack` / `_sleep`, sound `sfx_queen_select`): her own 2x2 altar (`queenAltar`, 1 allowed from VH8; 25,000 gold, Levels 2-10 1,500-9,500 Burgers needing VH8-15). Ranged crossbow hero (bolt every 0.8 s, range 5, guard range 8, speed 1.4; 2,400-4,602 HP, 160-288 per bolt), hits ground and air, backs off from ground enemies closer than 2.5 tiles, sleeps/KO like the Brisket King (`heroSleep` on her altar). **Encore Cloak** (hotbar, key G, once per wave): untargetable 4 s, bolts +150% and pierce 2, heals 30%. RV Lab tree (3 x 5): Sharpshooter (Sharp Tips, Long Draw, Critical Note, Piercing Bolt, Headliner), Idol (Warm-Up, Backup Chorus, Encore+, Fan Favorite, Sold Out Show), Stagecraft (Stage Armor, Quick Step, Dodge Roll, Understudy, Curtain Call). `state.queen` / `state.queenBolts` aren't saved (rebuilt from her altar), so older saves load and re-save unchanged; `save.js` allows `heroSleep` on both altar types (`HERO_TYPES`). Ground enemies fight the nearest awake, visible hero; flyers never attack heroes. Frigo's chill reaches her too.
- **Defense merging** (`CONFIG.merges`, src/logic/merge.js, src/logic/skyNet.js; Cannon, Locklair Tower, Litman Mortar, Firework Launcher): two Level 10 copies of a mergeable type merge into one (`b.merged`), which still counts as 2 toward the limit (`countOwned`; merging frees no slot); between waves only; one merge level. Cost gold + 3,000 Burgers (76,800 / 128,000 / 204,800 / 256,000 gold). about two buildings' worth: x2 health, +0.5 range (Mortar +1), plus: Mega Cannon (x3.2 damage per shot at x1.6 interval, 2x DPS; **Rolling Thunder** ball rolls 4 tiles through ground enemies, end burst), Locklair Citadel (x2 damage; **Ballista Bolt** every 5th shot 4x + 1 s pin, bosses slowed instead; a pin ends Quandale's dash), Litman Triple Mortar (**Triple Strike**, 3 shells at x0.67; heavy perks on the main shell only, `sideShellDrops`), Missile Silo (the merged Firework Launcher; x2 damage; **Sky Net** every 6 s pulls the biggest flyer group together and slows 50% for 3 s; ground too with Ground Show; bosses only slowed). **Mastery** per type (`state.mastery[type]`, 3 tiers, 1,200 / 2,000 / 3,000 Burgers, RV Lab 3 / 4 / 5) as a gold 4th column in the RV Lab window (with a breathing gold glow and twinkling sparkles; a merged building's label chip adds 3 Mastery stars after its 5 perk pips and its Stats tab a "★ Mastery n/3" line; the free respec button reads "Free Reset"; opened on it by a gold Mastery button on the merged building's panel and quick bar; research plays `sfx_ability_unlocked`); each merge grants a free respec for that type (`state.freeRespecs`), which doesn't reset Mastery. Timed perk specials get only the DPS gain (`mergeDpsMult`). UI: a gold Merge button in place of Upgrade at Level 10 (with the reason when unavailable), pick mode (eligible copies glow, banner + Cancel), one confirm window with the stat preview; a merged building's Info and Stats tabs show its ability row; ability icons `ui_ability_rolling_thunder` / `_ballista_bolt` / `_triple_strike` / `_sky_net` (drawn stand-ins until the art exists, src/objects/MergeIcons.js); merging plays `sfx_merge`; a 28 px gear badge (`ui_merge_gear`) on a gold-rimmed disc left of the level badge with a gap; merged pictures `bld_cannon_merged_dl/_dr/_ul/_ur`, `bld_archer_merged`, `bld_mortar_merged`, `bld_firework_merged_left/_right` (a gold-glow stand-in for future types), drawn bigger than Level 10 (`CONFIG.merges[type].art.scale`: Cannon 1.15, Locklair 1.15, Mortar 1.24, Missile Silo 1.22); the merged Cannon and Missile Silo turn randomly when idle. The normal Litman Mortar is drawn 10% smaller (`SPRITE_SCALE.mortar` 0.65 to 0.585). Saves: `merged`, `mastery`, `freeRespecs` (validated; still save version 7).
- **2x wave speed** (src/logic/fastForward.js): a round 2x toggle beside Start Wave (key T) during the countdown and the wave; GameScene runs the normal capped step twice per frame (never a doubled step), so every timer and collision behaves as at 1x; always 1x between waves. Saved as `fast` in `ibtd.settings`. The server's one-wave-per-30-s credit only delays a fast clear's leaderboard credit.
- **Quandale Dingle** (`quandale`, "Dash Striker", VH7, art `enemy_quandale` / `_attack` / `_death`, sounds `sfx_quandale_dash`, `sfx_quandale_voice`): 380 HP, speed 1.35, 24 per 1 s, bounty 22. `stepDasher` (enemies.js): when his target is `dash.minRange`-`dash.range` (1.5-4) tiles away, his dash is ready (`dash.cooldown` 2 s) and his route needs no wall broken (`e.breakingId === null`), he dashes along his route at `dash.speed` (4.5 tiles/s, at most `maxSeconds` 1.4); reaching the building he lands `impactMult` (3x) damage (`dashImpact`) and stuns it for `dash.stunSeconds` (1.5 s: `b.stunT`, counted down in `stepSpecialEnemies`; `stepDefenses` and `stepBeams` skip stunned buildings; event `buildingStunned`). A wall in the way, a new target or `maxSeconds` ends the dash with no impact. Views: attack pose and afterimages while dashing, "WHAM!" and a small camera shake on impact, stars over a stunned building (BuildingView `drawStun`).
- **Grimace Golem** (`grimace`, "Goo Tank", VH11, art `enemy_grimace` / `_attack` / `_death`): 3,200 HP, speed 0.5, 50 per 2 s, bounty 60. `stepGooTrails` (specialEnemies.js) drops a goo pool (`dropGoo`, pool kind 'goo', `goo.radius` 0.55, `goo.seconds` 6, no damage) every `goo.every` (1) tile; `stepPools` enrages other enemies standing in goo (`e.gooT` = `rageSeconds` 4, x`speedMult` 1.3 speed and x`damageMult` 1.3 damage through `enrageFactor`; no stacking, not Grimaces; event `gooRage`). Where he dies: one pool of `deathRadius` 2 for `deathSeconds` 8. PoolView style 'goo'; enraged troops pulse purple with a glow.
- **Village Halls 12-15** (`rules.maxTownHallLevel` 11 -> 15): costs 300k / 340k / 380k / 410k, HP x1.25 and capacity +500 per level; per-hall unlocks (CONFIG.limits, 15 entries each; `hallUnlocks(level)`): VH12 +1 Tower of Rah, +1 Gandolf; VH13 +1 Diddypult, +1 KSI, +1 Archer, +1 Storage; VH14 +1 Cannon, +1 Mortar, +1 Spear, +1 F.L.O.C.K; VH15 +1 Tower of Rah, +1 Firework, +1 Mine, Storage, House; +12 walls each. The Village Hall Stats tab says what the next level adds. Waves past VH11 grow by `rules.topHallGrowth` (x1.04 count, x1.03 health per hall; `hallWaveGrowth` in enemies.js; VH1-11 unchanged). Halls 11-15 reuse the top hall picture.
- **Leaderboard by village:** one row per village (`get_village_leaderboard`: rank by `bases.best_wave` desc, `best_wave_at` asc; only server-verified numbers; village name hidden when its owner hides their villages, except your own); the player's best village is added when outside the top. LeaderboardWindow shows the village name under the player name. Falls back to the old per-player `get_leaderboard` on PGRST202 until the migration runs. Local backend matches.

### Changes
- **Selling removed** (user): no Sell button for any building or wall; `checkSell`, `sellBuilding`, `sellRefund`, `rules.sellRefund`, the `buildingSold` event and the tutorial's `sell` permission are gone. Every type has a per-hall cap and buildings move in edit mode. Nothing is refunded or removed from existing villages; the no-working-mine free rebuild stays as the gold safety net.
- **Title screen:** Tripi Tropi (the fish giant) is drawn 300 px tall instead of 380 (TitleBackdropScene `ENEMIES`).
- **Bonus Slots removed** (`rules.bonusSlots` and its helpers gone): Village Hall 11 instead gives +1 Tower of Rah, Gandolf, Diddypult, KSI Tower and Cannon over VH10 (defense total +5, as before). Villages with buildings past the new caps keep them (they work, upgrade and move; `overCap`); the shop shows the count in gold ("7/3", "Over the limit") and only blocks building another of that type until under the cap.
- **Themed waves:** `dashGang` (Quandale 60%, Shark 40%; needs quandale) and `gooParade` (Grimace 50%, Grunt 30%, Tank 20%; needs grimace) appended to `waveThemes.order`; both kinds in `headlinerCap`, `OFFSET_KINDS`, `QUEUE_ORDER` and the legacy debut list.
- **Profile buttons instead of Visit on the lists:** leaderboard and Find Players rows end in a green "Profile" button (`profileButton` / `rowButton`, PlayerCardWindow.js, `VISIT_W` 78) that opens the player card, like clicking the row; `onVisitBest` and TitleScene `visitBest` are gone. Visiting is only from the card (village rows' Visit, "Visit Best Village"). TitleScene `visitVillage` passes `from` ('leaderboard' / 'search') to VisitScene (kept through `switchTo`); Back starts TitleScene with `reopenFrom`, which reopens that window and the card on top, so closing the card lands back on the list (Find Players keeps its last filters).
- **Neegy:** role "Summoned Paratrooper" (it was already a summoned sub-troop in How to Play); the Neegy Balloon's stat tile says "2 Neegies".

- **Sounds:** the perk-unlocked sound (`sfx_ability_unlocked`, played for perk and Mastery research) is the user's new "New Perk Unlocked sound" (the old one archived as unused-assets/root/sfx_ability_unlocked_v1.mp3); merging plays the new `sfx_merge`.
- **Edit mode:** a stored merged defense gets its own hotbar card (merged picture + gear; `hotbarGroups` groups by `merged` too, `pickFromHotbar(type, level, merged)`), and its placement ghost / swap preview use the merged picture and size.

### Bug Fixes
- **Whole village drawn as placeholder blocks** (playtester report): a failed or stalled picture request at boot left a placeholder for the whole session (BootScene drew stand-ins and nothing asked again; src/assetLoader.js treated stand-ins as loaded, never retried failures and re-requested a missing picture every frame). Now: BootScene retries missing core pictures 3 times (3 / 4.5 / 6 s, cache-busting `?r=n`) with a "slow to load" status; assetLoader retries failed files after 2 / 6 / 15 s and remembers given-up files (`imageRequested`); missing `bld_*` pictures keep loading after boot and replace their stand-ins safely (temporary key, then re-point views in the same tick); `loader.timeout` 60 s in src/main.js; new src/assetNotice.js shows "Some pictures failed to load (n)" with Retry / Reload page when 3+ stay missing (Retry also on `online`); main.js detects browsers without WebP (older than Safari 14 / iOS 14) and says so, with Play anyway.
- **Hero health bar not full after an altar upgrade:** a hero's `hp` was set at creation and never rescaled when its max health rose (altar level, RV Lab health perk), so the bar looked hurt. New `syncHeroMaxHp(h, maxHp)` in src/logic/hero.js (called from `stepHero` / `stepQueen`) keeps the same share of health; HeroView draws `hp / h.hpMax`. Clicking the Hatsune Queen's altar now plays `SFX.altarSelect` (her voice plays when clicking her).
- **Volume sliders at 0 didn't silence everything:** `setMusicLevel` skipped tracks mid-fade (and fade tweens wrote absolute volumes), ambience only updated in GameScene's update (not while paused), and effects already playing never followed the Effects slider. audio.js now gives music sounds a fade factor (volume = factor x track x level, recomputed on every tick and slider move), `applyAmbience()` runs on slider changes, and `playSfx` / `playVoiceLine` / `playSfxClip` sounds are tracked and rescaled live. Pure helpers in src/logic/volume.js (tests/volume.test.js).
- **Black screen when visiting a village:** VisitScene drew nothing until the village and up to 8 s of building pictures had loaded, and its "Loading village..." status was dropped (the HUD wasn't created yet). The map and camera now start in `create()`, the status is kept (`statusMsg`) and shown, the picture wait is 2.5 s (views swap pictures in as they stream), and any failure shows a message with a Back button (`fail`, logged as `VisitScene: ...`); one bad building view is skipped instead of freezing the frame loop.
- **Title screen buttons locked after visiting a village:** TitleScene kept `this.leaderboard` / `this.search` from before the visit (the scene object is reused and leaving for VisitScene never ran their onClose), so closing the reopened player card set `windowOpen = !!(this.search || this.leaderboard)` back to true and every button ignored clicks until a reload. `init()` now clears both.
- **Enemies drawn as a missing-texture box:** BootScene now gives every enemy kind without art or a placeholder shape a grey stand-in figure, so a picture that hasn't loaded (e.g. a tab opened before new art was added) never shows Phaser's missing-texture box.

## 0.7.1

Polish on v0.7. Saves load as they are (still save version 7). **Database:** if the v0.7 migration ([supabase/migration-2026-11-21-player-profiles.sql](supabase/migration-2026-11-21-player-profiles.sql)) isn't run yet, run it now; it now ends with `notify pgrst, 'reload schema'` so the API sees the functions at once.

### Changes
- **Visiting: building card restyled** (VisitHudScene `showBuilding`): a `drawWindow` with a slate header (name, gold "Level x / y"), a red X, the building's picture on `drawShowcaseCard`, stat rows (Health with perks, Size, and for defenses Damage, Range, Targets; `statRows`) and a glossy chip per researched tier in `PATH_COLORS`. Presses on the card or the top bar no longer reach the map (`VisitHudScene.covers`, checked in VisitScene's pointerdown).
- **Incoming troop markers condensed by default:** each wave marker (WaveMarkers.js) starts as its disc plus one summary chip with the corner's total (`markerChips(entries, open)`, logic/waveMarkers.js); clicking it (`GameScene.handleClick` -> `WaveMarkers.toggleAt`, `markerHit`) opens every kind plus a Hide chip, kept per corner (`open` set) across waves. Mouse hover: 8% bigger with a gold outline and a hand cursor (`hoverAt`, from GameScene's hover check). Not in edit mode; placement and spell aiming take the click first.
- **League badges graded by league:** `leagueBadgeSize(league, size)` (leagues.js, `LEAGUE_BADGE_MIN` 0.85): Bronze 85% of the spot's size, each league +3%, WarLord 100%, then corrected for each picture's shape (`LEAGUE_ART_FILL`, sqrt(w x h) / longer side measured from the art, against 0.93) so a squarish badge (Silver) no longer looks bigger than a tall one (Champion). Used by the leaderboard (36), Find Players (36), player card (62), Profile (118), How to Play / Profile league rows, and the title / HUD corner badges (58 / 52).
- **Green Visit buttons:** the round blue eye buttons (`eyeButton`) on leaderboard rows, Find Players results and player-card village rows are now green rectangular "Visit" buttons (`visitButton(scene, rightX, y, h, onClick)`, `VISIT_W` 72, PlayerCardWindow.js); the card's big button is green "Visit Best Village" without the eye. Find Players' columns moved 30 px left to make room.
- **What's New tabs for past updates:** the window (PatchNotesWindow.js, now 640 px tall) has a tab per minor update under its title (`drawTabs`, `showRelease`; green for the open one): `PATCH_NOTES` ("v0.7 · Latest", new `release: '0.7'`) and the new `PATCH_HISTORY` (patchNotes.js; v0.6 with the 0.6.0-0.6.3 entries, which left the latest tab). `PATCH_RELEASES` lists them; the asset plan keeps every tab's building icons core. CLAUDE.md says how to roll a release into the history.
- **Big Yahu's airstrike hits a single target:** its missile damages only the building it was aimed at (if still standing and hittable), no longer every building and wall within 1.25 tiles; `yahu.missileRadius` is replaced by `missileStrike: true` (the combat.js dispatch reads it). The red warning ring is drawn just around that building (`fireMissileAt` / `stepEnemyShot` in specialEnemies.js). How to Play tag ("Missile strikes (one building)"), description and tip updated.
- **Enemy voice lines:** Bri Bri Bicus Dicus, Frigo Camillo, Brr Brr Patapim, Lirili Larila and Da Baby Car join the random raid chatter (`ENEMY_VOICE`; sounds `sfx_bicus_voice`, `sfx_frigo_voice`, `sfx_patapim_voice`, `sfx_lirili_voice`, `sfx_babycar_voice`; Lirili's line is cropped to 3 s by prepare-audio's `CLIPS`).
- **How to Play: sub-troop buttons.** Rahhh Skeleton, Brr Brr Patapim and the Neegy Balloon have a card button with their troop's picture that opens its page (Skeleton, Chimpanzini Bananini, Neegy), and the troop's page links back.
- **Leaderboard:** the medals are sized by place (36 / 34 / 32 px), and ranks 4 and below sit on a dark badge with a white number (orange on your own row).

### Balance
- **Bri Bri Bicus Dicus:** while its armor holds, hits are reduced by `bicus.armorReduction` (0.3) before they reach the armor (`damageEnemy`: the armor loses the reduced amount, `enemyHit.amount` is the reduced figure, `source: 'armor'` unless another source is set); the breaking hit still does no health damage, and after that it takes full damage. How to Play's tag reads "Armor 450 (-30% damage)", its description and tip mention it, and armored damage numbers are steel blue (`#9fb8d6`, GameScene).

### Bug Fixes
- **Fuel Station text overflow:** its description is shorter (buildingText.js, 11 lines instead of 13) and UIScene's `drawInfoContent` now steps any building's description font down (14 to 11 px) only if it would reach the button stack. Its stat lines (shop popup and Stats tab) are shorter: "Brews Karuba Coffee" / "Spell slots: 5 · 0 brewed" / "Level 2 adds Donut (Heal)" ("Brews N of 6 spells" from level 4, "Every spell unlocked" at max). Brew window cards (FuelStationWindow.js) split the effect into two lines (name, then range and timing).
- **Missing server functions:** a call to a server function that isn't installed ("Could not find the function ... in the schema cache") now says "This isn't available on the server yet. Try again later." (`friendlyError`, supabaseBackend.js) instead of the raw database error.

## 0.7.0

"iBTD fixes and features 3": other players' villages, five new enemies, Brr Brr Patapim reworked, themed waves, a grouped What's New. Saves load as they are (still save version 7; a new optional `debuted` list). **Database:** run [supabase/migration-2026-11-21-player-profiles.sql](supabase/migration-2026-11-21-player-profiles.sql) (or all of schema.sql) for player search, player cards and visiting villages; without it those windows show an error and the rest of the game is unaffected. From this release on, this file and the What's New use the same four groups (format: [CLAUDE.md](CLAUDE.md)).

### New Features
- **Other players' villages.** Leaderboard rows open a player's card and their eye button visits their best village; Settings has **Find Players** (name search, League filter as a wave range, Village Hall filter, sort by furthest wave / Village Hall / achievements; `PlayerSearchWindow.js`). The card (`PlayerCardWindow.js`) shows league, joined date, furthest wave, Village Hall, rank, achievements (newest 8) and their villages best first, each with an eye. Visiting (`VisitScene.js` + `VisitHudScene.js`) draws their saved village read only with the game's building views: pan, zoom, tap a building for its level and perks, switch between their villages, Back reopens the card. "Let others view my villages" in Settings (`profiles.public_bases`, on by default). Server: `search_players`, `get_player_profile`, `get_player_base`, `set_public_bases` (security definer, login required, read only); the local backend has the same.
- **Themed waves** (`CONFIG.waveThemes`, waves.js; replaces `specialWaves`). From wave 2 every wave has a theme rotating through the 16 the hall has unlocked (`order`, `needs`): headliner themes give `share` (about 55%) of the wave's strength to their mix and keep the rest of the normal mix; the 5 old special waves are `pure` themes and keep their +50% bonus. Every 10th wave is a **Boss Wave** (the 4 toughest kinds the wave has at 60%, x1.15 strength, one more Da Baby Car than usual, +100% bonus). A **debut wave** (45% of the wave) introduces each enemy that joins by Village Hall the first time the village can meet it (`state.debuted`, saved; older saves count their hall's enemies as met except the v0.7 ones). Da Baby Cars keep their schedule except on pure themes. Enemies with stacking abilities are capped per theme at 3x their normal count (or +2; `headlinerCap`), the rest of the budget going to the other troops, so a theme never floods the map with Patapims or Frigos. The tip about special waves became a "themes" tip.
- **Bri Bri Bicus Dicus** (`bicus`, VH5): melee legionary with `armor` 450 (scaled like health). While armor is left every hit goes into it, and the hit that breaks it does no health damage (its leftover is lost); `armorBroken` plays `sfx_bicus_armor_break` with steel shards. Its health bar shows a steel armor bar and a shield (HealthBar `armor`). Sword sound = Rahhh Skeleton's. The Tower of Rah counts armor as toughness.
- **Frigo Camillo** (`frigo`, VH6): a cold aura (`chillAura` 2.5 tiles, 35%): defenses fire slower (`towerFireInterval`), the Tower of Rah burns slower and the Brisket King swings slower within it (`b.frigoSlow`, `hero.frigoSlow`, `stepChillAuras`). Slowed defenses shimmer icy blue; a frosty ring follows it; its footsteps play the Freeze spell's sound every 3.5 s (at most one at once).
- **Bombombini Gusini** (`bombo`, VH8): a flyer that breathes fire from 2.5 tiles: full damage to its target, 35% to every building and wall within 1 tile of it (`breatheFire`, `fireBreathFx`).
- **Lirili Larila** (`lirili`, VH9): the earthquake tank (Brr Brr Patapim's old `quake`, numbers and sound unchanged).
- **Chimpanzini Bananini** (`chimp`): dropped by Brr Brr Patapim; targets the nearest building (never walls), jumps walls, hits once (90) and is gone (`kamikaze`, `enemyDive`, no bounty).

### Changes
- **Brr Brr Patapim** reworked and moved to Village Hall 10: he drops a Chimpanzini every 3 s while walking in (not on the path in, not while attacking), up to 8 of his alive (`spawn`). 2,400 HP (was 2,800).
- **How to Play:** every new enemy has its entry, tags and description; a fifth group, **Summoned** (Neegy, Skeleton, Chimpanzini); roster tiles size themselves to fit five groups.
- **Leaderboard medals:** ranks 1-3 show the gold, silver and bronze medal pictures (`ui_medal_1`-`3`, art-source/ui) instead of colored circles (kept as the fallback).
- **What's New is grouped** into New Features / Changes / Balance / Bug Fixes (colored headings, repeated on the next page), each entry tagged with its version (`PATCH_NOTES.sections`). The format guide for agents is in CLAUDE.md.
- **RV Lab building list tidied:** no Brisket King portrait beside the Brisket King Altar any more; each row has its picture in a small tile, its name over slim tier bars (they overlapped the name in the short rows of the 12-defense list), and its "!" inside the row. The list uses the window's full height, and the Defenses / Economy tabs' "!" sits inside the tab instead of over its corner.

### Balance
- **Late waves make room for the new enemies:** `rules.lateKindMaxCut` 0.35 -> 0.55, so each hall's base wave stays within about 5% of its v0.6.3 strength (Village Halls 9-11 would otherwise be 11-18% stronger). Air Raids can bring Bombombini; Sieges bring Lirili Larila instead of Patapim.

## 0.6.3

Saves load as they are (still save version 7).

### Changed
- **Village Hall 11 Bonus Slots take defenses only** (every Defenses and Traps tab building: Cannon to Diddypult, F.L.O.C.K and the Mousetrap). Instead, Village Hall 11 allows one more Mine (7), Storage (6) and House (6). A village that already put economy buildings in Bonus Slots keeps them (they count past the new limits, so no more can be built until it's under).
- **KSI Tower effects in the Gandolf's style:** its bottle flies with an icy glow, a frosty halo and a trail of ice sparkles and snow (`attachFrostFx`), and bursts in a cold flash, ice shards, frost mist, spinning snowflakes and an ice-blue shockwave, with its splash ring (`frostImpact`, Effects.js).

### Fixed
- **Tower of Rah losing its heat on flyers at the edge of its range:** La Vaca Saturno hovers 3.5 tiles off its target, often right at the beam's 6-tile range, and the crowd nudged it out and back, so the beam kept dropping it and starting cold (x1) again. Once locked on, the beam now holds its target `leash` (0.75) tiles past its range; a new target still has to be in range.
- **Enemies drawn under rubble:** a destroyed building's rubble kept the standing building's draw depth (its front corner), so enemies, gnomes and the hero crossing it vanished under the picture. Rubble is now drawn from its back corner, and the ground layering ignores destroyed buildings.

## 0.6.2

Faster loading, especially on phones. Saves load as they are (still save version 7). Details in [README.md](README.md) under Graphics and performance.

### Faster loading and phones
- **About 8x less to download before the title screen** (about 11 MB instead of 94 MB): pictures are WebP (60 MB of PNGs down to 12 MB, looking the same) and sounds are smaller (32 MB down to 16 MB: lower-bitrate music, mono ambience and long loops, trimmed clips). On a phone at 4 Mbps the game reaches the login screen in about 28 s instead of about 3 minutes.
- **Only what's needed loads up front.** Building pictures past Level 1 stream in: your village's own before it opens (START GAME waits for them, usually already in), then what your Village Hall can build, in the background; anything else when it's first shown, with the closest lower level standing in for a moment. Music and ambience load when they first play; the unused village track never loads.
- **Much less memory on phones:** sounds are decoded only when needed (about 240 MB at most in a village instead of about 450 MB at startup), and the title music is freed once a village opens.
- New scripts: `npm run prepare-audio` (originals now in `art-source/audio/`, the maps' in `art-source/map/`); `sharp` and `ffmpeg-static` are dev-only tools. The deploy skips their install scripts.

### Changed
- The gold Neegy no longer stands with the enemies on the title screen.

### Fixed
- The wall's shop "i" popup showed the Level 1 picture and health while the card and price were for your wall level (new walls are built at it). It now shows that level, and a line explains the price.

## 0.6.1

Saves load as they are (still save version 7). Details in [README.md](README.md) under the enemy list.

### Changed
- **Village Hall 11 reworked: Bonus Slots instead of the shared building limit.** Every building keeps its Village Hall 10 limit, and Village Hall 11 adds 5 Bonus Slots on top: each is one more building of any kind (not unique buildings or walls) past its limit, at the normal price, any mix. Selling a copy frees its slot. The shop shows a gold "Bonus Slot · n left" tag on capped cards and "Bonus Slots n / 5" in its footer. The +50% price for extra copies is gone. Villages already more than 5 past their limits keep everything but can't add more extras.
- **Rahhh Skeleton reworked:** instead of enraging the enemies around him, he summons. Within 4 tiles of the building he's after he bashes his shield and 3 **Skeletons** climb out of the ground around him, then more every 10 s while fewer than 6 of his are standing. They're as tough as he is for the wave. His enrage (+40% damage, +25% speed) and its red tint are gone.
- How to Play's enemy roster is as wide as its biggest category's row, so the 6 Special enemies fit.

### New
- **Skeleton** (`bones`): the summoned minion, with its own walk, attack and death pictures. Weak and quick (80 HP, 10 per hit, speed 1.2), worth 2 gold and 1 Burger.
- La Vaca Saturno flies in on the title screen over the heroes, left of the logo.

## 0.6.0

A feature release (the 13-item "Fixes & Features Batch 2"). Details in [README.md](README.md): KSI Tower, Village Hall 11, and the enemy list under Walls and pathfinding. Saves load as they are (still save version 7). **Database:** run [supabase/migration-2026-11-21-village-hall-11.sql](supabase/migration-2026-11-21-village-hall-11.sql) (or all of schema.sql) so the leaderboard counts Village Hall 11; the game works without it.

### New
- **KSI Tower** (Village Hall 5): an ice tower that splashes ground and air enemies and chills them (30-50% slower, icy blue). Slows never stack (the strongest wins); bosses take half. Perk paths Blizzard, Fully Frozen and Snowball.
- **Five new enemies:** John Pork (VH4, silences F.L.O.C.K Towers with a phone call), Rahhh Skeleton (VH6, a shield bash that enrages enemies around him), La Vaca Saturno (VH7, a tanky flyer whose boulders bounce 3 times), Big Yahu (VH8, missiles with a red target ring first), Brr Brr Patapim (VH9, earthquakes that hit every building and wall around him).
- **Village Hall 11** (250,000 gold), the new top level, with **the shared building limit:** the per-type caps become one pool of 56 buildings (any mix); copies past a type's cap cost +50% each (compounding). Unique buildings and walls keep their caps; Village Hall 11 adds 12 walls. Village Hall 10 keeps the usual caps. The shop shows "Buildings n / 56". (Replaced by Bonus Slots in 0.6.1.)
- **Select Row** in edit mode: a toggle beside the Shift pad; tap a wall to pick up its whole straight row and move it.
- **Spell sounds:** each spell has its own cast sound (repeat casts within half a second stay quiet, at most two of one at once).
- **How to Play:** the Enemies tab is a new roster: every enemy as a picture card on one panel, grouped into Ground, Air, Tanks & Bosses and Special, with the picked enemy's details beside it. KSI Tower and the new enemies have entries.
- **The Brisket King's portrait** on his altar in the shop card and info, How to Play, the building panel, the edit hotbar and the RV Lab list. His Hero tab lines its stats up like the Stats tab (values on the right, the next level's gain in green) and shows Brisket Feast as a card with its crown icon, and the altar's shop info has a full-width "Open Brisket King" button (it overlapped the picture).
- **Patch Notes:** a What's New window on the title screen, shown once per version to returning players.
- The title screen gained Brr Brr Patapim, John Pork and Rahhh Skeleton.

### Changed
- The shop's page arrows are blue (greyed-down blue at the first / last page).
- The KSI Tower grows with its level like the other defenses: its later pictures are squatter, so each is sized to stand about 4% taller than the one before (`TIER_GROWTH` in BuildingView.js); Level 10 had been drawn shorter than Level 5.

### Fixed
- The title screen's mortar fired every few seconds while the game was still loading (several shots on a slow phone). It now waits idle and fires once, when loading is done.
- Enemies in a pose without a set size (John Pork's call, the Skeleton's bash) were drawn at no size; found and fixed before release.

## 0.5.1

- The wave's "!" warning now sits on each attacking path's corner marker, out at the back of the path, instead of floating over the village.
- Rebuilding a destroyed Fuel Station, RV Lab or Brisket King altar mid-wave now costs more at higher levels (it was a flat price at every level). A level bought with Burgers counts as 15 gold per Burger (`rules.burgerGoldValue`), times the usual rebuild share.
- "Storage full" shows once, and again only after your gold has dropped below capacity, instead of on every collect.
- The title screen's mortar is silent now.

## 0.5.0

A big feature release: everything since 0.4.1 (the 37-item fixes and features list, plus the QA rounds).

### Before you deploy (manual steps)

1. **Update the Supabase database first.** In the Supabase SQL editor, run **supabase/migration-2026-11-20-base-limit-lock.sql** and **supabase/migration-2026-11-20-base-revision.sql** (or simply run the whole **supabase/schema.sql** again; it includes both and is safe to re-run). Do this *before* pushing: the new game saves villages only on top of the revision the server gave it, which needs the revision trigger (`stamp_base`), and the server-side wave count (`check_base()`) now counts waves the way the game does.
2. Then push to `main` (GitHub Pages deploys it).

### Burgers (research points, renamed)

- **Research points are now Burgers**, with a burger icon everywhere they show: the top bar, costs and buttons ("Brew · 40 Burgers", "Research · 240 Burgers"), the "+N" over defeated enemies, the wave-cleared banner, "Burgers full: N lost", the research and Fuel Station windows, tips, the guide and How to Play. The bar is a toasted-bun orange instead of purple. Nothing about how they work changed, and saves are untouched.
- **Burgers are capped**, like gold: the bar in the top row (left of the gold bar, with the day/night pill moved directly under the gold bar) shows a cap that grows with the RV Lab's level (400 with no lab, then 700 / 1,500 / 3,500 / 6,500 / 10,000). Anything earned past it is lost, so spend them.
- **What they pay for:** perks, path resets, spells, and upgrades of the RV Lab (Levels 2-5: 300 / 800 / 2,000 / 4,000), the Fuel Station (Levels 2-8) and the **Brisket King's altar** (his Levels 2-10: 150 / 250 / 400 / 650 / 1,000 / 1,600 / 2,500 / 4,000 / 6,000; building the altar still costs 3,000 gold). Burger levels aren't refunded as gold when selling. Beating a wave now pays 15 x the wave number (was 10).

### Perks (RV Lab)

- **One path per building type:** your first pick for a type (say Cannon A1) locks every Cannon to Path A for tiers 2-5. **Reset path** (under the tree) clears a type's picks for half of what they cost, with no refund, so it can take another path. Existing villages keep their picks (save version 7).
- **Perks no longer depend on building level:** a perk goes onto every building of that type at once, whatever its level. Only the RV Lab's level gates a tier (tier N needs lab level N). This covers the defenses, the economy buildings, DJ Babyface, the Brisket King's altar and the Fuel Station.
- New perk trees are added with one call (`registerPerkTree`, see docs/PERKS.md).

### New: Fuel Station, spells and the hotbar

- **Fuel Station** (a Kwik Trip; Economy tab, from Village Hall 2, 8 levels, four pictures, growing each level). Level 1 costs 400 gold; later levels cost Burgers. It opens a window like the RV Lab's: **Brew Spells**, and a **Perks** tab (*Potency*, *Spread*, *Refinery*).
- **Six spells**, opened by the station's level: Karuba Coffee (**Rage**), Donut (**Heal**), Ice Bag (**Freeze**), Spicy Tornado (**Heat Field**), Chocolate Milk (**Invisibility**) and Energy Drink (**Lightning Strike**, which hits the toughest enemies in its circle hard). Each is brewed with Burgers and used once; your Village Hall level sets how many you can carry (1 to 5). Every spell has its own icon art.
- **A guided first spell:** at Village Hall 2 the guide walks you through building the station and brewing a free first Karuba Coffee; its hotbar slot pulses until you cast it.
- **The hotbar** (bottom middle, during waves) replaces the old ability buttons: your spells, **Brisket Feast** and DJ Babyface's **Drop the Beat**, each with a number key (F for the Feast). Click a spell, then the map, to drop it (a ring shows its radius). Clicking the hero, his altar or the DJ booth now only selects them. The building info panel steps aside when it would cover the hotbar.

### New defense: Spear Thrower

- A long-range sniper (Defenses tab, from Village Hall 3; 1 / 2 / 3 allowed at Village Hall 3 / 5 / 8; 10 levels). Range 8.5, a heavy throw every 2.5 s, ground and air. The spear flies on through a short line behind its first target, piercing at 100% / 75% / 50% / 25%. Five pictures in four facings (it turns toward its target), its own spear, two throw sounds and a hit sound, and three perk paths (*Impaler*, *Hunter*, *Throwing Arm*).

### The Diddypult

- **The final unlock:** it now opens at Village Hall 10 and is last in the shop. It has **5 levels, one new picture each** (Levels 4 and 5 are new), hitting much harder per level so it holds up at Village Hall 10, with cheaper top levels.

### The Brisket King

- **Knocked out in a raid, he stays down until it ends** (no sleep cycle mid-raid), with a KO effect over his head. The new **Second Wind** perk gets him back up after 20 s at 40% health.
- **Always-on health bar** with his level drawn on the new crown picture. **Rage look** while Brisket Feast is active: a red tint and anger puffs. A soft light surrounds him at night.
- **New poses:** standing, both attacks (alternating), sleeping, waking up, defeated, and a select pose when you click him. Brisket Feast has its own sound; he snores softly while asleep.
- His ability and its description are on every hero info page, and the altar's shop info has a button that opens his Hero page.
- **His upgrades cost Burgers** (see Burgers above).

### Waves

- **Wave markers:** for each corner the next wave attacks from, a red arrow disc and the enemy types with counts sit on the map at the back of that path, always visible, the same size at any zoom, and sliding in along the path when the HUD would cover them. **Fog** drifts over the back of every path where enemies come onto the map.
- **Random corners:** every wave picks how many corners it uses and which ones at random, at every Village Hall level, and its enemy types come **mixed together** instead of one type after another.
- **The wave countdown is back:** Start Wave gives you 30 seconds before the attack, with a red "!" over each path the enemies will use and the planning music, which ends as the wave hits. Build during it, press **Start Now** to skip it, or **Cancel** to put the wave back. The tutorial's first wave counts down 10 seconds.

### Walls

- **Walls upgrade all at once:** click any wall and press **Upgrade Walls** to raise every wall one level, for walls placed x the new level's price (all or nothing; each level still needs its Village Hall). The per-wall upgrade and "Select connected walls" are gone. New walls are built at your current wall level. Prices are much lower: 10 / 20 / 40 / 80 / 150 / 300 / 500 / 800 per wall per level (was up to 4,000), so 132 walls go to Level 8 for 105,600. Existing villages bring every wall to its most common level (ties go to the higher one).

### Characters and art

- **Mr. Least replaces the Goyum Goblin:** the sneaky gold thief is now a smug man in a sharp suit (walking, attack and death pictures; a little taller). He works exactly as before.
- **Animated title screen:** the loading screen and title menu are a living scene. The logo drops in and pulses; Gandolf, the archer and a worker gnome stand by the mortar, facing a crowd of enemies, all breathing gently; the crocodile plane flies past, the balloon bobs, embers drift and the wizard's staff glows. While the game loads, the mortar fires its man at the enemies; when loading finishes he hovers at the top of his arc on the title menu.
- **Gnomes at work:** a gnome working at a building (mining, repairing) shows a working pose. New gnome picture.
- **Skibidi Toilet** has an attack picture; new Tank and Diddypult pictures.

### Interface

- **Fixes for overlapping UI:** the RV Lab window no longer sits under its title bar, long window titles shrink clear of the close button, shop cards keep names, "Village Hall N required" and traits apart, the Villages list never runs a long name under the Play button, the Start Wave button is sized to its hint, How to Play's stat tiles no longer let a long value run into its label (the Fuel Station's "New spell at level" tile), the RV Lab guide's note in the research window stays clear of the grid, and an upgrade that can't be bought yet still says what it costs in ("600 Burgers", not "600").
- **Leagues:** the Profile shows every league's badge and the wave it takes (yours tagged YOU), and How to Play has a Leagues tab. Leagues are much harder: Bronze needs wave 5, Silver 20, Gold 40, Crystal 70, Champion 110, WarLord 160 (was 1 / 4 / 7 / 10 / 15 / 25). The Leaderboard and the Profile now agree on your league (the server used to count waves by Village Hall level).
- **Graphics setting** (Settings and the pause menu): **Auto / High / Low**. Low draws fewer particles, fog puffs, night glows and floating numbers; Auto switches to Low by itself when the frame rate stays low.

### Balance

- Village Halls 2-4 had waves far harder than the defenses they allow; they're toned down, and Village Hall 5 has a scripted base wave of its own. Late waves grow faster from there (enemy count x1.18 and health x1.14 per Village Hall, was x1.15 / x1.1).
- Bitcoin Mine Levels 6-10 make 12-33% more gold. Cannon damage +10%; Locklair Tower and Firework Launcher -10% (the Spear Thrower shares air cover now); Litman Mortar -5%, Gandolf -7%; F.L.O.C.K Tower and Tower of Rah upgrades cheaper.

### Accounts, saves and sync safety

- **Safer saving across tabs and devices:** opening a village in a second tab tells the first, which stops saving it ("This village was opened in another tab", with **Reload here and take over**). A tab or device with an older copy can no longer overwrite newer progress: the server refuses it, and that copy is kept as a backup you can **Restore** from Villages → Import from this device. Unsent progress left on a device is merged by the server's revision instead of the device clock.
- **Play Offline:** if the server can't be reached when you start, the login screen offers **Retry** and **Play Offline** (your villages from this device, as the last account that logged in here); everything is sent at the next login. The leaderboard and achievement rewards wait until then.
- **Shared devices:** each account's unsent copies wait for that account only; Villages no longer offers another account's copies. Log Out also forgets the remembered email and clears the saved login, even offline.
- **Account and save fixes:** the 5-village limit holds when two tabs create villages at once (a database lock); logging out mid-upload and another player logging in can't put the upload in the wrong account, and nothing is sent once the login changed (another tab logging in as someone else); a game keeps saving into the village it started in, whatever the session does next; switching villages starts a clean game (a leftover HUD piece from the last one could crash it); a save the game can't read is kept on the device before a fresh start replaces it; an old-version village on the device imports as a current save; a village update that changed nothing on the server (deleted elsewhere) stays unsent instead of being dropped; and saves from every version (1 to 7) load, while corrupt or tampered ones are rejected without crashing.

### Performance and stability

- Faster drawing for slow devices and late waves: cached circles, arcs and shapes, a pooled and capped layer of floating numbers, health bars that redraw only when they change, and a faster gnome lookup.
- Very high waves (tested to 500+) stay stable: Da Baby Car's burst is capped, a bad frame time can no longer reach the game rules, spells check where they're cast, and sounds are skipped while the browser still has audio locked.
- Fixed a test that failed now and then (the two-tab test's message timing).

### Cleanup

- Unused images and sounds moved out of the shipped game into `unused-assets/` (outside `public/`), with a list of where each came from; the old research point token is kept there too.
- Removed code left over from replaced systems and duplicated helpers (unused functions, the old wall group upgrade, the unused `UNLOADED_FILES` list), and brought comments and docs up to date.

## 0.4.1

- **Brisket King's health bar** now rides along with him when he hops walls (and with the bounce in his step), and sits above his tallest pose, so it never covers him.
- **Brisket Feast from the altar:** clicking his altar (or him) during a wave sets off Brisket Feast. When it can't be used right now, the reason floats over him ("Used this wave", "He's asleep") and the altar is selected as usual.

## 0.4.0

- **Perk bar on every perk building:** every building with a perk tree (defenses, the Brisket King's altar, mines, storages, houses, DJ Babyface) shows its 5-slot perk bar next to its level from the start, empty until perks are researched in the RV Lab.
- **New hero: the Brisket King**, a melee hero who guards his altar (Defenses tab, from Village Hall 4, 10 levels).
  - He roams his area when there's no enemy to fight, walking around buildings and hopping over walls. In a wave he charges ground enemies near his altar, and they fight back.
  - The altar has five pictures as it levels up, one per 2 levels, and sits flush on its tiles.
  - After a wave he naps to heal (longer the more he was hurt); knocked out, he sleeps 2 minutes. He sleeps through any wave you start meanwhile. While he naps, a blue sleep bar over him fills as he heals, with the time left above it.
  - Click him during a wave for **Brisket Feast**: a heal, a speed and damage boost, and a slam.
  - Upgrading the altar levels him up, and he has a 3-path perk tree in the RV Lab.
  - His altar's info panel has a **Hero** tab: his portrait, health, damage, attack speed, guard range, status (with the nap timer) and Feast charges, plus what the next level adds.
  - His health bar wears a dark purple crown badge with his level, so he stands out from buildings and enemies.
  - He and his altar each have their own click sound.
- **Sky:** dusk and dawn now have their own pictures. Day fades into the dusk sky, then into night, and dawn runs the same way back, with buildings and enemies tinted warm in between.
- **DJ Babyface:** its level 2, 3 and 4 pictures now show as it is upgraded (level 5 shows the level 4 picture for now).

- **Phones and tablets:** the game plays by touch, sideways.
  - **Moving around:** drag to pan and pinch with two fingers to zoom.
  - **Placing:** a new building's ghost appears on a free spot. Drag it, or tap where it should go, then tap **Place** (or the ghost itself). **Cancel** / **Put Back** stop. Walls continue the row after each Place.
  - **Tapping:** small buttons are easier to hit by touch, and nothing stays highlighted after a tap.
  - **Screen:** holding the phone upright shows "Turn your phone sideways" and pauses the game. A full screen button sits on the title, login and pause screens; on iPhone, Add to Home Screen opens the game full screen instead.
  - **Browser:** the page no longer zooms, scrolls or pull-to-refreshes under your fingers, and How to Play shows touch controls.
- **Economy perk trees:** the Bitcoin Mine, Storage, Villager House and DJ Babyface each get 3 paths x 5 tiers in the RV Lab (60 new perks, e.g. auto-collecting mines, interest-paying storages, a gnome militia, an auto-DJ). The research window now has Defenses / Economy tabs.
- **New building: DJ Babyface**, a utility booth (Economy tab, from Village Hall 5, 5 levels).
  - Gnomes nearby work faster.
  - Defeating enemies fills its hype meter; when it's full, click the booth during a wave to Drop the Beat, and defenses in range fire much faster for a few seconds.
  - At night its light show keeps enemies in range from being restless.
  - Selecting it lights up every building in its range in purple, so you can see what it boosts.
- **New enemy: Skibidi Toilet**, a burrower in waves from Village Hall 5.
  - It tunnels underground, under your walls, to the nearest building, pops up to attack it, then tunnels on to the next.
  - Underground nothing can hit it, unless a F.L.O.C.K Tower sees it.
- **New enemy: Da Baby Car**, a raid boss mixed into every 2nd normal wave from Village Hall 6 (two from Village Hall 9).
  - It drives in a straight line for your Village Hall, smashing walls in one hit and ramming through any other building.
  - It has about 6 Tanks' health. When destroyed it bursts into a crowd of the wave's ground troops, and more of them in later waves.
  - The top bar warns you before such a wave.
- **Fixed: severe lag in late waves.** The enemies' path finder could re-check the same tiles over and over once walls got tough, so a single frame could freeze for many seconds around wave 100+. It's now exact and much faster: the worst frame at wave 128 went from about 16 s to under 30 ms.
- **Crowd cap for huge waves:** a wave never sends more than 400 enemies. Past that, each enemy is tougher instead (health, damage and rewards scaled, and they come further apart), so late waves are as hard and pay as much, with far less to draw. Wave 128: 401 enemies at ×4.55 instead of ~1,800.
  - Area damage (splash, pools, traps, quakes, Starfall, Ring of Fire, area poison and burns) hits a packed enemy about pack^0.66 times over, since it stands for a crowd. Without this, capped waves took 25-30% less damage than the crowds they replace. Tuned in simulations to within about 5% of the uncapped waves. Single-target shots are unchanged.
- **Enemy levels:** enemies show a level badge on their health bar, like buildings (dark red). It's how many times a basic one's health they have: wave 1 enemies are level 1, a packed wave-128 Grunt is about level 71.
- **Wall Breaker nerfed slightly:** its blast does 2,400 to walls (was 3,000), so Levels 7-8 take two blasts, and its radius is 1.75 tiles (was 2).
- **Wall level 8:** a lava tower is the new top wall (Village Hall 10, 3,800 HP). Wall levels now unlock at Village Hall 1, 2, 3, 5, 7, 8, 9 and 10, and walls grow clearly with level, from a thin post to a big tower.
- **Wave stars:** every wave is rated 1-3 stars by how much of your village survives (walls don't count). 3 stars pays +50% gold and RP, 2 stars +20%. The wave pill shows the rating live, and there's a new Star Collector achievement.
- **First-time tips:** the guide explains research points, wave stars, special waves, Da Baby Car, restless nights and edit mode the first time each one comes up ("Got it" / "No more tips").
- **Research tree:** tiers beyond your RV Lab's level stay hidden until it levels up.
- **New art:**
  - **Cannon:** four facings per level. It turns toward the enemy it's shooting, and looks around at random when there's nothing to shoot.
  - **Litman Mortar:** a right-facing picture per level. It faces left or right toward its target, and turns at random when idle.
  - **Storage:** three gold-fill pictures per level, switching at 1/3 and 2/3 of your max gold.
  - **DJ Babyface:** pictures for levels 2-4.
  - **Beat-ready icon:** shown over DJ Babyface when Drop the Beat is ready.
- **New sounds:** a beat-drop sound for Drop the Beat, and an ability-unlocked sound when a building gets a new ability tier. When a level-up unlocks a tier, the sound (and the "New ability!" pop) waits until the upgrade sound has finished.
- **DJ Babyface's overhead UI is cleaner:** the hype meter is a slim pill that stacks above the level chip or health bar instead of overlapping them. Between waves it only shows on hover or selection, and when it's full the beat-ready icon takes its place.
- **Cleanup:** removed leftover files from the project folder, and two unused sounds (the old dusk countdown music and tick) that were still being downloaded.
- **Docs:** [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md), a one-document overview of the project for presentations (pitch, features, numbers, architecture, engineering highlights, demo script). The README is brought up to date: touch support, waves on demand, gnome behavior, wall numbers and open questions.
- **Removed the outlines on hidden buildings:** in a packed village they covered everything. Fading and tile-first clicks still handle buildings behind others.

## 0.3.0

### RV Lab and defense abilities
- **New building: the RV Lab** (Economy tab, from Village Hall 4, 5 levels, one picture per level). A book bobs over it when research is ready, and clicking it opens its info panel, whose Research button opens the research window.
- **Ability trees for every defense:** three paths (A, B, C) of five tiers each, every tier unique to its building. Each one either covers a weakness or doubles down on a strength.
- **One pick per tier, made in the lab:** at each tier you pick Path A, B or C for a defense type, in any mix. Picks are final.
  - The pick goes straight onto every building of that type whose level is high enough (2 / 4 / 6 / 8 / 10). Lower-level buildings get it when upgraded. Nothing is bought per building.
- **Research points (RP):** earned from kills (tougher enemies give more) and by beating waves. Research costs 80 / 240 / 600 / 1,400 / 3,000 RP per tier.
- **Research window:** laid out as a skill tree, with a details panel that shows what each perk does, which of your buildings get it, and what it needs.
- **RV Lab guide:** a short follow-up tutorial with a free first research.
- **Existing villages are converted automatically** (save version 5). At each tier, the option most of a type's buildings had bought is kept, and research that isn't kept is refunded in RP.

### Day, night and waves
- **The day/night cycle runs on its own** (about 8 minutes: day 4 min, dusk 30 s, night 3 min, dawn 30 s). A sun or moon clock shows under the gold bar.
- **Start Wave works any time:** the wave attacks at whatever time it is.
- **Restless nights:** while it's dark, attacking enemies deal +25% damage and move 15% faster, but kills (and the wave's research points) pay +25%. A banner and the wave pill show it.
- **Night lighting:** enemy glows and building lights only show once it's dark.
- **New sounds:** day and night ambience replace the village music between waves and crossfade with the cycle. The attack music still plays during waves.
- **Free rebuilds:** everything destroyed in a wave is rebuilt for free when you beat it. During a wave you can still pay to rebuild a building early.

### Walls
- **Seven wall levels, one picture each**, including the new skull and lava walls. They unlock at Village Hall 1, 2, 3, 5, 7, 9 and 10.
- **New rubble** for destroyed level 6 and 7 walls.
- **Much cheaper walls:** 10 / 25 / 60 / 150 / 350 / 800 / 1,800 gold.
- Older walls keep their picture (save version 4).

### A less cluttered village
- **Clicks pick the building on the tile under the cursor first**, so tall buildings in front no longer steal clicks. A white outline shows what you're hovering.
- **See-through buildings:** buildings in front of the hovered or selected one fade to see-through.
- **Labels only when needed:** the level and tier pips are one small chip, shown only on the hovered or selected building (and in edit mode). Damaged buildings always show their health bar.
- **Ground plots:** a soft dirt plot under each building shows which tiles it uses.

### Also new
- **Profile:** a profile pill (top left) with your league, rank, achievements and lifetime stats, plus a badge for unclaimed rewards and news. Achievement sound.
- **Layout editor:** move buildings in edit mode, with a hotbar, Remove All and Save.
- **Other:** sign-up "are you human?" check (Cloudflare Turnstile), and the version label.
- **How to Play:** restructured, with pages for buildings, upgrades and the RV Lab.

## 0.2.0

- Online accounts (Supabase): login, up to 5 villages per account, achievements, leaderboard and league badges. Served from GitHub Pages at `/BrainRot-Tower-Defense/`.
