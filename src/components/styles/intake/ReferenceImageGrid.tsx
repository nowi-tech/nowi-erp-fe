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
import { classifyImage, extractLink, type LinkExtractResult } from '@/api/styles';
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
  /** Optional — receives the full extraction result (incl. AI-inferred
   *  gender / categoryId / colour) whenever a link is read or an image is
   *  classified. The parent form pre-fills empty fields from it. */
  onExtracted?: (
    result: LinkExtractResult,
    origin: 'link' | 'image',
  ) => void;
  /** Optional — extraction status, so the parent can show inline feedback
   *  (loading / what was found / failure) for BOTH the pasted link and an
   *  uploaded image being classified. */
  onExtractStatus?: (status: {
    loading: boolean;
    result?: LinkExtractResult;
    /** 'link' = reading a pasted URL; 'image' = classifying an upload. */
    origin: 'link' | 'image';
    /** Re-run the read for the current link (set on a failed result). */
    retry?: () => void;
  }) => void;
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
  onExtracted,
  onExtractStatus,
}: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // True while a pasted link is being read — shows a loader in the add tile.
  const [fetchingLink, setFetchingLink] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  // Bumped by the Retry action to re-run a failed read for the same URL.
  const [retryNonce, setRetryNonce] = useState(0);
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
  const onExtractedRef = useRef(onExtracted);
  const onExtractStatusRef = useRef(onExtractStatus);
  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    onPrimaryUrlChangeRef.current = onPrimaryUrlChange;
    onExtractedRef.current = onExtracted;
    onExtractStatusRef.current = onExtractStatus;
  });
  // True until the component unmounts — used to guard async callbacks
  // from updating state after unmount (replaces the per-effect-run
  // `cancelled` flag that was incorrectly tripping on re-renders).
  const mountedRef = useRef(true);
  useEffect(() => {
    // Reset on (re)mount — React 19 StrictMode mounts → unmounts → remounts
    // in dev, so without restoring this to true the cleanup's `false` would
    // stick and every async .then below would silently bail (no image add,
    // no field fill, no status update).
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
  // Retry a failed read for the SAME url: clear the dedup + bump the nonce
  // so the effect below re-runs and re-fetches (the BE no longer caches
  // failures, so this is a fresh attempt).
  const retry = useCallback(() => {
    lastFetchedFor.current = null;
    setRetryNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const url = debouncedLink.trim();
    if (!url || !isAbsUrl(url)) return;
    if (lastFetchedFor.current === url) return;
    if (valueRef.current.length >= MAX_IMAGES) return;
    lastFetchedFor.current = url;
    onExtractStatusRef.current?.({ loading: true, origin: 'link' });
    setFetchingLink(true);
    extractLink(url)
      .then((r) => {
        if (!mountedRef.current) return;
        setFetchingLink(false);
        // Always report status so the form can show inline feedback below
        // the link input (success summary or the failure reason).
        onExtractStatusRef.current?.({
          loading: false,
          result: r,
          origin: 'link',
          retry: r.ok ? undefined : retry,
        });
        if (!r.ok) return;
        // Bubble AI attributes (gender / category / colour) to the form
        // even when no image came back — url-context often reads the page
        // attributes without yielding a usable image.
        onExtractedRef.current?.(r, 'link');
        if (!r.imageUrl) return;
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
        if (mountedRef.current) {
          setFetchingLink(false);
          onExtractStatusRef.current?.({
            loading: false,
            result: { ok: false, reason: 'Could not read that link.' },
            origin: 'link',
            retry,
          });
        }
      });
  }, [debouncedLink, toast, retryNonce, retry]);

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
        const uploaded: string[] = [];
        for (const file of imageFiles) {
          const { objectPath } = await uploadPhoto('style', entityId, file);
          next.push(objectPath);
          uploaded.push(objectPath);
          // Optimistic local preview so the tile fills before the signed
          // URL round-trips.
          setPreviews((p) => ({ ...p, [objectPath]: URL.createObjectURL(file) }));
        }
        onChange(next);
        // Classify the first uploaded image for attribute suggestions —
        // the vision fallback that covers sites url-context can't read
        // (e.g. Amazon). Reports status (origin:'image') so the form shows
        // the same loader/skeletons + summary it does for a link.
        if (uploaded[0]) {
          onExtractStatusRef.current?.({ loading: true, origin: 'image' });
          classifyImage(uploaded[0])
            .then((r) => {
              if (!mountedRef.current) return;
              onExtractStatusRef.current?.({
                loading: false,
                result: r,
                origin: 'image',
              });
              if (r.ok) onExtractedRef.current?.(r, 'image');
            })
            .catch(() => {
              if (mountedRef.current) {
                onExtractStatusRef.current?.({ loading: false, origin: 'image' });
              }
            });
        }
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

  // A bare <div onPaste> only fires when a focused child input receives the
  // paste — and the grid has no input inside it — so Cmd/Ctrl+V silently did
  // nothing. Listen at the document level so paste works without focus.
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.items ?? [])]
        .filter((i) => i.type.startsWith('image/'))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) {
        e.preventDefault();
        void doUpload(files);
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [doUpload]);

  // Explicit click-to-paste (the hint's "Paste" button) — a click can't
  // dispatch a paste event, so read the clipboard via the async API.
  const pasteFromClipboard = useCallback(async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((tp) => tp.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(
          new File([blob], `pasted.${type.split('/')[1] || 'png'}`, { type }),
        );
      }
      if (files.length) void doUpload(files);
      else toast.show('No image on the clipboard — copy one first.', 'error');
    } catch {
      toast.show(
        'Couldn’t read the clipboard — press ⌘/Ctrl+V or upload instead.',
        'error',
      );
    }
  }, [doUpload, toast]);

  const remaining = MAX_IMAGES - value.length;

  // Featured layout: 3-column grid where the primary tile spans 2×2,
  // others 1×1. Result on a ~600px form: primary ~400×400, secondary
  // ~200×200 — vs the old 5-col layout's ~110×110 squares. Mobile uses
  // the same 3 cols (primary still 2×2 = 2/3 of phone width).
  //
  // Layout with N images:
  //   N=0: just a large add tile (2×2) so the user sees the upload target.
  //   N≥1: primary tile 2×2 + each extra image 1×1 + add tile 1×1.
  const primary = entries[0] ?? null;
  const rest = entries.slice(1);
  const showAdd = remaining > 0;
  const addIsLarge = !primary; // when no images yet, add takes the primary slot

  return (
    <div className="space-y-2" onPaste={onPaste}>
      <div className="grid grid-cols-3 gap-2">
        {primary && (
          <div
            // Stable key — no index suffix so drag-to-reorder doesn't
            // remount + flicker the tile. Fallback for transient loading.
            key={primary.objectPath ?? primary.externalUrl ?? 'primary-pending'}
            draggable
            onDragStart={onTileDragStart(0)}
            onDragOver={onTileDragOver(0)}
            onDrop={onTileDrop(0)}
            onDragEnd={() => {
              dragFromRef.current = null;
              setDragOverIdx(null);
            }}
            className={cn(
              'group relative col-span-2 row-span-2 aspect-square overflow-hidden rounded-[var(--radius-md)] border-2 border-[var(--color-primary)] bg-[var(--color-muted)] transition-all',
              dragOverIdx === 0 && 'ring-2 ring-[var(--color-primary)]',
            )}
            title="Primary image — drop another tile here to make it primary."
          >
            {primary.preview ? (
              <img
                src={primary.preview}
                alt="Reference 1 (primary)"
                className="h-full w-full object-cover"
                draggable={false}
                // Marketplace CDNs (flixcart/myntassets) reject cross-site
                // hotlinks that carry a Referer — strip it so the image loads.
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-semibold text-white">
              <Star size={10} />
              Primary
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(0);
              }}
              aria-label="Remove image"
              className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
            >
              <X size={14} />
            </button>
            {primary.externalUrl && (
              <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                <Sparkles size={10} />
                Auto-fetched
              </span>
            )}
          </div>
        )}

        {rest.map((entry, i) => {
          const idx = i + 1;
          return (
            <div
              // Stable key derived only from the entry URL — no index
              // suffix, so reorder doesn't remount/flicker.
              key={
                entry.objectPath ?? entry.externalUrl ?? `secondary-${idx}`
              }
              draggable
              onDragStart={onTileDragStart(idx)}
              onDragOver={onTileDragOver(idx)}
              onDrop={onTileDrop(idx)}
              onDragEnd={() => {
                dragFromRef.current = null;
                setDragOverIdx(null);
              }}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-muted)] transition-all',
                dragOverIdx === idx && 'ring-2 ring-[var(--color-primary)]',
              )}
              title="Drag to reorder."
            >
              {entry.preview ? (
                <img
                  src={entry.preview}
                  alt={`Reference ${idx + 1}`}
                  className="h-full w-full object-cover"
                  draggable={false}
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[var(--color-muted-foreground)]">
                  <Loader2 size={16} className="animate-spin" />
                </div>
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
          );
        })}

        {showAdd && (
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
              'flex aspect-square flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border-2 border-dashed text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)]',
              addIsLarge && 'col-span-2 row-span-2',
              dragOverIdx === value.length
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                : 'border-[var(--color-input)]',
            )}
            // aria-label mirrors the visible instructional copy so
            // assistive tech announces the full set of input methods.
            // Layout-neutral phrasing — the link field may sit above
            // or below the grid depending on the container.
            aria-label={
              addIsLarge
                ? 'Add reference image — click to upload, drop a file, paste an image, or paste a product link'
                : 'Add reference image'
            }
          >
            {busy || fetchingLink ? (
              <>
                <Loader2 size={addIsLarge ? 24 : 18} className="animate-spin" />
                {addIsLarge && fetchingLink && (
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    Fetching from link…
                  </span>
                )}
              </>
            ) : (
              <>
                <ImagePlus size={addIsLarge ? 28 : 20} />
                <span className={addIsLarge ? 'text-sm' : 'text-[11px]'}>
                  {addIsLarge
                    ? 'Click, drop, or paste an image'
                    : 'Add'}
                </span>
                {addIsLarge && (
                  <span className="text-[11px] text-[var(--color-muted-foreground)]/80">
                    or paste a product link
                  </span>
                )}
              </>
            )}
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <Upload size={11} />
          <button
            type="button"
            onClick={() => void pasteFromClipboard()}
            className="underline underline-offset-2 hover:text-[var(--color-foreground)]"
          >
            Paste
          </button>
          , drop, or click to upload — up to {MAX_IMAGES}.
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
