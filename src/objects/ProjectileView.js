// Draws one projectile. Logic positions are on the ground plane; the view lifts each shot so it leaves from
// its shooter's muzzle (a tower's barrel / top, an enemy's body, a bomber's belly) and arrives at the middle of
// what it's aimed at (an enemy's body, however high it floats, or a building's walls). The lift blends from
// the launch point to the hit point over the flight, so shots line up at both ends.
import { gridToScreen, distance } from '../logic/iso.js';
import { footprintCenter } from '../logic/grid.js';
import { PROJECTILE_KEYS, TEX } from '../assetKeys.js';
import { attachFireballFx, attachRocketFx, attachFrostFx } from './Effects.js';

// On-screen width in pixels for each projectile kind.
const DISPLAY_WIDTH = {
  cannon: 14, archer: 34, mortar: 34, wizard: 34, firework: 28, catapult: 16, spear: 52, slinger: 18, bomb: 18, pellet: 8, boulder: 26, bomblet: 18,
  ksi: 11, ksiBounce: 9, vaca: 24, missile: 30
};
const MEGA_BALL_WIDTH = 40; // a Mega Cannon's cannonball (Rolling Thunder), nearly three times a cannonball
// Other shots from merged defenses are drawn this much bigger than their kind's width (the Missile Silo's rockets).
const MERGED_SCALE = { cannon: 2.6, firework: 1.8 };
const BOLT_WIDTH = 56;      // a Locklair Citadel's Ballista Bolt: a big arrow
const ROLL_LIFT = 12;       // a rolling Mega Cannon ball settles to this height over the ground (px)
const SHURIKEN_SPIN = 0.35; // radians per frame the Slinger's shuriken turns in flight
// The bomb picture's nose points left (180°): turn it so the nose leads the way down.
const BOMB_NOSE_ANGLE = Math.PI;
// Flight height in pixels for straight shots.
const SHOT_HEIGHT = { cannon: 30, archer: 40, wizard: 44, firework: 52, slinger: 14, ksi: 44 };
// Homing shots that still arc a little on the way (the KSI Tower's bottle is thrown, not shot).
const HOMING_ARC = { ksi: 36 };
// Big Yahu's missile drops from this high above the spot it lands on (px).
const MISSILE_DROP = 460;
const MORTAR_ARC = 150;
const CATAPULT_ARC = 230; // the Catapult lobs higher and farther
// Lobbed shots and how high they arc.
const LOBBED = { mortar: MORTAR_ARC, catapult: CATAPULT_ARC, bomblet: 45, ksiBounce: 40, vaca: 90 };
// La Vaca Saturno's boulder: lower hops once it's bouncing along the ground.
const VACA_BOUNCE_ARC = 34;
// Shots that travel in a straight line along the ground (a cannonball that punched through, a boulder):
// drawn this far above the ground spot when they have no earlier height to keep.
const LINE_LIFT = { boulder: 11, cannon: 20, spear: 30 };
const MORTAR_LAUNCH = 40;
const BOMBER_HEIGHT = 24;
// Where each tower's shot leaves from: this share of the tower picture's height above its base.
const MUZZLE = { cannon: 0.5, archer: 0.85, mortar: 0.6, wizard: 0.88, firework: 0.75, catapult: 0.62, spear: 0.7, ksi: 0.82 };
// Where shots hit a building: this share of its picture's height above its base.
const BUILDING_HIT = 0.45;
const MIN_BLEND = 1; // tiles
const LINE_BLEND = 1.2; // tiles over which a line shot from a merged muzzle settles to its flight height

export class ProjectileView {
  constructor(scene, p) {
    this.scene = scene;
    this.id = p.id;
    this.kind = p.kind;
    this.image = scene.add.image(0, 0, PROJECTILE_KEYS[p.kind]).setDepth(2000);
    // Merged defenses' shots: the Mega Cannon's huge cannonball, the Locklair Citadel's ballista bolt.
    const w = p.mega ? MEGA_BALL_WIDTH : p.bolt ? BOLT_WIDTH : (DISPLAY_WIDTH[p.kind] || 12) * (p.merged ? MERGED_SCALE[p.kind] || 1 : 1);
    this.image.setScale(w / this.image.frame.width);
    if (p.bolt) this.image.setTint(0xffe2b0);
    this.last = null;
    this.launchOff = this.launchOffset(p); // screen offset of the muzzle from the shot's ground start
    this.hitOff = { x: 0, y: 0 };          // screen offset of the hit point from the target's ground spot
    this.startDist = null;                 // homing shots: distance to the target when first drawn
    // The Wizard's fireball is a light source: glow, hot core, and a spark trail.
    // The KSI Tower's bottle: an icy glow and a frost trail (v0.6.3).
    this.fx = p.kind === 'wizard' ? attachFireballFx(scene, this.image, TEX.light)
      : p.kind === 'ksi' || p.kind === 'ksiBounce' ? attachFrostFx(scene, this.image, TEX.light)
      : p.kind === 'firework' ? attachRocketFx(scene, this.image, TEX.light, p.merged ? MERGED_SCALE.firework : 1) : null;
    this.sync(p);
  }

