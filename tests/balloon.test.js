import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { ensureTarget, stepEnemy, enemyDamageVs, LANDING_SECONDS, ENEMY_KINDS, removeDeadEnemies } from '../src/logic/enemies.js';
import { matchesTypes, damageEnemy } from '../src/logic/combat.js';
import { waveComposition } from '../src/logic/waves.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const B = CONFIG.enemies.balloon;
const N = CONFIG.enemies.neegy;
const balloon = (s, x, y) => addEnemy(s, 'balloon', x, y, { hp: B.hp, maxHp: B.hp, dropTimer: null });
const run = (s, e, seconds, until = () => false) => { for (let t = 0; t < seconds && e.alive && !until(); t += 0.05) stepEnemy(s, e, 0.05); };

describe('Neegy Balloon', () => {
  it('air defenses are the defenses that can shoot flyers', () => {
    const s = makeStateWithTownHall();
    const yes = ['archer', 'wizard', 'firework'].map((t, i) => addBuilding(s, t, 3 + i * 3, 20));
    const no = ['cannon', 'mortar', 'catapult', 'flock', 'mine'].map((t, i) => addBuilding(s, t, 3 + i * 3, 24));
    for (const b of yes) expect(matchesTypes(b, ['airDefense'])).toBe(true);
    for (const b of no) expect(matchesTypes(b, ['airDefense'])).toBe(false);
  });

  it('goes for the nearest air defense, even past closer buildings and defenses', () => {
    const s = makeStateWithTownHall();
    addBuilding(s, 'mine', 9, 16);
    addBuilding(s, 'cannon', 9, 20);
    const archer = addBuilding(s, 'archer', 13, 23);
    const e = balloon(s, 8, 17);
    run(s, e, 0.1);
    expect(e.targetId).toBe(archer.id);
  });

  it('keeps dropping 2 Neegies every few seconds onto its defense until it falls, then moves on', () => {
    const s = makeStateWithTownHall({ gold: 0 });
    const archer = addBuilding(s, 'archer', 9, 16);
    const cannon = addBuilding(s, 'cannon', 13, 23);
    const mine = addBuilding(s, 'mine', 6, 22);  // only once no defenses are left
    const e = balloon(s, 8, 17);
    const neegies = () => s.enemies.filter((x) => x.kind === 'neegy').length;
    run(s, e, 30, () => neegies() >= 2);
    expect(neegies()).toBe(2);
    run(s, e, B.dropInterval * 3 + 0.2);         // still over the archer: 3 more drops
    expect(neegies()).toBe(8);
    expect(e.targetId).toBe(archer.id);
    archer.destroyed = true; archer.hp = 0;
    run(s, e, 40, () => neegies() > 8);
    expect(e.targetId).toBe(cannon.id);          // next defense (no air defense left)
    cannon.destroyed = true; cannon.hp = 0;
    run(s, e, 2);
    expect(s.buildings.find((b) => b.id === e.targetId).type).not.toBe('cannon'); // no defenses: any building
    expect(e.leaving).toBeFalsy();
    expect(s.gold).toBe(0);
  });

  it('shot down, it pays its bounty and drops 2 Neegies where it falls', () => {
    const s = makeStateWithTownHall({ gold: 0 });
    addBuilding(s, 'archer', 9, 16);
    const e = balloon(s, 6, 15);
    damageEnemy(s, e, 9999);
    removeDeadEnemies(s);
    expect(s.gold).toBe(B.bounty);
    const neegies = s.enemies.filter((x) => x.kind === 'neegy');
    expect(neegies).toHaveLength(B.deathDrop);
    expect(neegies.every((n) => Math.hypot(n.x - 6, n.y - 15) < 2.5 && n.landing === LANDING_SECONDS)).toBe(true);
    removeDeadEnemies(s);
    expect(s.enemies.filter((x) => x.kind === 'neegy')).toHaveLength(B.deathDrop); // only once
  });

  it('with nothing left at all it drifts off and pops, without a death drop', () => {
    const s = makeStateWithTownHall({ gold: 0 });
    s.buildings = [];
    const e = balloon(s, 6, 15);
    run(s, e, B.leaveSeconds + 1);
    expect(e.alive).toBe(false);
    removeDeadEnemies(s);
    expect(s.enemies).toHaveLength(0);
  });

  it('joins the waves from wave 3 (1, then 2); Neegies are never queued', () => {
    expect(CONFIG.waves.map((w) => w.balloon)).toEqual([0, 0, 1, 2]);
    for (let n = 1; n <= 10; n++) expect(waveComposition(n).neegy).toBe(0);
    expect(ENEMY_KINDS).toContain('balloon');
    expect(ENEMY_KINDS).toContain('neegy');
  });
});

describe('Neegy', () => {
  it('waits while floating down, then attacks the air defense it landed by, 2x as hard', () => {
    const s = makeStateWithTownHall();
    const archer = addBuilding(s, 'archer', 9, 16);
    const n = addEnemy(s, 'neegy', 11.4, 17, { hp: N.hp, maxHp: N.hp, landing: LANDING_SECONDS });
    n.targetId = archer.id;
    const hp = archer.hp;
    stepEnemy(s, n, LANDING_SECONDS / 2);
    expect(archer.hp).toBe(hp);                   // still in the air
    run(s, n, 3, () => archer.hp < hp);
    expect(hp - archer.hp).toBe(N.damage * 2);
    expect(enemyDamageVs(N, addBuilding(s, 'mine', 3, 24))).toBe(N.damage);
  });
});
