import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { apiErrorMessage } from '@/api/apiClient';
import { uploadReturnsCsv, uploadSalesCsv } from '@/api/salesKpis';
import { dayLabel } from '@/lib/date';

/** Picks a Myntra Seller Orders or Seller Returns CSV and uploads it; admin-only on the server. */
export function MyntraUploadButton({ kind, onDone }: { kind: 'orders' | 'returns'; onDone: () => void }): ReactNode {
  const { t } = useTranslation();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadOrders = async (csv: string): Promise<void> => {
    const res = await uploadSalesCsv(csv);
    toast.show(
      t('admin.salesKpis.uploaded', {
        defaultValue: '{{count, number}} order lines imported, {{from}} to {{to}}.',
        count: res.linesImported,
        from: dayLabel(res.fromDay),
        to: dayLabel(res.toDay),
      }),
      'success',
    );
    if (res.linesKeptNewer > 0) {
      toast.show(
        t('admin.salesKpis.uploadKeptNewer', {
          defaultValue:
            '{{count, number}} lines already had a newer status from an earlier report and were left as they were.',
          count: res.linesKeptNewer,
        }),
        'info',
      );
    }
    if (res.rowsSkipped > 0) {
      toast.show(
        t('admin.salesKpis.uploadSkipped', {
          defaultValue: '{{count, number}} rows were skipped — no order line id or order date.',
          count: res.rowsSkipped,
        }),
        'info',
      );
    }
    if (res.unmappedLines > 0) {
      toast.show(
        t('admin.salesKpis.uploadUnmapped', {
          defaultValue:
            "{{count, number}} lines aren't mapped to Real or Virtual (warehouse {{codes}}) — they only count under All.",
          count: res.unmappedLines,
          codes: res.unmappedWarehouses.join(', '),
        }),
        'info',
      );
    }
  };

  const uploadReturns = async (csv: string): Promise<void> => {
    const res = await uploadReturnsCsv(csv);
    toast.show(
      t('admin.salesKpis.returnsUploaded', {
        defaultValue: '{{count, number}} returns imported, {{from}} to {{to}}.',
        count: res.returnsImported,
        from: dayLabel(res.fromDay),
        to: dayLabel(res.toDay),
      }),
      'success',
    );
    if (res.rowsSkipped > 0) {
      toast.show(
        t('admin.salesKpis.returnsSkipped', {
          defaultValue: '{{count, number}} rows were skipped — RTO (never delivered) or missing a return id, SKU or date.',
          count: res.rowsSkipped,
        }),
        'info',
      );
    }
  };

  const onPick = async (file: File): Promise<void> => {
    setUploading(true);
    try {
      const csv = await file.text();
      await (kind === 'orders' ? uploadOrders(csv) : uploadReturns(csv));
      onDone();
    } catch (err: unknown) {
      toast.show(
        apiErrorMessage(err) ?? t('admin.salesKpis.uploadFailed', { defaultValue: 'Could not import that file.' }),
        'error',
      );
    } finally {
      setUploading(false);
      // Lets the same file be picked again after a failure.
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onPick(file);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm transition hover:bg-neutral-50 disabled:opacity-60"
      >
        <Upload size={15} className={uploading ? 'animate-pulse' : ''} />
        {uploading
          ? t('admin.salesKpis.uploading', { defaultValue: 'Importing…' })
          : kind === 'orders'
            ? t('admin.salesKpis.upload', { defaultValue: 'Upload report' })
            : t('admin.salesKpis.uploadReturns', { defaultValue: 'Upload returns report' })}
      </button>
    </div>
  );
}
