import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { callWaveEarly, earlyCallBonus, earlyCallSkip, createClock, stepClock } from '../src/logic/dayNight.js';
import { stepWaveSpawning } from '../src/logic/waves.js';
import { getCapacity } from '../src/logic/economy.js';
import { makeStateWithTownHall } from './helpers.js';

const DAY = CONFIG.dayNight.daySeconds;
const DAWN = CONFIG.dayNight.dawnSeconds;
const DUSK = CONFIG.rules.waveCountdown;
const PER_SEC = CONFIG.rules.earlyCallGoldPerSecond;

function freePlay(overrides = {}) {
  return makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: createClock(), gold: 0, ...overrides });
}
const run = (s, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepClock(s, dt); };

describe('calling a wave early', () => {
  it('from the day: starts the dusk countdown now and pays for the daytime skipped', () => {
    const s = freePlay();
    run(s, 40);
    const r = callWaveEarly(s);
    expect(r).toMatchObject({ ok: true, from: 'day', bonus: Math.floor((DAY - 40) * PER_SEC) });
    expect(s.gold).toBe(r.bonus);
    expect(s.clock.phase).toBe('dusk');
    expect(s.wave.phase).toBe('countdown');
    expect(s.wave.countdown).toBe(DUSK); // the full warning still happens
    expect(s.events.some((e) => e.name === 'waveTriggered')).toBe(true);
    expect(s.events.find((e) => e.name === 'waveCalledEarly').data).toMatchObject({ from: 'day', bonus: r.bonus });
  });

  it('from dawn: counts the rest of dawn plus the whole day', () => {
    const s = freePlay({ clock: { phase: 'dawn', t: 5 } });
    expect(earlyCallSkip(s)).toBeCloseTo(DAWN - 5 + DAY, 5);
    expect(callWaveEarly(s).bonus).toBe(Math.floor((DAWN - 5 + DAY) * PER_SEC));
    expect(s.clock.phase).toBe('dusk');
  });

  it('from the countdown: the wave starts on the next step, paying for the countdown left', () => {
    const s = freePlay();
    callWaveEarly(s);
    stepWaveSpawning(s, 6);
    const goldBefore = s.gold;
    const r = callWaveEarly(s);
    expect(r).toMatchObject({ ok: true, from: 'dusk', bonus: Math.floor((DUSK - 6) * PER_SEC) });
    expect(s.gold).toBe(goldBefore + r.bonus);
    stepWaveSpawning(s, 0.016);
    expect(s.wave.phase).toBe('active');
    expect(s.events.some((e) => e.name === 'waveStarted')).toBe(true);
  });

  it('the bonus never takes gold past capacity', () => {
    const cap = getCapacity(freePlay());
    const s = freePlay({ gold: cap - 3 });
    const r = callWaveEarly(s);
    expect(s.gold).toBe(cap);
    expect(r.bonus).toBe(3); // reports what was actually added
  });

  it('is unavailable during the tutorial, a running wave, and after a loss', () => {
    expect(earlyCallSkip(freePlay({ tutorialDone: false, tutorialStep: 3 }))).toBeNull();
    expect(earlyCallSkip(freePlay({ gameOver: true }))).toBeNull();
    const s = freePlay();
    callWaveEarly(s);
    callWaveEarly(s);
    stepWaveSpawning(s, 0.016);
    expect(s.wave.phase).toBe('active');
    expect(earlyCallSkip(s)).toBeNull();
    expect(earlyCallBonus(s)).toBe(0);
    expect(callWaveEarly(s)).toMatchObject({ ok: false, bonus: 0 });
  });
});
