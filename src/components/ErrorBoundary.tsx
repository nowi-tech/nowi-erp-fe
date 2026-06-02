import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';
import { tryRecoverFromChunkError } from '@/lib/chunk-reload';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * App-wide error boundary.
 *
 * Without this, any render-time throw silently unmounts the whole React
 * tree → blank white screen, with the error only visible in Sentry. This
 * catches the throw, reports it (with the React component stack), and
 * shows a usable recovery screen instead of nothing.
 *
 * Kept deliberately dependency-light — it must not itself crash. Plain
 * elements + design tokens only, no shadcn primitives, no hooks.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A blank screen on first launch is usually a lazy()-chunk load
    // failure — the WebView / browser cache hadn't fetched the chunk
    // yet. Reload once before showing the error UI; the SW will have
    // precached on the prior load attempt, so the reload succeeds.
    if (tryRecoverFromChunkError(error)) return;
    Sentry.captureException(error, {
      extra: { componentStack: info.componentStack },
    });
     
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const isDev = import.meta.env.DEV;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-background)] p-6">
        <div className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] p-8 text-center shadow-sm">
          <div
            aria-hidden
            className="mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center text-2xl bg-[var(--status-stuck-bg)] text-[var(--status-stuck-ink)]"
          >
            !
          </div>
          <h1 className="font-serif text-xl text-[var(--color-foreground)]">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            This screen hit an unexpected error. It has been logged
            automatically. You can reload the page or head back.
          </p>

          {isDev && (
            <pre className="mt-4 max-h-56 overflow-auto rounded-[var(--radius-md)] bg-[var(--color-muted)] p-3 text-left text-[11px] leading-relaxed text-[var(--status-stuck-ink)] whitespace-pre-wrap">
              {error.message}
              {error.stack ? `\n\n${error.stack}` : ''}
            </pre>
          )}

          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90 transition-opacity"
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/';
              }}
              className="h-10 px-4 rounded-[var(--radius-md)] text-sm font-medium border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
            >
              Back to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
