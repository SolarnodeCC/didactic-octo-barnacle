import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PriceTableSchema } from "@roi/models";
import { describe, expect, it } from "vitest";

const pricesDir = join(dirname(fileURLToPath(import.meta.url)), "../prices");

/** Benchmark candidates of docs/kt/test/model-benchmark-plan.md and the embedding model. */
const PRICED_MODELS = [
  "@cf/zai-org/glm-4.7-flash",
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/deepseek-ai/deepseek-v4.1-flash-1017",
  "@cf/zai-org/glm-5.3",
  "@cf/baai/bge-base-en-v1.5",
];

describe("REQ-NFR-011: versioned price tables", () => {
  const files = readdirSync(pricesDir).filter((name) => name.endsWith(".json"));

  it("REQ-NFR-011: AC2 every price table parses and is named after its version", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const table = PriceTableSchema.parse(JSON.parse(readFileSync(join(pricesDir, file), "utf8")));
      expect(file).toBe(`${table.Version}.json`);
    }
  });

  it("REQ-NFR-011: AC2 the configured table prices every candidate and the embedding model", () => {
    // `model.price_table_version` in docs/kt/architecture/defaults.md.
    const table = PriceTableSchema.parse(
      JSON.parse(readFileSync(join(pricesDir, "2026-11-06.json"), "utf8")),
    );
    for (const model of PRICED_MODELS) {
      expect(table.Models[model], model).toBeDefined();
    }
  });
});
