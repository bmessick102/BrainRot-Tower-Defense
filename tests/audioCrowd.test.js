// Crowded audio (v0.12.5, src/audio.js): at most MAX_LIVE_SFX (18) effects play at once (a big wave at 4x crackled, then
// went silent), and keepAudioAlive wakes an audio context the browser suspended.
import { describe, it, expect, vi } from 'vitest';
import { playSfx, liveSfxCount, keepAudioAlive, playMusic, stopMusic, releaseMusic, notifyGuideMessage, setSfxLevel } from '../src/audio.js';

function fakeScene() {
  const sounds = [];
  const scene = {
    cache: { audio: { exists: () => true } },
    sound: {
      locked: false,
      add: (key) => {
        const s = { key, manager: {}, pendingRemove: false, isPlaying: false, isPaused: false, handlers: {},
          once(ev, fn) { (this.handlers[ev] ||= []).push(fn); return this; }, play() { this.isPlaying = true; },
          setVolume() {}, stop() { this.isPlaying = false; }, destroy() { this.pendingRemove = true; } };
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

  it('plays a guide message once, swaps sounds without overlapping, and respects mute', () => {
    const { scene, sounds } = fakeScene();
    scene.sys = { isActive: () => true };
    scene.sound.getAll = (key) => sounds.filter((sound) => sound.key === key);
    const village = {};
    notifyGuideMessage(scene, village, 'tutorial-1');
    notifyGuideMessage(scene, village, 'tutorial-1');
    expect(sounds).toHaveLength(1);
    notifyGuideMessage(scene, village, 'tutorial-2');
    expect(sounds).toHaveLength(2);
    expect(sounds[0].isPlaying).toBe(false);
    notifyGuideMessage(scene, village, 'tutorial-1');
    expect(sounds).toHaveLength(2);
    try {
      setSfxLevel(0);
      notifyGuideMessage(scene, village, 'lab-1');
      expect(sounds).toHaveLength(2);
    } finally {
      setSfxLevel(1);
    }
  });

  it('unlocks a streamed HTML5 track on the next gesture and keeps the audio tag for a return visit', () => {
    const { scene, sounds } = fakeScene();
    scene.cache.audio.get = () => [{ dataset: { locked: 'true' } }];
    scene.cache.audio.remove = vi.fn();
    scene.sound.unlock = vi.fn();
    try {
      playMusic(scene, 'music_title');
      playMusic(scene, 'music_title');
      expect(scene.sound.unlock).toHaveBeenCalledOnce();
      expect(sounds).toHaveLength(1);
    } finally {
      stopMusic();
    }
    releaseMusic(scene, 'music_title');
    expect(scene.cache.audio.remove).not.toHaveBeenCalled();
  });

  it('drops pending HTML5 actions only for a track destroyed before audio unlock', () => {
    const { scene, sounds } = fakeScene();
    scene.cache.audio.get = () => [{ dataset: { locked: 'true' } }];
    scene.sound.unlock = vi.fn();
    playMusic(scene, 'music_title');
    const manager = sounds[0].manager;
    const unrelated = {};
    manager.lockedActionsQueue = [{ sound: sounds[0], prop: 'play' }, { sound: unrelated, prop: 'play' }];
    stopMusic();
    expect(manager.lockedActionsQueue).toEqual([{ sound: unrelated, prop: 'play' }]);
  });
});
