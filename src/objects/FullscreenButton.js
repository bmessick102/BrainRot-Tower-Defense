// A small square button that turns full screen on and off (title, login and pause screens).
// Hidden where the browser can't do it (iPhone Safari: Add to Home Screen gives full screen instead).
import { Button } from './Button.js';
import { COLORS } from '../theme.js';
import { canFullscreen, toggleFullscreen } from '../device.js';

export function addFullscreenButton(scene, x, y, size = 52) {
  if (!canFullscreen(scene)) return null;
  const sm = scene.scale;
  const icon = () => (sm.isFullscreen ? 'exitFullscreen' : 'fullscreen');
  const btn = new Button(scene, x, y, size, size - 2, '', () => toggleFullscreen(scene),
    { icon: icon(), color: COLORS.buttonDark, radius: 10, onRelease: true });
  const sync = () => { if (btn.scene) { btn.icon = icon(); btn.redraw(); } };
  sm.on('enterfullscreen', sync);
  sm.on('leavefullscreen', sync);
  btn.once('destroy', () => { sm.off('enterfullscreen', sync); sm.off('leavefullscreen', sync); });
  return btn;
}
