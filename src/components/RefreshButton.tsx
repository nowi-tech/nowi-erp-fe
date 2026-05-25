import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

/** True while the user is in a field — so a stray refresh tap can't
 *  silently discard a half-entered form without asking. */
function isEditing(): boolean {
  const a = document.activeElement as HTMLElement | null;
  if (!a) return false;
  return (
    a.tagName === 'INPUT' ||
    a.tagName === 'TEXTAREA' ||
    a.tagName === 'SELECT' ||
    a.isContentEditable
  );
}

/**
 * App-wide refresh. NOWI has no client cache, so "refresh" = reload the
 * SPA (re-fetches every screen). Lives in the shell header next to the
 * language/logout controls; works identically on web and the APK.
 *
 * Uses the in-app ConfirmDialog instead of `window.confirm` so the
 * "discard edits?" prompt is styleable and doesn't freeze the JS thread
 * (matters on the Capacitor Android WebView).
 */
export function RefreshButton({
  size = 18,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t('common.refresh', { defaultValue: 'Refresh' });
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onClick(): void {
    if (isEditing()) {
      setConfirmOpen(true);
      return;
    }
    window.location.reload();
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={
          className ??
          'rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
        }
      >
        <RefreshCw size={size} />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title={t('common.refresh', { defaultValue: 'Refresh' })}
        message={t('common.refreshConfirm', {
          defaultValue: 'Refresh now? Unsaved changes will be lost.',
        })}
        confirmLabel={t('common.refresh', { defaultValue: 'Refresh' })}
        cancelLabel={t('common.cancel', { defaultValue: 'Cancel' })}
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          window.location.reload();
        }}
      />
    </>
  );
}
