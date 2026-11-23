// F.L.O.C.K Mothership's Triple Zap beams (src/objects/ZapFx.js, v0.8.5): one straight beam per target, from the tower's
// emitter to the target's body, following it while it moves, gone after LIFE_MS.
import { describe, it, expect } from 'vitest';
import { ZapFx, LIFE_MS } from '../src/objects/ZapFx.js';

/** A stand-in Phaser scene: graphics that record their straight lines, and views for one tower and its targets. */
function fakeScene() {
  const lines = [];
  const g = new Proxy({}, { get: (_, k) => (k === 'lineBetween' ? (...a) => { lines.push(a); return g; } : () => g) });
  const sprite = (x, y, h) => ({ x, y, displayHeight: h, visible: true });
  const views = {
    buildings: new Map([['f1', { sprite: {}, topCenter: () => ({ x: 100, y: 50 }) }]]),
    enemies: new Map([['e1', { sprite: sprite(200, 140, 40) }], ['e2', { sprite: sprite(60, 160, 40) }]])
  };
  return { scene: { add: { graphics: () => g }, views, time: { now: 0 } }, lines, views };
}

describe('Triple Zap beams', () => {
  it('a straight beam from the emitter to each target\'s body', () => {
    const { scene, lines } = fakeScene();
    const fx = new ZapFx(scene);
    fx.add({ sourceId: 'f1', hits: [{ id: 'e1', x: 0, y: 0 }, { id: 'e2', x: 0, y: 0 }] }, 0);
    fx.update(10);
    const beams = lines.filter((l) => l[0] === 100 && l[1] === 60); // from the emitter (10 px under the top)
    expect(beams.some((l) => l[2] === 200 && l[3] === 120)).toBe(true); // e1's body (half its height up)
    expect(beams.some((l) => l[2] === 60 && l[3] === 140)).toBe(true);  // e2's
  });

  it('follows a moving target, and is gone after its life', () => {
    const { scene, lines, views } = fakeScene();
    const fx = new ZapFx(scene);
    fx.add({ sourceId: 'f1', hits: [{ id: 'e1', x: 0, y: 0 }] }, 0);
    views.enemies.get('e1').sprite.x = 230;
    fx.update(100);
    expect(lines.some((l) => l[0] === 100 && l[2] === 230)).toBe(true);
    lines.length = 0;
    fx.update(LIFE_MS + 1);
    expect(fx.zaps).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});
