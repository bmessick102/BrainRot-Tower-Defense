// A hero's profile window (v0.12.1), opened from the shop's info card for any hero (the Brisket King, the Hatsune Queen,
// the Locklair Mage), built or not: the hero's picture, name and role; his or her stats at a level you step through with
// the arrows (starting at your hero's level, or 1); the level's price and the Village Hall it needs; the ability's icon
// and what it does; and the three RV Lab perk paths. Stats include the perks you've researched for that hero.
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { drawShowcaseCard, drawGlossy, drawStatBar, fitIcon } from './uiDraw.js';
import { currencyCost } from './CurrencyCost.js';
import { buildingTextureKey } from './BuildingView.js';
import { ensureEncoreTextures, ENCORE_COLOR } from './EncoreIcon.js';
import { ensureAegisTexture, AEGIS_COLOR } from './AegisIcon.js';
import { TEX } from '../assetKeys.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { CONFIG } from '../config.js';
import { ABILITIES, PATH_COLORS, picksFor } from '../abilityConfig.js';
import { levelStats, maxLevel, typeConfig } from '../logic/buildings.js';
import { heroStatsFor, heroAbilityProgress } from '../logic/heroes.js';
import { formatGold } from '../logic/economy.js';

const W = 760, H = 510;
const PIC = { w: 220, h: 250 };
// What each hero is, under the name, and his or her picture (the walking heroes' own art; the Mage is his statue).
const HERO_INFO = {
  altar: { role: 'Melee guardian · fights ground enemies near his altar', pic: () => 'hero_brisket' },
  queenAltar: { role: 'Crossbow sniper · ground & air · stays back', pic: () => 'hero_queen' },
  mageAltar: { role: 'Spellcaster on his pedestal · ground & air · heals', pic: (scene, level) => buildingTextureKey(scene, 'mageAltar', level) }
};

/** Open the profile window of hero building type `type` ('altar' | 'queenAltar' | 'mageAltar') in `scene`. */
export function openHeroWindow(scene, gs, type) {
  const own = gs.buildings.find((b) => b.type === type);
  const top = maxLevel(type);
  const view = { level: own ? own.level : 1 };
  const md = new Modal(scene, { width: W, height: H, title: typeConfig(type).heroName, header: 56 });
  const draw = () => {
    md.clear();
    const level = view.level;
    const altar = { type, level, picks: picksFor(gs.research, type), hp: levelStats(type, level).hp };
    const st = heroStatsFor(altar);
    const L = levelStats(type, level);
    const g = md.add(scene.add.graphics());
    // Picture card on the left.
    const px = md.x + 28, py = md.y + 76;
    drawShowcaseCard(g, px, py, PIC.w, PIC.h, { tileY: py + PIC.h - 40, tileW: 120 });
    const key = HERO_INFO[type].pic(scene, level);
    if (scene.textures.exists(key)) md.add(fitIcon(scene.add.image(px + PIC.w / 2, py + PIC.h - 26, key).setOrigin(0.5, 1), PIC.w - 30, PIC.h - 40));
    // Level picker under it.
    const ly = py + PIC.h + 30;
    md.add(scene.add.text(px + PIC.w / 2, ly, `Level ${level} / ${top}`, textStyle(20)).setOrigin(0.5));
    const step = (d) => { view.level = Math.max(1, Math.min(top, view.level + d)); draw(); };
    const prev = md.add(new Button(scene, px + 22, ly, 44, 40, '◀', () => step(-1), { color: COLORS.buttonBlue, fontSize: 18, radius: 9 }));
    const next = md.add(new Button(scene, px + PIC.w - 22, ly, 44, 40, '▶', () => step(1), { color: COLORS.buttonBlue, fontSize: 18, radius: 9 }));
    prev.setEnabled(level > 1);
    next.setEnabled(level < top);
    const yours = own && own.level === level ? 'Your hero is at this level' : own ? `Yours: Level ${own.level}` : 'Not built yet';
    md.add(scene.add.text(px + PIC.w / 2, ly + 30, yours, bodyStyle(13, COLORS.inkDim)).setOrigin(0.5));
    // Right column: role, stats, price.
    const cx = px + PIC.w + 28, cw = md.x + W - 28 - cx;
    md.add(scene.add.text(cx, py, HERO_INFO[type].role, bodyStyle(15, COLORS.inkAccent, { fontStyle: 'bold', wordWrap: { width: cw } })));
    const fmt = (n) => formatGold(Math.round(n));
    const perSec = (iv) => `${Math.round((1 / iv) * 100) / 100} / s`;
    const rows = type === 'altar' ? [
      ['Health', fmt(st.maxHp)], ['Damage', `${fmt(st.damage)} per hit`], ['Attack speed', perSec(st.attackInterval)],
      ['Guard range', `${st.guardRange} tiles`], ['Altar health', fmt(L.hp)]
    ] : type === 'queenAltar' ? [
      ['Health', fmt(st.maxHp)], ['Damage', `${fmt(st.damage)} per bolt`], ['Attack speed', perSec(st.attackInterval)],
      ['Range / guard', `${st.attackRange} / ${st.guardRange} tiles`], ['Altar health', fmt(L.hp)]
    ] : [
      ['Health', fmt(st.maxHp)], ['Damage', `${fmt(st.damage)} per zap`], ['Attack speed', perSec(st.attackInterval)],
      ['Range', `${st.attackRange} tiles`], ['Sanctuary Aura', `${fmt(st.heal)} HP/s · ${st.auraRadius} tiles`]
    ];
    const needs = L.townHall || (type === 'altar' ? Math.max(typeConfig(type).unlockTownHall, level) : typeConfig(type).unlockTownHall);
    let y = py + 34;
    for (const [i, [label, value]] of rows.entries()) {
      if (i > 0) g.fillStyle(COLORS.frame, 0.12).fillRect(cx, y - 4, cw, 1);
      md.add(scene.add.text(cx, y, label, bodyStyle(15, COLORS.inkDim)));
      md.add(scene.add.text(cx + cw, y, value, bodyStyle(15, COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0));
      y += 26;
    }
    const price = md.add(currencyCost(scene, [{ amount: L.cost, currency: L.costCurrency || 'gold' }],
      bodyStyle(15, COLORS.ink, { fontStyle: 'bold' }), level === 1 ? 'Build' : 'Upgrade', 18));
    price.setPosition(cx, y + 8);
    md.add(scene.add.text(cx + cw, y, `Village Hall ${needs} required`, bodyStyle(15, COLORS.inkDim)).setOrigin(1, 0));
    y += 26;
    // The ability.
    y += 8;
    const ab = abilityOf(scene, type, st);
    const slot = 60;
    g.fillStyle(COLORS.frame, 0.25).fillRoundedRect(cx, y, cw, 96, 12);
    g.fillStyle(COLORS.tray, 1).fillRoundedRect(cx + 2, y + 3, cw - 4, 91, 11);
    drawGlossy(g, cx + 10, y + 18, slot, slot, ab.color, { radius: 12, lip: 4 });
    if (scene.textures.exists(ab.icon)) md.add(fitIcon(scene.add.image(cx + 10 + slot / 2, y + 18 + slot / 2 - 2, ab.icon), slot - 12));
    const tx = cx + 10 + slot + 12;
    const title = md.add(scene.add.text(tx, y + 8, ab.name, textStyle(18)));
    md.add(scene.add.text(title.x + title.width + 8, y + 12, `Ability · ${ab.charges}x per wave`, textStyle(13, COLORS.textGold)));
    md.add(scene.add.text(tx, y + 34, ab.text, bodyStyle(13, COLORS.ink, { wordWrap: { width: cx + cw - 12 - tx }, lineSpacing: 2 })));
    y += 107;
    drawHeroAbilityProgress(scene, md, g, altar, cx, y, cw, ab.color);
    y += 39;
    // The perk paths.
    md.add(scene.add.text(cx, y, 'RV Lab perk paths', bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })));
    let x = cx;
    y += 24;
    for (const p of ['a', 'b', 'c']) {
      const name = ABILITIES[type][p].name;
      const t = scene.add.text(0, 0, `${p.toUpperCase()} · ${name}`, textStyle(15));
      const w = t.width + 20;
      drawGlossy(g, x, y, w, 30, PATH_COLORS[p], { radius: 9, lip: 3, shadow: false });
      md.add(t.setPosition(x + 10, y + 5));
      x += w + 8;
    }
  };
  draw();
  return md;
}

