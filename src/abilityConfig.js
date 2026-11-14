// RV Lab ability trees: every defense has three upgrade paths (A, B and C) of five tiers each.
//
// How a tier is earned: research it in the RV Lab, ONE PICK PER TIER per defense type (path A's, B's or C's
// option; any mix, e.g. A1, B2, A3; picks are final; the RV Lab's level caps the tier). The pick then applies
// to every building of that type at once, as soon as the building's level reaches the tier's requirement
// (ABILITY_LEVEL_REQ). Nothing is bought per building.
// Because a tier can be owned without the tier before it on the same path, every tier's fx works on its own:
// a tier that strengthens an earlier one (Forked Lightning, Heat Haze...) also brings that earlier effect.
//
// Each tier's `fx` holds what it changes. A building's effects are all its owned tiers' fx merged:
//   - keys ending in "Pct" or "Add" are summed (damagePct: 15 then 25 = +40% damage),
//   - every other key keeps the largest value any owned tier gives it (pierce: 1 then 3 = 3).
// The logic that reads each key lives in src/logic/abilities.js (merging, costs, rules) and
// src/logic/abilityEffects.js plus combat.js / beams.js / traps.js / flock.js (what they do in a fight).

/**
 * Prices per tier (index 0 = tier 1), in RESEARCH POINTS (RP), paid once per pick in the RV Lab (it then applies
 * to every building of that type). RP are earned by defeating enemies (CONFIG.enemies[kind].researchPoints) and
 * surviving nights (CONFIG.rules.researchPointsPerWave x the wave number); see src/logic/researchPoints.js.
 * Gold builds and upgrades the RV Lab itself.
 */
export const ABILITY_COSTS = {
  research: [80, 240, 600, 1400, 3000]
};

/** Building level needed for each tier (index 0 = tier 1). Types with fewer levels have their own list. */
export const ABILITY_LEVEL_REQ = {
  default: [2, 4, 6, 8, 10],
  catapult: [2, 3, 4, 5, 6], // 6 levels
  ra: [2, 4, 5, 7, 8]        // 8 levels
};

export const MAX_TIER = 5;
export const PATH_KEYS = ['a', 'b', 'c'];
/** Path colors: the pips over a building and the ability windows. */
export const PATH_COLORS = { a: 0xff9a3c, b: 0x4cb8ff, c: 0x5ad35a };
export const PATH_TEXT_COLORS = { a: '#ffb36b', b: '#7fd0ff', c: '#8fe88f' };

/** Building level a tier needs (1-based tier). */
export function levelReq(type, tier) {
  return (ABILITY_LEVEL_REQ[type] || ABILITY_LEVEL_REQ.default)[tier - 1];
}

/**
 * The tiers a building of this type and level has: the RV Lab's picks for the type (research[type], e.g.
 * ['a', 'b', 'a']), up to the first tier the building's level is too low for. Here (not in abilities.js) so
 * buildings.js can use it without an import loop.
 */
export function picksForLevel(research, type, level) {
  const picks = (research && research[type]) || [];
  let n = 0;
  while (n < picks.length && level >= levelReq(type, n + 1)) n++;
  return picks.slice(0, n);
}

// Shared timings for the effects (seconds unless noted).
export const ABILITY_RULES = {
  trapRearmSeconds: 10,   // Mousetrap Spring Back / Auto-Reset: re-arms this long after it snaps
  burnTick: 0.5,          // burning enemies (Burning Sparks) take damage in ticks this long
  ringTick: 0.5,          // Tower of Rah Fire Ring damage tick
  beamChainRange: 2.5,    // Tower of Rah chains jump to enemies this close to the beam's target
  lineHitRadius: 0.45,    // a piercing cannonball hits enemies this close to its path
  boulderHitRadius: 0.6,  // a rolling boulder is wider
  boulderSpeed: 6,        // tiles per second
  boulderExtra: 3,        // a boulder rolls this far past the catapult's range
  strikeDelay: 0.7,       // Arrow Storm / Meteor: time from the call to the hit
  glueRadius: 1.5,        // Sticky Trap glue patch radius before Super Glue
  aftershockDelay: 0.5,   // Mortar Aftershock: the second blast comes this long after the first
  lastStandBelow: 0.3,    // Cannon Last Stand: kicks in below this share of its health...
  lastStandSeconds: 5,    // ...for this long (it can't fall meanwhile), once per night
  shatterSpread: 0.9, shatterSplash: 0.6, // Diddypult Shatter: where the small splashes land and their size
  meltSeconds: 0.5        // Tower of Rah Melt Armor lingers this long after the beam leaves
};

