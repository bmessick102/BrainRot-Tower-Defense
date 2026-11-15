// Economy perks that run on a timer (RV Lab trees of the economy buildings, src/abilityConfig.js):
//   - Bitcoin Mine Auto-Collect / Smart Contract: the mine sends its gold to storage by itself.
//   - Villager House Vegetable Garden: a trickle of gold.
//   - Villager House Gnome Militia / Night Watch: its gnomes pelt nearby enemies with pebbles.
// The rest of the economy perks change numbers where they're used (economy.js, villagers.js, combat.js, waves.js).
import { abilityFx } from './abilities.js';
import { footprintCenter } from './grid.js';
import { distance } from './iso.js';
import { isWaveActive, emit } from './util.js';
import { isDark } from './clockLight.js';
import { sendMineToStorage, addGold } from './economy.js';
import { damageEnemy } from './combat.js';

export function stepEconomyPerks(state, dt) {
  const wave = isWaveActive(state);
  const dark = isDark(state.clock);
  let income = 0;
  for (const b of state.buildings) {
    if (b.destroyed) continue;
    if (b.type !== 'mine' && b.type !== 'house') continue;
    const fx = abilityFx(b);
    if (b.type === 'mine' && fx.autoCollectPerMin > 0 && (!wave || fx.autoInWaves)) {
      b.autoT = (b.autoT || 0) + dt;
      if (b.autoT >= 60 / fx.autoCollectPerMin) {
        b.autoT = 0;
        const r = sendMineToStorage(state, b);
        if (r.collected > 0) emit(state, 'mineAutoCollected', { id: b.id, amount: r.collected });
      }
    }
    if (b.type !== 'house') continue;
    if (fx.houseIncome) income += fx.houseIncome * dt;
    if (fx.militiaDps && wave) {
      const c = footprintCenter(b);
      const dps = fx.militiaDps * (dark && fx.militiaNightMult ? fx.militiaNightMult : 1);
      for (const e of state.enemies) {
        if (!e.alive || distance(c.x, c.y, e.x, e.y) > fx.militiaRadius) continue;
        damageEnemy(state, e, dps * dt, 'militia');
      }
    }
  }
  if (income > 0) {
    state._gardenGold = (state._gardenGold || 0) + income;
    const whole = Math.floor(state._gardenGold);
    if (whole >= 1) {
      state._gardenGold -= whole;
      addGold(state, whole);
    }
  }
}
