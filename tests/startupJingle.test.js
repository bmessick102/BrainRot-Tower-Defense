// The startup jingle (v0.15): index.html starts it as the page loads and keeps its state in window.__ibtdJingle;
// src/audio.js holds the title music and the loading screen (whenJingleDone) until it ends, and drops a jingle still
// waiting for the first click once a village's music starts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { playMusic, whenJingleDone, setMusicLevel, AFTER_JINGLE_MS } from '../src/audio.js';

/** A stand-in for index.html's window.__ibtdJingle. */
function fakeJingle(state) {
  const j = { state, audio: { volume: 1, paused: false, pause() { this.paused = true; } }, waiters: [] };
  j.finish = () => { if (j.state === 'done') return; j.state = 'done'; j.waiters.splice(0).forEach((fn) => fn()); };
  j.cancel = () => j.finish();
  j.stop = () => { j.audio.pause(); j.finish(); };
  globalThis.__ibtdJingle = j;
  return j;
}

function fakeScene() {
  const sounds = [];
  const sound = {
    locked: false,
    add: (key) => {
      const s = { key, manager: sound, pendingRemove: false, isPlaying: false,
        once() { return this; }, play() { this.isPlaying = true; }, setVolume() {}, stop() { this.isPlaying = false; },
        destroy() { this.pendingRemove = true; this.isPlaying = false; } };
      sounds.push(s);
      return s;
    }
  };
  const scene = { cache: { audio: { exists: () => true, get: () => null } }, sound, sys: { isActive: () => true } };
  return { scene, playing: () => sounds.filter((s) => s.isPlaying).map((s) => s.key) };
}

afterEach(() => { delete globalThis.__ibtdJingle; vi.useRealTimers(); });

describe('startup jingle', () => {
  it('holds the title music and the loading screen until it ends, plus a short pause', () => {
    vi.useFakeTimers();
    const j = fakeJingle('playing');
    const { scene, playing } = fakeScene();
    const loaded = vi.fn();
    whenJingleDone(loaded);
    playMusic(scene, 'music_title');
    expect(playing()).toEqual([]);
    expect(loaded).not.toHaveBeenCalled();
    j.finish();
    vi.advanceTimersByTime(AFTER_JINGLE_MS - 1);
    expect(playing()).toEqual([]);
    expect(loaded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(playing()).toEqual(['music_title']);
    expect(loaded).toHaveBeenCalledOnce();
  });

  it('a jingle that ended a while ago adds no wait; one that just ended waits out the pause', () => {
    vi.useFakeTimers();
    const j = fakeJingle('done');
    const loaded = vi.fn();
    j.endedAt = performance.now() - AFTER_JINGLE_MS - 10;
    whenJingleDone(loaded);
    expect(loaded).toHaveBeenCalledOnce();
    j.endedAt = performance.now();
    whenJingleDone(loaded);
    expect(loaded).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(AFTER_JINGLE_MS);
    expect(loaded).toHaveBeenCalledTimes(2);
  });

  it('never holds the loading screen for good', () => {
    vi.useFakeTimers();
    fakeJingle('playing');
    const loaded = vi.fn();
    whenJingleDone(loaded, 8000);
    vi.advanceTimersByTime(7999);
    expect(loaded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(loaded).toHaveBeenCalledOnce();
  });

  it('waiting for the first click: the loading screen goes on, the title music waits, a village drops the jingle', () => {
    const j = fakeJingle('waiting');
    const { scene, playing } = fakeScene();
    const loaded = vi.fn();
    whenJingleDone(loaded);
    expect(loaded).toHaveBeenCalledOnce();
    playMusic(scene, 'music_title');
    expect(playing()).toEqual([]);
    playMusic(scene, 'music_village');
    expect(j.state).toBe('done');
    expect(playing()).toEqual(['music_village']);
  });

  it('blocked until the first tap: the loading screen can wait for that tap, the jingle and the pause', () => {
    vi.useFakeTimers();
    const j = fakeJingle('waiting');
    const loaded = vi.fn();
    whenJingleDone(loaded, 8000, { waitForTap: true });
    vi.advanceTimersByTime(60000); // (no tap yet: it waits as long as it takes)
    expect(loaded).not.toHaveBeenCalled();
    j.state = 'playing'; // the tap (index.html plays it)
    j.finish();
    vi.advanceTimersByTime(AFTER_JINGLE_MS);
    expect(loaded).toHaveBeenCalledOnce();
  });

  it('no jingle (or Music at 0): nothing waits', () => {
    const { scene, playing } = fakeScene();
    const loaded = vi.fn();
    whenJingleDone(loaded);
    playMusic(scene, 'music_title');
    expect(loaded).toHaveBeenCalledOnce();
    expect(playing()).toEqual(['music_title']);
  });

  it('follows the Music slider, and 0 stops it', () => {
    const j = fakeJingle('playing');
    setMusicLevel(0.4);
    expect(j.audio.volume).toBeCloseTo(0.4);
    setMusicLevel(0);
    expect(j.audio.paused).toBe(true);
    expect(j.state).toBe('done');
    setMusicLevel(0.7);
  });
});
