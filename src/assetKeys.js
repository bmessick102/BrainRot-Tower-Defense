// Texture and sound key constants. A file in public/assets/ named <key>.png / <key>.mp3 replaces
// the placeholder with the same key (run `npm run prepare-art` to refresh src/assetManifest.js).

export const TEX = {
  map: 'map_background',
  mapNight: 'map_background_night',
  light: 'fx_light',
  fog: 'fx_fog', // soft cloud puff for the screen-corner fog
  villager: 'villager_gnome',
  coin: 'ui_coin',
  spawnMarker: 'ui_spawn_marker',
  markEye: 'fx_mark_eye', // over enemies marked by a F.L.O.C.K Tower
  guide: 'guide_portrait',
  shopButton: 'ui_shop_button',
  settingsButton: 'ui_settings_button',
  editButton: 'ui_edit_layout_button',
  startButton: 'ui_start_button',
  titleBackground: 'ui_title_background'
};

/** Base (single-model) building texture. */
export const buildingKey = (type) => `bld_${type}`;
/** Optional per-level art, e.g. bld_mine_lv3. */
export const buildingLevelKey = (type, level) => `bld_${type}_lv${level}`;
export const buildingDestroyedKey = (type) => `bld_${type}_destroyed`;
export const enemyKey = (kind) => `enemy_${kind}`;

/** Projectile kind (from logic) -> texture key. */
export const PROJECTILE_KEYS = {
  cannon: 'proj_cannon',
  archer: 'proj_arrow',
  mortar: 'proj_mortar',
  wizard: 'proj_wizard',
  firework: 'proj_firework',
  catapult: 'proj_catapult',
  slinger: 'proj_slinger',
  bomb: 'proj_bomb'
};

/** Files whose name differs from the texture key they provide. */
export const FILE_KEY_ALIASES = { game_map_grid: TEX.map, game_map_grid_night: TEX.mapNight };
/** Files present in public/assets but not loaded (kept for the team). */
export const UNLOADED_FILES = ['game_map'];

export const SFX = {
  uiClick: 'sfx_ui_click',
  place: 'sfx_place',
  upgrade: 'sfx_upgrade',
  sell: 'sfx_sell',
  coinCollect: 'sfx_coin_collect',
  cannonFire: 'sfx_cannon_fire',
  arrowFire: 'sfx_arrow_fire',
  mortarFire: 'sfx_mortar_fire',
  mortarTravel: 'sfx_mortar_travel', // the shell whistling through the air (timed to end as it lands)
  mortarImpact: 'sfx_mortar_impact',
  wizardFire: 'sfx_wizard_fire',
  wizardImpact: 'sfx_wizard_impact',
  fireworkFire: 'sfx_firework_fire',
  catapultFire: 'sfx_catapult_fire',     // the Catapult's throw
  catapultImpact: 'sfx_catapult_impact', // its shot lands
  catapultPool: 'sfx_catapult_pool',     // the pink pool sizzling while it lasts (fades out with the pool)
  fireworkImpact: 'sfx_firework_impact', // the lingering crackle after a rocket bursts (6 s; capped at 3 at once)
  // Gandolf's spoken lines when he throws a fireball (one picked at random; add _3, _4 ... to this list).
  wizardVoice: ['sfx_wizard_voice_1', 'sfx_wizard_voice_2'],
  bombExplode: 'sfx_bomber_bomb_impact', // a Bomber's bomb lands (7.6 s tail; capped at a few at once)
  bomberFlying: 'sfx_bomber_flying',     // plane drone while any Bomber is in the air (one shared loop; see AirHum)
  enemyHitSmall: 'sfx_enemy_small_hit',  // a Grunt, Sneaker Shark or Money Stealer strikes a building or wall
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
  raBeam: 'sfx_ra_beam',                   // looping while a Tower of Rah beam burns
  raHeatUp: 'sfx_ra_heat_up',              // a Tower of Rah beam heats up to its next stage      // a Mousetrap springs                    // the player pays to rebuild a destroyed building       // an enemy enters an empty F.L.O.C.K Tower range
  buildingSelect: 'sfx_building_select', // clicking a building
  invalid: 'sfx_invalid',               // placing/dropping a building on an invalid spot
  hit: 'sfx_hit',
  buildingDestroyed: 'sfx_building_destroyed',
  waveCountdown: 'sfx_wave_countdown',
  waveStart: 'sfx_wave_start',
  waveClear: 'sfx_wave_clear',
  achievement: 'sfx_achievement',   // an achievement unlocks (optional: the wave-clear fanfare plays without it)
  gameOver: 'sfx_game_over'
};

export const MUSIC = {
  title: 'music_title',
  village: 'music_village', // daytime
  planning: 'music_planning', // the wave countdown at dusk: plays once, ending as the wave hits
  attack: 'music_attack'    // at night while enemies attack (add public/assets/audio/music_attack.mp3)
};

/** Which sound a melee enemy makes when it strikes. Slingers (stones) and Bombers (bombs) have their own. */
export const ENEMY_ATTACK_SFX = {
  grunt: SFX.enemyHitSmall,
  shark: SFX.enemyHitSmall,
  thief: SFX.enemyHitSmall,
  tank: SFX.enemyHitBig,
  neegy: SFX.neegyHit
};

/** Enemies that say their line now and then while they're on the map (see GameScene.enemyChatter). */
export const ENEMY_VOICE = {
  shark: SFX.sharkVoice,
  grunt: SFX.gruntVoice
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
