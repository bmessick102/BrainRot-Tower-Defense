// v0.6.3: the Tower of Rah's beam holds its lock a little past its range; enemies draw over rubble.
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepBeams } from '../src/logic/beams.js';
import { groundDepth } from '../src/objects/depth.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = (th = 10) => { const s = makeStateWithTownHall({ gold: 0 }, th); s.wave.phase = 'active'; return s; };

describe('Tower of Rah beam leash', () => {
  const R = CONFIG.defenses.ra;
  const run = (s, seconds) => { for (let t = 0; t < seconds; t += 0.05) stepBeams(s, 0.05); };

  it('a locked beam keeps heating on a flyer nudged just past its range (La Vaca Saturno at the edge)', () => {
    const s = attack();
    const ra = addBuilding(s, 'ra', 10, 10, 8); // center (11, 11)
    const cow = addEnemy(s, 'vaca', 11 + R.range - 0.2, 11, { hp: 1e6, maxHp: 1e6 });
    run(s, 1);
    expect(ra.beamTargetId).toBe(cow.id);
    cow.x = 11 + R.range + R.leash * 0.8; // pushed out, but within the leash
    run(s, R.stages[2].after);
    expect(ra.beamTargetId).toBe(cow.id);
    expect(ra.beamStage).toBe(R.stages.length - 1); // heated all the way instead of starting cold again
  });

  it('a new target still has to be inside the range, and past the leash the beam lets go', () => {
    const s = attack();
    const ra = addBuilding(s, 'ra', 10, 10, 8);
    const cow = addEnemy(s, 'vaca', 11 + R.range + R.leash * 0.5, 11, { hp: 1e6, maxHp: 1e6 });
    run(s, 0.5);
    expect(ra.beamTargetId).toBe(null); // not acquired from outside the range
    cow.x = 11 + R.range - 0.5;
    run(s, 0.5);
    expect(ra.beamTargetId).toBe(cow.id);
    cow.x = 11 + R.range + R.leash + 0.3;
    run(s, 0.2);
    expect(ra.beamTargetId).toBe(null);
  });
});

describe('rubble draw order', () => {
  it('a destroyed building no longer pushes enemies standing in front of it (its rubble is drawn from its back corner)', () => {
    const b = { type: 'storage', col: 10, row: 10, size: 2, destroyed: false };
    const standing = groundDepth([b], 12.2, 11);      // past its right face: drawn in front of the building
    expect(standing).toBeGreaterThan(12.2 + 11);
    b.destroyed = true;
    expect(groundDepth([b], 12.2, 11)).toBe(12.2 + 11); // rubble: plain x + y, over the rubble's col + row
    expect(groundDepth([b], 11, 11)).toBeGreaterThan(b.col + b.row);
  });
});
