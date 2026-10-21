import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AlterationEntry } from '@/api/alteration';

type Line = { altered: number; scrapped: number };

/** Per-size pieces altered and scrapped. `scrap` starts with every piece scrapped. */
export default function CompleteAlterationDialog({
  entry,
  mode,
  busy,
  onClose,
  onConfirm,
}: {
  entry: AlterationEntry | null;
  mode: 'complete' | 'scrap';
  busy: boolean;
  onClose: () => void;
  onConfirm: (items: { sku: string; qtyOut: number; qtyScrapped: number }[], reason?: string) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!entry) return;
    setLines(
      Object.fromEntries(
        entry.sizes.map((s) => [
          s.sku,
          mode === 'scrap' ? { altered: 0, scrapped: s.qtyIn } : { altered: s.qtyIn, scrapped: 0 },
        ]),
      ),
    );
    setReason('');
  }, [entry, mode]);

  // Each field is capped by what the other leaves of the pieces sent.
  const set = (sku: string, field: keyof Line, raw: string) =>
    setLines((prev) => {
      const sent = entry?.sizes.find((s) => s.sku === sku)?.qtyIn ?? 0;
      const cur = prev[sku] ?? { altered: 0, scrapped: 0 };
      const other = field === 'altered' ? cur.scrapped : cur.altered;
      const v = Math.min(sent - other, Math.max(0, Number.parseInt(raw, 10) || 0));
      return { ...prev, [sku]: { ...cur, [field]: v } };
    });

  const altered = Object.values(lines).reduce((a, l) => a + l.altered, 0);
  const needsReason = entry != null && altered < entry.qtyIn;
  const valid = !needsReason || reason.trim().length >= 3;
  const qtyInput = (sku: string, field: keyof Line, size: string) => (
    <Input
      type="number"
      min={0}
      inputMode="numeric"
      className="h-9 w-20 text-center text-sm font-semibold"
      value={lines[sku]?.[field] ? String(lines[sku][field]) : ''}
      placeholder="0"
      onChange={(e) => set(sku, field, e.target.value)}
      aria-label={`${field} ${size}`}
    />
  );

  return (
    <Dialog
      open={entry != null}
      onClose={onClose}
      maxWidthClassName="max-w-lg"
      title={
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          {mode === 'scrap'
            ? t('admin.alteration.scrapTitle', { defaultValue: 'Scrap {{no}}', no: entry?.entryNo ?? '' })
            : t('admin.alteration.completeTitle', { defaultValue: 'Complete {{no}}', no: entry?.entryNo ?? '' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            variant={mode === 'scrap' ? 'destructive' : 'default'}
            disabled={busy || !valid}
            onClick={() =>
              onConfirm(
                Object.entries(lines).map(([sku, l]) => ({ sku, qtyOut: l.altered, qtyScrapped: l.scrapped })),
                needsReason ? reason.trim() : undefined,
              )
            }
          >
            {mode === 'scrap'
              ? t('admin.alteration.scrap', { defaultValue: 'Scrap' })
              : t('admin.alteration.complete', { defaultValue: 'Complete' })}
          </Button>
        </>
      }
    >
      {entry && (
        <div className="space-y-4">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-[10.5px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                <th className="py-2 pr-6 text-left font-semibold">
                  {t('admin.production.size', { defaultValue: 'Size' })}
                </th>
                <th className="py-2 pr-6 text-right font-semibold">
                  {t('admin.alteration.sent', { defaultValue: 'Sent' })}
                </th>
                <th className="py-2 pr-4 text-left font-semibold">
                  {t('admin.alteration.altered', { defaultValue: 'Altered' })}
                </th>
                <th className="py-2 text-left font-semibold">
                  {t('admin.alteration.scrapped', { defaultValue: 'Scrapped' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.sizes.map((s) => (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-6 font-semibold">{s.size}</td>
                  <td className="py-2 pr-6 text-right">{s.qtyIn}</td>
                  <td className="py-2 pr-4">{qtyInput(s.sku, 'altered', s.size)}</td>
                  <td className="py-2">{qtyInput(s.sku, 'scrapped', s.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {needsReason && (
            <div>
              <Label required>{t('admin.alteration.closeReason', { defaultValue: 'Reason' })}</Label>
              <Input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('admin.alteration.closeReasonPlaceholder', {
                  defaultValue: 'Why were pieces scrapped or missing?',
                })}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
