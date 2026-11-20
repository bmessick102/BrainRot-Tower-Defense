# Italian Brainrot Tower Defense — Demo Build Charter

Version: Nov 10, 2026 · Owner: Brady Messick

## 1. Purpose and ground rules

Build a playable browser demo of Italian Brainrot Tower Defense (ibtd) with placeholder graphics, exactly as specified here. Every gameplay number comes from `src/config.js`, which mirrors the team's Game\_Balance\_Sheet.xlsx.

**Who this is for:** an AI coding agent building the demo, plus the human team who will review and extend it.

| Person | Role |
| --- | --- |
| Brady Messick | Code; owns the working prototype |
| Robert | Code |
| Cole Martin | Game art, sound effects, UI/UX |
| Nathan DiCarlo | Testing, Kanban board |

**Non-negotiables**

1. JavaScript (ES modules), Phaser 3, and Vite, using the Vite setup already in the repo. The only dev dependencies are `vite` and `vitest`. No TypeScript, and no other framework or game engine.
2. No login, accounts, leaderboards, servers, databases, or network calls of any kind. All data stays in the browser. Delete the repo's `server/` folder, Docker files, and PostgreSQL code.
3. No hard-coded gameplay numbers. Costs, HP, damage, ranges, timings, limits, and wave sizes are read from `src/config.js`.
4. Game rules live in pure functions under `src/logic/` that never import Phaser, so Vitest can test them without a browser. Scenes only draw things and route input.
5. Placeholder art is generated at runtime with Phaser Graphics, using the exact texture keys in section 15, so Cole's art can replace it by dropping in files.
6. Desktop browser, mouse input. Base resolution 1280 x 720, scaled to fit the window.
7. Small, focused commits to `main`; the game must load without console errors and `npm test` must pass after every commit.

**When something is unclear:** choose the simplest behavior consistent with this charter, mark it in code with `// TODO(design): <question>`, and add it to an "Open questions" list in the README. Do not invent features that are not listed here.

## 2. Game overview and core loop

ibtd is a single-player base-builder tower defense, a hybrid of Clash of Clans and Bloons TD. You mine gold, build and upgrade defenses on an isometric grid, and survive one enemy wave each time you upgrade your town hall.

**Core loop**

1. Collect gold by clicking Bitcoin Mines (gold is the in-game Bitcoin currency).
2. Spend gold in the shop on mines, storage, and defenses; place them on the grid.
3. Upgrade buildings to raise their stats (instant, no timers).
4. Upgrade the town hall to unlock more and stronger buildings. Each upgrade starts a 20-second countdown, then a wave spawns from the marked path entrances.
5. Defend. Enemies have no fixed path; they walk or fly to the nearest building.
6. Wave cleared: banner with gold earned, everything repairs for free, game autosaves. Repeat.

**Progression and end state**

- Town hall levels 1 to 5. Upgrades 1→2, 2→3, 3→4, and 4→5 each trigger one scripted wave (waves 1 to 4).
- After wave 4, a **Next Wave** button starts endless waves that keep growing. There is no victory screen.
- If the town hall is destroyed, the game is over. Retry reloads the checkpoint taken just before that wave.
- A tutorial with a character guide teaches the first loop and can be skipped for a starter base.

## 3. Tech stack, running, and deployment

The game is a Vite project with no backend: `npm run dev` serves it locally with hot reload, `npm test` runs the Vitest logic tests, and `npm run build` produces the static site for GitHub Pages.

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | JavaScript (ES modules) | No TypeScript; delete the repo's `tsconfig.json` files |
| Game engine | Phaser 3, exact version pinned in `package.json` | `Phaser.AUTO` renderer, `Scale.FIT` + `CENTER_BOTH`, 1280 x 720 base |
| Build tool and dev server | Vite (already set up in the repo) | `vite.config.js` sets `base: '/TowerDefense/'` so GitHub Pages paths work |
| Backend | None | Delete `server/`, Docker files, and PostgreSQL code |
| Data storage | Browser `localStorage` | Save, checkpoint, settings (section 13) |
| Testing | Vitest | Logic tests in `tests/` (section 16) |
| Repository | GitHub: Dragonborn226/TowerDefense, single `main` branch | Pull before every push |
| Task board | GitHub Projects | Columns: Backlog, To Do, In Progress, Review/Testing, Done |
| Hosting | GitHub Pages, published by a GitHub Actions workflow that runs `npm run build` and uploads `dist/` | Gives a shareable demo link |
| Target browsers | Current desktop Chrome, Edge, Firefox | Mouse and scroll wheel |

**Run locally:** `npm install` once, then `npm run dev` and open the localhost URL it prints. Tests: `npm test`. Production build: `npm run build` (output in `dist/`).

**Controls:** left-click to select, collect, place, and use UI; click-drag on the map to pan; scroll wheel to zoom; Esc to cancel placement or pause.

## 4. File structure and architecture

Rules live in `src/logic/` as plain functions over a single game-state object; Phaser scenes read that state and draw it. Dependencies only point downward: scenes → objects → state → logic → config.

