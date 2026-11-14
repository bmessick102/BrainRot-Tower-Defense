// The game's version, filled in at build time by vite.config.js from package.json and git.
// Bump "version" in package.json for each release; the commit tells builds of one version apart.
/* global __APP_VERSION__, __APP_COMMIT__ */
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
export const COMMIT = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
const DEV = !!(import.meta.env && import.meta.env.DEV);

/** "v0.2.0 · 1a2b3c4" (live site), "v0.2.0 · dev" (dev server). */
export function versionLabel() {
  const tail = DEV ? 'dev' : COMMIT;
  return tail ? `v${VERSION} · ${tail}` : `v${VERSION}`;
}
