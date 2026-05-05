import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, variant: ToastVariant = 'success') => {
    idRef.current += 1;
    const id = idRef.current;
    setItems((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              'pointer-events-auto rounded-[var(--radius-md)] border px-4 py-2 text-sm shadow-md',
              t.variant === 'success' &&
                'bg-[var(--color-success)] text-white border-transparent',
              t.variant === 'error' &&
                'bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] border-transparent',
              t.variant === 'info' &&
                'bg-[var(--color-background)] text-[var(--color-foreground)] border-[var(--color-border)]',
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback for components rendered outside the provider — still type-safe.
    return {
      show: (msg) => {
        if (typeof console !== 'undefined') console.warn('[toast]', msg);
      },
    };
  }
  return ctx;
}

// Re-export a hook-style helper that auto-clears, for one-off uses.
export function useAutoDismiss(_ms = 3000): void {
  // intentionally a no-op placeholder; toasts auto-dismiss internally.
  useEffect(() => undefined, []);
}
