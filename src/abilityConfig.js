// RV Lab ability trees: every defense has three upgrade paths (A, B and C) of five tiers each.
//
// How a tier is earned: research it in the RV Lab with RP. The FIRST pick for a building type commits the type to
// that path (A, B or C) for good; the later tiers can only be that path's. (A paid respec in the RV Lab resets a
// type's path: see respecCost in logic/abilities.js.) The RV Lab's level caps the tier (tier N needs lab level N).
// A pick applies to EVERY building of the type at once, whatever its level. Nothing is bought per building.
// Tiers of a path are bought in order, so a tier can lean on the earlier ones of its path, but every tier's fx
// still lists what it needs on its own (older mixed saves were converted).
//
// ADDING A TREE: see docs/PERKS.md. In short, call registerPerkTree(type, tree, group) at the bottom of this file.
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

export const MAX_TIER = 5;
export const PATH_KEYS = ['a', 'b', 'c'];
/** Path colors: the pips over a building and the ability windows. */
export const PATH_COLORS = { a: 0xff9a3c, b: 0x4cb8ff, c: 0x5ad35a };
export const PATH_TEXT_COLORS = { a: '#ffb36b', b: '#7fd0ff', c: '#8fe88f' };

/**
 * The tiers every building of this type has: the RV Lab's picks for the type (research[type], e.g.
 * ['a', 'a', 'a']: one path, locked by the first pick). A building's own level does not matter. Here (not in
 * abilities.js) so buildings.js can use it without an import loop.
 */
export function picksFor(research, type) {
  const picks = (research && research[type]) || [];
  return picks.slice();
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
      t('Keen Sight', 'Can see and shoot invisible enemies (Mr. Least).', { seeInvisible: 1 }),
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
      t('Barrage', 'Fires 2 shells in quick succession.', { burst: 2 }) // v0.5: was 3 (with Path C, the strongest tier-5 path in the balance runs)
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
      t('Bounty Hunter', 'Marked enemies drop 50% more Bitcoin when defeated.', { markBounty: 0.5 })
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
      // (chainPct ends in Pct, so it adds up over the path's tiers: 0.4 + 0.1 = 50%. It used to add up to 130%.)
      t('Split Beam', 'The beam chains to 1 more enemy nearby for 40% damage.', { chains: 1, chainPct: 0.4 }),
      t('Refraction', 'Chains to 2 more enemies, for 50% damage.', { chains: 2, chainPct: 0.1 }),
      t('Spreading Heat', 'The beam chains to 1 more enemy (3 in all), and chained enemies take its heat bonus (x3, x8).', { chains: 3, chainHeat: 1 }),
      t('Prism', '3 separate beams, each locked onto its own enemy and heating up on its own.', { beams: 3 })
    ] }
  }
};

