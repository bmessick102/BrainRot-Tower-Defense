// Shakes (v0.14): where they come from besides kills and waves, and the buildings that hold them. The balance, its cap and
// the player-facing name live in researchPoints.js (internally Shakes are still research points, `rp`, so saves didn't
// change). Pure rules, no Phaser.
//
//   Shake Collector  fills its own stock (CONFIG.shakeCollector levels: production per second, stockCap), clicked to
//                    collect like a Bitcoin Mine: not during a wave (it keeps filling), only up to the room under the cap.
//   Village Hall     a small trickle straight into the balance (rules.hallShakeIncome), like its gold (hallIncome).
//   Shake Storage    raises the cap (rpCap); an enemy hitting it drains Shakes, as a Storage drains gold.
import { CONFIG } from '../config.js';
import { abilityFx } from './abilities.js';
import { ABILITIES, PATH_KEYS } from '../abilityConfig.js';
import { levelStats, maxHp } from './buildings.js';
import { emit, isWaveActive } from './util.js';
import { addResearchPoints, researchPoints, rpCap, rpRoom, shakeStorageCapacity } from './researchPoints.js';

// ---------- Shake Collectors ----------
/** A Shake Collector's stock cap (Shakes it holds before it stops). */
export function collectorStockCap(b) {
  return Math.round(levelStats('shakeCollector', b.level).stockCap * (1 + (abilityFx(b).stockCapPct || 0) / 100));
}

export function maxCollectorStock(level) {
  const tree = ABILITIES.shakeCollector;
  const pct = Math.max(...PATH_KEYS.map((path) => tree[path].tiers.reduce((total, t) => total + (t.fx.stockCapPct || 0), 0)));
  return Math.round(levelStats('shakeCollector', level).stockCap * (1 + pct / 100));
}

/** Shakes per second a Shake Collector makes. */
export function collectorProduction(b) {
  return levelStats('shakeCollector', b.level).production * (1 + (abilityFx(b).productionPct || 0) / 100);
}

/** Shake Collectors fill their stock up to its cap, day and night, waves too. Destroyed ones don't. */
export function produceShakeCollectors(state, dt) {
  for (const b of state.buildings) {
    if (b.type !== 'shakeCollector' || b.destroyed) continue;
    const before = Math.floor(b.stock || 0);
    const cap = collectorStockCap(b);
    if ((b.stock || 0) < cap) b.stock = Math.min(cap, (b.stock || 0) + collectorProduction(b) * dt);
    if (Math.floor(b.stock) !== before) emit(state, 'collectorStockChanged', { id: b.id, stock: b.stock });
  }
}

/** A collector's stock as a share of its cap (0..1). */
export function collectorFill(b) {
  return (b.stock || 0) / collectorStockCap(b);
}

/** Does it show its Shake (ready to collect)? From the same share as a mine's coin (rules.mineCoinIconThreshold). */
export function collectorShowsIcon(b) {
  return !b.destroyed && collectorFill(b) >= CONFIG.rules.mineCoinIconThreshold;
}

/**
 * Collect a Shake Collector: moves min(stock, room under the cap) into the balance; the rest stays in it. Not while a
 * wave attacks (it keeps filling, ready for after). Returns { collected, full, waveActive }; `full` when there's no room
 * (the cap is reached, or an older save's balance is over it).
 */
export function collectShakes(state, b) {
  if (isWaveActive(state)) return { collected: 0, full: false, waveActive: true };
  const whole = Math.floor(b.stock || 0);
  if (whole <= 0) return { collected: 0, full: false };
  const room = Math.floor(rpRoom(state));
  if (room <= 0) {
    emit(state, 'shakesFull', { id: b.id });
    return { collected: 0, full: true };
  }
  const amount = Math.min(whole, room);
  b.stock -= amount;
  const added = addResearchPoints(state, amount, 'collector');
  emit(state, 'shakesCollected', { id: b.id, amount: added });
  return { collected: added, full: false };
}

// ---------- the Village Hall's trickle ----------
/** Shakes per second the Village Hall makes at this level (0 for the level 0 ruin). */
export function hallShakeRate(level) {
  if (!level || level < 1) return 0;
  const H = CONFIG.rules.hallShakeIncome;
  return H.base + H.perLevel * (level - 1);
}

/**
 * The Village Hall's own Shakes, straight into the balance (day and night), in batches of hallShakeIncome.batch, the
 * way its gold works (produceHallIncome). With no room under the cap the trickle just waits (nothing builds up, and
 * no "lost" note every minute).
 */
export function produceHallShakes(state, dt) {
  const th = state.buildings.find((b) => b.type === 'townHall');
  if (!th || th.destroyed) return;
  const rate = hallShakeRate(th.level);
  if (rate <= 0) return;
  if (rpRoom(state) <= 0) { state.hallShakeCarry = 0; return; }
  const batch = CONFIG.rules.hallShakeIncome.batch;
  state.hallShakeCarry = (state.hallShakeCarry || 0) + rate * dt;
  while (state.hallShakeCarry >= batch) {
    state.hallShakeCarry -= batch;
    const added = addResearchPoints(state, batch, 'hall');
    emit(state, 'hallShakes', { id: th.id, amount: batch, added });
  }
}

// ---------- Shake Storages ----------
/** The village's Shakes as a share of its cap (0..1, a balance over the cap counts as full): the storages' fill picture. */
export function shakeFill(state) {
  const cap = rpCap(state);
  return cap > 0 ? Math.min(1, researchPoints(state) / cap) : 0;
}

/**
 * Shakes lost when a Shake Storage takes `damage`, the way a Storage loses gold (storageDrainAmount):
 *   storedHere = Shakes * thisCapacity / cap,   lost = round(damage / maxHP * storageDrainOnDestroy * storedHere)
 * The Village Hall's own store is never drained (it only counts toward the cap).
 */
export function shakeStorageDrainAmount(state, storage, damage) {
  const cap = rpCap(state);
  if (cap <= 0) return 0;
  const storedHere = (Math.min(researchPoints(state), cap) * shakeStorageCapacity(storage.level, storage)) / cap;
  const retained = 1 - (abilityFx(storage).drainResistPct || 0) / 100;
  return Math.round((damage / maxHp(storage)) * CONFIG.rules.storageDrainOnDestroy * storedHere * retained);
}

/** Take Shakes out of the balance after a raid hit (never below 0). Returns how many went. */
export function drainShakes(state, amount) {
  const n = Math.min(researchPoints(state), Math.max(0, Math.round(amount || 0)));
  if (!n) return 0;
  state.researchPoints = researchPoints(state) - n;
  emit(state, 'researchPointsChanged', { researchPoints: state.researchPoints, added: -n });
  return n;
}
