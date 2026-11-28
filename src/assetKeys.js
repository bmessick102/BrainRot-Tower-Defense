// Texture and sound key constants. A file in public/assets/ named <key>.webp / <key>.mp3 replaces
// the placeholder with the same key (art-source/<category>/<key>.png -> `npm run prepare-art`, which also refreshes
// src/assetManifest.js; sounds: art-source/audio/ -> `npm run prepare-audio`).

export const TEX = {
  map: 'map_background',
  mapNight: 'map_background_night',
  mapDusk: 'map_background_dusk', // the warm sky between day and night
  mapDawn: 'map_background_dawn', // the same going back, between night and day
  light: 'fx_light',
  fog: 'fx_fog', // soft cloud puff for the spawn fog (src/objects/SpawnFog.js)
  villager: 'villager_gnome',
  villagerWork: 'villager_gnome_work', // a gnome busy at a building (mining, repairing, building); faces left
  coin: 'ui_coin',
  spawnMarker: 'ui_spawn_marker',
  markEye: 'fx_mark_eye', // over enemies marked by a F.L.O.C.K Tower
  guide: 'guide_portrait',
  shopButton: 'ui_shop_button',
  settingsButton: 'ui_settings_button',
  editButton: 'ui_edit_layout_button',
  startButton: 'ui_start_button',
  titleBackground: 'title_bg', // the painted landscape with no characters (art-source/title); the animated title is TitleBackdropScene
  achievementIcon: 'ui_achievement',
  researchPoint: 'ui_shake', // the Shake (research points are shown as Shakes since v0.14; the Burger, ui_research_point, before); UIScene draws a simple cup without the art
  researchReady: 'ui_research_ready', // the book bobbing over the RV Lab when research is ready (falls back to the RP token)
  beatReady: 'ui_beat_ready',        // over DJ Babyface when Drop the Beat is ready (falls back to a "DROP!" label)
  feastReady: 'ui_feast_ready',      // Brisket Feast's hotbar icon, and over him while it's ready (a gold crown)
  heroCrown: 'ui_hero_crown',        // the crown behind the hero's level number beside his health bar
  armorShield: 'ui_armor_shield',    // beside an armored enemy's health bar while its armor holds (falls back to a drawn kite)
  showcaseTile: 'ui_showcase_tile'   // v0.15: the grass block under the picture in the upgrade / merge windows (PurchasePreview draws one without it)
};

/**
 * v0.15: the icon beside a stat bar in the upgrade / merge windows (art-source/ui/ui_stat_<kind>.png), by kind:
 * hp, heal, damage, beam, pool, mark, range, time, speed, slow, research, spells, gnomes, gold_capacity, shake_capacity,
 * star. PurchasePreview draws a stand-in for a missing one.
 */
export const statIconKey = (kind) => `ui_stat_${kind}`;

/** Base (single-model) building texture. */
export const buildingKey = (type) => `bld_${type}`;
/** Optional per-level art, e.g. bld_mine_lv3. */
export const buildingLevelKey = (type, level) => `bld_${type}_lv${level}`;
export const buildingDestroyedKey = (type) => `bld_${type}_destroyed`;
export const enemyKey = (kind) => `enemy_${kind}`;
/** A Fuel Station spell's icon art (art-source/spells/ui_spell_<kind>.png), e.g. ui_spell_rage (Karuba Coffee). */
export const spellArtKey = (kind) => `ui_spell_${kind}`;

/** Projectile kind (from logic) -> texture key. */
export const PROJECTILE_KEYS = {
  cannon: 'proj_cannon',
  archer: 'proj_arrow',
  mortar: 'proj_mortar',
  wizard: 'proj_wizard',
  firework: 'proj_firework',
  catapult: 'proj_catapult',
  spear: 'proj_spear',
  slinger: 'proj_slinger',
  bomb: 'proj_bomb',
  ksi: 'proj_ksi',          // the KSI Tower's bottle
  ksiBounce: 'proj_ksi',    // ...bouncing on (KSI Avalanche)
  vaca: 'proj_vaca',        // La Vaca Saturno's boulder
  missile: 'proj_bomb',     // Big Yahu's missile: the Bomber's bomb, falling from the sky
  // RV Lab ability shots reuse existing pictures: Grapeshot pellets and Boulders are cannonballs,
  // Cluster Shell bomblets are small mortar shells.
  pellet: 'proj_cannon',
  boulder: 'proj_cannon',
  bomblet: 'proj_mortar'
};

/** Files whose name differs from the texture key they provide. */
export const FILE_KEY_ALIASES = {
  game_map_grid: TEX.map, game_map_grid_night: TEX.mapNight, game_map_grid_dusk: TEX.mapDusk, game_map_grid_dawn: TEX.mapDawn
};
// Files the game doesn't use live in unused-assets/ (outside public/, so they never ship), e.g. the old flat
// title picture ui_title_background, the layout reference for TitleBackdropScene.

