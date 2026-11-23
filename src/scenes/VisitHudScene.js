// The bar over a visited village (VisitScene, v0.7): Back on the left, whose village it is in the middle (name,
// Village Hall, best wave), a switcher for the owner's other villages on the right, and a card for the tapped
// building at the bottom left. v0.7.1: the card looks like the game's own building windows: a slate header with the
// name and gold level, a red X, the building's picture on its blue showcase card with its stats beside it, and
// its researched perks as chips in their path's color.
import Phaser from 'phaser';
import { Button } from '../objects/Button.js';
import { drawHudPill, drawWindow, drawShowcaseCard, drawGlossy, fitWidth, fitIcon, addHeroBadge, heroKindOf } from '../objects/uiDraw.js';
import { buildingTextureKey, buildingPictureKey, MERGE_GEAR } from '../objects/BuildingView.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { buildingName, maxLevel, maxHp, levelStats, typeConfig, isDefense, displayName, mergedConfigOf } from '../logic/buildings.js';
import { formatGold } from '../logic/economy.js';
import { fpW, fpH } from '../logic/grid.js';
import { picksOf, hasAbilities } from '../logic/abilities.js';
import { ABILITIES, PATH_COLORS } from '../abilityConfig.js';

export class VisitHudScene extends Phaser.Scene {
  constructor() {
    super('VisitHudScene');
  }

  init(data) {
    this.visit = data.visit;
    this.statusText = null;
    this.card = null;
  }

  create() {
    const { width } = this.scale;
    // The scene object lives on between visits: once stopped (Back, or switching villages), forget its texts and card.
    // They're destroyed with the scene, and the next VisitScene talks to this object before it is created again
    // (setting text on a destroyed one threw in VisitScene.create: a stuck screen on the second visit).
    this.events.once('shutdown', () => { this.statusText = null; this.card = null; });
    this.add.existing(new Button(this, 74, 40, 120, 48, 'Back', () => this.visit.leave(), { color: COLORS.buttonDanger, fontSize: 20 }));
    this.titleG = this.add.graphics();
    this.title = this.add.text(width / 2, 30, `${this.visit.username}'s village`, textStyle(22)).setOrigin(0.5);
    this.sub = this.add.text(width / 2, 56, '', bodyStyle(15, COLORS.text)).setOrigin(0.5);
    this.statusText = this.add.text(width / 2, this.scale.height / 2, this.visit.statusMsg || '', textStyle(24)).setOrigin(0.5).setAlign('center');
    this.card = null;
    this.drawSwitcher();
    this.drawTitle();
    if (this.visit.gs && this.visit.base) this.showVillage(this.visit.base); // the village came in before this started
    this.add.text(width / 2, this.scale.height - 16, 'Visiting: look around, tap a building to see it. Nothing here can be changed.', bodyStyle(14, COLORS.text)).setOrigin(0.5, 1).setAlpha(0.85);
  }

  /** Is the screen point on the HUD (the top bar or the building card)? Then the map ignores it. */
  covers(x, y) {
    if (y < 80) return true;
    const c = this.card;
    return !!(c && c.cardW && x >= c.x && x <= c.x + c.cardW && y >= c.y && y <= c.y + c.cardH);
  }

  setStatus(text) { if (this.statusText) this.statusText.setText(text || ''); }

  drawTitle() {
    const w = Math.max(this.title.width, this.sub.width) + 48, x = this.scale.width / 2 - w / 2;
    this.titleG.clear();
    drawHudPill(this.titleG, x, 8, w, 64);
  }

  showVillage(base) {
    this.title.setText(`${base.username}'s ${base.name}`);
    fitWidth(this.title, 560);
    this.sub.setText(`Village Hall ${base.townHall || '-'}  ·  Best wave ${base.bestWave || 0}`);
    this.drawTitle();
  }

  /** ◀ village i / n ▶ when the owner has more than one village to show. */
  drawSwitcher() {
    const bases = this.visit.bases || [];
    if (bases.length < 2) return;
    const { width } = this.scale;
    const i = Math.max(0, bases.findIndex((b) => b.id === this.visit.baseId));
    const go = (d) => this.visit.switchTo(bases[(i + d + bases.length) % bases.length].id);
    const x = width - 150;
    const g = this.add.graphics();
    drawHudPill(g, x - 128, 14, 256, 52);
    this.add.existing(new Button(this, x - 100, 40, 40, 40, '', () => go(-1), { color: COLORS.buttonBlue, icon: 'left', radius: 9 }));
    this.add.existing(new Button(this, x + 100, 40, 40, 40, '', () => go(1), { color: COLORS.buttonBlue, icon: 'right', radius: 9 }));
    const name = this.add.text(x, 32, bases[i].name, textStyle(16)).setOrigin(0.5);
    fitWidth(name, 140);
    this.add.text(x, 52, `Village ${i + 1} of ${bases.length}`, bodyStyle(13, COLORS.text)).setOrigin(0.5);
  }

