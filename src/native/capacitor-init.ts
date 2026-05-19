import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Native shell setup (Capacitor APK only). No-op on the plain website.
 *
 * Fixes the status-bar overlap: `overlay: false` makes the WebView start
 * BELOW the Android status bar instead of drawing under it, so the app's
 * top bar is never covered. Status bar is painted with the brand slate
 * so it blends with the app chrome.
 */
export async function initNativeShell(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: '#0f172a' });
    await StatusBar.setStyle({ style: Style.Dark }); // light icons on dark bar
  } catch {
    // StatusBar unavailable (e.g. older webview) — non-fatal.
  }

  try {
    // Web app is up by the time this runs; drop the splash.
    await SplashScreen.hide();
  } catch {
    /* no-op */
  }
}
