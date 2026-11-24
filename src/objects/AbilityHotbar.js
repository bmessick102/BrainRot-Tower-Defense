// The ability hotbar (UIScene, bottom middle): one slot per ability the player triggers by hand, from
// src/logic/hotbar.js: Brisket Feast, the Hatsune Queen's Encore Cloak, DJ Babyface's Drop the Beat, and the brewed Fuel Station spells. It shows
// while a wave is coming or on (and there is something to put on it). Each slot: its icon, its number key (1-9),
// a meter (Feast / Encore charges left, the DJ's hype), a count badge, a pulsing glow when ready (greyed out when not), and a
// tooltip on hover. Clicking a slot (or pressing its number) uses it; a spell starts aiming on the map
// (GameScene.beginSpellAim: click the map to cast, right click / Esc / the slot again to cancel).
import { drawWindow, drawGlossy, drawBadge, drawStatBar, fitIcon } from './uiDraw.js';
import { spellIconTexture, SPELL_COLORS } from './SpellIcons.js';
import { Modal } from './Modal.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';
import { TEX, SFX } from '../assetKeys.js';
import { playSfx } from '../audio.js';
import { hotbarSlots, slotForKey } from '../logic/hotbar.js';
import { ensureEncoreTextures, ENCORE_COLOR } from './EncoreIcon.js';
import { ensureAegisTexture, AEGIS_COLOR } from './AegisIcon.js';

const S = 60, GAP = 8, PAD = 10;          // slot size, gap, panel padding
const BOTTOM = 712;                       // the panel's bottom edge on screen
const DEPTH = 450;                        // over the quick bar / info panel (400), under the shop (500) and guide (700)
const SLOT_COLOR = { feast: COLORS.button, encore: 0x1f9e98, aegis: 0x6a2fc0, beat: 0xa25cff, spell: 0x4a5159 };
const TIP_W = 270;

export class AbilityHotbar {
  constructor(scene, gs, world) {
    this.scene = scene;
    this.gs = gs;
    this.world = world;
    this.c = scene.add.container(0, 0).setDepth(DEPTH).setVisible(false);
    this.bg = scene.add.graphics();
    this.blocker = scene.add.zone(0, 0, 10, 10).setOrigin(0).setInteractive(); // clicks between slots stay off the map
    this.c.add([this.bg, this.blocker]);
    this.slotViews = [];
    this.sig = '';
    this.shownRect = null;
    this.tip = null;
    this.hoverId = null;
    this.avoid = [];                       // screen rects to keep clear of (UIScene: the guide bubble)
    this.extraAvoid = null;                // ...and a tall info panel that couldn't move out of the way
    scene.input.keyboard.on('keydown', (ev) => this.onKey(ev));
  }

  /** The panel's screen rect while it shows, else null. */
  rect() {
    return this.c.visible ? this.shownRect : null;
  }

  /** Should the bar show? While a wave counts down or attacks, outside edit mode, with something on it. */
  wanted(slots) {
    const w = this.gs.wave;
    const on = !!w && (w.phase === 'active' || w.phase === 'countdown');
    return on && !this.gs.gameOver && !this.world.editMode && slots.length > 0;
  }

  /** Number keys 1-9 use the slots (F stays a shortcut for Brisket Feast, G for Encore Cloak, H for Arcane Aegis). */
  onKey(ev) {
    if (!this.c.visible || Modal.isOpen(this.scene)) return;
    const slots = this.slots || [];
    const key = ev.key;
    const slot = key === 'f' || key === 'F' ? slots.find((s) => s.type === 'feast')
      : key === 'g' || key === 'G' ? slots.find((s) => s.type === 'encore')
        : key === 'h' || key === 'H' ? slots.find((s) => s.type === 'aegis') : slotForKey(slots, key);
    if (slot) this.activate(slot);
  }

