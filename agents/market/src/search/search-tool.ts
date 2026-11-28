import {
  BUDGET_CURRENCY,
  SearchQuerySchema,
  searchCost,
  type ModelCallRecord,
  type ModelCallRunKind,
  type ModelUsageStore,
  type PriceTable,
  type SearchResult,
} from "@roi/models";

import { SearchProviderError, tavilySearch, type SearchDepth } from "./tavily.js";

/**
 * The search tool of Market Analysis and Competition (REQ-AGENT-013, ADR 0013, ADR 0126).
 * It is bounded per agent run, checks the daily budget before each call, and records each call
 * as a `model_call` row with `CallKind: "search"` (REQ-NFR-005, REQ-NFR-011). Results are
 * untrusted data; prompts carry them through `delimitSearchResults` (REQ-NFR-006).
 */

/** The only agents that have the tool (REQ-AGENT-013 AC1); the Workflow step names. */
export const SEARCH_AGENTS = ["market_analysis", "competition"] as const;
export type SearchAgent = (typeof SEARCH_AGENTS)[number];

/** The `search.*` keys of `docs/kt/architecture/defaults.md`. */
export type SearchConfig = {
  /** `search.provider`; Tavily is the only one (ADR 0126). */
  Provider: "tavily";
  /** `search.depth`: `basic` costs 1 API credit, `advanced` 2. */
  Depth: SearchDepth;
  /** `search.max_results`. */
  MaxResults: number;
  /** `search.max_calls_per_agent_run`. */
  MaxCallsPerRun: number;
  /** `search.timeout_ms`. */
  TimeoutMs: number;
};

export const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  Provider: "tavily",
  Depth: "basic",
  MaxResults: 5,
  MaxCallsPerRun: 5,
  TimeoutMs: 8000,
};

export type SearchToolDeps = {
  Fetch: typeof fetch;
  /** `SEARCH_PROVIDER_API_KEY`; sent only in the request header, never recorded. */
  ApiKey: string;
  Usage: ModelUsageStore;
  Prices: PriceTable;
  Config: SearchConfig;
  NewId: () => string;
  Now: () => Date;
};

/** The agent run the tool belongs to, as the usage record names it. */
export type SearchRun = {
  RunKind: ModelCallRunKind;
  RunId: string;
  /** The Workflow step, `market_analysis` or `competition`. */
  Agent: SearchAgent;
  PublicationId: string | null;
  CandidateId: string | null;
};

export type SearchOutcome =
  | { Ok: true; Results: SearchResult[] }
  | {
      Ok: false;
      Reason: "invalid-query" | "limit-reached" | "budget-exhausted" | "provider-error";
    };

export type SearchTool = {
  search(query: string): Promise<SearchOutcome>;
  /** Calls made so far in this run, failed ones included. */
  readonly callsMade: number;
};

/** The model name of a search call in `model_call` and the price table, e.g. `tavily/search-basic`. */
export function searchModelName(config: SearchConfig): string {
  return `${config.Provider}/search-${config.Depth}`;
}

/**
 * The tool for one agent run. Throws when the agent may not search (REQ-AGENT-013 AC1) or the
 * price table has no price for the configured search, so no call could be costed (REQ-NFR-011).
 */
export function createSearchTool(deps: SearchToolDeps, run: SearchRun): SearchTool {
  if (!(SEARCH_AGENTS as readonly string[]).includes(run.Agent)) {
    throw new Error(`agent ${String(run.Agent)} has no search tool (REQ-AGENT-013 AC1)`);
  }
  const model = searchModelName(deps.Config);
  const price = searchCost(deps.Prices, model);
  if (price === null) {
    throw new Error(`search ${model} has no price in table ${deps.Prices.Version}; add it first`);
  }
  let calls = 0;

  async function record(
    query: string,
    outcome: ModelCallRecord["Outcome"],
    resultCount: number,
    latencyMs: number,
  ): Promise<void> {
    await deps.Usage.record({
      Id: deps.NewId(),
      RunKind: run.RunKind,
      RunId: run.RunId,
      StepName: run.Agent,
      Agent: run.Agent,
      PublicationId: run.PublicationId,
      CandidateId: run.CandidateId,
      Model: model,
      PromptVersion: null,
      Attempt: calls,
      InputTokens: 0,
      CachedInputTokens: 0,
      OutputTokens: 0,
      LatencyMs: Math.max(0, Math.round(latencyMs)),
      // A failed call is billed nothing; Tavily charges successful requests only.
      Cost: outcome === "ok" ? price! : { Amount: 0, Currency: BUDGET_CURRENCY },
      PriceTableVersion: deps.Prices.Version,
      Estimated: true,
      Outcome: outcome,
      GatewayRequestId: null,
      CallKind: "search",
      SearchQuery: query,
      SearchResultCount: resultCount,
      CreatedAt: deps.Now().toISOString(),
    });
  }

  return {
    get callsMade() {
      return calls;
    },
    async search(raw: string): Promise<SearchOutcome> {
      const parsed = SearchQuerySchema.safeParse(raw);
      if (!parsed.success) {
        return { Ok: false, Reason: "invalid-query" };
      }
      const query = parsed.data;
      if (calls >= deps.Config.MaxCallsPerRun) {
        return { Ok: false, Reason: "limit-reached" };
      }
      if (!(await deps.Usage.budgetAllows(deps.Now().toISOString().slice(0, 10)))) {
        return { Ok: false, Reason: "budget-exhausted" };
      }
      calls += 1;
      const started = deps.Now().getTime();
      try {
        const response = await tavilySearch(
          deps.Fetch,
          deps.ApiKey,
          {
            Query: query,
            MaxResults: deps.Config.MaxResults,
            Depth: deps.Config.Depth,
            TimeoutMs: deps.Config.TimeoutMs,
          },
          deps.Now,
        );
        await record(query, "ok", response.Results.length, deps.Now().getTime() - started);
        return { Ok: true, Results: response.Results };
      } catch (error) {
        if (!(error instanceof SearchProviderError)) {
          throw error;
        }
        await record(query, "provider-error", 0, deps.Now().getTime() - started);
        return { Ok: false, Reason: "provider-error" };
      }
    },
  };
}