```
TowerDefense/
├── index.html             Vite entry; loads src/main.js
├── package.json           scripts: dev, build, test · dependency: phaser · dev: vite, vitest
├── vite.config.js         base path for GitHub Pages
├── README.md              description, setup, tech, open questions
├── .gitignore             node_modules/, dist/, .DS_Store, .vscode/
├── .github/workflows/
│   └── deploy.yml         build and publish dist/ to GitHub Pages on push to main
├── public/
│   └── assets/
│       ├── images/        map/game_map_grid.png (+ dusk/night/dawn) and Cole's other art
│       └── audio/         Cole's sound effects
├── src/
│   ├── main.js            Phaser game config + scene list
│   ├── config.js          every balance number (section 14)
│   ├── mapTiles.js        grass tiles, image origin, town hall spot, spawn points (section 5)
│   ├── assetKeys.js       texture and sound key constants
│   ├── logic/             pure JS, never imports Phaser
│   │   ├── iso.js         grid <-> screen conversion, distances
│   │   ├── grid.js        grass-tile map, occupancy, placement validation
│   │   ├── buildings.js   create, stats by level, upgrade rules, limits
│   │   ├── economy.js     gold, capacity, costs, collect, sell, repair, storage drain
│   │   ├── enemies.js     create, choose target, movement step
│   │   ├── combat.js      tower targeting, projectiles, damage, splash
│   │   ├── waves.js       wave composition, spawn schedule, endless scaling
│   │   ├── tutorial.js    tutorial step state machine
│   │   └── save.js        serialize, validate, load, versioning
│   ├── state/
│   │   └── GameState.js   the one state object + a small event emitter
│   ├── scenes/
│   │   ├── BootScene.js       loads Cole's art, generates placeholders for the rest
│   │   ├── TitleScene.js
│   │   ├── HowToPlayScene.js
│   │   ├── GameScene.js       map, buildings, enemies, projectiles, camera
│   │   ├── UIScene.js         HUD, shop, info panel, banners, tutorial guide
│   │   ├── PauseScene.js
│   │   └── GameOverScene.js
│   └── objects/           Phaser display wrappers, no rules
│       ├── BuildingView.js
│       ├── EnemyView.js
│       ├── ProjectileView.js
│       ├── RangeCircle.js
│       └── HealthBar.js
└── tests/
    └── <module>.test.js   Vitest, one file per logic module
```

**Repo cleanup (first task):** the repo currently has a `client/` Vite app, a `server/` folder, Docker files, TypeScript config, and an `assets/` folder. Move the Vite app to the repo root, delete `server/`, Docker, and TypeScript config, move `assets/` into `public/assets/`, and keep one `package.json`.

**Simulation**

- `GameScene.update(time, delta)` converts `delta` to seconds, caps it at 0.1 s, and calls one logic step: `simulate(state, dt)`. The step runs mine production, wave spawning, enemy movement and attacks, tower targeting and firing, projectile flight, and damage, in that order.
- All positions and distances in logic are in **tile units** in grid space (floats). Only views convert to screen pixels.
- Logic emits events (`goldChanged`, `buildingDestroyed`, `enemyKilled`, `waveCleared`, `gameOver`, etc.) through `GameState`; `UIScene` listens and updates the HUD. UI never polls logic each frame for text.
- Pausing stops `simulate` from being called. `UIScene` runs in parallel with `GameScene` as an overlay.
- Every entity has a stable string `id` so views can be matched to state.

## 5. Map, isometric grid, camera, and placement

The map is Cole's painted forest clearing (`game_map.png`, 2102 × 1182 px) with a 64 × 32 px isometric grid over it. Every tile that sits on grass is placeable (803 tiles); the dirt paths, trees, and stream are not. `src/mapTiles.js` records which tiles are grass.

**Coordinates**

- Tile `(col, row)` with col 0 to 31 and row 0 to 30 (a 32 × 31 area). Only tiles marked `'1'` in `MAP.tiles[row][col]` are grass; the rest are off-limits for buildings. Entity positions are floats in the same space; a tile's center is `(col + 0.5, row + 0.5)`.
- Grid → image pixels: `sx = MAP.originX + (x - y) * 32`, `sy = MAP.originY + (x + y) * 16`. The origin (994, 70) is the top corner of tile (0, 0) in the map image.
- Screen → grid (after undoing the camera): `a = (sx - originX) / 32`, `b = (sy - originY) / 16`, `x = (a + b) / 2`, `y = (b - a) / 2`; the tile is `(floor(x), floor(y))`.
- Distance = Euclidean distance in grid space, in tiles. Ranges, speeds, and splash radii all use this.
- Depth sorting: each building's depth = `col + row` of its front corner (`anchorCol + size + anchorRow + size`); each enemy's depth = `x + y`. Air enemies get +1000 so they draw over everything.
- **Background:** `game_map_grid.png`, drawn once at (0, 0) in world space. Every grass tile is shaded in a light/dark checkerboard that lines up exactly with the game's tiles: tile `(col, row)` is light when `col + row` is even and dark when it's odd, with a soft line around the edge of the placeable area. The code draws no grid lines of its own.
- `game_map.png` is the same image without the checkerboard, kept in case the team later wants to draw tile shading in code (for example, only while placing a building). It is no longer in `public/`: the original is `docs/archive/game_map_v1.png`.

**Footprints and placement**

- Town hall 4 x 4, placed at the start at tile (17, 15) (`MAP.townHallAnchor`); every other building 3 x 3. A building is stored by its anchor tile (lowest col and row) plus size.
- A spot is valid when every tile under the footprint is grass and no other building covers it. Buildings may touch. There is no no-build border.
- Placement mode shows a ghost of the building that follows the cursor and snaps to tiles: tinted to show valid or invalid. Defenses also show their range circle (section 6) on the ghost.
- Left-click places on a valid spot and charges gold. Esc or right-click cancels with no charge.
- Move: from the info panel. The building becomes a ghost and follows the cursor; clicking a valid spot drops it (free), Esc returns it. The town hall can be moved but never sold.
- Placement, move, and sell are disabled while a wave is active.

**Camera**

- Starts centered on the town hall at zoom 1.0.
- Drag on the map to pan. A press that moves less than 6 px is a click, not a drag. Pan is clamped so the map cannot leave the screen entirely.
- Scroll wheel zooms from 0.5 to 2.0, toward the cursor.

