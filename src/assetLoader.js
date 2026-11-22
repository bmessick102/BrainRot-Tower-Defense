// Loads the deferred files (src/assetPlan.js) while the game runs (v0.6.2). A hidden scene that never stops
// (src/scenes/AssetStreamScene.js, launched by BootScene) owns a Phaser loader and feeds it a few files at a time from a queue,
// so a file asked for urgently (a village about to open, a picture on screen right now) jumps ahead of the
// background ones. A few downloads at once keep the game smooth on a phone while it streams.
//
// requestImages / requestAudio return a promise that resolves when the file is ready (or failed: the game then
// keeps its fallback: a lower-level picture, or no music). When a batch with pictures finishes, the game emits
// ASSETS_ADDED (the keys), so screens drawn once (How to Play) can redraw; the map's buildings pick up new
// pictures on their own (BuildingView re-picks its texture every frame).
import { imagePath, audioPath } from './assetPlan.js';
import { FILE_KEY_ALIASES } from './assetKeys.js';

const BASE = import.meta.env.BASE_URL;
export const ASSETS_ADDED = 'assets-added';
const BATCH = 6;            // files handed to the loader at a time
const PARALLEL = 4;         // downloads at once

const RETRY_DELAYS = [2000, 6000, 15000]; // ms before our own retries of a failed file (Phaser retried twice at once already)
const SWAP = '__retry';     // a picture loaded over a placeholder waits under this key until it replaces it

const queue = [];           // { kind: 'image' | 'audio', key }
const waiting = new Map();  // key -> [resolve]
const queued = new Set();   // keys queued or loading (never asked twice)
let stream = null;          // the AssetStreamScene, once it's running

let unsupported = false;   // this browser can't show WebP: retrying would only repeat the failures

/** The browser can't decode the game's pictures (main.js): stop retrying and counting them as failed loads. */
export const setPicturesUnsupported = () => { unsupported = true; };
export const picturesUnsupported = () => unsupported;

const tries = new Map();    // key -> retries done
const failed = new Map();   // key -> kind, for files given up on (until retryFailedAssets)
const failListeners = new Set();

const textureKey = (key) => FILE_KEY_ALIASES[key] || key;
const FILE_KEY_OF = Object.fromEntries(Object.entries(FILE_KEY_ALIASES).map(([file, tex]) => [tex, file])); // texture -> file key

/** Is this texture one of BootScene's stand-in shapes (not the real picture)? */
function isPlaceholder(tk) {
  const ph = stream && stream.registry.get('placeholderKeys');
  return !!ph && ph.has(tk);
}

function isReady(kind, key) {
  if (!stream) return false;
  if (kind !== 'image') return stream.cache.audio.exists(key);
  const tk = textureKey(key);
  return stream.textures.exists(tk) && !isPlaceholder(tk);
}

function settle(key, ok) {
  queued.delete(key);
  const list = waiting.get(key);
  waiting.delete(key);
  if (list) for (const fn of list) fn(ok);
}

function enqueue(kind, key, front) {
  if (!(kind === 'image' ? imagePath(key) : audioPath(key))) return Promise.resolve(false); // no such file
  if (isReady(kind, key)) return Promise.resolve(true);
  const p = new Promise((resolve) => { if (!waiting.has(key)) waiting.set(key, []); waiting.get(key).push(resolve); });
  if (queued.has(key)) {
    // Already waiting in the background: move it to the front if it's now urgent.
    const i = queue.findIndex((q) => q.key === key);
    if (front && i > 0) queue.unshift(queue.splice(i, 1)[0]);
  } else {
    queued.add(key);
    if (front) queue.unshift({ kind, key }); else queue.push({ kind, key });
  }
  pump();
  return p;
}

/** Load these pictures (front: before anything else queued). Resolves when all are ready or have failed. */
export function requestImages(keys, { front = false } = {}) {
  const list = front ? [...keys].reverse() : keys; // (front: unshifted one by one, so reverse keeps their order)
  return Promise.all(list.map((k) => enqueue('image', k, front))).then((r) => r.every(Boolean));
}

/** Load this sound now (music and ambience). Resolves true when it's ready. */
export function requestAudio(key) {
  return enqueue('audio', key, true);
}

/** Has this picture been asked for (or loaded) already? (buildingTextureKey asks once per key.) */
export function imageRequested(key) {
  return queued.has(key) || failed.has(key) || isReady('image', key); // (a picture given up on isn't asked for again every frame)
}

/** How many pictures were given up on (after the retries), and a hook to hear when that changes. */
export const failedImageCount = () => [...failed.values()].filter((k) => k !== 'audio').length;
export function onFailedChange(fn) { failListeners.add(fn); return () => failListeners.delete(fn); }
const failedChanged = () => { for (const fn of failListeners) fn(failedImageCount()); };

/**
 * Pictures BootScene had to draw placeholders for that can't be swapped in later (the map, UI, enemies: their views
 * were sized for the placeholder). They count toward the notice, whose Reload button is the fix.
 */
