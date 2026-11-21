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

const queue = [];           // { kind: 'image' | 'audio', key }
const waiting = new Map();  // key -> [resolve]
const queued = new Set();   // keys queued or loading (never asked twice)
let stream = null;          // the AssetStreamScene, once it's running

const textureKey = (key) => FILE_KEY_ALIASES[key] || key;
const FILE_KEY_OF = Object.fromEntries(Object.entries(FILE_KEY_ALIASES).map(([file, tex]) => [tex, file])); // texture -> file key

function isReady(kind, key) {
  if (!stream) return false;
  return kind === 'image' ? stream.textures.exists(textureKey(key)) : stream.cache.audio.exists(key);
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
  return queued.has(key) || isReady('image', key);
}

function pump() {
  if (!stream || stream.load.isLoading()) return;
  let added = 0, images = [];
  while (queue.length && added < BATCH) {
    const { kind, key } = queue.shift();
    if (isReady(kind, key)) { settle(key, true); continue; }
    if (kind === 'image') { stream.load.image(textureKey(key), BASE + imagePath(key)); images.push(key); }
    else stream.load.audio(key, BASE + audioPath(key));
    added++;
  }
  if (!added) return;
  stream.batchImages = images;
  stream.load.start();
}

/**
 * Hook up the scene that does the loading (AssetStreamScene, src/scenes/AssetStreamScene.js; it never stops) and
 * start on whatever was asked for before it was running.
 */
export function attachStream(scene) {
  stream = scene;
  scene.load.maxParallelDownloads = PARALLEL;
  scene.load.on('filecomplete', (key) => settle(FILE_KEY_OF[key] || key, true));
  scene.load.on('loaderror', (file) => { console.warn(`Asset failed to load: ${file.key}`); settle(FILE_KEY_OF[file.key] || file.key, false); });
  scene.load.on('complete', () => {
    const images = scene.batchImages || [];
    scene.batchImages = [];
    if (images.length) scene.game.events.emit(ASSETS_ADDED, images);
    pump();
  });
  pump();
}
