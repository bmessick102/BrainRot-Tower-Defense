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
import { VisitScene } from './scenes/VisitScene.js';
import { VisitHudScene } from './scenes/VisitHudScene.js';
import { setGameStorage, getStorage } from './state/GameState.js';
import { session } from './net/account.js';
import { showLockOverlay } from './objects/LockOverlay.js';
import { installCrashGuard } from './objects/CrashOverlay.js';
import { installPhaserPerf } from './phaserPerf.js';
import { isLowQuality, qualityMode, setQualityMode, setAutoLow, LowFpsWatch, onQualityChange } from './quality.js';
import { loadGraphicsSetting } from './logic/save.js';
import { webpSupported, showWebpMessage, installAssetNotice } from './assetNotice.js';
import { setPicturesUnsupported } from './assetLoader.js';
import { VIEW_W, VIEW_H, pickRenderScale, windowMetrics, initRenderScale, syncViewport, installViewCameras, installSharpText, renderScale } from './renderScale.js';

// Cheaper Graphics arcs (rounded buttons, circles), and fewer particles in low graphics quality: phaserPerf.js.
installPhaserPerf(Phaser, isLowQuality);

// The game saves through the account session: into the open village (uploaded to the server), or into
// plain localStorage when no village is open (offline play).
setGameStorage(session.storage);
setQualityMode(loadGraphicsSetting(getStorage())); // Settings > Graphics (quality.js)

export const GAME_WIDTH = VIEW_W;   // the view every screen is laid out in
export const GAME_HEIGHT = VIEW_H;

// Sharp rendering (renderScale.js): the canvas is the view times the screen's real pixel density (capped), and every
// scene's camera zooms by that, so nothing is a stretched 1280 x 720 picture on a big or high-DPI screen.
const gameParent = document.getElementById('game');
initRenderScale(pickRenderScale({ ...windowMetrics(gameParent), low: isLowQuality() }));
installViewCameras(Phaser);
installSharpText(Phaser);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: Math.round(GAME_WIDTH * renderScale()),
  height: Math.round(GAME_HEIGHT * renderScale()),
  backgroundColor: '#10140f',
  banner: false,
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  loader: { timeout: 60000 }, // a stalled download becomes an error (then retried) instead of hanging the loading screen
  dom: { createContainer: true }, // text boxes on the login screen and name dialogs
  input: { activePointers: 2 },     // two fingers: pinch to zoom the map
  // TitleBackdropScene sits right after PreloadScene so it draws under the loading, login and title screens.
  // AssetStreamScene draws nothing: it streams the files that aren't loaded up front (src/assetLoader.js).
  scene: [PreloadScene, TitleBackdropScene, BootScene, AuthScene, TitleScene, HowToPlayScene, GameScene, UIScene, PauseScene, GameOverScene, VisitScene, VisitHudScene, VersionScene, AssetStreamScene]
});

// Pictures that can't load: a notice with Retry when several stay missing, and, for a browser that can't show WebP
// (Safari before 14, iOS 13 and older: every picture would fail), a message to update instead of a village of grey blocks.
installAssetNotice();
webpSupported().then((ok) => { if (!ok) { setPicturesUnsupported(); showWebpMessage(() => {}); } });

// Mobile Safari can report the new orientation before the viewport and parent have finished resizing.
const refreshViewport = () => syncViewport(game, isLowQuality());
let viewportFrame = null, settleTimer = null;
const rescale = () => {
  if (viewportFrame === null) viewportFrame = requestAnimationFrame(() => { viewportFrame = null; refreshViewport(); });
  clearTimeout(settleTimer);
  settleTimer = setTimeout(refreshViewport, 300);
};
game.events.once(Phaser.Core.Events.READY, rescale);
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, rescale);
game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, rescale);
window.addEventListener('resize', rescale);
window.addEventListener('orientationchange', rescale);
window.addEventListener('pageshow', rescale);
window.visualViewport?.addEventListener('resize', rescale);
window.screen.orientation?.addEventListener('change', rescale);
if (window.ResizeObserver) new ResizeObserver(rescale).observe(gameParent);
onQualityChange(rescale);

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
  const onOrientation = () => { rescale(); onTurn(); };
  if (upright.addEventListener) upright.addEventListener('change', onOrientation);
  else upright.addListener?.(onOrientation);
}

// A village this tab had open was opened in another tab (or saved newer elsewhere): this tab stopped saving
// it, so it says so over everything and pauses (src/objects/LockOverlay.js).
session.subscribe(() => { if (session.lock) showLockOverlay(session.lock, game); });

// Graceful fail: an error that stops the game loop (a frozen screen) brings up "Something went wrong" with Keep Playing
// and Reload (src/objects/CrashOverlay.js). Errors that don't stop it are only logged.
installCrashGuard(game);

// Dev server only: lets automated checks and the browser console inspect the running game.
if (import.meta.env.DEV) { window.__IBTD__ = game; window.__IBTD_SESSION__ = session; }

export default game;
