import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildArxivUrl, fetchArxivPage } from "./client.js";
import { type FetchFn } from "../../http/retry.js";
import { SCOPE_ARXIV_CATEGORIES } from "../../normalize/scope.js";

const feed = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../fixtures/arxiv/feed.xml"),
  "utf8",
);

const backoff = { MaxAttempts: 3, BaseMs: 1, Sleep: () => Promise.resolve() };

describe("REQ-DATA-002: arXiv client", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("REQ-TEST-003: unexpected network fetch"))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REQ-DATA-002: queries every category of the topic map, the cross-industry ones first", () => {
    const query = new URL(buildArxivUrl({})).searchParams.get("search_query") ?? "";
    expect(query).toBe(SCOPE_ARXIV_CATEGORIES.map((category) => `cat:${category}`).join(" OR "));
    expect(query.startsWith("cat:cs.AI OR cat:cs.SE OR cat:cs.HC OR cat:cs.CY OR ")).toBe(true);
    expect(query).toContain("cat:cs.RO");
    expect(query).toContain("cat:q-fin.RM");
  });

  it("REQ-DATA-009: limits the query to preprints first submitted in the window, newest update first", () => {
    const url = new URL(
      buildArxivUrl({
        Categories: ["cs.AI", "cs.SE"],
        SubmittedFrom: "2026-08-07",
        SubmittedTo: "2026-11-05",
      }),
    );
    expect(url.searchParams.get("search_query")).toBe(
      "(cat:cs.AI OR cat:cs.SE) AND submittedDate:[202608070000 TO 202611052359]",
    );
    expect(url.searchParams.get("sortBy")).toBe("lastUpdatedDate");
    expect(url.searchParams.get("sortOrder")).toBe("descending");
  });

  it("REQ-DATA-002: keeps primary and cross-listed in-scope entries and drops the rest", async () => {
    const fetchFn: FetchFn = () => Promise.resolve(new Response(feed));
    const page = await fetchArxivPage(
      {},
      { Fetch: fetchFn, Backoff: backoff, WaitForSlot: () => Promise.resolve() },
    );
    expect(page.Entries.map((entry) => entry.id)).toEqual([
      "http://arxiv.org/abs/2410.00001v2",
      "http://arxiv.org/abs/2410.00002v1",
    ]);
    expect(page.OutOfScope).toBe(1);
    expect(page.Returned).toBe(3);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("REQ-DATA-002: waits for the rate limiter before every request, retries included", async () => {
    let waits = 0;
    const responses = [new Response("", { status: 503 }), new Response(feed)];
    const fetchFn: FetchFn = () => Promise.resolve(responses.shift() as Response);
    await fetchArxivPage(
      {},
      {
        Fetch: fetchFn,
        Backoff: backoff,
        WaitForSlot: () => {
          waits += 1;
          return Promise.resolve();
        },
      },
    );
    expect(waits).toBe(2);
  });
});
