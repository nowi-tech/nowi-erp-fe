import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Dialog } from '@capacitor/dialog';
import { StatusBar, Style } from '@capacitor/status-bar';
import { me as fetchMe } from '@/api/auth';

/**
 * APK-only UX hardening for factory use (no-op on the website):
 *  - Android Back button: navigate within the app; confirm before exit
 *    (so a stray Back tap can't kill a half-entered form).
 *  - Offline banner: factory Wi-Fi drops constantly — make it visible
 *    instead of letting saves fail silently.
 *  - Resume: re-validate the session and re-assert the status bar after
 *    the phone has been asleep all shift. A network error on resume must
 *    NOT log the worker out (only a real 401 does, via the interceptor).
 */

const BANNER_ID = 'nowi-offline-banner';

function ensureBanner(): HTMLElement {
  let el = document.getElementById(BANNER_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = BANNER_ID;
  el.textContent = 'No internet connection — changes can’t be saved';
  el.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'top:var(--safe-area-inset-top, 0px)',
    'z-index:2147483646',
    'background:#b91c1c',
    'color:#fff',
    'font:600 13px/1.4 var(--font-sans, system-ui, sans-serif)',
    'text-align:center',
    'padding:8px 12px',
    'display:none',
  ].join(';');
  document.body.appendChild(el);
  return el;
}

function setOffline(offline: boolean): void {
  ensureBanner().style.display = offline ? 'block' : 'none';
}

export async function initNativeFeatures(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  // ── Android hardware Back button ───────────────────────────────
  try {
    await App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
        return;
      }
      void Dialog.confirm({
        title: 'Exit NOWI ERP?',
        message: 'Do you want to close the app?',
        okButtonTitle: 'Exit',
        cancelButtonTitle: 'Stay',
      }).then(({ value }) => {
        if (value) App.exitApp();
      });
    });
  } catch {
    /* @capacitor/app missing on this build — non-fatal. */
  }

  // ── Offline banner ─────────────────────────────────────────────
  try {
    const status = await Network.getStatus();
    setOffline(!status.connected);
    await Network.addListener('networkStatusChange', (s) => {
      setOffline(!s.connected);
    });
  } catch {
    /* @capacitor/network missing — non-fatal. */
  }

  // ── Resume: re-assert status bar + revalidate session ──────────
  try {
    await App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      void StatusBar.setStyle({ style: Style.Light }).catch(() => undefined);
      // A 401 here is hard-redirected by the apiClient interceptor
      // (session truly revoked). Network errors are swallowed — the
      // worker stays signed in (opaque sessions never expire).
      void fetchMe().catch(() => undefined);
    });
  } catch {
    /* non-fatal */
  }
}
