// Build for publishing as a hosted web page: three.js and Preact load from jsdelivr through an import map
// (the host only allows scripts from approved CDNs); the game's own code, worker, styles and map data ship
// as files beside the page. `node scripts/build-artifact.mjs` runs this and writes the page itself.
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export const CDN: Record<string, string> = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js',
  'three/examples/jsm/controls/MapControls.js': 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/MapControls.js',
  preact: 'https://cdn.jsdelivr.net/npm/preact@10.29.8/dist/preact.module.js',
  'preact/hooks': 'https://cdn.jsdelivr.net/npm/preact@10.29.8/hooks/dist/hooks.module.js',
  'preact/jsx-runtime': 'https://cdn.jsdelivr.net/npm/preact@10.29.8/jsx-runtime/dist/jsxRuntime.module.js',
};

export default defineConfig({
  base: './',
  plugins: [preact({ devToolsEnabled: false, prefreshEnabled: false } as any)],
  define: { 'import.meta.env.VITE_ARTIFACT': JSON.stringify('1') },
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/sim-worker.js' } } },
  build: {
    outDir: 'dist-artifact',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      external: Object.keys(CDN),
      output: { entryFileNames: 'assets/app.js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' },
    },
  },
} as any);
