import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { ImagePlus, Loader2, Sparkles, Star, Upload, X } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { extractLink } from '@/api/styles';
import { getReadUrls, uploadPhoto } from '@/api/storage';
import { useDebounced } from '@/lib/useDebounced';
import { cn } from '@/lib/utils';

const MAX_IMAGES = 5;
const FETCH_DEBOUNCE_MS = 300;

/** A single image entry. We carry both an objectPath (uploaded to GCS)
 * AND an externalUrl (auto-fetched from a remote site) so the BE can
 * mirror either into `referenceImages[]`. Only one will be set per tile. */
interface ImageEntry {
  objectPath: string | null;
  externalUrl: string | null;
  /** Resolved preview URL — either a signed read URL, the externalUrl,
   *  or a temporary blob: URL while the upload is in flight. */
  preview: string | null;
}

interface Props {
  /** Current GCS object paths + external URLs as a single ordered list.
   *  The BE field `referenceImages: string[]` mirrors `[0]` into legacy
   *  `referenceImage` for back-compat. */
  value: string[];
  /** Reference link — when it changes, we attempt a background fetch
   *  to populate a new tile. */
  referenceLink: string | null;
  /** Entity id (use 'new' while creating). */
  entityId: string | number;
  onChange: (next: string[]) => void;
  /** Optional — receives the resolved primary image URL whenever the
   *  primary tile changes. Used to keep the legacy `referenceImageUrl`
   *  field roughly in sync for downstream displays. */
  onPrimaryUrlChange?: (url: string | null) => void;
}

function isAbsUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

/**
 * Five-tile reference-image grid. Each tile is one of:
 *   1. An uploaded GCS object path (preview comes from a signed URL).
 *   2. An auto-fetched remote image URL (preview is the URL itself).
 *   3. An empty "+ add" tile (only the next-empty slot accepts input).
 *
 * Drag a tile onto another to reorder. The first tile is "primary"
 * (its preview goes into the legacy single-image field for back-compat
 * with anything still reading `referenceImage[Url]`).
 *
 * Paste/drop/click → upload via the storage two-step flow.
 * Reference link changes → debounced extractLink() → tile appears as
 * a new slot, no blocking spinner.
 */
