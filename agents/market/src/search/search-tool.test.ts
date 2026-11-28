import {
  ModelCallRecordSchema,
  type ModelCallRecord,
  type ModelUsageStore,
  type PriceTable,
} from "@roi/models";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEARCH_CONFIG,
  createSearchTool,
  searchModelName,
  type SearchRun,
  type SearchToolDeps,
} from "./search-tool.js";
import {
  MAX_RESPONSE_BYTES,
  SearchProviderError,
  TAVILY_SEARCH_URL,
  tavilySearch,
} from "./tavily.js";

const KEY = "tvly-test-key-not-real";
const NOW = new Date("2026-11-28T10:00:00.000Z");

const prices: PriceTable = {
  Version: "2026-11-28",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.25,
  ExchangeRateDate: "2026-11-09",
  Models: {},
  Search: { "tavily/search-basic": { UsdPerCall: 0.008 } },
};

const run: SearchRun = {
  RunKind: "pipeline",
  RunId: "prun_1",
  Agent: "competition",
  PublicationId: "pub_1",
  CandidateId: "cand_1",
};

type Call = { url: string; init: RequestInit };

function tavilyBody(count: number): string {
  return JSON.stringify({
    query: "q",
    answer: null,
    results: Array.from({ length: count }, (_, i) => ({
      title: `Vendor ${i + 1}`,
      url: `https://vendor${i + 1}.example/product`,
      content: `Vendor ${i + 1} sells a scheduling tool.`,
      score: 0.9,
      raw_content: null,
    })),
    response_time: 0.5,
  });
}

function stubFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { fn, calls };
}

function usageStore(allow = true) {
  const records: ModelCallRecord[] = [];
  const store: ModelUsageStore = {
    budgetAllows: async () => allow,
    record: async (record) => {
      records.push(ModelCallRecordSchema.parse(record));
    },
  };
  return { store, records };
}

function deps(fetchFn: typeof fetch, usage: ModelUsageStore, over: Partial<SearchToolDeps> = {}) {
  let id = 0;
  return {
    Fetch: fetchFn,
    ApiKey: KEY,
    Usage: usage,
    Prices: prices,
    Config: DEFAULT_SEARCH_CONFIG,
    NewId: () => `mc_${++id}`,
    Now: () => NOW,
    ...over,
  } satisfies SearchToolDeps;
}

