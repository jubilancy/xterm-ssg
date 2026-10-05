import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Two pages: index.html (landing) and media.html (served at /media by the host: Cloudflare Pages does it by default, Shipstatic via ship.json).
export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), media: resolve(import.meta.dirname, 'media.html') },
    },
  },
});