const t = (name, desc, fx) => ({ name, desc, fx });

/** ABILITIES[type] = { a: { name, tiers: [5] }, b: { name, tiers: [5] } } */
export const ABILITIES = {
  cannon: {
    a: { name: 'Heavy Shot', tiers: [
      t('Powder Keg', 'Every 4th cannonball is an explosive shell that splashes everything within 1 tile.', { kegEvery: 4, kegSplash: 1 }),
      t('Piercing Shot', 'Cannonballs punch through their target and hit 1 more enemy behind it.', { pierce: 1, pierceLength: 2.5 }),
      t('Battering Ram', 'Punches through up to 3 more enemies and knocks each one back half a tile.', { pierce: 3, pierceLength: 3.5, knockback: 0.5 }),
      t('Anvil Shot', 'Knockback grows to 1 tile, and an enemy slammed into a wall or building is stunned 1 s and takes 50% more damage.', { knockback: 1, slamStun: 1, slamDamage: 0.5 }),
      t('Wrecking Ball', 'Smashes through every enemy in a 5-tile line, knocking each back and stunning it for 0.5 s.', { pierce: 99, pierceLength: 5, knockback: 1, stun: 0.5 })
    ] },
    b: { name: 'Rapid Fire', tiers: [
      t('Hot Barrel', 'Each shot in a row at the same enemy fires 10% faster (up to 50%); a new target cools it down.', { rampPct: 10, rampMax: 50 }),
      t('Flak Burst', 'Every 2 s, bursts a flyer within 2.5 tiles for full damage, though cannons can\'t normally hit flyers.', { flakRange: 2.5, flakEvery: 2 }),
      t('Grapeshot', 'Every 3rd shot also sprays 2 pellets at other enemies in range (50% damage).', { grapeEvery: 3, grapePellets: 2, grapeDamage: 0.5 }),
      t('Autoloader', 'After a kill, the next cannonball fires instantly.', { autoload: 1 }),
      t('Broadside', 'Every 8 s, fires a fan of 5 cannonballs toward its target; each one punches through 2 enemies.', { broadsideEvery: 8, broadsideCount: 5 })
    ] }
  },
  archer: {
    a: { name: 'Volley', tiers: [
      t('Ricochet', 'An arrow that kills its target bounces to the nearest enemy within 3 tiles for full damage.', { ricochet: 3 }),
      t('Double Arrow', 'Shoots 2 arrows at once, at 2 different enemies when it can.', { multiShot: 2 }),
      t('Tank Buster', 'Arrows also deal 4% of the target\'s current health (up to 60 extra), so even Tanks wear down.', { hpShred: 0.04, hpShredCap: 60 }),
      t('Triple Arrow', 'Shoots 3 arrows at once.', { multiShot: 3 }),
      t('Volley Lock', 'Every 8 s, fires an arrow at every enemy in range at once.', { volleyEvery: 8 })
    ] },
    b: { name: 'Sharpshooter', tiers: [
      t('Bullseye', '+40% damage to enemies in the outer third of its range.', { farPct: 40 }),
      t('Keen Sight', 'Can see and shoot invisible enemies (Goyum Goblins).', { seeInvisible: 1 }),
      t('Critical Hits', '20% of arrows deal 3x damage.', { critChance: 0.2, critMult: 3 }),
      t('Ambush', '+1.5 tile range, and the first arrow at each new target deals double.', { rangeAdd: 1.5, firstShotMult: 2 }),
      t('Headshot', 'Every 5th arrow goes to the toughest enemy in range for 8x damage.', { headshotEvery: 5, headshotMult: 8 })
    ] }
  },
  mortar: {
    a: { name: 'Big Bertha', tiers: [
      t('Ranging Shot', 'Shells aim where the target is heading, so they land on moving enemies.', { leadShot: 1 }),
      t('Dead Center', 'Enemies at the center of the blast (within half a tile) take 60% more damage.', { centerPct: 60 }),
      t('Heavy Ordnance', '+75% damage to Tanks and Wall Breakers.', { bigBonus: 0.75 }),
      t('Close Support', 'The blind spot shrinks from 3 tiles to 1.5.', { minRangeAdd: -1.5 }),
      t('Cluster Shell', 'Each shell scatters 4 bomblets around the blast (40% damage each).', { cluster: 4, clusterDamage: 0.4 })
    ] },
    b: { name: 'Shell Shock', tiers: [
      t('Ready Rack', 'While nothing is in range it loads up to 2 extra shells, then fires them back to back when an enemy arrives.', { rackMax: 2 }),
      t('Spillover', 'Every enemy that dies in a pool makes that pool 0.25 tile bigger (up to +1).', { poolGrow: 0.25 }),
      t('Shell Shock', 'Enemies hit are stunned for 0.5 s.', { stunOnHit: 0.5 }),
      t('Spotter Link', 'Can shell enemies up to 4 tiles beyond its range if a F.L.O.C.K Tower has marked them.', { markRangeAdd: 4 }),
      t('Barrage', 'Fires 3 shells in quick succession.', { burst: 3 })
    ] }
  },
  wizard: {
    a: { name: 'Pyromancer', tiers: [
      t('Kindling', 'Fireballs deal 50% more damage to burning enemies.', { burningBonus: 0.5 }),
      t('Scorched Earth', 'Fireballs leave burning ground for 3 s that burns ground enemies for 30% of the damage every second.', { burnRadius: 0.8, burnDuration: 3, burnDps: 0.3 }),
      t('Wildfire', 'The burning ground is bigger, lasts 5 s and burns for 40% every second.', { burnRadius: 1.2, burnDuration: 5, burnDps: 0.4 }),
      t('Phoenix Ash', 'Leaves burning ground (30%/s, 3 s), and an enemy that dies in burning ground leaves a new patch where it fell.', { burnRadius: 0.8, burnDuration: 3, burnDps: 0.3, ashPatch: 1 }),
      t('Meteor', 'Every 10 s, calls a meteor on the biggest crowd in range: 5x damage within 2 tiles, and a big fire field.', { meteorEvery: 10, meteorMult: 5, meteorRadius: 2 })
    ] },
    b: { name: 'Stormcaller', tiers: [
      t('Storm Front', '+1.5 tile range while 4 or more enemies are within its normal range.', { crowdRangeAdd: 1.5, crowdCount: 4 }),
      t('Chain Lightning', 'Each hit arcs to 2 more enemies within 2 tiles (60% damage).', { chainCount: 2, chainRange: 2, chainDamage: 0.6 }),
      t('Forked Lightning', 'Each hit arcs to 4 more enemies within 2 tiles (60% damage).', { chainCount: 4, chainRange: 2, chainDamage: 0.6 }),
      t('Overcharge', 'Hits arc to 2 more enemies, and each jump hits 25% harder than the one before.', { chainCount: 2, chainRange: 2, chainDamage: 0.6, chainGrow: 0.25 }),
      t('Storm', 'Each hit arcs to 8 more enemies (60% damage), and every enemy an arc kills sends out a new arc.', { chainCount: 8, chainRange: 2, chainDamage: 0.6, chainOnKill: 1 })
    ] }
  },
  firework: {
    a: { name: 'Grand Finale', tiers: [
      t('Peony', 'Bursts are 0.5 tile bigger, and another 0.5 tile bigger when 3 or more flyers are bunched up.', { splashAdd: 0.5, crowdSplash: 0.5 }),
      t('Skyrocket', 'Rockets fly twice as fast and hit 20% harder.', { projSpeedPct: 100, damagePct: 20 }),
      t('Sparklers', 'Each burst throws 3 sparklers that burst again nearby (35% damage).', { sparklers: 3, sparklerDamage: 0.35 }),
      t('Grounding Burst', 'Flyers hit crash to the ground for 1.5 s: stunned, and in reach of ground-only defenses.', { groundFlyers: 1.5 }),
      t('Finale', 'Every 12 s, launches a salvo of 6 rockets.', { salvoEvery: 12, salvoCount: 6 })
    ] },
    b: { name: 'Ground Show', tiers: [
      t('Ground Show', 'Can hit ground enemies too, for 50% damage.', { groundDamage: 0.5 }),
      t('Fountain', 'Hits ground enemies (50%), and rockets that hit one spray sparks 1 tile past it (40% damage).', { groundDamage: 0.5, fountain: 0.4 }),
      t('Rapid Display', 'Fires 50% faster while there are no flyers in range.', { groundFireRatePct: 50 }),
      t('Full Show', 'Full damage to ground enemies.', { groundDamage: 1 }),
      t('Showstopper', 'Enemies hit are too dazzled to attack for 2 s (they keep walking).', { disarm: 2 })
    ] }
  },
  mousetrap: {
    a: { name: 'Bear Trap', tiers: [
      t('Wide Jaws', '+0.5 tile catch radius.', { trapRadiusAdd: 0.5 }),
      t('Jaw Lock', 'Caught enemies above half health take double damage.', { jawLock: 1 }),
      t('Spring Back', 'Re-arms once per wave, 10 s after it snaps.', { rearms: 1 }),
      t('Iron Grip', 'Holds enemies 1 s longer.', { holdAdd: 1 }),
      t('Auto-Reset', 'Re-arms 10 s after every snap, all night long.', { rearms: 99 })
    ] },
    b: { name: 'Sticky Trap', tiers: [
      t('Glue Pot', 'Leaves a glue patch that slows ground enemies 40% for 4 s.', { glueSlow: 0.4, glueDuration: 4 }),
      t('Gum Up', 'Wall Breakers caught in it are defused: they fall apart without exploding.', { defuse: 1 }),
      t('Super Glue', 'Snapping leaves a big glue patch (+0.5 tile) that slows 40% for 7 s.', { glueSlow: 0.4, glueRadiusAdd: 0.5, glueDuration: 7 }),
      t('Fly Paper', 'Snapping leaves glue that slows 55%, and Neegies that land in it are stuck for 2 s.', { glueSlow: 0.55, glueDuration: 4, glueStick: 2 }),
      t('Cheese Bait', 'Pulls ground enemies within 3 tiles onto the trap before it snaps.', { lureRadius: 3 })
    ] }
  },
  flock: {
    a: { name: 'Exposer', tiers: [
      t('Sharper Lenses', '+5% mark bonus.', { markAdd: 5 }),
      t('Weak Point Scan', 'Marked enemies under 30% health take double the mark bonus.', { executeMark: 0.3 }),
      t('Drone Tail', 'Marks follow enemies for 3 s after they leave range.', { markLinger: 3 }),
      t('Weak Spots', '+10% mark bonus.', { markAdd: 10 }),
      t('Bounty Hunter', 'Marked enemies drop 50% more gold when defeated.', { markBounty: 0.5 })
    ] },
    b: { name: 'Commander', tiers: [
      t('Drill Sergeant', 'Defenses in range fire 10% faster.', { auraFireRatePct: 10 }),
      t('Overwatch', 'Defenses in range can see and shoot invisible enemies.', { auraSeeInvisible: 1 }),
      t('Spotter', 'Defenses in range get +1 tile range.', { auraRangeAdd: 1 }),
      t('Double Time', 'Defenses in range fire 20% faster (10% more).', { auraFireRatePct: 10 }),
      t('Rally', 'Defenses in range deal 25% more damage.', { auraDamagePct: 25 })
    ] }
  },
  catapult: {
    a: { name: 'Toxic', tiers: [
      t('Lingering Oil', 'Pools last 1 s longer.', { poolDurationAdd: 1 }),
      t('Big Splash', 'Pools are 0.5 tile bigger.', { poolRadiusAdd: 0.5 }),
      t('Slick', 'Pools slow enemies 40%.', { poolSlow: 0.4 }),
      t('Hot Oil', '+30% pool damage.', { poolDpsPct: 30 }),
      t('Swamp', 'Pools last 15 s.', { poolDurationMin: 15 })
    ] },
    b: { name: 'Payload', tiers: [
      t('Splash Zone', 'Impacts deal double damage to enemies already standing in a pool.', { poolBonus: 1 }),
      t('Oil Moat', 'A lasting oil slick 2.5 tiles around the catapult slows ground enemies 40%, covering its blind spot.', { moatRadius: 2.5, moatSlow: 0.4 }),
      t('Big Jug', 'Every 3rd shot is a big jug: 2x impact damage and a pool twice as wide.', { jugEvery: 3, jugMult: 2 }),
      t('Pressure Cap', 'Impacts suck ground enemies within 2 tiles 1 tile toward the splash (into the pool).', { pull: 1, pullRadius: 2 }),
      t('Boulder', 'Every 4th shot is a boulder that rolls through every ground enemy in its path (3x damage, knockback).', { boulderEvery: 4, boulderMult: 3 })
    ] }
  },
  ra: {
    a: { name: 'Sun Ring', tiers: [
      t('Quick Heat', 'The beam heats up 25% faster.', { heatPct: 25 }),
      t('Fire Ring', 'A 2-tile ring of fire around the tower burns every enemy inside for 50% of beam damage per second.', { ringRadius: 2, ringDps: 0.5 }),
      t('Inferno Ring', 'The ring grows to 3 tiles and burns for 80%.', { ringRadius: 3, ringDps: 0.8 }),
      t('Ring of Fire', 'A Fire Ring (2 tiles, if it has none yet) that burns 10% hotter for every second an enemy stays in it (up to x3).', { ringRadius: 2, ringDps: 0.5, ringRamp: 0.1, ringRampMax: 3 }),
      t('Solar Flare', 'Every 6 s, its Fire Ring (2 tiles if it has none yet) flares for 6x beam damage to all inside.', { ringRadius: 2, ringDps: 0.5, flareEvery: 6, flareMult: 6 })
    ] },
    b: { name: 'Prism', tiers: [
      t('Heat Memory', 'Switching to a new target within 1 s keeps the heat the beam had.', { heatCarry: 1 }),
      t('Split Beam', 'The beam chains to 1 more enemy nearby for 40% damage.', { chains: 1, chainPct: 0.4 }),
      t('Refraction', 'Chains to 2 more enemies for 50% damage.', { chains: 2, chainPct: 0.5 }),
      t('Spreading Heat', 'The beam chains to 1 more enemy (40%), and chained enemies take its heat bonus (x3, x8).', { chains: 1, chainPct: 0.4, chainHeat: 1 }),
      t('Prism', '3 separate beams, each locked onto its own enemy and heating up on its own.', { beams: 3 })
    ] }
  }
};

