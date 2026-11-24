import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config.js';
import {
  waveComposition, choosePaths, buildSpawnQueues, triggerWave, stepWaveSpawning, checkWaveCleared,
  enemiesLeft, nightWaveNumber, waveRamp, scaledWaveComposition, nextWaveComposition, nextWaveInfo,
  getWavePlan, wavePlanCounts, themesAt, waveThemeKey, themedComposition, themeInfo, nextDebut, legacyDebuted, bossWaveCars, babyCarCount, waveStage, debutKindsAt,
  waveStrength, PATHS, skipCountdown, cancelCountdown, OFFSET_KINDS
} from '../src/logic/waves.js';
import { startTutorialWave } from '../src/logic/dayNight.js';
import { TUTORIAL_NIGHT_STEP } from '../src/logic/tutorial.js';
import { ENEMY_KINDS } from '../src/logic/enemies.js';
import { makeStateWithTownHall, seededRng } from './helpers.js';

// The kinds that join the waves later (fromWave), all 0 in the first base waves.
const LATE_ZERO = { toilet: 0, pork: 0, skeleton: 0, vaca: 0, yahu: 0, patapim: 0, lirili: 0, bicus: 0, frigo: 0, bombo: 0, quandale: 0, grimace: 0 };
const w4 = CONFIG.waves[3];
const w5 = CONFIG.waves[4];

