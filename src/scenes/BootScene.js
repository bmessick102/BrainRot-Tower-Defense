// Loads Cole's art and sounds that exist (from src/assetManifest.js), then draws a placeholder
// for every texture key that wasn't loaded. Nothing else in the code cares which one it got.
import Phaser from 'phaser';
import { IMAGE_FILES, AUDIO_FILES } from '../assetManifest.js';
import { TEX, FILE_KEY_ALIASES, UNLOADED_FILES, buildingKey, buildingDestroyedKey, enemyKey, PROJECTILE_KEYS } from '../assetKeys.js';
import { BUILDING_TYPES, buildingSize } from '../logic/buildings.js';
import { MAP } from '../mapTiles.js';
import { loadSettings } from '../logic/save.js';
import { getStorage } from '../state/GameState.js';
import { setMusicLevel, setSfxLevel } from '../audio.js';
import { COLORS, FONT, textStyle, shade as shadeColor } from '../theme.js';
import { pickTip } from '../loadingTips.js';

const BASE = import.meta.env.BASE_URL;

const BUILDING_LOOK = {
  townHall: { color: 0xe8b923, label: 'VH' },
  mine: { color: 0x8b5a2b, label: 'M' },
  storage: { color: 0x6a7f99, label: 'S' },
  house: { color: 0xb5651d, label: 'H' },
  cannon: { color: 0x4a4a4a, label: 'C' },
  archer: { color: 0xd2b48c, label: 'A' },
  mortar: { color: 0x6b7a2a, label: 'Mo' },
  wizard: { color: 0x7b3fb5, label: 'W' },
  firework: { color: 0xc0392b, label: 'F' },
  catapult: { color: 0xe86aa8, label: 'Ca' },
  flock: { color: 0x4a6a8a, label: 'FT' },
  mousetrap: { color: 0x8a6a3a, label: 'MT' },
  ra: { color: 0xd4a537, label: 'Ra' },
  rvlab: { color: 0xe9d8b4, label: 'RV' }
};

const TIP_MS = 4500; // how long each loading tip stays up
const LOAD_PURPLE = 0x9b4fd6;

/** Long pill-shaped progress bar: dark frame and trough, glossy purple fill (p = 0..1). */
function drawLoadingBar(g, x, y, w, h, p) {
  const r = h / 2;
  g.clear();
  g.fillStyle(0x000000, 0.4).fillRoundedRect(x + 1, y + 4, w, h, r);          // drop shadow
  g.fillStyle(COLORS.frame, 1).fillRoundedRect(x, y, w, h, r);                // outline
  const ix = x + 4, iy = y + 4, iw = w - 8, ih = h - 8, ir = ih / 2;
  g.fillStyle(0x241a30, 1).fillRoundedRect(ix, iy, iw, ih, ir);               // empty trough
  g.fillStyle(0x000000, 0.35).fillRoundedRect(ix, iy, iw, ih * 0.4, { tl: ir, tr: ir, bl: 0, br: 0 });
  const fw = Math.max(0, Math.min(1, p)) * iw;
  if (fw <= 0) return;
  const w2 = Math.max(ih, fw); // never thinner than a circle, so the rounded ends stay round
  g.fillStyle(shadeColor(LOAD_PURPLE, 0.7), 1).fillRoundedRect(ix, iy, w2, ih, ir);          // bottom lip
  g.fillStyle(LOAD_PURPLE, 1).fillRoundedRect(ix, iy, w2, ih - 4, (ih - 4) / 2);              // face
  g.fillStyle(0xffffff, 0.35).fillRoundedRect(ix + 6, iy + 3, Math.max(0, w2 - 12), ih * 0.3, ih * 0.15); // shine
}

