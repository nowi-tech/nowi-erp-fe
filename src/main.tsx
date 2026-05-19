import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import './index.css';
import './i18n';
import App from './App';
import { initNativeShell, markNativeApp } from './native/capacitor-init';
import { initNativeFeatures } from './native/native-features';
import { checkForUpdate } from './native/update-check';

// Must run synchronously BEFORE first paint so the safe-area CSS engages.
markNativeApp();
// Configure the native shell (status bar, splash) on the APK; no-op on web.
void initNativeShell();
// Back button, offline banner, resume handling; no-op on web.
void initNativeFeatures();
// Update check: defer past the splash so the Capacitor bridge is fully
// injected on the remote-loaded page before the first plugin call.
setTimeout(() => {
  void checkForUpdate();
}, 4000);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