## 6. Buildings

There are 7 building types, each with one model for all levels and levels 1 to 5. A building's level can never exceed the town hall's level.

| Building | Size | Job | Hits ground | Hits air | Unlocks at TH |
| --- | --- | --- | --- | --- | --- |
| Town Hall | 4 x 4 | Core; built-in gold capacity; destroyed = game over | — | — | Start |
| Bitcoin Mine | 3 x 3 | Produces gold into its own stock; click to collect | — | — | 1 |
| Bitcoin Storage | 3 x 3 | Raises max gold; loses gold when damaged | — | — | 1 |
| Cannon | 3 x 3 | Slow single-target shots, short range | Yes | No | 1 |
| Archer Tower | 3 x 3 | Fast single-target arrows, long range | Yes | Yes | 2 |
| Mortar | 3 x 3 | Slow arcing splash shells, longest range, 3-tile dead zone | Yes | No | 2 |
| Wizard Tower | 3 x 3 | Medium-rate splash bolts, short range | Yes | Yes | 3 |

**Upgrades:** instant on payment. Defenses gain damage and HP. Mines gain production, stock cap, and HP. Storage gains capacity and HP. Town hall gains HP and built-in capacity, raises building limits (section 10), and triggers the next wave. Range and fire rate never change with level.

**Visual state**

- A level badge (`Lv 3`) floats above every building.
- HP bar appears above a building only after it takes damage, and hides again at full HP.
- At 0 HP a building becomes **destroyed**: its rubble texture is shown, it stops firing or producing, enemies ignore it, and it still occupies its tiles.
- A full mine shows a floating coin icon (section 9).

**Info panel (click any building)**

- Shows name, level, HP, and type-specific stats: damage, fire interval, range, and targets for defenses; production, stock, and stock cap for mines; capacity for storage and town hall.
- Buttons: **Upgrade** (shows cost), **Move**, **Sell** (shows refund; not on the town hall), **Repair** (only for a destroyed building during a wave), and close.
- A disabled button shows why: `Requires TH3`, `Need 200 more gold`, `Max level`, or `Not during a wave`.
- Clicking empty ground, another building, or close hides the panel.

**Range circle**

- Shown for a selected defense and on a defense ghost while placing or moving it. Hidden when deselected, placed, or cancelled.
- Drawn as an ellipse centered on the building's footprint center: a circle of radius r tiles in grid space becomes semi-axes `rx = r × 45.25 px` and `ry = r × 22.63 px` (64/√2 and 32/√2).
- Fill white at 15% opacity, 2 px white outline at 70%.
- Mortar draws a second ellipse for its minimum range, filled red at 30% opacity, to show the area it cannot hit.

## 7. Enemies and their behavior

Four enemy types; every one heads for the nearest building of any type, and none use pathfinding. Names are working names.

| Enemy | Type | Role | How it attacks | Hit by | First wave |
| --- | --- | --- | --- | --- | --- |
| Grunt | Ground melee | Low-HP swarm | Melee at range 0.5 | All four defenses | 1 |
| Slinger | Ranged (ground) | Fewer, tougher | Projectile from 5 tiles; outranges Cannon and Wizard | All four defenses | 2 |
| Bomber | Air | Fewer, tougher, fast | Hovers over target, drops bombs | Archer Tower, Wizard Tower | 3 |
| Tank | Ground melee (heavy) | Very high HP, slow, soaks fire | Melee at range 0.5 | All four defenses | 4 |

**Targeting**

- Target = the non-destroyed building whose footprint is closest to the enemy (distance to the nearest point of the footprint rectangle). Ties go to the first in the building list.
- Re-target only when the current target is destroyed: pick the next nearest.
- If every building except the town hall is destroyed, all enemies target the town hall.

**Movement**

- Ground enemies (Grunt, Slinger, Tank) move in a straight line toward the closest point of their target's footprint at their speed, and stop once that distance ≤ their attack range.
- No pathfinding: if a ground enemy's position enters another building's footprint (expanded by 0.3 tiles) on the way, it switches target to that building and attacks it. Enemies may cross any terrain; only buildings interrupt them.
- Bombers fly straight over everything to the target's footprint center and hover there.
- Enemies spawn at the four path entrances, just outside the grass on each dirt path (`MAP.spawnPoints`, grid coordinates): top (3.2, 2.9), right (27.2, 3.9), bottom (30.0, 28.6), left (6.8, 25.9). Each starts within 1 tile of its spawn point with a random offset of up to ±0.75 tiles so swarms don't stack.

**Attacking and dying**

- Each enemy attacks its target every `attackInterval` seconds for `damage`. Grunt and Tank hit instantly; Slinger fires a visible projectile; Bomber drops a visible bomb.
- Enemy HP bar shows only after the first hit. On death: remove it, add its gold bounty, show a floating `+3` style label.
- Wave HP multipliers (section 10) scale enemy max HP only; speed, damage, and bounty stay fixed.

## 8. Combat rules

Each defense shoots the closest enemy it is allowed to hit; all projectiles are visible, and every hit shows feedback.

**Tower targeting and firing**

- Range is measured from the defense's footprint center to the enemy's position.
- A valid target is alive, inside range, outside minimum range (Mortar only), and of a type the defense can hit (section 6).
- Keep the current target while it stays valid; otherwise pick the closest valid enemy.
- Fire when the cooldown reaches 0, then reset the cooldown to `fireInterval`. Destroyed defenses never fire.

**Projectiles**

