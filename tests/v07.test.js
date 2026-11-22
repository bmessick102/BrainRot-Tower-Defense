// v0.7: Bri Bri Bicus Dicus (armor), Frigo Camillo (cold aura), Bombombini Gusini (fire breath), Brr Brr Patapim's
// Chimpanzini Bananini (spawned divers) and Lirili Larila (the earthquake; tested in v06.test.js).
import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import { stepEnemies, createEnemy } from '../src/logic/enemies.js';
import { stepSpecialEnemies } from '../src/logic/specialEnemies.js';
import { damageEnemy, stepProjectiles } from '../src/logic/combat.js';
import { stepBeams } from '../src/logic/beams.js';
import { towerFireInterval } from '../src/logic/abilities.js';
import { makeStateWithTownHall, addBuilding, addEnemy } from './helpers.js';

const attack = (th = 10) => { const s = makeStateWithTownHall({ gold: 0 }, th); s.wave.phase = 'active'; return s; };
const run = (s, seconds, dt = 0.05) => { for (let i = 0; i < Math.round(seconds / dt); i++) { stepSpecialEnemies(s, dt); stepEnemies(s, dt); stepProjectiles(s, dt); } };

describe('Bri Bri Bicus Dicus: armor', () => {
  const C = CONFIG.enemies.bicus;

  it('comes with armor scaled like its health', () => {
    const s = attack();
    const e = createEnemy(s, 'bicus', 5, 5, 2);
    expect(e.maxArmor).toBe(C.armor * 2);
    expect(e.armor).toBe(e.maxArmor);
    expect(e.hp).toBe(C.hp * 2);
  });

  it('cuts damage while the armor holds; the breaking hit does no health damage; then full damage', () => {
    const s = attack();
    const e = createEnemy(s, 'bicus', 5, 5, 1);
    s.enemies.push(e);
    expect(C.armorReduction).toBe(0.3);
    damageEnemy(s, e, 100); // 30% less: the armor loses 70
    expect(e.armor).toBe(C.armor - 70);
    expect(e.hp).toBe(C.hp);
    const hit = s.events.filter((ev) => ev.name === 'enemyHit').pop();
    expect(hit.data.amount).toBeCloseTo(70);
    expect(hit.data.source).toBe('armor');
    e.armor = 50;
    damageEnemy(s, e, 1000); // breaks the armor: the rest is lost
    expect(e.armor).toBe(0);
    expect(e.hp).toBe(C.hp);
    expect(s.events.some((ev) => ev.name === 'armorBroken')).toBe(true);
    damageEnemy(s, e, 100); // now its health, no reduction
    expect(e.hp).toBe(C.hp - 100);
  });

  it('one huge hit can\'t kill it through its armor', () => {
    const s = attack();
    const e = createEnemy(s, 'bicus', 5, 5, 1);
    s.enemies.push(e);
    damageEnemy(s, e, 1e7);
    expect(e.alive).toBe(true);
    damageEnemy(s, e, 1e7);
    expect(e.alive).toBe(false);
  });
});

describe('Frigo Camillo: cold aura', () => {
  const A = CONFIG.enemies.frigo.chillAura;

  it('slows defenses within its radius (fire interval), not the ones outside', () => {
    const s = attack();
    const near = addBuilding(s, 'cannon', 10, 10, 5);
    const far = addBuilding(s, 'cannon', 25, 25, 5);
    const base = towerFireInterval(near);
    addEnemy(s, 'frigo', 12.5, 11, { hp: 1e6, maxHp: 1e6 });
    stepSpecialEnemies(s, 0.05);
    expect(near.frigoSlow).toBe(A.slowPct);
    expect(far.frigoSlow).toBe(0);
    expect(towerFireInterval(near)).toBeCloseTo(base / (1 - A.slowPct / 100));
    expect(towerFireInterval(far)).toBeCloseTo(base);
  });

  it('slows the Tower of Rah\'s beam too, and wears off when it dies', () => {
    const s = attack();
    const ra = addBuilding(s, 'ra', 10, 10, 8);
    const f = addEnemy(s, 'frigo', 12.5, 11, { hp: 1e6, maxHp: 1e6 });
    stepSpecialEnemies(s, 0.05);
    const hp0 = f.hp;
    for (let i = 0; i < 20; i++) stepBeams(s, 0.05); // 1 s at the first heat stage
    const dps = CONFIG.defenses.ra.levels[7].dps;
    expect(hp0 - f.hp).toBeCloseTo(dps * (1 - A.slowPct / 100), 0);
    f.alive = false;
    stepSpecialEnemies(s, 0.05);
    expect(ra.frigoSlow).toBe(0);
  });
});

describe('Bombombini Gusini: fire breath', () => {
  it('burns its target for full damage and the buildings right next to it for a share; not farther ones', () => {
    const s = attack();
    for (const b of s.buildings) b.hp = b.maxHp = 1e7;
    const target = addBuilding(s, 'storage', 12, 12, 1); target.hp = target.maxHp = 1e6;
    const next = addBuilding(s, 'storage', 14, 12, 1); next.hp = next.maxHp = 1e6;
    const far = addBuilding(s, 'storage', 20, 12, 1); far.hp = far.maxHp = 1e6;
    const C = CONFIG.enemies.bombo;
    addEnemy(s, 'bombo', 12.5, 10.2, { hp: 1e6, maxHp: 1e6, targetId: target.id });
    run(s, 0.1);
    expect(s.events.some((e) => e.name === 'fireBreath')).toBe(true);
    expect(1e6 - target.hp).toBeCloseTo(C.damage);
    expect(1e6 - next.hp).toBeCloseTo(C.damage * C.breath.splashPct / 100);
    expect(far.hp).toBe(1e6);
  });
});

