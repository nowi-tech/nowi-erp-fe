import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { listVendors } from '@/api/vendors';
import { createInbound } from '@/api/inbound';
import type { Vendor, SizeMatrix, InboundLotPayload } from '@/api/types';

const SIZES = ['S', 'M', 'L', 'XL', 'XXL'] as const;

interface LotRow {
  key: number;
  lotNo: string;
  matrix: SizeMatrix;
}

function emptyMatrix(): SizeMatrix {
  return SIZES.reduce<SizeMatrix>((acc, s) => {
    acc[s] = 0;
    return acc;
  }, {});
}

function matrixTotal(m: SizeMatrix): number {
  return Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
}

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReceiveFromKottyModal({ onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState<string>('');
  const [challanNo, setChallanNo] = useState('');
  const [vendorLotNo, setVendorLotNo] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<LotRow[]>([
    { key: 1, lotNo: '', matrix: emptyMatrix() },
  ]);
  const nextKeyRef = useRef(2);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    listVendors()
      .then((vs) => {
        if (cancelled) return;
        setVendors(vs);
        // Default to Kotty vendor when present.
        const kotty =
          vs.find((v) => v.code?.toUpperCase() === 'KOTTY') ??
          vs.find((v) => v.consumptionApiEnabled) ??
          vs[0];
        if (kotty) setVendorId(kotty.id);
      })
      .catch(() => {
        if (!cancelled) setVendors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + matrixTotal(r.matrix), 0),
    [rows],
  );

  const canSubmit =
    !!vendorId &&
    challanNo.trim().length > 0 &&
    rows.every((r) => r.lotNo.trim().length > 0) &&
    grandTotal > 0;

  function updateMatrix(key: number, size: string, raw: string) {
    const qty = Math.max(0, parseInt(raw, 10) || 0);
    setRows((prev) =>
      prev.map((r) =>
        r.key === key ? { ...r, matrix: { ...r.matrix, [size]: qty } } : r,
      ),
    );
  }

  function updateLotNo(key: number, value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, lotNo: value } : r)));
  }

  function addRow() {
    const key = nextKeyRef.current;
    nextKeyRef.current += 1;
    setRows((prev) => [...prev, { key, lotNo: '', matrix: emptyMatrix() }]);
  }

  function removeRow(key: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)));
  }

  async function doSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const lots: InboundLotPayload[] = rows.map((r) => ({
        lotNo: r.lotNo.trim(),
        sizeMatrix: r.matrix,
      }));
      await createInbound({
        vendorId,
        vendorChallanNo: challanNo.trim(),
        vendorLotNo: vendorLotNo.trim() || undefined,
        notes: notes.trim() || undefined,
        lots,
      });
      toast.show(t('stitching.receiveFromKotty.successToast'), 'success');
      onSuccess();
    } catch {
      toast.show(t('stitching.receiveFromKotty.errorToast'), 'error');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={t('stitching.receiveFromKotty.title')}
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canSubmit || submitting}
            >
              {t('common.submit')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="vendor">{t('stitching.receiveFromKotty.vendor')}</Label>
            <Select
              id="vendor"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="" disabled>
                —
              </option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.code})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="challanNo">{t('stitching.receiveFromKotty.challanNo')}</Label>
            <Input
              id="challanNo"
              value={challanNo}
              onChange={(e) => setChallanNo(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="vendorLotNo">
              {t('stitching.receiveFromKotty.vendorLotNo')}
            </Label>
            <Input
              id="vendorLotNo"
              value={vendorLotNo}
              onChange={(e) => setVendorLotNo(e.target.value)}
            />
          </div>

          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div
                key={row.key}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <Label htmlFor={`lotNo-${row.key}`} className="mb-0">
                    {t('stitching.receiveFromKotty.lotNo')} #{idx + 1}
                  </Label>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.key)}
                      aria-label={t('stitching.receiveFromKotty.removeLot')}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <Input
                  id={`lotNo-${row.key}`}
                  value={row.lotNo}
                  onChange={(e) => updateLotNo(row.key, e.target.value)}
                />
                <div>
                  <Label className="mb-1">{t('stitching.receiveFromKotty.sizeMatrix')}</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {SIZES.map((s) => (
                      <div key={s} className="flex flex-col">
                        <span className="text-xs font-medium text-center mb-1">{s}</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={row.matrix[s] ?? 0}
                          onChange={(e) => updateMatrix(row.key, s, e.target.value)}
                          className="text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 text-right text-xs text-[var(--color-muted-foreground)]">
                    Σ {matrixTotal(row.matrix)}
                  </div>
                </div>
              </div>
            ))}
            <Button type="button" variant="outline" onClick={addRow} className="w-full">
              {t('stitching.receiveFromKotty.addLot')}
            </Button>
          </div>

          <div>
            <Label htmlFor="notes">{t('stitching.receiveFromKotty.notes')}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>
      </Dialog>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('stitching.receiveFromKotty.confirmTitle')}
        initialFocusRef={cancelBtnRef}
        footer={
          <>
            <Button
              ref={cancelBtnRef}
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={doSubmit} disabled={submitting}>
              {submitting ? t('common.saving') : t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('stitching.receiveFromKotty.totalUnits', { total: grandTotal })}</p>
      </Dialog>
    </>
  );
}
