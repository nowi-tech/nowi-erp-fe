import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Printer,
} from 'lucide-react';
import { DxfViewer } from 'dxf-viewer';
import { Color } from 'three';
import { getReadUrls } from '@/api/storage';

function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() ?? '';
}

function isDisplayable(url: string | null | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

const IMAGE_EXT = ['png', 'jpg', 'jpeg'];

interface Props {
  /** GCS object paths of the uploaded CAD files. */
  patternCadPaths: string[];
}

/**
 * Read-only CAD preview for the Style drawer's view mode.
 *
 * Renders a LIST of pattern / CAD files, one tile each:
 *  - image (.png/.jpg/.jpeg) → inline `<img>`.
 *  - .pdf → inline `<iframe>`.
 *  - .dxf → rendered onto a WebGL canvas via `dxf-viewer` (pan/zoom);
 *    falls back to a download link if the file fails to parse.
 *
 * Every tile carries a Print action; a "Print all" button prints the
 * whole list in one document.
 *
 * Resolves GCS object paths to signed read URLs in one batched call.
 * In noop dev mode the BE returns `noop://…` strings — treated as
 * "no displayable file" (download link only).
 */
export default function PatternCadPreview({ patternCadPaths }: Props) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);

  const paths = patternCadPaths ?? [];

  useEffect(() => {
    let cancelled = false;
    if (paths.length === 0) {
      setUrls({});
      setLoading(false);
      return;
    }
    setLoading(true);
    getReadUrls(paths)
      .then((m) => {
        if (cancelled) return;
        const next: Record<string, string | null> = {};
        for (const p of paths) {
          next[p] = isDisplayable(m[p]) ? m[p] : null;
        }
        setUrls(next);
      })
      .catch(() => {
        if (!cancelled) setUrls({});
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths.join('|')]);

  if (loading) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        {t('admin.styles.drawer.patternCad.uploading')}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {paths.length > 1 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => printAll(paths, urls)}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <Printer size={13} /> {t('admin.styles.drawer.patternCad.printAll')}
          </button>
        </div>
      )}
      {paths.map((p, idx) => (
        <PatternCadFileTile key={`${p}-${idx}`} path={p} url={urls[p] ?? null} />
      ))}
    </div>
  );
}

// ─── Per-file tile ────────────────────────────────────────────────────

function PatternCadFileTile({
  path,
  url,
}: {
  path: string;
  url: string | null;
}) {
  const { t } = useTranslation();
  const ext = extOf(path);
  const fileName = path.split('/').pop() ?? path;
  const isImage = IMAGE_EXT.includes(ext);
  const isPdf = ext === 'pdf';
  const isDxf = ext === 'dxf';
  // "Open" goes to the dedicated full-window preview page.
  // "Download" + "Print" run inline so the user doesn't bounce to a
  // new tab just to grab a file or hit print.
  const previewHref = `/cad/preview?path=${encodeURIComponent(path)}`;

  // Inline download — fetch as blob and trigger <a download> so the
  // file actually saves instead of opening inline (which most browsers
  // do for image / PDF when you just `href` the URL).
  const doDownload = async () => {
    if (!url) return;
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
      setTimeout(() => URL.revokeObjectURL(objUrl), 0);
    } catch {
      // Cross-origin or storage hiccup — open the raw URL as a fallback.
      window.open(url, '_blank', 'noopener');
    }
  };

  const fileRow = (printable: boolean, onPrint?: () => void) => (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-2">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <FileText
          size={16}
          className="shrink-0 text-[var(--color-muted-foreground)]"
        />
        <span className="truncate" title={fileName}>
          {fileName}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        {url && (
          <button
            type="button"
            onClick={() => void doDownload()}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <Download size={13} />{' '}
            {t('admin.styles.drawer.patternCad.download', {
              defaultValue: 'Download',
            })}
          </button>
        )}
        {printable && onPrint && (
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            <Printer size={13} />{' '}
            {t('admin.styles.drawer.patternCad.print', {
              defaultValue: 'Print',
            })}
          </button>
        )}
        <a
          href={previewHref}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
        >
          <ExternalLink size={13} />{' '}
          {t('admin.styles.drawer.patternCad.openPreview', {
            defaultValue: 'Open',
          })}
        </a>
      </span>
    </div>
  );

  // Images
  if (isImage) {
    return (
      <div className="space-y-1.5">
        {url && (
          <img
            src={url}
            alt={fileName}
            className="max-h-[260px] w-auto rounded-md border border-[var(--color-border)] object-contain"
          />
        )}
        {fileRow(!!url, url ? () => printImage(url, fileName) : undefined)}
      </div>
    );
  }

  // PDF — inline iframe preview
  if (isPdf) {
    return (
      <div className="space-y-1.5">
        {url && (
          <iframe
            src={url}
            title={fileName}
            className="h-[320px] w-full rounded-md border border-[var(--color-border)]"
          />
        )}
        {fileRow(!!url, url ? () => printUrlInWindow(url) : undefined)}
      </div>
    );
  }

  // DXF — real render
  if (isDxf) {
    return <DxfRender url={url} fileName={fileName} fileRow={fileRow} />;
  }

  // Any other allowed type — file row + download only.
  return <div className="space-y-1.5">{fileRow(false)}</div>;
}

