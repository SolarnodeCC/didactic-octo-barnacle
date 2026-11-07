import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const thisFile = fileURLToPath(import.meta.url);

/** Code roots of the workspace; generated and installed files are skipped. */
const ROOTS = ["apps", "agents", "packages", "infrastructure/cloudflare/src"];
const SKIP = new Set(["node_modules", "dist", "coverage", ".wrangler"]);

/**
 * Provider endpoints that would bypass AI Gateway (REQ-NFR-003 AC1), including the Workers AI
 * REST route, which skips the binding and its gateway option.
 */
const DIRECT_PROVIDER = [
  /api\.openai\.com/u,
  /api\.anthropic\.com/u,
  /generativelanguage\.googleapis\.com/u,
  /api\.mistral\.ai/u,
  /api\.cohere\.(ai|com)/u,
  /api\.groq\.com/u,
  /api\.together\.(xyz|ai)/u,
  /api\.deepseek\.com/u,
  /openrouter\.ai/u,
];

/**
 * The AI REST route on api.cloudflare.com reaches Workers AI directly unless the request names
 * a gateway, so a file that uses it must also send `cf-aig-gateway-id`.
 */
const AI_REST_ROUTE = /\/accounts\/[^/\s"'`]+\/ai\/run/u;
const GATEWAY_HEADER = /["']cf-aig-gateway-id["']/u;

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    if (SKIP.has(name)) {
      return [];
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx|js|mjs)$/u.test(name) && path !== thisFile ? [path] : [];
  });
}

describe("REQ-NFR-003: no component calls a model provider directly", () => {
  it("REQ-NFR-003: AC1 no source file names a provider endpoint that bypasses AI Gateway", () => {
    const files = ROOTS.flatMap((dir) => sourceFiles(join(root, dir)));
    expect(files.length).toBeGreaterThan(20);
    const hits = files.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      const hits = DIRECT_PROVIDER.filter((pattern) => pattern.test(text)).map(
        (pattern) => `${relative(root, file)}: ${pattern.source}`,
      );
      if (AI_REST_ROUTE.test(text) && !GATEWAY_HEADER.test(text)) {
        hits.push(`${relative(root, file)}: AI REST route without cf-aig-gateway-id`);
      }
      return hits;
    });
    expect(hits).toEqual([]);
  });
});
