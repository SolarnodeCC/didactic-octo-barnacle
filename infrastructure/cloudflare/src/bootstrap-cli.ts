#!/usr/bin/env node
import {
  bootstrapEnvironment,
  hasCloudflareCredentials,
  type EnvironmentName,
} from "./bootstrap.js";
import { createCloudflareClient } from "./cloudflare-client.js";

const ENVIRONMENTS = new Set<EnvironmentName>(["local", "preview", "staging", "production"]);

export const BOOTSTRAP_USAGE =
  "Usage: roi-bootstrap --env <local|preview|staging|production> [--apply] [--fail-on-drift]";
export const APPLY_NEEDS_CREDENTIALS =
  "Apply requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (see docs/kt/operations.md).";

export type BootstrapArgs = { Environment: EnvironmentName; Apply: boolean; FailOnDrift: boolean };

/** The parsed arguments, or null when they do not match the usage line. */
export function parseBootstrapArgs(args: readonly string[]): BootstrapArgs | null {
  let environment: EnvironmentName | undefined;
  let apply = false;
  let failOnDrift = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--env") {
      const value = args[i + 1];
      i += 1;
      if (!value || !ENVIRONMENTS.has(value as EnvironmentName)) {
        return null;
      }
      environment = value as EnvironmentName;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--fail-on-drift") {
      failOnDrift = true;
    } else {
      return null;
    }
  }
  return environment ? { Environment: environment, Apply: apply, FailOnDrift: failOnDrift } : null;
}

export type BootstrapCliDeps = {
  Env: NodeJS.ProcessEnv;
  Log: (line: string) => void;
  Error: (line: string) => void;
  Bootstrap?: typeof bootstrapEnvironment;
  CreateClient?: typeof createCloudflareClient;
};

/**
 * Runs the CLI and returns its exit code: 0 on success, 1 on failure, 2 on bad usage, and 3
 * when `--fail-on-drift` is set and resources are missing.
 */
export async function runBootstrapCli(
  args: readonly string[],
  deps: BootstrapCliDeps,
): Promise<number> {
  const parsed = parseBootstrapArgs(args);
  if (!parsed) {
    deps.Error(BOOTSTRAP_USAGE);
    return 2;
  }
  const hasCredentials = hasCloudflareCredentials(deps.Env);
  if (parsed.Apply && !hasCredentials) {
    deps.Error(APPLY_NEEDS_CREDENTIALS);
    return 1;
  }

  // With credentials the plan reads the real account; applying creates what is missing.
  // Without them, only the desired resources are printed.
  const createClient = deps.CreateClient ?? createCloudflareClient;
  const client = hasCredentials
    ? createClient({
        AccountId: deps.Env.CLOUDFLARE_ACCOUNT_ID as string,
        ApiToken: deps.Env.CLOUDFLARE_API_TOKEN as string,
      })
    : undefined;

  const result = await (deps.Bootstrap ?? bootstrapEnvironment)({
    Environment: parsed.Environment,
    Mode: parsed.Apply ? "apply" : "plan",
    ...(client ? { Client: client } : {}),
  });
  deps.Log(JSON.stringify(result, null, 2));

  // The automated staging pipeline stops before the deploy when resources are missing (REQ-NFR-020).
  if (parsed.FailOnDrift && result.Drift.Missing.length > 0) {
    deps.Error(
      `Missing resources: ${result.Drift.Missing.length}. Run Staging bootstrap with apply.`,
    );
    return 3;
  }
  return 0;
}

if (process.argv[1]?.endsWith("bootstrap-cli.js")) {
  runBootstrapCli(process.argv.slice(2), {
    Env: process.env,
    Log: (line) => console.log(line),
    Error: (line) => console.error(line),
  })
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
