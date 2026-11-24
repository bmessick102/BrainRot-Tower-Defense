// Research points are called Shakes everywhere a player can read them (v0.14; Burgers 0.5.0-0.13). The code, config keys
// and saves still say rp / researchPoints (so saves don't change); only display text does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringLiterals } from './stringScan.js';
import { CONFIG } from '../src/config.js';
import { ABILITIES, ECONOMY_ABILITIES } from '../src/abilityConfig.js';
import { BUILDING_DESCRIPTIONS } from '../src/buildingText.js';
import { ENEMY_DESCRIPTIONS } from '../src/enemyText.js';
import { ACHIEVEMENTS } from '../src/logic/achievements.js';
import { TIPS } from '../src/logic/tips.js';
import { LOADING_TIPS } from '../src/loadingTips.js';
import { rpText, needRpReason, RP_NAME } from '../src/logic/researchPoints.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// "RP" in capitals is the old name; lowercase rp / researchPoints are internal keys and never match.
const said = (s) => /\bRP\b/.test(s) || /research[ -]points?/i.test(s);
// v0.14: "Burger(s)" is the old name too. The What's New history keeps it: notes of versions already live are never
// edited (CLAUDE.md), so src/patchNotes.js is the one file allowed to say it.
const saidBurger = (s) => /burger/i.test(s);
const PATCH_NOTES_FILE = path.join('src', 'patchNotes.js');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Every string value inside a config object (names, descriptions, labels). */
function strings(v, at = 'CONFIG', out = []) {
  if (typeof v === 'string') out.push([at, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${at}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, `${at}.${k}`, out);
  return out;
}

describe('Shakes: no player-facing text says RP, research points or Burgers', () => {
  it('no string literal in src/ does (comments and internal keys aside; the What\'s New history may say Burgers)', () => {
    const hits = [];
    for (const f of walk(path.join(ROOT, 'src'))) {
      const rel = path.relative(ROOT, f);
      for (const s of stringLiterals(fs.readFileSync(f, 'utf8'))) {
        if (said(s.text)) hits.push(`${rel}:${s.line} ${s.text.slice(0, 80)}`);
        if (saidBurger(s.text) && rel !== PATCH_NOTES_FILE) hits.push(`${rel}:${s.line} (Burger) ${s.text.slice(0, 80)}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('the scanner really reads strings (and skips comments)', () => {
    const found = stringLiterals("// 'RP' in a comment\nconst a = 'Brew · 40 RP';\nconst b = `+${n} research points`;\n/* \"RP\" */");
    expect(found.map((s) => s.text).filter(said)).toEqual(['Brew · 40 RP', ' research points']);
  });

  it('building text, tips, loading tips, perk names and descriptions, and config names', () => {
    const texts = [
      ...strings(BUILDING_DESCRIPTIONS, 'BUILDING_DESCRIPTIONS'),
      ...strings(ENEMY_DESCRIPTIONS, 'ENEMY_DESCRIPTIONS'),
      ...strings(ACHIEVEMENTS, 'ACHIEVEMENTS'),
      ...Object.entries(TIPS).map(([k, f]) => [`TIPS.${k}`, typeof f === 'function' ? f() : String(f)]),
      ...LOADING_TIPS.map((t, i) => [`LOADING_TIPS[${i}]`, String(t)]),
      ...strings(ABILITIES, 'ABILITIES'),
      ...strings(ECONOMY_ABILITIES, 'ECONOMY_ABILITIES'),
      ...strings(CONFIG)
    ];
    expect(texts.length).toBeGreaterThan(300);
    expect(texts.filter(([, v]) => said(v) || saidBurger(v))).toEqual([]);
  });

  it('amounts read as Shakes', () => {
    expect(RP_NAME).toBe('Shakes');
    expect(rpText(1)).toBe('1 Shake');
    expect(rpText(40)).toBe('40 Shakes');
    expect(rpText(1500)).toBe('1,500 Shakes');
    expect(rpText(undefined)).toBe('0 Shakes');
    expect(needRpReason(100, 60)).toBe('Need 40 more Shakes');
    expect(needRpReason(100, 99)).toBe('Need 1 more Shake');
  });
});
