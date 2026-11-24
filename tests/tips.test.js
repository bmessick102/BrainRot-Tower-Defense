import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { currentTip, TIP_KEYS, validTips } from '../src/logic/tips.js';
import { serializeGame, parseSave } from '../src/logic/save.js';
import { GameState } from '../src/state/GameState.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
function village({ done = true, vh = 3 } = {}) {
  const gs = new GameState({ storage: memoryStorage() });
  gs.startNew();
  gs.buildings[0].level = vh;
  gs.tutorialDone = done;
  gs.tutorialStep = done ? 10 : 5;
  gs.labGuideStep = 99;
  return gs;
}

describe('first-time tips', () => {
  it('each system brings up its tip the first time it shows (after the tutorial)', () => {
    const gs = village();
    expect(currentTip(gs)).toBeNull();
    gs.emit('researchPointsChanged', { added: 2 });
    expect(currentTip(gs).key).toBe('rp');
    gs.emit('restlessChanged', { restless: true });
    gs.emit('editModeChanged', { active: true });
    expect(gs.tipQueue).toEqual(['rp', 'restless', 'layout']); // they wait their turn
    gs.dismissTip();
    expect(currentTip(gs).key).toBe('restless');
    expect(currentTip(gs).text).toMatch(/restless/);
    gs.dismissTip(); gs.dismissTip();
    expect(currentTip(gs)).toBeNull();
    gs.emit('researchPointsChanged', { added: 2 }); // seen: never again
    expect(currentTip(gs)).toBeNull();
  });

  it('warns about what is coming next: themed waves or Da Baby Car', () => {
    const gs = village({ vh: 7 });
    gs.wavesCleared = 4; // wave 5: themed
    gs.emit('baseReset', {});
    expect(gs.tipQueue).toContain('themes');
    const g2 = village({ vh: 7 });
    g2.wavesCleared = 21; // wave 22: a Da Baby Car wave (every 2nd from wave 18)
    g2.tipsSeen = ['themes', 'pork', 'toilet', 'skeleton', 'vaca', 'bicus', 'frigo', 'shakeCollector']; // (those came up already)
    g2.emit('townHallUpgraded', { level: 7 });
    expect(g2.tipQueue).toContain('boss');
    expect(currentTip(g2).text).toMatch(CONFIG.enemies.babycar.name);
  });

  it('none during the first tutorial; "No more tips" turns them all off', () => {
    const t = village({ done: false });
    t.emit('researchPointsChanged', { added: 2 });
    expect(currentTip(t)).toBeNull();
    const gs = village();
    gs.emit('researchPointsChanged', { added: 2 });
    gs.hideAllTips();
    expect(currentTip(gs)).toBeNull();
    expect(gs.tipsSeen.sort()).toEqual([...TIP_KEYS].sort());
  });

  it('seen tips are saved with the village; older saves have none seen; bad values are rejected', () => {
    const gs = village();
    gs.emit('researchPointsChanged', { added: 2 });
    gs.dismissTip();
    const saved = serializeGame(gs);
    expect(saved.tips).toBe('rp');
    const back = new GameState({ storage: memoryStorage() });
    back.loadFromSave(parseSave(JSON.stringify(saved)).data);
    expect(back.tipsSeen).toEqual(['rp']);
    delete saved.tips;
    expect(parseSave(JSON.stringify(saved)).status).toBe('ok');
    expect(validTips('rp,stars')).toBe(true);
    expect(validTips(5)).toBe(false);
    expect(validTips('<script>')).toBe(false);
  });
});
