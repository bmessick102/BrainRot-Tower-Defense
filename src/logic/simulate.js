// One simulation step. GameScene calls this every frame with dt in seconds (capped).
import { stepHero } from './hero.js';
import { stepDj } from './dj.js';
import { stepSpells } from './spells.js';
import { stepEconomyPerks } from './econPerks.js';
import { DEFENSE_TYPES } from './buildings.js';
import { produceMines, produceHallIncome } from './economy.js';
import { stepClock } from './dayNight.js';
import { stepWaveSpawning, checkWaveCleared } from './waves.js';
import { stepEnemies, removeDeadEnemies } from './enemies.js';
import { stepDefenses, stepProjectiles, stepPools } from './combat.js';
import { stepFlockTowers } from './flock.js';
import { stepSpecialEnemies } from './specialEnemies.js';
import { stepTraps } from './traps.js';
import { stepBeams } from './beams.js';
import { stepSpecials, stepStrikes, stepEnemyStatus, stepAbilityBuildings } from './abilityEffects.js';
import { assignGnomes, stepGnomeRepairs, stepGnomeMining } from './villagers.js';

export const MAX_STEP = 0.1; // seconds; long frames are capped so nothing tunnels

/**
 * Order: day/night clock, gnome jobs, mine production, gnome mining + gold trips, wave spawning, enemies, towers,
 * F.L.O.C.K marks, projectiles/damage, pools, gnome repairs, cleanup, wave clear.
 */
export function simulate(state, dt) {
  if (state.gameOver) return;
  // (A NaN step, e.g. a broken frame time, would turn every position and timer into NaN for good: skip it.)
  dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MAX_STEP) : dt > 0 ? MAX_STEP : 0;
  stepClock(state, dt);
  // Gnome jobs for this step (also read by the gnome sprites; not saved).
  const gnomes = assignGnomes(state);
  state._gnomes = gnomes;
  produceMines(state, dt);
  produceHallIncome(state, dt); // the Village Hall's own trickle of gold (safety net)
  stepGnomeMining(state, dt, gnomes);
  stepWaveSpawning(state, dt);
  stepEnemies(state, dt);
  if (!state.gameOver) stepHero(state, dt); // the Brisket King guards his altar (hero.js)
  if (!state.gameOver) stepTraps(state, dt); // ground enemies stepping onto set Mousetraps spring them (+ re-arm, lures)
  stepSpecialEnemies(state, dt); // F.L.O.C.K Towers silenced by John Pork's call count down
  stepFlockTowers(state); // mark + reveal enemies in F.L.O.C.K Tower range before the defenses fire
  stepDj(state, dt, DEFENSE_TYPES); // DJ Babyface: boosts run down, light show, its perks (Auto-DJ, VIP Lounge...)
  if (!state.gameOver) stepSpells(state, dt); // Fuel Station spells in play: Rage, Heal, Freeze, Invisibility, Heat Field
  stepEconomyPerks(state, dt); // economy perks on a timer: mine Auto-Collect, house Garden and Militia
  if (!state.gameOver) stepDefenses(state, dt);
  if (!state.gameOver) stepSpecials(state, dt); // RV Lab specials on a timer (Arrow Storm, Meteor, Finale)
  if (!state.gameOver) stepBeams(state, dt); // Tower of Rah beams
  if (!state.gameOver) stepProjectiles(state, dt);
  if (!state.gameOver) stepPools(state, dt);
  if (!state.gameOver) stepStrikes(state, dt); // Arrow Storms / Meteors landing
  if (!state.gameOver) stepEnemyStatus(state, dt); // burning / poisoned enemies, vulnerability timers
  if (!state.gameOver) stepAbilityBuildings(state, dt); // Self-Repair, Last Stand timers
  if (!state.gameOver) stepGnomeRepairs(state, dt, gnomes);
  removeDeadEnemies(state);
  checkWaveCleared(state);
}