export const SFX = {
  uiClick: 'sfx_ui_click',
  place: 'sfx_place',
  spellBrewed: 'sfx_spell_brewed',       // a spell brewed at the Fuel Station (v0.9.4)
  buildingPlaced: 'sfx_building_placed', // a building (not a wall) set down: bought, moved, or placed in edit mode (v0.9.3)
  upgrade: 'sfx_upgrade',
  beatDrop: 'sfx_beat_drop',             // DJ Babyface drops the beat
  abilityUnlocked: 'sfx_ability_unlocked', // a building gets a new ability tier (RV Lab research, or a level-up)
  merge: 'sfx_merge',                    // two defenses merge into one (replaces the upgrade + unlock sounds)
  sell: 'sfx_sell',
  coinCollect: 'sfx_coin_collect',
  shakeCollect: 'sfx_shake_collect', // collecting a Shake Collector (v0.14; the coin sound stands in if missing)
  guideMessage: 'sfx_guide_message',
  cannonFire: 'sfx_cannon_fire',
  arrowFire: 'sfx_arrow_fire',
  mortarFire: 'sfx_mortar_fire',
  mortarTravel: 'sfx_mortar_travel', // the shell whistling through the air (timed to end as it lands)
  mortarImpact: 'sfx_mortar_impact',
  wizardFire: 'sfx_wizard_fire',
  wizardImpact: 'sfx_wizard_impact',
  fireworkFire: 'sfx_firework_fire',
  spearFire: ['sfx_spear_fire1', 'sfx_spear_fire2'], // the Spear Thrower's throw: one at random per shot
  spearHit: 'sfx_spear_hit',                          // a spear hits an enemy (in place of the generic hit sound)
  catapultFire: 'sfx_catapult_fire',     // the Catapult's throw
  catapultImpact: 'sfx_catapult_impact', // its shot lands
  catapultPool: 'sfx_catapult_pool',     // the pink pool sizzling while it lasts (fades out with the pool)
  fireworkImpact: 'sfx_firework_impact', // the lingering crackle after a rocket bursts (6 s; capped at 3 at once)
  // Gandolf's spoken lines when he throws a fireball (one picked at random; add _3, _4 ... to this list).
  wizardVoice: ['sfx_wizard_voice_1', 'sfx_wizard_voice_2'],
  bombExplode: 'sfx_bomber_bomb_impact', // a Bomber's bomb lands (7.6 s tail; capped at a few at once)
  bomberFlying: 'sfx_bomber_flying',     // plane drone while any Bomber is in the air (one shared loop; see AirHum)
  enemyHitSmall: 'sfx_building_select',  // a Grunt, Sneaker Shark or Mr. Least strikes a building or wall (the same sound as
                                         // clicking a building: its own copy, sfx_enemy_small_hit, was byte-for-byte that file; v0.9.1)
  enemyHitBig: 'sfx_enemy_big_hit',      // a Tank strikes a building or wall
  sharkJump: 'sfx_shark_jump',           // a Sneaker Shark leaps onto a wall
  enemyEliminated: 'sfx_enemy_eliminated', // any enemy dies (capped at a few at once)
  breakerDeployed: 'sfx_breaker_deployed', // the first Wall Breaker of a wave appears (once per wave)
  breakerBlast: 'sfx_breaker_blast',       // a Wall Breaker blows itself up
  flockSpotted: 'sfx_flock_spotted',
  repair: 'sfx_repair',
  mousetrapSnap: 'sfx_mousetrap_snap',
  neegyHit: 'sfx_neegy_hit',               // a Neegy's punch
  sharkVoice: 'sfx_shark_voice',           // "Tralalero tralala" (now and then while one is in the wave)
  gruntVoice: 'sfx_grunt_voice',           // "Tung tung tung sahur" (now and then while one is in the wave)
  bicusVoice: 'sfx_bicus_voice',           // "Bri bri bicus dicus" (now and then while one is in the wave)
  frigoVoice: 'sfx_frigo_voice',           // "Frigo camelo" (now and then while one is in the wave)
  patapimVoice: 'sfx_patapim_voice',       // "Brr brr patapim" (now and then while one is in the wave)
  liriliVoice: 'sfx_lirili_voice',         // "Lirili larila" (cropped to 3 s; now and then while one is in the wave)
  babycarVoice: 'sfx_babycar_voice',       // Da Baby Car's line (now and then while one is in the wave)
  raBeam: 'sfx_spell_heat',                // looping while a Tower of Rah beam burns: the burning sound of the Heat spell (v0.12.4)
  raHeatUp: 'sfx_ra_heat_up',              // a Tower of Rah beam heats up to its next stage
  buildingSelect: 'sfx_building_select', // clicking a building
  heroSelect: 'sfx_hero_select',         // clicking the Brisket King himself (his voice; never talks over itself)
  altarSelect: 'sfx_altar_select',       // clicking the Brisket King's altar
  heroFeast: 'sfx_hero_feast',           // Brisket Feast goes off
  heroSnore: 'sfx_hero_snore',           // looping softly while the Brisket King is asleep (HeroView's SnoreLoop)
  queenSelect: 'sfx_queen_select',       // clicking the Hatsune Queen or her altar (her voice; never talks over itself)
  mageAttack: 'sfx_mage_attack',         // the Locklair Mage's staff zap (v0.12; one at a time)
  heroKnockedOut: 'sfx_hero_knocked_out', // the King, the Queen or the Mage is knocked out (v0.12.4)
  heroReady: 'sfx_hero_ready',            // a hero is ready again or gets back up (Second Wind, Curtain Call, waking up)
  arrowHit: 'sfx_arrow_hit',              // a Locklair arrow or one of the Queen's bolts hits
  buildingDamaged: 'sfx_building_damaged', // an enemy hurts a building (quiet and capped)
  enemyFrozen: 'sfx_enemy_frozen',        // an enemy freezes solid (KSI Fully Frozen)
  toiletSurface: 'sfx_toilet_surface',    // a Skibidi Toilet pops up out of the ground
  toiletDig: 'sfx_toilet_dig',            // ...and digs back down
  balloonDied: 'sfx_balloon_died',        // a Neegy Balloon is shot down or pops
  invalid: 'sfx_invalid',               // placing/dropping a building on an invalid spot
  hit: 'sfx_hit',
  buildingDestroyed: 'sfx_building_destroyed',
  waveStart: 'sfx_wave_start',
  waveCountdown: 'sfx_wave_countdown', // Start Wave pressed: the countdown begins
  waveClear: 'sfx_wave_clear',
  achievement: 'sfx_achievement',   // an achievement unlocks (optional: the wave-clear fanfare plays without it)
  achievementClaim: 'sfx_achievement_claim', // the Claim button on an achievement's reward (Achievements window)
  gameOver: 'sfx_game_over',
  // v0.6
  ksiImpact: 'sfx_ksi_impact',            // a KSI Tower bottle bursts
  vacaImpact: 'sfx_vaca_impact',          // La Vaca Saturno's boulder lands or bounces
  porkCall: 'sfx_pork_call',              // John Pork's call (never over itself)
  skeletonRage: 'sfx_skeleton_rage',      // Rahhh Skeleton's shield bash (as he summons Skeletons)
  skeletonAttack: 'sfx_skeleton_attack',  // ...and his sword swing
  patapimQuake: 'sfx_patapim_quake',      // the earthquake (Lirili Larila since v0.7; Brr Brr Patapim before): a clip per quake
  bicusArmorBreak: 'sfx_bicus_armor_break', // Bri Bri Bicus Dicus's armor breaking (v0.7)
  quandaleDash: 'sfx_quandale_dash',        // Quandale Dingle starts a dash (v0.8)
  quandaleVoice: 'sfx_quandale_voice'       // ...and his random line
};

