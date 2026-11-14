// Draws one enemy: sprite at its grid position, HP bar after the first hit, hit flash, and (when the art
// exists) an attack pose on each hit and a death pose left where it falls.
// Placeholder shapes draw at their own size. Real art (art-source/enemies/) is scaled to DISPLAY_HEIGHT,
// flipped to face the way it's walking (draw it facing right), and flyers get a ground shadow.
import { darkness } from './DayNight.js';
import { gridToScreen } from '../logic/iso.js';
import { isAirKind, LANDING_SECONDS } from '../logic/enemies.js';
import { enemyKey, TEX } from '../assetKeys.js';
import { HealthBar, HP_TEAM } from './HealthBar.js';
import { groundDepth } from './depth.js';

// On-screen height in pixels for real enemy art at zoom 1 (a 2x2 building is 128 px wide).
const DISPLAY_HEIGHT = { grunt: 40, slinger: 44, bomber: 46, tank: 62, shark: 50, thief: 42, breaker: 46, balloon: 84, neegy: 48 };
// A dropped Neegy starts this far up (px) and floats down over its landing time.
const DROP_HEIGHT = 95;
// Real flyer art floats this far above its shadow (the placeholder has the shadow built in).
const FLY_HEIGHT = 24;
// Some flyers float higher (the Neegy Balloon drifts well above the building it drops onto).
const FLY_HEIGHT_BY_KIND = { balloon: 80 };
// Pictures drawn facing left, by texture key (the rest face right or front). Each pose has its own
// picture, so facing is per picture: enemies always face where they're going.
const FACES_LEFT = new Set([
  'enemy_bomber', 'enemy_shark', 'enemy_thief', 'enemy_balloon',
  'enemy_shark_attack', 'enemy_shark_death', 'enemy_tank_death', 'enemy_thief_death'
]);
// Extra poses: enemy_<kind>_attack / enemy_<kind>_death in art-source/enemies/, used when present.
const ATTACK_POSE_MS = 320;          // the attack picture shows this long after each hit
const POSE_HEIGHT = { walk: 1, attack: 1, death: 0.85 }; // share of DISPLAY_HEIGHT (lying down is lower)
const DEATH_HOLD_MS = 650;           // the death picture stays this long...
const DEATH_FADE_MS = 450;           // ...then fades out
// Invisible enemies (a Money Stealer before it's revealed) are drawn see-through with a faint shimmer.
const HIDDEN_ALPHA = 0.38;
const HIDDEN_SHIMMER = 0.07;
// Enemies of a wave that has stalled too long (see src/logic/enrage.js) are tinted this red.
const ENRAGED_TINT = 0xff7a6a;
const RESTLESS_TINT = 0xffc2b8; // night attackers (restless nights)
/** Multiply two 0xRRGGBB colors channel by channel. */
function mulColor(a, b) {
  const ch = (s) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return ch(16) | ch(8) | ch(0);
}
// Wall jumpers arc up this high while they're over a wall.
const HOP_HEIGHT = 30;
// Night visibility: a soft warm glow around each enemy, only once it's dark (DARK_AT), fading in from there.
const NIGHT_GLOW_ALPHA = 0.75;
const NIGHT_GLOW_COLOR = 0xffb36b;

