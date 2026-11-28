// What the upgrade window (src/objects/UpgradeWindow.js) shows about buying a building's next level: its price, and
// every reason it can't be bought right now, as whole sentences for the window's red "Note!" band. No Phaser here.
import { checkUpgrade, hallUnlocks, limitFor, townHallLevel, upgradeHallRequirement, wallLevel } from './buildings.js';
import { researchPoints } from './researchPoints.js';
import { isWaveActive } from './util.js';
import { tutorialAllows } from './tutorial.js';
import { CONFIG } from '../config.js';

/** "10,790 more Bitcoin" / "1 more Shake". */
export function shortText(amount, currency) {
  const n = Math.ceil(amount);
  return `${n.toLocaleString('en-US')} more ${currency === 'rp' ? (n === 1 ? 'Shake' : 'Shakes') : 'Bitcoin'}`;
}

/**
 * The next level of `building` (walls: the village's wall level, all walls together):
 * { ok, cost, currency, level, nextLevel, short, notes, count, each }. `notes` lists everything in the way ("You need to
 * upgrade your Village Hall to level 6!"), empty when it can be bought; `short` is true when the price can't be paid.
 * cost is null at the top level.
 */
export function previewUpgrade(state, building) {
  const check = checkUpgrade(state, building);
  if (check.cost === null) return { ...check, notes: [], short: false };
  const level = building.type === 'wall' ? wallLevel(state) : building.level;
  const nextLevel = level + 1;
  const hall = upgradeHallRequirement(building.type, nextLevel);
  const balance = check.currency === 'rp' ? researchPoints(state) : state.gold;
  const short = balance < check.cost;
  const notes = [];
  if (state.gameOver) notes.push('Finish the current raid first.');
  else if (isWaveActive(state)) notes.push('Upgrades are only available between raids.');
  if (hall && townHallLevel(state) < hall) notes.push(`You need to upgrade your Village Hall to level ${hall}!`);
  if (building.destroyed && building.type !== 'wall') notes.push('Rebuild this building first.');
  if (!tutorialAllows(state, 'upgrade', building.type)) notes.push('Follow the guide first.');
  if (short) notes.push(`You need ${shortText(check.cost - balance, check.currency)}!`);
  if (!check.ok && !notes.length) notes.push(`${check.reason}.`);
  return { ...check, level, nextLevel, short, notes, ok: check.ok && !notes.length };
}

/**
 * What Village Hall `level` adds over the one before: [{ type, add, isNew }] for every building type whose cap goes up,
 * plus the Fuel Station's spell slots as { type: 'fuelStation', name: 'Spell slots', add } when they grow.
 */
export function hallUpgradeUnlocks(level) {
  const list = hallUnlocks(level, level - 1).map((item) => ({ ...item, isNew: limitFor(item.type, level - 1) === 0 }));
  const slots = CONFIG.fuelStation.spellSlots;
  const addedSlots = (slots[level - 1] || 0) - (slots[level - 2] || 0);
  if (addedSlots > 0 && level > 1) list.push({ type: 'fuelStation', name: 'Spell slots', add: addedSlots, isNew: false, slots: true });
  return list;
}
