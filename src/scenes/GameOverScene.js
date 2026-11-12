// Game over: wave reached, Retry (loads the checkpoint from just before that wave), Quit to Title.
import Phaser from 'phaser';
import { restoreCheckpoint } from '../logic/save.js';
import { getStorage } from '../state/GameState.js';
import { Button } from '../objects/Button.js';
import { TEX } from '../assetKeys.js';
import { drawWindow, drawRibbon } from '../objects/uiDraw.js';
import { COLORS, bodyStyle, textStyle } from '../theme.js';

export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data) {
    this.wave = (data && data.wave) || 0;
  }

  create() {
    const { width, height } = this.scale;
    const bg = this.add.image(width / 2, height / 2, TEX.titleBackground);
    bg.setScale(Math.max(width / bg.frame.width, height / bg.frame.height)).setTint(0x664444);
    this.add.rectangle(0, 0, width, height, 0x200000, 0.55).setOrigin(0);

    const pw = 640, ph = 330, px = width / 2 - pw / 2, py = height / 2 - ph / 2, header = 70;
    drawWindow(this.add.graphics(), px, py, pw, ph, { header });
    this.add.text(width / 2, py + 4 + header / 2, 'Defeat!', textStyle(44, COLORS.textBad)).setOrigin(0.5);
    this.add.text(width / 2, py + 125, 'Your Village Hall was destroyed', bodyStyle(26, COLORS.ink)).setOrigin(0.5);
    drawRibbon(this.add.graphics(), width / 2, py + 160, 280, 48);
    this.add.text(width / 2, py + 182, `Wave reached: ${this.wave}`, textStyle(26)).setOrigin(0.5);

    new Button(this, width / 2 - 140, py + ph - 60, 240, 62, 'Retry', () => this.retry(), { color: COLORS.buttonGood, fontSize: 26 });
    new Button(this, width / 2 + 140, py + ph - 60, 240, 62, 'Quit to Title', () => this.scene.start('TitleScene'), { color: COLORS.buttonDanger, fontSize: 26 });
  }

  retry() {
    const restored = restoreCheckpoint(getStorage());
    this.scene.start('GameScene', { mode: restored ? 'retry' : 'new' });
  }
}