export default function ReferenceImageGrid({
  value,
  referenceLink,
  entityId,
  onChange,
  onPrimaryUrlChange,
}: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // Track which extracted URLs we've already auto-fetched + appended,
  // so re-typing the same link doesn't add duplicate tiles.
  const lastFetchedFor = useRef<string | null>(null);
  const debouncedLink = useDebounced(referenceLink ?? '', FETCH_DEBOUNCE_MS);
  // Refs mirroring the current `value` + `onChange`, so the deferred
  // extractLink() .then callback can read the latest state without
  // needing them in the auto-fetch effect's dependency array. Including
  // them in deps causes the effect to re-run on every parent re-render,
  // which fires the cleanup's `cancelled = true` before the in-flight
  // fetch's .then resolves — so the fetch succeeds but onChange is
  // never called, and the image silently doesn't populate.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onPrimaryUrlChangeRef = useRef(onPrimaryUrlChange);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    onPrimaryUrlChangeRef.current = onPrimaryUrlChange;
  });
  // True until the component unmounts — used to guard async callbacks
  // from updating state after unmount (replaces the per-effect-run
  // `cancelled` flag that was incorrectly tripping on re-renders).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Resolve signed URLs for any GCS object paths in `value`.
  useEffect(() => {
    const toSign = value.filter(
      (v) => v && !isAbsUrl(v) && !previews[v],
    );
    if (toSign.length === 0) return;
    let cancelled = false;
    getReadUrls(toSign)
      .then((m) => {
        if (cancelled) return;
        setPreviews((p) => ({ ...p, ...m }));
      })
      .catch(() => {
        /* graceful — tile just won't have a preview */
      });
    return () => {
      cancelled = true;
    };
  }, [value, previews]);

  const entries: ImageEntry[] = useMemo(() => {
    return value.map((v) => {
      if (isAbsUrl(v)) {
        return { objectPath: null, externalUrl: v, preview: v };
      }
      return {
        objectPath: v,
        externalUrl: null,
        preview: previews[v] ?? null,
      };
    });
  }, [value, previews]);

  const primaryUrl = entries[0]?.preview ?? null;
  // Only re-fire when the URL itself changes. Reading `onPrimaryUrlChange`
  // via ref decouples this from the parent's closure identity — the
  // parent typically passes `(u) => set('referenceImageUrl', u)` which
  // is a fresh function every render, and including it in deps would
  // cause an infinite setState loop (the effect would fire, set the
  // parent's state, re-render the parent → new closure → effect re-fires).
  useEffect(() => {
    onPrimaryUrlChangeRef.current?.(primaryUrl);
  }, [primaryUrl]);

  // Debounced background fetch on link change. Watches ONLY
  // `debouncedLink` — `value` / `onChange` are read via refs in the
  // .then so the effect doesn't re-run (and cancel itself) on every
  // parent re-render. `lastFetchedFor` dedupes against re-typing the
  // same URL; `mountedRef` guards against post-unmount state writes.
  useEffect(() => {
    const url = debouncedLink.trim();
    if (!url || !isAbsUrl(url)) return;
    if (lastFetchedFor.current === url) return;
    if (valueRef.current.length >= MAX_IMAGES) return;
    lastFetchedFor.current = url;
    extractLink(url)
      .then((r) => {
        if (!mountedRef.current) return;
        if (!r.ok || !r.imageUrl) return;
        // Re-read current value from the ref (not the effect closure)
        // so a tile that landed via upload while extractLink was in
        // flight isn't clobbered.
        const cur = valueRef.current;
        if (cur.includes(r.imageUrl) || cur.length >= MAX_IMAGES) return;
        onChangeRef.current([...cur, r.imageUrl]);
        toast.show(
          `Image fetched${r.source ? ` (${r.source})` : ''}.`,
          'success',
        );
      })
      .catch(() => {
        /* silent — non-blocking */
      });
  }, [debouncedLink, toast]);

  const doUpload = useCallback(
    async (files: File[]) => {
      const remainingSlots = MAX_IMAGES - value.length;
      const imageFiles = files
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, remainingSlots);
      if (imageFiles.length === 0) return;
      setBusy(true);
      try {
        const next = [...value];
        for (const file of imageFiles) {
          const { objectPath } = await uploadPhoto('style', entityId, file);
          next.push(objectPath);
          // Optimistic local preview so the tile fills before the signed
          // URL round-trips.
          setPreviews((p) => ({ ...p, [objectPath]: URL.createObjectURL(file) }));
        }
        onChange(next);
      } catch {
        toast.show('Upload failed — try again.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [value, entityId, onChange, toast],
  );

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────
  const dragFromRef = useRef<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const onTileDragStart = (idx: number) => (e: DragEvent) => {
    dragFromRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers need data set to start a drag.
    e.dataTransfer.setData('text/plain', String(idx));
  };
  const onTileDragOver = (idx: number) => (e: DragEvent) => {
    if (dragFromRef.current === null) return;
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const onTileDrop = (idx: number) => (e: DragEvent) => {
    e.preventDefault();
    const from = dragFromRef.current;
    setDragOverIdx(null);
    dragFromRef.current = null;
    if (from === null || from === idx) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(idx, 0, moved);
    onChange(next);
  };

  // Empty-tile drop (file/image from desktop).
  const onEmptyDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOverIdx(null);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void doUpload(files);
  };

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = [...e.clipboardData.items];
      const files = items
        .filter((i) => i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) {
        e.preventDefault();
        void doUpload(files);
      }
    },
    [doUpload],
  );

  const remaining = MAX_IMAGES - value.length;

  return (
    <div className="space-y-2" onPaste={onPaste}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {entries.map((entry, idx) => (
          <div
            key={`${entry.objectPath ?? entry.externalUrl}-${idx}`}
            draggable
            onDragStart={onTileDragStart(idx)}
            onDragOver={onTileDragOver(idx)}
            onDrop={onTileDrop(idx)}
            onDragEnd={() => {
              dragFromRef.current = null;
              setDragOverIdx(null);
            }}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-[var(--radius-md)] border bg-[var(--color-muted)] transition-all',
              idx === 0
                ? 'border-2 border-[var(--color-primary)]'
                : 'border-[var(--color-border)]',
              dragOverIdx === idx && 'ring-2 ring-[var(--color-primary)]',
            )}
            title={
              idx === 0
                ? 'Primary image — drag another tile here to swap.'
                : 'Drag to reorder.'
            }
          >
            {entry.preview ? (
              <img
                src={entry.preview}
                alt={`Reference ${idx + 1}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
            {idx === 0 && (
              <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-[var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                <Star size={9} />
                Primary
              </span>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(idx);
              }}
              aria-label="Remove image"
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
            >
              <X size={12} />
            </button>
            {entry.externalUrl && (
              <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                <Sparkles size={9} />
                Auto
              </span>
            )}
          </div>
        ))}

        {remaining > 0 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverIdx(value.length);
            }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={onEmptyDrop}
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border-2 border-dashed text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]',
              dragOverIdx === value.length
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                : 'border-[var(--color-input)]',
            )}
            aria-label="Add reference image"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <ImagePlus size={18} />
                <span className="text-[11px]">Add</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <Upload size={11} />
          Paste, drop, or click to upload — up to {MAX_IMAGES}.
        </span>
        <span>
          {value.length}/{MAX_IMAGES}
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
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
