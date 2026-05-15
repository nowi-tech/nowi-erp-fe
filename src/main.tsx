import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler } from '@sentry/react';
import './index.css';
import './i18n';
import App from './App';

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
