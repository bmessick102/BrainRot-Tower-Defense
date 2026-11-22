// The 2x wave speed toggle: the step multiplier, the saved setting, and that a wave at 2x plays out the same.
import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../src/state/GameState.js';
import { stepsPerFrame, canFastForward, setFastForward, isFastForward, FAST_FACTOR } from '../src/logic/fastForward.js';
import { loadFastSetting, saveFastSetting, saveSettings, saveGraphicsSetting, loadSettings, loadGraphicsSetting } from '../src/logic/save.js';

const memStorage = () => {
  const mem = new Map();
  return { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
};

function newGame() {
  let seed = 7;
  const gs = new GameState({ storage: memStorage(), rng: () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; } });
  gs.startNew();
  gs.skipTutorial();
  const th = gs.buildings.find((b) => b.type === 'townHall');
  if (th.level === 0) { gs.gold = 1e9; gs.upgradeBuilding(th.id); } // rebuild the starting ruin: the clock only runs with a hall
  gs.gold = 1000;
  return gs;
}

describe('2x wave speed', () => {
  beforeEach(() => setFastForward(false));

  it('only doubles the steps while a wave is in progress and the toggle is on', () => {
    const gs = newGame();
    expect(stepsPerFrame(gs, true)).toBe(1); // idle: the day/night clock and building time stay at 1x
    gs.startWave();
    expect(canFastForward(gs)).toBe(true); // the countdown counts
    expect(stepsPerFrame(gs, false)).toBe(1);
    expect(stepsPerFrame(gs, true)).toBe(FAST_FACTOR);
    setFastForward(true);
    expect(isFastForward()).toBe(true);
    expect(stepsPerFrame(gs)).toBe(FAST_FACTOR);
    gs.gameOver = true;
    expect(stepsPerFrame(gs)).toBe(1);
  });

  it('is saved with the settings and kept by the other settings saves', () => {
    const st = memStorage();
    expect(loadFastSetting(st)).toBe(false);
    saveSettings(st, { music: 0.3, sfx: 0.4 });
    expect(JSON.parse(st.getItem('ibtd.settings')).fast).toBeUndefined();
    saveFastSetting(st, true);
    expect(loadFastSetting(st)).toBe(true);
    saveSettings(st, { music: 0.5, sfx: 0.6 });
    saveGraphicsSetting(st, 'low');
    expect(loadFastSetting(st)).toBe(true);
    expect(loadSettings(st)).toEqual({ music: 0.5, sfx: 0.6 });
    expect(loadGraphicsSetting(st)).toBe('low');
    saveFastSetting(st, false);
    expect(loadFastSetting(st)).toBe(false);
    expect(loadSettings(st).music).toBe(0.5);
    expect(loadFastSetting({ getItem: () => 'not json', setItem() {} })).toBe(false);
  });

  it('a wave at 2x ends in the same state as at 1x in about half the frames', () => {
    const run = (on) => {
      const gs = newGame();
      gs.startWave();
      gs.startWaveNow();
      let frames = 0;
      while (gs.wave.phase !== 'idle' && !gs.gameOver && frames < 20000) {
        for (let i = stepsPerFrame(gs, on); i > 0; i--) gs.update(0.05);
        frames++;
      }
      return { frames, cleared: gs.wavesCleared, gold: gs.gold, over: gs.gameOver, phase: gs.wave.phase, t: gs.clock.t };
    };
    const slow = run(false), fast = run(true);
    expect(slow.frames).toBeGreaterThan(20); // a real wave, not an instant end
    expect(slow.phase).not.toBe('active');
    expect(fast.cleared).toBe(slow.cleared);
    expect(fast.gold).toBe(slow.gold);
    expect(fast.over).toBe(slow.over);
    expect(fast.frames).toBeLessThanOrEqual(Math.ceil(slow.frames / 2) + 1);
    expect(fast.frames).toBeGreaterThanOrEqual(Math.floor(slow.frames / 2) - 1);
  });
});