// ---------- Path C (the third path) ----------
// Added after A and B; merged into ABILITIES below so every defense has three paths.
const PATH_C = {
  cannon: { name: 'Fortress', tiers: [
    t('Thick Walls', '+40% health.', { hpPct: 40 }), // v0.5: Fortress was the weakest path (was +25% / 15%)
    t('Armor Plating', 'Takes 20% less damage.', { armor: 0.2 }),
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
    t('Earthquake', 'Every 20 s, stuns every ground enemy in range for 1.5 s and hits it for 1.5x damage.', { quakeEvery: 20, quakeStun: 1.5, quakeMult: 1.5 }) // v0.5: was every 15 s, 2x
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
    t('Data Leech', 'Every enemy defeated in range gives +1 Shake.', { leechRp: 1 }),
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
const DEFENSE_TREE_TYPES = Object.keys(ABILITIES);
for (const [type, path] of Object.entries(PATH_C)) ABILITIES[type].c = path;
// ---------- the Brisket King (his altar's tree; read by src/logic/hero.js) ----------
ABILITIES.altar = {
  a: { name: 'Pitmaster', tiers: [
    t('Smoked Rub', 'The Brisket King hits 25% harder.', { heroDamagePct: 25 }),
    t('Burnt Ends', 'His hits splash 50% of their damage onto enemies within 1 tile.', { heroSplashPct: 50, heroSplashRadius: 1 }),
    t('Sauce Drip', 'Enemies he hits are slowed 30% for 2 s.', { heroSlow: 0.3, heroSlowSeconds: 2 }),
    t('Meat Sweats', 'He attacks 35% faster.', { heroAttackSpeedPct: 35 }),
    t('Whole Hog', 'Every 5th hit deals triple damage and knocks the enemy back 1 tile.', { wholeHogEvery: 5, wholeHogMult: 3, wholeHogKnock: 1 })
  ] },
  b: { name: 'Royal Guard', tiers: [
    t('Bark Crust', 'The Brisket King has 30% more health.', { heroHpPct: 30 }),
    t('Lifesteal Platter', 'He heals 15% of the damage he deals.', { heroLifesteal: 0.15 }),
    t('Royal Taunt', 'Ground enemies within 2 tiles stop to fight him instead.', { heroTaunt: 2 }),
    t('Iron Stomach', 'He takes 25% less damage.', { heroArmor: 0.25 }),
    t('Second Wind', "When he's knocked out in a raid, he gets back up after 20 s with 40% health (instead of staying down until the raid ends).", { heroReviveSeconds: 20, heroReviveHpPct: 0.4 })
  ] },
  c: { name: 'Kingdom', tiers: [
    t('Long Reach', 'He guards 2 tiles farther from his altar.', { guardRangeAdd: 2 }),
    t('Power Nap', 'He sleeps 40% shorter after a wave.', { heroSleepFasterPct: 40 }),
    t('Royal Banquet', 'Brisket Feast also heals buildings within his guard range by 15% of their health.', { feastHealBuildingsPct: 15 }),
    t('Royal Decree', "While he's awake, defenses within his guard range fire 15% faster.", { heroDecreePct: 15 }),
    t('Feast for Days', 'Brisket Feast can be used twice per wave.', { feastCharges: 2 })
  ] }
};
/** The defense types with trees, and the Brisket King's altar (the Defenses tab of the research window). */
export const DEFENSE_ABILITY_TYPES = [...DEFENSE_TREE_TYPES, 'altar'];

// ---------- economy buildings (researched in the RV Lab like the defenses; their own tab in the window) ----------
// Their fx keys are read by economy.js (mines, storage), villagers.js (gnomes), econPerks.js (house income,
// militia, mine auto-collect) and dj.js (DJ Babyface). Same rules: one pick per tier, every tier works alone.
export const ECONOMY_ABILITIES = {
  mine: {
    a: { name: 'Overclock', tiers: [
      t('Overclocked Rig', 'Mines 25% more Bitcoin.', { productionPct: 25 }),
      t('Deep Vault', 'Holds 75% more Bitcoin before it\'s full.', { stockCapPct: 75 }),
      t('Night Shift', 'Mines 50% more Bitcoin while it\'s dark.', { nightProductionPct: 50 }),
      t('Mining Pool', 'Mines 6% more for every other standing Bitcoin Mine.', { poolPct: 6 }),
      t('Bull Run', 'Mines 60% more Bitcoin.', { productionPct: 60 })
    ] },
    b: { name: 'Automation', tiers: [
      t('Gnome Rail', 'Gnomes carry its Bitcoin to storage 40% faster.', { tripFasterPct: 40 }),
      t('Auto-Collect', 'Sends its Bitcoin to storage by itself every 40 s (between waves).', { autoCollectPerMin: 1.5 }),
      t('Tip Jar', 'Collecting it (by hand or automatically) pays 15% extra.', { collectBonusPct: 15 }),
      t('Smart Contract', 'Sends its Bitcoin to storage by itself every 20 s, even during waves.', { autoCollectPerMin: 3, autoInWaves: 1 }),
      t('Compound Mining', 'Every collection makes it mine 2% more (up to +30%) until it\'s destroyed.', { compoundPct: 2, compoundMax: 30 })
    ] },
    c: { name: 'Security', tiers: [
      t('Steel Casing', '+35% health.', { hpPct: 35 }),
      t('Booby-Trapped Coins', 'Enemies that hit it take 40% of the damage back.', { thorns: 0.4 }),
      t('Hidden Stash', 'Mr. Least deals 60% less damage to it.', { thiefResistPct: 60 }),
      t('Panic Room', 'Below 30% health it takes 50% less damage.', { lowHpArmor: 0.5 }),
      t('Bounty Vault', 'Enemies defeated within 3 tiles of it pay 50% more Bitcoin.', { nearBountyPct: 50, nearRadius: 3 })
    ] }
  },
  storage: {
    a: { name: 'Capacity', tiers: [
      t('Extra Shelves', 'Holds 25% more Bitcoin.', { capacityPct: 25 }),
      t('Compound Interest', 'Beating a wave pays 2% of the Bitcoin stored in it.', { interestPct: 2 }),
      t('Expansion Wing', 'Holds 50% more Bitcoin.', { capacityPct: 50 }),
      t('Night Dividend', 'Beating a wave pays 2% of the Bitcoin stored in it, doubled if it\'s dark.', { interestPct: 2, nightInterestMult: 2 }),
      t('Mega Vault', 'Holds twice as much Bitcoin.', { capacityPct: 100 })
    ] },
    b: { name: 'Vault', tiers: [
      t('Time Lock', 'Loses 30% less Bitcoin when it\'s hit.', { drainResistPct: 30 }),
      t('Reinforced Door', '+40% health.', { hpPct: 40 }),
      t('Dye Pack', 'Mr. Least is slowed 50% for 4 s when he hits it.', { thiefSlow: 0.5 }),
      t('Insurance', 'Half the Bitcoin it loses during a wave is paid back when you beat the wave.', { insurancePct: 50 }),
      t('Fort Knox', 'Loses no Bitcoin at all while it\'s above half health.', { drainImmuneAbove: 0.5 })
    ] },
    c: { name: 'Logistics', tiers: [
      t('Loading Dock', 'Gnomes delivering Bitcoin here deliver 15% more.', { dropBonusPct: 15 }),
      t('Express Lane', 'Gnome trips to it are 30% faster.', { tripFasterPct: 30 }),
      t('Bitcoin Magnet', 'Bitcoin Mines within 4 tiles mine 15% more.', { mineAuraPct: 15, auraRadius: 4 }),
      t('Payroll', 'Gnomes working at Bitcoin Mines within 4 tiles mine 25% faster.', { gnomeAuraPct: 25, auraRadius: 4 }),
      t('Central Bank', 'Every enemy defeated pays 10% more Bitcoin.', { bountyPct: 10 })
    ] }
  },
  house: {
    a: { name: 'Miners', tiers: [
      t('Lunchboxes', 'Its gnomes mine 20% faster.', { gnomeMinePct: 20 }),
      t('Bunk Beds', '+1 gnome.', { gnomesAdd: 1 }),
      t('Better Pickaxes', 'Its gnomes mine 40% faster.', { gnomeMinePct: 40 }),
      t('Bigger Sacks', 'Its gnomes carry 50% more Bitcoin per trip.', { sackPct: 50 }),
      t('Gnome Union', '+2 gnomes.', { gnomesAdd: 2 })
    ] },
    b: { name: 'Builders', tiers: [
      t('Toolbelts', 'Its gnomes repair 25% faster.', { gnomeRepairPct: 25 }),
      t('Brave Gnomes', 'Its gnomes keep repairing buildings under fire, at half speed.', { repairUnderFire: 0.5 }),
      t('Duct Tape', 'Gnomes also repair damaged walls.', { repairWalls: 1 }),
      t('Pit Crew', 'Its gnomes repair 60% faster.', { gnomeRepairPct: 60 }),
      t('Field Medics', 'Buildings its gnomes are repairing take 20% less damage.', { repairArmorPct: 20 })
    ] },
    c: { name: 'Village Life', tiers: [
      t('Cozy Home', '+40% health.', { hpPct: 40 }),
      t('Vegetable Garden', 'Makes 1 Bitcoin per second on its own.', { houseIncome: 1 }),
      t('Gnome Militia', 'Its gnomes pelt enemies within 2.5 tiles with pebbles (6 damage/s).', { militiaDps: 6, militiaRadius: 2.5 }),
      t('Night Watch', 'Pebbles at enemies within 2.5 tiles (6 damage/s), double in the dark.', { militiaDps: 6, militiaRadius: 2.5, militiaNightMult: 2 }),
      t('Town Pride', 'Every Bitcoin Mine mines 5% more.', { pridePct: 5 })
    ] }
  },
  dj: {
    a: { name: 'Hype', tiers: [
      t('Hype Man', 'Needs 25% fewer enemies to fill the meter.', { hypeNeededPct: -25 }),
      t('Encore', 'After a drop the meter starts 30% full.', { encorePct: 30 }),
      t('Long Mix', 'Drop the Beat lasts 4 s longer.', { beatSecondsAdd: 4 }),
      t('Auto-DJ', 'Drops the beat by itself as soon as the meter is full in a wave.', { autoDrop: 1 }),
      t('Festival', 'Drop the Beat gives +50% more fire rate.', { beatPctAdd: 50 })
    ] },
    b: { name: 'Bass', tiers: [
      t('Subwoofer', 'The drop stuns enemies in range for 1.5 s.', { dropStun: 1.5 }),
      t('Bass Shake', 'The drop deals 150 damage to enemies in range.', { dropDamage: 150 }),
      t('Strobe Lights', 'In the dark, enemies in range are also slowed 25%.', { calmSlow: 0.25 }),
      t('Wall of Sound', '+1.5 tiles range.', { rangeAdd: 1.5 }),
      t('Bass Drop', 'The drop knocks enemies in range 1.5 tiles away from the booth.', { dropKnockback: 1.5 })
    ] },
    c: { name: 'Party', tiers: [
      t('Crowd Pleaser', 'Gnomes in range work 20% faster on top.', { gnomeBoostAdd: 20 }),
      t('After Party', 'Beating a wave pays 10% more of its Bitcoin.', { afterPartyPct: 10 }),
      t('VIP Lounge', 'During waves, buildings in range heal 1% of their health each second.', { partyHealPct: 1 }),
      t('Dance Floor', 'Every 10 s, enemies in range stop to dance for 1 s.', { danceEvery: 10, danceSeconds: 1 }),
      t('Main Stage', 'Drop the Beat also gives defenses in range +30% damage.', { beatDamagePct: 30 })
    ] }
  }
};
for (const [type, tree] of Object.entries(ECONOMY_ABILITIES)) ABILITIES[type] = tree;
/** Ability types by tab: defenses, and the economy buildings (mine, storage, house, DJ Babyface). */
export const ECONOMY_ABILITY_TYPES = Object.keys(ECONOMY_ABILITIES);

/**
 * Register a perk tree for a building type (the one data-driven entry point; see docs/PERKS.md).
 * `tree` = { a: { name, tiers: [5 x t(name, desc, fx)] }, b: {...}, c: {...} }; `group` is the research window's
 * tab: 'defense' or 'economy'. Throws on a malformed tree so a typo fails the tests, not the game.
 */
export function registerPerkTree(type, tree, group = 'defense') {
  for (const p of PATH_KEYS) {
    const path = tree && tree[p];
    if (!path || !path.name || !Array.isArray(path.tiers) || path.tiers.length !== MAX_TIER) throw new Error(`perk tree ${type}: path ${p} needs a name and ${MAX_TIER} tiers`);
    for (const tier of path.tiers) if (!tier.name || !tier.desc || !tier.fx) throw new Error(`perk tree ${type}: every tier needs name, desc and fx`);
  }
  ABILITIES[type] = tree;
  const list = group === 'economy' ? ECONOMY_ABILITY_TYPES : DEFENSE_ABILITY_TYPES;
  if (!list.includes(type)) list.push(type);
}

// Shake Collector and Shake Storage (v0.15): one number per path, raised a step at every tier. `...Pct` keys add up
// down a path (abilities.js mergeFx), so each line says what that tier adds and the running total.
function economyPath(name, effect, line, tiers) {
  let total = 0;
  return { name, tiers: tiers.map(([tier, amount]) => { total += amount; return t(tier, line(amount, total), { [effect]: amount }); }) };
}

registerPerkTree('shakeCollector', {
  a: economyPath('Shake Production', 'productionPct', (n, all) => `Makes ${n}% more Shakes (${all}% in all).`, [
    ['Fast Mixer', 12], ['Dual Spout', 12], ['Blender Motor', 16], ['High Flow', 20], ['Triple Blend', 25]
  ]),
  b: economyPath('Stock Capacity', 'stockCapPct', (n, all) => `Holds ${n}% more before it's full (${all}% in all).`, [
    ['Tall Cups', 15], ['Cup Rack', 15], ['Cold Tank', 20], ['Cold Room', 25], ['Reserve Vat', 30]
  ]),
  c: economyPath('Health', 'hpPct', (n, all) => `+${n}% health (${all}% in all).`, [
    ['Reinforced Cart', 10], ['Shock Mounts', 12], ['Steel Counter', 14], ['Guard Rails', 16], ['Mixer Bunker', 20]
  ])
}, 'economy');

registerPerkTree('shakeStorage', {
  a: economyPath('Capacity', 'capacityPct', (n, all) => `Holds ${n}% more Shakes (${all}% in all).`, [
    ['Stacked Cups', 8], ['Deep Shelves', 10], ['Second Cooler', 12], ['Bulk Chiller', 14], ['Mega Cooler', 16]
  ]),
  b: economyPath('Spill Guard', 'drainResistPct', (n, all) => `Spills ${n}% fewer Shakes when it's hit (${all}% in all).`, [
    ['Snap Lids', 8], ['Sealed Racks', 10], ['Spill Tray', 12], ['Double Seal', 14], ['Armored Chiller', 16]
  ]),
  c: economyPath('Health', 'hpPct', (n, all) => `+${n}% health (${all}% in all).`, [
    ['Cooler Panels', 10], ['Braced Door', 12], ['Steel Shelves', 14], ['Rebar Shell', 16], ['Shake Fortress', 20]
  ])
}, 'economy');

// ---------- Spear Thrower (piercing sniper; fx read by combat.js fireSpear / hitEffects) ----------
// spearPierceAdd / spearLengthAdd / spearFalloffAdd change the spear's line (falloff is the share lost per enemy
// pierced: 0.25 = 100/75/50/25%); the rest are the usual hit effects.
registerPerkTree('spear', {
  a: { name: 'Impaler', tiers: [
    t('Long Haft', 'The spear pierces 1 more enemy.', { spearPierceAdd: 1 }),
    t('Deep Reach', 'The spear flies 2 tiles further past its target.', { spearLengthAdd: 2 }),
    t('Honed Point', 'Each enemy pierced takes 10% less damage loss (falloff 25% becomes 15%).', { spearFalloffAdd: -0.1 }),
    t('Skewer', 'The spear pierces 2 more enemies.', { spearPierceAdd: 2 }),
    t('Impale All', 'No damage is lost along the line, and it flies 3 tiles further.', { spearFalloffAdd: -0.25, spearLengthAdd: 3 })
  ] },
  b: { name: 'Hunter', tiers: [
    t('Barbed Head', 'Enemies hit bleed for 15% of the hit every second for 4 s.', { bleedOnHit: 0.15, bleedSeconds: 4 }),
    t('Armor Piercer', 'Enemies hit take 20% more damage for 4 s.', { vulnOnHit: 0.2, vulnSeconds: 4 }),
    t('Hamstring', 'Enemies hit are slowed 40% for 3 s.', { slowOnHit: 0.4, slowSeconds: 3 }),
    t('Serrated Edge', 'Bleeding hits harder: 30% of the hit every second for 5 s.', { bleedOnHit: 0.3, bleedSeconds: 5 }),
    t("Hunter's Mark", 'Enemies hit take 40% more damage for 6 s.', { vulnOnHit: 0.4, vulnSeconds: 6 })
  ] },
  c: { name: 'Throwing Arm', tiers: [
    t('Strong Arm', '+1 tile range.', { rangeAdd: 1 }),
    t('Quick Draw', 'Throws 20% faster.', { fireRatePct: 20 }),
    t('Heavy Spear', '+30% damage.', { damagePct: 30 }),
    t('Shock Throw', 'Enemies hit are stunned for 0.5 s.', { stunOnHit: 0.5 }),
    t('Master Thrower', '+40% damage and 15% faster throws.', { damagePct: 40, fireRatePct: 15 })
  ] }
});

// ---------- Fuel Station (spells; fx read by src/logic/spells.js through the station's abilityFx) ----------
// spellPowerPct: stronger effects (Rage boost, heal, Heat Field and Lightning damage); spellDurationPct: zones last
// longer; spellRadiusPct: bigger circles; lightningTargetsAdd: Lightning Strike hits more enemies; heatSlow /
// freezeVuln: extra effects for Heat Field / Freeze; brewCostPct: cheaper brewing; spellRefundPct: RP back on a
// cast; spellSlotsAdd: more spells carried into a raid.
registerPerkTree('fuelStation', {
  a: { name: 'Potency', tiers: [
    t('High Octane', 'Spells are 15% stronger.', { spellPowerPct: 15 }),
    t('Slow Burn', 'Spell zones last 25% longer.', { spellDurationPct: 25 }),
    t('Supercharged', 'Spells are 25% stronger.', { spellPowerPct: 25 }),
    t('Forked Bolt', 'Energy Drink (Lightning Strike) hits 2 more enemies.', { lightningTargetsAdd: 2 }),
    t('Nitro Blend', 'Spells are 40% stronger and their zones last 25% longer.', { spellPowerPct: 40, spellDurationPct: 25 })
  ] },
  b: { name: 'Spread', tiers: [
    t('Wide Nozzle', 'Spells cover a 15% bigger radius.', { spellRadiusPct: 15 }),
    t('Hot Exhaust', 'Spicy Tornado (Heat Field) also slows enemies in it by 30%.', { heatSlow: 0.3 }),
    t('Wide Spray', 'Spells cover a 25% bigger radius.', { spellRadiusPct: 25 }),
    t('Deep Freeze', 'Enemies frozen by an Ice Bag (Freeze) take 25% more damage from everything.', { freezeVuln: 0.25 }),
    t('Blanket Coverage', 'Spells cover a 40% bigger radius.', { spellRadiusPct: 40 })
  ] },
  c: { name: 'Refinery', tiers: [
    t('Bulk Discount', 'Brewing costs 15% fewer Shakes.', { brewCostPct: -15 }),
    t('Spare Tank', '+1 spell slot.', { spellSlotsAdd: 1 }),
    t('Recycler', 'Casting a spell refunds 25% of its brewing cost in Shakes.', { spellRefundPct: 25 }),
    t('Wholesale', 'Brewing costs 25% fewer Shakes.', { brewCostPct: -25 }),
    t('Fuel Depot', '+1 spell slot, and brewing costs 10% fewer Shakes.', { spellSlotsAdd: 1, brewCostPct: -10 })
  ] }
}, 'economy');

// ---------- KSI Tower (ice; fx read by combat.js fireDefense / landSplash / chillEnemy and abilityEffects.js) ----------
// chillSlowAdd / chillSecondsAdd: a stronger / longer chill on every enemy its bottles splash. iceRadius / iceSeconds /
// iceSlow: the burst leaves an icy patch (a pool, ground enemies only) that slows. freezeChance / freezeSeconds: an enemy
// splashed may freeze solid (held in place, icy blue; bosses are only chilled); frozenVuln: frozen enemies take more
// damage from everything. chilledBonus: its bottles hit chilled enemies harder. bounce / bounceDist: the bottle bounces
// on once (like the Mortar's Seismic Charge). blizzardEvery / blizzardSlow / blizzardSeconds / blizzardMult: a blizzard
// over its whole range on a timer.
registerPerkTree('ksi', {
  a: { name: 'Blizzard', tiers: [
    t('Cold Snap', 'Bottles splash 0.35 tile wider.', { splashAdd: 0.35 }),
    t('Frost Patch', 'Each burst leaves an icy patch (1 tile) that slows ground enemies 40% for 3 s.', { iceRadius: 1, iceSeconds: 3, iceSlow: 0.4 }),
    t('Wind Chill', 'Splashes 0.5 tile wider and the chill lasts 1 s longer.', { splashAdd: 0.5, chillSecondsAdd: 1 }),
    t('Permafrost', 'Icy patches grow to 1.4 tiles, last 5 s and slow 50%.', { iceRadius: 1.4, iceSeconds: 5, iceSlow: 0.5 }),
    t('Polar Vortex', 'Every 10 s, a blizzard hits every enemy in range for 150% damage and slows it 60% for 3 s.', { blizzardEvery: 10, blizzardSlow: 0.6, blizzardSeconds: 3, blizzardMult: 1.5 })
  ] },
  b: { name: 'Fully Frozen', tiers: [
    t('Brain Freeze', 'Enemies splashed have a 15% chance to freeze solid for 1 s.', { freezeChance: 0.15, freezeSeconds: 1 }),
    t('Deep Chill', 'The chill slows 10% more and lasts 1.5 s longer.', { chillSlowAdd: 0.1, chillSecondsAdd: 1.5 }),
    t('Flash Freeze', 'A 25% chance to freeze enemies solid for 1.5 s.', { freezeChance: 0.25, freezeSeconds: 1.5 }),
    t('Ice Shatter', 'Frozen enemies take 30% more damage from everything.', { frozenVuln: 0.3 }),
    t('Frozen Solid', 'A 35% chance to freeze enemies solid for 2 s.', { freezeChance: 0.35, freezeSeconds: 2 })
  ] },
  c: { name: 'Snowball', tiers: [
    t('Packed Snow', '+20% damage.', { damagePct: 20 }),
    t('Snowball Effect', 'Bottles deal 30% more damage to enemies that are already chilled.', { chilledBonus: 0.3 }),
    t('Rapid Chill', 'Throws 25% faster.', { fireRatePct: 25 }),
    t('Avalanche', 'Each bottle bounces on 1.5 tiles and splashes again for 60% damage.', { bounce: 0.6, bounceDist: 1.5 }),
    t('Mega Snowball', '+40% damage and +1 tile range.', { damagePct: 40, rangeAdd: 1 })
  ] }
});

// ---------- the Hatsune Queen (her altar's tree; read by src/logic/queen.js through queenStats) ----------
// queenDamagePct / queenRangeAdd: her bolts' damage and range. queenCrit / queenCritMult: a chance for a bolt to deal
// more. queenPierce: bolts fly on through that many more enemies. headlinerEvery / headlinerMult / headlinerVuln /
// headlinerSeconds: every Nth bolt hits harder and marks its target (takes more damage from everything).
// queenWarmupPct: defenses in her guard range fire faster while she's awake (towerFireInterval reads b._queenWarmup).
// encoreSecondsAdd: a longer Encore Cloak. encoreDefensePct: defenses in her guard range deal more while it lasts
// (towerDamageMult reads b._queenEncore). queenKillHeal: share of her health back per enemy she defeats.
// encoreCharges: Encore Cloaks per wave. queenHpPct / queenSpeedPct / queenSleepFasterPct: health, move speed, nap.
// queenDodge: chance to dodge a melee hit. queenReviveSeconds / queenReviveHpPct: back up after a knockout, once a wave.
registerPerkTree('queenAltar', {
  a: { name: 'Sharpshooter', tiers: [
    t('Sharp Tips', 'The Hatsune Queen\'s bolts deal 25% more damage.', { queenDamagePct: 25 }),
    t('Long Draw', 'She shoots 1.5 tiles farther.', { queenRangeAdd: 1.5 }),
    t('Critical Note', 'Each bolt has a 20% chance to deal double damage.', { queenCrit: 0.2, queenCritMult: 2 }),
    t('Piercing Bolt', 'Her bolts fly on through 1 more enemy.', { queenPierce: 1 }),
    t('Headliner', 'Every 4th bolt deals triple damage and marks its target: it takes 20% more damage from everything for 3 s.', { headlinerEvery: 4, headlinerMult: 3, headlinerVuln: 0.2, headlinerSeconds: 3 })
  ] },
  b: { name: 'Idol', tiers: [
    t('Warm-Up', 'While she\'s awake, defenses within her guard range fire 10% faster.', { queenWarmupPct: 10 }),
    t('Backup Chorus', 'Encore Cloak lasts 2 s longer.', { encoreSecondsAdd: 2 }),
    t('Encore+', 'While Encore Cloak lasts, defenses within her guard range deal 25% more damage.', { encoreDefensePct: 25 }),
    t('Fan Favorite', 'Every enemy she defeats heals her 5% of her health.', { queenKillHeal: 0.05 }),
    t('Sold Out Show', 'Encore Cloak can be used twice per wave.', { encoreCharges: 2 })
  ] },
  c: { name: 'Stagecraft', tiers: [
    t('Stage Armor', 'The Hatsune Queen has 30% more health.', { queenHpPct: 30 }),
    t('Quick Step', 'She moves 30% faster.', { queenSpeedPct: 30 }),
    t('Dodge Roll', 'She dodges 25% of the hits from enemies right next to her.', { queenDodge: 0.25 }),
    t('Understudy', 'She sleeps 40% shorter after a wave.', { queenSleepFasterPct: 40 }),
    t('Curtain Call', 'Knocked out in a raid, she gets back up after 20 s with 40% health (once per wave).', { queenReviveSeconds: 20, queenReviveHpPct: 0.4 })
  ] }
});

// ---------- the Locklair Mage (his building's tree; read by src/logic/mage.js through mageStats) ----------
// mageDamagePct / mageRangeAdd / mageFasterPct: his zap's damage, range and speed. mageChain / mageChainPct: each zap
// jumps on to that many enemies near its target for that share. mageOverchargeEvery / mageOverchargeMult: every Nth zap
// hits harder. mageHealPct: Sanctuary Aura's healing. mageRangeAdd / auraRadiusAdd: his one range (zap, aura, Aegis; v0.12.2). mageWard: buildings in his aura take that
// share less damage while he's awake (combat.js damageBuilding, b._mageWard). aegisCharges / aegisSecondsAdd /
// aegisHealPct: Arcane Aegis per wave, longer, and healing the buildings it covers by that share at once.
// hpPct: his health (his building's, through maxHp). mageSleepFasterPct: shorter naps. mageReviveSeconds /
// mageReviveHpPct: knocked out in a raid, he's back up after a while (once per raid).
registerPerkTree('mageAltar', {
  a: { name: 'Archmage', tiers: [
    t('Arcane Focus', "The Locklair Mage's zaps deal 25% more damage.", { mageDamagePct: 25 }),
    t('Long Staff', 'His range (zap, aura and Arcane Aegis) grows 1.5 tiles.', { mageRangeAdd: 1.5 }),
    t('Chain Spark', 'Each zap jumps on to 1 more enemy nearby for 50% damage.', { mageChain: 1, mageChainPct: 0.5 }),
    t('Quickened Staff', 'He zaps 25% faster.', { mageFasterPct: 25 }),
    t('Arcane Overload', 'Every 4th zap deals triple damage.', { mageOverchargeEvery: 4, mageOverchargeMult: 3 })
  ] },
  b: { name: 'Sanctuary', tiers: [
    t('Soothing Light', 'Sanctuary Aura heals 30% more.', { mageHealPct: 30 }),
    t('Wider Sanctuary', 'His range (zap, aura and Arcane Aegis) grows 1 tile.', { auraRadiusAdd: 1 }),
    t('Warding Light', "While he's awake, buildings in his aura take 15% less damage.", { mageWard: 0.15 }),
    t('Restoration', 'Sanctuary Aura heals 80% more in all.', { mageHealPct: 50 }), // (Pct keys add up: 30 + 50)
    t('Twin Aegis', 'Arcane Aegis can be cast twice per wave.', { aegisCharges: 2 })
  ] },
  c: { name: 'Eternity', tiers: [
    t('Stone Skin', 'The Locklair Mage has 30% more health.', { hpPct: 30 }),
    t('Lasting Aegis', 'Arcane Aegis lasts 2 s longer.', { aegisSecondsAdd: 2 }),
    t('Deep Meditation', 'He sleeps 40% shorter after a raid.', { mageSleepFasterPct: 40 }),
    t('Aegis Surge', 'Arcane Aegis also heals every building it covers 25% of its health.', { aegisHealPct: 0.25 }),
    t('Undying', 'Knocked out in a raid, he rises again after 20 s with 40% health (once per raid).', { mageReviveSeconds: 20, mageReviveHpPct: 0.4 })
  ] }
});
