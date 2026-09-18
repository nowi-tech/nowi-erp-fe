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
        // Generic message — don't leak deploy/config internals to users.
         
        console.error('API endpoint is not configured.');
        throw new Error('Application is not configured correctly.');
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

/** The server's own explanation of a refusal, when it sent one. */
export function apiErrorMessage(e: unknown): string | null {
  const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message;
  return (Array.isArray(raw) ? raw.join(', ') : raw) || null;
}

/** HTTP status of a failed request, if it got a response. */
export function apiErrorStatus(e: unknown): number | undefined {
  return (e as { response?: { status?: number } })?.response?.status;
}

export default apiClient;
