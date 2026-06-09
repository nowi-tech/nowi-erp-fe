import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, ImageOff, Pencil, Plus, X } from 'lucide-react';
import { patchStyle } from '@/api/styles';
import { useSignedUrls } from '@/hooks/useSignedUrls';
import { Dialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import ReferenceImageGrid from '@/components/styles/intake/ReferenceImageGrid';

/**
 * Product-image gallery for the Style workspace's spec column — a compact
 * primary image + thumbnail strip, a fullscreen lightbox (click the primary
 * image; ←/→ to navigate, Esc to close), and an upload-only editor (reuses
 * ReferenceImageGrid, persists via patchStyle). The per-sample fabric swatch
 * is shown separately, next to the Fabric spec row (`FabricSwatchThumb`).
 *
 * Stored values are GCS object paths; the storage proxy signs them on demand
 * via POST /storage/read-urls (`getReadUrls`).
 */
const cardClasses =
  'bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-sm overflow-hidden flex flex-col';

interface StyleImagePanelProps {
  styleId: number;
  referenceImages: string[];
  workingName: string | null;
  canWrite: boolean;
  /** Called after a successful save so the parent can refetch the style. */
  onUpdated: () => void;
}

export default function StyleImagePanel({
  styleId,
  referenceImages,
  workingName,
  canWrite,
  onUpdated,
}: StyleImagePanelProps) {
  const { t } = useTranslation();
  const toast = useToast();

  const urls = useSignedUrls(referenceImages);
  const [active, setActive] = useState<string | null>(
    referenceImages[0] ?? null,
  );
  const [lightbox, setLightbox] = useState(false);

  // Edit (upload) dialog state.
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(referenceImages);
  const [saving, setSaving] = useState(false);

  const activePath = active ?? referenceImages[0] ?? null;
  const activeIndex = activePath ? referenceImages.indexOf(activePath) : -1;

  // Lightbox keyboard nav (←/→ cycle, Esc close). preventDefault stops the
  // page behind the overlay from scrolling on arrow keys. Uses a functional
  // setActive so the listener doesn't re-subscribe on every navigation.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setLightbox(false);
        return;
      }
      if (referenceImages.length < 2) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        setActive((cur) => {
          const i = cur ? referenceImages.indexOf(cur) : 0;
          const next = (i + dir + referenceImages.length) % referenceImages.length;
          return referenceImages[next];
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, referenceImages]);

  if (referenceImages.length === 0 && !canWrite) return null;

  const alt =
    workingName ??
    t('admin.styles.workspace.images', { defaultValue: 'Reference image' });
  const activeUrl = activePath ? urls[activePath] : undefined;
  const hasImages = referenceImages.length > 0;

  const openEditor = () => {
    setDraft(referenceImages);
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await patchStyle(styleId, { referenceImages: draft });
      toast.show(
        t('admin.styles.workspace.imagesSaved', { defaultValue: 'Images saved' }),
        'success',
      );
      setEditOpen(false);
      onUpdated();
    } catch {
      toast.show(
        t('admin.styles.workspace.imagesSaveFailed', {
          defaultValue: 'Could not save images',
        }),
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cardClasses}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
        <h3 className="font-serif text-base font-semibold m-0">
          {t('admin.styles.workspace.images', { defaultValue: 'Images' })}
        </h3>
        {canWrite && (
          <button
            type="button"
            onClick={openEditor}
            aria-label={t('admin.styles.workspace.editImages', {
              defaultValue: 'Edit images',
            })}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] transition-colors"
          >
            <Pencil size={18} />
          </button>
        )}
      </div>

      <div className="p-5 space-y-3">
        {hasImages ? (
          <>
            {/* Primary image — click to open the lightbox */}
            <button
              type="button"
              onClick={() => activeUrl && setLightbox(true)}
              className="flex h-56 w-full items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-2)] cursor-zoom-in"
            >
              {activeUrl ? (
                <img
                  src={activeUrl}
                  alt={alt}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <ImageOff
                  size={28}
                  className="text-[var(--color-muted-foreground)]"
                />
              )}
            </button>

            {/* Thumbnail strip (2-3+ images) */}
            {referenceImages.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {referenceImages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setActive(p)}
                    aria-label={t('admin.styles.workspace.viewImage', {
                      defaultValue: 'View image',
                    })}
                    className={`h-14 w-14 overflow-hidden rounded-[var(--radius-sm)] border transition-colors ${
                      p === activePath
                        ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                        : 'border-[var(--color-border)] hover:border-[var(--color-primary)]'
                    }`}
                  >
                    {urls[p] ? (
                      <img
                        src={urls[p]}
                        alt={alt}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="block h-full w-full bg-[var(--color-surface-2)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          // Empty + writable: invite an upload.
          <button
            type="button"
            onClick={openEditor}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
          >
            <Plus size={22} />
            <span className="text-sm">
              {t('admin.styles.workspace.addImages', {
                defaultValue: 'Add images',
              })}
            </span>
          </button>
        )}
      </div>

      {/* Fullscreen lightbox */}
      {lightbox && activeUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label={t('common.close', { defaultValue: 'Close' })}
            className="absolute right-4 top-4 text-white/80 hover:text-white"
          >
            <X size={28} />
          </button>
          {referenceImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const prev =
                  (activeIndex - 1 + referenceImages.length) %
                  referenceImages.length;
                setActive(referenceImages[prev]);
              }}
              aria-label={t('common.previous', { defaultValue: 'Previous' })}
              className="absolute left-4 text-white/80 hover:text-white"
            >
              <ChevronLeft size={36} />
            </button>
          )}
          <img
            src={activeUrl}
            alt={alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] object-contain"
          />
          {referenceImages.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const next = (activeIndex + 1) % referenceImages.length;
                setActive(referenceImages[next]);
              }}
              aria-label={t('common.next', { defaultValue: 'Next' })}
              className="absolute right-4 text-white/80 hover:text-white"
            >
              <ChevronRight size={36} />
            </button>
          )}
        </div>
      )}

      {/* Upload-only editor */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('admin.styles.workspace.editImages', {
          defaultValue: 'Edit images',
        })}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]"
            >
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-4 py-2 text-sm text-[var(--color-primary-foreground)] disabled:opacity-60"
            >
              {saving
                ? t('common.saving', { defaultValue: 'Saving…' })
                : t('common.save', { defaultValue: 'Save' })}
            </button>
          </div>
        }
      >
        <ReferenceImageGrid
          entityId={styleId}
          value={draft}
          referenceLink={null}
          onChange={setDraft}
        />
      </Dialog>
    </section>
  );
}
