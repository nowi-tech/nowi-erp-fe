import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
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
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
