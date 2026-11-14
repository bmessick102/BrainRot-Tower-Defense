import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  stepClock, nightAmount, isClockRunning, resumeClockOnLoad, createClock, startGrace, startNextWave, cycleLength,
  secondsToNextPhase, isDark
} from '../src/logic/dayNight.js';
import { checkWaveCleared, stepWaveSpawning } from '../src/logic/waves.js';
import { lerpColor, darkness } from '../src/objects/DayNight.js';
import { TUTORIAL_NIGHT_STEP } from '../src/logic/tutorial.js';
import { makeStateWithTownHall } from './helpers.js';

const D = CONFIG.dayNight;

function freePlay(overrides = {}, th = 1) {
  return makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: createClock(), ...overrides }, th);
}
const run = (state, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepClock(state, dt); };

describe('day/night clock (a cycle of its own; waves come when the player starts them)', () => {
  it('cycles day -> dusk -> night -> dawn -> day on its own, about 8 minutes in all', () => {
    expect(cycleLength()).toBe(D.daySeconds + D.duskSeconds + D.nightSeconds + D.dawnSeconds);
    expect(cycleLength()).toBe(480);
    const s = freePlay();
    expect(s.clock.phase).toBe('day');
    expect(nightAmount(s.clock)).toBe(0);
    run(s, D.daySeconds + 0.05);
    expect(s.clock.phase).toBe('dusk');
    run(s, D.duskSeconds / 2);
    expect(nightAmount(s.clock)).toBeGreaterThan(0.3);
    expect(nightAmount(s.clock)).toBeLessThan(0.7);
    run(s, D.duskSeconds / 2);
    expect(s.clock.phase).toBe('night');
    expect(nightAmount(s.clock)).toBe(1);
    run(s, D.nightSeconds);
    expect(s.clock.phase).toBe('dawn');
    run(s, D.dawnSeconds);
    expect(s.clock.phase).toBe('day');
    expect(s.wave.phase).toBe('idle'); // no wave ever comes on its own
  });

  it('a long step can pass more than one phase', () => {
    const s = freePlay();
    stepClock(s, D.daySeconds + D.duskSeconds + 5);
    expect(s.clock.phase).toBe('night');
    expect(s.clock.t).toBeCloseTo(5, 5);
    expect(secondsToNextPhase(s.clock)).toBeCloseTo(D.nightSeconds - 5, 5);
  });

  it('Start Wave sends the wave right away at whatever time it is, and leaves the clock alone', () => {
    for (const phase of ['day', 'dusk', 'night', 'dawn']) {
      const s = freePlay({ clock: { phase, t: 3 } });
      expect(startNextWave(s)).toMatchObject({ ok: true });
      expect(s.clock).toEqual({ phase, t: 3 });
      expect(s.events.find((e) => e.name === 'waveCalled').data).toMatchObject({ number: 1 });
      stepWaveSpawning(s, 0.05);
      expect(s.wave.phase).toBe('active');
      expect(s.enemies.length).toBeGreaterThan(0);
    }
  });

  it('the clock keeps running through a wave, and beating it does not change the time', () => {
    const s = freePlay({ clock: { phase: 'day', t: D.daySeconds - 10 } });
    startNextWave(s);
    stepWaveSpawning(s, 0.05);
    run(s, 20);
    expect(s.clock.phase).toBe('dusk'); // night fell mid-fight
    s.wave.queues = {}; s.enemies = [];
    expect(checkWaveCleared(s)).toBe(true);
    expect(s.clock.phase).toBe('dusk');
  });

  it('Start Wave works any time of day, but not mid-wave, in the tutorial, or after a loss', () => {
    expect(startNextWave(freePlay({ clock: { phase: 'night', t: 0 } })).ok).toBe(true);
    const busy = freePlay();
    startNextWave(busy);
    expect(startNextWave(busy).ok).toBe(false); // already on its way
    expect(startNextWave(freePlay({ tutorialDone: false, tutorialStep: 5 })).ok).toBe(false);
    expect(startNextWave(freePlay({ gameOver: true })).ok).toBe(false);
  });

  it('starting within quickStartSeconds of clearing the last wave is a quick start', () => {
    const s = freePlay();
    expect(startNextWave(s).quick).toBe(false); // nothing cleared yet
    s.wave.queues = {}; s.enemies = []; stepWaveSpawning(s, 0.05); checkWaveCleared(s);
    run(s, CONFIG.rules.quickStartSeconds - 1);
    expect(startNextWave(s).quick).toBe(true);
    expect(s.events.some((e) => e.name === 'waveQuickStarted')).toBe(true);
    stepWaveSpawning(s, 0.05); s.wave.queues = {}; s.enemies = []; checkWaveCleared(s);
    run(s, CONFIG.rules.quickStartSeconds + 1);
    expect(startNextWave(s).quick).toBe(false);
  });

  it('stays at day during the tutorial until its first wave', () => {
    const s = makeStateWithTownHall({ tutorialStep: 5, clock: createClock() });
    expect(isClockRunning(s)).toBe(false);
    run(s, 600);
    expect(s.clock).toEqual({ phase: 'day', t: 0 });
    s.tutorialStep = TUTORIAL_NIGHT_STEP;
    expect(isClockRunning(s)).toBe(true);
  });

  it('a save carries on from its time of day; old negative grace times start at 0', () => {
    for (const phase of ['day', 'dusk', 'night', 'dawn']) {
      const s = freePlay({ clock: { phase, t: 2 } });
      resumeClockOnLoad(s);
      expect(s.clock).toEqual({ phase, t: 2 });
    }
    const old = freePlay({ clock: { phase: 'day', t: -30 } });
    resumeClockOnLoad(old);
    expect(old.clock).toEqual({ phase: 'day', t: 0 });
  });

  it('Retry after a lost wave keeps the time of day, with no wave coming', () => {
    const s = freePlay({ clock: { phase: 'night', t: 40 } }); // the checkpoint's time
    startGrace(s);
    expect(s.clock).toEqual({ phase: 'night', t: 40 });
    expect(s.events.some((e) => e.name === 'graceStarted')).toBe(true);
    expect(s.wave.phase).toBe('idle');
    expect(startNextWave(s).ok).toBe(true);
  });

  it('night lighting (enemy glows, building lights) only shows once it is dark', () => {
    expect(isDark({ phase: 'day', t: 10 })).toBe(false);
    expect(isDark({ phase: 'dusk', t: 1 })).toBe(false);
    expect(isDark({ phase: 'night', t: 0 })).toBe(true);
    expect(darkness(0)).toBe(0);
    expect(darkness(0.3)).toBe(0);
    expect(darkness(1)).toBe(1);
    expect(darkness(0.7)).toBeGreaterThan(0);
  });

  it('blends colors for the night tint', () => {
    expect(lerpColor(0xffffff, 0x000000, 0)).toBe(0xffffff);
    expect(lerpColor(0xffffff, 0x000000, 1)).toBe(0x000000);
    expect(lerpColor(0x000000, 0x204060, 0.5)).toBe(0x102030);
  });
});
