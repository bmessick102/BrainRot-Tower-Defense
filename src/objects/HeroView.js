// Draws the Brisket King (src/logic/hero.js): his pose (standing, attacking, sleeping, waking up) with a little
// bounce while he walks and a hop over walls, a health bar
// with his level, a pulsing gold ring under his feet while Brisket Feast is ready (click him or his altar), a
// "z Z" drifting up while he sleeps, and while he naps a blue sleep bar over him (filling as he heals) with the
// time left above it.
import { gridToScreen } from '../logic/iso.js';
import { fpW, fpH } from '../logic/grid.js';
import { heroStats, checkFeast, getAltar } from '../logic/hero.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { spriteHit } from './BuildingView.js';
import { groundDepth } from './depth.js';
import { floatText } from './Effects.js';
import { textStyle } from '../theme.js';

const KEYS = { stand: 'hero_brisket', attack: 'hero_brisket_attack', sleep: 'hero_brisket_sleep', wake: 'hero_brisket_wake' };
const HEIGHT = { stand: 72, attack: 66, sleep: 70, wake: 72 }; // on-screen height of each pose
const ATTACK_POSE_MS = 340;     // the attack picture shows this long after each swing
const ZZZ_EVERY_MS = 1400;
const HOP_HEIGHT = 16;          // px he rises while hopping a wall
const STEP_BOUNCE = 3;          // px of bounce in his walk
const SLEEP_COLOR = 0x6fa8ff;   // his bar while he naps (it fills as he heals)

export class HeroView {
  constructor(scene) {
    this.scene = scene;
    this.sprite = scene.add.image(0, 0, KEYS.stand).setOrigin(0.5, 1);
    this.ring = scene.add.graphics();
    this.hpBar = new HealthBar(scene, { width: 50, height: 12, depth: 5001, color: HP_TEAM.player, badge: true, badgeStyle: 'crown' }); // his level on a dark purple crown
    this.timer = scene.add.text(0, 0, '', textStyle(13, '#d9e4ff')).setOrigin(0.5, 1).setDepth(5001).setVisible(false);
    this.pose = null;
    this.attackUntil = 0;
    this.facingRight = false;
    this.lastX = null;
    this.zzzAt = 0;
    this.hop = 0;
  }

  setPose(pose) {
    if (pose === this.pose) return;
    this.pose = pose;
    const key = this.scene.textures.exists(KEYS[pose]) ? KEYS[pose] : KEYS.stand;
    this.sprite.setTexture(key);
    this.sprite.setScale(HEIGHT[pose] / this.sprite.frame.height);
  }

  /** A swing: show the attack picture for a moment. */
  attackPose(time) {
    this.attackUntil = time + ATTACK_POSE_MS;
  }

  sync(gs, time) {
    const h = gs.hero;
    const show = !!h && !this.scene.editMode;
    this.sprite.setVisible(show);
    this.ring.setVisible(show);
    if (!show) { this.hpBar.draw(0, 0, 1, false); this.timer.setVisible(false); return; }
    const altar = getAltar(gs);
    const st = heroStats(altar);
    const s = gridToScreen(h.x, h.y);
    const pose = h.status === 'asleep' ? 'sleep' : h.status === 'waking' ? 'wake' : time < this.attackUntil ? 'attack' : 'stand';
    this.setPose(pose);
    // Face where he's going (or the enemy he's hitting). The art faces left.
    const target = h.targetId ? gs.enemies.find((e) => e.id === h.targetId) : null;
    if (target && h.attacking) this.facingRight = gridToScreen(target.x, target.y).x > s.x;
    else if (this.lastX !== null && Math.abs(s.x - this.lastX) > 0.05) this.facingRight = s.x > this.lastX;
    this.lastX = s.x;
    this.sprite.setFlipX(this.facingRight && pose !== 'sleep' && pose !== 'wake');
    // Breathing while asleep; a bounce in his step while walking; a hop over walls (eased).
    const bob = pose === 'sleep' ? Math.sin(time * 0.002) * 1.5 : h.moving ? -Math.abs(Math.sin(time * 0.012)) * STEP_BOUNCE : 0;
    this.hop += ((h.overWall ? HOP_HEIGHT : 0) - this.hop) * 0.3;
    this.sprite.setPosition(s.x, s.y + bob - this.hop);
    // Standing on his altar (a flat tile), he draws on top of it; elsewhere like any ground troop.
    const onAltar = altar && h.x >= altar.col && h.x < altar.col + fpW(altar) && h.y >= altar.row && h.y < altar.row + fpH(altar);
    const depth = onAltar ? altar.col + altar.row + 2 * fpW(altar) + 0.1 : groundDepth(gs.buildings, h.x, h.y);
    this.sprite.setDepth(depth);
    const tint = this.scene.ambientTint ?? 0xffffff;
    this.sprite.setTint(h.boostT > 0 && Math.sin(time * 0.02) > 0 ? 0xffd27a : tint); // Brisket Feast boost
    // Brisket Feast ready: a pulsing gold ring at his feet.
    this.ring.clear().setDepth(depth - 0.05);
    if (checkFeast(gs).ok) {
      const k = 0.5 + 0.5 * Math.sin(time * 0.008);
      this.ring.lineStyle(3, 0xffd34a, 0.55 + 0.4 * k).strokeEllipse(s.x, s.y, 46 + 6 * k, 20 + 3 * k);
      this.ring.fillStyle(0xffd34a, 0.12 + 0.1 * k).fillEllipse(s.x, s.y, 46 + 6 * k, 20 + 3 * k);
    }
    // His bar: green health while he's hurt and awake; blue while he naps, filling as he heals, with the
    // time left above it. Hidden when he's fine (his level is on the altar's own label).
    const asleep = h.status === 'asleep';
    const top = s.y - this.sprite.displayHeight;
    const barY = top - 13;
    this.hpBar.setColor(asleep ? SLEEP_COLOR : HP_TEAM.player);
    this.hpBar.draw(s.x, barY, Math.max(0, h.hp) / st.maxHp, asleep || (h.status === 'ready' && h.hp < st.maxHp), altar.level);
    if (asleep) {
      if (time >= this.zzzAt) { this.zzzAt = time + ZZZ_EVERY_MS; floatText(this.scene, s.x + 36, top + 10, 'z Z', '#d9e4ff', 15); }
      const left = Math.ceil(h.sleepT);
      this.timer.setText(`Zz ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`).setPosition(s.x + 8, barY - 3).setVisible(true);
    } else this.timer.setVisible(false);
  }

  /** Is the world point on him (a visible pixel of his picture)? */
  hitTest(wx, wy) {
    return this.sprite.visible && spriteHit(this.scene, this.sprite, wx, wy);
  }

  destroy() {
    this.sprite.destroy();
    this.ring.destroy();
    this.hpBar.destroy();
    this.timer.destroy();
  }
}
