import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // generateSW is the default strategy: Workbox precaches the built
      // app-shell assets it finds via globPatterns below. Nothing here
      // adds any runtimeCaching entries, so Supabase requests (a
      // different origin entirely) are never intercepted or cached by
      // the service worker — they simply pass through to the network
      // exactly as they do today. No offline mode, no stale financial
      // data, no fake offline-success state.
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'CountWise',
        short_name: 'CountWise',
        description: 'Every expense counts.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F7F5F0',
        theme_color: '#15171B',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the built JS/CSS/HTML/font/icon assets — the
        // app shell. No API routes, no Supabase origin is in scope here
        // at all, so there is nothing to explicitly exclude: workbox's
        // precache manifest is built solely from this app's own build
        // output, and it has no knowledge of any other origin.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
      },
    }),
  ],
})
