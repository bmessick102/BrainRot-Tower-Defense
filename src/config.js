// AUTO-GENERATED from Game_Balance_Sheet.xlsx. Edit the spreadsheet, then re-export.
// Units: distances in tiles, times in seconds, money in gold.
// levels[i] = level i+1. Building cost at level 1 = shop price; later levels = upgrade price.
// waves[i] = the base wave for Village Hall i+1; Village Halls 6+ use the endless formula in logic/waves.js.
// Waves start when the player presses Start Wave. Each wave is the Village Hall's base wave scaled up by
// rules.waveRamp for every wave survived before it (so waves keep getting harder at any hall level).
// Levels 6-10 extend the sheet's growth (costs x2, HP/damage x1.25, storage capacity x1.5);
// they are NOT in Game_Balance_Sheet.xlsx yet: copy them in before the next re-export.
// Map shape, image origin, town hall position, and spawn points live in src/mapTiles.js.
export const CONFIG = {
  grid: { tileWidth: 64, tileHeight: 32, townHallSize: 3, buildingSize: 2 },
  startingGold: 250, // 100 rebuilds the ruined Village Hall (level 0 -> 1), 150 buys the first Mine
  rules: {
    sellRefund: 0.5,
    // Everything destroyed in a night is rebuilt for free when the wave is beaten. During a wave a destroyed
    // building (not a wall) can be rebuilt early for this share of its current level's cost.
    rebuildCostShare: 0.3,
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
    // (shares of the Village Hall's base wave, linear: wave 11 has 1 + 10 x 0.08 = 1.8x the enemies).
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
    // Da Baby Car raid boss (enemies.babycar): from Village Hall `fromTownHall`, every `every`th wave (normal
    // waves only, not special ones) brings `count` of them, `countLate` from Village Hall `lateTownHall`.
    babyCar: { fromTownHall: 6, every: 2, count: 1, lateTownHall: 9, countLate: 2 },
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
    // Village Halls 6-10: their base wave is the previous hall's with x endlessCountGrowth enemies and x endlessHpGrowth
    // health (v0.5: 1.18 / 1.14 from the scripted VH5 wave; was 1.15 / 1.1 from VH4).
    endlessCountGrowth: 1.18,
    endlessHpGrowth: 1.14,
    maxTownHallLevel: 10,
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
    slinger: { speed: 10 },
    bomber: { dropTime: 0.4 }
  },
  // Day/night clock in seconds: a cycle of its own (about 8 minutes), separate from the waves.
  dayNight: { daySeconds: 240, duskSeconds: 30, nightSeconds: 180, dawnSeconds: 30 },
  camera: { startZoom: 0.75, minZoom: 0.5, maxZoom: 2.0, dragThresholdPx: 6 },
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
      { upgradeCost: 160000, hp: 8944, capacity: 4500 }
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
    spellSlots: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5],
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
  limits: {
    mine: [1, 2, 3, 3, 4, 4, 5, 5, 6, 6],
    storage: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    house: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    cannon: [1, 2, 2, 3, 3, 4, 4, 5, 5, 6],
    archer: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    mortar: [0, 1, 1, 2, 2, 3, 3, 4, 4, 5],
    wizard: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
    townHall: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    wall: [24, 36, 48, 60, 72, 84, 96, 108, 120, 132],
    firework: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3],
    catapult: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], // the final unlock: Village Hall 10 only
    spear: [0, 0, 1, 1, 2, 2, 2, 3, 3, 3],
    flock: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3],
    mousetrap: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    ra: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2],
    rvlab: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    dj: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    fuelStation: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    altar: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1]
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
    // Raid boss, mixed into normal waves from Village Hall 6 (rules.babyCar). It drives in a straight line
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
    // Burrower, in waves from Village Hall `fromTownHall` (baseCount at that hall, growing like the others).
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
      fromTownHall: 5,
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
      role: "Paratrooper",
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
    }
  },
  // Special waves (src/logic/waves.js): every `every`th wave is one of these, rotating through `order`
  // (skipping types whose `needs` kinds aren't in that Village Hall's base wave yet, so there's always a
  // counter). A special wave has about the same strength as the normal wave it replaces (its total enemy
  // HP x `strength`), split over `mix` (weights; null = every ground kind of the normal wave, in the same
  // proportions). Above `maxEnemiesFactor` x the normal wave's enemy count the counts shrink and the HP
  // grows to match. Clearing one pays
  // `bonusBounty` x the wave's bounty on top.
  specialWaves: {
    every: 3,
    bonusBounty: 0.5,
    maxEnemiesFactor: 2,
    order: ['swarm', 'air', 'ground', 'heist', 'siege'],
    types: {
      swarm: { name: 'Swarm', hint: 'Hordes of weak enemies', mix: { grunt: 0.6, thief: 0.4 }, needs: ['thief'], strength: 0.8 },
      air: { name: 'Air Raid', hint: 'Flyers only: build anti-air', mix: { bomber: 0.8, balloon: 0.2 }, needs: ['bomber'], strength: 0.7 },
      ground: { name: 'Ground Assault', hint: 'No flyers: more troops instead', mix: null, needs: ['bomber'], strength: 1 },
      heist: { name: 'Heist', hint: 'A gang of Mr. Leasts after your gold', mix: { thief: 0.85, grunt: 0.15 }, needs: ['thief'], strength: 0.6 },
      siege: { name: 'Siege', hint: 'Tanks and Wall Breakers', mix: { tank: 0.92, breaker: 0.08 }, needs: ['tank'], strength: 1 }
    }
  },
  // Rebalanced in v0.5 (R group, from headless runs of a maxed base per hall: scratch sim): VH2-4 were far harder
  // than the defenses those halls allow (a maxed VH4 base fell by wave 5), and Village Hall 5 is a big jump in
  // defenses (DJ, a 2nd Spear / Gandolf / Firework...), so it has a scripted base wave of its own; the endless
  // formula (rules.endlessCountGrowth / endlessHpGrowth) grows from it for Village Halls 6-10.
  waves: [
    { grunt: 7, slinger: 0, bomber: 0, tank: 0, shark: 0, thief: 0, breaker: 0, balloon: 0, neegy: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 11, slinger: 2, bomber: 0, tank: 0, shark: 0, thief: 2, breaker: 0, balloon: 0, neegy: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 18, slinger: 4, bomber: 2, tank: 0, shark: 2, thief: 4, breaker: 2, balloon: 1, neegy: 0, spawnPaths: 2, hpMultiplier: 1 },
    { grunt: 22, slinger: 5, bomber: 3, tank: 1, shark: 3, thief: 4, breaker: 3, balloon: 1, neegy: 0, spawnPaths: 2, hpMultiplier: 1 },
    { grunt: 45, slinger: 10, bomber: 8, tank: 3, shark: 6, thief: 8, breaker: 5, balloon: 2, neegy: 0, spawnPaths: 2, hpMultiplier: 1.15 }
  ]
};

export default CONFIG;
