// Phaser game config + scene list.
import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene.js';
import { BootScene } from './scenes/BootScene.js';
import { AuthScene } from './scenes/AuthScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { HowToPlayScene } from './scenes/HowToPlayScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { VersionScene } from './scenes/VersionScene.js';
import { setGameStorage } from './state/GameState.js';
import { session } from './net/account.js';

// The game saves through the account session: into the open village (uploaded to the server), or into
// plain localStorage when no village is open (offline play).
setGameStorage(session.storage);

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#10140f',
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  dom: { createContainer: true }, // text boxes on the login screen and name dialogs
  scene: [PreloadScene, BootScene, AuthScene, TitleScene, HowToPlayScene, GameScene, UIScene, PauseScene, GameOverScene, VersionScene]
});

// Dev server only: lets automated checks and the browser console inspect the running game.
if (import.meta.env.DEV) { window.__IBTD__ = game; window.__IBTD_SESSION__ = session; }

export default game;
