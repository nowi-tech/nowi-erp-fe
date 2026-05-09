import { apiClient } from './apiClient';
import { FeatureUnavailableError, is404 } from './_errors';
import type { LocatorParams } from './types';

export async function downloadLocatorXlsx(params: LocatorParams = {}): Promise<void> {
  try {
    const res = await apiClient.get<Blob>('/api/exports/locator.xlsx', {
      params,
      responseType: 'blob',
    });
    const blob = res.data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `locator-${ts}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    if (is404(err)) throw new FeatureUnavailableError();
    throw err;
  }
}