export function drawHeroAbilityProgress(scene, parent, g, altar, x, y, w, color) {
  const { label, value, max, next, nextLevel, unit } = heroAbilityProgress(altar);
  const gain = nextLevel ? ` → ${next}${unit} at Lv ${nextLevel}` : '';
  parent.add(scene.add.text(x, y, label, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })));
  parent.add(scene.add.text(x + w, y, `${value}${unit}${gain}`, bodyStyle(14, COLORS.inkGood, { fontStyle: 'bold' })).setOrigin(1, 0));
  drawStatBar(g, x, y + 19, w, value / max, color, 9);
}

/** A hero's ability for the window: { name, icon, color, charges, text } from his or her stats at the shown level. */
function abilityOf(scene, type, st) {
  if (type === 'queenAltar') {
    const E = CONFIG.queenAltar.hero.encore;
    return { name: 'Encore Cloak', icon: ensureEncoreTextures(scene), color: ENCORE_COLOR, charges: st.encoreCharges,
      text: `She vanishes for ${st.encoreSeconds} s: enemies lose track of her, her bolts deal +${E.damagePct}% damage and pierce ${E.pierce} enemies, and she heals ${E.healPct}%.` };
  }
  if (type === 'mageAltar') {
    return { name: 'Arcane Aegis', icon: ensureAegisTexture(scene), color: AEGIS_COLOR, charges: st.aegisCharges,
      text: `Every building inside his aura (${st.auraRadius} tiles), his own too, can't be damaged for ${st.aegisSeconds} s.` };
  }
  const F = CONFIG.altar.hero.feast;
  return { name: 'Brisket Feast', icon: TEX.feastReady, color: COLORS.button, charges: st.feastCharges,
    text: `Heals him ${st.feastHealPct}%, then he rages for ${F.boostSeconds} s (+${F.damagePct}% damage, +${F.speedPct}% speed) and slams and stuns enemies around him.` };
}
