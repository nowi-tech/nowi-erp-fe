import { Capacitor } from '@capacitor/core';
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
  type Token,
} from '@capacitor/push-notifications';
import { registerDevice, unregisterDevice } from '@/api/devices';

/**
 * Native push (Capacitor APK only). On the plain website every export
 * here is a no-op — `Capacitor.isNativePlatform()` is false in a normal
 * browser and the plugin bridge doesn't exist there.
 *
 * The high-importance channel id MUST match `FcmService.CHANNEL_ID`
 * ('erp_alerts') on the backend, otherwise Android drops the channel
 * override and notifications won't be heads-up / sound under Doze.
 */
const CHANNEL_ID = 'erp_alerts';

/** The FCM token currently registered with the BE, so logout can drop it. */
let activeToken: string | null = null;
let listenersBound = false;

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Route a notification tap to the relevant screen. Edit this map as
 *  deep-link targets evolve — keep it conservative so a bad payload
 *  just lands the user on home rather than a broken route. */
function handleDeepLink(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const type = String(data.type ?? '');
  let path = '/';
  if (type === 'dispatch' && data.dispatchId) {
    path = `/admin/dispatches/${String(data.dispatchId)}`;
  } else if (type === 'order_status') {
    // Finishing masters land on home, which routes them to their
    // pending-finishing queue by role.
    path = '/';
  }
  if (window.location.pathname !== path) {
    window.location.assign(path);
  }
}

/**
 * Call after a successful login. Requests notification permission,
 * ensures the high-importance channel exists, registers with FCM, and
 * ships the resulting token to the BE.
 */
export async function registerPush(): Promise<void> {
  if (!isNative()) return;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') {
    // User declined the Android 13+ POST_NOTIFICATIONS prompt. Nothing
    // more to do; they can re-enable in system settings.
    return;
  }

  // High-importance channel so alerts are heads-up + sound even in Doze.
  await PushNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'ERP Alerts',
    description: 'Stage and dispatch alerts',
    importance: 5, // IMPORTANCE_HIGH
    visibility: 1, // VISIBILITY_PUBLIC
    sound: 'default',
    vibration: true,
  });

  if (!listenersBound) {
    listenersBound = true;

    await PushNotifications.addListener('registration', (token: Token) => {
      activeToken = token.value;
      void registerDevice(token.value, 'android').catch(() => {
        // Non-fatal: a missed registration just means no pushes until
        // the next login re-attempts.
      });
    });

    await PushNotifications.addListener('registrationError', () => {
      // Swallow — surfaced server-side as "user has no device tokens".
    });

    // App in foreground: Android won't show a tray notification by
    // default. Left intentionally minimal — wire an in-app toast here
    // later if product wants one.
    await PushNotifications.addListener(
      'pushNotificationReceived',
      (_n: PushNotificationSchema) => {},
    );

    // User tapped the tray notification (app was backgrounded/killed).
    await PushNotifications.addListener(
      'pushNotificationActionPerformed',
      (action: ActionPerformed) => {
        handleDeepLink(action.notification.data);
      },
    );
  }

  await PushNotifications.register();
}

/**
 * Call on logout. Drops the token server-side so a logged-out device
 * stops receiving this user's alerts, and clears delivered notifications.
 */
export async function unregisterPush(): Promise<void> {
  if (!isNative()) return;
  if (activeToken) {
    await unregisterDevice(activeToken).catch(() => undefined);
    activeToken = null;
  }
  await PushNotifications.removeAllDeliveredNotifications().catch(
    () => undefined,
  );
}
