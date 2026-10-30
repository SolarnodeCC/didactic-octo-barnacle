#!/usr/bin/env node
import {
  bootstrapEnvironment,
  hasCloudflareCredentials,
  type EnvironmentName,
} from "./bootstrap.js";
import { createCloudflareClient } from "./cloudflare-client.js";

const ENVIRONMENTS = new Set<EnvironmentName>(["local", "preview", "staging", "production"]);

function usage(): never {
  console.error("Usage: roi-bootstrap --env <local|preview|staging|production> [--apply]");
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let environment: EnvironmentName | undefined;
  let apply = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--env") {
      const value = args[i + 1];
      i += 1;
      if (!value || !ENVIRONMENTS.has(value as EnvironmentName)) {
        usage();
      }
      environment = value as EnvironmentName;
    } else if (arg === "--apply") {
      apply = true;
    } else {
      usage();
    }
  }

  if (!environment) {
    usage();
  }

  if (apply && !hasCloudflareCredentials()) {
    console.error(
      "Apply requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (see docs/kt/operations.md).",
    );
    process.exit(1);
  }

  // With credentials the plan reads the real account; applying creates what is missing.
  // Without them, only the desired resources are printed.
  const client = hasCloudflareCredentials()
    ? createCloudflareClient({
        AccountId: process.env.CLOUDFLARE_ACCOUNT_ID as string,
        ApiToken: process.env.CLOUDFLARE_API_TOKEN as string,
      })
    : undefined;

  const result = await bootstrapEnvironment({
    Environment: environment,
    Mode: apply ? "apply" : "plan",
    ...(client ? { Client: client } : {}),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
