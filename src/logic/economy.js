// Gold, capacity, mine production and collection, selling, repair, and storage drain.
import { CONFIG } from '../config.js';
import { levelStats, buildCost, totalSpent, maxHp } from './buildings.js';
import { emit, isWaveActive } from './util.js';

/** Town hall built-in capacity + every storage the player owns (destroyed or not). */
export function getCapacity(state) {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.type === 'townHall' || b.type === 'storage') cap += levelStats(b.type, b.level).capacity;
  }
  return cap;
}

/** Set gold, clamped to [0, capacity], and announce it. */
export function setGold(state, value) {
  const clamped = Math.max(0, Math.min(getCapacity(state), Math.round(value)));
  if (clamped !== state.gold) {
    state.gold = clamped;
    emit(state, 'goldChanged', { gold: state.gold, capacity: getCapacity(state) });
  }
  return state.gold;
}

/** Add gold up to capacity. Returns how much was actually added. */
export function addGold(state, amount) {
  const before = state.gold;
  setGold(state, state.gold + amount);
  return state.gold - before;
}

/** Spend gold if there is enough. Returns true on success. */
export function spendGold(state, amount) {
  if (state.gold < amount) return false;
  setGold(state, state.gold - amount);
  return true;
}

/** Gold per second the Village Hall makes at this level (0 for the level 0 ruin). */
export function hallIncomeRate(level) {
  if (!level || level < 1) return 0;
  const H = CONFIG.rules.hallIncome;
  return H.base + H.perLevel * (level - 1);
}

/**
 * The Village Hall's own income, straight into gold (day and night), in batches of hallIncome.batch so it
 * shows as a small "+5" now and then ('hallIncome'). Gold over capacity is lost, as with any income.
 */
export function produceHallIncome(state, dt) {
  const th = state.buildings.find((b) => b.type === 'townHall');
  if (!th || th.destroyed) return;
  const rate = hallIncomeRate(th.level);
  if (rate <= 0) return;
  const batch = CONFIG.rules.hallIncome.batch;
  state.hallIncomeCarry = (state.hallIncomeCarry || 0) + rate * dt;
  while (state.hallIncomeCarry >= batch) {
    state.hallIncomeCarry -= batch;
    const added = addGold(state, batch);
    emit(state, 'hallIncome', { id: th.id, amount: batch, added });
  }
}

/**
 * Dawn safety net: if no Bitcoin Mine is standing and you can't afford to rebuild even the cheapest
 * destroyed one, the gnomes rebuild that one for free. Returns the salvaged mine, or null.
 */
export function salvageMine(state) {
  const mines = state.buildings.filter((b) => b.type === 'mine');
  if (!mines.length || mines.some((b) => !b.destroyed)) return null;
  const cheapest = mines.reduce((a, b) => (repairCost(b) < repairCost(a) ? b : a));
  if (state.gold >= repairCost(cheapest)) return null;
  cheapest.destroyed = false;
  cheapest.hp = maxHp(cheapest);
  emit(state, 'buildingRepaired', { id: cheapest.id });
  emit(state, 'mineSalvaged', { id: cheapest.id });
  return cheapest;
}

/**
 * Mines fill their own stock (for the player to click) up to their cap. Destroyed mines don't produce.
 * Gnomes working a mine mine their own extra gold on top (see stepGnomeMining in villagers.js).
 */
export function produceMines(state, dt) {
  for (const b of state.buildings) {
    if (b.type !== 'mine' || b.destroyed) continue;
    const { production, stockCap } = levelStats('mine', b.level);
    const rate = production;
    const before = Math.floor(b.stock || 0);
    b.stock = Math.min(stockCap, (b.stock || 0) + rate * dt);
    if (Math.floor(b.stock) !== before) emit(state, 'mineStockChanged', { id: b.id, stock: b.stock });
  }
}

/** Mine stock as a fraction of its cap (0..1). */
export function mineFill(b) {
  return (b.stock || 0) / levelStats('mine', b.level).stockCap;
}

