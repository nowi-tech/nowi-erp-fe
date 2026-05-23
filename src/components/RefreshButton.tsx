import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

  function onClick(): void {
    if (
      isEditing() &&
      !window.confirm(
        t('common.refreshConfirm', {
          defaultValue: 'Refresh now? Unsaved changes will be lost.',
        }),
      )
    ) {
      return;
    }
    window.location.reload();
  }

  return (
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
  );
}
