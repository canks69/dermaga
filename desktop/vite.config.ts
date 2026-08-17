import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  // Assets load from disk in the packaged app (file://), so paths stay relative.
  base: './',
  resolve: {
    // import.meta.dirname rather than __dirname: Vite 8 loads this config
    // natively as ESM.
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      // The logo lives once, at the repo root, and is shared by the README,
      // the app icon and the renderer.
      '@assets': path.resolve(import.meta.dirname, '../assets'),
    },
  },
  server: {
    port: 3000,
    strictPort: false,
    // The shared assets directory sits above this project root.
    fs: { allow: ['..'] },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    // Vite 8 minifies with oxc by default; naming esbuild now needs it
    // installed separately.
    sourcemap: false,
  },
});
