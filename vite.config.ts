import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'node:path';

const sentryDsn = process.env.SENTRY_DSN || process.env.VITE_SENTRY_DSN || '';
const release = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VITE_APP_VERSION || '';

export default defineConfig({
  build: {
    sourcemap: 'hidden',
  },
  define: {
    'import.meta.env.VITE_SENTRY_DSN': JSON.stringify(sentryDsn),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(release),
  },
  plugins: [
    react(),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: release ? { name: release } : undefined,
      disable: !process.env.SENTRY_AUTH_TOKEN,
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'NOWI ERP',
        short_name: 'NOWI',
        description: 'NOWI garment manufacturing tracker',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [],
        navigateFallback: '/index.html',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
