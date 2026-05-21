import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageOff, Link2, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { uploadPhoto, getReadUrls } from '@/api/storage';
import { extractLink } from '@/api/styles';
import { cn } from '@/lib/utils';

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const PASTE_HINT = IS_MAC ? '⌘V' : 'Ctrl+V';

function isDisplayable(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

interface Props {
  /** GCS object path of an uploaded image. */
  referenceImage: string | null;
  /** Auto-fetched remote image URL. */
  referenceImageUrl: string | null;
  /** The product/reference link — used by "Fetch from link". */
  referenceLink: string | null;
  /** Entity id when editing; 'new' while creating (upload entity id). */
  entityId: string | number;
  onChange: (patch: {
    referenceImage?: string | null;
    referenceImageUrl?: string | null;
  }) => void;
}

export default function ReferenceImageInput({
  referenceImage,
  referenceImageUrl,
  referenceLink,
  entityId,
  onChange,
}: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'upload' | 'fetch'>(null);
  const [dragOver, setDragOver] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  // Resolve what to show: remote URL wins; else sign the GCS object path.
  useEffect(() => {
    let cancelled = false;
    if (isDisplayable(referenceImageUrl)) {
      setPreview(referenceImageUrl);
      return;
    }
    if (referenceImage) {
      getReadUrls([referenceImage])
        .then((m) => {
          if (cancelled) return;
          const u = m[referenceImage];
          setPreview(isDisplayable(u) ? u : null);
        })
        .catch(() => !cancelled && setPreview(null));
    } else {
      setPreview(null);
    }
    return () => {
      cancelled = true;
    };
  }, [referenceImage, referenceImageUrl]);

  const doUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith('image/')) {
        toast.show('That is not an image file.', 'error');
        return;
      }
      setBusy('upload');
      try {
        const { objectPath } = await uploadPhoto('style', entityId, file);
        onChange({ referenceImage: objectPath, referenceImageUrl: null });
        // Local instant preview (works even in GCS noop dev mode).
        setPreview(URL.createObjectURL(file));
        setLinkMsg(null);
        toast.show('Image attached.', 'success');
      } catch {
        toast.show('Upload failed — try again.', 'error');
      } finally {
        setBusy(null);
      }
    },
    [entityId, onChange, toast],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const item = [...e.clipboardData.items].find((i) =>
        i.type.startsWith('image/'),
      );
      if (item) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void doUpload(file);
        }
      }
    },
    [doUpload],
  );

  const fetchFromLink = useCallback(async () => {
    if (!referenceLink) {
      setLinkMsg('Add a reference link first.');
      return;
    }
    setBusy('fetch');
    setLinkMsg(null);
    const r = await extractLink(referenceLink);
    setBusy(null);
    if (r.ok && r.imageUrl) {
      onChange({ referenceImageUrl: r.imageUrl, referenceImage: null });
      setPreview(r.imageUrl);
      toast.show(
        `Image fetched${r.source ? ` (${r.source})` : ''}.`,
        'success',
      );
    } else {
      // Graceful fallback — never blocks the user.
      setLinkMsg(
        r.reason ?? 'Could not fetch — paste or upload the image yourself.',
      );
    }
  }, [referenceLink, onChange, toast]);

  const clear = () => {
    onChange({ referenceImage: null, referenceImageUrl: null });
    setPreview(null);
    setLinkMsg(null);
  };

  return (
    <div className="space-y-2">
      <div
        tabIndex={0}
        role="button"
        aria-label={`Reference image dropzone. Paste with ${PASTE_HINT}, or drop / click to upload.`}
        onPaste={onPaste}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void doUpload(f);
        }}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        className={cn(
          'relative flex flex-col items-center justify-center gap-2 rounded-[10px] border-2 border-dashed text-center cursor-pointer transition-colors min-h-[160px] p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          dragOver
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
            : 'border-[var(--color-input)] hover:bg-[var(--color-muted)]',
        )}
      >
        {busy === 'upload' ? (
          <Loader2 className="animate-spin" size={22} />
        ) : preview ? (
          <>
            <img
              src={preview}
              alt="Reference"
              className="max-h-[220px] w-auto rounded-md object-contain"
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
              aria-label="Remove image"
              className="absolute top-2 right-2 rounded-full bg-[var(--color-foreground)]/70 text-white p-1 hover:bg-[var(--color-foreground)]"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <Upload size={22} className="text-[var(--color-muted-foreground)]" />
            {/* Touch devices can't Ctrl/⌘V into a div — lead with the
                tap-to-upload affordance there, keep the paste hint for
                pointer devices. */}
            <div className="text-sm text-[var(--color-foreground)] sm:hidden">
              <span className="underline">Tap to upload</span> or take a photo
            </div>
            <div className="text-sm text-[var(--color-foreground)] hidden sm:block">
              Paste <kbd className="font-mono font-semibold">{PASTE_HINT}</kbd>,
              drop, or <span className="underline">click to upload</span>
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">
              PNG / JPG / WebP
            </div>
          </>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void doUpload(f);
          e.target.value = '';
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null || !referenceLink}
          onClick={() => void fetchFromLink()}
          title={
            referenceLink
              ? 'Try to auto-fetch the product image from the link'
              : 'Add a reference link first'
          }
        >
          {busy === 'fetch' ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <Link2 size={14} />
          )}
          <span className="ml-1.5">Fetch from link</span>
        </Button>
        {(referenceImage || referenceImageUrl) && (
          <button
            type="button"
            onClick={clear}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] inline-flex items-center gap-1"
          >
            <ImageOff size={13} /> Remove
          </button>
        )}
      </div>

      {linkMsg && (
        <p className="text-xs text-[var(--status-rework-ink)] bg-[var(--status-rework-bg)] rounded-md px-2.5 py-1.5">
          {linkMsg}
        </p>
      )}
    </div>
  );
}