// ─── DXF render ───────────────────────────────────────────────────────

function DxfRender({
  url,
  fileName,
  fileRow,
}: {
  url: string | null;
  fileName: string;
  fileRow: (printable: boolean, onPrint?: () => void) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<DxfViewer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );

  useEffect(() => {
    if (!url || !containerRef.current) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    // preserveDrawingBuffer lets us snapshot the canvas for printing.
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
        // Frame the camera on the loaded geometry; without this the
        // pattern renders at its native CAD coordinates and is
        // typically far off-screen. See the same note in
        // pages/cad/CadPreviewPage.tsx.
        const v = viewer as unknown as {
          FitView?: () => void;
          fitView?: () => void;
        };
        try {
          (v.FitView ?? v.fitView)?.call(viewer);
        } catch {
          /* older versions / no bbox — keep default camera */
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

  const onPrint = () => {
    const viewer = viewerRef.current;
    const canvas = viewer?.GetCanvas() as HTMLCanvasElement | undefined;
    if (!canvas) return;
    try {
      printImage(canvas.toDataURL('image/png'), fileName);
    } catch {
      /* tainted canvas — nothing we can do */
    }
  };

  return (
    <div className="space-y-1.5">
      {status !== 'error' && (
        <div className="relative h-[320px] w-full overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
          <div ref={containerRef} className="h-full w-full" />
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="animate-spin" size={14} />
              {t('admin.styles.drawer.patternCad.dxfRendering')}
            </div>
          )}
        </div>
      )}
      {status === 'error' && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {t('admin.styles.drawer.patternCad.dxfError')}
        </p>
      )}
      {fileRow(status === 'ready', status === 'ready' ? onPrint : undefined)}
    </div>
  );
}

// ─── Print helpers ────────────────────────────────────────────────────

/** Open an image (data URL or http URL) in a new window and print it. */
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

/** Open a URL (PDF/image) in a new window and trigger the print dialog. */
function printUrlInWindow(url: string) {
  const w = window.open(url, '_blank');
  if (!w) return;
  // PDFs render inside the new tab; give the viewer a moment, then print.
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

/** Print every file in one document (images + DXF canvas snapshots). */
function printAll(paths: string[], urls: Record<string, string | null>) {
  const w = window.open('', '_blank');
  if (!w) return;
  const blocks: string[] = [];
  for (const p of paths) {
    const url = urls[p];
    const ext = extOf(p);
    const name = p.split('/').pop() ?? p;
    if (!url) continue;
    if (IMAGE_EXT.includes(ext)) {
      blocks.push(
        `<figure><img src="${url}"><figcaption>${escapeHtml(name)}</figcaption></figure>`,
      );
    } else if (ext === 'pdf') {
      blocks.push(
        `<figure><a href="${url}">${escapeHtml(name)} (PDF)</a></figcaption></figure>`,
      );
    }
    // DXF canvases can't be snapshotted from another window — printed per-file.
  }
  w.document.write(
    `<!doctype html><html><head><title>Pattern / CAD files</title>` +
      `<style>html,body{margin:0;font-family:sans-serif}` +
      `figure{margin:0 0 16mm;page-break-inside:avoid}` +
      `img{max-width:100%;height:auto;display:block}` +
      `figcaption{font-size:11px;color:#555;margin-top:4px}` +
      `@media print{@page{margin:8mm}}</style></head>` +
      `<body onload="window.focus();window.print()">${blocks.join('')}</body></html>`,
  );
  w.document.close();
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"]/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}
