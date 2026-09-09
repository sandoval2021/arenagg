import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Updates are downloaded in the background, but activation is user-driven.
      // The UI uses useRegisterSW() and calls updateServiceWorker(true) only when
      // the user taps "Atualizar Agora".
      registerType: 'prompt',
      manifest: false,
      includeAssets: [
        'manifest.webmanifest',
        'chavea-logo.svg',
        'logo.svg',
        'apple-touch-icon.png',
        'icons/*.png',
      ],
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // API state is authoritative in the Worker/Supabase. Never cache API
            // JSON inside the PWA, including when an old app shell is active.
            urlPattern: /\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
});
