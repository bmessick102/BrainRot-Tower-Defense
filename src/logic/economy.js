// Gold, capacity, mine production and collection, repair, and storage drain.
import { CONFIG } from '../config.js';
import { levelStats, buildCost, totalSpent, maxHp } from './buildings.js';
import { emit, isWaveActive } from './util.js';
import { abilityFx } from './abilities.js';
import { isDark } from './clockLight.js';
import { footprintCenter, distanceToFootprint } from './grid.js';

// ---------- economy perks (RV Lab trees of the Mine, Storage and House; see abilityConfig.js) ----------
/** A Storage's capacity with its perks (Extra Shelves, Expansion Wing, Mega Vault). */
export function storageCapacity(b) {
  return levelStats('storage', b.level).capacity * (1 + (abilityFx(b).capacityPct || 0) / 100);
}

/** A mine's stock cap with its perks (Deep Vault). */
export function mineStockCap(b) {
  return levelStats('mine', b.level).stockCap * (1 + (abilityFx(b).stockCapPct || 0) / 100);
}

/**
 * Gold per second a mine makes with every perk that touches it: its own (Overclocked Rig, Bull Run, Night
 * Shift, Mining Pool, Compound Mining), Storages nearby (Gold Magnet) and Houses anywhere (Town Pride).
 */
export function mineProduction(state, b) {
  const fx = abilityFx(b);
  let pct = (fx.productionPct || 0) + (b.compound || 0);
  if (fx.nightProductionPct && isDark(state.clock)) pct += fx.nightProductionPct;
  if (fx.poolPct) pct += fx.poolPct * state.buildings.filter((o) => o.type === 'mine' && o !== b && !o.destroyed).length;
  const c = footprintCenter(b);
  for (const o of state.buildings) {
    if (o.destroyed) continue;
    if (o.type === 'storage') {
      const ofx = abilityFx(o);
      if (ofx.mineAuraPct && distanceToFootprint(o, c.x, c.y) <= ofx.auraRadius) pct += ofx.mineAuraPct;
    } else if (o.type === 'house') {
      pct += abilityFx(o).pridePct || 0;
    }
  }
  return levelStats('mine', b.level).production * (1 + pct / 100);
}

/** Town hall built-in capacity + every storage the player owns (destroyed or not). */
export function getCapacity(state) {
  let cap = 0;
  for (const b of state.buildings) {
    if (b.type === 'townHall') cap += levelStats(b.type, b.level).capacity;
    else if (b.type === 'storage') cap += storageCapacity(b);
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
    const stockCap = mineStockCap(b);
    const rate = mineProduction(state, b);
    const before = Math.floor(b.stock || 0);
    b.stock = Math.min(stockCap, (b.stock || 0) + rate * dt);
    if (Math.floor(b.stock) !== before) emit(state, 'mineStockChanged', { id: b.id, stock: b.stock });
  }
}

/** Mine stock as a fraction of its cap (0..1). */
export function mineFill(b) {
  return (b.stock || 0) / mineStockCap(b);
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
  return sendMineToStorage(state, mine);
}

/**
 * Move a mine's stock into gold (up to capacity), with its collection perks: Tip Jar pays extra, and
 * Compound Mining makes it mine a little more each time. Used by collecting and by Auto-Collect.
 */
export function sendMineToStorage(state, mine) {
  const whole = Math.floor(mine.stock || 0);
  if (whole <= 0) return { collected: 0, storageFull: false };
  const room = getCapacity(state) - state.gold;
  if (room <= 0) {
    emit(state, 'storageFull', { id: mine.id });
    return { collected: 0, storageFull: true };
  }
  const amount = Math.min(whole, room);
  mine.stock -= amount;
  const fx = abilityFx(mine);
  const added = addGold(state, amount + Math.round(amount * (fx.collectBonusPct || 0) / 100));
  if (fx.compoundPct) mine.compound = Math.min(fx.compoundMax || 0, (mine.compound || 0) + fx.compoundPct);
  emit(state, 'mineCollected', { id: mine.id, amount: added });
  return { collected: added, storageFull: false };
}

/** Rebuild price for a destroyed building: rules.rebuildCostShare of its current level's cost. */
export function repairCost(b) {
  const stats = levelStats(b.type, b.level);
  // A level paid for in Burgers (costCurrency 'rp') counts as rules.burgerGoldValue gold per Burger (never less
  // than the gold the building cost to build), so higher levels cost more to rebuild.
  const levelCost = b.type === 'townHall' ? stats.upgradeCost
    : stats.costCurrency === 'rp' ? Math.max(buildCost(b.type), stats.cost * CONFIG.rules.burgerGoldValue)
    : stats.cost;
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
  const fx = abilityFx(storage);
  if (fx.drainImmuneAbove && storage.hp / maxHp(storage) > fx.drainImmuneAbove) return 0; // Fort Knox
  const storedHere = (state.gold * storageCapacity(storage)) / totalCap;
  const resist = 1 - (fx.drainResistPct || 0) / 100;                                        // Time Lock
  return Math.round((damage / maxHp(storage)) * CONFIG.rules.storageDrainOnDestroy * storedHere * resist);
}

export function formatGold(n) {
  return Math.floor(n).toLocaleString('en-US');
}
