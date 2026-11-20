import { describe, it, expect } from 'vitest';
import { ABILITY_COSTS } from '../src/abilityConfig.js';
import { LAB_GUIDE_DONE, labGuideStep, isLabGuideVisible, labGuideHint, startLabGuideIfDue } from '../src/logic/labGuide.js';
import { checkResearch } from '../src/logic/abilities.js';
import { createBuilding } from '../src/logic/buildings.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** A village past the first tutorial, Village Hall at `vh`, two storages at its level for gold room. */
function village(vh = 3) {
  const gs = new GameState({ storage: memoryStorage() });
  gs.startNew();
  gs.tutorialDone = true;
  gs.tutorialStep = 10;
  gs.buildings[0].level = vh;
  for (const [c, r] of [[5, 22], [8, 22]]) gs.buildings.push(createBuilding(gs, 'storage', c, r, vh));
  gs.gold = gs.capacity;
  gs.researchPoints = 1000;
  return gs;
}
const add = (gs, type, col, row, level = 1) => { const b = createBuilding(gs, type, col, row, level); gs.buildings.push(b); return b; };
const key = (gs) => labGuideStep(gs)?.key ?? null;

describe('RV Lab guide', () => {
  it('starts when the Village Hall reaches level 4 (the RV Lab unlocks)', () => {
    const gs = village(3);
    expect(gs.labGuideStep).toBe(0);
    gs.buildings[0].level = 4;
    gs.emit('townHallUpgraded', { level: 4 });
    expect(key(gs)).toBe('build');
    expect(isLabGuideVisible(gs)).toBe(true);
  });

  it('walks through build -> open -> research (free, applied to every cannon) -> done', () => {
    const gs = village(3);
    gs.buildings[0].level = 4;
    gs.emit('townHallUpgraded', { level: 4 });
    const cannon = add(gs, 'cannon', 9, 16, 2);
    gs.emit('buildingPlaced', { id: cannon.id, type: 'cannon' });
    expect(key(gs)).toBe('build'); // not the RV Lab
    const lab = add(gs, 'rvlab', 12, 24, 1);
    gs.emit('buildingPlaced', { id: lab.id, type: 'rvlab' });
    expect(key(gs)).toBe('open');
    gs.emit('researchOpened', {});
    expect(key(gs)).toBe('research');
    expect(labGuideHint(gs, 'research')).toMatch(/free/i);
    // The first research is free while the guide runs.
    expect(checkResearch(gs, 'cannon', 'a').cost).toBe(0);
    const rp = gs.researchPoints;
    expect(gs.researchAbility('cannon', 'a').ok).toBe(true);
    expect(gs.researchPoints).toBe(rp);
    expect(checkResearch(gs, 'archer', 'b').cost).toBe(ABILITY_COSTS.research[0]); // only the first
    expect(cannon.picks).toEqual(['a']); // no buying: the cannon already has it
    expect(key(gs)).toBe('done');
    expect(labGuideHint(gs, 'research')).toMatch(/every Cannon has it now, whatever its level/i);
    gs.labGuideNext();
    expect(gs.labGuideStep).toBe(LAB_GUIDE_DONE);
    expect(isLabGuideVisible(gs)).toBe(false);
  });

  it('hides during attacks, never starts during the first tutorial, and Skip ends it', () => {
    const gs = village(4);
    gs.tutorialDone = false;
    expect(startLabGuideIfDue(gs)).toBe(false);
    gs.tutorialDone = true;
    expect(startLabGuideIfDue(gs)).toBe(true);
    gs.wave.phase = 'active';
    expect(isLabGuideVisible(gs)).toBe(false);
    gs.wave.phase = 'idle';
    expect(gs.skipLabGuide()).toBe(true);
    expect(gs.labGuideStep).toBe(LAB_GUIDE_DONE);
    gs.emit('townHallUpgraded', { level: 5 });
    expect(gs.labGuideStep).toBe(LAB_GUIDE_DONE); // never again
  });

  it('existing villages: VH4+ with no research get it on load (at "open" if they own a lab); with research, never', () => {
    const gs = village(6);
    add(gs, 'rvlab', 12, 24, 2);
    const obj = serializeGame(gs);
    delete obj.labGuide; // a save from before the guide
    const a = new GameState({ storage: memoryStorage() });
    a.loadFromSave(parseSave(JSON.stringify(obj)).data);
    expect(key(a)).toBe('open');

    obj.research = { cannon: 'a' };
    const b = new GameState({ storage: memoryStorage() });
    b.loadFromSave(parseSave(JSON.stringify(obj)).data);
    expect(b.labGuideStep).toBe(LAB_GUIDE_DONE);
  });

  it('saves its step', () => {
    const gs = village(4);
    startLabGuideIfDue(gs);
    const saved = serializeGame(gs);
    expect(saved.labGuide).toBe(1);
    const back = new GameState({ storage: memoryStorage() });
    back.loadFromSave(parseSave(JSON.stringify(saved)).data);
    expect(key(back)).toBe('build');
    expect(parseSave(JSON.stringify({ ...saved, labGuide: 50 })).status).toBe('invalid');
  });
});
