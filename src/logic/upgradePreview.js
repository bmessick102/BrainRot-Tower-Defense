import { BUILDING_TYPES, checkUpgrade, hallUnlocks, maxLevel, limitFor, townHallLevel, upgradeHallRequirement, unlockTownHall, wallLevel } from './buildings.js';
import { researchPoints } from './researchPoints.js';
import { isWaveActive } from './util.js';
import { tutorialAllows } from './tutorial.js';

export function previewUpgrade(state, building) {
  const check = checkUpgrade(state, building);
  if (check.cost === null) return { ...check, requirements: [] };
  const level = building.type === 'wall' ? wallLevel(state) : building.level;
  const nextLevel = level + 1;
  const hall = upgradeHallRequirement(building.type, nextLevel);
  const balance = check.currency === 'rp' ? researchPoints(state) : state.gold;
  const requirements = [];
  if (hall && townHallLevel(state) < hall) requirements.push(`Village Hall ${hall} required`);
  if (balance < check.cost) requirements.push(`Need ${(check.cost - balance).toLocaleString('en-US')} more ${check.currency === 'rp' ? 'Shakes' : 'gold'}`);
  if (isWaveActive(state)) requirements.push('Available between raids');
  if (building.destroyed && building.type !== 'wall') requirements.push('Rebuild this building first');
  if (!tutorialAllows(state, 'upgrade', building.type)) requirements.push('Follow the guide');
  if (state.gameOver) requirements.push('Finish the current raid');
  if (!check.ok && !requirements.length) requirements.push(check.reason);
  return { ...check, level, nextLevel, requirements, ok: check.ok && !requirements.length };
}

export function hallUpgradeUnlocks(level) {
  const quantities = hallUnlocks(level, level - 1).map((item) => ({
    ...item, isNew: limitFor(item.type, level - 1) === 0
  }));
  const levels = [];
  for (const type of BUILDING_TYPES) {
    if (type === 'townHall' || unlockTownHall(type) > level) continue;
    const available = [];
    for (let next = 2; next <= maxLevel(type); next++) {
      if (Math.max(unlockTownHall(type), upgradeHallRequirement(type, next)) === level) available.push(next);
    }
    if (available.length) levels.push({ type, first: available[0], last: available.at(-1) });
  }
  return { quantities, levels };
}
