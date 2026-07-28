import { apiClient } from './apiClient';

/** Brand master — Nowi manufactures for other labels too. Managed inline from
 *  the Start Production dialog (mirrors the colours picker). */
export interface Brand {
  id: number;
  name: string;
  code: string | null;
  isActive: boolean;
}

export function getBrands(): Promise<Brand[]> {
  return apiClient.get<Brand[]>('/api/brands').then((r) => r.data);
}

export function createBrand(name: string, code?: string): Promise<Brand> {
  return apiClient.post<Brand>('/api/brands', { name, code }).then((r) => r.data);
}
