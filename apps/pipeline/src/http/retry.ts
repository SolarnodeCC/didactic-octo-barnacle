export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type BackoffOptions = {
  /** Total tries including the first one (REQ-DATA-001 AC3). */
  MaxAttempts: number;
  /** Delay before the second try; doubles for each later try. */
  BaseMs: number;
  Sleep: (ms: number) => Promise<void>;
};

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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
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
 * Fetch with exponential backoff (REQ-DATA-001 AC3). Network errors, 429, and 5xx
 * are retried up to `MaxAttempts`; other statuses fail at once. The caller records
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

  for (let attempt = 1; attempt <= options.MaxAttempts; attempt += 1) {
    let delayMs = options.BaseMs * 2 ** (attempt - 1);
    try {
      const response = await fetchFn(url, init);
      if (response.ok) {
        return response;
      }
      lastStatus = response.status;
      lastMessage = `HTTP ${response.status}`;
      if (!isRetryableStatus(response.status)) {
        throw new HttpRequestError(lastMessage, attempt, response.status);
      }
      delayMs = retryAfterMs(response) ?? delayMs;
    } catch (error) {
      if (error instanceof HttpRequestError) {
        throw error;
      }
      lastStatus = null;
      lastMessage = error instanceof Error ? error.message : String(error);
    }

    if (attempt < options.MaxAttempts) {
      await options.Sleep(delayMs);
    }
  }

  throw new HttpRequestError(
    `request failed after ${options.MaxAttempts} attempts: ${lastMessage}`,
    options.MaxAttempts,
    lastStatus,
  );
}
