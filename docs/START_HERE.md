# Italian Brainrot Tower Defense: AI build handoff

This folder is everything an AI coding agent needs to build the playable demo with placeholder art.

| File | What it is |
| --- | --- |
| `BUILD_CHARTER.md` | The full specification. Follow it exactly. |
| `src/config.js` | Every balance number (generated from Game_Balance_Sheet.xlsx). Use as-is. |
| `src/mapTiles.js` | Which map tiles are placeable grass, the map origin, town hall spot, and spawn points. Use as-is. |
| `public/assets/images/map/game_map_grid.png` | The game background: forest clearing with the checkerboard on every grass tile. |
| `docs/archive/game_map_v1.png` | Same map without the checkerboard (backup; it was `public/assets/images/game_map.png`, never loaded by the game). |

Copy `src/` and `public/` into the repository at the same paths before starting.

## Prompt to give the AI

> You are building the browser demo of Italian Brainrot Tower Defense in the repository github.com/Dragonborn226/TowerDefense. Read `BUILD_CHARTER.md` in full before writing any code; it is the complete spec, and its section 1 non-negotiables override anything else. Use `src/config.js` and `src/mapTiles.js` exactly as provided and never hard-code gameplay numbers. Work through the milestones in section 17 in order. After each milestone, make sure `npm run dev` runs with no console errors and `npm test` passes, commit, and summarize what you built and anything you marked `TODO(design)`. Stop and ask before doing anything the charter lists as out of scope. Start with milestone 1.
