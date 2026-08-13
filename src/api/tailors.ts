import { apiClient } from './apiClient';

/** Floor tailor a lot is handed to. `shortCode` is what lands in the lot
 *  number (`1001-RAJ`), so it is unique and never changes once issued. */
export interface Tailor {
  id: number;
  name: string;
  shortCode: string;
}

export function getTailors(): Promise<Tailor[]> {
  return apiClient.get<Tailor[]>('/api/tailors').then((r) => r.data);
}

/** Omit `shortCode` and the server derives one from the name (Rajesh → RAJ). */
export function createTailor(name: string, shortCode?: string): Promise<Tailor> {
  return apiClient
    .post<Tailor>('/api/tailors', { name, ...(shortCode ? { shortCode } : {}) })
    .then((r) => r.data);
}
