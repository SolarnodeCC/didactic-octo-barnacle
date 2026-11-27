/**
 * Idempotent environment bootstrap plan (REQ-NFR-020, ADR 0020).
 * Live create/update calls need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 * Without credentials the planner still reports the desired resources and drift.
 */

export type EnvironmentName = "local" | "preview" | "staging" | "production";

export type ResourceKind =
  "d1" | "r2" | "queue" | "queue-dlq" | "vectorize" | "vectorize-metadata-index" | "ai-gateway";

/**
 * The metadata indexes of the publication vectors and their types (ADR 0056, REQ-PROC-002 AC1).
 * Vectorize indexes only vectors written after a metadata index exists, so bootstrap creates
 * them right after the index, before the first write. A resource name is
 * `<property>@<index name>`.
 */
export const PUBLICATION_METADATA_INDEXES = { source: "string", published_day: "number" } as const;

/** `source@roi-publications-staging` becomes its index name and property. */
export function parseMetadataIndexName(name: string): { Index: string; Property: string } {
  const at = name.indexOf("@");
  return { Property: name.slice(0, at), Index: name.slice(at + 1) };
}

export type DesiredResource = {
  Kind: ResourceKind;
  Name: string;
};

export type ExistingResource = DesiredResource & {
  /**
   * AI Gateways only: whether Authenticated Gateway is on. The Cloudflare client reports
   * `false` unless the API says `true`, so an unknown setting counts as off (ADR 0120).
   */
  Authenticated?: boolean;
};

export type DriftReport = {
  Environment: EnvironmentName;
  Missing: DesiredResource[];
  Extra: DesiredResource[];
  Ok: DesiredResource[];
  /**
   * AI Gateways of this environment that exist with Authenticated Gateway off. Anyone with
   * access to the account could then spend through them without a gateway token
   * (REQ-NFR-003, ADR 0120). Bootstrap does not turn it on: once on, Cloudflare does not
   * let it be turned off, so the owner does it in the dashboard.
   */
  Unauthenticated: DesiredResource[];
};

/**
 * Resources the bootstrap script creates. Durable Object namespaces are not in
 * this list: Cloudflare creates them when a Worker with a Durable Object class
 * is deployed (ADR 0027).
 */
export function desiredResources(environment: EnvironmentName): DesiredResource[] {
  const suffix = environment === "local" ? "local" : environment;
  return [
    { Kind: "d1", Name: `roi-${suffix}` },
    { Kind: "r2", Name: `roi-documents-${suffix}` },
    // Private store for recorded search results (ADR 0039, REQ-AGENT-013).
    { Kind: "r2", Name: `roi-search-fixtures-${suffix}` },
    { Kind: "queue", Name: `roi-publications-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-publications-dlq-${suffix}` },
    // PDF downloads, consumed apart from the pages (ADR 0047).
    { Kind: "queue", Name: `roi-documents-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-documents-dlq-${suffix}` },
    // Text extraction of stored PDFs, one file at a time (ADR 0009, ADR 0053).
    { Kind: "queue", Name: `roi-texts-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-texts-dlq-${suffix}` },
    // Model steps, at most 8 in flight (ADR 0053).
    { Kind: "queue", Name: `roi-models-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-models-dlq-${suffix}` },
    // Embeddings, 50 per batch (ADR 0053).
    { Kind: "queue", Name: `roi-embeddings-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-embeddings-dlq-${suffix}` },
    { Kind: "vectorize", Name: `roi-publications-${suffix}` },
    ...Object.keys(PUBLICATION_METADATA_INDEXES).map((property): DesiredResource => ({
      Kind: "vectorize-metadata-index",
      Name: `${property}@roi-publications-${suffix}`,
    })),
    { Kind: "ai-gateway", Name: `roi-${suffix}` },
  ];
}

function keyOf(resource: DesiredResource): string {
  return `${resource.Kind}:${resource.Name}`;
}

export function reportDrift(
  environment: EnvironmentName,
  allExisting: ExistingResource[],
): DriftReport {
  let existing = allExisting;
  const desired = desiredResources(environment);
  // Resources of other environments (`roi-staging` while planning `preview`) are not drift.
  existing = existing.filter((resource) => resource.Name.endsWith(`-${environment}`));
  const existingKeys = new Set(existing.map(keyOf));
  const desiredKeys = new Set(desired.map(keyOf));

  return {
    Environment: environment,
    Missing: desired.filter((resource) => !existingKeys.has(keyOf(resource))),
    Extra: existing.filter((resource) => !desiredKeys.has(keyOf(resource))),
    Ok: desired.filter((resource) => existingKeys.has(keyOf(resource))),
    Unauthenticated: existing
      .filter(
        (resource) =>
          resource.Kind === "ai-gateway" &&
          desiredKeys.has(keyOf(resource)) &&
          resource.Authenticated === false,
      )
      .map(({ Kind, Name }) => ({ Kind, Name })),
  };
}

