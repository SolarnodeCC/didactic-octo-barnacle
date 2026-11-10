import { ProviderCallError, type WorkersAiBinding, type WorkersAiRunOptions } from "@roi/models";

/**
 * A `WorkersAiBinding` for a command line run, outside a Worker: the AI REST API on
 * api.cloudflare.com with the `cf-aig-gateway-id` header, so every call goes through the named
 * AI Gateway (REQ-NFR-003) and is logged there with its run, step, and agent metadata.
 * Without that header Workers AI would be called directly, so the header is always sent.
 *
 * With `Stream`, the call uses the per-model route with `stream: true` and rebuilds the
 * OpenAI-shaped response from the server-sent events. A reasoning model can take more than a
 * minute before its first answer token, and an HTTPS proxy between the command and Cloudflare
 * may close a request that has no response after about 30 seconds; a stream starts at once.
 * The rebuilt response has the same fields `parseGeneration` reads, so `callModel` and the
 * usage records see no difference.
 */
export type GatewayRestOptions = {
  AccountId: string;
  /** A Cloudflare API token with the Workers AI Read permission; never logged. */
  ApiToken: string;
  /** Shortest time between two calls, so a paid model's limit of 20 per minute holds. */
  MinIntervalMs: number;
  TimeoutMs: number;
  /** Stream the response (server-sent events) instead of waiting for the whole body. */
  Stream?: boolean;
  Fetch?: typeof fetch;
  Sleep?: (ms: number) => Promise<void>;
  Now?: () => number;
};

const API_BASE = "https://api.cloudflare.com/client/v4";

type Envelope = {
  success?: boolean;
  result?: unknown;
  errors?: Array<{ code?: number; message?: string }>;
};

function retryAfterSeconds(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

type StreamChoice = {
  delta?: { content?: unknown; reasoning?: unknown; reasoning_content?: unknown };
  finish_reason?: unknown;
};

type StreamEvent = {
  response?: unknown;
  choices?: StreamChoice[];
  usage?: Record<string, unknown>;
  error?: unknown;
  errors?: Array<{ code?: number; message?: string }>;
};

function tokenTotal(usage: Record<string, unknown>): number {
  const total = usage.total_tokens;
  if (typeof total === "number") {
    return total;
  }
  const input = typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : 0;
  const output = typeof usage.completion_tokens === "number" ? usage.completion_tokens : 0;
  return input + output;
}

/**
 * Rebuilds one response from the `data:` lines of a Workers AI stream. Models stream either
 * OpenAI chunks (`choices[].delta`) or `{ response }` pieces; some send per-chunk usage and a
 * final event with the totals, so the usage with the largest total is kept, as a whole object.
 * Its `prompt_tokens_details` (the cached input tokens, ADR 0078) comes with it; when that event
 * has none, the details of an earlier event are kept. An error event becomes a retryable
 * provider error.
 */
export function assembleEventStream(text: string): Record<string, unknown> {
  let content = "";
  let reasoning = "";
  let response = "";
  let sawChoices = false;
  let finishReason: unknown = null;
  let usage: Record<string, unknown> | null = null;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) {
      continue;
    }
    const data = line.slice("data:".length).trim();
    if (data === "" || data === "[DONE]") {
      continue;
    }
    let event: StreamEvent;
    try {
      event = JSON.parse(data) as StreamEvent;
    } catch {
      throw new ProviderCallError("unreadable stream event", 502);
    }
    if (event.error !== undefined || (event.errors?.length ?? 0) > 0) {
      const message =
        event.errors?.map((e) => e.message ?? `code ${String(e.code)}`).join("; ") ||
        (typeof event.error === "string" ? event.error : JSON.stringify(event.error));
      throw new ProviderCallError(message, 502);
    }
    if (typeof event.response === "string") {
      response += event.response;
    }
    for (const choice of event.choices ?? []) {
      sawChoices = true;
      const delta = choice.delta ?? {};
      if (typeof delta.content === "string") {
        content += delta.content;
      }
      const thought = delta.reasoning_content ?? delta.reasoning;
      if (typeof thought === "string") {
        reasoning += thought;
      }
      if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
        finishReason = choice.finish_reason;
      }
    }
    if (
      event.usage !== undefined &&
      (usage === null || tokenTotal(event.usage) >= tokenTotal(usage))
    ) {
      const details: unknown = (usage as Record<string, unknown> | null)?.prompt_tokens_details;
      usage =
        event.usage.prompt_tokens_details === undefined && details !== undefined
          ? { ...event.usage, prompt_tokens_details: details }
          : event.usage;
    }
  }
  const usageField = usage === null ? {} : { usage };
  if (!sawChoices) {
    return { response, ...usageField };
  }
  return {
    choices: [
      {
        index: 0,
        message: { role: "assistant", content, reasoning: reasoning === "" ? null : reasoning },
        finish_reason: finishReason,
      },
    ],
    ...usageField,
  };
}

