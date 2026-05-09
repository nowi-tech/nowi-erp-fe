import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/auth';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const FIRST_RECEIPT_KEY = 'nowi.firstReceiptDoneAt';
const DISMISSED_KEY = 'nowi.pwaInstallDismissedAt';
const FLOOR_ROLES = new Set(['stitching_master', 'finishing_master']);

export default function PwaInstallPrompt() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (!deferred) {
      setVisible(false);
      return;
    }
    if (!user || !FLOOR_ROLES.has(user.role)) {
      setVisible(false);
      return;
    }
    const firstReceipt = localStorage.getItem(FIRST_RECEIPT_KEY);
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    setVisible(!!firstReceipt && !dismissed);
  }, [deferred, user]);

  // Re-check gating periodically — receipts can land while the user is in app.
  useEffect(() => {
    if (!deferred || !user || !FLOOR_ROLES.has(user.role)) return;
    const onStorage = () => {
      const firstReceipt = localStorage.getItem(FIRST_RECEIPT_KEY);
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      setVisible(!!firstReceipt && !dismissed);
    };
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(onStorage, 5000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [deferred, user]);

  if (!visible || !deferred) return null;

  async function handleInstall() {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // ignore
    } finally {
      setDeferred(null);
      setVisible(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={t('pwa.installTitle')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-border)] bg-[var(--color-background)] shadow-lg"
    >
      <div className="mx-auto max-w-md p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold">{t('pwa.installTitle')}</h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            {t('pwa.installBody')}
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleDismiss}>
            {t('pwa.dismissButton')}
          </Button>
          <Button onClick={() => void handleInstall()}>{t('pwa.installButton')}</Button>
        </div>
      </div>
    </div>
  );
}
