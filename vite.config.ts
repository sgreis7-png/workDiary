import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  define: {
    // build stamp shown in the sidebar + used by the freshness self-heal
    __BUILD_TS__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Agrotop · יומן עבודה',
        short_name: 'יומן עבודה',
        description: 'תיעוד יומי מהשטח — Agrotop Work Diary',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#3aaa35',
        background_color: '#f4f1ea',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        importScripts: ['push-sw.js'],
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // Last-seen data stays viewable offline, but only briefly. Workbox keys this
            // cache by URL and not by Authorization header, so an entry written for one
            // account can be served to the next person signed in on the same device. Ten
            // minutes keeps the offline read working on a site visit while bounding that
            // window; purgeLocalData() deletes the whole cache on sign-out.
            urlPattern: ({ url }) => url.hostname.endsWith('supabase.co') && url.pathname.includes('/rest/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-rest', networkTimeoutSeconds: 5, expiration: { maxEntries: 300, maxAgeSeconds: 60 * 10 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.includes('fonts.g'),
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['framer-motion'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
