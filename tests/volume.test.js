import { describe, it, expect } from 'vitest';
import { clamp01, scaleVolume, musicTrackVolume, ambienceVolumes } from '../src/logic/volume.js';

describe('volume helpers', () => {
  it('clamps and treats junk as silent', () => {
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(NaN)).toBe(0);
    expect(clamp01(undefined)).toBe(0);
  });
  it('level 0 is silence, never full volume', () => {
    expect(scaleVolume(1, 0)).toBe(0);
    expect(scaleVolume(0.45, 0)).toBe(0);
    expect(scaleVolume(undefined, 0)).toBe(0);
    expect(scaleVolume(0.5, 0.5)).toBe(0.25);
    expect(scaleVolume(undefined, 1)).toBe(1);
  });
  it('music tracks follow the Music level and the fade factor', () => {
    expect(musicTrackVolume(0.45, 2.2, 1)).toBeCloseTo(0.99);
    expect(musicTrackVolume(0.45, 2.2, 0)).toBe(0);
    expect(musicTrackVolume(0.45, 1, 1, 0)).toBe(0);
    expect(musicTrackVolume(0.45, 1, 0.5, 0.5)).toBeCloseTo(0.1125);
  });
  it('ambience beds are silent at level 0 or presence 0 and split by night', () => {
    expect(ambienceVolumes(0.45, 0, 1, 0.5)).toEqual({ day: 0, night: 0 });
    expect(ambienceVolumes(0.45, 1, 0, 0.5)).toEqual({ day: 0, night: 0 });
    const v = ambienceVolumes(0.45, 1, 1, 0.25);
    expect(v.day).toBeCloseTo(0.3375);
    expect(v.night).toBeCloseTo(0.1125);
  });
});

import { loadSettings, saveSettings } from '../src/logic/save.js';

describe('saved volume settings', () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
  it('keeps 0 as 0 after a reload (not the 0.7 default)', () => {
    const s = mem();
    saveSettings(s, { music: 0, sfx: 0 });
    expect(loadSettings(s)).toEqual({ music: 0, sfx: 0 });
  });
});
