// First scene: loads only what the loading screen itself shows (the title background and the UI font),
// then hands off to BootScene, which loads everything else in front of them.
import Phaser from 'phaser';
import { IMAGE_FILES } from '../assetManifest.js';
import { TEX } from '../assetKeys.js';
import { FONT_FAMILY } from '../theme.js';

const BASE = import.meta.env.BASE_URL;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    const bg = IMAGE_FILES.find((f) => f.key === TEX.titleBackground);
    if (bg) this.load.image(bg.key, BASE + bg.path);
    // UI display face; if it fails, text falls back to the heavy system fonts in theme.FONT.
    this.load.font(FONT_FAMILY, BASE + 'assets/fonts/LilitaOne-Regular.ttf', 'truetype');
    this.load.on('loaderror', (file) => console.warn(`Asset failed to load: ${file.key}`));
  }

  create() {
    this.scene.start('BootScene');
  }
}