  /** Use a slot: Feast and Drop the Beat go off at once; a spell starts (or stops) aiming. */
  activate(slot) {
    const aiming = this.world.spellAim && this.world.spellAim.kind;
    if (slot.type === 'spell' && aiming === slot.kind) { this.world.cancelSpellAim(); return; }
    if (!slot.ready) { playSfx(this.scene, SFX.invalid); return; }
    if (slot.type === 'feast') this.gs.useFeast(); // its sound and effects play from the heroFeast event
    else if (slot.type === 'encore') this.gs.useEncore(); // ...and Encore Cloak's from queenEncore
    else if (slot.type === 'aegis') this.gs.useAegis(); // ...and Arcane Aegis's from mageAegis
    else if (slot.type === 'beat') this.gs.dropTheBeat(slot.buildingId);
    else if (slot.type === 'spell') { playSfx(this.scene, SFX.uiClick); this.world.beginSpellAim(slot.kind); }
  }

  /**
   * Where the panel goes: bottom middle, nudged sideways (or up) to keep clear of the `avoid` rects (the guide
   * bubble) and `extraAvoid` (a tall info panel with no room to move: UIScene.placeInfoPanel).
   */
  place(w, h, withExtra = true) {
    const list = [...this.avoid, ...(withExtra && this.extraAvoid ? [this.extraAvoid] : [])];
    let x = Math.round(640 - w / 2), y = BOTTOM - h;
    const hit = (r, px, py) => r && px < r.x + r.w + 8 && px + w > r.x - 8 && py < r.y + r.h + 8 && py + h > r.y - 8;
    for (const r of list) {
      if (!hit(r, x, y)) continue;
      // Slide right of it, or left of it, whichever stays on screen (clear of the Edit / Shop buttons on the
      // right); else lift the bar above it.
      const right = r.x + r.w + 8, left = r.x - 8 - w;
      if (right + w <= 1004 && !list.some((o) => o !== r && hit(o, right, y))) x = right;
      else if (left >= 16 && !list.some((o) => o !== r && hit(o, left, y))) x = left;
      else y = r.y - 8 - h;
    }
    return { x, y, w, h };
  }

  /** Where the bar would be without stepping around the info panel (so the panel can decide whether to move). */
  naturalRect() {
    const r = this.rect();
    return r ? this.place(r.w, r.h, false) : null;
  }

  /** Every frame: rebuild when the slots change, otherwise refresh their state. */
  update(time) {
    const slots = hotbarSlots(this.gs);
    this.slots = slots;
    const show = this.wanted(slots);
    if (!show) {
      if (this.c.visible) { this.c.setVisible(false); this.hideTip(); }
      return;
    }
    const sig = slots.map((s) => s.id).join('|');
    const w = slots.length * S + (slots.length - 1) * GAP + PAD * 2, h = S + PAD * 2;
    const r = this.place(w, h);
    if (sig !== this.sig || !this.c.visible) this.build(slots, w, h);
    if (!this.shownRect || r.x !== this.shownRect.x || r.y !== this.shownRect.y) this.c.setPosition(r.x, r.y);
    this.shownRect = r;
    this.c.setVisible(true);
    const aiming = this.world.spellAim && this.world.spellAim.kind;
    slots.forEach((s, i) => this.drawSlot(this.slotViews[i], s, time, s.type === 'spell' && aiming === s.kind));
    if (this.hoverId) {
      const s = slots.find((x) => x.id === this.hoverId);
      if (s) this.showTip(s, slots.indexOf(s)); else this.hideTip();
    }
  }

