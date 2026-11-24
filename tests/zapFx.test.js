// The Triple Zap's lightning bolts (src/objects/ZapFx.js; a straight tesla beam v0.8.5, a jagged bolt since v0.12): one
// bolt per target, from the tower's emitter to the target's body, following it while it moves, gone after LIFE_MS. The
// Locklair Mage's staff zaps use the same effect in purple, from his staff's crystal (the building's muzzle point).
import { describe, it, expect } from 'vitest';
import { ZapFx, LIFE_MS, MAGE_ZAP_COLORS } from '../src/objects/ZapFx.js';

/** A stand-in Phaser scene: graphics that record the polylines they stroke (and the colors), and views for a tower and its targets. */
function fakeScene(muzzle = null) {
  const polys = [];
  let color = null;
  const g = new Proxy({}, {
    get: (_, k) => (k === 'strokePoints' ? (pts) => { polys.push({ pts: pts.map((p) => ({ ...p })), color }); return g; }
      : k === 'lineStyle' ? (w, c) => { color = c; return g; } : () => g)
  });
  const sprite = (x, y, h) => ({ x, y, displayHeight: h, visible: true });
  const views = {
    buildings: new Map([['f1', { sprite: {}, topCenter: () => ({ x: 100, y: 50 }), muzzlePoint: () => muzzle }]]),
    enemies: new Map([['e1', { sprite: sprite(200, 140, 40) }], ['e2', { sprite: sprite(60, 160, 40) }]])
  };
  return { scene: { add: { graphics: () => g }, views, time: { now: 0 } }, polys, views };
}
const ends = (poly) => [poly.pts[0], poly.pts[poly.pts.length - 1]];
const bolts = (polys, from, to) => polys.filter((p) => { const [a, b] = ends(p); return a.x === from.x && a.y === from.y && Math.abs(b.x - to.x) < 1e-9 && Math.abs(b.y - to.y) < 1e-9; });

describe('Triple Zap bolts', () => {
  it('a jagged bolt from the emitter to each target\'s body', () => {
    const { scene, polys } = fakeScene();
    const fx = new ZapFx(scene);
    fx.add({ sourceId: 'f1', hits: [{ id: 'e1', x: 0, y: 0 }, { id: 'e2', x: 0, y: 0 }] }, 0);
    fx.update(10);
    const from = { x: 100, y: 60 }; // the emitter: 10 px under the top
    const toE1 = bolts(polys, from, { x: 200, y: 120 }); // e1's body (half its height up)
    expect(toE1.length).toBeGreaterThan(0);
    expect(bolts(polys, from, { x: 60, y: 140 }).length).toBeGreaterThan(0); // e2's
    // It zigzags: some kink is off the straight line.
    const off = (p) => Math.abs((p.x - 100) * (120 - 60) - (p.y - 60) * (200 - 100)) / Math.hypot(100, 60);
    expect(toE1[0].pts.some((p) => off(p) > 1)).toBe(true);
  });

  it('follows a moving target, and is gone after its life', () => {
    const { scene, polys, views } = fakeScene();
    const fx = new ZapFx(scene);
    fx.add({ sourceId: 'f1', hits: [{ id: 'e1', x: 0, y: 0 }] }, 0);
    views.enemies.get('e1').sprite.x = 230;
    fx.update(100);
    expect(polys.some((p) => ends(p)[1].x === 230)).toBe(true);
    polys.length = 0;
    fx.update(LIFE_MS + 1);
    expect(fx.zaps).toHaveLength(0);
    expect(polys).toHaveLength(0);
  });

  it('the Locklair Mage\'s zap: purple, from his picture\'s muzzle point (the staff crystal)', () => {
    const { scene, polys } = fakeScene({ x: 140, y: 20 });
    const fx = new ZapFx(scene, { colors: MAGE_ZAP_COLORS });
    fx.add({ sourceId: 'f1', hits: [{ id: 'e1', x: 0, y: 0 }] }, 0);
    fx.update(10);
    const b = bolts(polys, { x: 140, y: 20 }, { x: 200, y: 120 });
    expect(b.length).toBeGreaterThan(0);
    expect(b.some((p) => p.color === MAGE_ZAP_COLORS.glow)).toBe(true);
  });
});
