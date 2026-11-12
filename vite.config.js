import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /BrainRot-Tower-Defense/ (the repo name)
  base: '/BrainRot-Tower-Defense/',
  build: {
    // Phaser alone is ~1.2 MB minified; don't warn about it.
    chunkSizeWarningLimit: 2000
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node'
  }
});
