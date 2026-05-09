export class FeatureUnavailableError extends Error {
  constructor(message = 'feature_unavailable') {
    super(message);
    this.name = 'FeatureUnavailableError';
  }
}

export function is404(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const r = (err as { response?: { status?: number } }).response;
  return r?.status === 404;
}
