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
  const res = await apiClient.get<{ user: User }>('/api/auth/me');
  return res.data.user;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout');
  } catch {
    // logout is best-effort; we always clear local state
  }
}
