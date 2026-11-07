import { z } from "zod";

import { IsoDateSchema } from "./common.js";
import { type Money } from "./money.js";

/**
 * A versioned price table (REQ-NFR-011 AC2, `model.price_table_version`). It is used when the
 * gateway returns no cost; the record is then marked estimated and names the version.
 * List prices are US dollars per million tokens; costs are recorded in euro, the currency of
 * the daily budget, at the table's exchange rate.
 */
const PricePerMillion = z.number().nonnegative().finite();

export const ModelPriceSchema = z
  .object({
    InputUsdPerMillionTokens: PricePerMillion,
    OutputUsdPerMillionTokens: PricePerMillion,
  })
  .strict();
export type ModelPrice = z.infer<typeof ModelPriceSchema>;

export const PriceTableSchema = z
  .object({
    Version: IsoDateSchema,
    Source: z.string().url(),
    UsdPerEur: z.number().positive().finite(),
    ExchangeRateDate: IsoDateSchema,
    /** Exact, pinned model IDs (REQ-AGENT-014), for example `@cf/zai-org/glm-4.7-flash`. */
    Models: z.record(z.string().startsWith("@cf/"), ModelPriceSchema),
  })
  .strict();
export type PriceTable = z.infer<typeof PriceTableSchema>;

export const BUDGET_CURRENCY = "EUR";

/** Estimated cost of one call in euro, or null when the model has no price in the table. */
export function estimateCost(
  table: PriceTable,
  model: string,
  inputTokens: number,
  outputTokens: number,
): Money | null {
  const price = table.Models[model];
  if (price === undefined) {
    return null;
  }
  const usd =
    (inputTokens * price.InputUsdPerMillionTokens +
      outputTokens * price.OutputUsdPerMillionTokens) /
    1_000_000;
  // Rounded to a millionth of a cent so sums stay stable in the database.
  const eur = Math.round((usd / table.UsdPerEur) * 1e8) / 1e8;
  return { Amount: eur, Currency: BUDGET_CURRENCY };
}