/** True when drift should stop a deploy: a resource is missing or a gateway is open. */
export function hasBlockingDrift(drift: DriftReport): boolean {
  return drift.Missing.length > 0 || drift.Unauthenticated.length > 0;
}

export type BootstrapResult = {
  Environment: EnvironmentName;
  Mode: "plan" | "apply";
  Drift: DriftReport;
  Created: DesiredResource[];
  Message: string;
};

export type ResourceClient = {
  list(): Promise<ExistingResource[]>;
  create(resource: DesiredResource): Promise<void>;
};

/**
 * How long apply waits for new Vectorize metadata indexes to be listed, and how often it
 * looks. Vectorize applies `metadata_index/create` as an asynchronous mutation: the create
 * call succeeds at once, but the index appears in `metadata_index/list` only after the
 * mutation is processed, which took up to about 3.5 minutes on staging (REQ-NFR-020).
 */
export const METADATA_INDEX_WAIT_MS = 300_000;
export const METADATA_INDEX_POLL_MS = 10_000;

export type WaitOptions = {
  TimeoutMs?: number;
  IntervalMs?: number;
  Sleep?: (ms: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Plan or apply bootstrap. Apply creates only missing resources; a second run
 * creates nothing and reports no missing drift. After creating a Vectorize metadata
 * index, apply lists again until the index is reported, for at most `Wait.TimeoutMs`;
 * one still not listed then stays in `Drift.Missing`.
 */
export async function bootstrapEnvironment(options: {
  Environment: EnvironmentName;
  Mode: "plan" | "apply";
  Client?: ResourceClient;
  Wait?: WaitOptions;
}): Promise<BootstrapResult> {
  const existing = options.Client ? await options.Client.list() : [];
  const drift = reportDrift(options.Environment, existing);

  if (options.Mode === "plan" || !options.Client) {
    return {
      Environment: options.Environment,
      Mode: "plan",
      Drift: drift,
      Created: [],
      Message:
        options.Client === undefined
          ? "No Cloudflare client configured; planned resources only (set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to apply)."
          : `Plan for ${options.Environment}: ${drift.Missing.length} missing, ${drift.Extra.length} extra.`,
    };
  }

  const created: DesiredResource[] = [];
  for (const resource of drift.Missing) {
    await options.Client.create(resource);
    created.push(resource);
  }

  const pending = new Set(
    created.filter((resource) => resource.Kind === "vectorize-metadata-index").map(keyOf),
  );
  const timeoutMs = options.Wait?.TimeoutMs ?? METADATA_INDEX_WAIT_MS;
  const intervalMs = options.Wait?.IntervalMs ?? METADATA_INDEX_POLL_MS;
  const sleepFn = options.Wait?.Sleep ?? sleep;
  // One list when no metadata index was created; otherwise poll a bounded number of times.
  const waits = pending.size === 0 ? 0 : Math.max(1, Math.ceil(timeoutMs / intervalMs));
  const stillPending = (drift: DriftReport) =>
    drift.Missing.filter((resource) => pending.has(keyOf(resource)));

  let after = reportDrift(options.Environment, await options.Client.list());
  for (let attempt = 0; attempt < waits && stillPending(after).length > 0; attempt += 1) {
    await sleepFn(intervalMs);
    after = reportDrift(options.Environment, await options.Client.list());
  }

  const unlisted = stillPending(after).length;
  const waitNote =
    pending.size === 0
      ? ""
      : unlisted === 0
        ? ` (waited for ${pending.size} metadata index(es))`
        : ` (${unlisted} metadata index(es) not listed after ${Math.round((waits * intervalMs) / 1000)} s)`;
  return {
    Environment: options.Environment,
    Mode: "apply",
    Drift: after,
    Created: created,
    Message: `Applied ${created.length} resource(s) for ${options.Environment}; missing now ${after.Missing.length}${waitNote}.`,
  };
}

export function hasCloudflareCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}