// ---------- Path C (the third path) ----------
// Added after A and B; merged into ABILITIES below so every defense has three paths.
const PATH_C = {
  cannon: { name: 'Fortress', tiers: [
    t('Thick Walls', '+25% health.', { hpPct: 25 }),
    t('Armor Plating', 'Takes 15% less damage.', { armor: 0.15 }),
    t('Spiked Plating', 'Melee attackers take 50% of each hit they deal back.', { thorns: 0.5 }),
    t('Self-Repair', 'Heals 2% of its health every second during attacks.', { regen: 0.02 }),
    t('Last Stand', 'Below 30% health it fires twice as fast and can\'t fall for 5 s (once per night).', { lastStand: 1 })
  ] },
  archer: { name: 'Venom', tiers: [
    t('Poison Tips', 'Arrows poison: 20% of the damage every second for 3 s.', { poisonDps: 0.2, poisonSeconds: 3 }),
    t('Lingering Venom', 'Poison deals 30% every second and lasts 5 s.', { poisonDps: 0.3, poisonSeconds: 5 }),
    t('Festering', 'Arrows poison (20%/s, 3 s), and the poison burns 25% hotter for every second it lasts.', { poisonDps: 0.2, poisonSeconds: 3, poisonRamp: 0.25 }),
    t('Spreading Plague', 'Arrows poison (20%/s, 3 s); a poisoned enemy that dies poisons enemies within 1.5 tiles.', { poisonDps: 0.2, poisonSeconds: 3, poisonSpread: 1.5 }),
    t('Toxic Cloud', 'Every 10 s, poisons every enemy in range (20% of the damage every second for 3 s).', { cloudEvery: 10, poisonDps: 0.2, poisonSeconds: 3 })
  ] },
  mortar: { name: 'Earthshaker', tiers: [
    t('Seismic Charge', 'Shells bounce once: a second blast lands 2 tiles further on (50% damage).', { bounce: 0.5, bounceDist: 2 }),
    t('Fault Line', 'Blasts crack the ground back toward the mortar: enemies on the crack take 20% of the damage per second for 4 s.', { crack: 0.2, crackSeconds: 4 }),
    t('Aftershock', 'A second blast hits the same spot 0.5 s later (40% damage).', { aftershock: 0.4 }),
    t('Ground Zero', 'Enemies killed by a blast burst too, hitting everything within 1 tile for 30% of the damage.', { deathBurst: 0.3 }),
    t('Earthquake', 'Every 15 s, stuns every ground enemy in range for 1.5 s and hits it for 2x damage.', { quakeEvery: 15, quakeStun: 1.5, quakeMult: 2 })
  ] },
  wizard: { name: 'Arcane', tiers: [
    t('Mana Surge', 'After 4 s without casting, the next fireball deals 3x damage.', { surgeIdle: 4, surgeMult: 3 }),
    t('Blink', 'Enemies that reach the tower are teleported 3 tiles back the way they came (once each).', { blinkRange: 1, blinkDist: 3 }),
    t('Mana Bomb', 'A fireball that hits 3 or more enemies lets it cast again at once.', { multiHitReset: 3 }),
    t('Spellsteal', 'Each kill gives +5% damage for the rest of the night (up to +50%).', { stealPct: 5, stealMax: 50 }),
    t('Time Warp', 'Every 12 s, slows every enemy in range 50% for 3 s.', { warpEvery: 12, warpSlow: 0.5, warpSeconds: 3 })
  ] },
  firework: { name: 'Signal Flares', tiers: [
    t('Decoy Flare', 'Every 10 s, launches a decoy: flyers in range chase it for 3 s instead of attacking.', { decoyEvery: 10, decoySeconds: 3 }),
    t('Counter-Flare', 'When it\'s hit, it fires a free rocket back at the attacker (at most every 2 s).', { counterFire: 2 }),
    t('Star Shells', 'Every 5th rocket leaves a star hanging in the sky for 3 s that burns flyers passing through it (50%/s).', { starEvery: 5, starDps: 0.5, starSeconds: 3 }),
    t('Celebration', 'Each flyer it destroys makes defenses within 3 tiles fire 25% faster for 4 s.', { celebrateRange: 3, celebratePct: 25, celebrateSeconds: 4 }),
    t('Grand Display', 'Every 15 s, a show lights up the whole sky: every flyer on the map takes 1x damage.', { showEvery: 15, showMult: 1 })
  ] },
  mousetrap: { name: 'Spike Trap', tiers: [
    t('Spikes', 'Snapping leaves spikes that hurt ground enemies (50% of the damage every second) for 3 s.', { spikeDps: 0.5, spikeSeconds: 3 }),
    t('Snare', 'The enemy that sets it off is held 3 s longer than the rest.', { triggerHoldAdd: 3 }),
    t('Shrapnel Spring', 'Snapping fires 6 spikes outward; each hits the first enemy in its way (60% damage, 4 tiles).', { spikeShots: 6, spikeShotDamage: 0.6, spikeShotRange: 4 }),
    t('Bed of Nails', 'Snapping leaves spikes (50%/s) that last 6 s and spread 0.5 tile wider.', { spikeDps: 0.5, spikeSeconds: 6, spikeRadiusAdd: 0.5 }),
    t('Booby Trap', 'Snapping also explodes for 2x damage on every enemy within 2.5 tiles, flyers too.', { boobyMult: 2, boobyRadius: 2.5 })
  ] },
  flock: { name: 'Hacker', tiers: [
    t('Jammer', 'Enemies in range deal 10% less damage.', { jam: 0.1 }),
    t('Data Leech', 'Every enemy defeated in range gives +1 research point.', { leechRp: 1 }),
    t('Frequency Jam', 'Bombers and Neegy Balloons in range can\'t drop bombs or troops.', { airJam: 1 }),
    t('Full Jam', 'Enemies in range deal 25% less damage.', { jam: 0.25 }),
    t('Override', 'Every 15 s, hacks the toughest enemy in range: for 5 s it stops attacking you and attacks enemies next to it.', { overrideEvery: 15, overrideSeconds: 5 })
  ] },
  catapult: { name: 'Siege', tiers: [
    t('Long Arm', '+2 tiles range.', { rangeAdd: 2 }),
    t('Hangover', 'Enemies hit stagger around aimlessly for 2 s.', { hangover: 2 }),
    t('Concussion', 'Enemies hit are stunned for 0.5 s.', { stunOnHit: 0.5 }),
    t('Toxic Fumes', 'Pools also hurt flyers hovering over them, for half damage.', { poolAir: 0.5 }),
    t('Oil Tanker', 'Every 20 s, a pool spreads under every ground enemy in range at once.', { floodEvery: 20 })
  ] },
  ra: { name: 'Overheat', tiers: [
    t('Hot Start', 'Each beam starts already heated to x3.', { hotStart: 1 }),
    t('Afterburn', 'When the beam leaves a target, the target keeps burning for 3 s at 30% of the beam\'s last damage.', { afterburn: 0.3, afterburnSeconds: 3 }),
    t('Cauterize', 'Enemies the beam kills heal buildings within 3 tiles for 5% of their health.', { cauterize: 0.05, cauterizeRadius: 3 }),
    t('Hotter Peak', 'Top heat burns for x10 instead of x8.', { peakMult: 10 }),
    t('Supernova', 'A target killed at full heat explodes for 4 s of beam damage within 2 tiles.', { supernova: 4, supernovaRadius: 2 })
  ] }
};
for (const [type, path] of Object.entries(PATH_C)) ABILITIES[type].c = path;