describe('waves.js', () => {
  it('waves 1 to 5 match config (Village Hall 5 has a scripted base wave too)', () => {
    expect(CONFIG.waves).toHaveLength(5);
    for (let n = 1; n <= 3; n++) expect(waveComposition(n)).toEqual({ ...CONFIG.waves[n - 1], ...LATE_ZERO, spawnPaths: CONFIG.rules.entrancesByStage[n - 1] }); // (the late kinds join from VH4)
    // From Village Hall 4 the v0.6 kinds join (John Pork first) and the regular troops make room for them.
    expect(waveComposition(4).pork).toBe(CONFIG.enemies.pork.baseCount);
    expect(waveComposition(5).toilet).toBe(CONFIG.enemies.toilet.baseCount);
    for (const n of [4, 5]) {
      const c = waveComposition(n), w = CONFIG.waves[n - 1];
      for (const k of ['breaker', 'balloon', 'neegy']) expect(c[k]).toBe(w[k]); // not in the offset pool
      for (const k of CONFIG.rules.lateKindPool) {
        expect(c[k]).toBeLessThanOrEqual(w[k]);
        expect(c[k]).toBeGreaterThanOrEqual(Math.min(w[k], Math.floor(w[k] * (1 - CONFIG.rules.lateKindMaxCut))));
      }
    }
  });

  it('the later enemies join at their own wave, not by Village Hall (v0.9.5: John Pork wave 10 ... Grimace Golem wave 48)', () => {
    const from = { pork: 10, toilet: 14, bicus: 14, skeleton: 18, frigo: 18, vaca: 23, quandale: 23, yahu: 28, bombo: 28, lirili: 34, patapim: 40, grimace: 48 };
    const at = (n) => scaledWaveComposition(waveStage(n), n);
    for (const [k, n] of Object.entries(from)) {
      expect(CONFIG.enemies[k].fromWave).toBe(n);
      expect(at(n - 1)[k], `${k} before wave ${n}`).toBe(0);
      expect(at(n)[k], `${k} at wave ${n}`).toBeGreaterThan(0);
      expect(waveComposition(waveStage(n))[k]).toBe(CONFIG.enemies[k].baseCount); // baseCount from its stage
    }
    // The same at any Village Hall: the hall no longer changes the waves.
    const a = makeStateWithTownHall({ wavesCleared: 29 }, 2), b = makeStateWithTownHall({ wavesCleared: 29 }, 12);
    a.debuted = b.debuted = debutKindsAt(30);
    expect(nextWaveComposition(a)).toEqual(nextWaveComposition(b));
  });

  it('wave stages: rules.waveStages says where each starts; past the last, the last', () => {
    const S = CONFIG.rules.waveStages;
    expect(S[0]).toBe(1);
    expect(S).toHaveLength(15); // (wave stages follow the wave number; they were the 15 Village Halls before v0.9.5)
    for (let i = 1; i < S.length; i++) expect(S[i]).toBeGreaterThan(S[i - 1]);
    expect(waveStage(1)).toBe(1);
    expect(waveStage(S[1] - 1)).toBe(1);
    expect(waveStage(S[1])).toBe(2);
    expect(waveStage(S[S.length - 1])).toBe(S.length);
    expect(waveStage(500)).toBe(S.length);
  });

  it('the offset keeps each hall wave strength close to what it was before the v0.6 enemies (within 20%)', () => {
    const before = (n) => {
      const saved = OFFSET_KINDS.map((k) => CONFIG.enemies[k].baseCount);
      OFFSET_KINDS.forEach((k) => { CONFIG.enemies[k].baseCount = 0; });
      const c = waveComposition(n);
      OFFSET_KINDS.forEach((k, i) => { CONFIG.enemies[k].baseCount = saved[i]; });
      return waveStrength(c);
    };
    for (let n = 1; n <= 10; n++) {
      const now = waveStrength(waveComposition(n));
      expect(now).toBeGreaterThanOrEqual(before(n));
      expect(now / before(n)).toBeLessThan(1.2);
    }
  });

  it('wave 1 always uses the top path', () => {
    for (let seed = 1; seed < 30; seed++) {
      expect(choosePaths({ rng: seededRng(seed) }, 1, 1)).toEqual(['top']);
    }
  });

  it('other waves pick random paths without repeats', () => {
    for (let seed = 1; seed < 30; seed++) {
      const paths = choosePaths({ rng: seededRng(seed) }, 3, 2);
      expect(paths).toHaveLength(2);
      expect(new Set(paths).size).toBe(2);
      paths.forEach((p) => expect(PATHS).toContain(p));
    }
  });

  it('wave 6 follows the endless formulas from the Village Hall 5 base', () => {
    const { endlessCountGrowth: cg, endlessHpGrowth: hg } = CONFIG.rules;
    const c = waveComposition(6);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromWave && !CONFIG.rules.lateKindPool.includes(k)) expect(c[k]).toBe(Math.round((w5[k] || 0) * cg));
    for (const k of CONFIG.rules.lateKindPool) expect(c[k]).toBeLessThanOrEqual(Math.round((w5[k] || 0) * cg)); // (made room for the v0.6 kinds)
    expect(c.toilet).toBe(Math.round(CONFIG.enemies.toilet.baseCount * cg)); // joined at Village Hall 5
    expect(c.hpMultiplier).toBe(Math.round(w5.hpMultiplier * hg * 100) / 100);
    expect(c.spawnPaths).toBe(4);
  });

  it('wave 8 follows the endless formulas', () => {
    const { endlessCountGrowth: cg, endlessHpGrowth: hg } = CONFIG.rules;
    const c = waveComposition(8);
    for (const k of ENEMY_KINDS) if (!CONFIG.enemies[k].fromWave && !CONFIG.rules.lateKindPool.includes(k)) expect(c[k]).toBe(Math.round((w5[k] || 0) * cg ** 3));
    expect(c.toilet).toBe(Math.round(CONFIG.enemies.toilet.baseCount * cg ** 3));
    expect(c.hpMultiplier).toBe(Math.round(w5.hpMultiplier * hg ** 3 * 100) / 100);
    expect(c.spawnPaths).toBe(5);
  });

  it('most entrances by wave stage: 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, then all 8 from stage 13', () => {
    expect(PATHS).toHaveLength(8);
    expect(PATHS).toEqual(['top', 'cave', 'right', 'stairsRight', 'bottom', 'stoneBridge', 'left', 'stairsLeft']); // v0.9.2 map
    expect(Array.from({ length: 15 }, (_, i) => waveComposition(i + 1).spawnPaths)).toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 8, 8, 8]);
  });

  it('each Village Hall base wave is tougher than the one before (total enemy HP x hpMultiplier)', () => {
    let prev = 0;
    for (let n = 1; n <= 10; n++) {
      const c = waveComposition(n);
      const s = waveStrength(c) * c.hpMultiplier;
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('every entrance is in play from stage 13 (wave 65), and never more than there are', () => {
    expect(waveStage(65)).toBe(13);
    expect(waveComposition(12).spawnPaths).toBe(7);
    expect(waveComposition(13).spawnPaths).toBe(PATHS.length);
    expect(waveComposition(30).spawnPaths).toBe(PATHS.length);
    expect(PATHS).not.toContain('lake');
  });

  it('splits enemies evenly and interleaves the troop types instead of sending one type at a time', () => {
    const q = buildSpawnQueues(w4, ['left', 'right']);
    const all = [...q.left, ...q.right];
    for (const k of ENEMY_KINDS) expect(all.filter((x) => x === k)).toHaveLength(w4[k] || 0);
    expect(Math.abs(q.left.length - q.right.length)).toBeLessThanOrEqual(1);
    for (const path of ['left', 'right']) {
      const list = q[path];
      // No type forms a long back-to-back run, and the first 10 already mix at least 3 types.
      let run = 1, longest = 1;
      for (let i = 1; i < list.length; i++) { run = list[i] === list[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
      expect(longest).toBeLessThanOrEqual(3);
      expect(new Set(list.slice(0, 10)).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('the Da Baby Car boss still leads its path', () => {
    const q = buildSpawnQueues({ ...w4, babycar: 1 }, ['top']);
    expect(q.top[0]).toBe('babycar');
  });

  it('the wave plan has 1 up to the stage\'s most entrances, is made ahead, and is kept until the wave is cleared', () => {
    const seen = new Set();
    for (let seed = 1; seed < 120; seed++) {
      const state = makeStateWithTownHall({}, 2); // (the hall doesn't matter) wave 40 is stage 10: up to 6
      state.rng = seededRng(seed);
      state.wavesCleared = 39;
      const plan = getWavePlan(state);
      expect(plan.number).toBe(40);
      expect(new Set(plan.paths).size).toBe(plan.paths.length);
      seen.add(plan.paths.length);
      expect(getWavePlan(state)).toBe(plan); // stable until the wave is cleared
      triggerWave(state);
      expect(state.wave.paths).toEqual(plan.paths);
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    // Stage 1 (waves 2-3, after the tutorial wave) only ever comes from one entrance, even at a high Village Hall.
    for (let seed = 1; seed < 20; seed++) {
      const state = makeStateWithTownHall({}, 10);
      state.rng = seededRng(seed);
      state.wavesCleared = 2;
      expect(getWavePlan(state).paths).toHaveLength(1);
    }
  });

  it('wave 1 plans only the top corner; the plan is replaced for a new wave number', () => {
    const state = makeStateWithTownHall({}, 1);
    expect(getWavePlan(state).paths).toEqual(['top']);
    state.wavesCleared = 3;
    expect(getWavePlan(state).number).toBe(4);
  });

  it('wavePlanCounts reports per-corner enemy counts that add up to the wave', () => {
    const state = makeStateWithTownHall({}, 3);
    state.wavesCleared = 2;
    const counts = wavePlanCounts(state);
    const total = Object.values(counts).reduce((n, c) => n + Object.values(c).reduce((a, b) => a + b, 0), 0);
    const comp = nextWaveComposition(state);
    expect(total).toBe(ENEMY_KINDS.reduce((n, k) => n + (comp[k] || 0), 0));
  });

  it('runs countdown -> spawning -> cleared with free repair', () => {
    const state = makeStateWithTownHall({}, 1);
    const th = state.buildings[0];
    triggerWave(state);
    expect(state.wave).toMatchObject({ phase: 'countdown', number: 1, paths: ['top'] });
    expect(enemiesLeft(state)).toBe(CONFIG.waves[0].grunt);

    // The countdown: a tick each second, nothing spawns until it runs out.
    for (let t = 0; t < CONFIG.rules.waveCountdown - 0.55; t += 0.1) stepWaveSpawning(state, 0.1);
    expect(state.wave.phase).toBe('countdown');
    expect(state.enemies).toHaveLength(0);
    expect(state.events.filter((e) => e.name === 'waveTick').length).toBe(CONFIG.rules.waveCountdown - 1);
    stepWaveSpawning(state, 0.52);
    expect(state.wave.phase).toBe('active');
    expect(state.enemies).toHaveLength(1);
    stepWaveSpawning(state, CONFIG.rules.spawnInterval);
    expect(state.enemies).toHaveLength(2);

    for (let i = 0; i < 100; i++) stepWaveSpawning(state, CONFIG.rules.spawnInterval);
    expect(state.enemies).toHaveLength(CONFIG.waves[0].grunt);

    th.hp = 1;
    expect(checkWaveCleared(state)).toBe(false);
    state.enemies.forEach((e) => { e.alive = false; });
    expect(checkWaveCleared(state)).toBe(true);
    expect(state.wavesCleared).toBe(1);
    expect(state.wave.phase).toBe('idle');
    expect(th.hp).toBe(CONFIG.townHall.levels[0].hp);
    expect(state.events.some((e) => e.name === 'waveCleared')).toBe(true);
  });

  it('waves are numbered in the order they are fought, whatever the Village Hall level', () => {
    for (let th = 1; th <= CONFIG.rules.maxTownHallLevel; th++) {
      expect(nightWaveNumber(makeStateWithTownHall({}, th))).toBe(1);
      expect(nightWaveNumber(makeStateWithTownHall({ wavesCleared: 6 }, th))).toBe(7);
    }
  });

  it('the stage picks the base wave; with no ramp it is exactly that base (later kinds only from their wave)', () => {
    for (let st = 1; st <= 3; st++) expect(scaledWaveComposition(st, 1)).toEqual({ ...CONFIG.waves[st - 1], babycar: 0, bones: 0, chimp: 0, ...LATE_ZERO, spawnPaths: CONFIG.rules.entrancesByStage[st - 1] }); // (no Da Baby Cars or late kinds in these base waves)
    expect(scaledWaveComposition(4, 1)).toEqual({ ...waveComposition(4, 1), babycar: 0, bones: 0, chimp: 0 });
    expect(scaledWaveComposition(4, 1).pork).toBe(0); // John Pork joins at wave 10
    expect(scaledWaveComposition(7, 1)).toEqual(waveComposition(7, 1));
    expect(scaledWaveComposition(16, 1)).toEqual(waveComposition(CONFIG.rules.waveStages.length, 1)); // capped
  });

  it('every wave survived ramps up enemies and HP, even within the same stage', () => {
    const r = CONFIG.rules.waveRamp;
    expect(waveRamp(1)).toEqual({ count: 1, hp: 1 });
    expect(waveRamp(11).count).toBeCloseTo(1 + 10 * r.countPerWave, 5);
    expect(waveRamp(11).hp).toBeCloseTo(1 + 10 * r.hpPerWave, 5);
    const base = CONFIG.waves[1]; // Village Hall 2
    let prev = null;
    for (const n of [1, 5, 10, 20]) {
      const c = scaledWaveComposition(2, n);
      expect(c.grunt).toBe(Math.round(base.grunt * waveRamp(n).count));
      expect(c.hpMultiplier).toBeCloseTo(base.hpMultiplier * waveRamp(n).hp, 2);
      expect(c.bomber).toBe(0); // kinds the stage's base wave doesn't have never show up
      expect(c.spawnPaths).toBe(2); // stage 2's most entrances
      if (prev) { expect(c.grunt).toBeGreaterThan(prev.grunt); expect(c.hpMultiplier).toBeGreaterThan(prev.hpMultiplier); }
      prev = c;
    }
  });

  it('clearing waves at the same Village Hall makes the next one bigger', () => {
    const state = makeStateWithTownHall({}, 3);
    const total = (c) => ENEMY_KINDS.reduce((n, k) => n + (c[k] || 0), 0);
    const normalNext = () => scaledWaveComposition(3, nightWaveNumber(state)); // (wave 3 is a special wave)
    let before = total(normalNext());
    for (let night = 1; night <= 3; night++) {
      triggerWave(state);
      expect(state.wave.number).toBe(night);
      state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = [];
      checkWaveCleared(state);
      const after = total(normalNext());
      expect(after).toBeGreaterThan(before);
      before = after;
    }
    expect(state.wavesCleared).toBe(3);
  });

  it('nights below max Town Hall do not count toward the max-level ramp', () => {
    const state = makeStateWithTownHall({}, 2);
    triggerWave(state);
    state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = [];
    checkWaveCleared(state);
    expect(state.nightsAtMaxTownHall || 0).toBe(0);
    expect(state.wavesCleared).toBe(1);
  });

  describe('themed waves (v0.7)', () => {
    const T = CONFIG.waveThemes;
    const kinds = (c) => ENEMY_KINDS.filter((k) => c[k] > 0);
    const ratio = (c, normal) => (waveStrength(c) * c.hpMultiplier) / (waveStrength(normal) * normal.hpMultiplier);

    it('wave 1 is plain; from then on every wave has a theme, rotating so back-to-back waves differ', () => {
      expect(waveThemeKey(4, 1)).toBeNull();
      const list = themesAt(4);
      expect(list.length).toBeGreaterThan(3);
      let last = null;
      for (let n = T.fromWave; n < T.fromWave + 30; n++) {
        if (n % T.boss.every === 0) continue;
        const key = waveThemeKey(4, n);
        expect(list).toContain(key);
        expect(key).not.toBe(last);
        last = key;
      }
      expect(waveThemeKey(1, 5)).toBeNull(); // nothing to theme with at Village Hall 1 (grunts only)
    });

    it('a theme only shows up once its enemies are in the hall\'s waves (there is always a counter)', () => {
      expect(themesAt(1)).toEqual([]);
      expect(themesAt(3)).toContain('air');
      expect(themesAt(3)).not.toContain('siege');      // no Tanks until Village Hall 4
      expect(themesAt(4)).not.toContain('ironLegion'); // Bri Bri Bicus Dicus from Village Hall 5
      expect(themesAt(5)).toContain('ironLegion');
      expect(themesAt(9)).not.toContain('jungle');     // Brr Brr Patapim from Village Hall 10
      expect(themesAt(10)).toEqual(T.order.filter((k) => k !== 'gooParade')); // (Grimace Golem from Village Hall 11)
      expect(themesAt(11)).toEqual(T.order);
    });

    it('a headliner theme puts its share into its enemies and keeps the rest of the mix; strength stays about the same', () => {
      const normal = scaledWaveComposition(10, 40);
      const legion = themedComposition(normal, 'ironLegion');
      expect(legion.bicus).toBeGreaterThan(normal.bicus * 2);
      expect(legion.grunt).toBeGreaterThan(0); // the rest of the mix is still there
      expect(legion.grunt).toBeLessThan(normal.grunt);
      for (const key of T.order) {
        const c = themedComposition(normal, key);
        expect(c.special).toBe(key);
        expect(c.spawnPaths).toBe(normal.spawnPaths);
        const want = T.types[key].strength ?? 1;
        expect(ratio(c, normal)).toBeGreaterThan(want * 0.85);
        expect(ratio(c, normal)).toBeLessThan(want * 1.15);
      }
    });

    it('pure themes are only their mix (the old special waves): flyers only, no flyers, tanks and breakers', () => {
      const normal = scaledWaveComposition(4, 9);
      expect(kinds(themedComposition(normal, 'air')).every((k) => CONFIG.enemies[k].type === 'air')).toBe(true);
      expect(kinds(themedComposition(normal, 'ground')).some((k) => CONFIG.enemies[k].type === 'air')).toBe(false);
      expect(kinds(themedComposition(normal, 'siege')).sort()).toEqual(['breaker', 'tank']);
      expect(themeInfo('air').bonus).toBe(T.bonusBounty);
      expect(themeInfo('ironLegion').bonus).toBe(0);
    });

    it('ability enemies are capped in a theme (no flood of Patapims or Frigos); the strength goes to the other troops', () => {
      const C = T.headlinerCap;
      for (const [th, n] of [[10, 40], [10, 47], [6, 18]]) {
        const normal = scaledWaveComposition(th, n);
        for (const key of ['debut:patapim', 'debut:frigo', 'debut:bicus', 'frozenFront', 'jungle', 'skyFire', 'boss']) {
          const c = themedComposition(normal, key);
          for (const k of C.kinds) if (normal[k] > 0) expect(c[k]).toBeLessThanOrEqual(Math.max(Math.round(normal[k] * C.mult), normal[k] + C.extra));
          if (key.startsWith('debut:') && normal[key.slice(6)] > 0) expect(c[key.slice(6)]).toBeGreaterThan(normal[key.slice(6)]); // still the star
          expect(ratio(c, normal)).toBeGreaterThan(0.85);
          expect(ratio(c, normal)).toBeLessThan(1.3);
        }
      }
    });

    it('never more than maxEnemiesFactor x the normal count (the rest goes into health)', () => {
      const normal = { ...scaledWaveComposition(4, 1), grunt: 1, slinger: 0, bomber: 0, tank: 3, shark: 0, thief: 1, breaker: 0, balloon: 0, pork: 0 };
      const c = themedComposition(normal, 'heist');
      expect(kinds(c).reduce((n, k) => n + c[k], 0)).toBeLessThanOrEqual(Math.round(5 * T.maxEnemiesFactor));
      expect(c.hpMultiplier).toBeGreaterThan(normal.hpMultiplier);
    });

    it('every boss.every-th wave is a Boss Wave: the toughest kinds, extra raid bosses, a bigger bonus', () => {
      const n = T.boss.every * 4; // wave 40
      const state = makeStateWithTownHall({ wavesCleared: n - 1, gold: 0 }, 3);
      state.debuted = debutKindsAt(n);
      const info = nextWaveInfo(state);
      expect(info.theme).toBe('boss');
      expect(info.babyCars).toBe(bossWaveCars(n));
      expect(bossWaveCars(n)).toBeGreaterThan(babyCarCount(n));
      const comp = nextWaveComposition(state);
      const normal = scaledWaveComposition(waveStage(n), n);
      expect(comp.lirili).toBeGreaterThan(normal.lirili); // the toughest kinds headline
      expect(comp.babycar).toBe(bossWaveCars(n));
      expect(themeInfo('boss').bonus).toBe(T.boss.bonusBounty);
      expect(bossWaveCars(T.boss.every)).toBe(0); // no raid boss before its wave (18)
    });

    it('a debut wave introduces an enemy the village hasn\'t met, once; older saves still get the v0.7 debuts', () => {
      const state = makeStateWithTownHall({ wavesCleared: 17, gold: 0 }, 2); // wave 18 (the hall doesn't matter)
      state.debuted = ['pork', 'toilet'];
      expect(nextDebut(state)).toBe('skeleton');
      const info = nextWaveInfo(state);
      expect(info.theme).toBe('debut:skeleton');
      expect(info.themeInfo.name).toContain(CONFIG.enemies.skeleton.name);
      const normal = scaledWaveComposition(waveStage(18), 18);
      expect(nextWaveComposition(state).skeleton).toBeGreaterThan(normal.skeleton);
      triggerWave(state);
      expect(state.debuted).toContain('skeleton');
      expect(nextDebut(state)).toBe('bicus');
      cancelCountdown(state); // cancelled: the debut comes again
      expect(nextDebut(state)).toBe('skeleton');
      triggerWave(state);
      // An older save at wave 40: every kind due by then counts as met; the v0.7 enemies debut.
      const legacy = legacyDebuted(40);
      expect(legacy).toContain('pork');
      for (const k of ['bicus', 'frigo', 'bombo', 'lirili', 'patapim']) expect(legacy).not.toContain(k);
      expect(waveThemeKey(10, 1, 'frigo')).toBeNull(); // never on the tutorial wave
    });

    it('the next wave is announced ahead, triggered with its theme, and a pure theme pays its bonus when cleared', () => {
      let n = T.fromWave;
      while (waveThemeKey(waveStage(n), n) !== 'air') n++; // the first air wave
      const state = makeStateWithTownHall({ wavesCleared: n - 1, gold: 0 }, 3);
      state.debuted = debutKindsAt(n);
      const info = nextWaveInfo(state);
      expect(info.theme).toBe('air');
      expect(info.specialInfo.name).toBe(T.types.air.name);
      triggerWave(state);
      expect(state.wave.special).toBe('air');
      state.wave.phase = 'active'; state.wave.queues = {}; state.enemies = []; state.wave.bountyEarned = 40;
      state.wave.lost = state.wave.startBuildings; // 1 star: no star bonus, only the theme's
      checkWaveCleared(state);
      const cleared = state.events.find((e) => e.name === 'waveCleared').data;
      expect(cleared).toMatchObject({ special: 'air', bonus: Math.floor(40 * T.bonusBounty) });
      expect(state.gold).toBe(cleared.bonus);
    });
  });

  it('Start Now skips the rest of the countdown; the tutorial wave counts down for less', () => {
    const state = makeStateWithTownHall({}, 1);
    triggerWave(state);
    stepWaveSpawning(state, 5);
    expect(skipCountdown(state)).toBe(true);
    stepWaveSpawning(state, 0.01);
    expect(state.wave.phase).toBe('active');
    expect(state.enemies.length).toBeGreaterThan(0);
    expect(skipCountdown(state)).toBe(false); // already attacking
    const tut = makeStateWithTownHall({ tutorialDone: false, tutorialStep: TUTORIAL_NIGHT_STEP }, 1);
    startTutorialWave(tut);
    expect(tut.wave.countdown).toBe(CONFIG.rules.tutorialCountdown);
  });

  it('Cancel during the countdown puts the wave back (same number), and never as a quick start', () => {
    const state = makeStateWithTownHall({ tutorialDone: true, tutorialStep: 10 }, 1);
    state.sinceWaveCleared = 0;
    triggerWave(state);
    const n = state.wave.number;
    stepWaveSpawning(state, 5);
    expect(cancelCountdown(state)).toBe(true);
    expect(state.wave.phase).toBe('idle');
    expect(state.events.some((e) => e.name === 'waveCancelled' && e.data.number === n)).toBe(true);
    expect(nightWaveNumber(state)).toBe(n);
    expect(state.sinceWaveCleared).toBe(Infinity);
    stepWaveSpawning(state, 60);
    expect(state.enemies).toHaveLength(0); // nothing comes
    triggerWave(state); stepWaveSpawning(state, CONFIG.rules.waveCountdown + 0.1);
    expect(cancelCountdown(state)).toBe(false); // too late once it attacks
  });
});
