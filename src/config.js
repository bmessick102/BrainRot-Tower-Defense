// AUTO-GENERATED from Game_Balance_Sheet.xlsx. Edit the spreadsheet, then re-export.
// Units: distances in tiles, times in seconds, money in gold.
// levels[i] = level i+1. Building cost at level 1 = shop price; later levels = upgrade price.
// waves[i] = the base wave for wave stage i+1; stages 6+ use the endless formula in logic/waves.js.
// Waves start when the player presses Start Wave. v0.9.5: difficulty follows the wave number, not the Village Hall:
// rules.waveStages says which stage (base wave) a wave number fights, and rules.waveRamp scales it up for every wave
// survived before it. Each enemy kind joins at its own wave (fromWave).
// Levels 6-10 extend the sheet's growth (costs x2, HP/damage x1.25, storage capacity x1.5);
// they are NOT in Game_Balance_Sheet.xlsx yet: copy them in before the next re-export.
// Map shape, image origin, town hall position, and spawn points live in src/mapTiles.js.
import { TILE_WORLD, FOOTPRINTS } from './gridConfig.js';

// The grid's numbers (tile size, corners, the hall's and the usual footprint) live in src/gridConfig.js; a type's own
// footprint is its `size` below.
export const CONFIG = {
  grid: { tileWidth: TILE_WORLD.width, tileHeight: TILE_WORLD.height, townHallSize: FOOTPRINTS.townHall, buildingSize: FOOTPRINTS.default },
  startingGold: 250, // 100 rebuilds the ruined Village Hall (level 0 -> 1), 150 buys the first Mine
  rules: {
    // Everything destroyed in a night is rebuilt for free when the wave is beaten. During a wave a destroyed
    // building (not a wall) can be rebuilt early for this share of its current level's cost.
    rebuildCostShare: 0.3,
    // Wave stages (v0.9.5): the wave number where each stage starts (stage 1 first). A stage picks the base wave
    // (CONFIG.waves, then the endless formula: the old per-Village-Hall base waves), its rotating themes and its
    // most entrances; past the last start, the last stage. Difficulty no longer depends on the Village Hall.
    waveStages: [1, 4, 7, 10, 14, 18, 23, 28, 34, 40, 48, 56, 65, 75, 85],
    // The most entrances (MAP paths, 8 on the v0.9.2 map) a wave can come in from, per wave stage (stage 1 first;
    // past the end, the last). Each wave picks a random number from 1 up to it (waves.js planPaths), the same enemies
    // spread across them; wave 1 always comes from the top. Every entrance is in play from stage 13 (wave 65).
    entrancesByStage: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8],
    // Rebuilding is always paid in gold. A level bought with Burgers (RV Lab, Fuel Station, Brisket King) counts
    // as this much gold per Burger, so its rebuild price grows with the level like every other building's.
    burgerGoldValue: 15,
    // Safety net so a ruined economy can always recover: the Village Hall itself makes gold (base +
    // perLevel per level above 1; none while the starting hall is in ruins), paid in batches of `batch`.
    hallIncome: { base: 1, perLevel: 0.5, batch: 5 },
    storageDrainOnDestroy: 0.5,
    // Waves start on the Start Wave button, at whatever time of day it is. Pressing it starts a countdown
    // (waveCountdown s, the length of the music_planning track, which ends as the wave hits; the tutorial's
    // first wave counts down tutorialCountdown s) while "!" markers show where the enemies will come from.
    waveCountdown: 30,
    tutorialCountdown: 10,
    // Every wave survived makes the next ones bigger: +countPerWave enemies and +hpPerWave enemy HP
    // (shares of the wave stage's base wave, linear: wave 11 has 1 + 10 x 0.08 = 1.8x the enemies).
    waveRamp: { countPerWave: 0.08, hpPerWave: 0.05 },
    // Starting the next wave within this many seconds of clearing the last counts as a quick start
    // (the "Bring It On" achievement).
    quickStartSeconds: 10,
    // Research points (RV Lab abilities): each enemy's own researchPoints when it's defeated, plus this
    // many x the wave number for surviving a night (src/logic/researchPoints.js).
    researchPointsPerWave: 15, // v0.5: was 10 (RV Lab and Fuel Station upgrades now cost RP too)
    // RP is a capped resource: the most RP you can hold, by RV Lab level (index 0 = no RV Lab yet). RP earned
    // beyond the cap is lost. Each cap covers that level's next upgrade (RP) and the tier it unlocks.
    rpCaps: [400, 700, 1500, 3500, 6500, 10000],
    // Resetting a type's path costs this share of what its picks cost to research (no refund of the picks).
    respecShare: 0.5,
    spawnInterval: 0.8,
    // Anti-stall (src/logic/enrage.js): `after` s after a wave's last enemy spawns, enemies start to enrage.
    enrage: { after: 90, ramp: 30, maxDamage: 5, maxSpeed: 2 },
    // Restless nights (src/logic/enrage.js): while it's dark, attacking enemies deal `damage`x damage and move
    // `speed`x faster, and every kill (and the wave-cleared research points) pays +lootBonus gold and RP.
    night: { damage: 1.25, speed: 1.15, lootBonus: 0.25 },
    // Da Baby Car raid boss (enemies.babycar): from wave `fromWave`, every `every`th wave (normal waves only, not
    // special ones) brings `count` of them, `countLate` from wave `lateWave`.
    babyCar: { fromWave: 18, every: 2, count: 1, lateWave: 34, countLate: 2 },
    // Wave stars (src/logic/waveStars.js): each beaten wave is rated by how many of the buildings standing
    // when it started (walls don't count) were lost: none = 3 stars, at least `twoStarShare` still standing =
    // 2 stars, else 1. `bonus[stars - 1]` of the wave's gold and RP is paid on top.
    waveStars: { twoStarShare: 0.75, bonus: [0, 0.2, 0.5] },
    // Crowd cap (applyCrowdCap in src/logic/waves.js): a wave never sends more than maxEnemies (bosses not
    // counted). Past that, there are fewer enemies and each one is "packed": its health, damage, gold and RP
    // are multiplied by the wave's pack factor, so the wave is as strong (and pays as much) as before, with far
    // fewer sprites to draw and move. Packed enemies are drawn a little bigger (up to maxSizeBoost).
    // areaExponent: area damage (splash, pools, traps...) hits a packed enemy pack ** areaExponent times over
    // (combat.js areaPack), tuned so a capped wave takes about as much damage as the uncapped crowd would.
    crowdCap: { maxEnemies: 400, maxSizeBoost: 0.35, areaExponent: 0.66 },
    // Wave stages 6-11 (the old Village Halls 6-11): their base wave is the previous stage's with x endlessCountGrowth
    // enemies and x endlessHpGrowth health (stages 12-15: topHallGrowth below) (v0.5: 1.18 / 1.14 from the scripted VH5 wave; was 1.15 / 1.1 from VH4).
    endlessCountGrowth: 1.18,
    // v0.6 enemies (fromWave kinds, waves.js withLateKinds): this share of their total health comes back out of the
    // regular troops (lateKindPool, each cut by the same share, at most lateKindMaxCut), so a hall's wave keeps about
    // the same strength while the new threats join it.
    lateKindOffset: 0.7,
    lateKindPool: ['grunt', 'slinger', 'bomber', 'tank', 'shark', 'thief'],
    lateKindMaxCut: 0.55, // v0.7: 0.35 -> 0.55 so Village Halls 9-11 make room for Lirili Larila, the new Patapim and Bombombini too
    endlessHpGrowth: 1.14,
    // Wave stages 12-15 (v0.8 as Village Halls 12-15, wave stages since v0.9.5): past stage `from` - 1 (11) the base
    // waves grow gentler than the endless formula above: x `count` enemies and x `hp` health per stage (x1.07
    // strength). Kinds that join later (fromWave) grow the same way past their stage.
    topHallGrowth: { from: 12, count: 1.04, hp: 1.03 },
    maxTownHallLevel: 15,
    // (v0.6.1-v0.7 had Bonus Slots at Village Hall 11: 5 extra defenses of any kind past their caps. v0.8 replaced
    // them with fixed caps per hall (limits). A village that built past a cap keeps those buildings, but can't build
    // another of that type until it's back under the cap: checkBuy in src/logic/buildings.js.)
    mineCoinIconThreshold: 0.1,
    buildingGap: 0
  },
  // Ground-enemy pathfinding: crossing a tile costs 1; a standing wall or building costs extra (they
  // have to break it), so enemies walk around when the detour is cheaper than smashing through.
  pathing: { wallCostPerHp: 0.02, buildingCostPerHp: 0.02, buildingExtraCost: 20 },
  projectiles: {
    cannon: { speed: 12 },
    archer: { speed: 16 },
    wizard: { speed: 10 },
    firework: { speed: 9 },
    mortar: { flightTime: 1.2 },
    catapult: { flightTime: 1.8 }, // a long, high lob
    spear: { speed: 22 },          // the Spear Thrower's spear flies in a straight line (see fireSpear in combat.js)
    ksi: { speed: 11 },            // the KSI Tower's bottle (spins in flight, bursts into a chilling splash)
    slinger: { speed: 10 },
    bomber: { dropTime: 0.4 },
    vaca: { flightTime: 0.8, bounceTime: 0.35 }, // La Vaca Saturno's boulder: the throw, then each bounce
    missile: { fallTime: 1.5 }                   // Big Yahu's missile: the red target shows this long before it lands
  },
  // Day/night clock in seconds: a cycle of its own (about 8 minutes), separate from the waves.
  dayNight: { daySeconds: 240, duskSeconds: 30, nightSeconds: 180, dawnSeconds: 30 },
  camera: { startZoom: 0.75, minZoom: 0.33, maxZoom: 2.0, dragThresholdPx: 6 }, // 0.33: the whole map and every entrance fit (GameScene.minZoom keeps the screen filled: 0.34 at 1280 x 720)
  townHall: {
    name: "Village Hall",
    // Every game starts with the hall in ruins (level 0): nothing can be built, no gnomes live there,
    // and the day/night clock waits until it's rebuilt (levels[0].upgradeCost).
    ruin: { hp: 600, capacity: 500 },
    levels: [
      { upgradeCost: 100, hp: 1200, capacity: 500 },
      { upgradeCost: 300, hp: 1500, capacity: 750 },
      { upgradeCost: 1000, hp: 1875, capacity: 1000 },
      { upgradeCost: 2500, hp: 2344, capacity: 1500 },
      { upgradeCost: 5000, hp: 2930, capacity: 2000 },
      { upgradeCost: 10000, hp: 3663, capacity: 2500 },
      { upgradeCost: 20000, hp: 4579, capacity: 3000 },
      { upgradeCost: 40000, hp: 5724, capacity: 3500 },
      { upgradeCost: 80000, hp: 7155, capacity: 4000 },
      { upgradeCost: 160000, hp: 8944, capacity: 4500 },
      // v0.6: Village Hall 11. 250,000 fits in 5 top storages + the hall (309,500).
      { upgradeCost: 250000, hp: 11180, capacity: 5000 },
      // v0.8: Village Halls 12-15 (HP x1.25, capacity +500 per level). Each upgrade fits in the gold the hall before it
      // can hold (top storages + the hall): 300,000 <= 371,000 (VH11: 6 storages), 340,000 <= 371,500 (VH12: 6),
      // 380,000 <= 433,000 (VH13: 7), 410,000 <= 433,500 (VH14: 7).
      { upgradeCost: 300000, hp: 13975, capacity: 5500 },
      { upgradeCost: 340000, hp: 17469, capacity: 6000 },
      { upgradeCost: 380000, hp: 21836, capacity: 6500 },
      { upgradeCost: 410000, hp: 27295, capacity: 7000 }
    ]
  },
  // v0.5: Levels 6-10 make 12-33% more (same fill time): late halls took 2-10 hours of full mines to max out.
  mine: {
    name: "Bitcoin Mine",
    unlockTownHall: 1,
    levels: [
      { cost: 150, hp: 300, production: 2, stockCap: 120 },
      { cost: 300, hp: 375, production: 4, stockCap: 300 },
      { cost: 600, hp: 469, production: 6, stockCap: 540 },
      { cost: 1200, hp: 586, production: 9, stockCap: 900 },
      { cost: 2400, hp: 732, production: 12, stockCap: 1440 },
      { cost: 4800, hp: 915, production: 18, stockCap: 2420 },
      { cost: 9600, hp: 1144, production: 24, stockCap: 3610 },
      { cost: 19200, hp: 1430, production: 31, stockCap: 5220 },
      { cost: 38400, hp: 1788, production: 39, stockCap: 7360 },
      { cost: 76800, hp: 2235, production: 48, stockCap: 10150 }
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
      { cost: 1600, hp: 1221, capacity: 8000 },
      { cost: 3200, hp: 1526, capacity: 12000 },
      { cost: 6400, hp: 1908, capacity: 18000 },
      { cost: 12800, hp: 2385, capacity: 27000 },
      { cost: 25600, hp: 2981, capacity: 40500 },
      { cost: 51200, hp: 3726, capacity: 61000 }
    ]
  },
  // Each house is home to `gnomes` villagers. By day every gnome works a mine (more gold); during attacks
  // they repair damaged buildings. See villagers below and src/logic/villagers.js.
  house: {
    name: "Villager House",
    unlockTownHall: 1,
    // Odd levels add a gnome (1 at level 1, 5 at level 9); even levels make every gnome here better:
    // gnomeMine = share of a mine's rate each gnome mines into its sack, gnomeRepair = share of a
    // building's max HP each gnome repairs per second during attacks.
    levels: [
      { cost: 200, hp: 300, gnomes: 1, gnomeMine: 0.25, gnomeRepair: 0.02 },
      { cost: 400, hp: 375, gnomes: 1, gnomeMine: 0.30, gnomeRepair: 0.025 },
      { cost: 800, hp: 469, gnomes: 2, gnomeMine: 0.30, gnomeRepair: 0.025 },
      { cost: 1600, hp: 586, gnomes: 2, gnomeMine: 0.36, gnomeRepair: 0.029 },
      { cost: 3200, hp: 732, gnomes: 3, gnomeMine: 0.36, gnomeRepair: 0.029 },
      { cost: 6400, hp: 915, gnomes: 3, gnomeMine: 0.41, gnomeRepair: 0.034 },
      { cost: 12800, hp: 1144, gnomes: 4, gnomeMine: 0.41, gnomeRepair: 0.034 },
      { cost: 25600, hp: 1430, gnomes: 4, gnomeMine: 0.47, gnomeRepair: 0.038 },
      { cost: 51200, hp: 1788, gnomes: 5, gnomeMine: 0.47, gnomeRepair: 0.038 },
      { cost: 102400, hp: 2235, gnomes: 5, gnomeMine: 0.52, gnomeRepair: 0.0425 }
    ]
  },
  // Research building (src/logic/abilities.js, src/abilityConfig.js): researches the defenses' ability
  // paths. Its level is the highest tier that can be researched. Each level also needs a Village Hall
  // level (`townHall`), on top of the usual "no higher than the Village Hall" rule.
  // Building it (level 1) costs gold; its upgrades cost research points: a level with `costCurrency: 'rp'`
  // charges its `cost` in RP instead of gold (any building or level can do this: the Fuel Station will too).
  rvlab: {
    name: "RV Lab",
    size: 2, // the usual 2x2 (it was 3x3: too big beside the rest of the village)
    unlockTownHall: 4,
    levels: [
      { cost: 4000, hp: 1000, townHall: 4 },
      { cost: 300, costCurrency: 'rp', hp: 1250, townHall: 5 },
      { cost: 800, costCurrency: 'rp', hp: 1563, townHall: 6 },
      { cost: 2000, costCurrency: 'rp', hp: 1953, townHall: 7 },
      { cost: 4000, costCurrency: 'rp', hp: 2441, townHall: 8 }
    ]
  },
  // Fuel Station (src/logic/spells.js): an economy building from Village Hall 2 that brews spells with research
  // points in its window. Brewed spells wait on the hotbar; in a wave, click one, then the map, to cast it (each is
  // used up). Its level opens spell types (spells[kind].level: only Rage at level 1) and makes every spell
  // powerPerLevel stronger per level above 1. How many spells the village can carry: spellSlots[Village Hall level - 1].
  // Level 1 costs gold; its upgrades cost RP (costCurrency: 'rp'), priced for the RP of that stage (no RV Lab: 400
  // RP cap). radius in tiles, duration in s; brewCost in RP. The first Rage is free while the Fuel Station guide
  // runs (fuelGuide in spells.js).
  fuelStation: {
    name: "Fuel Station",
    size: 2,
    unlockTownHall: 2,
    spellSlots: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5],
    powerPerLevel: 0.08,
    // 8 levels, a picture per 2; HP x1.25 per level; each level needs a Village Hall level (VH2 -> VH10).
    levels: [
      { cost: 400, hp: 500, townHall: 2 },
      { cost: 100, costCurrency: 'rp', hp: 625, townHall: 3 },
      { cost: 200, costCurrency: 'rp', hp: 781, townHall: 4 },
      { cost: 350, costCurrency: 'rp', hp: 977, townHall: 5 },
      { cost: 600, costCurrency: 'rp', hp: 1221, townHall: 6 },
      { cost: 1000, costCurrency: 'rp', hp: 1526, townHall: 7 },
      { cost: 1800, costCurrency: 'rp', hp: 1907, townHall: 8 },
      { cost: 3000, costCurrency: 'rp', hp: 2384, townHall: 10 }
    ],
    // Each spell is an item (`name`, its title everywhere, with its icon art-source/spells/ui_spell_<kind>.png) with an
    // `effect` (shown under the name: "Karuba Coffee" / "Rage: defenses fire faster..."). Ids stay rage, heal, ...
    spells: {
      rage: { name: 'Karuba Coffee', effect: 'Rage', level: 1, brewCost: 40, radius: 4, duration: 8, fireRatePct: 50, damagePct: 30 },
      heal: { name: 'Donut', effect: 'Heal', level: 2, brewCost: 50, radius: 4, duration: 8, healPctPerSec: 4 },
      freeze: { name: 'Ice Bag', effect: 'Freeze', level: 3, brewCost: 80, radius: 3, duration: 4, bossSlow: 0.5 },
      heat: { name: 'Spicy Tornado', effect: 'Heat Field', level: 4, brewCost: 100, radius: 3, duration: 8, dps: 40 },
      invisibility: { name: 'Chocolate Milk', effect: 'Invisibility', level: 5, brewCost: 120, radius: 3.5, duration: 6 },
      lightning: { name: 'Energy Drink', effect: 'Lightning Strike', level: 7, brewCost: 180, radius: 3.5, duration: 0, targets: 3, damage: 600 }
    }
  },
  // DJ Babyface (src/logic/dj.js): a utility building. Gnomes working inside its range go gnomeBoostPct%
  // faster; enemies defeated fill its hype meter (hypeNeeded), and a full meter lets the player Drop the Beat
  // (its hotbar slot during a wave): defenses in range fire beatPct% faster for beatSeconds. At night its
  // light show calms enemies in range (not restless). Each level also needs a Village Hall level.
  dj: {
    name: "DJ Babyface",
    size: 2,
    unlockTownHall: 5,
    levels: [
      { cost: 3000, hp: 1200, townHall: 5, range: 4.5, gnomeBoostPct: 25, hypeNeeded: 40, beatSeconds: 6, beatPct: 60 },
      { cost: 7000, hp: 1500, townHall: 6, range: 5, gnomeBoostPct: 35, hypeNeeded: 36, beatSeconds: 7, beatPct: 70 },
      { cost: 15000, hp: 1875, townHall: 7, range: 5.5, gnomeBoostPct: 45, hypeNeeded: 32, beatSeconds: 8, beatPct: 80 },
      { cost: 35000, hp: 2344, townHall: 8, range: 6, gnomeBoostPct: 55, hypeNeeded: 28, beatSeconds: 9, beatPct: 90 },
      { cost: 70000, hp: 2930, townHall: 9, range: 6.5, gnomeBoostPct: 70, hypeNeeded: 24, beatSeconds: 10, beatPct: 100 }
    ]
  },
  // The Brisket King's altar (src/logic/hero.js): the building the hero guards and levels up with (its level
  // is his level; heroHp / heroDamage per level). He walks out to fight ground enemies inside guardRange
  // (tiles from the altar), hits every attackInterval s, and goes back when it's clear. After a wave he
  // sleeps to heal: the share of health he lost x maxSleepSeconds (knocked out: the full time), then takes
  // wakeSeconds to get up. Brisket Feast (feast): from the hotbar during a wave, once per wave.
  altar: {
    name: "Brisket King Altar",
    heroName: "Brisket King",
    size: 2,
    unlockTownHall: 4,
    hero: {
      speed: 1.3, attackInterval: 1, attackRange: 0.75, guardRange: 6, maxSleepSeconds: 120, wakeSeconds: 1.5,
      feast: { healPct: 40, boostSeconds: 6, damagePct: 50, speedPct: 40, slamRadius: 1.5, slamMult: 2, stunSeconds: 1 }
    },
    levels: [
      { cost: 3000, hp: 900, heroHp: 1100, heroDamage: 80 },
      // His upgrades (Levels 2-10) cost Burgers (RP), like the RV Lab and Fuel Station (user, 2026-11-20); each fits
      // the Burger cap (rules.rpCaps) of the RV Lab a village can have at the Village Hall that level needs
      // (Level N needs VH N; the lab reaches level VH - 3). Level 5+ needs an RV Lab (no lab: cap 400).
      { cost: 150, costCurrency: 'rp', hp: 1125, heroHp: 1320, heroDamage: 94 },
      { cost: 250, costCurrency: 'rp', hp: 1406, heroHp: 1584, heroDamage: 111 },
      { cost: 400, costCurrency: 'rp', hp: 1758, heroHp: 1901, heroDamage: 131 },
      { cost: 650, costCurrency: 'rp', hp: 2197, heroHp: 2281, heroDamage: 155 },
      { cost: 1000, costCurrency: 'rp', hp: 2747, heroHp: 2737, heroDamage: 183 },
      { cost: 1600, costCurrency: 'rp', hp: 3433, heroHp: 3285, heroDamage: 216 },
      { cost: 2500, costCurrency: 'rp', hp: 4292, heroHp: 3941, heroDamage: 255 },
      { cost: 4000, costCurrency: 'rp', hp: 5364, heroHp: 4730, heroDamage: 301 },
      { cost: 6000, costCurrency: 'rp', hp: 6706, heroHp: 5676, heroDamage: 355 }
    ]
  },
  // The Hatsune Queen's altar (src/logic/queen.js, v0.8): the second hero, a crossbow sniper. Her level is the
  // altar's (heroHp / heroDamage per level). She guards guardRange tiles around the altar and shoots ground AND air
  // enemies from attackRange, a bolt every attackInterval s (boltSpeed tiles/s). She stays back: a ground enemy
  // closer than keepAway tiles makes her step away from it (inside her guard area). Sleep, knockouts and waking work
  // like the Brisket King's. Encore Cloak (encore): from the hotbar during a wave, once per wave: for `seconds` she
  // can't be targeted, her bolts deal +damagePct% and pierce `pierce` more enemies, and she heals healPct%.
  // She comes at Village Hall 8 (limits.queenAltar). Level 1 costs gold; Levels 2-10 cost Burgers and each needs the
  // `townHall` on its level (VH8-15). From VH8 a village can have a Level 5 RV Lab, so every price fits the top
  // Burger cap (rules.rpCaps: 10,000).
  queenAltar: {
    name: "Hatsune Queen Altar",
    heroName: "Hatsune Queen",
    size: 2,
    unlockTownHall: 8,
    hero: {
      speed: 1.4, attackInterval: 0.8, attackRange: 5, guardRange: 8, keepAway: 2.5, boltSpeed: 18,
      maxSleepSeconds: 120, wakeSeconds: 1.5,
      encore: { seconds: 4, damagePct: 150, pierce: 2, healPct: 30 }
    },
    levels: [
      { cost: 25000, townHall: 8, hp: 2400, heroHp: 2400, heroDamage: 160 },
      { cost: 1500, costCurrency: 'rp', townHall: 8, hp: 2760, heroHp: 2580, heroDamage: 171 },
      { cost: 2200, costCurrency: 'rp', townHall: 9, hp: 3174, heroHp: 2774, heroDamage: 182 },
      { cost: 3000, costCurrency: 'rp', townHall: 9, hp: 3650, heroHp: 2982, heroDamage: 195 },
      { cost: 4000, costCurrency: 'rp', townHall: 10, hp: 4198, heroHp: 3205, heroDamage: 208 },
      { cost: 5000, costCurrency: 'rp', townHall: 11, hp: 4827, heroHp: 3446, heroDamage: 222 },
      { cost: 6000, costCurrency: 'rp', townHall: 12, hp: 5551, heroHp: 3704, heroDamage: 237 },
      { cost: 7000, costCurrency: 'rp', townHall: 13, hp: 6384, heroHp: 3982, heroDamage: 253 },
      { cost: 8000, costCurrency: 'rp', townHall: 14, hp: 7342, heroHp: 4281, heroDamage: 270 },
      { cost: 9500, costCurrency: 'rp', townHall: 15, hp: 8443, heroHp: 4602, heroDamage: 288 }
    ]
  },
  // Gnome villagers all live in Villager Houses (house.levels[].gnomes; their stats come from the same
  // table). By day each works a mine (up to maxPerMine per mine), mining its own gold into a sack for
  // storage; during an attack they repair damaged buildings (up to maxRepairersPerBuilding each). A gnome
  // whose house is destroyed stops working and shelters in the Village Hall.
  villagers: {
    maxPerMine: 2,
    sackSeconds: 20,      // a gnome's sack is full after this long working (then it carries it to storage)
    walkSpeed: 0.7,       // tiles per second (gold trips are timed at this pace, tripDetour x the straight line)
    tripDetour: 1.25,
    maxRepairersPerBuilding: 2,
    // A building hit within this many seconds is under fire: gnomes wait nearby instead of repairing it.
    repairDelayAfterHit: 3
  },
  // Walls are single tiles (segmentLength 1) that join into a fence with every wall touching them. They
  // used to be 3-tile segments: per wall, the price is a third of a segment's (the same per tile), the HP is
  // a segment's, and 3x as many are allowed. (segmentLength > 1 brings back straight segments rotated with R.)
  // Eight levels, one picture each (bld_wall_lv1..8, the lava tower on top). Wall levels unlock at Village
  // Hall 1, 2, 3, 5, 7, 8, 9 and 10 (townHall). Cheap on purpose, so a broken village can wall up again fast.
  // Levels 1-6 break in one Wall Breaker blast (2,400); Levels 7-8 take two.
  // Walls all share one level (state.wallLevel): "Upgrade Walls" raises every wall at once for walls placed x
  // the new level's cost, and a new wall costs the sum of the costs up to the current level (buildings.js).
  // Upgrading a full set (limits.wall) when a level unlocks costs 720 (L2, VH2), 1,920 (L3, VH3), 5,760 (L4, VH5),
  // 14,400 (L5, VH7), 32,400 (L6, VH8), 60,000 (L7, VH9) and 105,600 (L8, VH10): about 1.5-8 minutes of full
  // mines, from VH7 on less than the hall upgrade that unlocked the level, and always well inside that hall's
  // gold capacity. A full set of new Level 8 walls is 132 x 1,900.
  walls: {
    name: "Wall",
    segmentLength: 1,
    unlockTownHall: 1,
    levels: [
      { cost: 10, hp: 400, townHall: 1 },
      { cost: 20, hp: 550, townHall: 2 },
      { cost: 40, hp: 800, townHall: 3 },
      { cost: 80, hp: 1150, townHall: 5 },
      { cost: 150, hp: 1600, townHall: 7 },
      { cost: 300, hp: 2200, townHall: 8 },
      { cost: 500, hp: 2980, townHall: 9 },
      { cost: 800, hp: 3800, townHall: 10 }
    ]
  },
  defenses: {
    // v0.5: damage +10% (the weakest per building in the balance runs; 44 still two-shots a Grunt through wave 4).
    cannon: {
      name: "Cannon",
      hitsGround: true,
      hitsAir: false,
      fireInterval: 1.5,
      range: 6,
      minRange: 0,
      splashRadius: 0,
      unlockTownHall: 1,
      levels: [
        { cost: 150, hp: 400, damage: 44 },
        { cost: 300, hp: 500, damage: 55 },
        { cost: 600, hp: 625, damage: 69 },
        { cost: 1200, hp: 781, damage: 86 },
        { cost: 2400, hp: 977, damage: 108 },
        { cost: 4800, hp: 1221, damage: 135 },
        { cost: 9600, hp: 1526, damage: 169 },
        { cost: 19200, hp: 1908, damage: 212 },
        { cost: 38400, hp: 2385, damage: 265 },
        { cost: 76800, hp: 2981, damage: 331 }
      ]
    },
    // Anti-air only: rockets burst among flyers. Fragile, and only a few allowed. v0.5: damage -10% (the Spear
    // Thrower now hits flyers too).
    firework: {
      name: "Firework Launcher",
      hitsGround: false,
      hitsAir: true,
      fireInterval: 1.5,
      range: 7.5,
      minRange: 0,
      splashRadius: 1,
      unlockTownHall: 3,
      levels: [
        { cost: 500, hp: 250, damage: 81 },
        { cost: 1000, hp: 313, damage: 102 },
        { cost: 2000, hp: 391, damage: 127 },
        { cost: 4000, hp: 488, damage: 158 },
        { cost: 8000, hp: 610, damage: 198 },
        { cost: 16000, hp: 763, damage: 248 },
        { cost: 32000, hp: 954, damage: 309 },
        { cost: 64000, hp: 1192, damage: 386 },
        { cost: 128000, hp: 1490, damage: 482 },
        { cost: 256000, hp: 1863, damage: 604 }
      ]
    },
    // v0.5: damage -10% (air cover is shared with the Spear Thrower now).
    archer: {
      name: "Locklair Tower",
      hitsGround: true,
      hitsAir: true,
      fireInterval: 0.5,
      range: 7,
      minRange: 0,
      splashRadius: 0,
      unlockTownHall: 2,
      levels: [
        { cost: 250, hp: 350, damage: 11 },
        { cost: 500, hp: 438, damage: 14 },
        { cost: 1000, hp: 547, damage: 17 },
        { cost: 2000, hp: 684, damage: 21 },
        { cost: 4000, hp: 854, damage: 26 },
        { cost: 8000, hp: 1068, damage: 32 },
        { cost: 16000, hp: 1335, damage: 41 },
        { cost: 32000, hp: 1669, damage: 50 },
        { cost: 64000, hp: 2086, damage: 63 },
        { cost: 128000, hp: 2608, damage: 79 }
      ]
    },
    // v0.5: damage -5% (with Gandolf, the strongest per building in the balance runs).
    mortar: {
      name: "Litman Mortar",
      hitsGround: true,
      hitsAir: false,
      fireInterval: 4,
      range: 10,
      minRange: 3,
      splashRadius: 1.5,
      unlockTownHall: 2,
      levels: [
        { cost: 400, hp: 450, damage: 48 },
        { cost: 800, hp: 563, damage: 60 },
        { cost: 1600, hp: 703, damage: 74 },
        { cost: 3200, hp: 879, damage: 93 },
        { cost: 6400, hp: 1099, damage: 116 },
        { cost: 12800, hp: 1374, damage: 145 },
        { cost: 25600, hp: 1718, damage: 181 },
        { cost: 51200, hp: 2148, damage: 227 },
        { cost: 102400, hp: 2685, damage: 284 },
        { cost: 204800, hp: 3356, damage: 355 }
      ]
    },
    // Long-range lobber with a big dead zone. Light impact, but it leaves a pink pool that hurts ground
    // troops standing in it (poolDps, every POOL_TICK) and slows them. Only 6 levels (3 pictures).
    // Hidden trap (src/logic/traps.js): enemies never see, target or path around it and walk over it.
    // The first ground enemy onto its tile springs it: every ground enemy within `range` tiles takes
    // `damage` and is held in place for `hold` s. Once per wave; it resets when the wave is cleared.
    mousetrap: {
      name: "Mousetrap",
      trap: true,
      size: 1,
      hitsGround: true,
      hitsAir: false,
      range: 1.5,    // catch radius from the trap's center
      minRange: 0,
      unlockTownHall: 2,
      levels: [
        { cost: 300, hp: 300, damage: 150, hold: 3 },
        { cost: 600, hp: 375, damage: 200, hold: 3.2 },
        { cost: 1200, hp: 469, damage: 255, hold: 3.3 },
        { cost: 2400, hp: 586, damage: 315, hold: 3.5 },
        { cost: 4800, hp: 732, damage: 380, hold: 3.7 },
        { cost: 9600, hp: 915, damage: 450, hold: 3.8 },
        { cost: 19200, hp: 1144, damage: 525, hold: 4 },
        { cost: 38400, hp: 1430, damage: 600, hold: 4.2 },
        { cost: 76800, hp: 1788, damage: 650, hold: 4.3 },
        { cost: 153600, hp: 2235, damage: 700, hold: 4.5 }
      ]
    },
    // v0.5: upgrades cheaper (it was the worst value per gold). Support: never attacks. Marks enemies in range (+markBonus% damage from all defenses, strongest tower
    // wins) and reveals invisible ones. Range grows with level. See src/logic/flock.js.
    flock: {
      name: "F.L.O.C.K Tower",
      support: true,
      size: 1,       // a slim tower: one tile instead of the usual 2x2
      hitsGround: true,
      hitsAir: true,
      range: 6,      // level 1 (each level has its own range below)
      minRange: 0,
      unlockTownHall: 3,
      levels: [
        { cost: 600, hp: 400, range: 6, markBonus: 15 },
        { cost: 1200, hp: 500, range: 6.25, markBonus: 17 },
        { cost: 2400, hp: 625, range: 6.5, markBonus: 19 },
        { cost: 4800, hp: 781, range: 6.75, markBonus: 21 },
        { cost: 9600, hp: 977, range: 7, markBonus: 24 },
        { cost: 16000, hp: 1221, range: 7.25, markBonus: 26 },
        { cost: 28000, hp: 1526, range: 7.5, markBonus: 28 },
        { cost: 50000, hp: 1907, range: 7.75, markBonus: 30 },
        { cost: 90000, hp: 2384, range: 8, markBonus: 32 },
        { cost: 150000, hp: 2981, range: 8.5, markBonus: 35 }
      ]
    },
    // v0.5: upgrades cheaper (it cost about 3x as much per wave held as the other towers). Beam tower
    // (src/logic/beams.js), like the Inferno Tower: locks onto the highest-HP enemy in range and
    // burns it with `dps` damage per second, heating up the longer it stays on that enemy (stages).
    ra: {
      name: "Tower of Rah",
      beam: true,
      hitsGround: true,
      hitsAir: true,
      range: 6,
      minRange: 0,
      tickInterval: 0.2,
      stages: [{ after: 0, mult: 1 }, { after: 2, mult: 3 }, { after: 5, mult: 8 }],
      // Once locked on, the beam holds its target this many tiles past its range (v0.6.3): a flyer hovering at the
      // edge (La Vaca Saturno, nudged by the crowd) kept stepping out and back, so the beam kept starting cold.
      leash: 0.75,
      unlockTownHall: 6,
      levels: [
        { cost: 5000, hp: 450, dps: 20 },
        { cost: 6000, hp: 563, dps: 25 },
        { cost: 8000, hp: 703, dps: 30 },
        { cost: 11000, hp: 879, dps: 36 },
        { cost: 15000, hp: 1099, dps: 43 },
        { cost: 20000, hp: 1373, dps: 51 },
        { cost: 35000, hp: 1717, dps: 60 },
        { cost: 50000, hp: 2146, dps: 70 }
      ]
    },
    catapult: {
      name: "The Diddypult",
      hitsGround: true,
      hitsAir: false,
      fireInterval: 5,
      range: 16,
      minRange: 6,
      splashRadius: 1,
      pool: { radius: 1.5, duration: 5, slow: 0.25 },
      unlockTownHall: 10, // the final unlock: last in the shop
      // 5 levels, one picture each (Levels 4 and 5 added in v0.5). Level 1 is the user's (20 impact, 8 pool dps);
      // v0.5 rebalance: x1.7 per level (was x1.25) so Level 5 holds up at Village Hall 10, and cheaper top levels.
      levels: [
        { cost: 30000, hp: 600, damage: 20, poolDps: 8 },
        { cost: 50000, hp: 750, damage: 34, poolDps: 14 },
        { cost: 80000, hp: 938, damage: 58, poolDps: 23 },
        { cost: 120000, hp: 1172, damage: 98, poolDps: 39 },
        { cost: 170000, hp: 1465, damage: 167, poolDps: 67 }
      ]
    },
    // Long-range sniper (ground and air): slow, hard-hitting spears that pierce. The first enemy takes 100% damage and
    // each further enemy along the line behind it takes pierce.falloff less (100 / 75 / 50 / 25%), up to pierce.max
    // enemies within pierce.length tiles behind the first. The line pierces only the first target's layer (a spear
    // thrown at a flyer hits flyers, one thrown at a ground enemy hits ground enemies: combat.js fireSpear).
    spear: {
      name: "Spear Thrower",
      hitsGround: true,
      hitsAir: true,
      fireInterval: 2.5,
      range: 8.5,
      minRange: 0,
      splashRadius: 0,
      pierce: { max: 4, falloff: 0.25, length: 3 },
      unlockTownHall: 3,
      // 10 levels, a picture per 2 (like the Cannon): cost doubles per level (the top two less, so they fit in the
      // gold a village can hold), HP and damage x1.25 per level.
      levels: [
        { cost: 900, hp: 300, damage: 90 },
        { cost: 1800, hp: 375, damage: 113 },
        { cost: 3600, hp: 469, damage: 141 },
        { cost: 7200, hp: 586, damage: 176 },
        { cost: 14400, hp: 732, damage: 220 },
        { cost: 28800, hp: 916, damage: 275 },
        { cost: 57600, hp: 1144, damage: 343 },
        { cost: 100000, hp: 1430, damage: 429 },
        { cost: 180000, hp: 1788, damage: 536 },
        { cost: 280000, hp: 2235, damage: 671 }
      ]
    },
    // KSI Tower (v0.6): an ice tower (ground and air). It lobs bottles that burst in a splash, dealing light damage and
    // chilling every enemy hit: `slow` (0.3 = 30% slower) for chill.seconds (combat.js chillEnemy). Slows never stack:
    // the strongest slow on an enemy wins (Catapult pools, glue, Hamstring...). Bosses (Da Baby Car) shrug off half the
    // slow, like the Ice Bag spell's bossSlow. Chilled enemies show icy blue.
    // Balance: about a Gandolf Tower's damage per second (a bit less, with a slower bottle and a wider splash), traded
    // for the slow. Unlocks at Village Hall 5, just before the later raiders (Rahhh Skeleton's rage, La Vaca Saturno),
    // so a slow is there for them. 10 levels, a picture per 2; cost between Gandolf's and the Tower of Rah's.
    ksi: {
      name: "KSI Tower",
      hitsGround: true,
      hitsAir: true,
      fireInterval: 1.6,
      range: 6.5,
      minRange: 0,
      splashRadius: 1.25,
      chill: { seconds: 2.5, bossShare: 0.5 },
      unlockTownHall: 5,
      levels: [
        { cost: 3000, hp: 500, damage: 26, slow: 0.3 },
        { cost: 4500, hp: 625, damage: 32, slow: 0.32 },
        { cost: 6500, hp: 781, damage: 40, slow: 0.34 },
        { cost: 9500, hp: 977, damage: 50, slow: 0.36 },
        { cost: 14000, hp: 1221, damage: 63, slow: 0.38 },
        { cost: 21000, hp: 1526, damage: 78, slow: 0.4 },
        { cost: 32000, hp: 1907, damage: 98, slow: 0.42 },
        { cost: 50000, hp: 2384, damage: 122, slow: 0.44 },
        { cost: 80000, hp: 2980, damage: 153, slow: 0.47 },
        { cost: 120000, hp: 3725, damage: 191, slow: 0.5 }
      ]
    },
    // v0.5: damage -7% (splash on ground and air: the strongest per building in the balance runs).
    wizard: {
      name: "Gandolf Tower",
      hitsGround: true,
      hitsAir: true,
      fireInterval: 1,
      range: 4.5,
      minRange: 0,
      splashRadius: 1,
      unlockTownHall: 3,
      levels: [
        { cost: 600, hp: 400, damage: 20 },
        { cost: 1200, hp: 500, damage: 26 },
        { cost: 2400, hp: 625, damage: 32 },
        { cost: 4800, hp: 781, damage: 40 },
        { cost: 9600, hp: 977, damage: 50 },
        { cost: 19200, hp: 1221, damage: 63 },
        { cost: 38400, hp: 1526, damage: 79 },
        { cost: 76800, hp: 1908, damage: 99 },
        { cost: 153600, hp: 2385, damage: 124 },
        { cost: 307200, hp: 2981, damage: 154 }
      ]
    }
  },
  // Defense merging (v0.8, user 2026-11-22; src/logic/merge.js). Two max-level copies of a type listed here combine
  // into ONE merged building (b.merged) at the selected one's spot; the other copy is removed (no rubble). It counts as
  // 2 toward the type's limit (countOwned: merging frees no slot), so its stats are about two max-level copies'
  // worth (damage per second ~2x, health ~2x) plus its ability, and it can't merge again (one merge level).
  //   cost        Burgers (rp, about a top RV Lab perk: 3,000) AND gold (about the type's own last upgrade); between
  //               waves only. Both fit a Village Hall 10 village (Burger cap 10,000 with RV Lab 5; ~309,500 gold).
  //   hpMult / rangeAdd   health and range of the merged building.
  //   damageMult  damage of each regular shot; fireIntervalMult  time between shots. Timed perk specials (Flak,
  //               Broadside, Volley Lock, Earthquake...) get damageMult / fireIntervalMult, the shots' DPS gain, so
  //               nothing goes past two buildings' worth (see mergeDpsMult in buildings.js).
  //   ability     the merged ability's own numbers (roll / bolt / triple below; read by combat.js).
  //   mastery     a 3-tier track in the RV Lab that only upgrades the merged ability: Burgers per tier (`costs`), tier N
  //               needs RV Lab level `labLevel[N - 1]`; it is not part of the one-path lock. Tiers add up (each tier's
  //               fx merges with the ones before, like perks). Researched per type, like perks (state.mastery).
  //   art         the merged picture (key); until it exists the max-level picture stands in, drawn standInScale bigger
  //               with a gold glow. scale: the real picture's size against the max-level one,
  //               chosen from each picture's visible pixels so the merged building looks 25% bigger than the Level 10 one.
  merges: {
    // Mega Cannon: 3.2x damage per shot at 1.6x the interval (2x DPS, two Cannons' worth). Rolling Thunder: every shot rolls on past its
    // target `length` tiles at `speed`, hitting every ground enemy within hitRadius of its path for full damage, then
    // bursts (burstRadius, burstDamage x the shot's damage, ground only). Heavy Shot's pierce perks extend the roll
    // instead (pierceLengthShare x their pierceLength); their knockback and stun hit everything it rolls through.
    cannon: {
      name: 'Mega Cannon',
      ability: 'Rolling Thunder',
      abilityIcon: 'ui_ability_rolling_thunder',
      abilityShort: 'Shots roll on through every ground enemy in their path.',
      abilityText: 'Every shot is a huge cannonball that keeps rolling 4 tiles past its target, hitting every ground enemy in its path for full damage, then bursts at the end.',
      cost: { gold: 76800, rp: 3000 },
      hpMult: 2, rangeAdd: 0.5, damageMult: 3.2, fireIntervalMult: 1.6,
      roll: { length: 4, speed: 7, hitRadius: 0.55, burstRadius: 1.25, burstDamage: 0.5, pierceLengthShare: 0.4, bossSlow: 0.5 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Heavier Ball', desc: 'The cannonball rolls 2 tiles further.', fx: { rollAdd: 2 } },
          { name: 'Shockwave', desc: 'The burst at the end of the roll stuns every ground enemy in it for 0.5 s (bosses are slowed instead).', fx: { burstStun: 0.5 } },
          { name: 'Scorched Path', desc: 'The ball leaves a burning trail: ground enemies on it burn for 15% of its damage every second for 3 s.', fx: { trailDps: 0.15, trailSeconds: 3, trailRadius: 0.5 } }
        ]
      },
      // Four facings like the Cannon's own (turned toward its target; down-left is the plain picture for windows).
      art: {
        key: 'bld_cannon_merged_dl', scale: 1.08, standInScale: 1.08, // v0.8.3: 1.15 -> 1.08 (a little smaller)
        facings: { dl: 'bld_cannon_merged_dl', dr: 'bld_cannon_merged_dr', ul: 'bld_cannon_merged_ul', ur: 'bld_cannon_merged_ur' }
      }
    },
    // Locklair Citadel: fast arrows at 2x damage (2x DPS). Ballista Bolt: every `every`th shot is a bolt for `mult` x damage
    // that pins its target for pinSeconds (held: no moving or attacking, flyers too; a pinned dasher's dash ends with
    // no impact). Bosses (Da Baby Car) are slowed by bossSlow instead, never pinned.
    archer: {
      name: 'Locklair Citadel',
      ability: 'Ballista Bolt',
      abilityIcon: 'ui_ability_ballista_bolt',
      abilityShort: 'Every 5th shot is a 4x bolt that pins its target.',
      abilityText: 'Every 5th shot is a big ballista bolt: 4x damage, and it pins its target for 1 s (flyers too; bosses are only slowed). A pinned Quandale Dingle\'s dash ends.',
      cost: { gold: 128000, rp: 3000 },
      hpMult: 2, rangeAdd: 0.5, damageMult: 2, fireIntervalMult: 1,
      bolt: { every: 5, mult: 4, pinSeconds: 1, bossSlow: 0.5, skewerLength: 3 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Quick Crank', desc: 'A Ballista Bolt every 4th shot.', fx: { boltEvery: 4 } },
          { name: 'Barbed Bolt', desc: 'Bolts pin for 1.5 s, and pinned enemies take 20% more damage from everything.', fx: { pinSeconds: 1.5, pinVuln: 0.2 } },
          { name: 'Skewer', desc: 'The bolt passes through its target and pins one more enemy behind it.', fx: { skewer: 1 } }
        ]
      },
      art: { key: 'bld_archer_merged', scale: 1.15, standInScale: 1.15 }
    },
    // Litman Triple Mortar (the user's picture: three barrels). Triple Strike: every volley is `shells` shells, each
    // shellMult x a max-level shell's damage (about 2x when all three hit), same interval and splash. One lands on the
    // target; the others on the next enemies in range (not already under a shell, spread out), else `spread` tiles around
    // the target. Heavy once-per-shot perks (Cluster Shell, Seismic Charge, Fault Line, Aftershock, Craters, fire patches:
    // sideShellDrops) only come with the main shell; Barrage / Ready Rack add single full shells, as on any Mortar.
    mortar: {
      name: 'Litman Triple Mortar',
      ability: 'Triple Strike',
      abilityIcon: 'ui_ability_triple_strike',
      abilityShort: 'Fires three shells at once, at three enemies.',
      abilityText: 'Every volley fires three shells at once: one on its target, the others on the next enemies in range (or around the target), each at 67% damage with the full splash.',
      cost: { gold: 204800, rp: 3000 },
      hpMult: 2, rangeAdd: 1, damageMult: 1, fireIntervalMult: 1,
      triple: { shells: 3, shellMult: 0.67, spread: 1.2, spreadApart: 1.1, sideShellDrops: ['cluster', 'bounce', 'crack', 'aftershock', 'craterSlow', 'fireRadius'] },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Quick Reload', desc: 'Fires 15% more often.', fx: { fireIntervalMult: 0.85 } },
          { name: 'Concussion', desc: 'Each shell slows the enemies it hits by 30% for 2 s.', fx: { slowOnHit: 0.3, slowSeconds: 2 } },
          { name: 'Synchronized Impact', desc: 'When 2 or more shells of a volley land within 1.5 tiles of each other, a combined blast hits for 50% of a shell\'s damage and stuns for 0.5 s.', fx: { syncRadius: 1.5, syncDamage: 0.5, syncStun: 0.5 } }
        ]
      },
      art: { key: 'bld_mortar_merged', scale: 1.24, standInScale: 1.15 }
    },
    // Missile Silo: 2x damage (normal splash bursts). Sky Net: every `every` s, on top of its rockets, a net rocket
    // (flightTime s) flies to the spot in range covering the most flyers (and ground troops with Ground Show); it opens
    // there for `seconds`: everything inside `radius` is slowed `slow` (the strongest slow wins, like pools) and pulled
    // toward the middle (at most `pull` tiles over the whole net). Bosses are slowed, never pulled.
    // art: two pictures, aiming left / right (facings), turned toward its target like the Cannon's facings, drawn
    // `scale` x the max-level picture's size.
    firework: {
      name: 'Missile Silo',
      ability: 'Sky Net',
      abilityIcon: 'ui_ability_sky_net',
      abilityShort: 'Every 6 s a net rocket pulls a group of flyers together and slows them.',
      abilityText: 'Every 6 s it also fires a net rocket at the biggest group of flyers in range: for 3 s the net pulls them together and slows them 50% (bosses are only slowed). With Ground Show it catches ground troops too.',
      cost: { gold: 256000, rp: 3000 },
      hpMult: 2, rangeAdd: 0.5, damageMult: 2, fireIntervalMult: 1,
      net: { every: 6, flightTime: 0.5, radius: 1.5, seconds: 3, pull: 1.5, slow: 0.5, linger: 0.25, coreRadius: 0.2 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Wider Net', desc: 'The net is 1 tile wider.', fx: { netRadiusAdd: 1 } },
          { name: 'Tangled', desc: 'Enemies in the net take 20% more damage from everything.', fx: { netVuln: 0.2 } },
          { name: 'Double Net', desc: 'Fires two nets, at the two biggest groups.', fx: { nets: 2 } }
        ]
      },
      art: { key: 'bld_firework_merged_left', facings: { left: 'bld_firework_merged_left', right: 'bld_firework_merged_right' }, scale: 1.32, standInScale: 1.15 }
    },
    // Gandolf the Grand (v0.8.2): 2x damage (his normal splash fireballs, 2x DPS). You Shall Not Pass (wizardWall.js): every
    // `every` s, when a ground enemy is in range, a glowing wall `length` tiles long for `seconds`, `ahead` tiles in front of
    // the biggest ground crowd in range (at least minFromTower from the tower). Ground troops within `thickness` of it are
    // held there (renewed every step with `linger`), bosses only slowed (bossSlow); flyers and burrowed tunnelers pass.
    wizard: {
      name: 'Gandolf the Grand',
      ability: 'You Shall Not Pass',
      abilityIcon: 'ui_ability_shall_not_pass',
      abilityShort: 'Every 10 s a magic wall stops ground enemies in their tracks.',
      abilityText: 'Every 10 s he slams his staff and raises a magic wall in front of the biggest group of ground enemies in range: for 3 s nothing on the ground gets through, so they pile up for his fireballs (bosses are only slowed; flyers go over).',
      cost: { gold: 307200, rp: 3000 },
      hpMult: 2, rangeAdd: 0.5, damageMult: 2, fireIntervalMult: 1,
      wall: { every: 10, seconds: 3, length: 3, thickness: 0.45, ahead: 1, minFromTower: 1.5, linger: 0.2, bossSlow: 0.5 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Wider Wall', desc: 'The wall is 1.5 tiles longer and stands 1 s longer.', fx: { wallLengthAdd: 1.5, wallSecondsAdd: 1 } },
          { name: 'Searing Ward', desc: 'Enemies held at the wall burn for 30% of his fireball damage every second.', fx: { wallBurn: 0.3 } },
          { name: 'Double Cast', desc: 'A second wall rises behind the crowd, trapping it between the two.', fx: { walls: 2 } }
        ]
      },
      art: { key: 'bld_wizard_merged', scale: 1.2, standInScale: 1.15 }
    },
    // F.L.O.C.K Mothership (v0.8.2): the support tower that fights back, like a tesla coil. It keeps marking (markAdd: +5% on
    // its marks; +0.5 mark range) and Triple Zap (flockZap.js): every `every` s it zaps the `targets` closest enemies within
    // zap `range` tiles (ground and air, shorter than its marking range), `damage` each (its own mark adds to that).
    flock: {
      name: 'F.L.O.C.K Mothership',
      ability: 'Triple Zap',
      abilityIcon: 'ui_ability_triple_zap',
      abilityShort: 'Zaps the 3 closest enemies at once, every second.',
      description: 'The F.L.O.C.K fights back. It still marks every enemy in its range so your defenses hit them harder, and reveals invisible ones, but now it zaps them too.',
      abilityText: 'The F.L.O.C.K fights back: every second it zaps the 3 closest enemies within 5.5 tiles at once (ground and air) for 60 damage each, and its own mark makes the zaps hit harder. It still marks enemies, a little stronger.',
      cost: { gold: 150000, rp: 3000 },
      hpMult: 2, rangeAdd: 0.5, markAdd: 5,
      zap: { every: 1, range: 5.5, damage: 60, targets: 3, bossSlow: 0.5 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Fourth Bolt', desc: 'Zaps 4 enemies at once instead of 3.', fx: { zapTargets: 4 } },
          { name: 'Overcharge', desc: 'Zaps deal 50% more damage to enemies under half health.', fx: { zapLowMult: 1.5 } },
          { name: 'EMP Pulse', desc: 'Every 12 s, a pulse stuns every enemy in zap range for 0.75 s (bosses are slowed).', fx: { empEvery: 12, empSeconds: 0.75 } }
        ]
      },
      // Its base is a diamond whose side corners are 16% of the way up the picture and span its full width, so it stands by
      // them (`ground` 0.16 goes on the tile's center, BuildingView). The user's pick (v0.9.1): the base's corners on the
      // tile's edge (1.02 tiles wide). The F.L.O.C.K Tower was then drawn smaller (SPRITE_SCALE.flock 1.15 -> 0.9) so a
      // Level 10 one stands clearly below it; 1.15 keeps the Mothership the same size (0.9 x 1.15 = 1.15 x 0.9): at zoom 2
      // it's 66 x 95 px against a Level 10 F.L.O.C.K Tower's 57 x 87.
      art: { key: 'bld_flock_merged', scale: 1.15, standInScale: 1.25, ground: 0.16 }
    },
    // Harpoon Ballista (v0.8.3): spears at 2x damage (2x DPS). Reel In (harpoon.js): every `every`th throw is a harpoon at
    // the toughest enemy in range (most current health, ground or air) that drags it `pull` tiles back the way it came
    // over pullSeconds (away from the tower if it's standing still); ground enemies stop at walls and buildings. Bosses
    // are only slowed (bossSlow for bossSlowSeconds). No pierce, bleed, vulnerability, slow or stun: its perks have those.
    spear: {
      name: 'Harpoon Ballista',
      ability: 'Reel In',
      abilityIcon: 'ui_ability_reel_in',
      abilityShort: 'Every 3rd throw harpoons the toughest enemy and drags it 3 tiles back.',
      description: 'Two Spear Throwers bolted into one giant ballista. Its spears hit twice as hard, and every few throws it harpoons the toughest enemy in range and hauls it back.',
      abilityText: 'Every 3rd throw is a harpoon aimed at the toughest enemy in range (ground or air): it drags it 3 tiles back the way it came, and walls stop the drag. Bosses are only slowed.',
      cost: { gold: 280000, rp: 3000 },
      hpMult: 2, damageMult: 2, fireIntervalMult: 1, rangeAdd: 0.5,
      harpoon: { every: 3, pull: 3, pullSeconds: 0.4, bossSlow: 0.5, bossSlowSeconds: 2, dragRadius: 0.6 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Longer Chain', desc: 'The harpoon drags enemies 2 tiles further.', fx: { harpoonPullAdd: 2 } },
          { name: 'Dragnet', desc: 'Enemies the harpooned one is dragged through take 25% of the harpoon\'s hit.', fx: { harpoonDrag: 0.25 } },
          { name: 'Double Hook', desc: 'Harpoons the two toughest enemies in range at once.', fx: { harpoonHooks: 2 } }
        ]
      },
      // Four facings like the Spear Thrower's own (turned toward its target; down-left is the plain picture for windows).
      art: {
        key: 'bld_spear_merged_dl', scale: 1.05, standInScale: 1.25, // v0.8.7: 1.25 -> 1.15; v0.8.10: 1.05, so its tile's outline shows
        facings: { dl: 'bld_spear_merged_dl', dr: 'bld_spear_merged_dr', ul: 'bld_spear_merged_ul', ur: 'bld_spear_merged_ur' }
      }
    },
    // KSI Frost Fortress (v0.8.11): bottles at 2x damage (2x DPS). Shatter (shatter.js): an enemy its bottles chilled
    // that dies while still chilled (whatever kills it) bursts into ice shards: `radius` tiles around it, `mult` x one of
    // its bottles' damage to every enemy there, ground and air. A shard kill on another enemy it chilled shatters that
    // one too (a chain through a crowd), one step later. No slow, freeze, ice patch, blizzard, splash or bounce: its
    // perks have those.
    ksi: {
      name: 'KSI Frost Fortress',
      ability: 'Shatter',
      abilityIcon: 'ui_ability_shatter',
      abilityShort: 'Enemies it chilled burst into ice shards when they die.',
      description: 'Two KSI Towers frozen into one fortress. Its bottles hit twice as hard, and anything it has chilled shatters into ice shards when it falls, hurting everything around it.',
      abilityText: 'Every enemy its bottles chill shatters if it dies while still chilled, whatever finishes it: ice shards hit every enemy within 1.5 tiles (ground and air) for a full bottle\'s damage. A shard kill on another chilled enemy shatters that one too.',
      cost: { gold: 120000, rp: 3000 },
      hpMult: 2, damageMult: 2, fireIntervalMult: 1, rangeAdd: 0.5,
      shatter: { radius: 1.5, mult: 1 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'Bigger Burst', desc: 'Ice shards fly 0.5 tile further.', fx: { shatterRadiusAdd: 0.5 } },
          { name: 'Sharp Shards', desc: 'Ice shards deal 150% of a bottle\'s damage.', fx: { shatterMult: 1.5 } },
          { name: 'Splinter', desc: 'Ice shards chill everything they hit, so those enemies can shatter too.', fx: { shatterChill: 1 } }
        ]
      },
      // Its base is a round ice mound, widest 15-20% of the way up the picture (Level 10's is widest at 8-13%), so it stands
      // by its side corners (`ground` 0.18: that height goes on the footprint's center, BuildingView), sitting on its tile
      // like a Level 10 one (its bottom 28 px below the tile's center at zoom 1, Level 10's 25). Measured on the trimmed
      // picture: at 1.35 it's 12% taller and 8% wider than Level 10, and its base's sides stop 6 px inside the tile
      // outline's side corners. (v0.8.11's 1.45 with its bottom 40% of the way to the front corner stood 12 px too far back.)
      art: { key: 'bld_ksi_merged', scale: 1.35, standInScale: 1.25, ground: 0.18 }
    },
    // Diddy Trebuchet (v0.9.1): two Level 5 Diddypults. Barrel Burst (barrelBurst.js): every shot is a giant barrel at x2
    // damage (impact and pool); where it lands it bursts and throws `jugs` oil jugs `distance` tiles out (on the grid's
    // diagonals: a + on screen), which land `delay` s later for `mult` of the barrel's hit (Splash Zone counts) and leave
    // `poolRadius`-tile pools with its pool's damage and slow. The jugs' pools and the barrel's own never stack: an enemy
    // standing in several takes one pool's damage per tick (combat.js stepPools, pool `group`). Boulders don't burst; Big
    // Jug doubles only the barrel; Hangover, Concussion and Pressure Cap come only from the barrel's impact.
    catapult: {
      name: 'Diddy Trebuchet',
      ability: 'Barrel Burst',
      abilityIcon: 'ui_ability_barrel_burst',
      abilityShort: 'Its barrel bursts into oil jugs that splash all around.',
      description: 'Two Diddypults lashed into one siege engine. It hurls a giant barrel that hits twice as hard and bursts on impact, flinging oil jugs that cover the area in slick pools.',
      abilityText: "Every shot is a giant barrel. Where it lands it bursts and throws 4 oil jugs 2 tiles out, one each way: they land a moment later for half the barrel's hit and each leaves its own 1-tile oil pool with the same damage and slow. An enemy in several pools only takes one pool's damage.",
      cost: { gold: 170000, rp: 3500 }, // gold: the Diddypult's own last upgrade, like every merge (the brief's 200,000 was 18% over)
      hpMult: 2, damageMult: 2, fireIntervalMult: 1, rangeAdd: 0.5,
      barrelBurst: { jugs: 4, distance: 2, delay: 0.4, mult: 0.5, poolRadius: 1 },
      mastery: {
        costs: [1200, 2000, 3000], labLevel: [3, 4, 5],
        tiers: [
          { name: 'More Jugs', desc: 'The barrel bursts into 6 jugs.', fx: { barrelJugs: 6 } },
          { name: 'Wide Spray', desc: 'Jugs fly 3 tiles and their pools are 1.25 tiles wide.', fx: { jugDistance: 3, jugPoolRadius: 1.25 } },
          { name: 'Tar Pit', desc: "The barrel's own pool slows 60% and lasts 10 s.", fx: { tarSlow: 0.6, tarSeconds: 10 } }
        ]
      },
      // The user's "Merged Diddypult building image v2": its base is widest (the crystals at its sides) 25% of the way up the
      // picture, so it stands by that line (`ground` 0.25 on the footprint's center). At 1.3 it's ~30% wider and ~20% taller
      // than a Level 5 Diddypult, and its widest row stays inside the 2 x 2 tile's outline (GameScene drawPlots).
      art: { key: 'bld_catapult_merged', scale: 1.3, standInScale: 1.15, ground: 0.25 }
    }
  },
  // Per Village Hall level (1-15). Every hall from 11 adds 12 walls. v0.8 (user, 2026-11-22; replaced v0.6.1's Bonus
  // Slots): on top of the hall before it, Village Hall 11 adds a Tower of Rah, Gandolf, Diddypult, KSI Tower and Cannon
  // (and, since v0.6.3, a Mine, Storage and House); VH12 a Tower of Rah and Gandolf; VH13 a Diddypult, KSI Tower,
  // Locklair Tower and Storage (so the VH14 upgrade fits); VH14 a Cannon, Mortar, Spear Thrower and F.L.O.C.K Tower;
  // VH15 a Tower of Rah, Firework Launcher, Mine, Storage and House. A village over a cap (built with Bonus Slots)
  // keeps those buildings (checkBuy just won't add more).
  limits: {
    mine: [1, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 8],
    storage: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
    house: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 7],
    cannon: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7, 7, 7, 8, 8],
    archer: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6, 6],
    mortar: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 6, 6],
    wizard: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6, 6, 6], // (v0.8.2: back to 6 after v0.8.1's cap of 4; they can merge instead)
    townHall: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    wall: [24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156, 168, 180, 192],
    firework: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4],
    catapult: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3, 3], // the final unlock: from Village Hall 10
    spear: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4],
    ksi: [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
    flock: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4],
    mousetrap: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5],
    ra: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 4, 4, 4, 5],
    rvlab: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    dj: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    fuelStation: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    altar: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    queenAltar: [0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1] // the Hatsune Queen: from Village Hall 8
  },
  // radius (tiles): body size; enemies push apart so they never stack on top of each other.
  // name: shown to players; role: the enemy's job, shown as subtext under the name.
  enemies: {
    grunt: {
      name: "Tung Tung Tung Sahur",
      role: "Grunt",
      radius: 0.22,
      type: "ground",
      hp: 75,
      speed: 0.9,
      damage: 8,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 3,
      researchPoints: 1
    },
    slinger: {
      name: "Cappuccino Assasino",
      role: "Slinger",
      radius: 0.25,
      type: "ranged",
      hp: 150,
      speed: 1.1,
      damage: 15,
      attackInterval: 1.5,
      attackRange: 5,
      bounty: 10,
      researchPoints: 3
    },
    bomber: {
      name: "Bombadillo Crocadillo",
      role: "Bomber",
      radius: 0.35,
      type: "air",
      hp: 220,
      speed: 1.6,
      damage: 40,
      attackInterval: 2,
      attackRange: 0,
      bounty: 15,
      researchPoints: 4
    },
    tank: {
      name: "Tripi Tropi Tropi Tripa",
      role: "Tank",
      radius: 0.4,
      type: "ground",
      hp: 900,
      speed: 0.6,
      damage: 30,
      attackInterval: 2,
      attackRange: 0.5,
      bounty: 25,
      researchPoints: 6
    },
    // Fast raider that leaps over walls (never attacks them). Other buildings still block it.
    shark: {
      name: "Tralalero Tralala",
      role: "Wall Jumper",
      radius: 0.3,
      type: "ground",
      jumpsWalls: true,
      hp: 180,
      speed: 1.3,
      damage: 18,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 12,
      researchPoints: 3
    },
    // Gold raider: goes only for money buildings (prefers) until none are standing, hits them hard,
    // and barely scratches anything else (walls in its way included).
    thief: {
      name: "Mr. Least",
      role: "Sneaky thief",
      radius: 0.22,
      type: "ground",
      prefers: ["mine", "storage"],
      jumpsWalls: true, // hops over walls like the Sneaker Shark
      // Spawns invisible: defenses can't aim at it (splash and pools still hurt) until its first wall
      // jump or its first hit on a building reveals it.
      invisibleUntilJump: true,
      preferredDamageMultiplier: 3,
      otherDamageMultiplier: 0.4,
      hp: 60,
      speed: 1.4,
      damage: 10,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 8,
      researchPoints: 1
    },
    // Runs for the nearest wall and blows itself up: x48 vs walls (2,400: one blast breaks walls up to Level 6,
    // Levels 7-8 take two), and the blast also hits every building and wall within blastRadius (1.75 tiles). With no walls left it goes for
    // defenses (thenPrefers), then anything. Dies in its own blast (no bounty for that).
    breaker: {
      name: "Boneca Ambalabu",
      role: "Wall Breaker",
      radius: 0.28,
      type: "ground",
      prefers: ["wall"],
      thenPrefers: ["defense"],
      preferredDamageMultiplier: 48, // was 60 (3,000 vs walls); nerfed with the blast radius
      otherDamageMultiplier: 1,
      explodes: true,
      blastRadius: 1.75,             // was 2
      hp: 90,
      speed: 1.2,
      damage: 50,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 10,
      researchPoints: 3
    },
    // Raid boss, mixed into normal waves from wave 18 (rules.babyCar). It drives in a straight line
    // from the map edge to the Village Hall (no path, no detours) and rams through everything in its way:
    // a wall breaks in one hit, any other building takes ramDamage and stalls it ramPause s. At the hall it
    // batters away (damage every attackInterval s). Destroyed, it bursts into a mix of the wave's ground
    // troops (deathSpawn: base, +1 every perWaves waves after fromWave).
    babycar: {
      name: "Da Baby Car",
      role: "Raid Boss",
      radius: 0.5,
      type: "ground",
      boss: true,
      prefers: ["townHall"],
      ramsToHall: true,
      ramDamage: 300,
      ramPause: 0.6,
      // maxCount: past it (very late waves) the burst keeps maxCount troops, each packed to stand for the rest.
      deathSpawn: { base: 6, perWaves: 5, fromWave: 10, maxCount: 24 },
      hp: 5400,         // about 6 Tanks
      speed: 0.55,
      damage: 120,
      attackInterval: 2,
      attackRange: 0.6,
      bounty: 150,
      researchPoints: 40
    },
    // Burrower, in waves from wave `fromWave` (baseCount from the stage that wave is in, growing like the others).
    // It tunnels underground, straight under walls and buildings, to the nearest building, surfaces next to it
    // (surfaceSeconds, then it attacks) and, when that building falls, burrows to the next. Underground
    // nothing can target or hurt it (splash, pools and traps included) unless a F.L.O.C.K Tower sees it.
    toilet: {
      name: "Skibidi Toilet",
      role: "Burrower",
      radius: 0.26,
      type: "ground",
      burrows: true,
      surfaceSeconds: 0.5,
      fromWave: 14,
      baseCount: 4,
      hp: 280,
      speed: 1.15,
      damage: 20,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 12,
      researchPoints: 4
    },
    // A slow flyer that never attacks itself. Targets: the nearest air defense (defenses that can shoot
    // flyers), else any defense, else any building. Over its target it drops `perDrop` Neegies after
    // `dropHover` s, then again every `dropInterval` s until that target is destroyed, then moves on.
    // When it's destroyed it drops `deathDrop` Neegies where it falls. With nothing left at all it drifts
    // off for `leaveSeconds` and pops (no bounty).
    balloon: {
      name: "Neegy Balloon",
      role: "Air Drop",
      radius: 0.4,
      type: "air",
      prefers: ["airDefense"],
      thenPrefers: ["defense"],
      perDrop: 2,
      dropInterval: 4,
      deathDrop: 2,
      dropHover: 0.8,
      leaveSeconds: 3,
      drops: "neegy",
      hp: 700,          // a tough airship: about 3x a Bomber
      speed: 0.8,
      damage: 0,
      attackInterval: 1,
      attackRange: 0,
      bounty: 30,
      researchPoints: 7
    },
    // Dropped by Neegy Balloons (never in a wave's queue). Hits air defenses twice as hard.
    neegy: {
      name: "Neegy",
      role: "Summoned Paratrooper",
      radius: 0.22,
      type: "ground",
      droppedBy: "balloon",
      prefers: ["airDefense"],
      thenPrefers: ["defense"],
      preferredDamageMultiplier: 2,
      otherDamageMultiplier: 1,
      hp: 180,
      speed: 1.1,
      damage: 24,       // x2 = 48 per hit on air defenses
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 7,
      researchPoints: 1
    },
    // ---------- v0.6 enemies (src/logic/specialEnemies.js). Each joins the waves from its fromWave (baseCount
    // there, growing like the Skibidi Toilet's); waves.js takes rules.lateKindOffset of its health back out of the
    // regular troops so a wave's strength only creeps up. ----------
    // A melee bruiser (sturdier than Tung Tung Sahur). Whenever a standing F.L.O.C.K Tower's range covers him, he stops
    // and makes a call (call.poseSeconds): the towers that see him and every other F.L.O.C.K Tower within call.radius
    // tiles of him go silent for call.seconds (no marks, no reveals, no auras); he can call again call.cooldown s later.
    pork: {
      name: "John Pork",
      role: "Phone Jammer",
      radius: 0.28,
      type: "ground",
      call: { radius: 5, seconds: 6, cooldown: 14, poseSeconds: 1.2 },
      fromWave: 10,
      baseCount: 2,
      hp: 420,
      speed: 1,
      damage: 22,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 18,
      researchPoints: 5
    },
    // Melee summoner. The first time he gets within summon.range tiles of the building he's after he bashes his
    // shield (summon.poseSeconds, standing still) and summon.count Skeletons (summon.kind) climb out of the ground
    // around him (summon.riseSeconds: they can't move or attack yet); then again every summon.cooldown s, as long as
    // fewer than summon.maxAlive of his are still standing. They're as tough as he is for the wave (his health
    // multiplier and crowd-cap pack).
    skeleton: {
      name: "Rahhh Skeleton",
      role: "Skeleton Summoner",
      radius: 0.26,
      type: "ground",
      summon: { kind: "bones", count: 3, range: 4, cooldown: 10, maxAlive: 6, poseSeconds: 0.8, riseSeconds: 0.6 },
      fromWave: 18,
      baseCount: 2,
      hp: 520,
      speed: 0.85,
      damage: 28,
      attackInterval: 1.2,
      attackRange: 0.5,
      bounty: 20,
      researchPoints: 5
    },
    // Raised by Rahhh Skeletons (never in a wave's queue): weak, quick sword fighters that come in threes.
    bones: {
      name: "Skeleton",
      role: "Summoned Minion",
      radius: 0.2,
      type: "ground",
      droppedBy: "skeleton",
      hp: 80,
      speed: 1.2,
      damage: 10,
      attackInterval: 0.9,
      attackRange: 0.5,
      bounty: 2,
      researchPoints: 1
    },
    // Tanky ranged flyer: hovers attackRange tiles from its target and throws a boulder (projectiles.vaca). It lands on
    // the target for full damage, then bounces on bounce.count times, each bounce.step tiles further along the throw,
    // hitting every building and wall within bounce.radius of where it lands for bounce.falloff less each time
    // (100 / 70 / 49 / 34%), like a Bowler. Only air-capable defenses can hit it.
    vaca: {
      name: "La Vaca Saturno",
      role: "Boulder Flyer",
      radius: 0.45,
      type: "air",
      bounce: { count: 3, step: 1.5, radius: 1, falloff: 0.3 },
      fromWave: 23,
      baseCount: 1,
      hp: 1500,
      speed: 0.6,
      damage: 70,
      attackInterval: 3,
      attackRange: 3.5,
      bounty: 45,
      researchPoints: 10
    },
    // Ranged artillery: from attackRange tiles away it calls a missile down on its target. A red target ring shows
    // where it will land for projectiles.missile.fallTime s, then it hits only that building (missileStrike; since
    // v0.7.1, before that a 1.25-tile blast). Never outranges a defense that can shoot it (attackRangeVs).
    yahu: {
      name: "Big Yahu",
      role: "Missile Caller",
      radius: 0.26,
      type: "ranged",
      missileStrike: true,
      fromWave: 28,
      baseCount: 2,
      hp: 650,
      speed: 0.8,
      damage: 110,
      attackInterval: 4.5,
      attackRange: 6,
      bounty: 32,
      researchPoints: 8
    },
    // Tank with an earthquake (Brr Brr Patapim's ability until v0.7): every quake.every s, while a building or wall is
    // within quake.radius tiles, it stomps (quake.stompSeconds, standing still) and every building within quake.radius
    // takes quake.damage (walls quake.wallMult x). Strong, not an instant win: Level 1 walls break in one quake,
    // Level 8 walls take 7. Uses Patapim's quake sound.
    lirili: {
      name: "Lirili Larila",
      role: "Earthquake Tank",
      radius: 0.5,
      type: "ground",
      quake: { radius: 2.5, every: 5, damage: 150, wallMult: 4, stompSeconds: 0.5 },
      fromWave: 34,
      baseCount: 1,
      hp: 2800,
      speed: 0.45,
      damage: 70,
      attackInterval: 2.2,
      attackRange: 0.6,
      bounty: 60,
      researchPoints: 14
    },
    // v0.7: a big, slow summoner. While he walks in (not while he's attacking, nor on the path in from the map edge)
    // he drops a Chimpanzini Bananini (spawn.kind) every spawn.every s, as long as fewer than spawn.maxAlive of his
    // are left. They're as tough as he is for the wave (his health multiplier and crowd-cap pack).
    patapim: {
      name: "Brr Brr Patapim",
      role: "Jungle Caller",
      radius: 0.5,
      type: "ground",
      spawn: { kind: "chimp", every: 3, count: 1, maxAlive: 8 },
      fromWave: 40,
      baseCount: 1,
      hp: 2400,
      speed: 0.45,
      damage: 60,
      attackInterval: 2,
      attackRange: 0.6,
      bounty: 60,
      researchPoints: 14
    },
    // Dropped by Brr Brr Patapim (never in a wave's queue): runs at the nearest building (never walls), leaping over
    // walls on the way, and hits the first building it reaches once (`kamikaze`: damage, then it's gone, no bounty).
    chimp: {
      name: "Chimpanzini Bananini",
      role: "Banana Diver",
      radius: 0.22,
      type: "ground",
      droppedBy: "patapim",
      jumpsWalls: true,
      kamikaze: true,
      hp: 110,
      speed: 1.5,
      damage: 90,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 3,
      researchPoints: 1
    },
    // v0.7: a melee legionary in armor. `armor` (scaled like its health) takes every hit first; only once it's broken
    // does its health go down, and the hit that breaks it is spent on the armor (its leftover damage is lost). Its
    // health bar shows a steel armor bar and a shield while the armor holds. While the armor holds, incoming damage
    // is also cut by `armorReduction` (0.3 = 30% less); the reduced amount is what the armor loses. No reduction once broken.
    bicus: {
      name: "Bri Bri Bicus Dicus",
      role: "Armored Legionary",
      radius: 0.27,
      type: "ground",
      armor: 450,
      armorReduction: 0.3,
      fromWave: 14,
      baseCount: 2,
      hp: 300,
      speed: 0.8,
      damage: 26,
      attackInterval: 1.2,
      attackRange: 0.5,
      bounty: 22,
      researchPoints: 6
    },
    // v0.7: a slow walker in a cold aura. Every defense (and the Brisket King) within chillAura.radius tiles of it
    // attacks chillAura.slowPct% slower (the strongest aura wins; they don't stack). Its footsteps play the Freeze
    // spell's sound now and then.
    frigo: {
      name: "Frigo Camillo",
      role: "Frost Walker",
      radius: 0.3,
      type: "ground",
      chillAura: { radius: 2.5, slowPct: 35 },
      fromWave: 18,
      baseCount: 1,
      hp: 750,
      speed: 0.6,
      damage: 22,
      attackInterval: 1.2,
      attackRange: 0.5,
      bounty: 26,
      researchPoints: 7
    },
    // v0.7: a fire-breathing flyer (like Clash's Dragon). From attackRange tiles it breathes fire on its target for full
    // damage, and the flames lick breath.splashPct% of that onto every building and wall within breath.splashRadius
    // tiles of the target. Only air-capable defenses can hit it.
    bombo: {
      name: "Bombombini Gusini",
      role: "Fire Breather",
      radius: 0.42,
      type: "air",
      breath: { splashRadius: 1, splashPct: 35 },
      fromWave: 28,
      baseCount: 1,
      hp: 1100,
      speed: 0.75,
      damage: 55,
      attackInterval: 1.6,
      attackRange: 2.5,
      bounty: 40,
      researchPoints: 9
    },
    // v0.8: a fast street fighter. When the building he's going for is dash.minRange..dash.range tiles away (and no wall
    // is in his way: his route doesn't need breaking one) he dashes at dash.speed tiles/s, at most every dash.cooldown
    // s and for at most dash.maxSeconds. Reaching it, he lands an impact hit of dash.impactMult x his damage, then
    // punches normally. A wall in the way ends the dash with no impact (walls still protect). After a kill he walks to
    // a building that's close (under dash.minRange) and dashes to one further off.
    quandale: {
      name: "Quandale Dingle",
      role: "Dash Striker",
      radius: 0.26,
      type: "ground",
      dash: { minRange: 1.5, range: 4, speed: 4.5, maxSeconds: 1.4, cooldown: 2, impactMult: 3, stunSeconds: 1.5 },
      fromWave: 23,
      baseCount: 2,
      hp: 380,
      speed: 1.35,
      damage: 24,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 22,
      researchPoints: 6
    },
    // v0.8: a big slow tank that leaves purple goo behind. Every goo.every tiles he walks he drops a puddle (goo.radius,
    // lasting goo.seconds); any other enemy standing in goo is enraged for goo.rageSeconds: goo.speedMult x speed and
    // goo.damageMult x damage (it doesn't stack, and doesn't affect Grimaces). Where he dies, one big puddle
    // (goo.deathRadius, goo.deathSeconds).
    grimace: {
      name: "Grimace Golem",
      role: "Goo Tank",
      radius: 0.4,
      type: "ground",
      goo: { every: 1, radius: 0.55, seconds: 6, rageSeconds: 4, speedMult: 1.3, damageMult: 1.3, deathRadius: 2, deathSeconds: 8 },
      fromWave: 48,
      baseCount: 1,
      hp: 3200,
      speed: 0.5,
      damage: 50,
      attackInterval: 2,
      attackRange: 0.5,
      bounty: 60,
      researchPoints: 12
    }
  },
  // Themed waves (v0.7, src/logic/waves.js; replaced v0.6's special wave every 3rd wave). From wave `fromWave` every
  // wave has a theme, rotating through `order` and skipping themes whose `needs` kinds aren't in that wave stage's
  // base wave yet, so back-to-back waves differ. Each keeps about the strength of the normal wave it re-mixes (its
  // total enemy HP x `strength`, default 1):
  //   - a headliner theme gives `share` of that strength to its `mix` (weights over the kinds the wave has) and keeps
  //     the rest of the normal mix at (1 - share);
  //   - a `pure` theme is only its mix (null = every ground kind of the normal wave) and pays `bonusBounty` x the
  //     wave's bounty on top when cleared (the old special waves).
  // Above `maxEnemiesFactor` x the normal wave's enemy count the counts shrink and the health grows to match.
  // Two waves come first: a debut (the first wave at which an enemy that joins later (fromWave) can come, if the
  // village hasn't had its debut: `debut.share` of the wave is that enemy), then every boss.every-th wave, the
  // Boss Wave (the boss.headliners toughest kinds the wave has, Da Baby Car(s) once the waves have them, and
  // boss.bonusBounty x the bounty on top). Da Baby Cars also keep their own schedule (rules.babyCar) on headliner
  // and debut waves; pure themes never have them.
  waveThemes: {
    fromWave: 2,
    bonusBounty: 0.5,
    maxEnemiesFactor: 2,
    debut: { share: 0.45 },
    // Enemies with abilities that pile up badly (auras, summoners, artillery...): a theme never brings more than
    // `mult` x the normal wave's count of one (or `extra` more, whichever is higher); the health budget it would have
    // had goes to the wave's other troops instead, so the strength stays the same.
    headlinerCap: { mult: 3, extra: 2, kinds: ['toilet', 'pork', 'skeleton', 'vaca', 'yahu', 'patapim', 'lirili', 'bicus', 'frigo', 'bombo', 'quandale', 'grimace'] },
    boss: { every: 10, name: 'Boss Wave', hint: 'The toughest enemies you have met, led by the raid boss', headliners: 4, share: 0.6, strength: 1.15, bonusBounty: 1 },
    order: ['swarm', 'sneak', 'ironLegion', 'air', 'boneMarch', 'heist', 'frozenFront', 'bombSquad', 'skyFire', 'ground',
      'signalLost', 'earthshaker', 'underground', 'artillery', 'jungle', 'siege', 'dashGang', 'gooParade'],
    types: {
      swarm: { name: 'Swarm', hint: 'Hordes of weak enemies', pure: true, mix: { grunt: 0.6, thief: 0.4 }, needs: ['thief'], strength: 0.8 },
      sneak: { name: 'Sneak Attack', hint: 'Sharks and thieves leap your walls', mix: { shark: 0.6, thief: 0.4 }, needs: ['shark'], share: 0.55 },
      ironLegion: { name: 'Iron Legion', hint: 'Armored legionaries and Tanks: heavy hitters break armor', mix: { bicus: 0.7, tank: 0.3 }, needs: ['bicus'], share: 0.55 },
      air: { name: 'Air Raid', hint: 'Flyers only: build anti-air', pure: true, mix: { bomber: 0.6, balloon: 0.15, vaca: 0.12, bombo: 0.13 }, needs: ['bomber'], strength: 0.7 },
      boneMarch: { name: 'Bone March', hint: 'Rahhh Skeletons raise the dead beside armored legionaries', mix: { skeleton: 0.6, bicus: 0.4 }, needs: ['skeleton'], share: 0.55 },
      heist: { name: 'Heist', hint: 'A gang of Mr. Leasts after your gold', pure: true, mix: { thief: 0.85, grunt: 0.15 }, needs: ['thief'], strength: 0.6 },
      frozenFront: { name: 'Frozen Front', hint: 'Frigo Camillo slows your defenses as Tanks push in', mix: { frigo: 0.4, tank: 0.4, bicus: 0.2 }, needs: ['frigo'], share: 0.55 },
      bombSquad: { name: 'Bomb Squad', hint: 'Wall Breakers blow a way in for the horde', mix: { breaker: 0.45, grunt: 0.55 }, needs: ['breaker'], share: 0.5 },
      skyFire: { name: 'Sky Fire', hint: 'Fire-breathing geese and boulder-throwing cows', mix: { bombo: 0.5, vaca: 0.3, bomber: 0.2 }, needs: ['bombo'], share: 0.55 },
      ground: { name: 'Ground Assault', hint: 'No flyers: more troops instead', pure: true, mix: null, needs: ['bomber'], strength: 1 },
      signalLost: { name: 'Signal Lost', hint: 'John Pork jams your F.L.O.C.K Towers as thieves slip in', mix: { pork: 0.6, thief: 0.4 }, needs: ['pork'], share: 0.5 },
      earthshaker: { name: 'Earthshaker', hint: 'Earthquakes crack your walls for Wall Breakers and Tanks', mix: { lirili: 0.5, tank: 0.3, breaker: 0.2 }, needs: ['lirili'], share: 0.55 },
      underground: { name: 'Underground', hint: 'Skibidi Toilets tunnel under everything', mix: { toilet: 0.7, grunt: 0.3 }, needs: ['toilet'], share: 0.55 },
      artillery: { name: 'Artillery', hint: 'Missiles and stones from long range', mix: { yahu: 0.5, slinger: 0.5 }, needs: ['yahu'], share: 0.55 },
      jungle: { name: 'Jungle Stampede', hint: 'Brr Brr Patapim drops diving Chimpanzinis while Sharks run ahead', mix: { patapim: 0.6, shark: 0.4 }, needs: ['patapim'], share: 0.55 },
      dashGang: { name: 'Dash Gang', hint: 'Quandale Dingles dash from building to building as Sharks leap your walls', mix: { quandale: 0.6, shark: 0.4 }, needs: ['quandale'], share: 0.55 },
      gooParade: { name: 'Goo Parade', hint: 'Grimace Golems leave goo that enrages the troops behind them', mix: { grimace: 0.5, grunt: 0.3, tank: 0.2 }, needs: ['grimace'], share: 0.55 },
      siege: { name: 'Siege', hint: 'Tanks and Wall Breakers', pure: true, mix: { tank: 0.8, lirili: 0.12, breaker: 0.08 }, needs: ['tank'], strength: 1 }
    }
  },
  // Rebalanced in v0.5 (R group, from headless runs of a maxed base per hall: scratch sim): VH2-4 were far harder
  // than the defenses those halls allow (a maxed VH4 base fell by wave 5), and Village Hall 5 is a big jump in
  // defenses (DJ, a 2nd Spear / Gandolf / Firework...), so it has a scripted base wave of its own; the endless
  // formula (rules.endlessCountGrowth / endlessHpGrowth) grows from it for Village Halls 6-10.
  waves: [
    { grunt: 7, slinger: 0, bomber: 0, tank: 0, shark: 0, thief: 0, breaker: 0, balloon: 0, neegy: 0, hpMultiplier: 1 },
    { grunt: 11, slinger: 2, bomber: 0, tank: 0, shark: 0, thief: 2, breaker: 0, balloon: 0, neegy: 0, hpMultiplier: 1 },
    { grunt: 18, slinger: 4, bomber: 2, tank: 0, shark: 2, thief: 4, breaker: 2, balloon: 1, neegy: 0, hpMultiplier: 1 },
    { grunt: 22, slinger: 5, bomber: 3, tank: 1, shark: 3, thief: 4, breaker: 3, balloon: 1, neegy: 0, hpMultiplier: 1 },
    { grunt: 45, slinger: 10, bomber: 8, tank: 3, shark: 6, thief: 8, breaker: 5, balloon: 2, neegy: 0, hpMultiplier: 1.15 }
  ]
};

export default CONFIG;
