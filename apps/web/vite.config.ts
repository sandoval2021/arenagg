import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The standalone mobile PWA must never leave a newer worker waiting for
      // every tab/window to close. autoUpdate is the primary registration mode;
      // the custom injectManifest worker also calls skipWaiting/clients.claim.
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
      },
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
