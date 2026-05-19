import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import './index.css';
import './i18n';
import App from './App';
import { initNativeShell } from './native/capacitor-init';
import { checkForUpdate } from './native/update-check';

// Configure the native shell (status bar, splash) on the APK; no-op on web.
void initNativeShell();
// Launch-time APK update check against the GCS manifest; no-op on web.
void checkForUpdate();

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