export class EnemyView {
  constructor(scene, e) {
    this.scene = scene;
    this.id = e.id;
    this.kind = e.kind;
    this.air = isAirKind(e.kind);
    const key = enemyKey(e.kind);
    const placeholders = scene.registry.get('placeholderKeys');
    this.realArt = !(placeholders && placeholders.has(key));
    const real = (k) => scene.textures.exists(k) && !(placeholders && placeholders.has(k));
    this.keys = { walk: key, attack: real(`${key}_attack`) ? `${key}_attack` : null, death: real(`${key}_death`) ? `${key}_death` : null };
    this.pose = 'walk';
    this.attackUntil = 0;
    this.movingLeft = false;
    this.sprite = scene.add.image(0, 0, key).setOrigin(0.5, 1);
    if (this.realArt) {
      this.sprite.setScale(this.poseHeight('walk') / this.sprite.frame.height);
      if (this.air) this.shadow = scene.add.ellipse(0, 0, this.sprite.displayWidth * 0.7, 10, 0x000000, 0.35);
    }
    this.lift = this.realArt && this.air ? (FLY_HEIGHT_BY_KIND[e.kind] ?? FLY_HEIGHT) : 0;
    this.hpBar = new HealthBar(scene, { width: 32, height: 8, depth: 5000, color: HP_TEAM.enemy });
    this.eye = scene.add.image(0, 0, TEX.markEye).setDepth(5001).setVisible(false); // F.L.O.C.K mark
    this.glow = scene.add.image(0, 0, TEX.light).setBlendMode('SCREEN').setTint(NIGHT_GLOW_COLOR).setVisible(false);
    this.phase = Math.random() * Math.PI * 2; // so swarms don't bob in sync
    this.flashUntil = 0;
    this.lastX = null;
    this.hop = 0; // current hop height (eases up over a wall, back down after)
    this.alpha = e.hidden ? HIDDEN_ALPHA : 1; // eases to full when revealed
    this.sync(e, 0);
  }

  sync(e, time) {
    const s = gridToScreen(e.x, e.y);
    const bob = this.air ? Math.sin(time * 0.004 + this.phase) * 2 : -Math.abs(Math.sin(time * 0.012 + this.phase)) * 2;
    this.hop += ((e.overWall ? HOP_HEIGHT : 0) - this.hop) * 0.3;
    const fall = e.landing > 0 ? (e.landing / LANDING_SECONDS) * DROP_HEIGHT : 0; // a dropped Neegy floating down
    // Firework Grounding Burst: a flyer knocked down drops to the ground (and floats back up after).
    this.groundedLift = this.groundedLift ?? 0;
    this.groundedLift += ((e.grounded > 0 ? this.lift : 0) - this.groundedLift) * 0.25;
    this.sprite.setPosition(s.x, s.y + bob - this.lift + this.groundedLift - this.hop - fall);
    // Ground enemies use the shared draw-order rule so they never vanish behind a building they're in front of.
    const depth = this.air ? e.x + e.y + 1000 : groundDepth(this.scene.gs ? this.scene.gs.buildings : [], e.x, e.y);
    this.sprite.setDepth(depth);
    const wantAlpha = e.hidden ? HIDDEN_ALPHA + Math.sin(time * 0.006 + this.phase) * HIDDEN_SHIMMER : 1;
    this.alpha += (wantAlpha - this.alpha) * 0.2;
    this.sprite.setAlpha(this.alpha);
    if (this.shadow) this.shadow.setPosition(s.x, s.y).setDepth(depth - 0.5);
    // Pose: the attack picture right after a hit, otherwise walking.
    const pose = this.keys.attack && time < this.attackUntil ? 'attack' : 'walk';
    if (pose !== this.pose) this.setPose(pose);
    // Face the direction of travel.
    if (this.realArt && this.lastX !== null && Math.abs(s.x - this.lastX) > 0.05) {
      this.movingLeft = s.x < this.lastX;
      this.applyFacing();
    }
    this.lastX = s.x;
    this.hpBar.draw(s.x, s.y - this.lift - this.sprite.displayHeight - 10, e.hp / e.maxHp, e.hit && e.alive);
    // Marked by a F.L.O.C.K Tower: an eye floats over its head (above the HP bar once it shows).
    const marked = (e.markBonus || 0) > 0 && e.alive;
    this.eye.setVisible(marked);
    if (marked) this.eye.setPosition(s.x, s.y - this.lift - this.sprite.displayHeight - (e.hit ? 26 : 12) + Math.sin(time * 0.006 + this.phase) * 1.5);
    if (this.flashUntil && time > this.flashUntil) this.flashUntil = 0;
    if (!this.flashUntil) {
      // Moonlit at night; a stalled wave's enraged enemies also glow angry red.
      const base = this.scene.ambientTint ?? 0xffffff;
      // Hacked by a F.L.O.C.K Override: purple. Dazzled by Showstopper: a pale flicker.
      if (e.hackedT > 0) this.sprite.setTint(mulColor(base, 0xc58cff));
      else if (e.disarmT > 0 && Math.sin(time * 0.03) > 0) this.sprite.setTint(mulColor(base, 0xfff3b0));
      else {
        const w = this.scene.gs && this.scene.gs.wave;
        // Enraged (a stalled wave): angry red. Restless (attacking at night): a lighter red flush.
        this.sprite.setTint(w && w.enraged ? mulColor(base, ENRAGED_TINT) : w && w.restless ? mulColor(base, RESTLESS_TINT) : base);
      }
    }
    const dark = darkness(this.scene.night || 0); // 0 until it's dark enough, then up to 1
    const night = dark;
    this.glow.setVisible(dark > 0.01);
    if (dark > 0.01) {
      const w = Math.max(48, this.sprite.displayWidth * 1.5);
      const cy = this.air ? s.y - this.lift - this.sprite.displayHeight * 0.4 : s.y - 4;
      this.glow.setPosition(s.x, cy).setDisplaySize(w, this.air ? w * 0.8 : w * 0.55)
        .setAlpha(night * NIGHT_GLOW_ALPHA * this.alpha).setDepth(depth - 0.3);
    }
  }