| Defense | Projectile | Flight | Hit rule |
| --- | --- | --- | --- |
| Cannon | Cannonball | Straight, homing, 12 tiles/s | Single target |
| Archer Tower | Arrow | Straight, homing, 16 tiles/s | Single target |
| Wizard Tower | Magic bolt | Straight, homing, 10 tiles/s | Splash on impact, radius 1.0 |
| Mortar | Shell | Arcs to the target's position **at fire time**, lands after 1.2 s | Splash at the landing point, radius 1.5; can miss moving enemies |

- A homing projectile whose target dies before impact disappears with no damage.
- Splash damages every enemy within the radius that the defense can hit (Mortar: ground only; Wizard: ground and air), each for full damage.

**Feedback**

- Floating damage number above whatever was hit.
- Hit flash: the sprite tints white for 80 ms.
- Splash circle: a ring of the splash radius at the impact point, fading over 0.3 s.

**Building damage, destruction, repair**

- Enemy hits reduce building HP. At 0 the building is destroyed (section 6).
- Storage damage drains gold: `goldLost = round(damage / maxHP × storageDrainOnDestroy × storedHere)`, where `storedHere = totalGold × thisStorageCapacity / totalCapacity`. A full destruction therefore drains half of the gold that storage holds. Town hall capacity is never drained.
- During a wave, a destroyed building can be repaired from its info panel for 25% of its level 1 build cost; it returns at full HP. Damaged but standing buildings cannot be repaired mid-wave.
- When a wave is cleared, every building returns to full HP for free.
- Town hall at 0 HP: stop the simulation and open the game over screen.

## 9. Economy

There is one currency, gold, shown with a Bitcoin icon. The player starts with 150 gold, and total gold can never exceed total capacity.

- **Capacity** = town hall built-in capacity + the capacity of every storage the player owns (destroyed or not). Shown in the HUD as `450 / 1,500`.
- **Mines** add `production × dt` to their own stock until the stock reaches the mine's cap, then stop. Production pauses when the game is paused, when the mine is destroyed, and when the game is closed (no offline production).
- **Coin icon:** appears over a mine once its stock is ≥ 10% of its cap, and pulses larger when the mine is full.
- **Collect:** clicking a mine (during or outside a wave) moves `min(stock, capacity − gold)` into the player's gold, shows a floating `+N`, and leaves any remainder in the mine. Clicking with no room shows `Storage full`.
- **Bounty:** each enemy kill adds its bounty, up to capacity.
- **Buying:** the shop price for a building is its level 1 cost; every copy costs the same. Upgrade cost = that level's cost in config. Gold is spent on placement, not when entering placement mode.
- **Selling:** refunds 50% of everything spent on that building (build plus upgrades), rounded. Not allowed during a wave; the town hall can't be sold.
- **Repair:** see section 8.

## 10. Waves and progression

Each town hall upgrade triggers exactly one scripted wave; after wave 4 the player starts endless waves with a Next Wave button.

**Building limits per town hall level** (max building level = town hall level)

| Building | TH1 | TH2 | TH3 | TH4 | TH5 |
| --- | --- | --- | --- | --- | --- |
| Bitcoin Mine | 1 | 2 | 3 | 3 | 4 |
| Bitcoin Storage | 1 | 1 | 2 | 2 | 3 |
| Cannon | 1 | 2 | 2 | 3 | 3 |
| Archer Tower | 0 | 1 | 2 | 2 | 3 |
| Mortar | 0 | 1 | 1 | 2 | 2 |
| Wizard Tower | 0 | 0 | 1 | 1 | 2 |

**Scripted waves**

| Wave | Trigger | Grunts | Slingers | Bombers | Tanks | Spawn paths | HP multiplier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (tutorial) | TH1 → TH2 | 8 | 0 | 0 | 0 | 1, always the top path | 1.0 |
| 2 | TH2 → TH3 | 20 | 4 | 0 | 0 | 1, random | 1.0 |
| 3 | TH3 → TH4 | 25 | 5 | 4 | 0 | 2, random | 1.1 |
| 4 | TH4 → TH5 | 35 | 8 | 7 | 3 | 2, random | 1.2 |

**Endless waves (wave n ≥ 5)**

- Each type's count = `round(wave4Count × 1.15^(n − 4))`.
- HP multiplier = `round(1.2 × 1.10^(n − 4), 2)`.
- Spawn paths = `min(4, 2 + floor((n − 5) / 3))`, chosen at random without repeats.

**Wave lifecycle**

1. **Trigger.** The player clicks Upgrade on the town hall (or Next Wave in endless). First save a checkpoint (section 13), then apply the upgrade: charge gold, raise the level, unlock buildings.
2. **Countdown, 20 s.** The chosen path entrances show a pulsing red marker and an arrow pointing into the clearing. The HUD shows `Wave 3 in 12s`. The player may still build, upgrade, move, and sell.
3. **Spawning.** Each chosen path spawns its share of enemies one every 0.8 s: Tanks first, then Grunts and Slingers alternating, Bombers last. Enemies are split as evenly as possible across paths.
4. **Active.** From the first spawn until every enemy is dead, shop, upgrade, move, and sell are locked. Collecting and repairing destroyed buildings are allowed. The HUD shows `Wave 3 · 18 enemies left`.
5. **Cleared.** Banner `Wave 3 cleared! +185 gold` (the bounty earned this wave) for 2.5 s, free repair of all buildings, autosave.
6. After wave 4 is cleared, the HUD shows a **Next Wave** button whenever no wave is in progress.

## 11. Tutorial

A character guide walks a new game through mine → storage → cannon → town hall upgrade → wave 1. The tutorial ends when wave 1 is cleared, and progress is saved per step.

**Guide presentation**

