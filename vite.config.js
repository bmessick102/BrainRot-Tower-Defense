import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// The version shown in the corner of the screen: package.json's "version", plus the git commit it was
// built from (GitHub Actions checks the repo out, so the deployed site shows the commit that's live).
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ }

export default defineConfig({
  // GitHub Pages serves the site from /BrainRot-Tower-Defense/ (the repo name)
  base: '/BrainRot-Tower-Defense/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit)
  },
  build: {
    // Phaser alone is ~1.2 MB minified; don't warn about it (the whole game passed 2 MB in v0.6).
    chunkSizeWarningLimit: 2500
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node'
  }
});
