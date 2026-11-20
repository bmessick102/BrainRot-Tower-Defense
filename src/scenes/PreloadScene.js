// First scene: loads only what the loading screen itself shows (the animated title backdrop's art and the UI
// font), then starts the backdrop and hands off to BootScene, which loads everything else in front of it.
import Phaser from 'phaser';
import { IMAGE_FILES, AUDIO_FILES } from '../assetManifest.js';
import { FONT_FAMILY } from '../theme.js';
import { TITLE_ART_KEYS, TITLE_SOUND_KEYS } from './TitleBackdropScene.js';

const BASE = import.meta.env.BASE_URL;

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    for (const f of IMAGE_FILES) if (TITLE_ART_KEYS.includes(f.key)) this.load.image(f.key, BASE + f.path);
    // The title mortar's fire and whistle (BootScene skips keys that are already loaded).
    for (const f of AUDIO_FILES) if (TITLE_SOUND_KEYS.includes(f.key)) this.load.audio(f.key, BASE + f.path);
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
