import { PriceTableSchema, type PriceTable } from "@roi/models";

/**
 * The price table of `model.price_table_version` (REQ-NFR-011 AC2), as the Worker bundles it.
 * The reviewed source is `infrastructure/cloudflare/prices/<version>.json`; a unit test keeps
 * this copy equal to it, so a price change is one reviewed file plus this mirror.
 */
export const PRICE_TABLE: PriceTable = PriceTableSchema.parse({
  Version: "2026-11-11",
  Source: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
  UsdPerEur: 1.1193,
  ExchangeRateDate: "2026-11-09",
  Models: {
    "@cf/zai-org/glm-4.7-flash": {
      InputUsdPerMillionTokens: 0.0605,
      OutputUsdPerMillionTokens: 0.4,
    },
    "@cf/google/gemma-4-26b-a4b-it": {
      InputUsdPerMillionTokens: 0.1,
      CachedInputUsdPerMillionTokens: 0.05,
      OutputUsdPerMillionTokens: 0.3,
    },
    "@cf/deepseek-ai/deepseek-v4.1-flash-1017": {
      InputUsdPerMillionTokens: 0.3,
      CachedInputUsdPerMillionTokens: 0.006,
      OutputUsdPerMillionTokens: 1.2,
    },
    "@cf/zai-org/glm-5.3": {
      InputUsdPerMillionTokens: 1.4,
      CachedInputUsdPerMillionTokens: 0.26,
      OutputUsdPerMillionTokens: 4.4,
    },
    "@cf/openai/gpt-oss-120b": {
      InputUsdPerMillionTokens: 0.35,
      OutputUsdPerMillionTokens: 0.75,
    },
    "@cf/baai/bge-base-en-v1.5": {
      InputUsdPerMillionTokens: 0.0666,
      OutputUsdPerMillionTokens: 0,
    },
  },
});
