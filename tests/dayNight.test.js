import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepClock, nightAmount, secondsUntilDusk, isClockRunning, resumeClockOnLoad, createClock, startGrace } from '../src/logic/dayNight.js';
import { checkWaveCleared } from '../src/logic/waves.js';
import { lerpColor } from '../src/objects/DayNight.js';
import { TUTORIAL_NIGHT_STEP } from '../src/logic/tutorial.js';
import { makeStateWithTownHall } from './helpers.js';

const DAY = CONFIG.dayNight.daySeconds;
const DUSK = CONFIG.rules.waveCountdown;
const DAWN = CONFIG.dayNight.dawnSeconds;

function freePlay(overrides = {}, th = 1) {
  return makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10, clock: createClock(), ...overrides }, th);
}
const run = (state, seconds, dt = 0.1) => { for (let t = 0; t < seconds - 1e-9; t += dt) stepClock(state, dt); };

describe('day/night clock (waves come at night)', () => {
  it('starts in the day and counts down to dusk', () => {
    const s = freePlay();
    expect(s.clock.phase).toBe('day');
    run(s, 30);
    expect(secondsUntilDusk(s.clock)).toBeCloseTo(DAY - 30, 5);
    expect(nightAmount(s.clock)).toBe(0);
  });

  it('dusk triggers the night\'s wave countdown', () => {
    const s = freePlay();
    run(s, DAY + 0.05);
    expect(s.clock.phase).toBe('dusk');
    expect(s.wave.phase).toBe('countdown');
    expect(s.wave.number).toBe(1);
    expect(s.events.some((e) => e.name === 'waveTriggered')).toBe(true);
    run(s, DUSK / 2);
    expect(nightAmount(s.clock)).toBeGreaterThan(0.3);
    expect(nightAmount(s.clock)).toBeLessThan(0.7);
  });

  it('night holds until the wave is cleared, then dawn, then day', () => {
    const s = freePlay();
    run(s, DAY + DUSK + 0.2);
    expect(s.clock.phase).toBe('night');
    s.wave.phase = 'active';
    run(s, 300); // no matter how long
    expect(s.clock.phase).toBe('night');
    expect(nightAmount(s.clock)).toBe(1);
    s.wave.queues = {}; s.enemies = [];
    expect(checkWaveCleared(s)).toBe(true);
    expect(s.clock.phase).toBe('dawn'); // set before the save on waveCleared
    run(s, DAWN + 0.05);
    expect(s.clock.phase).toBe('day');
  });

  it('stays at day during the tutorial until night is introduced', () => {
    const s = makeStateWithTownHall({ tutorialStep: 5, clock: createClock() });
    expect(isClockRunning(s)).toBe(false);
    run(s, DAY * 3);
    expect(s.clock).toEqual({ phase: 'day', t: 0 });
    s.tutorialStep = TUTORIAL_NIGHT_STEP;
    expect(isClockRunning(s)).toBe(true);
  });

  it('a save made at dusk replays that night from the start of dusk', () => {
    const s = freePlay({ clock: { phase: 'dusk', t: 12 } });
    resumeClockOnLoad(s);
    expect(s.clock).toEqual({ phase: 'dusk', t: 0 });
    expect(s.wave.phase).toBe('countdown');
    const d = freePlay({ clock: { phase: 'dawn', t: 3 } });
    resumeClockOnLoad(d);
    expect(d.clock).toEqual({ phase: 'dawn', t: 3 });
    expect(d.wave.phase).toBe('idle');
  });

  it('a grace period after a lost night gives daytime before the next dusk', () => {
    const s = freePlay({ clock: { phase: 'dusk', t: 0 } }); // the checkpoint is taken as dusk begins
    startGrace(s);
    expect(s.clock.phase).toBe('day');
    expect(secondsUntilDusk(s.clock)).toBeCloseTo(CONFIG.dayNight.graceSeconds, 5);
    expect(s.events.some((e) => e.name === 'graceStarted')).toBe(true);
    run(s, CONFIG.dayNight.graceSeconds - 1);
    expect(s.wave.phase).toBe('idle'); // no wave during the grace period
    run(s, 2);
    expect(s.wave.phase).toBe('countdown'); // then night comes again
    // A grace period longer than a day works too.
    const long = freePlay();
    startGrace(long, DAY + 60);
    expect(secondsUntilDusk(long.clock)).toBeCloseTo(DAY + 60, 5);
  });

  it('blends colors for the night tint', () => {
    expect(lerpColor(0xffffff, 0x000000, 0)).toBe(0xffffff);
    expect(lerpColor(0xffffff, 0x000000, 1)).toBe(0x000000);
    expect(lerpColor(0x000000, 0x204060, 0.5)).toBe(0x102030);
  });
});