describe('Brr Brr Patapim and Chimpanzini Bananini', () => {
  const S = CONFIG.enemies.patapim.spawn;

  it('drops a Chimpanzini every few seconds while walking in, up to maxAlive of his', () => {
    const s = attack();
    const store = addBuilding(s, 'storage', 2, 2, 1); store.hp = store.maxHp = 1e7;
    const pat = addEnemy(s, 'patapim', 30, 30, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    const mine = () => s.enemies.filter((e) => e.alive && e.summonerId === pat.id);
    run(s, S.every * 0.5);
    expect(mine()).toHaveLength(0);
    run(s, S.every * 0.6);
    expect(mine()).toHaveLength(S.count);
    expect(mine()[0].kind).toBe('chimp');
    for (const c of s.enemies) if (c.kind === 'chimp') c.held = 999; // keep them where they are
    run(s, S.every * (S.maxAlive + 3));
    expect(mine().length).toBeLessThanOrEqual(S.maxAlive);
    expect(CONFIG.enemies.patapim.quake).toBeUndefined(); // the earthquake is Lirili Larila's now
  });

  it('a Chimpanzini jumps walls, targets buildings only, and hits once then is gone (no bounty)', () => {
    const s = attack();
    s.capacity = 1e9;
    for (const b of s.buildings) b.hp = b.maxHp = 1e7;
    const store = addBuilding(s, 'storage', 12, 12, 1); store.hp = store.maxHp = 1e6;
    const c = addEnemy(s, 'chimp', 14.4, 12.9, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    expect(CONFIG.enemies.chimp.jumpsWalls).toBe(true);
    const gold = s.gold;
    run(s, 0.3);
    expect(c.alive).toBe(false);
    expect(1e6 - store.hp).toBeCloseTo(CONFIG.enemies.chimp.damage);
    expect(s.events.some((e) => e.name === 'enemyDive')).toBe(true);
    expect(s.gold).toBe(gold);
  });

  it('a Chimpanzini never stops to fight the Brisket King (buildings only)', () => {
    const s = attack();
    const altar = s.buildings.find((b) => b.type === 'altar') || addBuilding(s, 'altar', 4, 4, 5);
    s.hero = { status: 'ready', hp: 1e6, x: 14.4, y: 13.6, altarId: altar.id, cooldown: 0, feastsUsed: 0 };
    const store = addBuilding(s, 'storage', 12, 12, 1); store.hp = store.maxHp = 1e6;
    const c = addEnemy(s, 'chimp', 14.4, 13.2, { hp: 1e6, maxHp: 1e6, targetId: store.id });
    run(s, 0.6);
    expect(c.alive).toBe(false); // it dove into the storage
    expect(s.hero.hp).toBe(1e6);
  });
});

describe("What's New format (CLAUDE.md, 'Patch notes')", () => {
  it('sections in the fixed order (each type once, none empty); every entry has a version, title, text and picture', async () => {
    const { PATCH_RELEASES, PATCH_SECTION_ORDER, PATCH_SECTIONS } = await import('../src/patchNotes.js');
    const v = (x) => x.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0);
    for (const rel of PATCH_RELEASES) {
      const types = rel.sections.map((x) => x.type);
      expect(new Set(types).size).toBe(types.length);
      expect(types).toEqual(PATCH_SECTION_ORDER.filter((t) => types.includes(t)));
      for (const sec of rel.sections) {
        expect(PATCH_SECTIONS[sec.type]).toBeTruthy();
        expect(sec.entries.length).toBeGreaterThan(0);
        for (const e of sec.entries) {
          expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
          expect(v(e.version)).toBeLessThanOrEqual(v(rel.version));
          // An entry sits in its own minor update's tab (0.6.x entries in the v0.6 tab).
          expect(e.version.split('.').slice(0, 2).join('.')).toBe(rel.release);
          expect(e.title && e.text && e.icon).toBeTruthy();
        }
      }
    }
  });

  it('one tab per minor update, newest first; the latest is this release', async () => {
    const { PATCH_NOTES, PATCH_RELEASES } = await import('../src/patchNotes.js');
    expect(PATCH_RELEASES[0]).toBe(PATCH_NOTES);
    expect(PATCH_NOTES.version.startsWith(`${PATCH_NOTES.release}.`)).toBe(true);
    const r = PATCH_RELEASES.map((x) => x.release.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0));
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeLessThan(r[i - 1]);
    expect(PATCH_RELEASES.map((x) => x.release)).toContain('0.6');
  });

  it('pages: every entry once, each page starts with a section heading', async () => {
    const { PATCH_RELEASES } = await import('../src/patchNotes.js');
    const { patchPages } = await import('../src/objects/PatchNotesWindow.js').catch(() => ({ patchPages: null }));
    if (!patchPages) return; // (the window module needs Phaser in a browser)
    for (const rel of PATCH_RELEASES) {
      const pages = patchPages(rel);
      expect(pages.flat().filter((r) => r.entry)).toHaveLength(rel.entries.length);
      for (const p of pages) expect(p[0].section).toBeTruthy();
    }
  });
});

describe('league badge sizes (v0.7.1)', () => {
  it('each league looks a little bigger than the one before (corrected for the picture shape)', async () => {
    const { LEAGUES, leagueBadgeSize, LEAGUE_ART_FILL } = await import('../src/logic/leagues.js');
    // What the eye sees: the drawn longer side x how much of its box the picture fills.
    const seen = LEAGUES.map((l) => leagueBadgeSize(l, 200) * LEAGUE_ART_FILL[l.key]);
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    // Never much past the space laid out for it.
    for (const l of LEAGUES) expect(leagueBadgeSize(l, 200)).toBeLessThanOrEqual(206);
  });
});
