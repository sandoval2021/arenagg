import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Custom SW is required for native Web Push. Activation remains user-driven:
      // updateServiceWorker(true) posts SKIP_WAITING only after the user confirms.
      strategies: 'injectManifest',
      registerType: 'prompt',
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
