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

  try {
    await SplashScreen.hide();
  } catch {
    /* no-op */
  }
}
