export type RateLimiterOptions = {
  MinIntervalMs: number;
  Now: () => number;
  Sleep: (ms: number) => Promise<void>;
};

/** arXiv allows at most one request every 3 seconds (`arxiv.min_request_interval_ms`). */
export const ARXIV_MIN_REQUEST_INTERVAL_MS = 3000;

/**
 * Returns a function that resolves when the next request may start, so calls are
 * at least `MinIntervalMs` apart (REQ-DATA-002 AC4).
 */
export function createRateLimiter(options: RateLimiterOptions): () => Promise<void> {
  let nextSlot = 0;
  return async () => {
    const now = options.Now();
    const start = Math.max(now, nextSlot);
    nextSlot = start + options.MinIntervalMs;
    if (start > now) {
      await options.Sleep(start - now);
    }
  };
}
