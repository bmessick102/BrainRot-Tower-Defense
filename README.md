# Italian Brainrot Tower Defense (ibtd)

A single-player base-builder tower defense for desktop browsers. You mine gold (Bitcoin), build and upgrade defenses on an isometric grid, and survive the enemy wave that attacks every night. Each night's wave matches your Town Hall level, and at max Town Hall (10) every night gets harder.

Built from [docs/BUILD_CHARTER.md](docs/BUILD_CHARTER.md) with JavaScript (ES modules), Phaser 3.90, and Vite. Players log in with email and password; their villages, achievements and the leaderboard are stored in [Supabase](https://supabase.com) (see [Online features](#online-features-accounts-villages-achievements-leaderboard)). Without a Supabase project set up, the game offers offline play with the save in the browser's `localStorage`.

## Running it

```bash
npm install        # once
npm run dev        # dev server with hot reload: open the URL it prints (…/BrainRot-Tower-Defense/)
npm test           # Vitest logic tests
npm run build      # static site in dist/ (GitHub Pages)
npm run preview    # serve dist/ locally
npm run prepare-art   # after adding or changing art in art-source/
```

**Controls:** left-click to select, collect, place, and use buttons (a mine showing its coin is collected without opening its panel; click it again, or any time the coin isn't showing, to open the panel) · drag the map to pan · scroll wheel to zoom · Esc to cancel placement, leave edit mode, or pause.

**Shop info:** every shop card has an ⓘ button that opens a popup with that building's cost, unlock level and how many you can build, its description, and its Level 1 stat bars. Clicking the card itself still buys it.

**Shop badge:** the red number on the Shop icon is how many more buildings and wall segments your Town Hall level allows. It's hidden at 0.

**Walls:** buy them in the shop's Walls tab. Each wall is a single tile (`walls.segmentLength` 1), so they fit snugly around buildings: click to place, and you stay in wall-placing mode for the next one until you press Esc or run out of gold or walls. Every two walls side by side join into one connected fence, whether in a line, at a corner, at a T or running alongside each other. Walls level up like buildings and move in edit mode. **Upgrading many walls at once:** click a wall, then "Select connected walls (N)" to select every wall of the same level joined to it (all outlined; `wallGroup()` in [src/logic/buildings.js](src/logic/buildings.js)). One "Upgrade N walls · cost" button upgrades them all. Short on gold, it upgrades as many as you can afford, nearest to the clicked wall first ("Upgrade 6 of 26"), and shows what all of them would cost. "Select one wall" goes back; selling stays one wall at a time. Walls used to be 3-tile segments: a wall now costs a third of an old segment (17 gold at Level 1, the same per tile), keeps a segment's HP, and 3x as many are allowed (24 at Village Hall 1 up to 132). Older saves are converted automatically (save version 3): each old segment becomes three walls on the same tiles, at the same level.

**Wall art:** one pillar per 2 levels, `bld_wall_lv1`–`lv5`: a rope-bound wooden post, a steel-banded post, a stone block, a riveted stone block, and a gold-trimmed block. All five are cropped to one shared box (`trim: group`), so every level keeps the same scale and baseline. Walls are drawn as one **connected wall**: each wall tile has its pillar on its center. Wherever two walls are side by side (lines, corners, T-junctions, walls running alongside each other; not diagonally), connecting pillars stand evenly between them, so neighboring pillars always overlap into a continuous wall. Thin wooden posts get 2-3 connectors and thick stone blocks 1, so pillars never stand further apart than 65% of their width (`wallLinksFor()`). Each wall draws its own pillar plus the connectors leading forward from it, layered back to front. `npm run prepare-art` measures each pillar's width and base into the generated `src/wallArtMeta.js`; see `wallParts()` / `placeWallPillar()` in [src/objects/WallView.js](src/objects/WallView.js), where `PILLAR_WIDTH` sets the on-screen size. Walls grow like buildings: 44% of a tile wide at Level 1, growing only on the levels that keep the same picture (2, 4, 6, 8, 10) in equal steps up to 60% at Level 10, so an upgrade to a new picture never jumps in size (`wallPillarWidth()`). Upgrading a wall gives the same bounce as a building. The shop card, info panel, placement ghost and swap preview all show the level's pillar. Destroyed walls show a rubble pile on their tile: broken wooden posts with rope (`bld_wall_rubble_wood`, levels 1-2) or broken stone blocks (`bld_wall_rubble_stone`, levels 3-10, since level 3 shares level 4's stone-based post), set in `WALL_RUBBLE` in WallView.js. The earlier 3-tile fence pictures are archived in `docs/archive/`.

**Moving buildings:** only in edit mode. Click the Edit Base Layout button (next to Shop), click a building to pick it up, then click a green spot to drop it. Drop it on top of one other building and the two swap places: the ghost snaps onto that building, which dims, and a ghost of it shows where it will go (your carried building's old spot, centered when the sizes differ). The swap only goes green if both fit (`planSwap` in [src/logic/buildings.js](src/logic/buildings.js)). Esc puts a carried building back; Esc again (or the Edit button) leaves edit mode. Edit mode isn't available during a wave or the tutorial, and it turns off when a wave starts.

**Deploying:** pushing to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml). It runs the tests, builds, and publishes `dist/` to GitHub Pages. `vite.config.js` sets `base: '/BrainRot-Tower-Defense/'` to match the repo name ([github.com/bmessick102/BrainRot-Tower-Defense](https://github.com/bmessick102/BrainRot-Tower-Defense)); the game is at https://bmessick102.github.io/BrainRot-Tower-Defense/.

## Folder layout

```
├── index.html               Vite entry
├── package.json             phaser (pinned) · dev: vite, vitest
├── vite.config.js           GitHub Pages base path + Vitest config
├── docs/
│   ├── BUILD_CHARTER.md     the full spec
│   ├── START_HERE.md        the AI build handoff note
│   └── archive/             the original handoff zip
├── art-source/              Cole's full-size original art (renamed to texture keys)
│   ├── buildings/  enemies/  projectiles/  ui/   (enemies/README.md says what to draw)
├── supabase/
│   └── schema.sql           database tables, security rules and leaderboard function (run once in Supabase)
├── scripts/
│   └── prepare-art.mjs      trims and scales art-source → public/assets, writes src/assetManifest.js
├── public/assets/
│   ├── images/              game-ready art: buildings/ projectiles/ ui/ map/
│   └── audio/               music_*.mp3 and sfx_*.mp3
├── src/
│   ├── main.js              Phaser config + scene list
│   ├── config.js            every balance number (from Game_Balance_Sheet.xlsx; do not hand-edit numbers)
│   ├── mapTiles.js          grass tiles, map origin, town hall spot, spawn points
│   ├── assetKeys.js         texture and sound key constants
│   ├── assetManifest.js     AUTO-GENERATED list of files present in public/assets
│   ├── audio.js             playSfx / playMusic / Music and Effects levels
│   ├── theme.js             UI colors and text styles
│   ├── logic/               pure rules, never import Phaser (iso, grid, buildings, economy,
│   │                        enemies, pathfinding, combat, waves, dayNight, tutorial, save, simulate, util)
│   ├── state/GameState.js   the one state object + event emitter + player actions + autosave
│   ├── backendConfig.js     Supabase project URL + anon key (empty = no server: offline play)
│   ├── net/                 accounts: session (villages, sync, stats), Supabase + local backends, AchievementTracker
│   ├── scenes/              Boot, Auth (login), Title, HowToPlay, Game, UI, Pause, GameOver
│   └── objects/             display wrappers: BuildingView, WallView, EnemyView, ProjectileView,
│                            RangeCircle, HealthBar, Button, Effects, ResourceBar, DayNight
└── tests/                   one Vitest file per logic module
```

Dependencies only point downward: scenes → objects → state → logic → config.

## Art and audio naming

Every asset file is named after the texture or sound key the code uses. Drop a file with the right name in, run `npm run prepare-art`, and it replaces the placeholder. No code changes needed.

| Key pattern | What it is | Example |
| --- | --- | --- |
| `bld_<type>_lv<n>.png` | Building picture *n*, used for levels 2n−1 and 2n (lv1 = levels 1–2 … lv5 = levels 9–10). A missing picture falls back to the closest lower one, then the placeholder. | `bld_townHall_lv3.png` |
| `bld_<type>.png` | Optional single model for every level | `bld_cannon.png` |
| `bld_wall_lv<n>.png` | **One wall tile** (drawn once per tile, so neighbors join up), picture *n* for levels 2n−1 and 2n. Until any wall art exists the game draws five placeholder looks (wood, stone, dark stone, steel, gold). | `bld_wall_lv1.png` |
| `bld_<type>_destroyed.png` | Rubble for one building type (currently the Town Hall and Bitcoin Storage) | `bld_storage_destroyed.png` |
| `bld_destroyed.png`, `bld_destroyed_2.png` … | Shared rubble for every building without its own (mines and all defenses; walls keep their own tile). Each destruction picks one of the variants at random; add `bld_destroyed_3.png` etc. for more. | `bld_destroyed_2.png` |
| `enemy_<kind>.png` | Enemy sprite | `enemy_grunt.png` |
| `proj_<kind>.png` | Projectile | `proj_arrow.png` |
| `ui_<name>.png` | HUD / menu art | `ui_shop_button.png` |
| `music_<name>.mp3` | Looping music | `music_village.mp3` |
| `sfx_<name>.mp3` | Sound effect (full list in [src/assetKeys.js](src/assetKeys.js)) | `sfx_wave_clear.mp3` |

Building types in code are `townHall`, `mine`, `storage`, `cannon`, `archer`, `mortar`, `wizard`, `firework`, `wall`. Players see these names (from `name` in [src/config.js](src/config.js)):

| In-game name | Code type |
| --- | --- |
| Village Hall | `townHall` (level requirements read "Requires VH3") |
| Bitcoin Mine | `mine` |
| Bitcoin Storage | `storage` |
| Cannon | `cannon` |
| Locklair Tower | `archer` |
| Litman Mortar | `mortar` |
| Gandolf Tower | `wizard` |
| Firework Launcher | `firework` (anti-air only; unlocks at VH3, max 1 / 2 / 3 at VH3 / VH5 / VH8) |
| Wall | `wall` |

**Quick bar** (click a building): a compact strip at the bottom, left of the Edit and Shop buttons, with the building's name and level, its Upgrade button (or Rebuild when destroyed), a "Select all N" toggle for connected walls, and Info. It moves up above the tutorial guide while the guide is showing. The full panel below opens from the Info button (clicking the selected building again does nothing). A newly selected building always starts with the bar (`refreshQuickBar()` in [src/scenes/UIScene.js](src/scenes/UIScene.js)). Mines still collect on the first click while their coin shows.

**Building panel** (the quick bar's Info button): name, level out of 10, and two tabs. **Info** shows the building's description (edit them in [src/buildingText.js](src/buildingText.js)). **Stats** shows a bar for each stat that grows with level (HP, damage, production, capacity). A full bar is the level 10 value, a lighter segment and a green `+N` show what the next upgrade adds, and lost HP is dimmed. Fixed traits (range, fire rate, targets, splash) are listed under the bars. Upgrade, Sell, and Repair stay at the bottom; Sell hides while enemies are attacking.

Sounds live in `public/assets/audio/`, named by key (no prep needed beyond `npm run prepare-art` to refresh the manifest):

| File | Plays when |
| --- | --- |
| `music_title.mp3` | Title screen (loops) |
| `music_village.mp3` | Daytime (loops) |
| `music_planning.mp3` | The 30 s wave countdown at dusk: the village music hands over to it, it plays once (paused with the pause menu, resumed at the matching point on Continue), and it ends as the wave hits |
| `music_attack.mp3` | Night fights; crossfades in when enemies attack and back to the village music at dawn |
| `sfx_wave_countdown.mp3` | Dusk: a wave is announced |
| `sfx_wave_clear.mp3` | A night's wave is beaten |
| `sfx_game_over.mp3` | The Town Hall is destroyed |
| `sfx_ui_click.mp3` | Any button or shop card |
| `sfx_building_select.mp3` | Clicking a building (or picking one up in edit mode) |
| `sfx_invalid.mp3` | Trying to place or drop a building on a red spot |
| `sfx_coin_collect.mp3` | Collecting from a Bitcoin Mine |
| `sfx_mousetrap_snap.mp3` | A Mousetrap springs |
| `sfx_neegy_hit.mp3` | A Neegy punches a building |
| `sfx_shark_voice.mp3`, `sfx_grunt_voice.mp3` | "Tralalero tralala" / "Tung tung tung sahur": every 6-14 s while a Sneaker Shark or Grunt is on the map, one of them says its line (random kind among those present, never two at once; `ENEMY_VOICE`, `enemyChatter()` in GameScene) |
| `sfx_ra_beam.mp3` | Loops while any Tower of Rah beam is burning (louder at each heat stage, fainter off screen; `BeamHum.js`) |
| `sfx_ra_heat_up.mp3` | A Tower of Rah beam heats up a stage (x3, then x8) |
| `sfx_repair.mp3` | Paying to rebuild a destroyed building (not the free dawn wall rebuilds) |
| `sfx_upgrade.mp3` | Upgrading a building, and placing a new one bought from the shop |
| `sfx_cannon_fire.mp3` / `sfx_arrow_fire.mp3` / `sfx_mortar_fire.mp3` / `sfx_wizard_fire.mp3` | That tower fires |
| `sfx_mortar_travel.mp3` | The Mortar shell whistling through the air. It's started partway in so it ends exactly as the shell lands: launch boom → whistle → impact. |
| `sfx_wizard_voice_1.mp3`, `sfx_wizard_voice_2.mp3` | Gandolf speaks as he throws a fireball (one line at random, never over a line still playing). Add `_3` etc. to the `wizardVoice` list in [src/assetKeys.js](src/assetKeys.js) for more. |
| `sfx_mortar_impact.mp3` / `sfx_wizard_impact.mp3` | A Litman Mortar shell / Gandolf fireball lands |
| `sfx_building_destroyed.mp3` | A building is destroyed |
| `sfx_enemy_small_hit.mp3` | A Grunt, Sneaker Shark or Money Stealer strikes a building or wall (at most 4 at once) |
| `sfx_enemy_big_hit.mp3` | A Tank strikes a building or wall (at most 4 at once) |
| `sfx_shark_jump.mp3` | A Sneaker Shark or Money Stealer leaps onto a wall |
| `sfx_breaker_deployed.mp3` | The first Wall Breaker of a wave appears (once per wave) |
| `sfx_breaker_blast.ogg` | A Wall Breaker blows itself up |
| `sfx_bomber_bomb_impact.mp3` | A Bomber's bomb lands (a 7.6 s rumble; at most 3 at once) |
| `sfx_bomber_flying.mp3` | Plane drone while any Bomber is in the air (one shared loop, fades in and out; louder with more Bombers and when they're on screen) |
| `sfx_enemy_eliminated.mp3` | An enemy dies, at 60% volume (kills in the same instant play once; at most 4 at once) |

Still silent until a file is added: `sfx_place` (placing a building), `sfx_sell`, `sfx_hit` (any enemy hit), `sfx_wave_start` (the fight begins). Slingers have no hit sound of their own yet: add one to `ENEMY_ATTACK_SFX` in [src/assetKeys.js](src/assetKeys.js).

### The map

The map lives in `public/assets/images/map/`. The prep script doesn't touch these; edit them in place.

- `game_map_grid.png` (1672 × 941) is the daytime map and `game_map_grid_night.png` is the night version. They must stay pixel-aligned with each other. The original 2102 × 1182 map pair is in `docs/archive/`.
- `ui_title_background.png` (1672 × 941, shown at 1280 × 720) is the main menu background, with the game logo painted in. Older versions are in `docs/archive/` (`ui_title_background_v1`–`v5`).
- The browser tab icon (`public/favicon-32.png`, `favicon-192.png`), the iPhone home-screen icon (`apple-touch-icon.png`), and the link-share preview (`og-image.png`, 1200 × 630) are made from the game logo, `docs/branding/Italian_Brainrot_TD_Logo.png`, and linked in `index.html`.
- The night map fades in at dusk; see "Days, nights, and waves" below.
- The expanded map holds the original clearing at 67.25% size. The game draws it at **2486 × 1399 world pixels** (1.487×), so tiles stay 64 × 32. In [src/mapTiles.js](src/mapTiles.js), `imageWidth` / `imageHeight` are that drawn size and `originX` / `originY` (1186, 134) is the top corner of tile (0, 0) in world pixels. The tile list and spawn points didn't change.
- **If the map art changes again,** keep the clearing in the same place and at the same size within the image. Otherwise the grid and the painted checkerboard stop lining up, and `mapTiles.js` needs re-measuring.
- The camera never shows past the map's edge. The furthest zoom-out is whichever is larger: `camera.minZoom` in config (0.5), or the zoom where the map exactly fills the 1280 × 720 view. With the current map that's 0.515×.

## Days, nights, and waves

The day/night clock is a game rule ([src/logic/dayNight.js](src/logic/dayNight.js)), and enemies attack at night:

| Phase | Length | What happens |
| --- | --- | --- |
| Day | `dayNight.daySeconds` (120 s) | Build, collect, upgrade. The HUD shows `Nightfall in 1:23 · Wave 2`. |
| Dusk | `rules.waveCountdown` (30 s, the length of `music_planning`) | Tonight's wave is announced, the combat planning music plays, a pulsing red "!" appears over each entrance enemies will come from, and the night map fades in. You can still build. The Retry checkpoint is saved here. |
| Night | until the wave is cleared | Enemies attack. Shop, edit mode, upgrades, selling, and collecting from mines are locked (mines keep filling; their coin is hidden, and clicking one just selects it). |
| Dawn | `dayNight.dawnSeconds` (15 s) | Wave-cleared banner (it says how many buildings need rebuilding), damaged buildings heal and broken walls come back for free, autosave, fade back to day. Destroyed buildings stay in ruins. |

- **Which wave comes:** the one matching the Town Hall level (TH1 → wave 1 … TH9 → wave 9). Waves 1–4 come from `config.waves`; waves 5+ use the growth formula. At TH10, every night survived adds one (wave 10, 11, 12 …). Upgrading the Town Hall no longer starts a wave; it only unlocks buildings and raises the next night's wave.
- **The ruined Village Hall (level 0):** every new game starts with the hall in ruins (`CONFIG.townHall.ruin`, art `bld_townHall_lv0`). Nothing can be built, no gnomes live there, the clock and the Start Wave button wait, and the HUD says "Rebuild your Village Hall to begin". Rebuilding it to level 1 costs 100 (`townHall.levels[0].upgradeCost`); starting gold is 250, so the first Mine (150) is still affordable. Tutorial step 1 is "This is your Village Hall, but it lies in ruins! Click it and rebuild it to Level 1", and the guide points at the hall, then at its Rebuild button. Skip tutorial is offered on steps 1-2: skipping with the hall still in ruins gives the starter base and exactly 100 gold to rebuild it; skipping after rebuilding keeps the hall and your gold.
- **Tutorial:** the clock stays at day until the Cannon is placed. Then night falls right away for wave 1, and the last step teaches the Town Hall upgrade. Skipping the tutorial starts the clock at morning.
- **Stalled waves enrage** ([src/logic/enrage.js](src/logic/enrage.js), `rules.enrage`): 90 s after a wave's last enemy spawns, the banner says "The enemies grow restless!", the HUD adds "Enraged!", and the remaining enemies glow red. Their damage (melee hits and ranged shots) climbs by 1x and their speed by 0.5x every 30 s, up to 5x damage and 2x speed, so no wave can last forever.
- **Losing a night:** Retry rewinds to the base as that night's dusk began, then gives `dayNight.graceSeconds` (120 s) of daytime before the same wave returns, so you can rebuild instead of looping straight back into it. A banner says how long you have.
- **Saves** store the clock. Continuing a game saved at dusk replays that night from the start of dusk.
- **Visuals** ([src/objects/DayNight.js](src/objects/DayNight.js), [src/objects/BuildingView.js](src/objects/BuildingView.js)): night map crossfade, moonlit tint, and colored light pools around buildings. The tint and light settings are constants at the top of those files.

## Walls and pathfinding

- Ground enemies ([src/logic/pathfinding.js](src/logic/pathfinding.js)) pick their target as before (the nearest building; **walls are never a target**). Then they follow the cheapest route across the tile grid. Open ground costs 1 per tile. A standing wall adds `maxHP × pathing.wallCostPerHp`, and another building adds `maxHP × pathing.buildingCostPerHp + pathing.buildingExtraCost`. So enemies walk around a wall when the detour is cheaper and smash through when the base is sealed or the detour is long. Higher-level walls are worth longer detours.
- When the cheapest route goes through a wall, the enemy walks up to it and attacks it until it breaks. Destroyed walls and buildings are rubble that can be walked over. Walls are rebuilt for free at dawn; other destroyed buildings stay in ruins until rebuilt (see Villager Houses and ruins below).
- **Spawning:** enemies appear at the map edge where each dirt path runs off-screen (`MAP.edgeSpawnPoints` in mapTiles.js). Ground troops march down the path to its entrance (`MAP.spawnPoints`, where the "!" markers are), then pathfind from there. Bombers fly straight in. The longer walk adds a few seconds before each wave reaches the base. Enemies arrive spread out, up to 2 tiles from the corner (`SPAWN_JITTER`), and ground troops funnel down to 0.75 tiles as they reach the path entrance (`ENTRY_SPREAD`). Each wave picks its corners at random from all 4: Waves 1–2 use 1 corner (Wave 1 is always the top, for the tutorial), Waves 3–6 use 2, Waves 7–8 use 3, and Wave 9 onward uses all 4.
- **Corner fog:** soft fog puffs drift in each corner of the screen, day and night, under the HUD (`buildFog()` and `FOG` in [src/scenes/UIScene.js](src/scenes/UIScene.js); the puff texture is `fx_fog`, drawn in BootScene).
- Bombers fly straight over walls.
- **Sneaker Shark** (`shark`, `jumpsWalls: true` in config): a fast raider (HP 180, speed 1.3, 18 damage) that **leaps over walls** instead of walking around or breaking them. It paths as if walls were open ground and hops in a quick arc while crossing one. Other buildings still block it, and every ground defense can hit it. It first appears in wave 3 (3 sharks, then 5 in wave 4; later waves grow by the endless formula).
- **Money Stealer** (`thief`, art `enemy_thief`): a fast, fragile gold raider (HP 60, speed 1.4, 10 base damage, bounty 8). It targets only Bitcoin Mines and Storages (`prefers` in config), whichever is nearest, and ignores everything else until all of them are destroyed. It hits those buildings 3x as hard (30 per hit, `preferredDamageMultiplier`), and since hits on a Storage drain gold, it also steals gold quickly. Against anything else it deals 0.4x (4 per hit, `otherDamageMultiplier`). It **hops over walls** like the Sneaker Shark (`jumpsWalls: true`), so walls don't stop it: defenses have to. It also **spawns invisible** (`invisibleUntilJump: true`): defenses can't aim at it (`isValidTarget` in [src/logic/combat.js](src/logic/combat.js)) until its first wall jump, or its first hit on a building if no wall is in the way (`revealEnemy`, event `enemyRevealed`). Splash and Diddypult pools aimed at other enemies still hurt it, and taking damage doesn't reveal it. While invisible it's drawn at about 38% opacity with a faint shimmer; when revealed it pops to full opacity with a white puff. How to Play shows an Invisible tag and "Hit by 5 of 6 defenses once revealed". Waves: 3 in wave 2, 5 in wave 3, 6 in wave 4, then the endless formula. Logic: `pickTarget()` / `enemyDamageVs()` in [src/logic/enemies.js](src/logic/enemies.js).
- **Wall Breaker** (`breaker`, "Boneca Ambalabu", art `enemy_breaker`): runs for the nearest wall (`prefers: ['wall']`), even past closer buildings. With no walls standing it goes for the nearest defense (`thenPrefers: ['defense']`), then anything. On reaching its target it blows itself up (`explodes`, `explode()` in [src/logic/combat.js](src/logic/combat.js)). It also blows up wherever it dies when shot down, breaking any walls and hurting any buildings within reach. The blast hits every building and wall within 2 tiles (`blastRadius`): walls take 50 x 60 = 3,000, enough for any wall up to Level 10 in one blast, and buildings take 50. Blowing itself up gives no bounty; shooting it down pays the usual 10. The blast is drawn by `breakerExplosion()` in [src/objects/Effects.js](src/objects/Effects.js): a white flash, a billowing fireball, flying dirt and stone, a shockwave ring, rolling smoke, a stronger camera shake, and a scorch mark that fades after about 4 s. Stats: 90 HP, speed 1.2, bounty 10. Waves: 2 in wave 3, 4 in wave 4, then the endless formula; each queue sends them right after the Tanks so they reach the walls first. Sounds: `sfx_breaker_deployed.mp3` once per wave when the first Wall Breaker appears, and `sfx_breaker_blast.ogg` on each blast (at most 4 at once). The blast is an `.ogg`, which some Safari versions can't play; an `.mp3` copy would fix that.
- **Neegy Balloon** (`balloon`, art `enemy_balloon`): a slow flyer (700 HP, speed 0.8, bounty 30) that never attacks and only goes after **defenses**: the nearest **air defense** (one that can shoot flyers: Locklair Tower, Gandolf Tower, Firework Launcher; the `airDefense` target token) first, then any defense. Over its target it hovers 0.8 s, drops 2 Neegies just outside the footprint (`perDrop`), then drops 2 more every 4 s (`dropInterval`) until that target is destroyed, then moves to the next. With no defenses left it goes for the nearest building of any kind the same way; only with nothing left at all does it drift away for 3 s and pop (`balloonPopped`, no bounty). Destroyed by anything, it pays its bounty and drops 2 more Neegies where it falls (`deathDrop`, handled in `removeDeadEnemies()`). It floats higher than other flyers and makes no plane hum. Waves: 1 in wave 3, 2 in wave 4, then the endless formula; each queue sends them last.
- **Neegy** (`neegy`, art `enemy_neegy`): the balloon's paratrooper (180 HP, speed 1.1, 24 damage, bounty 7). It floats down for 0.7 s, then attacks the nearest air defense at 2x damage (1x against anything else). Never in a wave's queue; How to Play shows "From Neegy Balloons". Logic: `stepBalloon()` / `dropTroops()` in [src/logic/enemies.js](src/logic/enemies.js).
- **Attack and death poses:** enemies with `enemy_<kind>_attack.png` / `enemy_<kind>_death.png` in `art-source/enemies/` (Grunt, Sneaker Shark, Tank and Money Stealer so far; the Neegy has an attack picture) switch to the attack picture for 0.32 s on each hit. When they die, they leave the death picture where they fell for about a second before it fades. Pictures can face either way: the ones drawn facing left are listed in `FACES_LEFT` in [src/objects/EnemyView.js](src/objects/EnemyView.js), so every pose faces where the enemy is going. Add a new pose by dropping the file in with that name and running `npm run prepare-art`; add its key to `FACES_LEFT` if it faces left.
- **No stacking:** each enemy has a body `radius` (in `config.enemies`), and overlapping enemies push apart a little each step. Ground troops and Bombers are spaced separately, since flyers pass over walkers. Attackers fan out around a building instead of piling on one spot, and a push never shoves a ground troop into a building or wall.
- Routes are computed once per target and reused by every enemy heading there. They're rebuilt only when a building or wall changes. About 160 enemies take under 1 ms per game step.

## Online features (accounts, villages, achievements, leaderboard)

**What players get:** a login screen (Log In / Sign Up tabs; sign-up asks for a username, email and password). A saved login skips the screen. The title screen shows who's signed in (with Log Out) and START GAME plays the current village. Its button row:
- **Villages:** up to 5 villages per account (`MAX_BASES`), each with its own progress, picture, wave and best wave. Play one, make a New Village (named; starts from the tutorial), or Delete one (asks first; achievements and leaderboard rank stay). On the first login, a browser that still has a village saved from before accounts offers to **import** it (the original stays in the browser; a Villages button offers it later too).
- **Achievements:** 25 achievements in three tabs (Village, Battle, Builder), earned once per account across all its villages. Each pays a one-time gold reward, claimed from the Pause menu's Achievements window into the village being played (it has to fit in storage, and not during a wave). The list is in [src/logic/achievements.js](src/logic/achievements.js); unlocking shows a toast in game (`sfx_achievement.mp3` if present, else the wave-clear sound).
- **Leaderboard:** the top 10 players by furthest wave survived (one row per player, ties go to whoever got there first), with the player's own rank added if lower.
- **Leagues:** every player's furthest wave puts them in a league with its own badge: Bronze (wave 1+), Silver (4+), Gold (7+), Crystal (10+), Champion (15+), WarLord (25+) (`LEAGUES` in [src/logic/leagues.js](src/logic/leagues.js); art `ui_league_<key>.png` in art-source/ui). The badge shows on each leaderboard row, beside your name on the title screen, and the leaderboard footer says what the next league takes. Reaching a new league shows a "New league!" toast in game.

**How it fits together:**
- [src/net/session.js](src/net/session.js): the account while the game runs. `session.storage` is the Storage the game saves through (`setGameStorage` in GameState.js): with a village open, `ibtd.save` / `ibtd.checkpoint` read and write that village. Changes are kept in memory, mirrored to `localStorage` (`ibtd.cloud.<id>`) and uploaded 1.5 s later (Pause → Save uploads right away). A change that never reached the server (tab closed, offline) is recovered from the mirror at the next login. Stats, earned achievements and claims queue in `ibtd.outbox.<user>` the same way.
- [src/net/AchievementTracker.js](src/net/AchievementTracker.js): listens to game events (kills, traps, beams, waves, mines, upgrades), bumps counters, records the furthest wave / best Village Hall, and awards achievements.
- [src/net/supabaseBackend.js](src/net/supabaseBackend.js) talks to Supabase; [src/net/localBackend.js](src/net/localBackend.js) is a stand-in that keeps accounts in the browser. The dev server uses it while there are no keys (or with `?backend=local`), so everything can be tried without a server. It's never used in a build.
- Scenes / windows: [AuthScene](src/scenes/AuthScene.js) (login), [VillagesWindow](src/objects/VillagesWindow.js), [AchievementsWindow](src/objects/AchievementsWindow.js), [LeaderboardWindow](src/objects/LeaderboardWindow.js), [Modal](src/objects/Modal.js) (window + confirm / name prompts), [TextField](src/objects/TextField.js) (HTML text boxes over the canvas; `dom.createContainer` in main.js).

**Setting up Supabase (once):**
1. Create a free project at [supabase.com](https://supabase.com) (any name, e.g. "italian-brainrot-td"; pick a region near your players; save the database password somewhere).
2. **SQL Editor → New query:** paste all of [supabase/schema.sql](supabase/schema.sql) and press **Run**. It creates the tables, the leaderboard function, and the security rules (each player can only touch their own villages, stats and achievements; the leaderboard shows usernames only, never emails).
3. **Authentication → Sign In / Providers → Email:** keep Email enabled and turn **Confirm email** off, so players can play right after signing up. (If you leave it on, sign-up says "check your email to confirm, then log in".)
4. **Project Settings → API** (or the **Connect** button): copy the **Project URL** and the **anon / publishable** key into [src/backendConfig.js](src/backendConfig.js). Both are safe to publish: the security rules decide what they can do. Never paste the `service_role` / secret key.
5. Commit and push. The deployed game now requires a login.

## Saving

Logged in, each village's save and checkpoint live in Supabase (`bases` table) with a copy on the device (see Online features); the keys below are what the game itself reads and writes, redirected into the open village. Offline, they're plain `localStorage` keys: `ibtd.save` (current game), `ibtd.checkpoint` (the base as dusk falls, before that night's wave; used by Retry), `ibtd.settings` (Music and Effects volume, 0-1; an older single `volume` seeds both). Saves never happen while enemies are on the field. The format is version 2 (adds the clock); version 1 saves are converted when loaded. In the browser console on the dev server, `window.__IBTD__` is the running Phaser game. It doesn't exist in production builds.

## Changes from the charter (approved)

- **10 levels, a new picture every two levels** (charter: 5 levels, one model): buildings and the Town Hall go to level 10, and each of the 5 pictures covers two levels. Levels 6–10 extend the sheet's growth (costs ×2, HP/damage ×1.25, storage capacity ×1.5, mine output on its curve), and building limits continue the same pattern. Every cost fits within the gold you can store at the Town Hall level that unlocks it. **These numbers aren't in Game_Balance_Sheet.xlsx yet.**
- **Waves come at night** (charter §10: one wave per Town Hall upgrade, then a Next Wave button): see "Days, nights, and waves". The Next Wave button is gone, and the tutorial now ends with the first night instead of a Town Hall upgrade.
- **Music** (charter §15 says no music): title and village music loop, and the wave intro, win, and loss tracks play as effects. Music is mixed under sound effects. Settings (home screen) and the pause menu have separate Music and Effects sliders.
- **HUD layout** (charter §12 puts gold top left and Pause top right): the gold bar is in the **top right**, and the Settings/Pause icon sits just above the Shop icon in the bottom right.
- **Gold resource bar** (charter §12 shows `450 / 1,500` with a thin bar): a large bar that fills with gold ÷ capacity. The amount is shown in the bar with spaced digits (`1 500`), `Max: 1 500` sits above it, and the Bitcoin coin caps the right end. It's [src/objects/ResourceBar.js](src/objects/ResourceBar.js); pass different colors and an icon to reuse it for another resource.
- **Buildings drawn smaller than their footprint:** every building picture is 75% of its footprint's width (Mortar 65%, Cannon 63%, Firework Launcher 52%, since their art is bulkier), centered in its tiles so it sits inside them with grass around it (`DEFAULT_SPRITE_SCALE` / `SPRITE_SCALE` in [src/objects/BuildingView.js](src/objects/BuildingView.js)).
- **Buildings grow as they level up:** on top of that, a building is drawn at 95% of its size at Level 1 and 110% at its top level, but it only grows on upgrades that keep the same picture. A new picture already looks bigger, so on those upgrades the size holds. With art every 2 levels that's 95 / 98 / 98 / 101 / 101 / 104 / 104 / 107 / 107 / 110% for Levels 1–10, and 95 / 100 / 100 / 105 / 105 / 110% for the 6-level Diddypult (`LEVEL_SIZE` / `levelSizeFactor()` in BuildingView). Walls stay the same size. Every upgrade still plays the grow pop (`growPop()`): from the old size, swelling a little past the new one, then settling.
- **Firework Launcher:** anti-air only. Each rocket (90 damage at Level 1, fires every 1.5 s, range 7.5) bursts among flyers and damages every one within 1 tile; it can never hit ground enemies. It's fragile (250 HP at Level 1) and limited to 1 / 2 / 3 at Village Hall 3 / 5 / 8. Rockets trail sparks and burst into colored stars in the air (`attachRocketFx` / `fireworkBurst` in Effects.js) with a red area ring on the ground. Sounds: `sfx_firework_fire.mp3` on launch, and `sfx_firework_impact.mp3` (a 6 s lingering crackle) when a rocket bursts. At most 3 crackles play at once so a busy night stays listenable. Art: `bld_firework_lv1`–`lv5`. Its levels aren't in the balance sheet yet.
- **The Diddypult** (internal key `catapult`): a long-range lobber, ground only. Range 16 with a dead zone of 6 (the Mortar is range 10, dead zone 3). It fires every 5 s, and the shot (a bottle of baby oil, 1.8 s flight) lands for light damage (20 at Level 1) within 1 tile. It then leaves a **pink pool** 3 tiles wide for 5 s. Every 0.5 s the pool damages ground troops standing in it (8 per second at Level 1, rising to 24 at Level 6) and slows them by 25% while they're in it (`createPool` / `stepPools` in [src/logic/combat.js](src/logic/combat.js), drawn by [src/objects/PoolView.js](src/objects/PoolView.js)). Overlapping pools stack their damage but not their slow. Flyers are never affected. It unlocks at Village Hall 5, you can only build 1, and it has **6 levels** (3 pictures, art every 2 levels; size growth reaches 110% at Level 6). Art: `bld_catapult_lv1`–`lv3`, cropped with one shared box like the Cannon (scale 66%). Sounds: `sfx_catapult_fire.mp3` on the throw, `sfx_catapult_impact.mp3` when the shot lands, and `sfx_catapult_pool.mp3`, a sizzle that fades in with each pool and out as it dries up (at most 2 at once).
- **Tutorial guide:** the guide character is `art-source/ui/guide_portrait.png` (texture `guide_portrait`), drawn as a bust beside the speech bubble.
- **Night visibility:** at night, buildings and enemies get only a light moonlit tint (`NIGHT_TINT` in DayNight.js), so the darker night map does the darkening. Every enemy also carries a soft warm glow (`NIGHT_GLOW_*` in EnemyView.js), so troops stand out in the dark.
- **Draw order:** anything walking past a building's front face (gnomes, enemies) draws in front of it instead of disappearing behind the building art ([src/objects/depth.js](src/objects/depth.js)).
- **Tower of Rah** (`ra` in `CONFIG.defenses`, art `bld_ra_lv1`-`lv4`, one picture per 2 levels, 8 levels; logic in [src/logic/beams.js](src/logic/beams.js)): a beam tower like the Inferno Tower. It locks onto the enemy with the most current HP in range (6 tiles, ground and air, not invisible ones) and keeps burning it until it dies or leaves range. Damage heats up the longer it stays on one enemy: x1, then x3 after 2 s and x8 after 5 s (`stages`), back to x1 on a new target. Base damage is 20/s at level 1 up to 70/s at level 8 (so 160 to 560/s at full heat), dealt in 0.2 s ticks. The beam is drawn from the head on top of the tower to the middle of the target's body, thin orange, then thicker red, then white-hot (`drawBeams()` in GameScene). Small orange "N/s" numbers show the current burn. Unlocks at Village Hall 6, 5,000 gold doubling each level, HP like the Mortar, 1 allowed from VH6 and 2 from VH9. Each heat-up plays `sfx_ra_heat_up.mp3` (event `beamHeatUp`, at most 2 at once).
- **Mousetrap** (`mousetrap` in `CONFIG.defenses`, art `bld_mousetrap_lv1`-`lv5`, one picture per 2 levels; logic in [src/logic/traps.js](src/logic/traps.js)): a hidden 1-tile trap. Enemies can't see it, so they never target it, never path around it, and walk right over it; it can't be damaged, even by Wall Breaker blasts. The first ground enemy to step onto it springs it: every ground enemy within 1.5 tiles takes its damage (150 at level 1 up to 700 at level 10) and is held in place, unable to move or attack, for its hold time (3 s up to 4.5 s). There's a "SNAP!", a ring and a jolt. Flyers never trigger it and are never caught. Once sprung it stays sprung (shown darkened) for the rest of the wave and resets when the wave is cleared. Unlocks at Village Hall 2, costs 300 doubling each level, up to 1/2/2/3/3/4/4/5/5 from VH2 to VH10, in the shop's Traps tab (every defense with `trap: true` goes there). Its snap sound is `sfx_mousetrap_snap.mp3` (at most 3 at once).
- **F.L.O.C.K Tower** (`flock` in `CONFIG.defenses`, art `bld_flock_lv1`-`lv5`, one picture per 2 levels, sharing one crop box; logic in [src/logic/flock.js](src/logic/flock.js)): a support defense that never attacks, standing on a single tile (`size: 1`; drawn a little wider than the tile). Every enemy (ground or air) within its range is **marked**, shown by a red eye over its head, and takes extra damage from every defense: projectiles, splash and Diddypult pools (`damageEnemy`). Invisible enemies (Goyum Goblins) that enter its range are **revealed** for good. Towers don't stack: a marked enemy takes the strongest bonus among the towers covering it. Range 6 tiles at level 1 up to 8.5 at level 10 (each level has its own `range`), bonus +15% up to +35% (`markBonus`). Unlocks at Village Hall 3, costs 700 doubling each level, HP like the Wizard, up to 1/1/1/2/2/2/3/3 from VH3 to VH10. It sits in the Defenses tab and counts as a defense (Wall Breakers go for it after walls), but How to Play's "Hit by X of N defenses" leaves it out. During attacks each tower sends a faint blue scan ring out to its range every 2.6 s. When an enemy enters a tower's range while it was empty, the tower plays its alert, `sfx_flock_spotted.mp3` (event `flockSpotted`, at most 2 at once). In the shop it comes right before the Diddypult.
- **Villager Houses** (`house` in config, art `bld_house_lv1`-`lv5`: the five workshop pictures, ordered plainest to fanciest, one per 2 levels, sharing one crop box): 2x2, 10 levels, cost 200 doubling each level, HP like a Mine, up to 1, 1, 2, 2, 3, 3, 4, 4, 5, 5 per Village Hall level. Odd levels add a gnome (1, 1, 2, 2, 3, 3, 4, 4, 5, 5 gnomes) and even levels make every gnome in the house better (`gnomeMine` / `gnomeRepair` in each level of `CONFIG.house.levels`). All gnomes live in houses; the Village Hall has none of its own. Every gnome has a job ([src/logic/villagers.js](src/logic/villagers.js), tuned in `CONFIG.villagers`):
  - **Gnome levels:** a gnome's stats come from its house's level and rise on even levels only, in 5 steps (gnome level 1-6, shown on the gnome card): mining 25%, 30%, 36%, 41%, 47%, 52% of the mine's rate into its sack, and repairs 2%, 2.5%, 2.9%, 3.4%, 3.8%, 4.25% of max HP per second. The gnome card shows what the next upgrade adds in green: +1 gnome on odd levels, better stats on even ones.
  - **Gnome card:** the house Info tab shows a Gnome Worker card under the description (the gnome on a showcase tile, how many live here with the next level's extra in green, and what each gnome does), drawn by `drawGnomeCard()` in [src/scenes/UIScene.js](src/scenes/UIScene.js).
  - **By day** each gnome works a Bitcoin Mine (at most 2 per mine; jobs go one gnome per mine first, each to the free gnome whose home is closest; leftovers wander). The mine still fills its own stock at its normal rate for you to click. On top of that, each working gnome mines its own extra gold (25% of the mine's rate at gnome level 1, more at higher levels) into a sack. After 20 s of work (`sackSeconds`) it carries the sack, with a coin bobbing over its head, to the nearest standing Storage or Village Hall, adds the gold there with a "+N" pop, and walks back. Trips are timed in the game rules (`stepGnomeMining()`, distance x 1.25 at 0.7 tiles/s), and gold over your limit is lost as with any collect. A gnome sent home mid-trip keeps its sack for the next day. The mine's Stats tab shows its workers.
  - **During an attack** gnomes rush out and repair damaged buildings (not walls, not ruins), most damaged first, at most 2 per building, each restoring 2% of the building's max HP per second at gnome level 1 (more at higher levels), with a green "+" now and then. A building hit within the last 3 s is **under fire** (`villagers.repairDelayAfterHit`): gnomes wait 1.5 tiles back and don't repair it until the shooting stops, and quiet buildings are repaired first. So an attack always makes progress (a lone ranged enemy out of every defense's reach can't be out-repaired forever). Gnomes with nothing to repair stay inside. Enemies ignore gnomes.
  - **Evenings** (10 s before dusk and during the countdown) everyone goes home to their own Villager House (`gnomeShelters()`). The Village Hall is only a shelter for gnomes whose house is destroyed.
  - **If a house is destroyed** its gnomes stop working, run to the Village Hall and hide there until the house is rebuilt.
- **Economy safety net** (so a ruined base can always recover): the Village Hall makes its own gold, 1 gold/s at level 1 plus 0.5 per level (5.5/s at level 10; none while it's the level 0 ruin), day and night, paid straight into gold in batches of 5 with a small "+5" over the hall (`rules.hallIncome`, `produceHallIncome()`). And at dawn, if no Bitcoin Mine is standing and you can't afford to rebuild even the cheapest destroyed one, the gnomes rebuild that one for free and a banner says "Your gnomes salvaged a Bitcoin Mine!" (`salvageMine()`).
- **Ruins and rebuilding:** destroyed buildings no longer come back at dawn. Damaged ones still heal for free, and broken walls are rebuilt for free. Anything else stays rubble (no production, no shooting, its gnomes displaced) until you click it and pay **Rebuild**: 30% of its current level's cost (`rules.rebuildCostShare`), any time, day or night. Ruins are saved with the game.
- **Projectile paths** ([src/objects/ProjectileView.js](src/objects/ProjectileView.js)): shots are drawn leaving their shooter's muzzle and arriving at the middle of their target, blending between the two over the flight. Muzzles: `MUZZLE`, a share of each tower picture's height (cannon barrel, top of the archer / wizard towers, and so on); an enemy's body; a bomber's belly. Targets: an enemy's body however high it floats (the Neegy Balloon included), or a building's walls. Mortar and Diddypult lobs still arc and land on the ground. A shot that starts within a tile of its target (a balloon hovering over the tower that's shooting it) begins partway along so it still visibly reaches the body. Damage numbers pop up over the enemy's body too.
- **Gnome villagers** ([src/objects/Villagers.js](src/objects/Villagers.js), art `art-source/villagers/villager_gnome.png`): decoration only, so enemies ignore them. Gnomes come only from Villager Houses (none at the start); they spread out over the village by day. Each gnome has its own direction from the hall (evenly spaced, reshuffled each morning) and wanders 2.5–11 tiles out that way, picking spots away from where the other gnomes are and are headed. They follow tile paths around buildings (no cutting corners) and hop over walls with a little jump, though they never stop on one. A wall tile costs as much as 3 tiles of walking (`WALL_HOP_COST`), so they still walk around a short wall when that is about as quick. They ease apart when they get within 1.2 tiles, and step out of the door at slightly different places. 10 s before dusk they hurry home (the Village Hall or their house) and go inside; at dawn they come back out one by one. Tuning is in `VILLAGER_SETTINGS` at the top of that file.
- **Wizard fireball effects:** the fireball glows (bright outline, pulsing halo, white-hot core) and trails gold, orange, and purple sparks. It stays full-bright at night. On landing: a white-hot flash, a spark burst, rising embers, and a purple shockwave ring at the splash radius (`attachFireballFx` / `fireballImpact` in [src/objects/Effects.js](src/objects/Effects.js)).
- **Click effect:** clicking a building makes it squash and spring back while two gold rings ripple out from its footprint (`pop()` in BuildingView).
- **Walls and pathfinding** (charter §19 lists both as out of scope): see "Walls and pathfinding". Building limits gain `wall`: segments per Village Hall level, 8 at VH1 rising by 4 per level to 44 at VH10. The save format stores each wall's direction (`orient: 'x' | 'y'`).
- **Buildings may touch:** `rules.buildingGap` is 0 again (the 1-tile gap was removed).
- **Edit mode for moving** (charter §5 put Move in the info panel): buildings can only be moved in edit mode, opened with the Edit Base Layout button. The info panel has no Move button.
- Cole's Bitcoin Mine, Archer, Wizard, and arrow art turned out to have real transparency, so they're wired in instead of placeholders (charter §15 expected a painted checkerboard).

## Open questions

1. **Art:** every building now has all 5 pictures. The Cannon tiers are cropped with one shared box (`trim: 'group'` in [scripts/prepare-art.mjs](scripts/prepare-art.mjs)), so they keep a single scale and ground point and each upgrade looks bigger. Its 63% scale is measured against that box, the width of the biggest tier.
2. **Slingers can stall a wave:** Slingers stop 5 tiles from their target. If no Archer or Mortar covers that spot, nothing can hit them, and the wave lasts until the target falls. Playtesting showed this can happen. Is that intended, or should something change (balance, or a rule)?
3. **Final enemy names** (Grunt, Slinger, Bomber, Tank are working names; Sneaker Shark is named).
4. **Wall balance:** wall costs, HP, segments per Town Hall, segment length (3), and the `pathing` costs are first guesses, and none of them are in the balance sheet yet. Playtest how quickly walls fall and whether enemies detour too much or too little. Wall art is single tiles (`bld_wall_lv1.png` … `lv5`).
5. **Balance for the new systems:** the level 6–10 numbers and the 2-minute day are first guesses. Playtest whether players can afford upgrades between nights, and whether nights at a given Town Hall level are fair. Copy the level 6–10 rows and `dayNight` into the sheet before the next re-export.
6. `TODO(design)` in code. These numbers come from the charter but aren't in the balance sheet yet: spawn spread 2 / entry spread 0.75 and bump padding 0.3 ([src/logic/enemies.js](src/logic/enemies.js)), and endless waves adding a spawn corner every 2 waves (the charter said 3) ([src/logic/waves.js](src/logic/waves.js)). Add them to the sheet's Global tab, along with the values the charter already lists.
7. Selling, collecting, or earning bounty while gold is at capacity loses whatever doesn't fit (charter: gold never exceeds capacity).
8. Starter-base buildings (Skip tutorial) refund 50% of their normal price when sold, even though they were free.
9. While a tutorial step is waiting for gold, the guide shows `Collect gold from your mine: 45 / 100`. That progress line isn't in the charter's step text.

## Team

| Person | Role |
| --- | --- |
| Brady Messick | Code; owns the working prototype |
| Robert | Code |
| Cole Martin | Game art, sound effects, UI/UX |
| Nathan DiCarlo | Testing, Kanban board |