- A guide portrait (placeholder: a colored circle with a face, key `guide_portrait`) sits bottom-left with a speech bubble and a **Next** button where a step needs one.
- The current target is highlighted with a pulsing outline and a bouncing arrow. Everything else that would break the flow is dimmed and ignores clicks.
- A **Skip tutorial** button shows on step 1 only.

**Steps** (`tutorial.js` holds the step number; each step advances on the event named)

1. Welcome: "This is your Town Hall. Protect it!" → Next.
2. "Open the shop." Arrow on the Shop button → shop opened.
3. "Buy a Bitcoin Mine." Only the mine card is enabled (start gold 150 = mine cost) → mine bought.
4. "Place it anywhere green." → mine placed.
5. "Mines fill with gold. Click it when the coin appears." → first collect.
6. "Gold needs somewhere to live. Buy a Storage." Waits until gold ≥ 100, then the storage card is enabled → storage placed.
7. "Defend your base. Buy a Cannon." Waits until gold ≥ 150 → cannon placed (its range circle shows).
8. "Upgrade your Town Hall to grow your base." Waits until gold ≥ 300; arrow on the town hall, then the Upgrade button → TH2.
9. "Enemies are coming from the flashing path!" Shown during the countdown → wave 1 starts; dimming turns off.
10. On wave 1 cleared: "You did it! Keep mining, building, and upgrading." → Next ends the tutorial.

**Skip:** jump straight to free play with a starter base: town hall at (17, 15), mine at (13, 15), storage at (21, 15), cannon at (17, 11), all level 1, gold 0, `tutorialDone = true`. The first town hall upgrade still triggers wave 1.

**Replay:** not in the demo. The How to Play page covers the basics.

## 12. Screens, HUD, shop, and menus

Scene flow: Boot → Title → Game (with the UI overlay) ⇄ Pause, and Game → Game Over → Game (retry) or Title.

**Title screen**

- Game title, a large **Start Game** button, and below it **Continue**, **New Game**, **How to Play**.
- With no save: Start Game = New Game, Continue hidden. With a save: Start Game = Continue; New Game asks `Overwrite your saved game?` before deleting it.

**How to Play**

- Controls (click, drag to pan, scroll to zoom, Esc).
- Economy basics: mines fill, click to collect, storage limits total gold.
- Tower vs enemy chart: which defenses hit Grunt, Slinger, Bomber, and Tank (section 7).
- Back button.

**HUD during play**

| Position | Element |
| --- | --- |
| Top left | Gold `450 / 1,500` with a coin icon and a thin fill bar |
| Top center | `Wave 3 in 12s` during countdown · `Wave 3 · 18 enemies left` during a wave · **Next Wave** button when endless is unlocked and idle · blank otherwise |
| Top right | Pause button |
| Bottom right | Shop button (disabled during a wave) |
| Right side | Building info panel when something is selected |
| Bottom left | Tutorial guide when active |

**Shop**

- A bottom panel that slides up, with tabs **Defenses** (Cannon, Archer Tower, Mortar, Wizard Tower) and **Economy** (Bitcoin Mine, Bitcoin Storage). The map stays visible.
- Each card shows name, placeholder icon, cost, and `owned / limit`.
- Unavailable cards are greyed with the reason: `Requires TH3`, `Need 200 more gold`, or `Limit reached`.
- Clicking an available card closes the shop and starts placement mode.

**Banners:** centered near the top for 2.5 s: wave cleared, `Storage full`, `Saved`.

**Pause menu** (Pause button or Esc): Resume, Save, Volume slider 0 to 100%, Quit to Title (autosaves first, unless a wave is active, in which case it leaves the last save as is).

**Game over:** `Your Town Hall was destroyed`, `Wave reached: 3`, **Retry** (loads the checkpoint), **Quit to Title**.

## 13. Save system

Progress is saved to `localStorage` as versioned JSON in three keys; saves only happen outside active waves, so no mid-wave state is ever stored.

| Key | Holds | Written when |
| --- | --- | --- |
| `ibtd.save` | The current game | After every purchase, placement, upgrade, move, sell, and wave clear; Save in the pause menu; Quit to Title |
| `ibtd.checkpoint` | The game just before a wave was triggered | The moment Upgrade on the town hall or Next Wave is clicked, before gold is charged |
| `ibtd.settings` | Volume | When the volume slider changes |

**Save format (version 1)**

```json
{
  "version": 1,
  "savedAt": "2026-11-20T18:04:00.000Z",
  "gold": 640,
  "townHallLevel": 3,
  "wavesCleared": 2,
  "tutorialStep": 11,
  "tutorialDone": true,
  "buildings": [
    { "id": "b1", "type": "townHall", "level": 3, "col": 10, "row": 10 },
    { "id": "b2", "type": "mine", "level": 2, "col": 6, "row": 10, "stock": 84 }
  ]
}
```

**Rules**

- Every `localStorage` read and write sits in `try/catch`; storage being unavailable must never crash the game.
- On load, validate: correct `version`, known building types, levels 1 to 5, every footprint on grass tiles and not overlapping. Anything invalid → treat as no save and show `Save could not be loaded` on the title screen.
- Retry after game over copies `ibtd.checkpoint` into `ibtd.save` and loads it.
- New Game deletes `ibtd.save` and `ibtd.checkpoint`, not `ibtd.settings`.
- Bump `version` whenever the format changes.

## 14. Balance config (`src/config.js`)

Use this file exactly as written. It is generated from Game\_Balance\_Sheet.xlsx, which stays the source of truth: the team tunes the spreadsheet and re-exports, and code never copies a number out of it.

A few values are not in the spreadsheet yet: tile pixel size, projectile speeds, the Slinger and Bomber projectile timings, camera limits, and the coin-icon threshold. They are reasonable starting values and should be added to the sheet's Global tab when the team next edits it.

