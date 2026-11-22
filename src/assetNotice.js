// On-screen notices for pictures that can't be loaded (DOM, so they show over every scene and still work if a scene
// crashed): the browser can't show WebP (the game's picture format), or many pictures failed even after the retries
// (src/assetLoader.js). Without these a village just shows grey placeholder blocks and nobody knows why.
import { onFailedChange, retryFailedAssets } from './assetLoader.js';

const NOTICE_AFTER = 3; // this many pictures given up on

const WEBP_TEST = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

/** Can this browser show WebP pictures? (A tiny lossless WebP is decoded: Safari before 14 and iOS 13 and older can't.) */
export function webpSupported() {
  if (typeof Image === 'undefined') return Promise.resolve(true);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > 0 && img.height > 0);
    img.onerror = () => resolve(false);
    img.src = WEBP_TEST;
  });
}

function box(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;z-index:50;left:50%;transform:translateX(-50%);max-width:min(92vw,560px);box-sizing:border-box;'
      + 'background:#2a1d36;color:#fff6d8;border:3px solid #f2a227;border-radius:14px;padding:12px 16px;text-align:center;'
      + 'font:bold 16px/1.35 "Trebuchet MS",system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.6)';
    document.body.appendChild(el);
  }
  return el;
}

function button(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'margin:10px 6px 0;padding:8px 18px;font:bold 16px "Trebuchet MS",system-ui,sans-serif;color:#fff;background:#3c8d2f;'
    + 'border:2px solid #1c3d14;border-radius:10px;cursor:pointer';
  b.onclick = onClick;
  return b;
}

/** "Update your browser": shown instead of starting the game when WebP can't be shown. `onPlay` starts it anyway. */
export function showWebpMessage(onPlay) {
  const el = box('webp-notice');
  el.style.cssText += ';top:50%;transform:translate(-50%,-50%)';
  el.innerHTML = '<div style="font-size:20px;margin-bottom:6px">Your browser is too old for this game\'s pictures</div>'
    + '<div style="font-weight:normal">The game\'s art is in the WebP format, which this browser can\'t show. Update your browser '
    + '(iPhone and iPad: update iOS to 14 or newer; Mac: update Safari) or open the game in a current Chrome, Edge or Firefox.</div>';
  el.appendChild(button('Play anyway (no pictures)', () => { el.remove(); onPlay(); }));
}

/** Watch the loader: when several pictures stay missing, show a notice with Retry and Reload; it goes away on recovery. */
export function installAssetNotice() {
  onFailedChange((count) => {
    const old = document.getElementById('asset-notice');
    if (count < NOTICE_AFTER) { if (old) old.remove(); return; }
    const el = box('asset-notice');
    el.style.top = '12px';
    el.textContent = `Some pictures failed to load (${count}). Check your connection, then try again.`;
    el.appendChild(document.createElement('br'));
    el.appendChild(button('Retry', () => retryFailedAssets()));
    el.appendChild(button('Reload page', () => window.location.reload()));
  });
}
