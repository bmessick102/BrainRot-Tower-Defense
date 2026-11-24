// Crowded audio (v0.12.5, src/audio.js): at most MAX_LIVE_SFX (18) effects play at once (a big wave at 4x crackled, then
// went silent), and keepAudioAlive wakes an audio context the browser suspended.
import { describe, it, expect } from 'vitest';
import { playSfx, liveSfxCount, keepAudioAlive } from '../src/audio.js';

function fakeScene() {
  const sounds = [];
  const scene = {
    cache: { audio: { exists: () => true } },
    sound: {
      locked: false,
      add: (key) => {
        const s = { key, manager: {}, pendingRemove: false, isPlaying: false, isPaused: false, handlers: {},
          once(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }, play() { this.isPlaying = true; },
          setVolume() {}, destroy() { this.pendingRemove = true; } };
        sounds.push(s);
        return s;
      }
    }
  };
  return { scene, sounds };
}

describe('crowded sound effects', () => {
  it('at most 18 effects play at once; finished ones make room again', () => {
    const { scene, sounds } = fakeScene();
    for (let i = 0; i < 30; i++) playSfx(scene, `sfx_crowd_${i}`);
    expect(sounds.filter((s) => s.isPlaying)).toHaveLength(18);
    expect(liveSfxCount()).toBe(18);
    for (const s of sounds) { s.isPlaying = false; (s.handlers.complete || []).forEach((fn) => fn()); }
    expect(liveSfxCount()).toBe(0);
    playSfx(scene, 'sfx_crowd_after');
    expect(sounds.at(-1).key).toBe('sfx_crowd_after');
  });

  it('keepAudioAlive resumes a suspended audio context, but not before the first click', () => {
    let resumed = 0;
    const ctx = { state: 'suspended', resume: () => { resumed++; return Promise.resolve(); } };
    keepAudioAlive({ sound: { locked: true, context: ctx } });
    expect(resumed).toBe(0);
    keepAudioAlive({ sound: { locked: false, context: ctx } });
    expect(resumed).toBe(1);
    ctx.state = 'running';
    keepAudioAlive({ sound: { locked: false, context: ctx } });
    expect(resumed).toBe(1);
  });
});
