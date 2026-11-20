import { describe, it, expect, afterEach } from 'vitest';
import { LowFpsWatch, isLowQuality, qualityMode, setQualityMode, setAutoLow, autoSwitchedLow, onQualityChange } from '../src/quality.js';
import { arcPoints, circleSegments, scaledParticleCount, installPhaserPerf, LOW_PARTICLE_SHARE } from '../src/phaserPerf.js';
import { loadSettings, saveSettings, loadGraphicsSetting, saveGraphicsSetting, SAVE_KEYS } from '../src/logic/save.js';
import { floatText, FLOAT_MAX } from '../src/objects/Effects.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** Feed `seconds` of frames at `fps`; returns how many times the watch fired. */
function run(watch, fps, seconds) {
  let fired = 0;
  for (let t = 0; t < seconds * 1000; t += 1000 / fps) if (watch.feed(1000 / fps)) fired++;
  return fired;
}

afterEach(() => { setQualityMode('auto'); setAutoLow(false); });

describe('graphics quality setting', () => {
  it('auto starts high, auto-low switches it (and tells listeners); a chosen mode wins', () => {
    expect(qualityMode()).toBe('auto');
    expect(isLowQuality()).toBe(false);
    const seen = [];
    const off = onQualityChange((low) => seen.push(low));
    setAutoLow(true);
    expect(isLowQuality()).toBe(true);
    expect(autoSwitchedLow()).toBe(true);
    setQualityMode('high');
    expect(isLowQuality()).toBe(false);
    setQualityMode('low');
    expect(isLowQuality()).toBe(true);
    setQualityMode('nonsense'); // unknown -> auto (still auto-low this session)
    expect(qualityMode()).toBe('auto');
    off();
    setAutoLow(false);
    expect(seen).toEqual([true, false, true]); // only real changes, and none after off()
  });

  it('is saved with the settings: volume saves keep it, and it keeps the volumes', () => {
    const s = memoryStorage();
    expect(loadGraphicsSetting(s)).toBe('auto');
    saveSettings(s, { music: 0.3, sfx: 0.6 });
    saveGraphicsSetting(s, 'low');
    expect(loadGraphicsSetting(s)).toBe('low');
    expect(loadSettings(s)).toEqual({ music: 0.3, sfx: 0.6 });
    saveSettings(s, { music: 0.9, sfx: 0.1 }); // the volume sliders save without knowing about graphics
    expect(loadGraphicsSetting(s)).toBe('low');
    expect(loadSettings(s)).toEqual({ music: 0.9, sfx: 0.1 });
    s.setItem(SAVE_KEYS.settings, JSON.stringify({ music: 0.5, sfx: 0.5, graphics: 'ultra' }));
    expect(loadGraphicsSetting(s)).toBe('auto');
    s.setItem(SAVE_KEYS.settings, '{broken');
    expect(loadGraphicsSetting(s)).toBe('auto');
    expect(loadGraphicsSetting(null)).toBe('auto');
  });
});

describe('slow-device detector (auto quality)', () => {
  it('never fires at a smooth frame rate', () => {
    expect(run(new LowFpsWatch(), 60, 60)).toBe(0);
    expect(run(new LowFpsWatch(), 35, 60)).toBe(0);
  });

  it('fires once after the frame rate stays low for its seconds (after the warm-up)', () => {
    const w = new LowFpsWatch({ lowFps: 30, seconds: 8, warmupMs: 5000 });
    expect(run(w, 20, 12)).toBe(0); // 5 s warm-up + 7 s low: not yet
    expect(run(w, 20, 2)).toBe(1);
    expect(run(w, 5, 30)).toBe(0); // only once
  });

  it('a good second in between starts the count again', () => {
    const w = new LowFpsWatch({ lowFps: 30, seconds: 8, warmupMs: 0 });
    for (let i = 0; i < 10; i++) { expect(run(w, 20, 6)).toBe(0); run(w, 60, 1.5); }
  });

  it('long hitches (loading, tab switches) are ignored, even very slow devices count', () => {
    const w = new LowFpsWatch({ lowFps: 30, seconds: 4, warmupMs: 0 });
    for (let i = 0; i < 50; i++) expect(w.feed(5000)).toBe(false);
    expect(run(w, 4, 10)).toBe(1); // 250 ms frames are real slowness
  });
});

