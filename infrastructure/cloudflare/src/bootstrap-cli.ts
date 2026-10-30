#!/usr/bin/env node
import {
  bootstrapEnvironment,
  hasCloudflareCredentials,
  type EnvironmentName,
} from "./bootstrap.js";

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

  if (apply) {
    // The live Cloudflare API client is not implemented yet. Fail loudly instead of
    // reporting a plan as if resources had been applied.
    console.error(
      "Apply is not implemented: the live Cloudflare client has not been wired. Run without --apply to print the plan.",
    );
    process.exit(1);
  }

  const result = await bootstrapEnvironment({
    Environment: environment,
    Mode: "plan",
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