const css = (hex, alpha = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${alpha})`;
const shade = (hex, f) => (Math.round(((hex >> 16) & 255) * f) << 16) | (Math.round(((hex >> 8) & 255) * f) << 8) | Math.round((hex & 255) * f);

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    this.buildLoadingScreen();
    this.load.on('loaderror', (file) => console.warn(`Asset failed to load, using placeholder: ${file.key}`));

    for (const f of IMAGE_FILES) {
      if (UNLOADED_FILES.includes(f.key)) continue;
      const key = FILE_KEY_ALIASES[f.key] || f.key;
      if (this.textures.exists(key)) continue; // PreloadScene already loaded the background
      this.load.image(key, BASE + f.path);
    }
    for (const f of AUDIO_FILES) this.load.audio(f.key, BASE + f.path);
  }

  /**
   * Loading screen: title art, a long rounded bar that fills with glossy purple and reads "Loading",
   * and a gameplay tip underneath (a new one every few seconds if loading takes a while).
   */
  buildLoadingScreen() {
    const { width, height } = this.scale;
    const items = [];
    if (this.textures.exists(TEX.titleBackground)) {
      const bg = this.add.image(width / 2, height / 2, TEX.titleBackground);
      bg.setScale(Math.max(width / bg.frame.width, height / bg.frame.height));
      items.push(bg);
    }
    // Darken the bottom so the bar and tip read clearly over the art.
    const shadeG = this.add.graphics();
    const fadeTop = height - 200;
    for (let i = 0; i < 20; i++) shadeG.fillStyle(0x000000, 0.035 * (i + 1)).fillRect(0, fadeTop + i * 10, width, 10);
    items.push(shadeG);

    const bar = { w: 760, h: 40, cx: width / 2, cy: height - 118 };
    const barG = this.add.graphics();
    const label = this.add.text(bar.cx, bar.cy - 2, 'Loading', textStyle(26)).setOrigin(0.5);
    const tip = this.add.text(width / 2, bar.cy + 40, pickTip(), textStyle(20, COLORS.text, { align: 'center', wordWrap: { width: 900 } })).setOrigin(0.5, 0);
    items.push(barG, label, tip);

    const draw = (p) => drawLoadingBar(barG, bar.cx - bar.w / 2, bar.cy - bar.h / 2, bar.w, bar.h, p);
    draw(0);
    this.load.on('progress', draw);

    const rotate = this.time.addEvent({
      delay: TIP_MS, loop: true,
      callback: () => this.tweens.add({
        targets: tip, alpha: 0, duration: 200, yoyo: true,
        onYoyo: () => tip.setText(pickTip(tip.text))
      })
    });
    this.load.once('complete', () => { rotate.remove(); items.forEach((o) => o.destroy()); });
  }

  create() {
    this.placeholderKeys = new Set();
    this.makePlaceholders();
    // Views use this to tell placeholder shapes (drawn at their own size) from real art (scaled to fit).
    this.registry.set('placeholderKeys', this.placeholderKeys);
    const settings = loadSettings(getStorage());
    setMusicLevel(settings.music);
    setSfxLevel(settings.sfx);
    this.scene.start('AuthScene'); // logs in (or picks up a saved login), then the title screen
  }

  /** Draw a placeholder with a 2D canvas unless a real texture already has this key. */
  canvasTexture(key, w, h, draw) {
    if (this.textures.exists(key)) return;
    this.placeholderKeys.add(key);
    const tex = this.textures.createCanvas(key, w, h);
    draw(tex.getContext(), w, h);
    tex.refresh();
  }

  makePlaceholders() {
    // Map (should always be present; a flat field keeps the game playable if not).
    this.canvasTexture(TEX.map, MAP.imageWidth, MAP.imageHeight, (ctx, w, h) => {
      ctx.fillStyle = '#4c7a34'; ctx.fillRect(0, 0, w, h);
    });

    for (const type of BUILDING_TYPES) {
      if (type === 'wall') continue; // walls are drawn per tile below
      const size = buildingSize(type);
      const look = BUILDING_LOOK[type];
      this.isoBlock(buildingKey(type), size, size * 16, look.color, look.label);
      this.isoBlock(buildingDestroyedKey(type), size, 8, 0x3a3a3a, '', true);
    }

    // Walls: one tile per level (wood -> stone -> dark stone -> steel -> gold -> dark gold -> lava). Only drawn when no
    // wall art (bld_wall_lvN pillars) was loaded, so real art never mixes with placeholders.
    const wallArt = this.textures.getTextureKeys().some((k) => /^bld_wall_lv\d+$/.test(k));
    if (!wallArt) {
      [0x9c7a4c, 0x9a9a92, 0x6f7480, 0x55708f, 0xd4a537, 0x6a5a3a, 0xd2501e].forEach((color, i) => this.isoBlock(`bld_wall_lv${i + 1}`, 1, 26, color, ''));
    }
    this.isoBlock('bld_wall', 1, 26, 0x9c7a4c, '');
    this.isoBlock('bld_wall_destroyed', 1, 5, 0x3a3a3a, '', true);

    // Enemies
    this.canvasTexture(enemyKey('grunt'), 16, 16, (ctx) => {
      ctx.fillStyle = '#e03131'; ctx.strokeStyle = '#4a0d0d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(8, 8, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    this.canvasTexture(enemyKey('slinger'), 20, 20, (ctx) => {
      ctx.fillStyle = '#f08c00'; ctx.strokeStyle = '#5c3300'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, 1); ctx.lineTo(19, 19); ctx.lineTo(1, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    this.canvasTexture(enemyKey('bomber'), 26, 56, (ctx) => {
      // shadow at the bottom (the logic position), body 24 px above it
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(13, 50, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9c36b5'; ctx.strokeStyle = '#3d0f4a'; ctx.lineWidth = 2;
      const cy = 50 - 24; // diamond center sits 24 px above the shadow center
      ctx.beginPath(); ctx.moveTo(13, cy - 11); ctx.lineTo(24, cy); ctx.lineTo(13, cy + 11); ctx.lineTo(2, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    this.canvasTexture(enemyKey('shark'), 26, 22, (ctx) => {
      ctx.fillStyle = '#3c7dd9'; ctx.strokeStyle = '#123b73'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(1, 14); ctx.lineTo(13, 3); ctx.lineTo(25, 14); ctx.lineTo(13, 21); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#123b73'; ctx.beginPath(); ctx.moveTo(11, 3); ctx.lineTo(13, 0); ctx.lineTo(16, 4); ctx.closePath(); ctx.fill();
    });
    this.canvasTexture(enemyKey('tank'), 28, 28, (ctx) => {
      ctx.fillStyle = '#8b1a1a'; ctx.strokeStyle = '#2e0606'; ctx.lineWidth = 2;
      ctx.fillRect(1, 1, 26, 26); ctx.strokeRect(1, 1, 26, 26);
    });

    // Projectiles
    const dot = (key, r, fill, glow) => this.canvasTexture(key, r * 2 + 8, r * 2 + 8, (ctx, w, h) => {
      if (glow) {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, glow); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill();
    });
    dot(PROJECTILE_KEYS.cannon, 4, '#111111');
    dot(PROJECTILE_KEYS.mortar, 7, '#222222');
    dot(PROJECTILE_KEYS.wizard, 5, '#d68cff', 'rgba(190,90,255,0.9)');
    dot(PROJECTILE_KEYS.slinger, 3, '#ff9a1f');
    dot(PROJECTILE_KEYS.bomb, 4, '#0a0a0a');
    // Firework rocket: red body with a gold nose, pointing right (+x).
    this.canvasTexture(PROJECTILE_KEYS.firework, 26, 10, (ctx) => {
      ctx.fillStyle = '#d62839'; ctx.fillRect(3, 2, 15, 6);
      ctx.fillStyle = '#1b1b1b'; ctx.fillRect(7, 2, 3, 6);
      ctx.fillStyle = '#ffd04a'; ctx.beginPath(); ctx.moveTo(18, 1); ctx.lineTo(25, 5); ctx.lineTo(18, 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9a1f'; ctx.fillRect(0, 4, 3, 2);
    });
    // Catapult shot: a little pink-capped bottle of oil.
    this.canvasTexture(PROJECTILE_KEYS.catapult, 16, 24, (ctx) => {
      ctx.fillStyle = 'rgba(235,245,255,0.95)'; ctx.strokeStyle = '#7a5a8a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(2, 7, 12, 16, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffb3d6'; ctx.fillRect(4, 12, 8, 7);
      ctx.fillStyle = '#ff5fa8'; ctx.beginPath(); ctx.roundRect(4, 1, 8, 6, 2); ctx.fill(); ctx.stroke();
    });
    this.canvasTexture(PROJECTILE_KEYS.archer, 22, 4, (ctx) => {
      ctx.strokeStyle = '#7a4a1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, 2); ctx.lineTo(21, 2); ctx.stroke();
    });

    // Gnome villager placeholder: red pointy hat, white beard, blue body.
    this.canvasTexture(TEX.villager, 20, 30, (ctx) => {
      ctx.fillStyle = '#2f6db5'; ctx.fillRect(5, 16, 10, 12);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(10, 15, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d62828'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(17, 11); ctx.lineTo(3, 11); ctx.closePath(); ctx.fill();
    });

    // Soft white light pool (tinted per building and drawn additively at night).
    this.canvasTexture(TEX.light, 256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.4, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.75, 'rgba(255,255,255,0.28)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });

    // UI
    this.canvasTexture(TEX.coin, 36, 36, (ctx) => {
      ctx.fillStyle = '#f5b301'; ctx.strokeStyle = '#8a5a00'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(18, 18, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3c4'; ctx.font = `bold 18px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('₿', 18, 19);
    });
    // F.L.O.C.K mark: a little red-irised eye shown over marked enemies.
    this.canvasTexture(TEX.markEye, 32, 20, (ctx) => {
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#2a0a0a'; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(2, 10); ctx.quadraticCurveTo(16, -3, 30, 10); ctx.quadraticCurveTo(16, 23, 2, 10); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e8262b'; ctx.beginPath(); ctx.arc(16, 10, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a0000'; ctx.beginPath(); ctx.arc(16, 10, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(14.5, 8.3, 1.2, 0, Math.PI * 2); ctx.fill();
    });
    // Wave warning: a red badge with a white "!" over a soft red glow.
    this.canvasTexture(TEX.spawnMarker, 128, 128, (ctx) => {
      const glow = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
      glow.addColorStop(0, 'rgba(255,60,40,0.55)'); glow.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, 128, 128);
      const face = ctx.createLinearGradient(0, 30, 0, 98);
      face.addColorStop(0, '#ff5a45'); face.addColorStop(1, '#c0141c');
      ctx.fillStyle = face; ctx.strokeStyle = '#4a0000'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(64, 64, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(64, 64, 27, 0, Math.PI * 2); ctx.stroke();
      // the "!": a tapered bar and a dot, outlined so it reads on any background
      const bang = () => {
        ctx.beginPath();
        ctx.moveTo(56.5, 42); ctx.lineTo(71.5, 42); ctx.lineTo(67.5, 72); ctx.lineTo(60.5, 72); ctx.closePath();
        ctx.moveTo(71, 83); ctx.arc(64, 83, 7, 0, Math.PI * 2);
      };
      ctx.lineJoin = 'round'; ctx.strokeStyle = '#4a0000'; ctx.lineWidth = 5; bang(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; bang(); ctx.fill();
    });
    // Fog puff: a lumpy cloud of overlapping soft circles (tinted and drifted by UIScene).
    this.canvasTexture(TEX.fog, 256, 256, (ctx) => {
      const puffs = [[128, 128, 110, 0.55], [92, 110, 70, 0.5], [168, 104, 64, 0.45], [100, 166, 66, 0.45], [170, 160, 72, 0.5], [128, 80, 56, 0.35]];
      for (const [x, y, r, a] of puffs) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.6, `rgba(255,255,255,${a * 0.45})`); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
      }
    });
    this.canvasTexture(TEX.guide, 120, 120, (ctx) => {
      ctx.fillStyle = '#1fb5a5'; ctx.strokeStyle = '#0b4d46'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(60, 60, 54, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(42, 50, 10, 0, Math.PI * 2); ctx.arc(78, 50, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#10302c';
      ctx.beginPath(); ctx.arc(44, 52, 5, 0, Math.PI * 2); ctx.arc(80, 52, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#10302c'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(60, 70, 22, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    });
    const pill = (key, w, h, text, size) => this.canvasTexture(key, w, h, (ctx) => {
      ctx.fillStyle = css(COLORS.button); ctx.strokeStyle = css(COLORS.panel); ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff4dc'; ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 1);
    });
    pill(TEX.shopButton, 120, 120, 'Shop', 30);
    pill(TEX.settingsButton, 96, 96, '| |', 34);
    pill(TEX.editButton, 110, 110, 'Edit', 30);
    pill(TEX.startButton, 360, 120, 'START GAME', 44);
    this.canvasTexture(TEX.titleBackground, 1280, 720, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#7fb0f0'); g.addColorStop(1, '#3f7a2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
  }

  /** Isometric block: footprint diamond on top of side faces, front corner at the bottom center. */
  isoBlock(key, size, height, color, label, rubble = false) {
    const W = size * MAP.tileWidth, H = size * MAP.tileHeight;
    this.canvasTexture(key, W, H + height, (ctx) => {
      const top = [[W / 2, 0], [W, H / 2], [W / 2, H], [0, H / 2]];
      const poly = (pts, fill) => {
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.fillStyle = css(fill); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2; ctx.stroke();
      };
      poly([[0, H / 2], [W / 2, H], [W / 2, H + height], [0, H / 2 + height]], shade(color, 0.72));
      poly([[W / 2, H], [W, H / 2], [W, H / 2 + height], [W / 2, H + height]], shade(color, 0.55));
      poly(top, color);
      if (rubble) {
        ctx.fillStyle = 'rgba(20,20,20,0.8)';
        for (let i = 0; i < size * 6; i++) {
          const a = (i * 2.399) % (Math.PI * 2), r = ((i * 37) % 100) / 100;
          ctx.fillRect(W / 2 + Math.cos(a) * r * W * 0.3 - 3, H / 2 + Math.sin(a) * r * H * 0.3 - 2, 7, 4);
        }
      }
      if (label) {
        ctx.font = `bold ${size * 12}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(label, W / 2, H / 2);
        ctx.fillStyle = '#ffffff'; ctx.fillText(label, W / 2, H / 2);
      }
    });
  }
}
