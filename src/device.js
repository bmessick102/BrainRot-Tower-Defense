// Phones and tablets: what kind of screen the game is running on, and full screen.
// The game is laid out for a 1280 x 720 landscape screen and scales to fit (main.js). On touch screens the
// mouse-only controls get touch versions: pinch to zoom, drag a building to place it, Place / Cancel buttons.

/** A touch screen is the main way to play (phones, tablets; not a laptop that also has a touch screen). */
export const IS_TOUCH = typeof window !== 'undefined' && !!window.matchMedia
  && window.matchMedia('(pointer: coarse)').matches;

/** Whether this browser can show the game full screen (iPhone Safari can't: Add to Home Screen instead). */
export function canFullscreen(scene) {
  return !!(scene && scene.scale && scene.scale.fullscreen && scene.scale.fullscreen.available);
}

/**
 * Full screen on / off. Call it from a pointerup (Button's `onRelease` option): browsers only allow full
 * screen from a finished tap or click. On phones it also locks the screen sideways where the browser allows it.
 */
export function toggleFullscreen(scene) {
  const sm = scene.scale;
  if (sm.isFullscreen) { sm.stopFullscreen(); return; }
  sm.startFullscreen();
  try {
    const o = typeof screen !== 'undefined' && screen.orientation;
    if (IS_TOUCH && o && o.lock) o.lock('landscape').catch(() => {});
  } catch { /* not supported: the rotate message covers it */ }
}