describe("REQ-AGENT-013: the Tavily search call", () => {
  it("REQ-AGENT-013: AC1 posts one basic search to Tavily with the key in the header only", async () => {
    const { fn, calls } = stubFetch(() => new Response(tavilyBody(2)));
    await tavilySearch(
      fn,
      KEY,
      { Query: "meeting tools", MaxResults: 5, Depth: "basic", TimeoutMs: 1000 },
      () => NOW,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(TAVILY_SEARCH_URL);
    expect(calls[0]?.init.method).toBe("POST");
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body).toEqual({
      query: "meeting tools",
      max_results: 5,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    });
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("REQ-AGENT-013: AC1 maps results to title, https URL, snippet, and retrieval time, within the I/O limits", async () => {
    const long = "x".repeat(800);
    const { fn } = stubFetch(
      () =>
        new Response(
          JSON.stringify({
            results: [
              { title: " Kept ", url: "https://kept.example/a", content: long },
              { title: "Plain http", url: "http://insecure.example", content: "dropped" },
              { title: "Not a URL", url: "javascript:alert(1)", content: "dropped" },
              { title: null, url: "https://second.example", content: null },
              { title: "Over the max", url: "https://third.example", content: "cut" },
            ],
          }),
        ),
    );
    const out = await tavilySearch(
      fn,
      KEY,
      { Query: "q q q", MaxResults: 2, Depth: "basic", TimeoutMs: 1000 },
      () => NOW,
    );
    expect(out.Results).toEqual([
      {
        Title: "Kept",
        Url: "https://kept.example/a",
        Snippet: "x".repeat(500),
        RetrievedAt: NOW.toISOString(),
      },
      { Title: "", Url: "https://second.example", Snippet: "", RetrievedAt: NOW.toISOString() },
    ]);
  });

  it("REQ-AGENT-013: AC2 a non-2xx status, a malformed body, or an oversized body is a provider error", async () => {
    const request = { Query: "q q q", MaxResults: 5, Depth: "basic" as const, TimeoutMs: 1000 };
    const cases: Array<[() => Response, string]> = [
      [() => new Response("{}", { status: 500 }), "http"],
      [() => new Response("not json"), "malformed"],
      [() => new Response(JSON.stringify({ results: "nope" })), "malformed"],
      [() => new Response("x".repeat(MAX_RESPONSE_BYTES + 1)), "too-large"],
    ];
    for (const [respond, failure] of cases) {
      const error = await tavilySearch(stubFetch(respond).fn, KEY, request, () => NOW).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(SearchProviderError);
      expect((error as SearchProviderError).Failure).toBe(failure);
      expect((error as Error).message).not.toContain(KEY);
    }
  });

  it("REQ-AGENT-013: AC2 a call past its timeout is a timeout error", async () => {
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as typeof fetch;
    const error = await tavilySearch(
      hanging,
      KEY,
      { Query: "q q q", MaxResults: 5, Depth: "basic", TimeoutMs: 5 },
      () => NOW,
    ).catch((e: unknown) => e);
    expect((error as SearchProviderError).Failure).toBe("timeout");
  });
});

describe("REQ-AGENT-013: the search tool of an agent run", () => {
  it("REQ-AGENT-013: AC1 only Market Analysis and Competition have the tool", () => {
    const { store } = usageStore();
    const fetchFn = stubFetch(() => new Response(tavilyBody(1))).fn;
    for (const agent of ["market_analysis", "competition"] as const) {
      expect(() => createSearchTool(deps(fetchFn, store), { ...run, Agent: agent })).not.toThrow();
    }
    for (const agent of ["research_analyst", "startup_generator", "relevance", "extraction"]) {
      expect(() =>
        createSearchTool(deps(fetchFn, store), { ...run, Agent: agent as "competition" }),
      ).toThrow(/has no search tool/u);
    }
  });

  it("REQ-NFR-011: AC2 a search without a price in the table is refused before any call", () => {
    const { store } = usageStore();
    const { fn, calls } = stubFetch(() => new Response(tavilyBody(1)));
    expect(() =>
      createSearchTool(deps(fn, store, { Prices: { ...prices, Search: undefined } }), run),
    ).toThrow(/no price/u);
    expect(calls).toHaveLength(0);
  });

  it("REQ-AGENT-013: AC2 records each call as a search usage record with its cost and result count, never the key", async () => {
    const { store, records } = usageStore();
    const tool = createSearchTool(
      deps(stubFetch(() => new Response(tavilyBody(3))).fn, store),
      run,
    );
    const out = await tool.search("  scheduling software vendors ");
    expect(out).toMatchObject({ Ok: true });
    expect(out.Ok && out.Results).toHaveLength(3);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      Id: "mc_1",
      RunKind: "pipeline",
      RunId: "prun_1",
      StepName: "competition",
      Agent: "competition",
      PublicationId: "pub_1",
      CandidateId: "cand_1",
      Model: searchModelName(DEFAULT_SEARCH_CONFIG),
      Attempt: 1,
      CallKind: "search",
      SearchQuery: "scheduling software vendors",
      SearchResultCount: 3,
      Outcome: "ok",
      Cost: { Amount: 0.0064, Currency: "EUR" },
      PriceTableVersion: "2026-11-28",
      Estimated: true,
      InputTokens: 0,
      OutputTokens: 0,
    });
    expect(JSON.stringify(records)).not.toContain(KEY);
  });

  it("REQ-AGENT-013: AC2 stops at the configured number of calls per run, without calling the provider", async () => {
    const { store, records } = usageStore();
    const { fn, calls } = stubFetch(() => new Response(tavilyBody(1)));
    const tool = createSearchTool(
      deps(fn, store, { Config: { ...DEFAULT_SEARCH_CONFIG, MaxCallsPerRun: 2 } }),
      run,
    );
    expect((await tool.search("first query")).Ok).toBe(true);
    expect((await tool.search("second query")).Ok).toBe(true);
    expect(await tool.search("third query")).toEqual({ Ok: false, Reason: "limit-reached" });
    expect(calls).toHaveLength(2);
    expect(records).toHaveLength(2);
    expect(tool.callsMade).toBe(2);
  });

  it("REQ-NFR-005: AC2 a spent daily budget refuses the search without calling or recording", async () => {
    const { store, records } = usageStore(false);
    const { fn, calls } = stubFetch(() => new Response(tavilyBody(1)));
    const tool = createSearchTool(deps(fn, store), run);
    expect(await tool.search("any query")).toEqual({ Ok: false, Reason: "budget-exhausted" });
    expect(calls).toHaveLength(0);
    expect(records).toHaveLength(0);
  });

  it("REQ-AGENT-013: AC2 a provider error is recorded at no cost and counts toward the limit", async () => {
    const { store, records } = usageStore();
    const tool = createSearchTool(
      deps(stubFetch(() => new Response("{}", { status: 429 })).fn, store),
      run,
    );
    expect(await tool.search("any query")).toEqual({ Ok: false, Reason: "provider-error" });
    expect(records[0]).toMatchObject({
      Outcome: "provider-error",
      SearchResultCount: 0,
      Cost: { Amount: 0, Currency: "EUR" },
    });
    expect(tool.callsMade).toBe(1);
  });

  it("REQ-AGENT-013: AC2 a query outside 3 to 300 characters is refused without a call", async () => {
    const { store, records } = usageStore();
    const { fn, calls } = stubFetch(() => new Response(tavilyBody(1)));
    const tool = createSearchTool(deps(fn, store), run);
    expect(await tool.search(" a ")).toEqual({ Ok: false, Reason: "invalid-query" });
    expect(await tool.search("x".repeat(301))).toEqual({ Ok: false, Reason: "invalid-query" });
    expect(calls).toHaveLength(0);
    expect(records).toHaveLength(0);
    expect(tool.callsMade).toBe(0);
  });

  it("REQ-AGENT-013: AC5 the tests reach no live search provider (REQ-TEST-003)", async () => {
    const error = await tavilySearch(
      fetch,
      KEY,
      { Query: "q q q", MaxResults: 1, Depth: "basic", TimeoutMs: 1000 },
      () => NOW,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SearchProviderError);
    expect((error as SearchProviderError).Failure).toBe("network");
  });
});
