import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      injectRegister: null,
      devOptions: { enabled: false },
      manifest: {
        name: 'VitalisX', short_name: 'VitalisX', display: 'standalone',
        theme_color: '#0b0f14', background_color: '#0b0f14',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // App shell, bundled fonts, every data JSON (incl. donki_snapshot.json) are precached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          { urlPattern: ({ request }) => request.mode === 'navigate', handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 3 } },
          { urlPattern: /\/data\/.*\.json$/, handler: 'StaleWhileRevalidate',
            options: { cacheName: 'data' } },
        ],
      },
    }),
  ],
})