  /** The muzzle's screen offset from the shot's ground start (or the old fixed height if the shooter's gone). */
  launchOffset(p) {
    const views = this.scene.views || {};
    const g = gridToScreen(p.x, p.y);
    if (p.kind === 'bomblet' || p.fromBlast) return { x: 0, y: -6 }; // scattered from the blast on the ground
    if (p.ricochets) return { x: 0, y: -22 };                        // Locklair Ricochet: bounced off its last target
    if (p.owner === 'tower') {
      const v = views.buildings && views.buildings.get(p.sourceId);
      const s = v && v.sprite;
      // A merged defense: from the spot measured on its picture (its barrel, its bolt's tip...; BuildingView.muzzlePoint).
      const mp = v && v.muzzlePoint ? v.muzzlePoint() : null;
      if (mp) { this.fromMuzzle = true; return { x: mp.x - g.x, y: mp.y - g.y }; }
      if (s && MUZZLE[p.kind] !== undefined) return { x: s.x - g.x, y: s.y - MUZZLE[p.kind] * s.displayHeight - g.y };
      return { x: 0, y: -(LOBBED[p.kind] ? MORTAR_LAUNCH : SHOT_HEIGHT[p.kind] || 20) };
    }
    const v = views.enemies && views.enemies.get(p.sourceId);
    const s = v && v.sprite;
    if (s) {
      const top = s.y - s.originY * s.displayHeight; // the sprite's top edge
      // A bomb drops from the bomber's belly; a slinger's shot leaves from the middle of its body.
      const share = p.kind === 'bomb' ? 0.8 : 0.5;
      return { x: s.x - g.x, y: top + share * s.displayHeight - g.y };
    }
    return { x: 0, y: -(p.kind === 'bomb' ? BOMBER_HEIGHT : SHOT_HEIGHT[p.kind] || 14) };
  }

  /** The target's ground spot (grid) and, while its view is around, the hit point's screen offset from it. */
  targetSpot(p) {
    const gs = this.scene.gs;
    const views = this.scene.views || {};
    if (LOBBED[p.kind]) return { x: p.targetX, y: p.targetY }; // lobbed shots land on the ground
    if (p.owner === 'tower') {
      const e = gs && gs.enemies.find((x) => x.id === p.targetId);
      if (!e) return null;
      const v = views.enemies && views.enemies.get(e.id);
      if (v && v.sprite) {
        // The middle of the enemy's body (flyers float high: this is where they really are on screen).
        const s = v.sprite, g = gridToScreen(e.x, e.y);
        this.hitOff = { x: s.x - g.x, y: s.y - s.originY * s.displayHeight + 0.5 * s.displayHeight - g.y };
      }
      return { x: e.x, y: e.y };
    }
    const b = gs && gs.buildings.find((x) => x.id === p.targetId);
    if (!b) return null;
    const c = footprintCenter(b);
    const v = views.buildings && views.buildings.get(b.id);
    if (v && v.sprite) {
      const s = v.sprite, g = gridToScreen(c.x, c.y);
      this.hitOff = { x: 0, y: s.y - s.originY * s.displayHeight + (1 - BUILDING_HIT) * s.displayHeight - g.y };
    }
    return c;
  }

