import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import TailorPicker from '@/components/production/TailorPicker';
import type { AlterationEntry, QcLine } from '@/api/alteration';

type Line = { alteration: number; scrapped: number };

/** Received → QC'd: per size, alteration and scrap are typed; the rest is good. */
export default function QcAlterationDialog({
  entry,
  busy,
  onClose,
  onConfirm,
}: {
  entry: AlterationEntry | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: (body: { items: QcLine[]; tailorId?: number; reason?: string }) => void;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [tailorId, setTailorId] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!entry) return;
    setLines(Object.fromEntries(entry.sizes.map((s) => [s.sku, { alteration: 0, scrapped: 0 }])));
    setTailorId(null);
    setReason('');
  }, [entry]);

  // Each field is capped by what the other leaves of the pieces received.
  const set = (sku: string, field: keyof Line, raw: string) =>
    setLines((prev) => {
      const received = entry?.sizes.find((s) => s.sku === sku)?.qtyIn ?? 0;
      const cur = prev[sku] ?? { alteration: 0, scrapped: 0 };
      const other = field === 'alteration' ? cur.scrapped : cur.alteration;
      const v = Math.min(received - other, Math.max(0, Number.parseInt(raw, 10) || 0));
      return { ...prev, [sku]: { ...cur, [field]: v } };
    });

  const items: QcLine[] = (entry?.sizes ?? []).map((s) => {
    const l = lines[s.sku] ?? { alteration: 0, scrapped: 0 };
    return { sku: s.sku, qtyGood: s.qtyIn - l.alteration - l.scrapped, qtyAlteration: l.alteration, qtyScrapped: l.scrapped };
  });
  const toAlter = items.some((i) => i.qtyAlteration > 0);
  const scrapped = items.some((i) => i.qtyScrapped > 0);
  const valid = (!toAlter || tailorId != null) && (!scrapped || reason.trim().length >= 3);

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
        <div className="text-base font-semibold">
          {t('admin.alteration.qcTitle', { defaultValue: 'QC {{no}}', no: entry?.entryNo ?? '' })}
        </div>
      }
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy || !valid}
            onClick={() =>
              onConfirm({
                items,
                tailorId: toAlter ? tailorId ?? undefined : undefined,
                reason: scrapped ? reason.trim() : undefined,
              })
            }
          >
            {t('admin.alteration.qcSave', { defaultValue: 'Save QC' })}
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
                  {t('admin.alteration.in', { defaultValue: 'In' })}
                </th>
                <th className="py-2 pr-4 text-left font-semibold">
                  {t('admin.alteration.toAlteration', { defaultValue: 'Alteration' })}
                </th>
                <th className="py-2 pr-6 text-left font-semibold">
                  {t('admin.alteration.scrapped', { defaultValue: 'Scrapped' })}
                </th>
                <th className="py-2 text-right font-semibold">
                  {t('admin.alteration.good', { defaultValue: 'Good' })}
                </th>
              </tr>
            </thead>
            <tbody>
              {entry.sizes.map((s, i) => (
                <tr key={s.sku} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2 pr-6 font-semibold">{s.size}</td>
                  <td className="py-2 pr-6 text-right">{s.qtyIn}</td>
                  <td className="py-2 pr-4">{qtyInput(s.sku, 'alteration', s.size)}</td>
                  <td className="py-2 pr-6">{qtyInput(s.sku, 'scrapped', s.size)}</td>
                  <td className="py-2 text-right font-semibold">{items[i]?.qtyGood ?? s.qtyIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {toAlter && (
            <div>
              <Label required>{t('admin.alteration.tailor', { defaultValue: 'Tailor' })}</Label>
              <TailorPicker
                value={tailorId}
                onChange={setTailorId}
                placeholder={t('admin.alteration.pickTailor', { defaultValue: 'Who is fixing these pieces?' })}
              />
            </div>
          )}
          {scrapped && (
            <div>
              <Label required>{t('admin.alteration.closeReason', { defaultValue: 'Reason' })}</Label>
              <Input
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('admin.alteration.scrapReasonPlaceholder', { defaultValue: 'Why were pieces scrapped?' })}
              />
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
