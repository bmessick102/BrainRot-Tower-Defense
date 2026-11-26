import { CONFIG } from '../config.js';

const PROGRESSION = {
  altar: { label: 'Feast healing', unit: '%', base: CONFIG.altar.hero.feast.healPct, step: CONFIG.altar.hero.feast.healPctPerMilestone },
  queenAltar: { label: 'Encore Cloak duration', unit: ' s', base: CONFIG.queenAltar.hero.encore.seconds, step: CONFIG.queenAltar.hero.encore.secondsPerMilestone },
  mageAltar: { label: 'Arcane Aegis duration', unit: ' s', base: CONFIG.mageAltar.hero.aegis.seconds, step: CONFIG.mageAltar.hero.aegis.secondsPerMilestone }
};

export function heroAbilityLevelValue(type, level) {
  const { base, step } = PROGRESSION[type];
  return base + Math.floor(level / CONFIG.heroAbilityLevelInterval) * step;
}

export function abilityLevelProgress(type, level, perkBonus = 0) {
  const { label, unit } = PROGRESSION[type];
  const interval = CONFIG.heroAbilityLevelInterval;
  const top = CONFIG[type].levels.length;
  const nextLevel = (Math.floor(level / interval) + 1) * interval;
  return {
    label, unit,
    value: heroAbilityLevelValue(type, level) + perkBonus,
    max: heroAbilityLevelValue(type, top) + perkBonus,
    next: nextLevel <= top ? heroAbilityLevelValue(type, nextLevel) + perkBonus : null,
    nextLevel: nextLevel <= top ? nextLevel : null
  };
}
