/**
 * The slice of the Workers AI binding (`env.AI`) that `callModel` uses. The real binding
 * satisfies it structurally; tests use `FakeWorkersAi`.
 */
export type WorkersAiRunOptions = {
  gateway: {
    id: string;
    skipCache?: boolean;
    /** Custom metadata on the AI Gateway log entry: run, step, and agent (ADR 0054). */
    metadata?: Record<string, string | number>;
  };
};

export interface WorkersAiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options: WorkersAiRunOptions,
  ): Promise<unknown>;
  /** The AI Gateway log ID of the most recent `run`, when the gateway returned one. */
  readonly aiGatewayLogId?: string | null;
}

/**
 * An error a provider call can raise. `Status` is the HTTP status when known; a call with no
 * status (a network error or timeout) counts as retryable.
 */
export class ProviderCallError extends Error {
  readonly Status: number | null;
  readonly RetryAfterSeconds: number | null;

  constructor(message: string, status: number | null, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "ProviderCallError";
    this.Status = status;
    this.RetryAfterSeconds = retryAfterSeconds;
  }
}

/** What `callModel` needs to know about a failed provider call. */
export type ProviderFailure = {
  Status: number | null;
  Retryable: boolean;
  RetryAfterSeconds: number | null;
  Message: string;
};

function numberField(value: unknown, key: string): number | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

/**
 * Classify an error from the binding. A 429 or a 5xx is retried, and so is an error with no
 * status. Any other 4xx (a bad request, or 410 for a deprecated model) is not.
 */
export function classifyProviderError(error: unknown): ProviderFailure {
  const status =
    error instanceof ProviderCallError
      ? error.Status
      : (numberField(error, "status") ?? numberField(error, "statusCode"));
  const retryAfter =
    error instanceof ProviderCallError ? error.RetryAfterSeconds : numberField(error, "retryAfter");
  const message = error instanceof Error ? error.message : String(error);
  const retryable = status === null || status === 429 || status >= 500;
  return { Status: status, Retryable: retryable, RetryAfterSeconds: retryAfter, Message: message };
}

/** The text and token counts of a text-generation response, in either response shape. */
export type ParsedGeneration = {
  Output: unknown;
  InputTokens: number;
  OutputTokens: number;
  /** Input tokens served from the prompt cache, a part of `InputTokens` (ADR 0078). */
  CachedInputTokens: number;
};

/**
 * Read a Workers AI text-generation response. Models answer either `{ response, usage }` or
 * the OpenAI shape `{ choices: [{ message: { content } }], usage }`; with JSON-schema output
 * `response` may already be an object. Token counts default to zero when absent.
 * Cached input tokens come from `usage.prompt_tokens_details.cached_tokens` (the OpenAI shape
 * Workers AI uses) or `usage.input_tokens_details.cached_tokens`, and never exceed the input.
 */
export function parseGeneration(response: unknown): ParsedGeneration {
  const body = (response ?? {}) as Record<string, unknown>;
  let output: unknown = body.response;
  if (output === undefined && Array.isArray(body.choices)) {
    const first = body.choices[0] as { message?: { content?: unknown } } | undefined;
    output = first?.message?.content;
  }
  const usage = body.usage;
  const inputTokens =
    numberField(usage, "prompt_tokens") ?? numberField(usage, "input_tokens") ?? 0;
  const outputTokens =
    numberField(usage, "completion_tokens") ?? numberField(usage, "output_tokens") ?? 0;
  const details =
    usage !== null && typeof usage === "object"
      ? ((usage as Record<string, unknown>).prompt_tokens_details ??
        (usage as Record<string, unknown>).input_tokens_details)
      : undefined;
  const cached = Math.max(0, numberField(details, "cached_tokens") ?? 0);
  return {
    Output: output,
    InputTokens: inputTokens,
    OutputTokens: outputTokens,
    CachedInputTokens: Math.min(cached, inputTokens),
  };
}
