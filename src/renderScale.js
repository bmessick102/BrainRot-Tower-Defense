// Sharp rendering (v0.9.3): the game is laid out in a 1280 x 720 view (VIEW), but its canvas is drawn at the screen's
// real pixel size, up to a cap, so the map, the art and the text stay crisp on big and high-DPI screens instead of
// being a 1280 x 720 picture stretched to fit.
//
// How: the canvas is VIEW x renderScale() pixels and every scene's camera zooms by renderScale(), so each scene keeps
// working in VIEW coordinates.
// - The screens (title, HUD, windows: every scene but the two map scenes) get a camera zoomed by the scale and
//   centered on the view (fitViewCamera, applied whenever a scene starts and whenever the scale changes).
// - The map scenes (GameScene, VisitScene) already work in canvas pixels (pointer, camera size and zoom together),
//   so only their zoom limits and drag threshold are scaled (zoomLimit, dragThreshold), and what they hand the HUD in
//   screen coordinates is divided by the scale (toView).
// - Text is rendered at the scale too (installSharpText), or it would be the one blurry thing left.
// Low graphics draws at 1 (the old 1280 x 720 canvas: a quarter of the pixels at a scale of 2). Phones are capped
// lower than desktops (their screens are small and dense, their GPUs weaker).
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const VIEW = { width: VIEW_W, height: VIEW_H };
export const RENDER_SCALE_CAP = { desktop: 2, touch: 1.5 };
const MAP_SCENES = new Set(['GameScene', 'VisitScene']);

let scale = 1;

/** The canvas pixels per view pixel right now (1 = the plain 1280 x 720 canvas). */
export const renderScale = () => scale;

/** Is this a map scene (its own zoom), rather than a screen laid out in the view? */
export const isMapScene = (key) => MAP_SCENES.has(key);

/**
 * The scale this screen wants: the canvas's displayed size times the device pixel ratio, over the view's width,
 * in steps of 0.25, between 1 and the cap. Pure: pass the window's numbers.
 */
export function pickRenderScale({ width, height, dpr = 1, touch = false, low = false }) {
  if (low || !(width > 0) || !(height > 0)) return 1;
  const shown = Math.min(width, height * (VIEW_W / VIEW_H)); // the canvas is fitted to the window
  const want = Math.ceil(((shown * (dpr || 1)) / VIEW_W) * 4 - 0.05) / 4; // (a hair under a step rounds down)
  return Math.max(1, Math.min(touch ? RENDER_SCALE_CAP.touch : RENDER_SCALE_CAP.desktop, want));
}

/** The browser window's numbers for pickRenderScale. */
export function windowMetrics(parent) {
  if (typeof window === 'undefined') return { width: VIEW_W, height: VIEW_H, dpr: 1, touch: false };
  const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const { width, height } = parent?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight };
  return { width, height, dpr: window.devicePixelRatio || 1, touch };
}

/** Set the scale before the game is made (main.js sizes the canvas from it). */
export function initRenderScale(s) { scale = s; }

/** A screen scene's camera: zoomed by the scale, showing exactly the 1280 x 720 view. */
export function fitViewCamera(scene) {
  const cam = scene && scene.cameras && scene.cameras.main;
  if (!cam) return;
  cam.setZoom(scale);
  cam.centerOn(VIEW_W / 2, VIEW_H / 2);
}

/** A map scene's zoom limit or start zoom (config numbers are per view pixel). */
export const zoomLimit = (z) => z * scale;
/** A drag threshold in canvas pixels (config numbers are view pixels). */
export const dragThreshold = (px) => px * scale;
/** A canvas-pixel point (from a map scene) in view coordinates, for the HUD. */
export const toView = (p) => (p ? { ...p, x: p.x / scale, y: p.y / scale } : p);

/**
 * Change the scale while the game runs (window resized, graphics set to low): resize the canvas, then refit every
 * running scene's camera. Map scenes keep the same zoom per view pixel and the same middle of the screen.
 */
export function applyRenderScale(game, s) {
  if (!game || s === scale) return;
  const old = scale;
  const keep = [];
  for (const sc of game.scene.getScenes(false)) {
    const cam = sc.cameras && sc.cameras.main;
    if (!cam || !isMapScene(sc.sys.settings.key)) continue;
    keep.push({ sc, cam, zoom: cam.zoom / old, midX: cam.scrollX + cam.width / 2, midY: cam.scrollY + cam.height / 2 });
  }
  scale = s;
  game.scale.setGameSize(Math.round(VIEW_W * s), Math.round(VIEW_H * s));
  for (const sc of game.scene.getScenes(false)) if (!isMapScene(sc.sys.settings.key)) fitViewCamera(sc);
  for (const { sc, cam, zoom, midX, midY } of keep) {
    cam.setZoom(Math.max(zoom * s, sc.minZoom?.() ?? 0));
    cam.centerOn(midX, midY);
    sc.press = null;
    sc.pinch = null;
    if (sc.clampCamera) sc.clampCamera();
  }
}

/** Refresh CSS fitting and Phaser's input transform even when the backing resolution stays the same. */
export function syncViewport(game, low) {
  const manager = game.scale;
  if (!manager.canvas) return;
  const metrics = windowMetrics(manager.parent);
  if (!(metrics.width > 0 && metrics.height > 0)) return;
  manager.getParentBounds();
  const next = pickRenderScale({ ...metrics, low });
  if (next === scale) manager.refresh();
  else applyRenderScale(game, next);
}

/**
 * Every screen scene's camera fits the view whenever the scene starts (Phaser makes a scene's cameras on start).
 * Called once with Phaser, before the game is made.
 */
export function installViewCameras(Phaser) {
  const CM = Phaser.Cameras.Scene2D.CameraManager.prototype;
  const start = CM.start;
  CM.start = function (...args) {
    const r = start.apply(this, args);
    const key = this.systems && this.systems.settings && this.systems.settings.key;
    if (!isMapScene(key)) fitViewCamera(this.systems.scene);
    return r;
  };
}

/** Text drawn at the render scale (unless a style asks for its own resolution). */
export function installSharpText(Phaser) {
  const F = Phaser.GameObjects.GameObjectFactory.prototype;
  const text = F.text;
  F.text = function (x, y, str, style) {
    const t = text.call(this, x, y, str, style);
    if (scale > 1 && !(style && style.resolution)) t.setResolution(scale);
    return t;
  };
}
