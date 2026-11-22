// Gameplay edge cases (final QA): things a player can do at awkward moments must never break the game.
import { describe, it, expect } from 'vitest';
import { castSpell, checkCastSpot, spellStats } from '../src/logic/spells.js';
import { simulate, MAX_STEP } from '../src/logic/simulate.js';
import { damageBuilding } from '../src/logic/combat.js';
import { ensureHero, damageHero, stepHero, heroAfterWave, heroStats } from '../src/logic/hero.js';
import { GameState } from '../src/state/GameState.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const noStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

function village({ wave = true } = {}) {
  const s = makeStateWithTownHall({ gold: 1e6, researchPoints: 5000, tutorialDone: true, clock: { phase: 'day', t: 0 } }, 10);
  addBuilding(s, 'fuelStation', 10, 10, 8);
  if (wave) s.wave.phase = 'active';
  return s;
}

function numbersOk(obj) {
  return Object.values(obj).every((v) => typeof v !== 'number' || Number.isFinite(v));
}

describe('spells at awkward spots', () => {
  it('a spot that is not a number, or far off the map, is refused and the spell is kept', () => {
    const s = village();
    s.spells = ['freeze', 'heat'];
    expect(castSpell(s, 'freeze', NaN, 5)).toMatchObject({ ok: false, reason: 'Pick a spot on the map' });
    expect(castSpell(s, 'heat', -400, -400).ok).toBe(false);
    expect(s.spells).toEqual(['freeze', 'heat']);
    expect(s.activeSpells || []).toHaveLength(0);
    // The map's edge (where enemies come on, a little outside the grid) is fine.
    expect(castSpell(s, 'heat', -3, -3).ok).toBe(true);
  });

  it('Lightning with nobody in its circle is refused (kept); with fewer enemies than targets it hits them all', () => {
    const s = village();
    s.spells = ['lightning'];
    expect(castSpell(s, 'lightning', 20, 20)).toMatchObject({ ok: false, reason: 'No enemies there' });
    expect(s.spells).toEqual(['lightning']);
    const st = spellStats(s, 'lightning');
    const es = [addEnemy(s, 'tank', 20, 20, { hp: 1e7, maxHp: 1e7 }), addEnemy(s, 'grunt', 20.4, 20, { hp: 1e7, maxHp: 1e7 })];
    expect(es.length).toBeLessThan(st.targets);
    expect(checkCastSpot(s, 'lightning', 20, 20).ok).toBe(true);
    expect(castSpell(s, 'lightning', 20, 20).ok).toBe(true);
    for (const e of es) expect(e.hp).toBe(1e7 - st.damage);
    expect(s.spells).toEqual([]);
  });

  it('spells still work when the Fuel Station is destroyed mid-wave', () => {
    const s = village();
    const fs = s.buildings.find((b) => b.type === 'fuelStation');
    damageBuilding(s, fs, 1e9, null);
    expect(fs.destroyed).toBe(true);
    s.spells = ['heat'];
    addEnemy(s, 'grunt', 20, 20, { hp: 1e6, maxHp: 1e6 });
    expect(castSpell(s, 'heat', 20, 20).ok).toBe(true);
    expect(numbersOk(spellStats(s, 'heat'))).toBe(true);
  });
});

describe('frame time spikes', () => {
  it('huge, negative, infinite and NaN steps never poison the game state', () => {
    const s = village({ wave: false });
    addEnemy(s, 'grunt', 5, 5);
    s.wave.phase = 'active';
    s.wave.queues = {};
    s.wave.paths = [];
    for (const dt of [60, 1e9, -1, NaN, Infinity, undefined]) simulate(s, dt);
    expect(Number.isFinite(s.clock.t)).toBe(true);
    for (const e of s.enemies) expect([e.x, e.y, e.hp].every(Number.isFinite)).toBe(true);
    expect(MAX_STEP).toBeLessThanOrEqual(0.1);
  });
});

describe('buildings during a wave', () => {
  it("can't be moved mid-wave (they can during the countdown); there's no selling (v0.8)", () => {
    const gs = new GameState({ storage: noStorage, rng: () => 0.5 });
    gs.startNew();
    gs.skipTutorial();
    gs.gold = 1e6;
    gs.upgradeBuilding(gs.buildings.find((x) => x.type === 'townHall').id); // (the starting hall is a ruin)
    const b = gs.buildings.find((x) => x.type !== 'townHall' && x.type !== 'wall');
    gs.startWave();
    expect(gs.wave.phase).toBe('countdown');
    gs.startWaveNow();
    gs.update(0.05);
    expect(gs.wave.phase).toBe('active');
    expect(gs.sellBuilding).toBeUndefined();
    expect(gs.moveBuilding(b.id, b.col + 1, b.row).ok).toBe(false);
    expect(gs.getBuilding(b.id)).toBe(b);
  });
});

describe('the Brisket King at the end of a wave', () => {
  it('knocked out (with Second Wind) as the wave ends: he gets up, never stays down or NaN', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 6);
    const altar = addBuilding(s, 'altar', 10, 10, 10);
    altar.picks = ['a', 'b', 'a', 'b', 'b']; // Second Wind
    const h = ensureHero(s);
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    damageHero(s, 1e9);
    expect(h.status).toBe('down');
    s.wave.phase = 'idle'; // the wave is beaten while he's down
    heroAfterWave(s);
    expect(h.status).toBe('waking');
    expect(h.hp).toBe(heroStats(altar).maxHp);
    for (let t = 0; t < 30; t += 0.1) stepHero(s, 0.1);
    expect(h.status).toBe('ready');
    expect(Number.isFinite(h.hp)).toBe(true);
  });

  it('his altar destroyed mid-wave: he keeps going without errors', () => {
    const s = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: { phase: 'day', t: 0 } }, 6);
    const altar = addBuilding(s, 'altar', 10, 10, 3);
    const h = ensureHero(s);
    s.wave = { ...s.wave, phase: 'active', number: 3, queues: {}, paths: [], bountyEarned: 0 };
    addEnemy(s, 'grunt', 12, 12, { hp: 1e6, maxHp: 1e6 });
    damageBuilding(s, altar, 1e9, null);
    expect(altar.destroyed).toBe(true);
    for (let t = 0; t < 10; t += 0.1) stepHero(s, 0.1);
    expect([h.x, h.y, h.hp].every(Number.isFinite)).toBe(true);
  });
});

describe('sounds before the first click', () => {
  it('effects are skipped while the browser still blocks audio (Phaser would queue them forever)', async () => {
    const { playSfx, playVoiceLine } = await import('../src/audio.js');
    const played = [];
    const scene = (locked) => ({
      cache: { audio: { exists: () => true } },
      sound: { locked, play: (k) => played.push(k), add: (k) => ({ once() {}, play: () => played.push(k), isPlaying: false }) }
    });
    playSfx(scene(true), 'sfx_a');
    playVoiceLine(scene(true), ['voice_a']);
    expect(played).toEqual([]);
    playSfx(scene(false), 'sfx_b');
    playVoiceLine(scene(false), ['voice_b']);
    expect(played).toEqual(['sfx_b', 'voice_b']);
  });
});
