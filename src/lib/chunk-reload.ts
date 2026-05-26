/**
 * Recovers the app from a stale-bundle blank screen.
 *
 * On first install (or after a Vercel deploy that shipped new chunk
 * hashes) a route's lazy() import can fail because the WebView / browser
 * cache doesn't yet have the JS file. The result is a blank screen with
 * no obvious recovery — the user has to close+reopen the app or hard
 * refresh.
 *
 * Once a chunk-load error is detected we reload once. A sessionStorage
 * guard prevents reload loops if the chunk is genuinely missing (CDN
 * misconfig, offline). The guard clears when the App component mounts
 * successfully, so a *future* chunk-load error in the same session can
 * still trigger a reload.
 */

const RELOAD_KEY = 'chunk-reload-attempted';

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk [\d_]+ failed|ChunkLoadError/i;

function shouldAutoReload(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return CHUNK_ERROR_RE.test(msg);
}

export function tryRecoverFromChunkError(err: unknown): boolean {
  if (!shouldAutoReload(err)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
  } catch {
    /* sessionStorage unavailable — skip the guard, still reload once */
  }
  window.location.reload();
  return true;
}

/**
 * Wire global handlers for chunk-load failures that escape React's
 * Suspense / error boundary path — e.g. an unhandled promise rejection
 * from a `lazy()` import.
 */
export function installChunkErrorHandlers(): void {
  window.addEventListener('unhandledrejection', (e) => {
    tryRecoverFromChunkError(e.reason);
  });
  window.addEventListener('error', (e) => {
    tryRecoverFromChunkError(e.error ?? e.message);
  });
}

/** Call once the App has mounted — clears the reload-once guard so a
 *  later chunk error in the same session can also trigger a reload. */
export function markChunkLoadSucceeded(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* no-op */
  }
}
