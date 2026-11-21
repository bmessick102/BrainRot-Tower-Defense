// Phaser game config + scene list.
import Phaser from 'phaser';
import { PreloadScene } from './scenes/PreloadScene.js';
import { TitleBackdropScene } from './scenes/TitleBackdropScene.js';
import { BootScene } from './scenes/BootScene.js';
import { AuthScene } from './scenes/AuthScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { HowToPlayScene } from './scenes/HowToPlayScene.js';
import { GameScene } from './scenes/GameScene.js';
import { UIScene } from './scenes/UIScene.js';
import { PauseScene } from './scenes/PauseScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { VersionScene } from './scenes/VersionScene.js';
import { AssetStreamScene } from './scenes/AssetStreamScene.js';
import { setGameStorage, getStorage } from './state/GameState.js';
import { session } from './net/account.js';
import { showLockOverlay } from './objects/LockOverlay.js';
import { installPhaserPerf } from './phaserPerf.js';
import { isLowQuality, qualityMode, setQualityMode, setAutoLow, LowFpsWatch } from './quality.js';
import { loadGraphicsSetting } from './logic/save.js';

// Cheaper Graphics arcs (rounded buttons, circles), and fewer particles in low graphics quality: phaserPerf.js.
installPhaserPerf(Phaser, isLowQuality);

// The game saves through the account session: into the open village (uploaded to the server), or into
// plain localStorage when no village is open (offline play).
setGameStorage(session.storage);
setQualityMode(loadGraphicsSetting(getStorage())); // Settings > Graphics (quality.js)

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
  input: { activePointers: 2 },     // two fingers: pinch to zoom the map
  // TitleBackdropScene sits right after PreloadScene so it draws under the loading, login and title screens.
  // AssetStreamScene draws nothing: it streams the files that aren't loaded up front (src/assetLoader.js).
  scene: [PreloadScene, TitleBackdropScene, BootScene, AuthScene, TitleScene, HowToPlayScene, GameScene, UIScene, PauseScene, GameOverScene, VersionScene, AssetStreamScene]
});

// Graphics 'auto': a game that keeps running under 30 fps (not while loading) switches to low quality.
const fpsWatch = new LowFpsWatch();
game.events.on('step', (time, delta) => {
  if (qualityMode() !== 'auto' || isLowQuality()) return;
  if (game.scene.isActive('PreloadScene') || game.scene.isActive('BootScene')) { fpsWatch.reset(); return; }
  if (!fpsWatch.feed(delta)) return;
  setAutoLow(true);
  const ui = game.scene.isActive('UIScene') && game.scene.getScene('UIScene');
  if (ui && ui.showBanner) ui.showBanner('Graphics set to Low for smoother play (Settings)');
});

// Phones turned upright mid-game: pause, since the "turn your phone sideways" message (index.html) covers it.
if (typeof window !== 'undefined' && window.matchMedia) {
  const upright = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const onTurn = () => {
    if (!upright.matches || !game.scene.isActive('GameScene')) return;
    const world = game.scene.getScene('GameScene');
    if (world && world.openPause) world.openPause();
  };
  if (upright.addEventListener) upright.addEventListener('change', onTurn);
}

// A village this tab had open was opened in another tab (or saved newer elsewhere): this tab stopped saving
// it, so it says so over everything and pauses (src/objects/LockOverlay.js).
session.subscribe(() => { if (session.lock) showLockOverlay(session.lock, game); });

// Dev server only: lets automated checks and the browser console inspect the running game.
if (import.meta.env.DEV) { window.__IBTD__ = game; window.__IBTD_SESSION__ = session; }

export default game;
