import { describe, expect, it, vi } from "vitest";

import { type bootstrapEnvironment } from "./bootstrap.js";
import {
  APPLY_NEEDS_CREDENTIALS,
  BOOTSTRAP_USAGE,
  parseBootstrapArgs,
  runBootstrapCli,
} from "./bootstrap-cli.js";
import { type createCloudflareClient } from "./cloudflare-client.js";

// Dummy values: they only prove that the CLI hands the environment to the client.
const CREDENTIALS = {
  CLOUDFLARE_ACCOUNT_ID: "test-account-id",
  CLOUDFLARE_API_TOKEN: "test-api-token",
};

function harness(env: NodeJS.ProcessEnv = {}) {
  const logs: string[] = [];
  const errors: string[] = [];
  const client = { list: vi.fn(), create: vi.fn() };
  const createClient = vi.fn(() => client) as unknown as typeof createCloudflareClient;
  const bootstrap = vi.fn((options: Parameters<typeof bootstrapEnvironment>[0]) =>
    Promise.resolve({ Environment: options.Environment, Mode: options.Mode, Drift: {} }),
  ) as unknown as typeof bootstrapEnvironment;
  const deps = {
    Env: env,
    Log: (line: string) => logs.push(line),
    Error: (line: string) => errors.push(line),
    Bootstrap: bootstrap,
    CreateClient: createClient,
  };
  return { deps, logs, errors, client, createClient, bootstrap };
}

describe("REQ-NFR-020: bootstrap CLI", () => {
  it("REQ-NFR-020: parses --env and --apply", () => {
    expect(parseBootstrapArgs(["--env", "staging"])).toEqual({
      Environment: "staging",
      Apply: false,
    });
    expect(parseBootstrapArgs(["--apply", "--env", "preview"])).toEqual({
      Environment: "preview",
      Apply: true,
    });
  });

  it.each([
    [[]],
    [["--env"]],
    [["--env", "dev"]],
    [["--apply"]],
    [["--env", "staging", "--force"]],
  ])("REQ-NFR-020: refuses arguments that do not match the usage line: %j", async (args) => {
    const h = harness();

    expect(await runBootstrapCli(args, h.deps)).toBe(2);
    expect(h.errors).toEqual([BOOTSTRAP_USAGE]);
    expect(h.bootstrap).not.toHaveBeenCalled();
  });

  it("REQ-NFR-020: without credentials a plan lists the desired resources and calls no API", async () => {
    const h = harness();

    expect(await runBootstrapCli(["--env", "staging"], h.deps)).toBe(0);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.bootstrap).toHaveBeenCalledWith({ Environment: "staging", Mode: "plan" });
    expect(JSON.parse(h.logs[0] as string)).toMatchObject({ Environment: "staging", Mode: "plan" });
  });

  it("REQ-NFR-020: --apply without credentials stops before any change", async () => {
    const h = harness({ CLOUDFLARE_ACCOUNT_ID: "test-account-id" });

    expect(await runBootstrapCli(["--env", "staging", "--apply"], h.deps)).toBe(1);
    expect(h.errors).toEqual([APPLY_NEEDS_CREDENTIALS]);
    expect(h.bootstrap).not.toHaveBeenCalled();
  });

  it("REQ-NFR-020: with credentials --apply uses the account client and prints no secret", async () => {
    const h = harness(CREDENTIALS);

    expect(await runBootstrapCli(["--env", "production", "--apply"], h.deps)).toBe(0);
    expect(h.createClient).toHaveBeenCalledWith({
      AccountId: "test-account-id",
      ApiToken: "test-api-token",
    });
    expect(h.bootstrap).toHaveBeenCalledWith({
      Environment: "production",
      Mode: "apply",
      Client: h.client,
    });
    expect(h.logs.join("\n")).not.toContain("test-api-token");
  });
});
