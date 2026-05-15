import * as Sentry from '@sentry/react';

Sentry.init({
  dsn:
    import.meta.env.VITE_SENTRY_DSN ||
    'https://10f09f0a5b169fe2d7315f1a63442d13@o4511369865330688.ingest.us.sentry.io/4511369866444800',
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION,
  sendDefaultPii: true,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: [
    'localhost',
    /^https:\/\/api\.erp\.nowi\.fashion/,
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  enableLogs: true,
});
