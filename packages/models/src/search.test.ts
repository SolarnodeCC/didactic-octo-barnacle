import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PriceTableSchema, searchCost, type PriceTable } from "./price-table.js";
import { SearchQuerySchema, SearchResultSchema } from "./search.js";

const table: PriceTable = {
  Version: "2026-11-28",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.25,
  ExchangeRateDate: "2026-11-09",
  Models: {},
  Search: { "tavily/search-basic": { UsdPerCall: 0.008 } },
};

describe("REQ-AGENT-013: search tool I/O and price", () => {
  it("REQ-AGENT-013: queries are 3 to 300 characters after trimming", () => {
    expect(SearchQuerySchema.safeParse("  ab ").success).toBe(false);
    expect(SearchQuerySchema.parse("  edge AI chips ")).toBe("edge AI chips");
    expect(SearchQuerySchema.safeParse("x".repeat(301)).success).toBe(false);
  });

  it("REQ-AGENT-013: a result is https, with a snippet of at most 500 characters", () => {
    const result = {
      Title: "A vendor",
      Url: "https://example.com/vendor",
      Snippet: "Sells the thing.",
      RetrievedAt: "2026-11-28T10:00:00.000Z",
    };
    expect(SearchResultSchema.parse(result)).toEqual(result);
    expect(SearchResultSchema.safeParse({ ...result, Url: "http://example.com" }).success).toBe(
      false,
    );
    expect(SearchResultSchema.safeParse({ ...result, Snippet: "x".repeat(501) }).success).toBe(
      false,
    );
  });

  it("REQ-NFR-011: AC2 a search call is priced per call from the table, in euro", () => {
    expect(searchCost(table, "tavily/search-basic")).toEqual({ Amount: 0.0064, Currency: "EUR" });
    expect(searchCost(table, "tavily/search-advanced")).toBeNull();
    expect(searchCost({ ...table, Search: undefined }, "tavily/search-basic")).toBeNull();
  });

  it("REQ-NFR-011: AC2 the price table rejects a negative search price", () => {
    expect(
      PriceTableSchema.safeParse({
        ...table,
        Search: { "tavily/search-basic": { UsdPerCall: -1 } },
      }).success,
    ).toBe(false);
  });

  it("REQ-NFR-011: AC2 the reviewed 2026-11-28 table prices the Tavily basic search (ADR 0126)", () => {
    const reviewed = PriceTableSchema.parse(
      JSON.parse(
        readFileSync(
          new URL("../../../infrastructure/cloudflare/prices/2026-11-28.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    expect(reviewed.Search?.["tavily/search-basic"]).toEqual({ UsdPerCall: 0.008 });
  });
});