export function markBrokenImages(keys) {
  for (const k of keys) failed.set(k, 'broken');
  failedChanged();
}

/** Ask again for everything given up on (the notice's Retry button, the browser coming back online). */
export function retryFailedAssets() {
  const list = [...failed].filter(([, kind]) => kind !== 'broken');
  for (const [key] of list) failed.delete(key);
  for (const [key] of list) tries.delete(key);
  failedChanged();
  for (const [key, kind] of list) enqueue(kind, key, false);
}

function pump() {
  if (!stream || stream.load.isLoading()) return;
  let added = 0, images = [];
  while (queue.length && added < BATCH) {
    const { kind, key } = queue.shift();
    if (isReady(kind, key)) { settle(key, true); continue; }
    const n = tries.get(key) || 0, bust = n ? `?r=${n}` : ''; // (a retry skips a cached failure)
    if (kind === 'image') {
      const tk = textureKey(key);
      stream.load.image(stream.textures.exists(tk) ? tk + SWAP : tk, BASE + imagePath(key) + bust); // (over a placeholder: swapped in below)
      images.push(key);
    } else stream.load.audio(key, BASE + audioPath(key) + bust);
    added++;
  }
  if (!added) return;
  stream.batchImages = images;
  stream.load.start();
}

/** Every game object under `list` (containers included) whose texture is one of `keys`: [object, key, frame name]. */
function usersOf(list, keys, out = []) {
  for (const o of list || []) {
    if (o.texture && keys.has(o.texture.key)) out.push([o, o.texture.key, o.frame && o.frame.name]);
    if (o.list) usersOf(o.list, keys, out);
  }
  return out;
}

/**
 * Pictures that loaded over placeholders (a boot-time load that failed, now back): drop each placeholder and give the
 * real texture its key. Anything drawing the placeholder right now is pointed at the new texture in the same tick, so
 * nothing renders with the removed one. (Building views also re-pick their texture every frame.)
 */
function swapIn(scene, tmpKeys) {
  const bases = new Map(tmpKeys.filter((t) => scene.textures.exists(t)).map((t) => [t.slice(0, -SWAP.length), t]));
  if (!bases.size) return;
  const users = [];
  try { for (const sc of scene.game.scene.getScenes(false)) usersOf(sc.children && sc.children.list, new Set(bases.keys()), users); } catch { /* best effort */ }
  const ph = scene.registry.get('placeholderKeys');
  for (const [base, tmp] of bases) {
    if (scene.textures.exists(base)) scene.textures.remove(base);
    scene.textures.renameTexture(tmp, base);
    if (ph) ph.delete(base);
  }
  for (const [o, key, frame] of users) {
    try { o.setTexture(key, scene.textures.get(key).has(frame) ? frame : undefined); } catch { /* destroyed meanwhile */ }
  }
}

/**
 * Hook up the scene that does the loading (AssetStreamScene, src/scenes/AssetStreamScene.js; it never stops) and
 * start on whatever was asked for before it was running.
 */
export function attachStream(scene) {
  stream = scene;
  scene.load.maxParallelDownloads = PARALLEL;
  scene.load.on('filecomplete', (key) => {
    if (key.endsWith(SWAP)) { scene.pendingSwaps = [...(scene.pendingSwaps || []), key]; return; } // (settled once swapped in)
    const file = FILE_KEY_OF[key] || key;
    tries.delete(file);
    settle(file, true);
  });
  scene.load.on('loaderror', (file) => {
    const key = FILE_KEY_OF[file.key.replace(SWAP, '')] || file.key.replace(SWAP, '');
    const kind = file.type === 'image' ? 'image' : 'audio';
    const n = tries.get(key) || 0;
    if (unsupported) { settle(key, false); return; }
    if (n < RETRY_DELAYS.length) {
      // Our own retry, after a wait (Phaser's own two retries are instant, which a flaky connection fails the same way).
      tries.set(key, n + 1);
      console.warn(`Asset failed to load, retrying (${n + 1}): ${key}`);
      setTimeout(() => { queue.push({ kind, key }); pump(); }, RETRY_DELAYS[n]);
      return;
    }
    console.warn(`Asset failed to load: ${key}`);
    failed.set(key, kind);
    settle(key, false);
    failedChanged();
  });
  if (typeof window !== 'undefined') window.addEventListener('online', () => { if (failed.size) retryFailedAssets(); });
  scene.load.on('complete', () => {
    const swaps = scene.pendingSwaps || [];
    scene.pendingSwaps = [];
    if (swaps.length) {
      swapIn(scene, swaps);
      for (const t of swaps) { const file = FILE_KEY_OF[t.slice(0, -SWAP.length)] || t.slice(0, -SWAP.length); tries.delete(file); settle(file, true); }
    }
    const images = scene.batchImages || [];
    scene.batchImages = [];
    if (images.length) scene.game.events.emit(ASSETS_ADDED, images);
    pump();
  });
  pump();
}