describe('Phaser patches', () => {
  it('arcs get points by size, ending exactly where Phaser\'s do', () => {
    expect(circleSegments(0)).toBe(12);
    expect(circleSegments(12)).toBe(28);
    expect(circleSegments(1e6)).toBe(100); // never more than Phaser's 100
    const quarter = arcPoints(10, 20, 12, -Math.PI / 2, 0);
    expect(quarter.length / 2).toBeLessThan(10);
    expect(quarter[0]).toBeCloseTo(10); expect(quarter[1]).toBeCloseTo(8);
    expect(quarter.at(-2)).toBeCloseTo(22); expect(quarter.at(-1)).toBeCloseTo(20);
    // Anticlockwise from 0 to -PI/2 goes the short way round (up), like Phaser.
    const anti = arcPoints(0, 0, 10, 0, -Math.PI / 2, true);
    expect(anti[3]).toBeLessThan(0);
    expect(anti.at(-1)).toBeCloseTo(-10);
    // A full circle closes, and is within 0.1 px of the true curve between points at every size.
    for (const r of [2, 6, 12, 40, 100, 300]) {
      const c = arcPoints(0, 0, r, 0, Math.PI * 2);
      expect(c.at(-2)).toBeCloseTo(c[0]); expect(c.at(-1)).toBeCloseTo(c[1]);
      const n = c.length / 2 - 1;
      expect(r * (1 - Math.cos(Math.PI / n))).toBeLessThan(r <= 100 ? 0.1 : 0.2);
    }
    // Bad input never makes NaN points.
    expect(arcPoints(0, 0, NaN, 0, 1).every(Number.isFinite)).toBe(true);
  });

  it('low quality emits a share of the particles', () => {
    expect(scaledParticleCount(10, 1)).toBe(10);
    expect(scaledParticleCount(10, 0.4, 0.99)).toBe(4);
    expect(scaledParticleCount(0, 0.4)).toBe(0);
    expect(scaledParticleCount(1, 0.4, 0.1)).toBe(1);
    expect(scaledParticleCount(1, 0.4, 0.9)).toBe(0);
    let n = 0;
    for (let i = 0; i < 1000; i++) n += scaledParticleCount(1, LOW_PARTICLE_SHARE, i / 1000);
    expect(n).toBe(400);
  });

  it('installs on Phaser-like classes: arcs become lines, emitters thin out in low quality', () => {
    class Graphics { constructor() { this.cmds = []; } lineTo(x, y) { this.cmds.push([x, y]); return this; } }
    class ParticleEmitter { constructor() { this.emitted = 0; this.ops = { quantity: { onEmit: () => 10 } }; } emitParticle(count) { this.emitted += count ?? this.ops.quantity.onEmit(); return 'p'; } }
    let low = false;
    expect(installPhaserPerf({ GameObjects: { Graphics, Particles: { ParticleEmitter } } }, () => low)).toBe(true);
    const g = new Graphics();
    expect(g.arc(0, 0, 12, 0, Math.PI)).toBe(g);
    expect(g.cmds.length).toBeGreaterThan(3);
    expect(g.cmds.length).toBeLessThan(20);
    const e = new ParticleEmitter();
    e.emitParticle(10); e.emitParticle();
    expect(e.emitted).toBe(20);
    low = true;
    for (let i = 0; i < 100; i++) e.emitParticle(10);
    expect(e.emitted).toBe(20 + 400);
  });
});

describe('floating texts', () => {
  function fakeScene() {
    const tweens = [];
    const make = () => {
      const t = { scene: true, visible: true };
      for (const m of ['setOrigin', 'setDepth', 'setStyle', 'setText', 'setPosition', 'setAlpha', 'setVisible']) t[m] = (v) => { if (m === 'setVisible') t.visible = v; return t; };
      t.destroy = () => { t.scene = null; };
      return t;
    };
    const scene = { created: 0, tweens: { add: (c) => tweens.push(c) }, events: { once() {} }, add: { text: () => { scene.created++; return make(); } } };
    return { scene, finish: () => { for (const c of tweens.splice(0)) c.onComplete(); } };
  }

  it('caps small numbers in a busy fight (fewer in low quality), keeps call-outs, and reuses texts', () => {
    const { scene, finish } = fakeScene();
    for (let i = 0; i < 100; i++) floatText(scene, 0, 0, '12', '#fff', 12);
    expect(scene.created).toBe(FLOAT_MAX.high);
    expect(floatText(scene, 0, 0, 'LAST STAND!', '#f00', 20)).not.toBeNull();
    finish();
    for (let i = 0; i < 30; i++) floatText(scene, 0, 0, '7', '#fff', 12);
    expect(scene.created).toBe(FLOAT_MAX.high + 1); // all reused
    finish();
    setQualityMode('low');
    let shown = 0;
    for (let i = 0; i < 100; i++) if (floatText(scene, 0, 0, '3', '#fff', 12)) shown++;
    expect(shown).toBe(FLOAT_MAX.low);
  });
});

describe('remembered shapes', () => {
  it('arcs: the same corner anywhere gives the same shape, moved', async () => {
    const a = arcPoints(0, 0, 12, -Math.PI / 2, 0), b = arcPoints(100, 50, 12, -Math.PI / 2, 0);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i += 2) { expect(b[i]).toBeCloseTo(a[i] + 100); expect(b[i + 1]).toBeCloseTo(a[i + 1] + 50); }
  });

  it('triangulations are reused for the same points, and never for different ones', async () => {
    const { cachedTriangles } = await import('../src/phaserPerf.js');
    let calls = 0;
    const earcut = (c) => { calls++; return [0, 1, 2, c.length]; };
    const sq = [0, 0, 10, 0, 10, 10, 0, 10];
    const r1 = cachedTriangles([...sq], earcut);
    const r2 = cachedTriangles([...sq], earcut);
    expect(r2).toBe(r1);
    expect(calls).toBe(1);
    cachedTriangles([0, 0, 10, 0, 10, 10, 0, 10.001], earcut); // a hair different: worked out again
    expect(calls).toBe(2);
  });
});
