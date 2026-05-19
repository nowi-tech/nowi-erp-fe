import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The APK is a thin native shell: it loads the live website from
 * `server.url`, so day-to-day FE changes ship via Vercel with NO new
 * APK. Rebuild/redistribute the APK only when native bits change
 * (plugins, permissions, the notification channel, app id/icon, or this
 * URL itself).
 *
 * To test the APK against a local backend, temporarily point
 * `server.url` at your machine's LAN IP (e.g. http://192.168.1.x:5173)
 * and set `cleartext: true`. Never commit that.
 */
const config: CapacitorConfig = {
  appId: 'fashion.nowi.erp',
  appName: 'NOWI ERP',
  webDir: 'dist',
  server: {
    url: 'https://erp.nowi.fashion',
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      // White splash with the centered NOWI logo (res/drawable*/splash.png).
      // Auto-hides; initNativeShell() also hides it once the web app loads.
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
    },
    StatusBar: {
      // Edge-to-edge (Android 15). Light = dark icons on the light app
      // background; the safe-area CSS in index.css handles the inset.
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#ffffff',
    },
    Keyboard: {
      // Resize the WebView body when the soft keyboard opens so input
      // fields aren't hidden behind it — critical for data entry.
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
};

export default config;
