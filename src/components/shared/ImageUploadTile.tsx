import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

/** One click-or-drop target for a single image: the whole tile opens the picker. */
export default function ImageUploadTile({
  preview,
  uploading,
  onFile,
  disabled = false,
}: {
  /** What to show in the tile — a blob or signed URL; empty shows the upload icon. */
  preview: string;
  uploading: boolean;
  onFile: (file: File) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const off = disabled || uploading;

  return (
    <label
      className={cn(
        'group flex w-fit items-center gap-3 rounded-[var(--radius-md)] border border-dashed p-2 pr-4 transition-colors',
        off
          ? 'cursor-not-allowed border-[var(--color-border)] opacity-60'
          : 'cursor-pointer border-[var(--color-muted-foreground)]/50 hover:border-[var(--color-primary)] hover:bg-[var(--color-surface-2)]',
        dragging && 'border-[var(--color-primary)] bg-[var(--color-surface-2)]',
      )}
      onDragOver={(e) => {
        if (off) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!off && file?.type.startsWith('image/')) onFile(file);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={off}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {preview ? (
        <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-sm)] object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)] group-hover:text-[var(--color-primary)]">
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        </span>
      )}
      <span className="text-sm font-semibold text-[var(--color-primary)]">
        {uploading
          ? t('common.uploading', { defaultValue: 'Uploading…' })
          : preview
            ? t('admin.production.intake.changeImage', { defaultValue: 'Change image' })
            : t('admin.production.intake.uploadImage', { defaultValue: 'Upload image' })}
      </span>
    </label>
  );
}
