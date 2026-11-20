// Fuel Station spells on the map (src/logic/spells.js): the aiming ring while the player picks a spot (with the
// spell's picture, see-through, under the cursor), a burst when a spell lands (its picture drops onto the spot, pops
// a little bigger and fades out over about a second), the zones in play (a pulsing ring in the spell's color that fades out as it ends: rage sparks,
// rising heal crosses, frost, a shimmer, heat haze), and Lightning Strike's bolts from the sky. Visual only.
import Phaser from 'phaser';
import { gridToScreen, rangeEllipse } from '../logic/iso.js';
import { splashRing, floatText } from './Effects.js';
import { chainLightningFx } from './AbilityFx.js';
import { SPELL_COLORS, spellIconTexture } from './SpellIcons.js';
import { fitIcon } from './uiDraw.js';
import { TEX, SFX } from '../assetKeys.js';
import { playSfx } from '../audio.js';
import { spellName } from '../logic/spells.js';

const ZONE_DEPTH = 4880;  // with the range circles: over the ground and buildings, under labels
const AIM_DEPTH = 4950;
const FADE_S = 0.6;       // a zone fades out over its last moments
const AIM_ICON_ALPHA = 0.55;
const DROP_MS = 260, POP_MS = 140, ICON_FADE_MS = 1000; // the cast picture: drop in, pop, fade out
/** How big a spell's picture is drawn in a ring of this ellipse (world px): about the ring's height, within limits. */
const iconSize = (ry) => Math.max(56, Math.min(120, ry * 1.3));

export class SpellFx {
  constructor(scene, gs) {
    this.scene = scene;
    this.gs = gs;
    this.zones = new Map(); // spell id -> { g, kind, nextPuff }
    this.aimGfx = scene.add.graphics().setDepth(AIM_DEPTH).setVisible(false);
    this.aimIcon = null; // the aimed spell's picture under the cursor (made on first aim)
    gs.on('spellCast', (d) => this.onCast(d), scene);
    gs.on('spellEnded', (d) => this.endZone(d.id), scene);
  }

  /** The aiming ring at grid point (x, y): the spell's radius in its color, with a crosshair. */
  showAim(kind, x, y, radius) {
    const g = this.aimGfx, c = gridToScreen(x, y), { rx, ry } = rangeEllipse(radius);
    const color = SPELL_COLORS[kind] || 0xffffff;
    const t = this.scene.time.now;
    g.clear().setVisible(true);
    g.fillStyle(color, 0.16 + 0.05 * Math.sin(t * 0.008)).fillEllipse(c.x, c.y, rx * 2, ry * 2);
    g.lineStyle(5, 0x000000, 0.45).strokeEllipse(c.x, c.y, rx * 2, ry * 2);
    g.lineStyle(3, color, 1).strokeEllipse(c.x, c.y, rx * 2, ry * 2);
    g.lineStyle(2, 0xffffff, 0.9).strokeEllipse(c.x, c.y, rx * 2 + 6, ry * 2 + 3);
    g.lineStyle(2, 0xffffff, 0.9).lineBetween(c.x - 10, c.y, c.x + 10, c.y).lineBetween(c.x, c.y - 6, c.x, c.y + 6);
    // The spell's picture, see-through, centered under the cursor (bobbing gently).
    const key = spellIconTexture(this.scene, kind);
    if (!this.aimIcon) this.aimIcon = this.scene.add.image(0, 0, key).setDepth(AIM_DEPTH + 1);
    const icon = this.aimIcon;
    if (icon.texture.key !== key) icon.setTexture(key);
    fitIcon(icon, iconSize(ry));
    icon.setPosition(c.x, c.y - 4 + 3 * Math.sin(t * 0.005)).setAlpha(AIM_ICON_ALPHA).setVisible(true);
  }

  hideAim() {
    this.aimGfx.clear().setVisible(false);
    if (this.aimIcon) this.aimIcon.setVisible(false);
  }

  /** The cast picture: it drops onto the spot, pops a little bigger, then fades out (as the spell's effect plays). */
  dropIcon(kind, x, y, radius) {
    const sc = this.scene, { ry } = rangeEllipse(radius);
    const img = fitIcon(sc.add.image(x, y - 150, spellIconTexture(sc, kind)), iconSize(ry)).setDepth(AIM_DEPTH + 1).setAlpha(0.6);
    const base = img.scaleX;
    sc.tweens.add({
      targets: img, y: y - 4, alpha: 1, duration: DROP_MS, ease: 'Quad.easeIn',
      onComplete: () => sc.tweens.add({
        targets: img, scale: base * 1.25, duration: POP_MS, ease: 'Back.easeOut',
        onComplete: () => sc.tweens.add({
          targets: img, alpha: 0, scale: base * 1.4, duration: ICON_FADE_MS, ease: 'Quad.easeIn',
          onComplete: () => img.destroy()
        })
      })
    });
  }

