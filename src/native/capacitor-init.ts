import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Adds `native-app` (+ platform) to <html> so the APK-only safe-area CSS
 * in index.css engages, while the plain website stays untouched.
 *
 * MUST run synchronously before first paint — call it at the very top of
 * main.tsx, not inside the async init below.
 */
export function markNativeApp(): void {
  if (!Capacitor.isNativePlatform()) return;
  const el = document.documentElement;
  el.classList.add('native-app');
  el.classList.add(Capacitor.getPlatform()); // 'android' | 'ios'
}

/**
 * Native shell setup (Capacitor APK only). No-op on the website.
 *
 * On targetSdk 36 the app is edge-to-edge regardless, so we do NOT use
 * `setOverlaysWebView` (no-op) — the visual fix is the safe-area CSS.
 * Here we only set status-bar icon contrast + colour and drop the splash.
 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    // Light style = dark icons, legible on the light ERP background.
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
  } catch {
    /* StatusBar unavailable on this build — non-fatal. */
  }

  // NOTE: splash is hidden separately by hideSplash(), called after the
  // app has actually painted — hiding here (module-load) would briefly
  // flash blank before React mounts.
}

let splashHidden = false;

/** Hide the native splash once — after first paint. Safe to call twice. */
export async function hideSplash(): Promise<void> {
  if (splashHidden || !Capacitor.isNativePlatform()) return;
  splashHidden = true;
  try {
    await SplashScreen.hide();
  } catch {
    /* no-op */
  }
}