```javascript
// AUTO-GENERATED from Game_Balance_Sheet.xlsx. Edit the spreadsheet, then re-export.
// Units: distances in tiles, times in seconds, money in gold.
// levels[i] = level i+1. Building cost at level 1 = shop price; later levels = upgrade price.
// waves[i] = scripted wave i+1; endless waves (5+) are computed from waves[3] in logic/waves.js.
// Map shape, image origin, town hall position, and spawn points live in src/mapTiles.js.
export const CONFIG = {
  grid: { tileWidth: 64, tileHeight: 32, townHallSize: 4, buildingSize: 3 },
  startingGold: 150,
  rules: {
    sellRefund: 0.5,
    repairCostOfLevel1: 0.25,
    storageDrainOnDestroy: 0.5,
    waveCountdown: 20,
    spawnInterval: 0.8,
    endlessCountGrowth: 1.15,
    endlessHpGrowth: 1.1,
    maxTownHallLevel: 5,
    mineCoinIconThreshold: 0.1
  },
  projectiles: {
    cannon: { speed: 12 },
    archer: { speed: 16 },
    wizard: { speed: 10 },
    mortar: { flightTime: 1.2 },
    slinger: { speed: 10 },
    bomber: { dropTime: 0.4 }
  },
  camera: { minZoom: 0.5, maxZoom: 2.0, dragThresholdPx: 6 },
  townHall: {
    name: "Town Hall",
    levels: [
      { upgradeCost: 0, hp: 1200, capacity: 500 },
      { upgradeCost: 300, hp: 1500, capacity: 750 },
      { upgradeCost: 1000, hp: 1875, capacity: 1000 },
      { upgradeCost: 2500, hp: 2344, capacity: 1500 },
      { upgradeCost: 5000, hp: 2930, capacity: 2000 }
    ]
  },
  mine: {
    name: "Bitcoin Mine",
    unlockTownHall: 1,
    levels: [
      { cost: 150, hp: 300, production: 2, stockCap: 120 },
      { cost: 300, hp: 375, production: 4, stockCap: 300 },
      { cost: 600, hp: 469, production: 6, stockCap: 540 },
      { cost: 1200, hp: 586, production: 9, stockCap: 900 },
      { cost: 2400, hp: 732, production: 12, stockCap: 1440 }
    ]
  },
  storage: {
    name: "Bitcoin Storage",
    unlockTownHall: 1,
    levels: [
      { cost: 100, hp: 500, capacity: 1000 },
      { cost: 200, hp: 625, capacity: 2000 },
      { cost: 400, hp: 781, capacity: 3500 },
      { cost: 800, hp: 977, capacity: 5500 },
      { cost: 1600, hp: 1221, capacity: 8000 }
    ]
  },
  defenses: {
    cannon: {
      name: "Cannon", hitsGround: true, hitsAir: false, fireInterval: 1.5, range: 4.5, minRange: 0, splashRadius: 0, unlockTownHall: 1,
      levels: [
        { cost: 150, hp: 400, damage: 40 },
        { cost: 300, hp: 500, damage: 50 },
        { cost: 600, hp: 625, damage: 63 },
        { cost: 1200, hp: 781, damage: 78 },
        { cost: 2400, hp: 977, damage: 98 }
      ]
    },
    archer: {
      name: "Archer Tower", hitsGround: true, hitsAir: true, fireInterval: 0.5, range: 7, minRange: 0, splashRadius: 0, unlockTownHall: 2,
      levels: [
        { cost: 250, hp: 350, damage: 12 },
        { cost: 500, hp: 438, damage: 15 },
        { cost: 1000, hp: 547, damage: 19 },
        { cost: 2000, hp: 684, damage: 23 },
        { cost: 4000, hp: 854, damage: 29 }
      ]
    },
    mortar: {
      name: "Mortar", hitsGround: true, hitsAir: false, fireInterval: 4, range: 10, minRange: 3, splashRadius: 1.5, unlockTownHall: 2,
      levels: [
        { cost: 400, hp: 450, damage: 50 },
        { cost: 800, hp: 563, damage: 63 },
        { cost: 1600, hp: 703, damage: 78 },
        { cost: 3200, hp: 879, damage: 98 },
        { cost: 6400, hp: 1099, damage: 122 }
      ]
    },
    wizard: {
      name: "Wizard Tower", hitsGround: true, hitsAir: true, fireInterval: 1, range: 4.5, minRange: 0, splashRadius: 1, unlockTownHall: 3,
      levels: [
        { cost: 600, hp: 400, damage: 22 },
        { cost: 1200, hp: 500, damage: 28 },
        { cost: 2400, hp: 625, damage: 34 },
        { cost: 4800, hp: 781, damage: 43 },
        { cost: 9600, hp: 977, damage: 54 }
      ]
    }
  },
  limits: {
    mine: [1, 2, 3, 3, 4],
    storage: [1, 1, 2, 2, 3],
    cannon: [1, 2, 2, 3, 3],
    archer: [0, 1, 2, 2, 3],
    mortar: [0, 1, 1, 2, 2],
    wizard: [0, 0, 1, 1, 2],
    townHall: [1, 1, 1, 1, 1]
  },
  enemies: {
    grunt: { name: "Grunt", type: "ground", hp: 75, speed: 0.9, damage: 8, attackInterval: 1, attackRange: 0.5, bounty: 3 },
    slinger: { name: "Slinger", type: "ranged", hp: 150, speed: 1.1, damage: 15, attackInterval: 1.5, attackRange: 5, bounty: 10 },
    bomber: { name: "Bomber", type: "air", hp: 220, speed: 1.6, damage: 40, attackInterval: 2, attackRange: 0, bounty: 15 },
    tank: { name: "Tank", type: "ground", hp: 500, speed: 0.6, damage: 30, attackInterval: 2, attackRange: 0.5, bounty: 25 }
  },
  waves: [
    { grunt: 8, slinger: 0, bomber: 0, tank: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 20, slinger: 4, bomber: 0, tank: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 25, slinger: 5, bomber: 4, tank: 0, spawnPaths: 2, hpMultiplier: 1.1 },
    { grunt: 35, slinger: 8, bomber: 7, tank: 3, spawnPaths: 2, hpMultiplier: 1.2 }
  ]
};

export default CONFIG;
```

