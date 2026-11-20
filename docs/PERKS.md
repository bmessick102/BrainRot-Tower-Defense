# Perks (RV Lab trees): how they work and how to add one

## The rules
- A building type (cannon, mine, altar, ...) has one perk tree: 3 paths (A, B, C) x 5 tiers.
- The first RV Lab pick for a type locks it to that path; later tiers are that path's only. A paid respec ("Reset path") clears it (no refund).
- Perks cost RP only (players see RP as **Burgers**: write "Burgers" in any text they read, via `rpText()` / `RP_NAME` in researchPoints.js; code, config and saves keep `rp`). Tier N needs RV Lab level N. A building's own level never matters: every building of the type has every researched tier.
- RP is capped (`CONFIG.rules.rpCaps`, by RV Lab level); RP past the cap is lost.
- Any building level can be paid in RP: give the level `costCurrency: 'rp'` in `src/config.js` (the RV Lab's, the Fuel Station's and the Brisket King altar's upgrades do). `checkUpgrade` returns `currency` (on every answer, locked ones too), and `GameState.upgradeBuilding` spends it. Such levels are not refunded as gold when selling.

## Adding a tree (e.g. Fuel Station, a new tower)
1. The type must be a building type (`BUILDING_TYPES` in `src/logic/buildings.js`) with its own `CONFIG` entry.
2. At the bottom of `src/abilityConfig.js` register it:

   ```js
   registerPerkTree('fuelStation', {
     a: { name: 'Rage Brew', tiers: [t('Name', 'Description shown to the player.', { someFx: 1 }), /* 5 tiers */] },
     b: { ... },
     c: { ... }
   }, 'economy');   // group: 'defense' (default) or 'economy' = which tab of the research window
   ```
   It throws if a path lacks a name or exactly 5 tiers with name, desc and fx. Tier names must be unique across the whole game (a test checks).
3. Read the effects where the building acts, with `abilityFx(b)` from `src/logic/abilities.js` (`b.picks` is kept in sync automatically for every building of a registered type; the save, RV Lab window, lab guide and research list pick the type up on their own).
   - fx keys ending in `Pct` or `Add` are summed over the owned tiers; every other key keeps its largest value.
   - Example: `const fx = abilityFx(b); if (fx.heroSecondWind) ...` (the Brisket altar's "Second Wind" revive).
4. If the effect is a new number on the building (not per-hit), add a getter in the building's logic file (like `dj.js` or `hero.js`) that reads `abilityFx`.
5. Add a test (see `tests/abilities.test.js`): the tree-shape test already covers every registered type.

## Where things live
- Trees, costs, `registerPerkTree`: `src/abilityConfig.js`
- Rules (lock, respec, research checks, save conversion): `src/logic/abilities.js`
- RP cap and gain: `src/logic/researchPoints.js`
- Window: `src/objects/AbilityWindow.js`; RP bar: `UIScene.buildResearchPoints`