export class GatewayRestBinding implements WorkersAiBinding {
  aiGatewayLogId: string | null = null;
  private lastCallAt = Number.NEGATIVE_INFINITY;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly options: GatewayRestOptions) {
    if (!/^[0-9a-f]{32}$/iu.test(options.AccountId)) {
      throw new Error("CLOUDFLARE_ACCOUNT_ID must be the 32-character hexadecimal account ID");
    }
    if (options.ApiToken.trim() === "" || /\s/u.test(options.ApiToken)) {
      throw new Error("CLOUDFLARE_API_TOKEN is empty or contains whitespace");
    }
    this.fetchFn = options.Fetch ?? fetch;
    this.sleep = options.Sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = options.Now ?? Date.now;
  }

  async run(
    model: string,
    inputs: Record<string, unknown>,
    options: WorkersAiRunOptions,
  ): Promise<unknown> {
    const wait = this.lastCallAt + this.options.MinIntervalMs - this.now();
    if (wait > 0) {
      await this.sleep(wait);
    }
    this.lastCallAt = this.now();
    this.aiGatewayLogId = null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.options.ApiToken}`,
      "Content-Type": "application/json",
      "cf-aig-gateway-id": options.gateway.id,
      // Each of the three runs per item must be a fresh sample, never a cached answer.
      "cf-aig-skip-cache": "true",
    };
    if (options.gateway.metadata !== undefined) {
      headers["cf-aig-metadata"] = JSON.stringify(options.gateway.metadata);
    }
    const stream = this.options.Stream === true;
    // The streamed route names the model in the path, as Cloudflare documents it.
    const url = stream
      ? `${API_BASE}/accounts/${this.options.AccountId}/ai/run/${model}`
      : `${API_BASE}/accounts/${this.options.AccountId}/ai/run`;
    const signal = AbortSignal.timeout(this.options.TimeoutMs);
    const response = await this.fetchFn(url, {
      method: "POST",
      headers,
      body: JSON.stringify(stream ? { ...inputs, stream: true } : { model, input: inputs }),
      signal,
    });
    this.aiGatewayLogId = response.headers.get("cf-aig-log-id");
    if (
      stream &&
      response.ok &&
      (response.headers.get("content-type") ?? "").includes("text/event-stream")
    ) {
      return assembleEventStream(await response.text());
    }
    let body: Envelope | null;
    try {
      body = (await response.json()) as Envelope;
    } catch {
      body = null;
    }
    if (!response.ok || body === null || body.success === false) {
      const message =
        body?.errors?.map((error) => error.message ?? `code ${String(error.code)}`).join("; ") ||
        response.statusText ||
        "request failed";
      throw new ProviderCallError(
        message,
        response.ok ? 502 : response.status,
        retryAfterSeconds(response.headers.get("retry-after")),
      );
    }
    return body.result;
  }
}

/** Stores one object in R2 through the Cloudflare API, for the raw responses of a run. */
export async function putR2Object(options: {
  AccountId: string;
  ApiToken: string;
  Bucket: string;
  Key: string;
  Body: string;
  Fetch?: typeof fetch;
}): Promise<void> {
  const fetchFn = options.Fetch ?? fetch;
  const key = options.Key.split("/").map(encodeURIComponent).join("/");
  const response = await fetchFn(
    `${API_BASE}/accounts/${options.AccountId}/r2/buckets/${encodeURIComponent(options.Bucket)}/objects/${key}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${options.ApiToken}`,
        "Content-Type": "application/x-ndjson",
      },
      body: options.Body,
    },
  );
  if (!response.ok) {
    throw new Error(`R2 upload of ${options.Key} failed with HTTP ${response.status}`);
  }
}
