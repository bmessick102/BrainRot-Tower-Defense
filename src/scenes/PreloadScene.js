// First scene: loads only what the loading screen itself shows (the animated title backdrop's art and the UI
// font), then starts the backdrop and hands off to BootScene, which loads the core files in front of it (the rest
// streams in later: src/assetPlan.js).
import Phaser from 'phaser';
import { IMAGE_FILES } from '../assetManifest.js';
import { FONT_FAMILY } from '../theme.js';
import { TITLE_ART_KEYS } from './TitleBackdropScene.js';

const BASE = import.meta.env.BASE_URL;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    for (const f of IMAGE_FILES) if (TITLE_ART_KEYS.includes(f.key)) this.load.image(f.key, BASE + f.path);
    // UI display face; if it fails, text falls back to the heavy system fonts in theme.FONT.
    this.load.font(FONT_FAMILY, BASE + 'assets/fonts/LilitaOne-Regular.ttf', 'truetype');
    this.load.on('loaderror', (file) => console.warn(`Asset failed to load: ${file.key}`));
  }

  create() {
    this.scene.launch('VersionScene'); // version label in the corner, above every screen
    this.scene.launch('TitleBackdropScene'); // the animated title picture, under the loading bar
    this.scene.start('BootScene');
  }
}
