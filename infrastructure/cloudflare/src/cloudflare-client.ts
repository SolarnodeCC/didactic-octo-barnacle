import {
  type DesiredResource,
  type EnvironmentName,
  type ExistingResource,
  type ResourceClient,
  type ResourceKind,
} from "./bootstrap.js";

/** Vectorize index settings; both are fixed once the index exists (ADR 0027). */
export const VECTORIZE_DIMENSIONS = 768;
export const VECTORIZE_METRIC = "cosine";

/** Every resource this project creates is named `roi-...`; other names are not ours. */
const PROJECT_PREFIX = "roi-";
const PAGE_SIZE = 100;

export type CloudflareClientOptions = {
  AccountId: string;
  /** Bearer token; never logged and never part of an error message. */
  ApiToken: string;
  Fetch?: typeof fetch;
};

type ApiEnvelope<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: { total_pages?: number };
};

/** A credential has the wrong shape; raised before any request is made. */
export class CloudflareConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudflareConfigError";
  }
}

/**
 * Checks the account ID and token before the first request. A wrong account ID
 * otherwise shows up as a vague 404 ("could not route"). Only lengths are named in
 * the messages, never the values.
 */
export function normalizeCredentials(input: { AccountId: string; ApiToken: string }): {
  AccountId: string;
  ApiToken: string;
} {
  const accountId = input.AccountId.trim();
  const apiToken = input.ApiToken.trim();
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    throw new CloudflareConfigError(
      `CLOUDFLARE_ACCOUNT_ID must be the 32-character hexadecimal account ID from the Cloudflare dashboard, without quotes or spaces (got ${accountId.length} characters).`,
    );
  }
  if (apiToken.length === 0 || /\s/.test(apiToken)) {
    throw new CloudflareConfigError(
      "CLOUDFLARE_API_TOKEN is empty or contains whitespace; paste the token without spaces or line breaks.",
    );
  }
  return { AccountId: accountId, ApiToken: apiToken };
}

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    readonly Status: number,
  ) {
    super(message);
    this.name = "CloudflareApiError";
  }
}

/** Kinds this client can create. Durable Object namespaces come from a Worker deploy (ADR 0027). */
export const CREATABLE_KINDS: readonly ResourceKind[] = [
  "d1",
  "r2",
  "queue",
  "queue-dlq",
  "vectorize",
  "ai-gateway",
];

function isDeadLetterQueue(name: string): boolean {
  return name.startsWith("roi-publications-dlq-");
}

/**
 * Cloudflare REST client behind the bootstrap script (REQ-NFR-020, ADR 0020).
 * `list` only reports `roi-` resources, so other projects in the account never
 * show up as drift. `create` only makes what is missing; the script decides that.
 */
export function createCloudflareClient(options: CloudflareClientOptions): ResourceClient {
  const fetchFn = options.Fetch ?? fetch;
  const credentials = normalizeCredentials(options);
  const base = `https://api.cloudflare.com/client/v4/accounts/${credentials.AccountId}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetchFn(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${credentials.ApiToken}`,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    let envelope: ApiEnvelope<T> | undefined;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      envelope = undefined;
    }
    if (!response.ok || !envelope?.success) {
      const reason = envelope?.errors?.map((e) => e.message ?? String(e.code)).join("; ");
      throw new CloudflareApiError(
        `${method} ${path} failed with HTTP ${response.status}${reason ? `: ${reason}` : ""}`,
        response.status,
      );
    }
    return envelope.result as T;
  }

  /** Reads all pages of a list endpoint with `page` and `per_page`. */
  async function listPages<T>(path: string, pick: (result: unknown) => T[]): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
      const result = await call<unknown>("GET", `${path}?page=${page}&per_page=${PAGE_SIZE}`);
      const batch = pick(result);
      items.push(...batch);
      if (batch.length < PAGE_SIZE) {
        return items;
      }
    }
  }

  const named = (key: string) => (result: unknown) =>
    ((result as Array<Record<string, string>>) ?? []).map((item) => item[key] ?? "");

  return {
    async list(): Promise<ExistingResource[]> {
      const found: ExistingResource[] = [];
      const add = (kind: ResourceKind, names: string[]) => {
        for (const name of names.filter((n) => n.startsWith(PROJECT_PREFIX))) {
          found.push({ Kind: kind, Name: name });
        }
      };

      add("d1", await listPages("/d1/database", named("name")));
      add(
        "r2",
        await listPages("/r2/buckets", (result) =>
          ((result as { buckets?: Array<{ name: string }> }).buckets ?? []).map((b) => b.name),
        ),
      );
      const queues = await listPages("/queues", named("queue_name"));
      add(
        "queue",
        queues.filter((name) => !isDeadLetterQueue(name)),
      );
      add("queue-dlq", queues.filter(isDeadLetterQueue));
      add("vectorize", await listPages("/vectorize/v2/indexes", named("name")));
      add("ai-gateway", await listPages("/ai-gateway/gateways", named("id")));
      return found;
    },

    async create(resource: DesiredResource): Promise<void> {
      switch (resource.Kind) {
        case "d1":
          await call("POST", "/d1/database", { name: resource.Name });
          return;
        case "r2":
          await call("POST", "/r2/buckets", { name: resource.Name });
          return;
        case "queue":
        case "queue-dlq":
          await call("POST", "/queues", { queue_name: resource.Name });
          return;
        case "vectorize":
          await call("POST", "/vectorize/v2/indexes", {
            name: resource.Name,
            config: { dimensions: VECTORIZE_DIMENSIONS, metric: VECTORIZE_METRIC },
          });
          return;
        case "ai-gateway":
          await call("POST", "/ai-gateway/gateways", {
            id: resource.Name,
            cache_ttl: 0,
            cache_invalidate_on_update: false,
            collect_logs: true,
            rate_limiting_interval: 0,
            rate_limiting_limit: 0,
          });
          return;
        default:
          throw new CloudflareApiError(
            `${resource.Kind} cannot be created by the bootstrap script`,
            0,
          );
      }
    },
  };
}

export type { EnvironmentName };
