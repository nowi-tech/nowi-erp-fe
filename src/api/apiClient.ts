import axios, { type AxiosInstance } from 'axios';

// VITE_API_URL is inlined by Vite at BUILD time (not read at runtime).
// On Vercel it must be set in the Production env scope *before* the build
// that gets promoted. A production bundle must never silently fall back to
// localhost — that just turns a deploy misconfig into a confusing
// "prod is calling :3001". Fail loudly so it's caught in a Preview deploy.
const RAW = import.meta.env.VITE_API_URL?.trim();
const API_URL = RAW
  ? RAW.replace(/\/+$/, '')
  : import.meta.env.DEV
    ? 'http://localhost:3001'
    : (() => {
        const msg =
          'VITE_API_URL is missing in this production build. Set it in ' +
          'Vercel (Production scope, exact name VITE_API_URL) and trigger ' +
          'a fresh build — promoting an old deployment keeps the stale value.';
        // eslint-disable-next-line no-console
        console.error(msg);
        throw new Error(msg);
      })();

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Admin "training mode" toggle — when enabled, BE reveals test rows.
  if (localStorage.getItem('nowi.showTestData') === '1') {
    config.headers['x-show-test-data'] = '1';
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