`src/mapTiles.js` is generated from the map art and exports `MAP`: the image name and size, `originX` 994 and `originY` 70, tile size, `cols` 32 and `rows` 31, `townHallAnchor` \[17, 15\], `spawnPoints` for the top, right, bottom, and left paths, and `tiles`, 31 strings of 32 characters where `'1'` is a grass tile. Use it exactly as delivered.

**Reading it:** `levels[0]` is level 1. For buildings, `levels[0].cost` is the shop price and later `cost` values are upgrade prices. Town hall `upgradeCost` at index n is the price to reach level n + 1. `limits.<type>[n]` is the count allowed at town hall level n + 1.

## 15. Placeholder art and audio

`BootScene` draws every placeholder texture at startup with Phaser Graphics and registers it under the keys below. When an image with the same key exists in `public/assets/images/`, `BootScene` loads it instead, and nothing else in the code changes.

Cole has already made art for the title screen, the Cannon, Archer Tower, Wizard Tower, arrow projectile, and Bitcoin Mine, and the map background is final: `game_map_grid.png` (the forest clearing with a light/dark checkerboard on every grass tile) plus `game_map.png` (the same image without the checkerboard). Wire the building art in after the placeholder version works.

**Known art issue:** the current Bitcoin Mine, Archer Tower, Wizard Tower, and arrow images have a grey checkerboard painted into the pixels instead of real transparency, so they would show a grey box in game. Only the Cannon has true transparency. Keep placeholders for those four until Cole re-exports them as PNGs with a transparent background; do not try to cut the background out in code.

**Art rules (placeholders and final art)**

- Isometric tile: 64 x 32 px diamond. A 3 x 3 footprint is 192 x 96 px at its base; the 4 x 4 town hall is 256 x 128 px.
- Building sprites: 192 px wide (town hall 256 px), any height. Origin at bottom-center of the footprint diamond: `setOrigin(0.5, 1)` at the footprint's front corner.
- PNG with transparency. One model per building for all levels, plus a `_destroyed` version.

**Texture keys and placeholder look**

| Key | Placeholder |
| --- | --- |
| `map_background` | `game_map_grid.png`, the final map with the grass checkerboard (already delivered); no placeholder needed |
| `bld_townHall` | Gold-yellow isometric block, label `TH` |
| `bld_mine` | Brown block, label `M` |
| `bld_storage` | Grey-blue block, label `S` |
| `bld_cannon` | Dark grey block, label `C` |
| `bld_archer` | Tan block, label `A` |
| `bld_mortar` | Olive block, label `Mo` |
| `bld_wizard` | Purple block, label `W` |
| `bld_<type>_destroyed` | Same footprint as a flat dark-grey slab |
| `enemy_grunt` | Small red circle, 14 px |
| `enemy_slinger` | Orange triangle, 18 px |
| `enemy_bomber` | Violet diamond, 22 px, drawn 24 px above a dark ellipse shadow |
| `enemy_tank` | Dark-red square, 26 px |
| `proj_cannon` / `proj_arrow` / `proj_mortar` / `proj_wizard` | Black dot / thin brown line / large dark dot / purple glowing dot |
| `proj_slinger` / `proj_bomb` | Small orange dot / small black dot |
| `ui_coin` | Gold circle with `₿` |
| `ui_spawn_marker` | Red pulsing ring + arrow, placed at a path entrance |
| `guide_portrait` | Teal circle with a simple face |

**Sound keys** (silent placeholders: a `playSfx(key)` helper does nothing when the file is missing, and honors the volume setting)

`sfx_ui_click`, `sfx_place`, `sfx_upgrade`, `sfx_sell`, `sfx_coin_collect`, `sfx_cannon_fire`, `sfx_arrow_fire`, `sfx_mortar_fire`, `sfx_mortar_impact`, `sfx_wizard_fire`, `sfx_hit`, `sfx_building_destroyed`, `sfx_wave_countdown`, `sfx_wave_start`, `sfx_wave_clear`, `sfx_game_over`. No music in the demo.

## 16. Testing requirements

Every module in `src/logic/` ships with Vitest tests in `tests/`, run with `npm test`. Visual, feel, and balance checks are manual and go in the Playtest Log tab of the balance sheet.

**Setup**

- Vitest is a dev dependency; `npm test` runs `vitest run`.
- Tests import logic modules and `config.js` directly and build their own small game state. They never need Phaser or a canvas.
- Run `npm test` before every push; don't push with a failing test.

**Required automated tests (minimum)**

