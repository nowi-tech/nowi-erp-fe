import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { DxfViewer } from 'dxf-viewer';
import { Color } from 'three';
import { getReadUrls } from '@/api/storage';

/**
 * Standalone full-window CAD/Pattern preview.
 *
 * The Style detail page's inline file row USED to render preview + open +
 * print all inline alongside the form. That was busy, didn't give DXFs
 * enough screen real estate, and the print/download buttons confused
 * users into thinking they were separate destinations.
 *
 * Now every inline file action ("Open" / "Download" / "Print") opens
 * this page in a new tab with `?path=<gcs object path>`. The page
 * resolves the path to a signed URL, renders DXF inside `dxf-viewer`
 * (or shows native browser preview for image / PDF), and exposes
 * Download + Print as primary toolbar actions.
 */
export default function CadPreviewPage() {
  const [params] = useSearchParams();
  const objectPath = params.get('path') ?? '';
  const fileName = objectPath.split('/').pop() ?? objectPath;
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const isDxf = ext === 'dxf';
  const isImage = ['png', 'jpg', 'jpeg', 'webp'].includes(ext);
  const isPdf = ext === 'pdf';

  const [url, setUrl] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectPath) {
      setResolveError('No file path provided.');
      return;
    }
    let cancelled = false;
    getReadUrls([objectPath])
      .then((map) => {
        if (cancelled) return;
        const v = map[objectPath];
        if (!v || !/^https?:\/\//i.test(v)) {
          setResolveError(
            'Could not resolve a signed URL for this file (storage may be in noop mode without a local-FS fallback).',
          );
        } else {
          setUrl(v);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setResolveError(
          e instanceof Error ? e.message : 'Failed to fetch a signed URL.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [objectPath]);

  const onDownload = () => {
    if (!url) return;
    // Fetch as a blob so the browser uses `download=fileName` instead
    // of opening the file inline (some browsers ignore `download` when
    // the resource is cross-origin without explicit headers, but the
    // fetch+blob path always honours it).
    void (async () => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Free the blob after a tick so the click handler has time
        // to start the download.
        setTimeout(() => URL.revokeObjectURL(objUrl), 0);
      } catch {
        // Fallback — open in a new tab and let the user save manually.
        window.open(url, '_blank', 'noopener');
      }
    })();
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-background)] text-[var(--color-foreground)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => window.close()}
            aria-label="Close preview"
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-[var(--color-muted-foreground)]">
              Pattern / CAD preview
            </div>
            <div className="font-mono text-sm truncate" title={fileName}>
              {fileName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onDownload}
            disabled={!url}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 text-sm font-medium hover:bg-[var(--color-muted)] disabled:opacity-50"
          >
            <Download size={14} /> Download
          </button>
          <PrintButton
            url={url}
            fileName={fileName}
            kind={isImage ? 'image' : isPdf ? 'pdf' : isDxf ? 'dxf' : 'other'}
          />
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {resolveError ? (
          <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-md text-center">
              <p className="text-sm text-[var(--color-foreground)]">
                {resolveError}
              </p>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-sm text-[var(--color-primary)] hover:underline"
                >
                  Open the raw file
                </a>
              )}
            </div>
          </div>
        ) : !url ? (
          <div className="h-full flex items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="animate-spin" size={16} /> Loading…
          </div>
        ) : isDxf ? (
          <DxfFull url={url} />
        ) : isPdf ? (
          <iframe
            src={url}
            title={fileName}
            className="w-full h-full border-0"
          />
        ) : isImage ? (
          <div className="h-full overflow-auto p-4 flex items-center justify-center bg-[var(--color-surface-2)]/30">
            {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
            <img
              src={url}
              alt={fileName}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <p className="text-sm text-[var(--color-muted-foreground)]">
              No inline preview for this file type. Use Download to save
              it locally.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

/**
 * Full-window DXF render. Same `dxf-viewer` setup as the inline
 * PatternCadPreview tile, just sized to the available area.
 */
function DxfFull({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<DxfViewer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setStatus('loading');
    const viewer = new DxfViewer(containerRef.current, {
      clearColor: new Color(0xffffff),
      autoResize: true,
      colorCorrection: true,
      preserveDrawingBuffer: true,
    });
    viewerRef.current = viewer;
    viewer
      .Load({ url })
      .then(() => {
        if (cancelled) return;
        // dxf-viewer doesn't auto-fit the camera to the loaded
        // geometry; the default camera sits at the origin while CAD
        // coordinates can be anywhere in space, so the canvas reads
        // as empty even though geometry was parsed. Pull the scene
        // bounds and call FitView(minX, maxX, minY, maxY).
        try {
          const bounds = viewer.GetBounds() as
            | { minX: number; maxX: number; minY: number; maxY: number }
            | null;
          if (
            bounds &&
            Number.isFinite(bounds.minX) &&
            Number.isFinite(bounds.maxX) &&
            Number.isFinite(bounds.minY) &&
            Number.isFinite(bounds.maxY)
          ) {
            (
              viewer as unknown as {
                FitView: (
                  minX: number,
                  maxX: number,
                  minY: number,
                  maxY: number,
                  padding?: number,
                ) => void;
              }
            ).FitView(
              bounds.minX,
              bounds.maxX,
              bounds.minY,
              bounds.maxY,
              0.1,
            );
          }
        } catch {
          /* no bounds yet — keep default camera */
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
      try {
        viewer.Destroy();
      } catch {
        /* viewer may already be torn down */
      }
      viewerRef.current = null;
    };
  }, [url]);

  return (
    <div className="relative h-full w-full bg-white">
      <div ref={containerRef} className="h-full w-full" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="animate-spin" size={16} /> Rendering DXF…
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          Could not parse this DXF. Use Download to inspect it locally.
        </div>
      )}
    </div>
  );
}

/**
 * Print button — same `dxf-viewer`-canvas snapshot trick used inline,
 * but raised to the full-window preview header so all "Print" entry
 * points funnel through this page.
 */
function PrintButton({
  url,
  fileName,
  kind,
}: {
  url: string | null;
  fileName: string;
  kind: 'image' | 'pdf' | 'dxf' | 'other';
}) {
  const disabled = !url || kind === 'other';
  const onClick = () => {
    if (!url) return;
    if (kind === 'image') {
      printImage(url, fileName);
    } else if (kind === 'pdf') {
      printUrlInWindow(url);
    } else if (kind === 'dxf') {
      // DXF lives in a sibling DxfFull component; we can't reach its
      // canvas from here without prop drilling. Fall back to a printable
      // image data URL via a fresh hidden DxfViewer.
      void printDxfToImage(url, fileName);
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-primary)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      <Printer size={14} /> Print
    </button>
  );
}

/** Open an image in a new window and trigger print. */
function printImage(src: string, title: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>${escapeHtml(title)}</title>` +
      `<style>html,body{margin:0}img{max-width:100%;height:auto;display:block}` +
      `@media print{@page{margin:8mm}}</style></head>` +
      `<body><img src="${src}" onload="window.focus();window.print()"></body></html>`,
  );
  w.document.close();
}

/** Open a URL (PDF) in a new window and trigger the print dialog. */
function printUrlInWindow(url: string) {
  const w = window.open(url, '_blank');
  if (!w) return;
  const tryPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* cross-origin viewer — user can print from the tab toolbar */
    }
  };
  w.addEventListener('load', () => setTimeout(tryPrint, 600));
}

/** Render DXF to a PNG data URL via a hidden DxfViewer, then print it. */
async function printDxfToImage(url: string, fileName: string) {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-99999px';
  host.style.top = '0';
  host.style.width = '1024px';
  host.style.height = '768px';
  document.body.appendChild(host);
  const viewer = new DxfViewer(host, {
    clearColor: new Color(0xffffff),
    autoResize: false,
    colorCorrection: true,
    preserveDrawingBuffer: true,
  });
  try {
    await viewer.Load({ url });
    const canvas = viewer.GetCanvas() as HTMLCanvasElement | undefined;
    if (!canvas) throw new Error('canvas unavailable');
    printImage(canvas.toDataURL('image/png'), fileName);
  } catch {
    /* swallow — the user still has the Download button */
  } finally {
    try {
      viewer.Destroy();
    } catch {
      /* viewer may already be torn down */
    }
    host.remove();
  }
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}
