import { apiClient } from './apiClient';
import type { Vendor } from './types';

export async function listVendors(): Promise<Vendor[]> {
  const res = await apiClient.get<Vendor[] | { data: Vendor[] }>('/api/vendors');
  // Tolerate both list-shape and { data: [] } envelope.
  return Array.isArray(res.data) ? res.data : res.data.data;
}

/** Active vendors, names only — what the fabric desk's pickers can read. */
export interface VendorOption {
  id: number;
  name: string;
  code: string;
  isSupplier: boolean;
  isFactory: boolean;
  isBrand: boolean;
  isRecipient: boolean;
}

export async function listVendorOptions(): Promise<VendorOption[]> {
  const res = await apiClient.get<VendorOption[]>('/api/vendors/options');
  return res.data;
}

/** Vendors with the factory role — the "Made by" picker. */
export async function getFactories(): Promise<{ id: number; name: string }[]> {
  const res = await apiClient.get<{ id: number; name: string }[]>('/api/factories');
  return res.data;
}

/** "+ Add" in a factory picker; an existing party of that name gains the factory role. */
export async function createFactory(name: string): Promise<{ id: number; name: string }> {
  const res = await apiClient.post<{ id: number; name: string }>('/api/factories', { name });
  return res.data;
}

/** Quick-add from a picker — the server mints the code, or gives an existing party of that name the supplier role. */
export async function createVendor(name: string): Promise<Vendor> {
  const res = await apiClient.post<Vendor>('/api/vendors', { name });
  return res.data;
}
