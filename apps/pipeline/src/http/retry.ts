export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type BackoffOptions = {
  /** Total tries including the first one (REQ-DATA-001 AC3). */
  MaxAttempts: number;
  /** Delay before the second try; doubles for each later try. */
  BaseMs: number;
  Sleep: (ms: number) => Promise<void>;
  /** Limit for one request, so a hung upstream cannot hold the Worker (default 15 s). */
  RequestTimeoutMs?: number;
  /** Longest wait taken from `Retry-After` or the backoff (default 30 s). */
  MaxDelayMs?: number;
  /**
   * Default true. Set false for a POST that is not idempotent: only a 429, which proves the
   * request was refused, is retried. A 5xx, a timeout, or a network error may have been
   * processed already, and a retry would then duplicate it.
   */
  RetryAmbiguous?: boolean;
};

export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_DELAY_MS = 30_000;

export class HttpRequestError extends Error {
  constructor(
    message: string,
    readonly Attempts: number,
    readonly Status: number | null,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
}

function isRetryableStatus(status: number, retryAmbiguous: boolean): boolean {
  return status === 429 || (retryAmbiguous && (status === 408 || status >= 500));
}

/** Delay from a `Retry-After` header in seconds; HTTP dates are ignored. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) {
    return null;
  }
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

/**
 * Fetch with exponential backoff (REQ-DATA-001 AC3). Network errors, timeouts, 408, 429,
 * and 5xx are retried up to `MaxAttempts`; other statuses fail at once. Each request has
 * its own timeout and no wait is longer than `MaxDelayMs` (REQ-NFR-021). The caller records
 * an item that still fails and carries on with the rest of the run.
 */
export async function fetchWithBackoff(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit | undefined,
  options: BackoffOptions,
): Promise<Response> {
  let lastMessage = "no attempt made";
  let lastStatus: number | null = null;
  const timeoutMs = options.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxDelayMs = options.MaxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryAmbiguous = options.RetryAmbiguous ?? true;

  for (let attempt = 1; attempt <= options.MaxAttempts; attempt += 1) {
    let delayMs = options.BaseMs * 2 ** (attempt - 1);
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
      const response = await fetchFn(url, { ...init, signal });
      if (response.ok) {
        return response;
      }
      lastStatus = response.status;
      lastMessage = `HTTP ${response.status}`;
      await response.body?.cancel().catch(() => undefined);
      if (!isRetryableStatus(response.status, retryAmbiguous)) {
        throw new HttpRequestError(lastMessage, attempt, response.status);
      }
      delayMs = retryAfterMs(response) ?? delayMs;
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }
      lastStatus = null;
      lastMessage = error instanceof Error ? error.message : String(error);
      if (!retryAmbiguous) {
        throw new HttpRequestError(lastMessage, attempt, null);
      }
    }

    if (attempt < options.MaxAttempts) {
      await options.Sleep(Math.min(delayMs, maxDelayMs));
    }
  }

  throw new HttpRequestError(
    `request failed after ${options.MaxAttempts} attempts: ${lastMessage}`,
    options.MaxAttempts,
    lastStatus,
  );
}