| Module | Must prove |
| --- | --- |
| `iso.js` | Grid → screen → grid round trip returns the same tile for tile (0, 0), the town hall tile (17, 15), and several other grass tiles |
| `grid.js` | Loads `MAP.tiles` with exactly 803 grass tiles; rejects overlap and any footprint that touches a non-grass tile; accepts touching buildings |
| `buildings.js` | Limits per town hall level match config; upgrade blocked above town hall level and at level 5 |
| `economy.js` | Collect stops at capacity; mine stock stops at its cap; sell refunds 50% of total spent; repair costs 25% of level 1 cost and only works on destroyed buildings during a wave; storage drain formula |
| `enemies.js` | Picks the nearest non-destroyed building; re-targets after a destroy; switches to a building it walks into |
| `combat.js` | Cannon and Mortar never target Bombers; Mortar ignores enemies inside 3 tiles; splash hits every valid enemy in radius; dead target makes a homing shot fizzle |
| `waves.js` | Waves 1 to 4 match config; wave 1 always uses the top path; wave 5 and 8 counts, HP multiplier, and spawn path count match the endless formulas |
| `save.js` | Save → load round trip is identical; corrupted JSON and wrong version both return "no save" without throwing |
| `tutorial.js` | Each step advances only on its event; skip produces the starter base |

**Manual checks before each demo build:** play a new game through the tutorial and wave 2; check the range circle on all four defenses, including the Mortar's dead zone; check save, quit, and continue; check that game over and retry restore the pre-wave state.

## 17. Build order

Build in this order. Each milestone must run in the browser with no console errors, and pass its logic tests, before the next one starts. Milestones 1 and 2 are the isometric risk spike; if they are not working by the end of week 1, stop and tell the team, since the fallback is a top-down grid.

1. **Repo cleanup and skeleton (week 1).** Do the repo cleanup in section 4. Add Phaser, Vitest, `config.js`, and all scene stubs. `npm run dev` shows Title → Game; `npm test` runs.
2. **Isometric grid and camera (week 1).** Draw the checkerboard map (game\_map\_grid.png), load the grass tiles from mapTiles.js, pan, zoom, and click → tile under the cursor (log it). `iso.js` tests pass.
3. **Placement (week 1).** Town hall auto-placed; shop panel with tabs; ghost with green/red; placing, move, and sell; limits and costs enforced. `grid.js` and `buildings.js` tests pass.
4. **Economy (week 2).** Mines produce and show the coin icon, click to collect, storage capacity, HUD gold display, bounty hook. `economy.js` tests pass.
5. **Info panel and upgrades (week 2).** Panel with stats and disabled-button reasons, instant upgrades, level badge, range circles (including on ghosts and the Mortar dead zone).
6. **Enemies (week 2).** Spawn by hand from a debug key, nearest-building targeting, movement, attacks, building HP bars, destroyed state. `enemies.js` tests pass.
7. **Defenses (week 3).** Tower targeting, all projectile types, splash, damage numbers, hit flash, splash rings, bounty on kill, storage drain. `combat.js` tests pass.
8. **Waves (week 3).** Town hall upgrade triggers checkpoint → countdown → path markers → spawning → cleared banner and free repair; HUD wave text; game over and retry. `waves.js` tests pass.
9. **Saving and menus (week 3).** Autosave rules, checkpoint, Continue / New Game, pause menu with volume, How to Play. `save.js` tests pass.
10. **Tutorial (week 4).** Guide, highlights, all 10 steps, skip with starter base. `tutorial.js` tests pass.
11. **Endless, art, and release (week 4).** Next Wave button and endless scaling; Cole's finished art wired in; README finished; GitHub Pages workflow live; full manual check (section 16).

Remove or hide the debug spawn key before the demo build.

## 18. Demo acceptance criteria

The demo is done when every item below is true on the GitHub Pages build in current desktop Chrome.

- [ ] Loads from the GitHub Pages link with no console errors; title screen shows Start Game.
- [ ] A new game runs the full tutorial: buy and place a mine, collect, buy storage and a cannon, upgrade to TH2, survive wave 1.
- [ ] Skipping the tutorial gives the starter base.
- [ ] All 7 buildings can be bought (when unlocked), placed, moved, sold, and upgraded to the town hall's level, with limits enforced.
- [ ] Placement shows green/red validity and blocks overlapping buildings and any tile that isn't grass.
- [ ] Clicking a defense shows its info panel and range circle; the Mortar also shows its dead zone; a defense ghost shows its range while placing or moving.
- [ ] All four enemy types appear by wave 4 and behave as in section 7; Bombers are only hit by Archer and Wizard towers.
- [ ] Splash, projectiles, damage numbers, hit flash, and HP bars all show.
- [ ] Destroyed buildings show rubble, can be repaired mid-wave for gold, and fully repair free after the wave.
- [ ] Storage loses gold when hit; mines stop at their cap; gold never exceeds capacity.
- [ ] Waves 1 to 4 match config, with countdown and path-entrance markers; endless waves start from the Next Wave button.
- [ ] Losing the town hall shows game over; Retry restores the state from just before that wave.
- [ ] Closing the tab and choosing Continue restores buildings, levels, gold, waves cleared, and tutorial progress.
- [ ] Volume slider works with the silent placeholder system, and the setting persists.
- [ ] `npm test` passes every test listed in section 16.
- [ ] Changing a number in `config.js` (for example, Cannon damage) changes the game with no other code edits.

## 19. Out of scope

Do not build any of the following for the demo, even partially.

- Login, accounts, or any online identity
- Leaderboards, scores shared online, or any server or network call
- Multiplayer or attacking other players' bases
- Walls, traps, or buildings beyond the 7 listed
- Pathfinding (A\* or otherwise)
- Build or upgrade timers; offline mine production
- Unique art per building level; music
- Mobile or touch support
- Per-tower targeting modes (closest enemy only)
- A victory screen after wave 4
- A Settings screen on the title menu (volume lives in the pause menu)
- Replaying the tutorial

**Open questions for the team:** final enemy names; transparent re-exports of the Mine, Archer Tower, Wizard Tower, and arrow art (section 15).
