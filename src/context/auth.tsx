import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { me as fetchMe, logout as apiLogout } from '@/api/auth';
import { registerPush, unregisterPush } from '@/services/push-notifications';
import type { User } from '@/api/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(() => !!localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        // Returning user with a live session (e.g. reopened the APK):
        // re-register the device so token rotation is picked up.
        void registerPush();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Opaque sessions never expire — only a real 401 means the
        // session was revoked. A network error (flaky factory Wi-Fi,
        // server blip) must NOT log the worker out: keep the cached
        // user from localStorage and let requests retry. A genuine 401
        // is already hard-redirected by the apiClient interceptor.
        const status =
          typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 401) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
          setUser(null);
        }
        // else: transient — stay signed in with the cached session.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((token: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    // Fire-and-forget: ask for notification permission + register the
    // device. No-op on the plain website (non-native).
    void registerPush();
  }, []);

  const logout = useCallback(async () => {
    // Always clear local session, even if the server-side calls fail
    // (network down / session already gone). Otherwise a rejected
    // apiLogout() would leave the user "logged in" client-side with no
    // feedback. Drop the device token while the session is still valid —
    // doing it after apiLogout() would 401 and trip the axios redirect.
    try {
      await unregisterPush();
      await apiLogout();
    } catch {
      // best-effort server revoke; local logout below is what matters
    } finally {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch } as User;
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
