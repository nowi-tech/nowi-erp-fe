import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import './index.css';
import './i18n';
import App from './App';
import { initNativeShell, markNativeApp, hideSplash } from './native/capacitor-init';
import { initNativeFeatures } from './native/native-features';
import { checkForUpdate } from './native/update-check';
import { installChunkErrorHandlers } from './lib/chunk-reload';

// Must run synchronously BEFORE first paint so the safe-area CSS engages.
markNativeApp();
// Configure the native shell (status bar, splash) on the APK; no-op on web.
void initNativeShell();
// Back button, offline banner, resume handling; no-op on web.
void initNativeFeatures();
// Catch chunk-load failures that escape React's Suspense / error
// boundary (e.g. unhandled promise rejections from lazy() imports) and
// reload once.
installChunkErrorHandlers();

// One-time cleanup: prior versions shipped a Vite-PWA service worker
// that precached the bundle. We removed PWA — but existing users still
// have the SW + its precache controlling their tab, which would keep
// serving the old code. Unregister any leftover SWs + nuke their caches
// so the next reload fetches fresh from the network. Cheap, idempotent,
// and noop in the Capacitor APK (the WebView has no SW).
if ('serviceWorker' in navigator) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch(() => undefined);
}
if ('caches' in window) {
  void caches
    .keys()
    .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
    .catch(() => undefined);
}
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

// Splash is hidden from inside App once it mounts — that way it stays up
// while lazy chunks are still loading and the user never sees a blank
// frame between splash drop and first route paint. Hard fallback here so
// a hung / offline bundle load can't strand the splash forever.
setTimeout(() => {
  void hideSplash();
}, 12000);
