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

/** App.getInfo() can reject if the bundle (loaded from the remote
 *  server.url) runs before the Capacitor bridge finishes injecting, or
 *  is missing entirely on pre-v1.2 APKs. Retry a few times, then give up
 *  loudly rather than silently. */
async function getInfoWithRetry(
  tries = 6,
  delayMs = 600,
): Promise<{ build: string } | null> {
  for (let i = 0; i < tries; i++) {
    try {
      return await App.getInfo();
    } catch (err) {
      if (i === tries - 1) {
        console.error('[update-check] App.getInfo() failed after retries:', err);
        return null;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return null;
}

export async function checkForUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.info('[update-check] not native — skipped');
    return;
  }

  try {
    const info = await getInfoWithRetry();
    if (!info) return; // already logged
    // On Android, App.getInfo().build is the integer versionCode.
    const current = Number.parseInt(info.build, 10);
    console.info('[update-check] installed versionCode =', info.build);
    if (!Number.isFinite(current)) {
      console.warn('[update-check] non-numeric build', info);
      return;
    }

    const res = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      console.warn('[update-check] manifest HTTP', res.status);
      return;
    }
    const m = (await res.json()) as UpdateManifest;
    console.info(
      '[update-check] manifest versionCode =',
      m.versionCode,
      'installed =',
      current,
    );
    if (typeof m.versionCode !== 'number' || m.versionCode <= current) {
      console.info('[update-check] up to date — no prompt');
      return;
    }

    const forced =
      typeof m.minSupported === 'number' && current < m.minSupported;
    const apkUrl = m.url ?? APK_URL;
    const body =
      `A new version (${m.versionName ?? m.versionCode}) is available.` +
      (m.notes ? `\n\n${m.notes}` : '') +
      (forced ? '\n\nThis update is required to continue.' : '');

    if (forced) {
      // Single non-dismissable prompt → straight to the install page.
      await Dialog.alert({
        title: 'Update required',
        message: body,
        buttonTitle: 'Update now',
      });
      await Browser.open({ url: apkUrl });
      return;
    }

    const { value } = await Dialog.confirm({
      title: 'Update available',
      message: body,
      okButtonTitle: 'Update now',
      cancelButtonTitle: 'Later',
    });
    if (value) await Browser.open({ url: apkUrl });
  } catch (err) {
    console.error('[update-check] failed:', err);
    // Never let the update check affect app startup.
  }
}
