// F.L.O.C.K Frequency Jam (v0.12.5 fix): only Bombers (CONFIG.enemies.bomber.jammable) hold their bombs in a jamming
// F.L.O.C.K's range, as the perk says; Neegy Balloons hold their troops (stepBalloon). Other flyers attack as usual:
// before, a La Vaca Saturno hovering in a jamming F.L.O.C.K's range and out of every air defense's reach could never
// throw, and the wave never ended.
import { describe, it, expect } from 'vitest';
import { stepFlockTowers } from '../src/logic/flock.js';
import { stepEnemy } from '../src/logic/enemies.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

function jammedVillage() {
  const s = makeStateWithTownHall({ gold: 0 }, 10);
  s.wave.phase = 'active';
  const flock = addBuilding(s, 'flock', 3, 3, 10);
  flock.picks = ['c', 'c', 'c']; // ... Frequency Jam
  const target = addBuilding(s, 'cannon', 6, 3, 1);
  return { s, target };
}

describe('Frequency Jam', () => {
  it('stops a Bomber\'s bombs, but not La Vaca Saturno\'s boulders or Bombombini Gusini\'s fire', () => {
    for (const [kind, attacks] of [['bomber', false], ['vaca', true], ['bombo', true]]) {
      const { s, target } = jammedVillage();
      // Right where it attacks from: over the target (the Bomber), or within its attack range (the ranged flyers).
      const e = addEnemy(s, kind, target.col + 1, target.row + 1, { hp: 1e6, maxHp: 1e6, targetId: target.id });
      stepFlockTowers(s);
      expect(e.airJammed, kind).toBe(true);
      const hp = target.hp;
      for (let i = 0; i < 20; i++) { stepFlockTowers(s); stepEnemy(s, e, 0.05); }
      const fired = s.events.some((ev) => ev.name === 'enemyAttack' && ev.data.id === e.id) || target.hp < hp || s.projectiles.length > 0;
      expect(fired, kind).toBe(attacks);
    }
  });
});
