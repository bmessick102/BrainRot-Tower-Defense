// The Fuel Station guide (v0.15.2): a step-by-step tutorial like the RV Lab's (labGuide.js) that starts when the
// Village Hall reaches level 2 (the Fuel Station's unlock) and walks through building the station, brewing the free
// first Karuba Coffee (Rage) and casting it in a wave. It never locks anything: the guide bubble (UIScene) says what to
// do next and points at it, the brewing window shows the in-window steps, and Skip ends it. Before v0.15.2 the same
// steps were three first-time tips (tips.js).
// state.fuelGuide (saved): 0 = not started, a step id below while it runs, 99 = finished or skipped.
import { emit, isWaveActive } from './util.js';

// Step ids. Build, brew and cast keep the numbers they had as tips (1, 2, 3), so a village saved partway through
// those carries on at the same step; the new steps got new numbers. ORDER is the order they come in.
export const FUEL_GUIDE = { off: 0, build: 1, brew: 2, cast: 3, open: 4, ready: 5, cast2: 6, done: 99 };
const ORDER = [FUEL_GUIDE.build, FUEL_GUIDE.open, FUEL_GUIDE.brew, FUEL_GUIDE.ready, FUEL_GUIDE.cast, FUEL_GUIDE.cast2];

/**
 * Each step: key, text, advanceOn (the event that completes it), when(state, data) (extra condition), inWindow (also
 * shown as a hint inside the brewing window, since the bubble hides behind windows) and showNext (finished by Next).
 */
export const FUEL_GUIDE_STEPS = {
  [FUEL_GUIDE.build]: {
    key: 'build',
    text: 'Village Hall 2 unlocked the Fuel Station! It brews spells you can cast during a wave. Build one: Shop → Economy.',
    advanceOn: 'buildingPlaced', when: (s, d) => d.type === 'fuelStation'
  },
  [FUEL_GUIDE.open]: {
    key: 'open',
    text: 'Your Fuel Station is up! Click it and press Brew.',
    advanceOn: 'fuelStationOpened'
  },
  [FUEL_GUIDE.brew]: {
    key: 'brew',
    text: 'Pick the Karuba Coffee (Rage) and press Brew. Your first one is free!',
    inWindow: 'brew',
    advanceOn: 'spellBrewed'
  },
  [FUEL_GUIDE.ready]: {
    key: 'ready',
    text: 'Brewed! It waits in a spell slot until your next wave, where it makes your defenses fire faster and hit harder.',
    inWindow: 'brew', showNext: true,
    advanceOn: 'next'
  },
  [FUEL_GUIDE.cast]: {
    key: 'cast',
    text: 'Now start a wave. When it begins, click the pulsing Karuba Coffee on the hotbar at the bottom (or press its number), then click the map near your defenses.',
    advanceOn: 'spellCast'
  },
  [FUEL_GUIDE.cast2]: {
    key: 'castDone',
    text: 'Great cast! Brew spells between waves with Shakes and cast them when a wave gets tough. Upgrade the Fuel Station for more spells and slots.',
    showNext: true,
    advanceOn: 'next'
  }
};

export function fuelGuideStep(state) {
  return state.fuelGuide || 0;
}

export function isFuelGuideActive(state) {
  return ORDER.includes(fuelGuideStep(state));
}

/** The current step's definition, or null. */
export function fuelGuideCurrent(state) {
  return isFuelGuideActive(state) ? FUEL_GUIDE_STEPS[fuelGuideStep(state)] : null;
}

export function fuelGuideText(state) {
  const step = fuelGuideCurrent(state);
  return step ? step.text : '';
}

/** The bubble shows by day only (not mid-attack), and only after the first tutorial is over. */
export function isFuelGuideVisible(state) {
  return isFuelGuideActive(state) && !!state.tutorialDone && !isWaveActive(state);
}

/** Hint for a window ('brew') at the current step, or ''. */
export function fuelGuideHint(state, windowKind) {
  const step = fuelGuideCurrent(state);
  return step && step.inWindow === windowKind ? step.text : '';
}

/** The guide's first brew: a Karuba Coffee (Rage), free, any time before it's brewed. */
export function isFreeBrew(state, kind) {
  const step = fuelGuideStep(state);
  return kind === 'rage' && (step === FUEL_GUIDE.open || step === FUEL_GUIDE.brew);
}

/** Its Karuba Coffee's hotbar slot pulses from brewing it until it's cast. */
export function fuelGuidePulses(state) {
  const step = fuelGuideStep(state);
  return step === FUEL_GUIDE.ready || step === FUEL_GUIDE.cast;
}

function setStep(state, n) {
  state.fuelGuide = n;
  emit(state, 'fuelGuideChanged', { step: n, done: n === FUEL_GUIDE.done });
}

/**
 * Feed the guide a game or UI event. It starts when the Village Hall reaches level 2 with no Fuel Station built
 * (villages already past that get the plain Fuel Station tip instead). Doing a later step early (brewing before
 * opening the window from the guide, casting before pressing Next) skips ahead; Next only finishes the step on show.
 * Returns true when the step changed ('fuelGuideChanged').
 */
export function fuelGuideEvent(state, name, data = {}) {
  const step = fuelGuideStep(state);
  if (name === 'townHallUpgraded') {
    if (data.level === 2 && step === FUEL_GUIDE.off && !(state.buildings || []).some((b) => b.type === 'fuelStation')) {
      setStep(state, FUEL_GUIDE.build);
      return true;
    }
    return false;
  }
  const at = ORDER.indexOf(step);
  if (at < 0) return false;
  for (let i = at; i < ORDER.length; i++) {
    const s = FUEL_GUIDE_STEPS[ORDER[i]];
    if (s.advanceOn !== name || (s.when && !s.when(state, data))) continue;
    if (name === 'next' && i !== at) return false;
    setStep(state, i + 1 < ORDER.length ? ORDER[i + 1] : FUEL_GUIDE.done);
    return true;
  }
  return false;
}

/** Skip button: the guide is over for this village. */
export function skipFuelGuide(state) {
  if (!isFuelGuideActive(state)) return false;
  setStep(state, FUEL_GUIDE.done);
  return true;
}

/** A saved guide step: missing (older saves), off, one of its steps, or done. */
export function validFuelGuide(v) {
  return v === undefined || v === FUEL_GUIDE.off || v === FUEL_GUIDE.done || ORDER.includes(v);
}