  onCast(d) {
    const s = gridToScreen(d.x, d.y);
    const color = SPELL_COLORS[d.kind] || 0xffffff;
    this.dropIcon(d.kind, s.x, s.y, d.radius);
    // The burst rings go off as the picture lands; its name floats up over it.
    this.scene.time.delayedCall(DROP_MS, () => {
      splashRing(this.scene, s.x, s.y, d.radius, color, { duration: 520, depth: ZONE_DEPTH + 10 });
      splashRing(this.scene, s.x, s.y, d.radius * 0.55, 0xffffff, { duration: 380, depth: ZONE_DEPTH + 10 });
    });
    floatText(this.scene, s.x, s.y - 10 - iconSize(rangeEllipse(d.radius).ry) / 2, `${spellName(d.kind).toUpperCase()}!`, '#ffffff', 20);
    if (d.kind === 'lightning') {
      // A bolt from the sky onto each enemy struck, and a jolt.
      for (const p of d.targets || []) {
        const e = gridToScreen(p.x, p.y);
        chainLightningFx(this.scene, [{ x: e.x + Phaser.Math.Between(-30, 30), y: e.y - 360 }, { x: e.x, y: e.y - 10 }], TEX.light);
      }
      if (!(d.targets || []).length) chainLightningFx(this.scene, [{ x: s.x, y: s.y - 360 }, { x: s.x, y: s.y }], TEX.light);
      this.scene.cameras.main.shake(200, 0.006);
      playSfx(this.scene, SFX.mortarImpact);
      return;
    }
    playSfx(this.scene, this.scene.cache.audio.exists(SFX.abilityUnlocked) ? SFX.abilityUnlocked : SFX.upgrade);
    this.zones.set(d.id, { g: this.scene.add.graphics().setDepth(ZONE_DEPTH), kind: d.kind, nextPuff: 0 });
  }

  endZone(id) {
    const z = this.zones.get(id);
    if (!z) return;
    z.g.destroy();
    this.zones.delete(id);
  }

  /** Every frame: redraw the zones in play (they pulse, and fade out as they end). */
  update(time) {
    const active = this.gs.activeSpells || [];
    for (const [id, z] of this.zones) if (!active.some((s) => s.id === id)) this.endZone(id);
    for (const s of active) {
      const z = this.zones.get(s.id);
      if (!z) continue;
      const c = gridToScreen(s.x, s.y), { rx, ry } = rangeEllipse(s.radius);
      const color = SPELL_COLORS[s.kind] || 0xffffff;
      const fade = Math.min(1, s.t / FADE_S, (s.duration - s.t) / 0.2 + 0.3);
      const k = 0.5 + 0.5 * Math.sin(time * (s.kind === 'heat' ? 0.02 : 0.006));
      const g = z.g;
      g.clear().setAlpha(Math.max(0, fade));
      g.fillStyle(color, s.kind === 'freeze' ? 0.24 : 0.14 + 0.06 * k).fillEllipse(c.x, c.y, rx * 2, ry * 2);
      g.lineStyle(3, color, 0.9).strokeEllipse(c.x, c.y, rx * 2 * (0.98 + 0.02 * k), ry * 2 * (0.98 + 0.02 * k));
      g.lineStyle(1.5, 0xffffff, 0.35 + 0.3 * k).strokeEllipse(c.x, c.y, rx * 1.4, ry * 1.4);
      // Little puffs inside the zone now and then: crosses, sparks, snowflakes, shimmer, heat.
      if (time >= z.nextPuff && fade > 0.5) {
        z.nextPuff = time + (s.kind === 'heat' ? 160 : 260);
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.85;
        const px = c.x + Math.cos(a) * rx * r, py = c.y + Math.sin(a) * ry * r;
        const glyph = { heal: '+', rage: '!', freeze: '❄', invisibility: '✦', heat: '~' }[s.kind] || '•';
        const ink = { heal: '#9bf07a', rage: '#ff8a7a', freeze: '#d8f4ff', invisibility: '#e2d6ff', heat: '#ffc06a' }[s.kind] || '#ffffff';
        floatText(this.scene, px, py, glyph, ink, s.kind === 'heal' ? 20 : 16);
      }
    }
  }

  destroy() {
    for (const id of [...this.zones.keys()]) this.endZone(id);
    this.aimGfx.destroy();
    if (this.aimIcon) this.aimIcon.destroy();
  }
}
