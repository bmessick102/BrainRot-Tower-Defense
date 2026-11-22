// Both heroes in one place (v0.8): the Brisket King (hero.js, state.hero, his altar 'altar') and the Hatsune Queen
// (queen.js, state.queen, her altar 'queenAltar'). Both can be out at once. Neither hero object is saved: each is
// rebuilt from its altar, and each altar saves its own nap (`heroSleep`), so a save from before the Queen (only the
// Brisket King's altar) loads exactly as it did.
import { ensureHero, stepHero, heroWaveStarted, heroAfterWave, damageHero, heroStats } from './hero.js';
import { ensureQueen, stepQueen, queenWaveStarted, queenAfterWave, damageQueen, queenStats, queenTargetable } from './queen.js';

/** The altar types and which hero each one holds. */
export const HERO_OF_ALTAR = { altar: 'brisket', queenAltar: 'queen' };

/** Is this building a hero's altar? */
export function isHeroAltar(b) {
  return !!b && !!HERO_OF_ALTAR[b.type];
}

/** The hero standing for this altar (state.hero or state.queen), or null. */
export function heroOfAltar(state, altar) {
  if (!altar) return null;
  const h = altar.type === 'queenAltar' ? state.queen : altar.type === 'altar' ? state.hero : null;
  return h && h.altarId === altar.id ? h : null;
}

/** A hero's numbers from its altar (heroStats for the Brisket King, queenStats for the Hatsune Queen). */
export function heroStatsFor(altar) {
  return altar.type === 'queenAltar' ? queenStats(altar) : heroStats(altar);
}

/** Every hero out right now (each rebuilt from its altar if needed). */
export function allHeroes(state) {
  ensureHero(state);
  ensureQueen(state);
  return [state.hero, state.queen].filter(Boolean);
}

/** Heroes enemies can fight right now: awake, and (the Queen) not hidden by Encore Cloak. */
export function fightableHeroes(state) {
  const out = [];
  if (state.hero && state.hero.status === 'ready') out.push(state.hero);
  if (queenTargetable(state.queen)) out.push(state.queen);
  return out;
}

/** An enemy hits hero `h` for `amount`. `melee`: from right next to the hero (the Queen's Dodge Roll). */
export function hitHero(state, h, amount, melee = false) {
  if (h && h === state.queen) damageQueen(state, amount, { melee });
  else if (h && h === state.hero) damageHero(state, amount);
}

/** One step of every hero (simulate.js). */
export function stepHeroes(state, dt) {
  stepHero(state, dt);
  if (!state.gameOver) stepQueen(state, dt);
}

/** A wave starts: each hero's ability charges come back. */
export function heroesWaveStarted(state) {
  heroWaveStarted(state);
  queenWaveStarted(state);
}

/** The wave is beaten: each hero naps off the damage taken. */
export function heroesAfterWave(state) {
  heroAfterWave(state);
  queenAfterWave(state);
}
