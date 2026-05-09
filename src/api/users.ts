import { apiClient } from './apiClient';
import type { User } from './types';

export async function getUser(userId: string): Promise<User> {
  const res = await apiClient.get<User>(`/api/users/${userId}`);
  return res.data;
}

export async function updateUser(
  userId: string,
  patch: Partial<Pick<User, 'name' | 'isTrainingMode' | 'onboardedAt'>>,
): Promise<User> {
  const res = await apiClient.patch<User>(`/api/users/${userId}`, patch);
  return res.data;
}

export async function updateOnboardedAt(userId: string): Promise<User> {
  return updateUser(userId, { onboardedAt: new Date().toISOString() });
}
