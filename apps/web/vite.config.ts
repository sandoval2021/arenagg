import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The PWA must never remain pinned to a waiting worker on mobile.
      // autoUpdate works with the custom injectManifest SW, which calls
      // skipWaiting()/clients.claim() to promote the newest build immediately.
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: false,
      includeAssets: [
        'manifest.webmanifest',
        'chavea-logo.svg',
        'logo.svg',
        'apple-touch-icon.png',
        'icons/*.png',
      ],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        injectionPoint: 'self.__WB_MANIFEST',
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
});
