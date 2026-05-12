import { useMemo, type ReactNode } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';

/**
 * Adapter over `sonner`. Keeps the original `useToast().show(message, variant)`
 * call signature so existing call sites don't have to change. Use sonner
 * directly (`import { toast } from 'sonner'`) for richer features —
 * descriptions, actions, custom JSX.
 *
 * Positioned top-center via `<Toaster />` rendered in App.tsx.
 */

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

/** ToastProvider is now a no-op wrapper around children — the actual
 * <Toaster /> is mounted at the App root. Kept so existing
 * `<ToastProvider>` JSX wrapping still type-checks. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useToast(): ToastContextValue {
  return useMemo(
    () => ({
      show: (message, variant = 'success') => {
        if (variant === 'success') sonnerToast.success(message);
        else if (variant === 'error') sonnerToast.error(message);
        else sonnerToast(message);
      },
    }),
    [],
  );
}

/** Brand-styled `<Toaster />` to mount once at the app root. */
export function AppToaster(): ReactNode {
  return (
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={3500}
      toastOptions={{
        style: {
          fontFamily: 'var(--font-sans)',
          borderRadius: 'var(--radius-md)',
        },
      }}
    />
  );
}

// Kept for back-compat with older imports.
export function useAutoDismiss(_ms = 3000): void {
  // sonner manages dismiss internally; this hook is a no-op now.
}
