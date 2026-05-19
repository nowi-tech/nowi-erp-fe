import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Dialog } from '@capacitor/dialog';

/**
 * Launch-time update check for the Capacitor APK (no-op on the website).
 *
 * Distribution is a public GCS link, so there's no store to notify users.
 * Instead we host a tiny manifest next to the APK; on launch the app
 * compares its own versionCode and, if behind, prompts to install the
 * new APK. Android still shows its installer screen (one tap) — a fully
 * silent sideload update isn't possible without MDM.
 *
 * Everything here is best-effort: offline, a missing/!200 manifest, or
 * malformed JSON must never delay or block app start.
 */
const MANIFEST_URL = 'https://storage.googleapis.com/nowi-erp-apk/latest.json';
const APK_URL = 'https://storage.googleapis.com/nowi-erp-apk/nowi-erp.apk';

interface UpdateManifest {
  versionCode: number;
  versionName?: string;
  url?: string;
  notes?: string;
  /** Installed versionCode below this → forced (non-dismissable) update. */
  minSupported?: number;
}

export async function checkForUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const info = await App.getInfo();
    // On Android, App.getInfo().build is the integer versionCode.
    const current = Number.parseInt(info.build, 10);
    if (!Number.isFinite(current)) return;

    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return;
    const m = (await res.json()) as UpdateManifest;
    if (typeof m.versionCode !== 'number' || m.versionCode <= current) return;

    const forced =
      typeof m.minSupported === 'number' && current < m.minSupported;
    const apkUrl = m.url ?? APK_URL;
    const body =
      `A new version (${m.versionName ?? m.versionCode}) is available.` +
      (m.notes ? `\n\n${m.notes}` : '') +
      (forced ? '\n\nThis update is required to continue.' : '');

    if (forced) {
      // Block until they go install it. Re-prompt if they back out.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await Dialog.alert({ title: 'Update required', message: body, buttonTitle: 'Update now' });
        await Browser.open({ url: apkUrl });
        break;
      }
      return;
    }

    const { value } = await Dialog.confirm({
      title: 'Update available',
      message: body,
      okButtonTitle: 'Update now',
      cancelButtonTitle: 'Later',
    });
    if (value) await Browser.open({ url: apkUrl });
  } catch {
    // Never let the update check affect app startup.
  }
}