  poseHeight(pose) {
    return (DISPLAY_HEIGHT[this.kind] || 40) * POSE_HEIGHT[pose];
  }

  setPose(pose) {
    const key = this.keys[pose];
    if (!key || !this.realArt) return;
    this.pose = pose;
    this.sprite.setTexture(key);
    this.sprite.setScale(this.poseHeight(pose) / this.sprite.frame.height);
    this.applyFacing();
  }

  /** Flip the current picture so it faces the way the enemy last moved. */
  applyFacing() {
    if (!this.realArt) return;
    const artFacesLeft = FACES_LEFT.has(this.sprite.texture.key);
    this.sprite.setFlipX(artFacesLeft ? !this.movingLeft : this.movingLeft);
  }

  /** It just hit something: show the attack picture for a moment. */
  attackPose(time) {
    if (this.keys.attack) this.attackUntil = time + ATTACK_POSE_MS;
  }

  /**
   * It died: leave its death picture where it fell (the view itself is about to be removed). It pops
   * in, holds, then fades and sinks a little.
   */
  spawnCorpse() {
    const key = this.keys.death;
    if (!key || !this.realArt) return;
    const scene = this.scene;
    const img = scene.add.image(this.sprite.x, this.sprite.y + this.hop, key).setOrigin(0.5, 1).setDepth(this.sprite.depth);
    const scale = this.poseHeight('death') / img.frame.height;
    const artFacesLeft = FACES_LEFT.has(key);
    img.setFlipX(artFacesLeft ? !this.movingLeft : this.movingLeft).setTint(scene.ambientTint ?? 0xffffff).setScale(scale * 1.1).setAlpha(this.alpha);
    scene.tweens.chain({
      targets: img,
      tweens: [
        { scale, duration: 140, ease: 'Back.easeOut' },
        { alpha: 0, y: img.y + 5, delay: DEATH_HOLD_MS, duration: DEATH_FADE_MS, ease: 'Quad.easeIn' }
      ],
      onComplete: () => img.destroy()
    });
  }

  flash(time) {
    this.sprite.setTintFill(0xffffff);
    this.flashUntil = time + 80;
  }

  destroy() {
    this.sprite.destroy();
    if (this.shadow) this.shadow.destroy();
    this.glow.destroy();
    this.eye.destroy();
    this.hpBar.destroy();
  }
}
