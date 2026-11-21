// The bar over a visited village (VisitScene, v0.7): Back on the left, whose village it is in the middle (name,
// Village Hall, best wave), a switcher for the owner's other villages on the right, and a card for the tapped
// building (name, level, perks) at the bottom left.
import Phaser from 'phaser';
import { Button } from '../objects/Button.js';
import { drawHudPill, drawWindow, fitWidth } from '../objects/uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { buildingName, maxLevel } from '../logic/buildings.js';
import { picksOf, hasAbilities } from '../logic/abilities.js';
import { ABILITIES, PATH_COLORS } from '../abilityConfig.js';

export class VisitHudScene extends Phaser.Scene {
  constructor() {
    super('VisitHudScene');
  }

  init(data) {
    this.visit = data.visit;
  }

  create() {
    const { width } = this.scale;
    this.add.existing(new Button(this, 74, 40, 120, 48, 'Back', () => this.visit.leave(), { color: COLORS.buttonDanger, fontSize: 20 }));
    this.titleG = this.add.graphics();
    this.title = this.add.text(width / 2, 30, `${this.visit.username}'s village`, textStyle(22)).setOrigin(0.5);
    this.sub = this.add.text(width / 2, 56, '', bodyStyle(15, COLORS.text)).setOrigin(0.5);
    this.statusText = this.add.text(width / 2, this.scale.height / 2, '', textStyle(24)).setOrigin(0.5);
    this.card = null;
    this.drawSwitcher();
    this.drawTitle();
    this.add.text(width / 2, this.scale.height - 16, 'Visiting: look around, tap a building to see it. Nothing here can be changed.', bodyStyle(14, COLORS.text)).setOrigin(0.5, 1).setAlpha(0.85);
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
    const W = 330, x = 16, items = [];
    const g = this.add.graphics();
    items.push(g);
    const name = this.add.text(x + 18, 0, buildingName(b.type), textStyle(20));
    fitWidth(name, W - 36);
    const level = b.type === 'townHall' && b.level === 0 ? 'In ruins' : `Level ${b.level} / ${maxLevel(b.type)}`;
    const lv = this.add.text(x + 18, 0, level, bodyStyle(16, COLORS.inkAccent, { fontStyle: 'bold' }));
    items.push(name, lv);
    // Perks: the tier names it has, in their path's color.
    const picks = hasAbilities(b.type) ? picksOf(b) : [];
    const perkLines = picks.map((p, t) => {
      const path = ABILITIES[b.type] && ABILITIES[b.type][p];
      const tier = path && path.tiers[t];
      return tier ? { text: `Tier ${t + 1}: ${tier.name}`, color: PATH_COLORS[p] } : null;
    }).filter(Boolean);
    const lines = perkLines.length ? perkLines : hasAbilities(b.type) ? [{ text: 'No perks researched', color: null }] : [];
    const h = 72 + lines.length * 22 + 10;
    const y = this.scale.height - 34 - h;
    drawWindow(g, x, y, W, h, { header: 0 });
    name.setPosition(x + 18, y + 14);
    lv.setPosition(x + 18, y + 42);
    lines.forEach((l, i) => {
      const t = this.add.text(x + 18, y + 72 + i * 22, l.text, bodyStyle(15, COLORS.ink, { fontStyle: 'bold' }));
      if (l.color) { const dot = this.add.graphics(); dot.fillStyle(l.color, 1).fillCircle(x + 10, t.y + 10, 5); items.push(dot); }
      else t.setColor(COLORS.inkDim);
      items.push(t);
    });
    this.card = this.add.container(0, 0, items);
  }
}
