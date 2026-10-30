/**
 * Idempotent environment bootstrap plan (REQ-NFR-020, ADR 0020).
 * Live create/update calls need CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 * Without credentials the planner still reports the desired resources and drift.
 */

export type EnvironmentName = "local" | "preview" | "staging" | "production";

export type ResourceKind = "d1" | "r2" | "queue" | "queue-dlq" | "vectorize" | "ai-gateway";

export type DesiredResource = {
  Kind: ResourceKind;
  Name: string;
};

export type ExistingResource = DesiredResource;

export type DriftReport = {
  Environment: EnvironmentName;
  Missing: DesiredResource[];
  Extra: DesiredResource[];
  Ok: DesiredResource[];
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
    { Kind: "queue", Name: `roi-publications-${suffix}` },
    { Kind: "queue-dlq", Name: `roi-publications-dlq-${suffix}` },
    { Kind: "vectorize", Name: `roi-publications-${suffix}` },
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
  };
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
 * Plan or apply bootstrap. Apply creates only missing resources; a second run
 * creates nothing and reports no missing drift.
 */
export async function bootstrapEnvironment(options: {
  Environment: EnvironmentName;
  Mode: "plan" | "apply";
  Client?: ResourceClient;
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

  const after = reportDrift(options.Environment, await options.Client.list());
  return {
    Environment: options.Environment,
    Mode: "apply",
    Drift: after,
    Created: created,
    Message: `Applied ${created.length} resource(s) for ${options.Environment}; missing now ${after.Missing.length}.`,
  };
}

export function hasCloudflareCredentials(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID);
}
