import { ProviderCallError, type WorkersAiBinding, type WorkersAiRunOptions } from "@roi/models";

/**
 * A `WorkersAiBinding` for a command line run, outside a Worker: the AI REST API on
 * api.cloudflare.com with the `cf-aig-gateway-id` header, so every call goes through the named
 * AI Gateway (REQ-NFR-003) and is logged there with its run, step, and agent metadata.
 * Without that header Workers AI would be called directly, so the header is always sent.
 */
export type GatewayRestOptions = {
  AccountId: string;
  /** A Cloudflare API token with the Workers AI Read permission; never logged. */
  ApiToken: string;
  /** Shortest time between two calls, so a paid model's limit of 20 per minute holds. */
  MinIntervalMs: number;
  TimeoutMs: number;
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
    const response = await this.fetchFn(`${API_BASE}/accounts/${this.options.AccountId}/ai/run`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input: inputs }),
      signal: AbortSignal.timeout(this.options.TimeoutMs),
    });
    this.aiGatewayLogId = response.headers.get("cf-aig-log-id");
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
