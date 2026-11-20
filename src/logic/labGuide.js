// The RV Lab guide: a short follow-up tutorial that starts when the Village Hall reaches the RV Lab's unlock
// level (4) and walks through building the lab and researching a tier (which every building of that type gets).
// Unlike the first tutorial it never locks anything: the guide bubble just says what to do next, and Skip
// ends it. The first research is free while it runs (abilities.js, isResearchFree).
// state.labGuideStep: 0 = not started, 1..LAB_GUIDE_STEPS.length - 1 = on that step, LAB_GUIDE_DONE = finished
// or skipped. Saved with the village.
import { CONFIG } from '../config.js';
import { LAB_GUIDE_DONE, ABILITY_TYPES, labTierCount, anyResearch } from './abilities.js';
import { buildingName, townHallLevel } from './buildings.js';
import { emit, isWaveActive } from './util.js';

export { LAB_GUIDE_DONE };

/** The defense types the player has researched anything for (for the "click a Cannon" step). */
export function researchedTypes(state) {
  return ABILITY_TYPES.filter((t) => labTierCount(state, t) > 0);
}

/** The first researched defense type that's on the map, else the first researched type. */
function guideType(state) {
  const types = researchedTypes(state);
  return types.find((t) => state.buildings.some((b) => b.type === t)) || types[0] || 'cannon';
}

/**
 * Steps (1-based). advanceOn: the event that completes it; when(state, payload): extra condition.
 * text: string or (state) => string. inWindow: also shown as a hint inside that window ('research' /
 * 'abilities'), because the guide bubble is hidden while a window is open.
 */
export const LAB_GUIDE_STEPS = [
  null,
  {
    key: 'build',
    text: 'The RV Lab is unlocked! It researches new abilities for your defenses. Build one: Shop → Economy.',
    advanceOn: 'buildingPlaced', when: (s, d) => d.type === 'rvlab'
  },
  {
    key: 'open',
    text: 'Click your RV Lab and press Research.',
    advanceOn: 'researchOpened'
  },
  {
    key: 'research',
    text: 'Pick a defense on the left and research tier 1 of any path. Your first research is free!',
    inWindow: 'research',
    advanceOn: 'abilityResearched'
  },
  {
    key: 'done',
    text: (s) => `Researched! Every ${buildingName(guideType(s))} has it now, whatever its level. That pick locked the ${buildingName(guideType(s))} to its path, so its next tiers are that path's (the diamonds over a defense show them). Each RV Lab level unlocks the next tier.`,
    inWindow: 'research',
    advanceOn: 'next', showNext: true
  }
];

export function isLabGuideActive(state) {
  return (state.labGuideStep || 0) >= 1 && state.labGuideStep < LAB_GUIDE_DONE;
}

export function labGuideStep(state) {
  return isLabGuideActive(state) ? LAB_GUIDE_STEPS[state.labGuideStep] : null;
}

/** The current step's text. */
export function labGuideText(state) {
  const step = labGuideStep(state);
  if (!step) return '';
  return typeof step.text === 'function' ? step.text(state) : step.text;
}

/** The bubble shows by day only (not mid-attack), and only after the first tutorial is over. */
export function isLabGuideVisible(state) {
  return isLabGuideActive(state) && !!state.tutorialDone && !isWaveActive(state);
}

/** Hint for a window ('research') at the current step, or ''. */
export function labGuideHint(state, windowKind) {
  const step = labGuideStep(state);
  return step && step.inWindow === windowKind ? labGuideText(state) : '';
}

function setStep(state, n) {
  state.labGuideStep = n;
  emit(state, 'labGuideChanged', { step: n, done: n >= LAB_GUIDE_DONE });
}

/**
 * Start the guide when it's due: the first tutorial is done, the Village Hall has reached the RV Lab's
 * unlock level, the guide hasn't run yet, and nothing has been researched (so villages that already use
 * the lab skip it). A village that already has an RV Lab starts at "open it". Returns true if it started.
 */
export function startLabGuideIfDue(state) {
  if (!state.tutorialDone || (state.labGuideStep || 0) !== 0) return false;
  if (townHallLevel(state) < CONFIG.rvlab.unlockTownHall) return false;
  if (anyResearch(state)) { state.labGuideStep = LAB_GUIDE_DONE; return false; }
  setStep(state, state.buildings.some((b) => b.type === 'rvlab') ? 2 : 1);
  return true;
}

/** Feed the guide a game or UI event. Returns true when the step changed. */
export function advanceLabGuide(state, event, payload = {}) {
  const step = labGuideStep(state);
  if (!step) return false;
  // Doing a later step early (e.g. researching before ever opening the window from the guide) skips ahead.
  for (let n = state.labGuideStep; n < LAB_GUIDE_STEPS.length; n++) {
    const s = LAB_GUIDE_STEPS[n];
    if (s.advanceOn !== event || (s.when && !s.when(state, payload))) continue;
    if (event === 'next' && n !== state.labGuideStep) return false; // Next only finishes the step on show
    setStep(state, n + 1 >= LAB_GUIDE_STEPS.length ? LAB_GUIDE_DONE : n + 1);
    return true;
  }
  return false;
}

/** Skip button: the guide is over for this village. */
export function skipLabGuide(state) {
  if (!isLabGuideActive(state)) return false;
  setStep(state, LAB_GUIDE_DONE);
  return true;
}

/** Saved value is valid: missing (older saves), or an integer step from 0 to LAB_GUIDE_DONE. */
export function validLabGuide(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && (v < LAB_GUIDE_STEPS.length || v === LAB_GUIDE_DONE));
}
