import { apiClient } from './apiClient';
import type { User, UserRole } from './types';

export interface ListUsersParams {
  search?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}

export async function listUsers(params: ListUsersParams = {}): Promise<User[]> {
  const res = await apiClient.get<User[]>('/api/users', { params });
  return res.data;
}

export async function getUser(userId: string | number): Promise<User> {
  const res = await apiClient.get<User>(`/api/users/${userId}`);
  return res.data;
}

export interface CreateUserInput {
  name: string;
  mobileNumber: string;
  role: UserRole;
  isTrainingMode?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const res = await apiClient.post<User>('/api/users', input);
  return res.data;
}

export async function updateUser(
  userId: string | number,
  patch: Partial<Pick<User, 'name' | 'role' | 'isTrainingMode' | 'isActive'>>,
): Promise<User> {
  const res = await apiClient.patch<User>(`/api/users/${userId}`, patch);
  return res.data;
}

export async function deleteUser(userId: string | number): Promise<void> {
  await apiClient.delete(`/api/users/${userId}`);
}

export async function markOnboarded(): Promise<User> {
  const res = await apiClient.post<User>('/api/auth/me/onboarded');
  return res.data;
}

/** @deprecated kept so older callers compile; prefer markOnboarded() */
export async function updateOnboardedAt(_userId: string | number): Promise<User> {
  return markOnboarded();
}

/**
 * Workload-sorted list of active stitching masters for the floor-manager
 * assign picker. Sorted ascending by inProgressLots (least-loaded first),
 * tiebreak by name. BE: GET /api/users/stitching-masters.
 */
export interface StitchingMaster {
  id: number;
  name: string;
  mobileNumber: string;
  inProgressLots: number;
}

export async function listStitchingMasters(): Promise<StitchingMaster[]> {
  const res = await apiClient.get<StitchingMaster[]>('/api/users/stitching-masters');
  return res.data;
}
