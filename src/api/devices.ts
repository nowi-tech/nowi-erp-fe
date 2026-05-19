import { apiClient } from './apiClient';

/** Register this device's FCM token against the logged-in user. */
export async function registerDevice(
  token: string,
  platform: 'android' | 'ios' | 'web' = 'android',
): Promise<void> {
  await apiClient.post('/api/devices', { token, platform });
}

/** Remove a device token (called on logout). Best-effort. */
export async function unregisterDevice(token: string): Promise<void> {
  await apiClient.delete('/api/devices', { data: { token } });
}
