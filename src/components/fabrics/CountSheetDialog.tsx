import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { stockCheck } from '@/api/fabricChallans';
import type { Fabric } from '@/api/types';
import { fmtQty, UOM_SHORT } from '@/lib/fabric';

const FLAGGED = 'flagged';

/**
 * Stock-take for many colours at once: pick a fabric (or every colour flagged
 * "check stock"), type what's on the shelf, save. Blank or unchanged rows are
 * left alone; each changed one is written as its own stock update.
 */
export default function CountSheetDialog({
  open,
  fabrics,
  onClose,
  onSaved,
}: {
  open: boolean;
  fabrics: Fabric[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [scope, setScope] = useState<string>('');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const flaggedCount = fabrics.flatMap((f) => f.colours ?? []).filter((c) => (c.needsReview ?? 0) > 0).length;
  useEffect(() => {
    if (!open) return;
    setScope(flaggedCount > 0 ? FLAGGED : '');
    setCounts({});
    setReason('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rows = useMemo(
    () =>
      fabrics.flatMap((f) =>
        (f.colours ?? [])
          .filter((c) => (scope === FLAGGED ? (c.needsReview ?? 0) > 0 : String(f.id) === scope))
          .map((c) => ({ fabric: f, colour: c })),
      ),
    [fabrics, scope],
  );
  const changed = rows.filter(({ colour: c }) => {
    const v = counts[c.id];
    if (v == null || v === '' || !(Number(v) >= 0)) return false;
    // A matching count still clears a "check stock" flag.
    return Number(v) !== (c.availableQuantity ?? 0) || (c.needsReview ?? 0) > 0;
  });
  const ready = changed.length > 0 && reason.trim() !== '' && !saving;

  const save = async () => {
    if (!ready) return;
    setSaving(true);
    let done = 0;
    try {
      for (const { colour: c } of changed) {
        await stockCheck({ fabricColourId: c.id, actualQuantity: Number(counts[c.id]), reason: reason.trim() });
        done += 1;
      }
      toast.show(t('admin.countSheet.saved', { defaultValue: '{{n}} colours updated.', n: done }));
      onSaved();
    } catch (e) {
      // Earlier rows are saved; say how far it got so nobody re-enters them blind.
      toast.show(
        `${apiErrorMessage(e) ?? t('common.saveError', 'Could not save.')} ${t('admin.countSheet.partial', {
          defaultValue: '{{n}} of {{total}} saved.',
          n: done,
          total: changed.length,
        })}`,
        'error',
      );
      if (done > 0) onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidthClassName="max-w-2xl"
      title={t('admin.countSheet.title', { defaultValue: 'Update stock' })}
      footer={
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button size="sm" disabled={!ready} onClick={() => void save()}>
            {saving
              ? t('common.saving', 'Saving…')
              : t('admin.countSheet.save', { defaultValue: 'Update {{n}}', n: changed.length || '' })}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('admin.countSheet.what', { defaultValue: 'Count' })}</Label>
          <Select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="" disabled>
              {t('admin.countSheet.pick', { defaultValue: 'Choose a fabric…' })}
            </option>
            {flaggedCount > 0 && (
              <option value={FLAGGED}>
                {t('admin.countSheet.flagged', { defaultValue: 'Check stock ({{n}} colours)', n: flaggedCount })}
              </option>
            )}
            {fabrics
              .filter((f) => (f.colours ?? []).length > 0)
              .map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.name}
                  {f.code ? ` · ${f.code}` : ''}
                </option>
              ))}
          </Select>
        </div>

        {rows.length > 0 && (
          <div className="max-h-[45vh] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-border)]">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-[var(--color-surface-2)] text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 text-left">{t('admin.fabricLibrary.cols.colour', { defaultValue: 'Colour' })}</th>
                  <th className="px-3 py-2 text-right">{t('admin.countSheet.system', { defaultValue: 'System' })}</th>
                  <th className="px-3 py-2 text-right">{t('admin.stockCheck.counted', { defaultValue: 'Counted' })}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ fabric: f, colour: c }) => (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.name}</div>
                      {scope === FLAGGED && <div className="text-xs text-[var(--color-muted-foreground)]">{f.name}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[var(--color-muted-foreground)]">
                      {fmtQty(c.availableQuantity ?? 0, f.unitOfMeasure)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Input
                          className="h-9 w-24 text-right"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={counts[c.id] ?? ''}
                          onChange={(e) => setCounts((m) => ({ ...m, [c.id]: e.target.value }))}
                        />
                        <span className="w-6 text-left text-xs text-[var(--color-muted-foreground)]">
                          {f.unitOfMeasure ? UOM_SHORT[f.unitOfMeasure] : ''}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>{t('admin.stockCheck.reason', { defaultValue: 'Reason' })} *</Label>
          <Input
            value={reason}
            placeholder={t('admin.countSheet.reasonPh', { defaultValue: 'Monthly stock-take' })}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
