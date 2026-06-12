import { apiClient } from './apiClient';
import type { User, VerifyOtpResponse } from './types';

export async function requestOtp(mobileNumber: string): Promise<void> {
  await apiClient.post('/api/auth/request-otp', { mobileNumber });
}

export async function verifyOtp(
  mobileNumber: string,
  otp: string,
): Promise<VerifyOtpResponse> {
  const res = await apiClient.post<VerifyOtpResponse>('/api/auth/verify-otp', {
    mobileNumber,
    otp,
  });
  return res.data;
}

export async function me(): Promise<User> {
  const res = await apiClient.get<User>('/api/auth/me');
  return res.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } catch {
    // logout is best-effort; we always clear local state
  }
}

/**
 * Mint a one-time SSO code for the cross-app handoff to SkuCast. The ERP
 * is the identity provider: the logged-in SPA mints a code and redirects
 * the browser to SkuCast, whose backend redeems it server-to-server. The
 * code is single-use and expires in ~60s — the ERP session token itself
 * never leaves the ERP origin.
 */
export async function mintSkucastSsoCode(): Promise<{
  code: string;
  expiresInSeconds: number;
}> {
  const res = await apiClient.post<{ code: string; expiresInSeconds: number }>(
    '/api/auth/sso/skucast',
  );
  return res.data;
}

/**
 * Request a fresh step-up OTP via WhatsApp. Required before high-risk
 * admin actions (`@RequireStepup()` on the BE — user delete, role
 * change, settings update, force-resolve stuck, etc.). The caller must
 * then consume the OTP via `consumeStepupOtp` within 60s of consumption
 * before the gated action is permitted.
 */
export async function requestStepupOtp(): Promise<void> {
  await apiClient.post('/api/auth/stepup-otp/request');
}

/**
 * Consume the step-up OTP. On success the BE marks this session as
 * step-up-allowed for ~60s. Returns `{ ok: true }` on success; throws
 * 401/400 on bad OTP.
 */
export async function consumeStepupOtp(otp: string): Promise<{ ok: boolean }> {
  const res = await apiClient.post<{ ok: boolean }>(
    '/api/auth/stepup-otp/consume',
    { otp },
  );
  return res.data;
}
