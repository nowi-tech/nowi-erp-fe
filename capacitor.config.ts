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
};

export default config;