/** Each Fuel Station spell's cast sound (SpellFx.onCast). */
export const SPELL_SFX = {
  rage: 'sfx_spell_rage',
  heal: 'sfx_spell_heal',
  freeze: 'sfx_spell_freeze',
  heat: 'sfx_spell_heat',
  invisibility: 'sfx_spell_invisibility',
  lightning: 'sfx_spell_lightning'
};

export const MUSIC = {
  title: 'music_title',
  startupJingle: 'music_startup_jingle', // v0.15: index.html plays it as the page loads (audio.js whenJingleDone)
  village: 'music_village', // fallback between waves when the ambience files are missing
  ambientDay: 'ambient_day',     // between waves by day: looping ambience (crossfades with the night one)
  ambientNight: 'ambient_night', // between waves by night
  planning: 'music_planning', // the wave countdown: plays once, ending as the wave hits
  attack: 'music_attack'    // at night while enemies attack (add public/assets/audio/music_attack.mp3)
};

/** Which sound a melee enemy makes when it strikes. Slingers (stones) and Bombers (bombs) have their own. */
export const ENEMY_ATTACK_SFX = {
  grunt: SFX.enemyHitSmall,
  shark: SFX.enemyHitSmall,
  thief: SFX.enemyHitSmall,
  toilet: SFX.enemyHitSmall,
  tank: SFX.enemyHitBig,
  neegy: SFX.neegyHit,
  pork: SFX.enemyHitSmall,
  skeleton: SFX.skeletonAttack,
  bones: SFX.enemyHitSmall,
  bicus: SFX.skeletonAttack, // (a sword, like Rahhh Skeleton's)
  frigo: SFX.enemyHitBig,
  lirili: SFX.enemyHitBig,
  patapim: SFX.enemyHitBig,
  quandale: SFX.enemyHitSmall, // v0.8
  grimace: SFX.enemyHitBig
};

/** Enemies that say their line now and then while they're on the map (see GameScene.enemyChatter). */
export const ENEMY_VOICE = {
  shark: SFX.sharkVoice,
  grunt: SFX.gruntVoice,
  bicus: SFX.bicusVoice,
  frigo: SFX.frigoVoice,
  patapim: SFX.patapimVoice,
  lirili: SFX.liriliVoice,
  babycar: SFX.babycarVoice,
  quandale: SFX.quandaleVoice
};

/** Which sound a tower plays when it fires. */
export const FIRE_SFX = {
  cannon: SFX.cannonFire,
  archer: SFX.arrowFire,
  mortar: SFX.mortarFire,
  wizard: SFX.wizardFire,
  firework: SFX.fireworkFire,
  catapult: SFX.catapultFire
};