  build(slots, w, h) {
    this.sig = slots.map((s) => s.id).join('|');
    for (const v of this.slotViews) v.c.destroy();
    this.slotViews = [];
    this.hideTip();
    this.bg.clear();
    drawWindow(this.bg, 0, 0, w, h, { radius: 14 });
    this.bg.fillStyle(COLORS.frame, 0.25).fillRoundedRect(6, 6, w - 12, h - 12, 10);
    this.bg.fillStyle(COLORS.tray, 1).fillRoundedRect(7, 8, w - 14, h - 15, 9);
    this.blocker.setSize(w, h);
    if (this.blocker.input) this.blocker.input.hitArea.setSize(w, h);
    slots.forEach((s, i) => {
      const x = PAD + i * (S + GAP), y = PAD;
      const c = this.scene.add.container(x, y);
      const glow = this.scene.add.graphics();
      const face = this.scene.add.graphics();
      drawGlossy(face, 0, 0, S, S, SLOT_COLOR[s.type], { radius: 11, lip: 3, shadow: false });
      const icon = this.iconFor(s);
      const meter = this.scene.add.graphics();
      const key = this.scene.add.text(5, 2, String(i + 1), textStyle(13)).setOrigin(0, 0);
      const badge = this.scene.add.graphics();
      const count = this.scene.add.text(S - 6, 5, '', textStyle(12)).setOrigin(0.5);
      const ring = this.scene.add.graphics();
      const zone = this.scene.add.zone(0, 0, S, S).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { this.hoverId = s.id; this.showTip(this.slots.find((x) => x.id === s.id) || s, i); });
      zone.on('pointerout', () => { if (this.hoverId === s.id) { this.hoverId = null; this.hideTip(); } });
      zone.on('pointerdown', (p, lx, ly, ev) => {
        if (ev) ev.stopPropagation();
        const cur = this.slots.find((x) => x.id === s.id);
        if (cur) this.activate(cur);
      });
      c.add([glow, face, icon, meter, ring, key, badge, count, zone]);
      this.c.add(c);
      this.slotViews.push({ c, glow, face, icon, meter, key, badge, count, ring, lastBadge: null });
    });
  }

  /** The slot's picture: the Feast crown and beat art when loaded, the spell's picture (or its drawn icon). */
  iconFor(s) {
    const sc = this.scene;
    const key = s.type === 'spell' ? spellIconTexture(sc, s.kind) : s.type === 'feast' ? TEX.feastReady : s.type === 'encore' ? ensureEncoreTextures(sc) : s.type === 'aegis' ? ensureAegisTexture(sc) : TEX.beatReady;
    if (sc.textures.exists(key)) return fitIcon(sc.add.image(S / 2, S / 2 - 2, key), s.type === 'spell' ? 48 : 44);
    return sc.add.text(S / 2, S / 2 - 3, s.type === 'feast' ? 'FEAST' : s.type === 'encore' ? 'ENCORE' : s.type === 'aegis' ? 'AEGIS' : 'DROP', textStyle(13, '#ffe2ff')).setOrigin(0.5);
  }

  drawSlot(v, s, time, aiming) {
    if (!v) return;
    const ready = s.ready;
    if (v.icon.setTint) { if (ready || aiming) v.icon.clearTint(); else v.icon.setTint(0x777777); }
    v.icon.setAlpha(ready || aiming ? 1 : 0.65);
    v.face.setAlpha(ready || aiming ? 1 : 0.7);
    // Meter along the bottom (Feast charges left, hype), filled in the slot's color.
    v.meter.clear();
    if (s.meter !== null && s.meter !== undefined) drawStatBar(v.meter, 5, S - 12, S - 10, s.meter, s.type === 'beat' ? 0xe0a8ff : s.type === 'encore' ? 0x7ff0e8 : s.type === 'aegis' ? 0xd7a8ff : 0xffd34a, 8);
    // Count badge (spells brewed, Feast charges).
    const n = s.count;
    if (n !== v.lastBadge) {
      v.lastBadge = n;
      v.badge.clear();
      if (n !== null && n !== undefined) { drawBadge(v.badge, S - 6, 5, 10); v.count.setText(String(n)).setVisible(true); } else v.count.setVisible(false);
    }
    // Ready: a pulsing glow in the slot's color. Aiming: a steady gold ring.
    v.glow.clear();
    v.ring.clear();
    const color = s.type === 'spell' ? SPELL_COLORS[s.kind] : s.type === 'beat' ? 0xc070ff : s.type === 'encore' ? ENCORE_COLOR : s.type === 'aegis' ? AEGIS_COLOR : 0xffd34a;
    if (aiming) {
      v.ring.lineStyle(4, 0xffe066, 1).strokeRoundedRect(-3, -3, S + 6, S + 6, 13);
    } else if (s.guide) {
      // The Fuel Station guide's free Karuba Coffee (Rage): a bright gold pulse and a bouncing arrow until it's cast.
      const k = 0.5 + 0.5 * Math.sin(time * 0.01);
      v.glow.fillStyle(0xffe066, 0.45 + 0.4 * k).fillRoundedRect(-6 - 3 * k, -6 - 3 * k, S + 12 + 6 * k, S + 12 + 6 * k, 16);
      v.ring.lineStyle(4, 0xffe066, 1).strokeRoundedRect(-3, -3, S + 6, S + 6, 13);
      const ay = -14 - Math.abs(Math.sin(time * 0.006)) * 10, cx = S / 2;
      const arrow = [{ x: cx, y: ay }, { x: cx - 12, y: ay - 14 }, { x: cx - 5, y: ay - 14 }, { x: cx - 5, y: ay - 26 }, { x: cx + 5, y: ay - 26 }, { x: cx + 5, y: ay - 14 }, { x: cx + 12, y: ay - 14 }];
      v.ring.fillStyle(0xffe066, 1).fillPoints(arrow, true);
      v.ring.lineStyle(3, 0x3a2400, 1).strokePoints(arrow, true);
    } else if (ready) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.006);
      v.glow.fillStyle(color, 0.35 + 0.35 * k).fillRoundedRect(-4 - 2 * k, -4 - 2 * k, S + 8 + 4 * k, S + 8 + 4 * k, 14);
      v.ring.lineStyle(3, color, 0.7 + 0.3 * k).strokeRoundedRect(-2, -2, S + 4, S + 4, 12);
      v.ring.lineStyle(1.5, 0xffffff, 0.5 + 0.5 * k).strokeRoundedRect(1, 1, S - 2, S - 2, 10);
    }
  }

  /** Tooltip above a slot: name, key, what it does, and whether it's ready (or why not). */
  showTip(s, i) {
    const sc = this.scene;
    const aiming = this.world.spellAim && this.world.spellAim.kind === s.kind && s.type === 'spell';
    const status = aiming ? 'Click the map to cast · right click or Esc to cancel'
      : s.ready ? (s.type === 'spell' ? 'Ready: click, then click the map' : 'Ready!') : s.reason || '';
    const key = `${s.id}|${status}|${s.desc}`;
    if (this.tip && this.tip.key === key) return;
    this.hideTip();
    const c = sc.add.container(0, 0).setDepth(DEPTH + 5);
    const g = sc.add.graphics();
    const title = sc.add.text(14, 10, `${s.name}`, textStyle(17));
    const hint = sc.add.text(TIP_W - 14, 13, `key ${i + 1}${s.type === 'feast' ? ' / F' : s.type === 'encore' ? ' / G' : s.type === 'aegis' ? ' / H' : ''}`, bodyStyle(12, '#d9d4c8', { fontStyle: 'bold' })).setOrigin(1, 0);
    const desc = sc.add.text(14, 38, s.desc || '', bodyStyle(13, COLORS.ink, { wordWrap: { width: TIP_W - 28 }, lineSpacing: 2 }));
    const st = sc.add.text(14, desc.y + desc.height + 6, status, bodyStyle(13, s.ready || aiming ? COLORS.inkGood : COLORS.inkBad, { fontStyle: 'bold', wordWrap: { width: TIP_W - 28 } }));
    const h = st.y + st.height + 12;
    drawWindow(g, 0, 0, TIP_W, h, { radius: 12, flat: true });
    g.fillStyle(COLORS.header, 1).fillRoundedRect(4, 4, TIP_W - 8, 30, { tl: 9, tr: 9, bl: 0, br: 0 });
    c.add([g, title, hint, desc, st]);
    const r = this.shownRect || { x: 0, y: BOTTOM };
    const sx = r.x + PAD + i * (S + GAP) + S / 2;
    c.setPosition(Math.max(8, Math.min(1280 - 8 - TIP_W, Math.round(sx - TIP_W / 2))), r.y - h - 8);
    this.tip = { c, key };
  }

  hideTip() {
    if (this.tip) { this.tip.c.destroy(); this.tip = null; }
  }
}

