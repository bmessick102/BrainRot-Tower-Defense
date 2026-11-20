import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  stepClock, nightAmount, isClockRunning, resumeClockOnLoad, createClock, startGrace, startNextWave, cycleLength,
  secondsToNextPhase, isDark, phaseLength
} from '../src/logic/dayNight.js';
import { checkWaveCleared, stepWaveSpawning } from '../src/logic/waves.js';
import { lerpColor, darkness, ambientTintFor, NIGHT_TINT } from '../src/objects/DayNight.js';
import { skyBlend, DARK_AT } from '../src/logic/clockLight.js';
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

  it('Start Wave starts the countdown right away at whatever time it is, and leaves the clock alone', () => {
    for (const phase of ['day', 'dusk', 'night', 'dawn']) {
      const s = freePlay({ clock: { phase, t: 3 } });
      expect(startNextWave(s)).toMatchObject({ ok: true });
      expect(s.clock).toEqual({ phase, t: 3 });
      expect(s.events.find((e) => e.name === 'waveCalled').data).toMatchObject({ number: 1 });
      expect(s.wave).toMatchObject({ phase: 'countdown', countdown: CONFIG.rules.waveCountdown });
      stepWaveSpawning(s, CONFIG.rules.waveCountdown - 1);
      expect(s.wave.phase).toBe('countdown'); // not yet
      expect(s.enemies.length).toBe(0);
      stepWaveSpawning(s, 1.05);
      expect(s.wave.phase).toBe('active');
      expect(s.enemies.length).toBeGreaterThan(0);
    }
  });

  it('the clock keeps running through a wave, and beating it does not change the time', () => {
    const s = freePlay({ clock: { phase: 'day', t: D.daySeconds - 10 } });
    startNextWave(s);
    stepWaveSpawning(s, CONFIG.rules.waveCountdown + 0.05);
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
    s.wave.queues = {}; s.enemies = []; stepWaveSpawning(s, CONFIG.rules.waveCountdown + 0.05); checkWaveCleared(s);
    run(s, CONFIG.rules.quickStartSeconds - 1);
    expect(startNextWave(s).quick).toBe(true);
    expect(s.events.some((e) => e.name === 'waveQuickStarted')).toBe(true);
    stepWaveSpawning(s, CONFIG.rules.waveCountdown + 0.05); s.wave.queues = {}; s.enemies = []; checkWaveCleared(s);
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

describe('sky pictures: day -> dusk -> night -> dawn -> day all blend the same way', () => {
  const at = (phase, share) => skyBlend({ phase, t: phaseLength(phase) * share });

  it('is plain day outside the twilights and plain night at night', () => {
    expect(skyBlend({ phase: 'day', t: 50 })).toMatchObject({ night: 0, twilight: 0, dusk: 0, dawn: 0, warm: 0 });
    expect(skyBlend({ phase: 'night', t: 50 })).toMatchObject({ night: 1, dusk: 0, dawn: 0, warm: 0 });
  });

  it('dusk fades the dusk picture in first, then the night picture over it', () => {
    expect(at('dusk', 0)).toMatchObject({ dusk: 0, night: 0, dawn: 0 });
    const early = at('dusk', 0.2), mid = at('dusk', 0.5), late = at('dusk', 0.85);
    expect(early.dusk).toBeGreaterThan(0); expect(early.night).toBe(0);          // warming, still no night picture
    expect(mid.dusk).toBe(1); expect(mid.night).toBeGreaterThan(0);              // dusk full, night starting
    expect(late.night).toBeGreaterThan(mid.night);
    expect(at('dusk', 1)).toMatchObject({ night: 1 });
    for (const s of [0.1, 0.3, 0.6, 0.9]) expect(at('dusk', s).dawn).toBe(0);
  });

  it('dawn is dusk run backwards, through the dawn picture', () => {
    for (const s of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      const dawn = at('dawn', s), dusk = at('dusk', 1 - s);
      expect(dawn.dawn).toBeCloseTo(dusk.dusk, 9);
      expect(dawn.night).toBeCloseTo(dusk.night, 9);
      expect(dawn.warm).toBeCloseTo(dusk.warm, 9);
      expect(dawn.dusk).toBe(0);
    }
    expect(at('dawn', 1).dawn).toBeCloseTo(0, 6);
  });

  it('turns the night picture on exactly when it counts as dark (lights, restless enemies)', () => {
    for (const phase of ['dusk', 'dawn']) {
      for (let s = 0; s <= 1; s += 0.05) {
        const clock = { phase, t: phaseLength(phase) * s };
        expect(skyBlend(clock).night > 0).toBe(nightAmount(clock) > DARK_AT);
        expect(darkness(nightAmount(clock))).toBeCloseTo(skyBlend(clock).night, 9);
      }
    }
  });

  it('warms the sprite tint in the twilights only, moonlit at night, white by day', () => {
    expect(ambientTintFor({ phase: 'day', t: 0 })).toBe(0xffffff);
    expect(ambientTintFor({ phase: 'night', t: 0 })).toBe(NIGHT_TINT);
    const warm = ambientTintFor({ phase: 'dusk', t: phaseLength('dusk') * 0.4 });
    const r = (c) => (c >> 16) & 255, b = (c) => c & 255;
    expect(r(warm) - b(warm)).toBeGreaterThan(r(NIGHT_TINT) - b(NIGHT_TINT) + 20); // redder than moonlight
    expect(ambientTintFor({ phase: 'dawn', t: phaseLength('dawn') * 0.6 })).toBe(ambientTintFor({ phase: 'dusk', t: phaseLength('dusk') * 0.4 }));
  });
});