  /** The tapped building's card (bottom left), or none. */
  showBuilding(b) {
    if (this.card) { this.card.destroy(true); this.card = null; }
    if (!b) return;
    const W = 380, HEADER = 62, PIC = { w: 112, h: 132 }, pad = 18;
    const c = this.add.container(0, 0).setDepth(10);
    const bg = this.add.graphics();
    c.add(bg);
    // A click on the card stays on the card (the map under it doesn't pan or pick another building).
    const blocker = this.add.zone(0, 0, W, 10).setOrigin(0).setInteractive();
    c.add(blocker);

    // Header: name, and the level in gold (like the building panel in the game).
    const name = this.add.text(pad, 10, displayName(b), textStyle(22)); // (a merged defense: "Mega Cannon")
    fitWidth(name, W - pad - 60);
    const ruin = b.type === 'townHall' && b.level === 0;
    const merge = mergedConfigOf(b);
    const lv = this.add.text(pad, 37, ruin ? 'In ruins' : `Level ${b.level} / ${maxLevel(b.type)}${merge ? '  ·  Merged' : ''}`, textStyle(15, COLORS.textGold));
    c.add([name, lv]);
    c.add(new Button(this, W - 10, 10, 40, 40, '', () => this.visit.select(null), { color: COLORS.buttonDanger, icon: 'x', radius: 9 }));

    // Picture on its showcase card, stats beside it.
    const top = HEADER + 14;
    const pg = this.add.graphics();
    c.add(pg);
    const tileY = top + PIC.h - 32, tileW = 54;
    drawShowcaseCard(pg, pad, top, PIC.w, PIC.h, { tileY, tileW });
    const key = b.level >= 1 ? buildingPictureKey(this, b) : buildingTextureKey(this, b.type, 1); // (a merged one's own art)
    if (key && this.textures.exists(key)) {
      const pic = this.add.image(pad + PIC.w / 2, tileY + tileW * 0.3, key).setOrigin(0.5, 1);
      fitIcon(pic, PIC.w - 20, PIC.h - 40);
      c.add(pic);
    }
    if (b.type === 'altar' || b.type === 'queenAltar') c.add(addHeroBadge(this, pad + PIC.w - 22, top + 22, 32, heroKindOf(b.type))); // the hero's portrait
    if (merge && this.textures.exists(MERGE_GEAR)) c.add(fitIcon(this.add.image(pad + PIC.w - 20, top + 20, MERGE_GEAR), 32)); // merged: the gear
    const col = pad + PIC.w + 16, colW = W - col - pad;
    let sy = top + 2;
    for (const [label, value] of this.statRows(b)) {
      const row = this.add.graphics();
      row.fillStyle(0xe6e0d2, 1).fillRoundedRect(col, sy, colW, 28, 8);
      const l = this.add.text(col + 10, sy + 14, label, bodyStyle(14, COLORS.inkDim, { fontStyle: 'bold' })).setOrigin(0, 0.5);
      const v = this.add.text(col + colW - 10, sy + 14, value, bodyStyle(15, COLORS.ink, { fontStyle: 'bold' })).setOrigin(1, 0.5);
      fitWidth(v, colW - l.width - 26);
      c.add([row, l, v]);
      sy += 32;
    }
    let y = Math.max(top + PIC.h, sy) + 14;
    // A merged defense: its ability in one line, in gold.
    if (merge) {
      const ab = this.add.text(pad, y, `${merge.ability}: ${merge.abilityShort}`, bodyStyle(14, '#8a5a00', { fontStyle: 'bold', wordWrap: { width: W - pad * 2 } }));
      c.add(ab);
      y += ab.height + 12;
    }

    // Perks: a chip per researched tier, in its path's color (the RV Lab's look).
    if (hasAbilities(b.type)) {
      c.add(this.add.text(pad, y, 'Perks', textStyle(17)));
      y += 28;
      const picks = picksOf(b);
      const tiers = picks.map((p, t) => {
        const path = ABILITIES[b.type] && ABILITIES[b.type][p];
        const tier = path && path.tiers[t];
        return tier ? { name: tier.name, t, color: PATH_COLORS[p] } : null;
      }).filter(Boolean);
      if (!tiers.length) {
        c.add(this.add.text(pad, y, 'No perks researched yet', bodyStyle(15, COLORS.inkDim, { fontStyle: 'bold' })));
        y += 26;
      }
      for (const tier of tiers) {
        const pg2 = this.add.graphics();
        drawGlossy(pg2, pad, y, W - pad * 2, 34, tier.color, { radius: 10, lip: 3, shadow: false });
        const tag = this.add.text(pad + 12, y + 15, `Tier ${tier.t + 1}`, textStyle(14)).setOrigin(0, 0.5);
        const tn = this.add.text(pad + 80, y + 15, tier.name, textStyle(16)).setOrigin(0, 0.5);
        fitWidth(tn, W - pad * 2 - 92);
        c.add([pg2, tag, tn]);
        y += 40;
      }
    }
    y += 6;
    drawWindow(bg, 0, 0, W, y, { header: HEADER });
    blocker.setSize(W, y);
    c.setPosition(16, this.scale.height - 34 - y);
    c.cardW = W; c.cardH = y;
    this.card = c;
  }

  /** [label, value] rows for the card: health, and for defenses their damage, range and targets. */
  statRows(b) {
    if (b.type === 'townHall' && b.level === 0) return [['Health', formatGold(levelStats(b.type, 0).hp || 0)]];
    const rows = [['Health', formatGold(maxHp(b))], ['Size', `${fpW(b)} x ${fpH(b)} tiles`]];
    if (isDefense(b.type)) {
      const cfg = typeConfig(b.type), st = levelStats(b.type, b.level) || {};
      const m = mergedConfigOf(b); // merged: its damage per shot (per shell) and its extra range
      if (st.damage) rows.push(['Damage', m && m.triple ? `${m.triple.shells} x ${formatGold(Math.round(st.damage * m.triple.shellMult))}` : formatGold(Math.round(st.damage * (m ? m.damageMult : 1)))]);
      if (cfg.range) rows.push(['Range', `${Math.round((cfg.range + (m ? m.rangeAdd : 0)) * 10) / 10} tiles`]);
      if (cfg.hitsGround || cfg.hitsAir) rows.push(['Targets', cfg.hitsGround && cfg.hitsAir ? 'Ground & Air' : cfg.hitsAir ? 'Air' : 'Ground']);
    }
    return rows;
  }
}
