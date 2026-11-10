import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PriceTableSchema } from "@roi/models";
import { describe, expect, it } from "vitest";

const pricesDir = join(dirname(fileURLToPath(import.meta.url)), "../prices");

/** `model.price_table_version` in docs/kt/architecture/defaults.md (ADR 0078). */
const CONFIGURED_VERSION = "2026-11-10";

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
      JSON.parse(readFileSync(join(pricesDir, `${CONFIGURED_VERSION}.json`), "utf8")),
    );
    for (const model of PRICED_MODELS) {
      expect(table.Models[model], model).toBeDefined();
    }
  });

  it("REQ-NFR-011: AC2 the configured table has the cached-input prices of the price list (ADR 0078)", () => {
    const table = PriceTableSchema.parse(
      JSON.parse(readFileSync(join(pricesDir, `${CONFIGURED_VERSION}.json`), "utf8")),
    );
    expect(table.Models["@cf/deepseek-ai/deepseek-v4.1-flash-1017"]).toEqual({
      InputUsdPerMillionTokens: 0.3,
      CachedInputUsdPerMillionTokens: 0.006,
      OutputUsdPerMillionTokens: 1.2,
    });
    expect(table.Models["@cf/zai-org/glm-5.3"]?.CachedInputUsdPerMillionTokens).toBe(0.26);
    // Models the price list gives no cached price keep none.
    for (const model of ["@cf/zai-org/glm-4.7-flash", "@cf/google/gemma-4-26b-a4b-it"]) {
      expect(table.Models[model]?.CachedInputUsdPerMillionTokens, model).toBeUndefined();
    }
  });

  it("REQ-NFR-011: AC2 a published table never changes, so old records keep their cost basis", () => {
    // Records name the version they were priced with; 2026-11-06 predates cached prices.
    const old = PriceTableSchema.parse(
      JSON.parse(readFileSync(join(pricesDir, "2026-11-06.json"), "utf8")),
    );
    expect(old.Version).toBe("2026-11-06");
    expect(old.UsdPerEur).toBe(1.1165);
    for (const price of Object.values(old.Models)) {
      expect(price.CachedInputUsdPerMillionTokens).toBeUndefined();
    }
  });
});
