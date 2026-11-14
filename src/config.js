// AUTO-GENERATED from Game_Balance_Sheet.xlsx. Edit the spreadsheet, then re-export.
// Units: distances in tiles, times in seconds, money in gold.
// levels[i] = level i+1. Building cost at level 1 = shop price; later levels = upgrade price.
// waves[i] = the base wave for Village Hall i+1; Village Halls 5+ use the endless formula in logic/waves.js.
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
    // Waves start on the Start Wave button (no timer), at whatever time of day it is.
    // Every wave survived makes the next ones bigger: +countPerWave enemies and +hpPerWave enemy HP
    // (shares of the Village Hall's base wave, linear: wave 11 has 1 + 10 x 0.08 = 1.8x the enemies).
    waveRamp: { countPerWave: 0.08, hpPerWave: 0.05 },
    // Starting the next wave within this many seconds of clearing the last counts as a quick start
    // (the "Bring It On" achievement).
    quickStartSeconds: 10,
    // Research points (RV Lab abilities): each enemy's own researchPoints when it's defeated, plus this
    // many x the wave number for surviving a night (src/logic/researchPoints.js).
    researchPointsPerWave: 10,
    spawnInterval: 0.8,
    // Anti-stall (src/logic/enrage.js): `after` s after a wave's last enemy spawns, enemies start to enrage.
    enrage: { after: 90, ramp: 30, maxDamage: 5, maxSpeed: 2 },
    // Restless nights (src/logic/enrage.js): while it's dark, attacking enemies deal `damage`x damage and move
    // `speed`x faster, and every kill (and the wave-cleared research points) pays +lootBonus gold and RP.
    night: { damage: 1.25, speed: 1.15, lootBonus: 0.25 },
    endlessCountGrowth: 1.15,
    endlessHpGrowth: 1.1,
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
  mine: {
    name: "Bitcoin Mine",
    unlockTownHall: 1,
    levels: [
      { cost: 150, hp: 300, production: 2, stockCap: 120 },
      { cost: 300, hp: 375, production: 4, stockCap: 300 },
      { cost: 600, hp: 469, production: 6, stockCap: 540 },
      { cost: 1200, hp: 586, production: 9, stockCap: 900 },
      { cost: 2400, hp: 732, production: 12, stockCap: 1440 },
      { cost: 4800, hp: 915, production: 16, stockCap: 2150 },
      { cost: 9600, hp: 1144, production: 20, stockCap: 3010 },
      { cost: 19200, hp: 1430, production: 25, stockCap: 4210 },
      { cost: 38400, hp: 1788, production: 30, stockCap: 5660 },
      { cost: 76800, hp: 2235, production: 36, stockCap: 7610 }
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
  rvlab: {
    name: "RV Lab",
    size: 2, // the usual 2x2 (it was 3x3: too big beside the rest of the village)
    unlockTownHall: 4,
    levels: [
      { cost: 4000, hp: 1000, townHall: 4 },
      { cost: 10000, hp: 1250, townHall: 5 },
      { cost: 25000, hp: 1563, townHall: 6 },
      { cost: 60000, hp: 1953, townHall: 7 },
      { cost: 150000, hp: 2441, townHall: 8 }
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
  // Seven levels, one picture each (bld_wall_lv1..7, the lava wall on top). Wall levels unlock at Village
  // Hall 1, 2, 3, 5, 7, 9 and 10 (townHall). Cheap on purpose, so a broken village can wall up again fast.
  // Level 7 stays under the Wall Breaker's 3,000 blast.
  walls: {
    name: "Wall",
    segmentLength: 1,
    unlockTownHall: 1,
    levels: [
      { cost: 10, hp: 400, townHall: 1 },
      { cost: 25, hp: 550, townHall: 2 },
      { cost: 60, hp: 800, townHall: 3 },
      { cost: 150, hp: 1150, townHall: 5 },
      { cost: 350, hp: 1600, townHall: 7 },
      { cost: 800, hp: 2200, townHall: 9 },
      { cost: 1800, hp: 2980, townHall: 10 }
    ]
  },
  defenses: {
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
        { cost: 150, hp: 400, damage: 40 },
        { cost: 300, hp: 500, damage: 50 },
        { cost: 600, hp: 625, damage: 63 },
        { cost: 1200, hp: 781, damage: 78 },
        { cost: 2400, hp: 977, damage: 98 },
        { cost: 4800, hp: 1221, damage: 123 },
        { cost: 9600, hp: 1526, damage: 154 },
        { cost: 19200, hp: 1908, damage: 193 },
        { cost: 38400, hp: 2385, damage: 241 },
        { cost: 76800, hp: 2981, damage: 301 }
      ]
    },
    // Anti-air only: rockets burst among flyers. Fragile, and only a few allowed.
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
        { cost: 500, hp: 250, damage: 90 },
        { cost: 1000, hp: 313, damage: 113 },
        { cost: 2000, hp: 391, damage: 141 },
        { cost: 4000, hp: 488, damage: 176 },
        { cost: 8000, hp: 610, damage: 220 },
        { cost: 16000, hp: 763, damage: 275 },
        { cost: 32000, hp: 954, damage: 343 },
        { cost: 64000, hp: 1192, damage: 429 },
        { cost: 128000, hp: 1490, damage: 536 },
        { cost: 256000, hp: 1863, damage: 671 }
      ]
    },
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
        { cost: 250, hp: 350, damage: 12 },
        { cost: 500, hp: 438, damage: 15 },
        { cost: 1000, hp: 547, damage: 19 },
        { cost: 2000, hp: 684, damage: 23 },
        { cost: 4000, hp: 854, damage: 29 },
        { cost: 8000, hp: 1068, damage: 36 },
        { cost: 16000, hp: 1335, damage: 45 },
        { cost: 32000, hp: 1669, damage: 56 },
        { cost: 64000, hp: 2086, damage: 70 },
        { cost: 128000, hp: 2608, damage: 88 }
      ]
    },
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
        { cost: 400, hp: 450, damage: 50 },
        { cost: 800, hp: 563, damage: 63 },
        { cost: 1600, hp: 703, damage: 78 },
        { cost: 3200, hp: 879, damage: 98 },
        { cost: 6400, hp: 1099, damage: 122 },
        { cost: 12800, hp: 1374, damage: 153 },
        { cost: 25600, hp: 1718, damage: 191 },
        { cost: 51200, hp: 2148, damage: 239 },
        { cost: 102400, hp: 2685, damage: 299 },
        { cost: 204800, hp: 3356, damage: 374 }
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
    // Support: never attacks. Marks enemies in range (+markBonus% damage from all defenses, strongest tower
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
        { cost: 700, hp: 400, range: 6, markBonus: 15 },
        { cost: 1400, hp: 500, range: 6.25, markBonus: 17 },
        { cost: 2800, hp: 625, range: 6.5, markBonus: 19 },
        { cost: 5600, hp: 781, range: 6.75, markBonus: 21 },
        { cost: 11200, hp: 977, range: 7, markBonus: 24 },
        { cost: 22400, hp: 1221, range: 7.25, markBonus: 26 },
        { cost: 44800, hp: 1526, range: 7.5, markBonus: 28 },
        { cost: 89600, hp: 1907, range: 7.75, markBonus: 30 },
        { cost: 179200, hp: 2384, range: 8, markBonus: 32 },
        { cost: 358400, hp: 2981, range: 8.5, markBonus: 35 }
      ]
    },
    // Beam tower (src/logic/beams.js), like the Inferno Tower: locks onto the highest-HP enemy in range and
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
        { cost: 10000, hp: 563, dps: 25 },
        { cost: 20000, hp: 703, dps: 30 },
        { cost: 40000, hp: 879, dps: 36 },
        { cost: 80000, hp: 1099, dps: 43 },
        { cost: 160000, hp: 1373, dps: 51 },
        { cost: 320000, hp: 1717, dps: 60 },
        { cost: 640000, hp: 2146, dps: 70 }
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
      unlockTownHall: 5,
      levels: [
        { cost: 3000, hp: 600, damage: 20, poolDps: 8 },
        { cost: 6000, hp: 750, damage: 25, poolDps: 10 },
        { cost: 12000, hp: 938, damage: 31, poolDps: 13 },
        { cost: 24000, hp: 1172, damage: 39, poolDps: 16 },
        { cost: 48000, hp: 1465, damage: 49, poolDps: 20 },
        { cost: 96000, hp: 1831, damage: 61, poolDps: 24 }
      ]
    },
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
        { cost: 600, hp: 400, damage: 22 },
        { cost: 1200, hp: 500, damage: 28 },
        { cost: 2400, hp: 625, damage: 34 },
        { cost: 4800, hp: 781, damage: 43 },
        { cost: 9600, hp: 977, damage: 54 },
        { cost: 19200, hp: 1221, damage: 68 },
        { cost: 38400, hp: 1526, damage: 85 },
        { cost: 76800, hp: 1908, damage: 106 },
        { cost: 153600, hp: 2385, damage: 133 },
        { cost: 307200, hp: 2981, damage: 166 }
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
    catapult: [0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
    flock: [0, 0, 1, 1, 1, 2, 2, 2, 3, 3],
    mousetrap: [0, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    ra: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2],
    rvlab: [0, 0, 0, 1, 1, 1, 1, 1, 1, 1]
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
      researchPoints: 2
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
      researchPoints: 3
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
      researchPoints: 4
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
      researchPoints: 2
    },
    // Gold raider: goes only for money buildings (prefers) until none are standing, hits them hard,
    // and barely scratches anything else (walls in its way included).
    thief: {
      name: "Goyum Goblin",
      role: "Bitcoin Stealer",
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
    // Runs for the nearest wall and blows itself up: x60 vs walls (breaks any wall in one blast), and the
    // blast also hits every building and wall within blastRadius. With no walls left it goes for
    // defenses (thenPrefers), then anything. Dies in its own blast (no bounty for that).
    breaker: {
      name: "Boneca Ambalabu",
      role: "Wall Breaker",
      radius: 0.28,
      type: "ground",
      prefers: ["wall"],
      thenPrefers: ["defense"],
      preferredDamageMultiplier: 60,
      otherDamageMultiplier: 1,
      explodes: true,
      blastRadius: 2,
      hp: 90,
      speed: 1.2,
      damage: 50,
      attackInterval: 1,
      attackRange: 0.5,
      bounty: 10,
      researchPoints: 2
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
      researchPoints: 5
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
      heist: { name: 'Heist', hint: 'Bitcoin Stealers after your gold', mix: { thief: 0.85, grunt: 0.15 }, needs: ['thief'], strength: 0.6 },
      siege: { name: 'Siege', hint: 'Tanks and Wall Breakers', mix: { tank: 0.92, breaker: 0.08 }, needs: ['tank'], strength: 1 }
    }
  },
  waves: [
    { grunt: 8, slinger: 0, bomber: 0, tank: 0, shark: 0, thief: 0, breaker: 0, balloon: 0, neegy: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 20, slinger: 4, bomber: 0, tank: 0, shark: 0, thief: 3, breaker: 0, balloon: 0, neegy: 0, spawnPaths: 1, hpMultiplier: 1 },
    { grunt: 25, slinger: 5, bomber: 4, tank: 0, shark: 3, thief: 5, breaker: 2, balloon: 1, neegy: 0, spawnPaths: 2, hpMultiplier: 1.1 },
    { grunt: 35, slinger: 8, bomber: 7, tank: 2, shark: 5, thief: 6, breaker: 4, balloon: 2, neegy: 0, spawnPaths: 2, hpMultiplier: 1.2 }
  ]
};

export default CONFIG;
