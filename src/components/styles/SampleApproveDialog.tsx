import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { getReadUrls, uploadPhoto } from '@/api/storage';
import type { SampleApprovalStatus, SampleApproveStyleBody } from '@/api/styles';

const ABSOLUTE = /^(https?:|data:|blob:)/i;

// The sample-verdict options (Approval #2). `approved_for_production` is the
// only verdict that advances the lifecycle; the others record the verdict and
// keep the style in sampling for rework — so "send back for corrections" is
// just the `under_review_corrections` verdict, not a separate path.
const SAMPLE_APPROVAL_OPTIONS: SampleApprovalStatus[] = [
  'approved_for_production',
  'under_review_corrections',
  'pattern_correction_approved',
];

/**
 * Shared sample sign-off (Approval #2) dialog — the SINGLE way to record a
 * sample verdict, used by the workspace, the dashboard Sampling tab, and the
 * Sampling registry. Captures the verdict + an optional note. Only
 * `approved_for_production` advances the lifecycle to `sample_approved`.
 */
export default function SampleApproveDialog({
  open,
  busy,
  costPrice,
  styleId,
  image,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  /** Existing cost price (prefill for re-approval / correction). */
  costPrice?: number | null;
  /** The style being approved — a replacement image uploads under it. */
  styleId: number | null;
  /** Current main image: a signed URL or a GCS object path. */
  image: string | null;
  onClose: () => void;
  onConfirm: (body: SampleApproveStyleBody) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [verdict, setVerdict] = useState<SampleApprovalStatus>(
    'approved_for_production',
  );
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  // null = not answered yet; false = replace it.
  const [imageFinal, setImageFinal] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [newImagePath, setNewImagePath] = useState('');
  const [newPreview, setNewPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  // Bumped on every reset, so an upload that finishes after it can't land on another style.
  const uploadSeq = useRef(0);

  useEffect(() => {
    if (open) {
      uploadSeq.current += 1;
      setUploading(false);
      setVerdict('approved_for_production');
      setNote('');
      setCost(costPrice != null ? String(costPrice) : '');
      setImageFinal(image ? null : false);
      setNewImagePath('');
      setNewPreview('');
    }
  }, [open, costPrice, image]);

  // Show the current image whether we were handed a URL or a storage path.
  useEffect(() => {
    let live = true;
    if (!open || !image) setCurrent(null);
    else if (ABSOLUTE.test(image)) setCurrent(image);
    else
      void getReadUrls([image])
        .then((m) => live && setCurrent(m[image] ?? null))
        .catch(() => live && setCurrent(null));
    return () => {
      live = false;
    };
  }, [open, image]);

  const onImageFile = (file: File | undefined) => {
    if (!file || styleId == null) return;
    const seq = ++uploadSeq.current;
    setUploading(true);
    setNewPreview(URL.createObjectURL(file));
    void uploadPhoto('style', styleId, file)
      .then(({ objectPath }) => {
        if (seq === uploadSeq.current) setNewImagePath(objectPath);
      })
      .catch(() => {
        if (seq !== uploadSeq.current) return;
        setNewPreview('');
        setNewImagePath('');
        toast.show(
          t('admin.production.intake.imageFailed', { defaultValue: "Couldn't upload that image." }),
          'error',
        );
      })
      .finally(() => {
        if (seq === uploadSeq.current) setUploading(false);
      });
  };

  // Only the advancing verdict actually approves the sample — cost is required
  // then (an approved sample must carry its cost). Rework verdicts may omit it.
  const advancing = verdict === 'approved_for_production';
  const costNum = cost.trim() ? Number(cost) : NaN;
  const costValid = Number.isFinite(costNum) && costNum > 0;
  const costMissing = advancing && !costValid;
  const imageMissing = advancing && !(imageFinal === true || newImagePath);

  return (
    <Dialog
      open={open}
      onClose={uploading ? () => undefined : onClose}
      title={t('admin.styles.approval2.dialogTitle', {
        defaultValue: 'Approve sample',
      })}
      footer={
        <>
          <Button variant="outline" size="sm" disabled={busy || uploading} onClick={onClose}>
            {t('admin.styles.approval2.cancel', { defaultValue: 'Cancel' })}
          </Button>
          <Button
            size="sm"
            disabled={busy || uploading || costMissing || imageMissing}
            onClick={() =>
              onConfirm({
                sampleApproval: verdict,
                note: note.trim() || undefined,
                costPrice: costValid ? costNum : undefined,
                ...(advancing && imageFinal === true ? { imageConfirmed: true } : {}),
                ...(advancing && imageFinal === false && newImagePath ? { newImagePath } : {}),
              })
            }
          >
            <CheckCircle2 size={14} />
            <span className="ml-1">
              {t('admin.styles.approval2.confirm', {
                defaultValue: 'Sign off',
              })}
            </span>
          </Button>
        </>
      }
    >
      <p className="text-sm text-[var(--color-muted-foreground)] mb-4">
        {t('admin.styles.approval2.dialogIntro', {
          defaultValue:
            'Record the sample verdict. Only "Approved for production" advances the lifecycle — other verdicts log the state and keep the style in sampling for rework.',
        })}
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.verdict', {
              defaultValue: 'Sample verdict',
            })}
          </label>
          <select
            value={verdict}
            onChange={(e) => setVerdict(e.target.value as SampleApprovalStatus)}
            className="flex h-10 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {SAMPLE_APPROVAL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {t(`admin.styles.sampleApproval.${v}` as const, {
                  defaultValue: v,
                })}
              </option>
            ))}
          </select>
        </div>
        {advancing && (
          <div>
            <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
              {image
                ? t('admin.styles.approval2.imageQuestion', { defaultValue: 'Is this the final image?' })
                : t('admin.styles.approval2.imageUpload', { defaultValue: 'Upload the final image' })}
              <span className="text-[var(--color-destructive)]"> *</span>
            </label>
            <div className="flex items-center gap-3">
              {(imageFinal === false ? newPreview : current) ? (
                <img
                  src={imageFinal === false ? newPreview : current!}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-[var(--radius-sm)] object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {image && (
                  <>
                    <Button
                      size="sm"
                      variant={imageFinal === true ? 'default' : 'outline'}
                      onClick={() => setImageFinal(true)}
                    >
                      {t('common.yes', { defaultValue: 'Yes' })}
                    </Button>
                    <Button
                      size="sm"
                      variant={imageFinal === false ? 'default' : 'outline'}
                      onClick={() => setImageFinal(false)}
                    >
                      {t('common.no', { defaultValue: 'No' })}
                    </Button>
                  </>
                )}
                {imageFinal === false && (
                  <label className="cursor-pointer text-sm font-semibold text-[var(--color-primary)] hover:underline">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading || styleId == null}
                      onChange={(e) => {
                        onImageFile(e.target.files?.[0]);
                        e.target.value = '';
                      }}
                    />
                    {uploading
                      ? t('common.uploading', { defaultValue: 'Uploading…' })
                      : newImagePath
                        ? t('admin.production.intake.changeImage', { defaultValue: 'Change image' })
                        : t('admin.production.intake.uploadImage', { defaultValue: 'Upload image' })}
                  </label>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Cost price — required to approve (the advancing verdict). For a
            rework verdict it's optional context. */}
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.costPrice', {
              defaultValue: 'Cost price (₹)',
            })}
            {advancing && <span className="text-[var(--color-destructive)]"> *</span>}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted-foreground)]">
              ₹
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className="h-10 pl-6 text-sm"
              placeholder={t('admin.styles.approval2.costPlaceholder', {
                defaultValue: 'e.g. 450',
              })}
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              aria-invalid={costMissing}
            />
          </div>
          {costMissing && (
            <p className="mt-1 text-xs text-[var(--color-destructive)]">
              {t('admin.styles.approval2.costRequired', {
                defaultValue: 'A cost price is required to approve the sample.',
              })}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted-foreground)] mb-1">
            {t('admin.styles.approval2.note', { defaultValue: 'Note' })}
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('admin.styles.approval2.notePlaceholder', {
              defaultValue: 'Optional context — defects, corrections, …',
            })}
          />
        </div>
      </div>
    </Dialog>
  );
}
