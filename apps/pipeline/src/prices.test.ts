import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DEFAULT_PROCESSING_CONFIG } from "./processing-config.js";
import { PRICE_TABLE } from "./prices.js";

describe("REQ-NFR-011: the Worker's price table", () => {
  it("REQ-NFR-011: AC2 equals the reviewed table of the configured version", () => {
    const reviewed: unknown = JSON.parse(
      readFileSync(
        new URL(
          `../../../infrastructure/cloudflare/prices/${DEFAULT_PROCESSING_CONFIG.PriceTableVersion}.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(PRICE_TABLE).toEqual(reviewed);
    expect(PRICE_TABLE.Version).toBe(DEFAULT_PROCESSING_CONFIG.PriceTableVersion);
  });

  it("REQ-NFR-011: AC2 prices the configured triage model", () => {
    expect(PRICE_TABLE.Models[DEFAULT_PROCESSING_CONFIG.TriageModel.Model]).toBeDefined();
  });
});
