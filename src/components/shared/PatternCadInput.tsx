import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { uploadCadFile } from '@/api/storage';

const ALLOWED_EXT = ['dxf', 'pdf', 'png', 'jpg', 'jpeg'];

function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

interface Props {
  /** GCS object paths of the uploaded CAD files. */
  patternCadPaths: string[];
  /** Entity id when editing; 'new' while creating (upload entity id). */
  entityId: string | number;
  onChange: (patternCadPaths: string[]) => void;
}

/**
 * Pattern / CAD file upload control for the Style edit drawer.
 *
 * Supports MULTIPLE files. Each picked file is uploaded via the same
 * two-step signed-URL flow as reference images (`uploadCadFile` →
 * `/api/storage/upload-url`) and appended to the `patternCadPaths`
 * list. Accepts .dxf / .pdf / .png / .jpg / .jpeg. The view-mode
 * preview (with real DXF rendering) lives in `PatternCadPreview`.
 */
export default function PatternCadInput({
  patternCadPaths,
  entityId,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const paths = patternCadPaths ?? [];

  const doUpload = useCallback(
    async (files: File[]) => {
      const valid = files.filter((f) => ALLOWED_EXT.includes(extOf(f.name)));
      if (valid.length !== files.length) {
        toast.show(t('admin.styles.drawer.patternCad.badType'), 'error');
      }
      if (valid.length === 0) return;
      setBusy(true);
      try {
        const uploaded: string[] = [];
        for (const file of valid) {
          const { objectPath } = await uploadCadFile('style', entityId, file);
          uploaded.push(objectPath);
        }
        onChange([...paths, ...uploaded]);
        toast.show(t('admin.styles.drawer.patternCad.uploaded'), 'success');
      } catch {
        toast.show(t('admin.styles.drawer.patternCad.uploadError'), 'error');
      } finally {
        setBusy(false);
      }
    },
    [entityId, onChange, paths, toast, t],
  );

  const removeAt = (idx: number) =>
    onChange(paths.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      {paths.length > 0 && (
        <ul className="space-y-1.5">
          {paths.map((p, idx) => (
            <li
              key={`${p}-${idx}`}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-input)] px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <FileText
                  size={16}
                  className="shrink-0 text-[var(--color-muted-foreground)]"
                />
                <span className="truncate" title={p}>
                  {p.split('/').pop()}
                </span>
              </span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={t('admin.styles.drawer.patternCad.remove')}
                className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              >
                <X size={13} /> {t('admin.styles.drawer.patternCad.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? (
          <Loader2 className="animate-spin" size={14} />
        ) : (
          <Upload size={14} />
        )}
        <span className="ml-1.5">
          {busy
            ? t('admin.styles.drawer.patternCad.uploading')
            : paths.length > 0
              ? t('admin.styles.drawer.patternCad.uploadMore')
              : t('admin.styles.drawer.patternCad.upload')}
        </span>
      </Button>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        {t('admin.styles.drawer.patternCad.hint')}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept=".dxf,.pdf,.png,.jpg,.jpeg"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void doUpload(files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
