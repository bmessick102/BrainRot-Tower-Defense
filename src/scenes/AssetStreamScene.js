// Draws nothing and never stops: its loader streams in the files that aren't loaded up front (src/assetLoader.js).
// BootScene launches it once the core files are in.
import Phaser from 'phaser';
import { attachStream } from '../assetLoader.js';

export class AssetStreamScene extends Phaser.Scene {
  constructor() {
    super('AssetStreamScene');
  }

  create() {
    attachStream(this);
  }
}