export function mineShowsCoin(b) {
  return !b.destroyed && mineFill(b) >= CONFIG.rules.mineCoinIconThreshold;
}

/**
 * Collect from a mine: moves min(stock, capacity - gold) into gold; the rest stays in the mine.
 * Mines can't be collected while a wave is attacking (they keep filling, ready for dawn).
 * Returns { collected, storageFull, waveActive }.
 */
export function collectMine(state, mine) {
  if (isWaveActive(state)) return { collected: 0, storageFull: false, waveActive: true };
  const whole = Math.floor(mine.stock || 0);
  if (whole <= 0) return { collected: 0, storageFull: false };
  const room = getCapacity(state) - state.gold;
  if (room <= 0) {
    emit(state, 'storageFull', { id: mine.id });
    return { collected: 0, storageFull: true };
  }
  const amount = Math.min(whole, room);
  mine.stock -= amount;
  addGold(state, amount);
  emit(state, 'mineCollected', { id: mine.id, amount });
  return { collected: amount, storageFull: false };
}

/** Refund for selling: a share of everything spent (build + upgrades), rounded. */
export function sellRefund(b) {
  // Gold only: ability tiers (bought with RP) and research are never refunded.
  return Math.round(totalSpent(b.type, b.level) * CONFIG.rules.sellRefund);
}

/** Rebuild price for a destroyed building: rules.rebuildCostShare of its current level's cost. */
export function repairCost(b) {
  const stats = levelStats(b.type, b.level);
  const levelCost = b.type === 'townHall' ? stats.upgradeCost : stats.cost;
  return Math.round(levelCost * CONFIG.rules.rebuildCostShare);
}

/**
 * Rebuild a destroyed building early, for gold (rules.rebuildCostShare). Everything is rebuilt free once the
 * wave is beaten (repairAll), so this is for getting a building back mid-fight. Walls can't be.
 */
export function checkRepair(state, b) {
  if (!b.destroyed) return { ok: false, reason: 'Not destroyed' };
  if (b.type === 'wall') return { ok: false, reason: 'Walls rebuild after the wave' };
  const cost = repairCost(b);
  if (state.gold < cost) return { ok: false, reason: `Need ${cost - state.gold} more gold` };
  return { ok: true, reason: '' };
}

/** Pay to rebuild a destroyed building at full HP. Returns true on success. */
export function repairBuilding(state, b) {
  if (!checkRepair(state, b).ok) return false;
  spendGold(state, repairCost(b));
  b.destroyed = false;
  b.hp = maxHp(b);
  emit(state, 'buildingRepaired', { id: b.id, paid: true }); // paid: the player rebuilt it (not the free one after the wave)
  return true;
}

/**
 * The wave is beaten: every building is rebuilt and healed to full, free (walls included). Returns how many
 * are left in ruins (always 0 now; kept for the wave-cleared banner).
 */
export function repairAll(state) {
  const ruins = 0;
  for (const b of state.buildings) {
    const wasDestroyed = b.destroyed;
    b.destroyed = false;
    b.hp = maxHp(b);
    if (wasDestroyed) emit(state, 'buildingRepaired', { id: b.id });
  }
  return ruins;
}

/**
 * Gold lost when a storage takes `damage`:
 *   storedHere = totalGold * thisCapacity / totalCapacity
 *   goldLost   = round(damage / maxHP * storageDrainOnDestroy * storedHere)
 * Town hall capacity is never drained (it only counts toward totalCapacity).
 */
export function storageDrainAmount(state, storage, damage) {
  const totalCap = getCapacity(state);
  if (totalCap <= 0) return 0;
  const storedHere = (state.gold * levelStats('storage', storage.level).capacity) / totalCap;
  return Math.round((damage / maxHp(storage)) * CONFIG.rules.storageDrainOnDestroy * storedHere);
}

export function formatGold(n) {
  return Math.floor(n).toLocaleString('en-US');
}