  sync(p) {
    const s = gridToScreen(p.x, p.y);
    if (p.line) { this.syncLine(p, s); return; }
    if (p.kind === 'missile') { this.syncMissile(p, s); return; }
    const spot = this.targetSpot(p);
    // How far along the flight it is: timed shots know; homing shots compare to their starting distance.
    let t;
    if (p.progress !== undefined) t = p.progress;
    else if (spot) {
      const d = distance(p.x, p.y, spot.x, spot.y);
      // (At least MIN_BLEND tiles, so a point-blank shot, e.g. at a balloon hovering over the tower, still
      // starts partway along and reaches the target on screen instead of popping at the muzzle.)
      if (this.startDist === null || d > this.startDist) this.startDist = Math.max(d, MIN_BLEND);
      t = 1 - d / this.startDist;
    } else t = this.last ? 1 : 0;
    t = Math.max(0, Math.min(1, t || 0));
    const lob = p.kind === 'vaca' && p.bounce ? VACA_BOUNCE_ARC : LOBBED[p.kind] || HOMING_ARC[p.kind] || 0;
    const arc = Math.sin(Math.PI * t) * lob;
    const x = s.x + this.launchOff.x * (1 - t) + this.hitOff.x * t;
    const y = s.y + this.launchOff.y * (1 - t) + this.hitOff.y * t - arc;
    if (this.last && (p.kind === 'archer' || p.kind === 'wizard' || p.kind === 'firework' || p.bolt)) {
      const dx = x - this.last.x, dy = y - this.last.y;
      if (dx * dx + dy * dy > 0.01) this.image.setRotation(Math.atan2(dy, dx));
    }
    if (p.kind === 'bomb') {
      // Nose first along the fall (straight down before it has moved).
      const dir = this.last && (x - this.last.x) ** 2 + (y - this.last.y) ** 2 > 0.01
        ? Math.atan2(y - this.last.y, x - this.last.x) : this.last ? null : Math.PI / 2;
      if (dir !== null) this.image.setRotation(dir - BOMB_NOSE_ANGLE);
    }
    if (p.kind === 'slinger') this.image.rotation += SHURIKEN_SPIN;
    if (LOBBED[p.kind] || p.kind === 'ksi') this.image.rotation += p.kind === 'catapult' || p.kind === 'ksi' || p.kind === 'ksiBounce' ? 0.18 : 0.12;
    // A bouncing boulder leaves from the ground again at each hop.
    if (p.kind === 'vaca' && p.fromBlast && !this.bouncing) { this.bouncing = true; this.launchOff = { x: 0, y: -6 }; }
    this.image.setPosition(x, y);
    const depth = LOBBED[p.kind] ? 3000 : 2000 + p.x + p.y;
    this.image.setDepth(depth);
    if (this.fx) {
      this.fx.update(x, y, depth, this.scene.time.now); // stays full-bright at night: it's a light
    } else {
      this.image.setTint(this.scene.ambientTint ?? 0xffffff);
    }
    this.last = { x, y };
  }

  /** Big Yahu's missile: it falls nose first out of the sky onto its spot (the red warning ring is GameScene's). */
  syncMissile(p, s) {
    const t = Math.max(0, Math.min(1, p.progress || 0));
    const y = s.y - MISSILE_DROP * (1 - t * t); // speeds up as it falls
    this.image.setRotation(Math.PI / 2 - BOMB_NOSE_ANGLE).setPosition(s.x, y).setDepth(3000);
    this.image.setTint(this.scene.ambientTint ?? 0xffffff);
    this.last = { x: s.x, y };
  }

  /** Straight-line shots: keep the height they had when they hit (pierce), or roll along the ground (boulder). */
  syncLine(p, s) {
    if (this.lineLift === undefined) {
      // A line thrown from a merged defense's muzzle (the Harpoon Ballista's bolt tip) leaves from there and settles to
      // its flight height over its first LINE_BLEND tiles; other lines fly at their height from the start.
      this.lineBlend = this.fromMuzzle && !this.last;
      this.lineFrom = distance(p.startX, p.startY, p.x, p.y); // (how far it already flew before it was first drawn)
      this.lineLift = this.last ? this.last.y - s.y : -(LINE_LIFT[p.kind] ?? 16);
      if (p.kind === 'boulder') this.lineLift = -(LINE_LIFT.boulder);
    }
    let ox = 0, lift = this.lineLift;
    if (this.lineBlend) {
      const k = Math.min(1, Math.max(0, distance(p.startX, p.startY, p.x, p.y) - this.lineFrom) / LINE_BLEND);
      if (k >= 1) this.lineBlend = false;
      ox = this.launchOff.x * (1 - k);
      lift = this.launchOff.y * (1 - k) + this.lineLift * k;
    }
    // Rolling Thunder: the ball drops to the ground and rolls (spinning) along it.
    if (p.rolling) {
      this.lineLift += (-ROLL_LIFT - this.lineLift) * 0.25;
      this.image.rotation += 0.3 * Math.sign(p.dirX - p.dirY || 1);
    }
    const x = s.x + ox, y = s.y + lift;
    if (p.kind === 'boulder') this.image.rotation += 0.25 * Math.sign(p.dirX - p.dirY || 1);
    if (p.kind === 'spear' || (p.bolt && p.kind === 'archer')) { // point along the flight (its picture points right; a Skewer bolt too)
      const n = gridToScreen(p.x + p.dirX, p.y + p.dirY);
      this.image.setRotation(Math.atan2(n.y - s.y, n.x - s.x));
    }
    this.image.setPosition(x, y).setDepth(2000 + p.x + p.y);
    if (this.fx) this.fx.update(x, y, 2000 + p.x + p.y, this.scene.time.now);
    else this.image.setTint(this.scene.ambientTint ?? 0xffffff);
    this.last = { x, y };
  }

  destroy() {
    if (this.fx) this.fx.destroy();
    this.image.destroy();
  }
}
