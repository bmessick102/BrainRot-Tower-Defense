// The game's version, small in the bottom-left corner of every screen. It's the last scene in main.js's
// list, so it draws above all the others; it has nothing clickable, so clicks pass through to the game.
import Phaser from 'phaser';
import { versionLabel } from '../version.js';
import { COLORS, textStyle } from '../theme.js';
import { VIEW } from '../renderScale.js';

export class VersionScene extends Phaser.Scene {
  constructor() {
    super('VersionScene');
  }

  create() {
    this.add.text(8, VIEW.height - 4, versionLabel(), textStyle(12, COLORS.textDim)).setOrigin(0, 1).setAlpha(0.8);
  }
}
