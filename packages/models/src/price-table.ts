import { z } from "zod";

import { IsoDateSchema } from "./common.js";
import { type Money } from "./money.js";

/**
 * A versioned price table (REQ-NFR-011 AC2, `model.price_table_version`). It is used when the
 * gateway returns no cost; the record is then marked estimated and names the version.
 * List prices are US dollars per million tokens; costs are recorded in euro, the currency of
 * the daily budget, at the table's exchange rate.
 *
 * A model with prompt caching also has a cached-input price (ADR 0078). Cached tokens are part
 * of the input tokens, as Workers AI reports them (`usage.prompt_tokens_details.cached_tokens`
 * within `prompt_tokens`), and are billed at the cached price instead of the input price.
 */
const PricePerMillion = z.number().nonnegative().finite();

export const ModelPriceSchema = z
  .object({
    InputUsdPerMillionTokens: PricePerMillion,
    /** Price of cached input tokens; absent when the model lists none (ADR 0078). */
    CachedInputUsdPerMillionTokens: PricePerMillion.optional(),
    OutputUsdPerMillionTokens: PricePerMillion,
  })
  .strict()
  .refine(
    (price) =>
      price.CachedInputUsdPerMillionTokens === undefined ||
      price.CachedInputUsdPerMillionTokens <= price.InputUsdPerMillionTokens,
    {
      path: ["CachedInputUsdPerMillionTokens"],
      message: "a cached-input price is not above the input price",
    },
  );
export type ModelPrice = z.infer<typeof ModelPriceSchema>;

/** The list price of one search call, for example a Tavily basic search (ADR 0126). */
export const SearchPriceSchema = z
  .object({
    UsdPerCall: z.number().nonnegative().finite(),
  })
  .strict();
export type SearchPrice = z.infer<typeof SearchPriceSchema>;

export const PriceTableSchema = z
  .object({
    Version: IsoDateSchema,
    Source: z.string().url(),
    UsdPerEur: z.number().positive().finite(),
    ExchangeRateDate: IsoDateSchema,
    /** Exact, pinned model IDs (REQ-AGENT-014), for example `@cf/zai-org/glm-4.7-flash`. */
    Models: z.record(z.string().startsWith("@cf/"), ModelPriceSchema),
    /** Where the search prices were read, when the table has any (ADR 0126). */
    SearchSource: z.string().url().optional(),
    /** Search calls by provider and depth, for example `tavily/search-basic` (ADR 0126). */
    Search: z.record(z.string().min(1).max(200), SearchPriceSchema).optional(),
  })
  .strict();
export type PriceTable = z.infer<typeof PriceTableSchema>;

export const BUDGET_CURRENCY = "EUR";

/** The token counts of one call that its cost depends on. */
export type TokenUsage = {
  InputTokens: number;
  OutputTokens: number;
  /** Input tokens served from the provider's prompt cache; part of `InputTokens`. */
  CachedInputTokens?: number;
};

/**
 * Estimated cost of one call in euro, or null when the model has no price in the table.
 * Uncached input tokens are billed at the input price, cached ones at the cached-input price
 * when the model has one (otherwise at the input price), and output tokens at the output price
 * (ADR 0078). The cached count is capped at the input count.
 */
export function estimateCost(table: PriceTable, model: string, usage: TokenUsage): Money | null {
  const price = table.Models[model];
  if (price === undefined) {
    return null;
  }
  const cached = Math.min(Math.max(usage.CachedInputTokens ?? 0, 0), usage.InputTokens);
  const cachedPrice = price.CachedInputUsdPerMillionTokens ?? price.InputUsdPerMillionTokens;
  const usd =
    ((usage.InputTokens - cached) * price.InputUsdPerMillionTokens +
      cached * cachedPrice +
      usage.OutputTokens * price.OutputUsdPerMillionTokens) /
    1_000_000;
  // Rounded to a millionth of a cent so sums stay stable in the database.
  const eur = Math.round((usd / table.UsdPerEur) * 1e8) / 1e8;
  return { Amount: eur, Currency: BUDGET_CURRENCY };
}

/**
 * Estimated cost of one search call in euro, or null when the table has no price for it
 * (REQ-NFR-011 AC2, ADR 0126). A failed call is billed nothing by the caller.
 */
export function searchCost(table: PriceTable, search: string): Money | null {
  const price = table.Search?.[search];
  if (price === undefined) {
    return null;
  }
  const eur = Math.round((price.UsdPerCall / table.UsdPerEur) * 1e8) / 1e8;
  return { Amount: eur, Currency: BUDGET_CURRENCY };
}
