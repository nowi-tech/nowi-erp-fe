import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import TailorPicker from '@/components/production/TailorPicker';
import type { AlterationEntry } from '@/api/alteration';

/** Received → In alteration: names the tailor the pieces go to. */
export default function SendAlterationDialog({
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  entry: AlterationEntry | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (tailorId: number) => void;
}) {
  const { t } = useTranslation();
  const [tailorId, setTailorId] = useState<number | null>(null);

  useEffect(() => {
    if (entry) setTailorId(null);
  }, [entry]);

  return (
    <Dialog
      open={entry != null}
      onClose={onClose}
      maxWidthClassName="max-w-md"
      title={
        <div className="text-base font-semibold">
          {t('admin.alteration.sendTitle', {
            defaultValue: 'Send {{no}} to alteration?',
            no: entry?.entryNo ?? '',
          })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy || tailorId == null}
            onClick={() => tailorId != null && onConfirm(tailorId)}
          >
            {t('admin.alteration.send', { defaultValue: 'Send' })}
          </Button>
        </>
      }
    >
      {entry && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--color-muted-foreground)]">
            {t('admin.alteration.confirmMessage', {
              defaultValue: '{{style}} · {{n}} pieces',
              style: entry.styleRef ?? '',
              n: entry.qtyIn,
            })}
          </div>
          <div>
            <Label required>{t('admin.alteration.tailor', { defaultValue: 'Tailor' })}</Label>
            <TailorPicker
              value={tailorId}
              onChange={setTailorId}
              placeholder={t('admin.alteration.pickTailor', { defaultValue: 'Who is fixing these pieces?' })}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
