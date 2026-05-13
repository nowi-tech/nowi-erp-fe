import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { toast as sonnerToast } from 'sonner';
import FloorShell from '@/components/layout/FloorShell';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { getLot, patchLot, requestLotEdit } from '@/api/lots';
import type { Lot, SizeMatrix } from '@/api/types';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export default function FloorEditLot() {
  const { t } = useTranslation();
  const { lotId: lotIdParam = '' } = useParams<{ lotId: string }>();
  const lotId = Number(lotIdParam);
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const arrivedFromExpired = searchParams.get('expired') === '1';
  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // When the window has passed, "Save" becomes "Send request to admin"
  // and the BE writes an audit row instead of mutating the lot.
  const [requestOpen, setRequestOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const [vendorLotNo, setVendorLotNo] = useState('');
  const [matrix, setMatrix] = useState<SizeMatrix>({});

  useEffect(() => {
    getLot(lotId)
      .then((l) => {
        setLot(l);
        setVendorLotNo(l.vendorLotNo ?? '');
        setMatrix({ ...l.qtyIn });
      })
      .catch(() => sonnerToast.error(t('stitching.lot.loadError')))
      .finally(() => setLoading(false));
  }, [lotId, t]);

  const expired = useMemo(() => {
    if (!lot) return false;
    const age = Date.now() - new Date(lot.createdAt).getTime();
    return age > EDIT_WINDOW_MS;
  }, [lot]);

  // qtyIn becomes immutable once anything has been forwarded; the BE
  // refuses the patch. Approximate locally by checking the stage stat
  // we already load — if anything forwarded at stitching, lock.
  const qtyLocked = useMemo(() => {
    if (!lot) return false;
    const stitchFwd = lot.stageForwarded?.stitching ?? 0;
    const finishFwd = lot.stageForwarded?.finishing ?? 0;
    return stitchFwd > 0 || finishFwd > 0;
  }, [lot]);

  const sizes = useMemo(() => Object.keys(matrix), [matrix]);

  async function save() {
    if (!lot) return;
    setSaving(true);
    try {
      const body: Parameters<typeof patchLot>[1] = {};
      if ((vendorLotNo || '') !== (lot.vendorLotNo ?? '')) {
        body.vendorLotNo = vendorLotNo.trim() || null;
      }
      if (!qtyLocked) {
        const changed = sizes.some(
          (s) => (matrix[s] ?? 0) !== (lot.qtyIn[s] ?? 0),
        );
        if (changed) body.qtyIn = matrix;
      }
      if (Object.keys(body).length === 0) {
        navigate('/floor');
        return;
      }
      await patchLot(lot.id, body);
      sonnerToast.success(t('floor.editSaved'));
      navigate('/floor');
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } } };
      sonnerToast.error(e.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FloorShell>
      <div>
        <button
          type="button"
          onClick={() => navigate('/floor')}
          className="inline-flex items-center gap-1 pr-3.5 pl-2 py-2 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[14px] font-medium text-[var(--color-foreground)] shadow-[0_1px_1px_rgba(14,23,48,0.03)] hover:bg-[var(--color-muted)] transition-colors"
        >
          <ChevronLeft size={20} />
          {t('common.back')}
        </button>
      </div>

      {loading ? (
        <div className="mt-3 h-32 animate-pulse rounded bg-[var(--color-muted)]" />
      ) : !lot ? null : (
        <div className="mt-3 space-y-3.5">
          <div className="rounded-[14px] bg-[var(--color-surface)] border-l-[3px] border-l-[var(--color-primary)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px]">
            <div className="font-semibold text-[26px] leading-[1.05] tracking-[-0.01em] text-[var(--color-foreground)] break-all">
              {lot.lotNo}
            </div>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              {expired ? t('floor.editExpired') : t('floor.editWindow')}
            </p>
          </div>

          <div className="rounded-[14px] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(15,26,54,0.04)] p-[16px_18px] space-y-3">
            <div>
              <Label htmlFor="vendorLotNo">
                {t('floor.editVendorLotNo')}
              </Label>
              <Input
                id="vendorLotNo"
                value={vendorLotNo}
                onChange={(e) => setVendorLotNo(e.target.value)}
                disabled={expired}
              />
            </div>

            <div>
              <Label>{t('stitching.receiveFromKotty.sizeMatrix')}</Label>
              {qtyLocked && (
                <p className="text-[12px] text-[var(--color-muted-foreground)] mb-2">
                  Size matrix is locked once any units have been forwarded.
                </p>
              )}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-2">
                {sizes.map((s) => (
                  <div key={s} className="flex flex-col">
                    <div className="text-[11px] font-medium text-center mb-1">
                      {s}
                    </div>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={matrix[s] != null ? String(matrix[s]) : ''}
                      onChange={(e) => {
                        const v = parseInt(
                          e.target.value.replace(/\D/g, '') || '0',
                          10,
                        );
                        setMatrix({ ...matrix, [s]: v });
                      }}
                      disabled={expired || qtyLocked}
                      className="text-center px-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => navigate('/floor')}
              disabled={saving}
            >
              {t('common.cancel')}
            </Button>
            {expired ? (
              // Greyed-but-enabled — tap opens the request dialog so the
              // floor manager can route the change through the admin.
              <Button onClick={() => setRequestOpen(true)} disabled={requesting}>
                {t('floor.editRequestSubmit')}
              </Button>
            ) : (
              <Button onClick={save} disabled={saving}>
                {saving ? t('common.saving') : t('common.save')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Edit-request confirmation — opens automatically if the user
          arrived here from a click on the greyed Edit button on the
          detail page (?expired=1), or when they tap Send request. */}
      <Dialog
        open={requestOpen || (arrivedFromExpired && expired && !loading)}
        onClose={() => setRequestOpen(false)}
        title={t('floor.editRequestTitle')}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setRequestOpen(false);
                if (arrivedFromExpired) navigate('/floor');
              }}
              disabled={requesting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={async () => {
                if (!lot) return;
                setRequesting(true);
                try {
                  const body: Parameters<typeof requestLotEdit>[1] = {};
                  if ((vendorLotNo || '') !== (lot.vendorLotNo ?? '')) {
                    body.vendorLotNo = vendorLotNo.trim() || null;
                  }
                  const matrixChanged = Object.keys(matrix).some(
                    (s) => (matrix[s] ?? 0) !== (lot.qtyIn[s] ?? 0),
                  );
                  if (matrixChanged) body.qtyIn = matrix;
                  await requestLotEdit(lot.id, body);
                  sonnerToast.success(t('floor.editRequestSentToast'));
                  navigate('/floor');
                } catch {
                  sonnerToast.error(t('common.error'));
                } finally {
                  setRequesting(false);
                  setRequestOpen(false);
                }
              }}
              disabled={requesting}
            >
              {requesting ? t('common.saving') : t('floor.editRequestSubmit')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-foreground-2)]">
          {t('floor.editRequestBody')}
        </p>
      </Dialog>
    </FloorShell>
  );
}
